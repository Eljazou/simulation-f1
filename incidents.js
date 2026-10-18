// Gestion des incidents de course (phase 1) : un gestionnaire, qui ne bouge pas (ce n'est pas un
// Vehicle) et ne calcule aucune force. Il possède les dépanneuses (Commissaire, des Vehicle) et
// tient ce que les voitures perçoivent : zones de danger, secteurs sous drapeau jaune, VSC. Il
// décide des neutralisations et de la relance ; Course l'appelle à chaque pas.
//
//   ZONES DE DANGER  chaque voiture immobilisée près de la piste (accident, panne, gravier,
//                    remorquage) ; les autres la contournent et ralentissent ; drapeau jaune
//                    dans son secteur ;
//   DÉPANNEUSE       envoyée (du poste le plus proche, du bon côté) vers une voiture arrêtée
//                    depuis DELAI_DEPANNEUSE secondes ; elle la remorque jusqu'à son poste ;
//   VSC              voiture de sécurité virtuelle : entrée progressive, même profil réduit pour
//                    tous, sortie progressive quand la piste est dégagée (au moins DUREE_MIN_VSC) ;
//   RELANCE          après la safety car : le leader choisit son moment, puis chaque voiture
//                    relance quand celle de devant l'a fait, après son propre temps de réaction
//                    (accordéon) ;
//   PANNES           tirées au hasard (case « Incidents » et « Pannes ») : partielle ou totale ;
//   MUR              contact d'une voiture de l'IA avec le mur (glisse réaliste) : accident ;
//   ORDRES D'ÉQUIPE  voir ordresEquipe.js.
// Les durées sont en secondes, reçues en paramètre (update(dt)).
class GestionIncidents {
  static PROBA_PANNE = 0.0004;
  static PART_PANNES_PARTIELLES = 0.6;
  static DELAI_DEPANNEUSE = 1;
  static DUREE_MIN_VSC = 8;
  static RELANCE_MIN = 0.6;
  static RELANCE_MAX = 2.4;
  static REACTION_RELANCE = 0.15;
  // Une voiture immobilisée à moins de cette distance du bord de la piste est un danger.
  static PROCHE_PISTE = 45;
  // Postes des commissaires : nombre de positions le long du circuit (deux côtés chacune).
  static POSTES = 4;
  static GRAINE = 7;

  constructor(course) {
    this.course = course;
    const c = course.circuit;
    this.alea = Circuit.generateur(Course.GRAINE + GestionIncidents.GRAINE);
    this.zones = [];
    this.secteursJaunes = new Set();
    this.vsc = null;
    this.relance = null;
    this.ordres = new Map();
    // voiture -> dépanneuse envoyée ; voiture -> secondes passées arrêtée ; déjà traitées
    this.assignations = new Map();
    this.arrets = new Map();
    this.traitees = new Set();
    // règle de scène : les dépanneuses naissent à leurs postes, une seule fois par course. Un
    // poste est placé là où le bas-côté est libre (pas d'autre portion de piste tout près), au
    // plus près de la position régulière voulue.
    this.commissaires = [];
    const libre = Course.decor(c).libre;
    const marge = c.largeur / 2 + Commissaire.DEPORT + 20;
    for (let k = 0; k < GestionIncidents.POSTES; k++) {
      const voulu = Math.round((k + 0.5) * c.n / GestionIncidents.POSTES);
      for (const cote of [1, -1]) {
        for (let essai = 0; essai < c.n / GestionIncidents.POSTES; essai++) {
          const indice = c.indice(voulu + (essai % 2 === 0 ? 1 : -1) * Math.ceil(essai / 2));
          if (cote === c.exterieur && c.dansIntervalle(indice, c.stands.debut, c.stands.fin)) continue;
          if (libre[cote][indice] < marge) continue;
          this.commissaires.push(new Commissaire(c, { indice, cote }));
          break;
        }
      }
    }
  }

  get parametres() {
    return this.course.parametres;
  }

  // Ce que perçoit une voiture : VSC (profil et facteur), zones de danger, secteurs jaunes.
  perception() {
    return {
      vsc: this.vsc === null ? null : { profil: this.vsc.profil, facteur: this.vsc.facteur },
      zonesDanger: this.zones,
      secteursJaunes: this.secteursJaunes,
    };
  }

  // --- Décisions (Course.decide) -----------------------------------------------------------------

  decide() {
    const course = this.course;
    const { COURSE, VSC, RELANCE } = Course.ETATS;
    this.verifierLesMurs();
    this.mettreAJourLesZones();
    this.traiterLesImmobilisees();
    this.commissaires.forEach(commissaire => commissaire.decide());
    if (course.etat === COURSE) {
      this.tirerLesPannes();
      if (this.parametres.ordresEquipe) this.donnerLesOrdres();
    }
    if (course.etat === VSC) this.suivreLeVSC();
    if (course.etat === RELANCE) this.suivreLaRelance();
  }

  // Les zones de danger : les voitures immobilisées (ou qui se rangent en panne) près de la piste.
  mettreAJourLesZones() {
    const c = this.course.circuit;
    const demi = c.largeur / 2;
    this.zones = [];
    if (this.parametres.evitementDanger === false) {
      this.secteursJaunes = new Set();
      return;
    }
    for (const v of this.course.voitures) {
      const danger = (v.immobilisee || (v.seRange() && v.etat !== VoitureF1.ETATS.STAND)) &&
        Math.abs(v.ecartLateral) < demi + GestionIncidents.PROCHE_PISTE;
      if (!danger) continue;
      this.zones.push({ vehicule: v, indice: v.indicePiste, ecart: v.ecartLateral, x: v.pos.x, y: v.pos.y, rayon: v.r,
        secteur: c.secteur(v.indicePiste) });
    }
    this.secteursJaunes = new Set(this.zones.map(zone => zone.secteur));
  }

  // Glisse réaliste : une voiture de l'IA qui touche le mur est accidentée.
  verifierLesMurs() {
    const course = this.course;
    const { DEPART, COURSE, DRAPEAU, ARRIVEE } = VoitureF1.ETATS;
    for (const v of course.voitures) {
      if (course.joueurs.includes(v) || !v.glisseActive || ![DEPART, COURSE, DRAPEAU, ARRIVEE].includes(v.etat)) continue;
      if (v.surface === 'mur') course.provoquerAccident(v.pos.x, v.pos.y, 'contact avec le mur', v);
    }
  }

  // Une voiture vient de s'immobiliser : abandon au chronométrage, drapeau jaune, VSC ou safety
  // car selon le cas ; arrêtée depuis un moment : une dépanneuse.
  traiterLesImmobilisees() {
    const course = this.course;
    const dt = Course.PAS_TEMPS;
    for (const v of course.voitures) {
      // abandon au stand (panne partielle) : seulement le chronométrage
      if (v.etat === VoitureF1.ETATS.ABANDON && !this.traitees.has(v)) {
        this.traitees.add(v);
        course.chronometrage.abandonner(v);
        course.evenement(`#${v.numero} ${v.pilote.code} abandonne`);
      }
      if (!v.immobilisee || v.etat === VoitureF1.ETATS.REMORQUEE) continue;
      if (!this.traitees.has(v)) {
        this.traitees.add(v);
        course.chronometrage.abandonner(v);
        const causes = { BLOQUEE: 'enlisée dans le gravier', PANNE: 'en panne', ACCIDENT: 'accidentée' };
        course.evenement(`Drapeau jaune : #${v.numero} ${v.pilote.code} ${causes[v.etat] ?? 'arrêtée'}`);
        course.radio(v, `${v.pilote.code} : « Je suis arrêté, désolé l'équipe. »`);
        // accident : la safety car est déjà demandée (provoquerAccident) ; sinon, VSC
        if (v.etat !== VoitureF1.ETATS.ACCIDENT && this.parametres.vsc) this.declencherVSC();
      }
      const arret = (this.arrets.get(v) ?? 0) + (v.vitesse < 0.3 ? dt : 0);
      this.arrets.set(v, arret);
      if (arret >= GestionIncidents.DELAI_DEPANNEUSE && !this.assignations.has(v) && this.parametres.depanneuse !== false) {
        const commissaire = this.posteLePlusProche(v);
        if (commissaire !== null && commissaire.envoyer(v)) {
          this.assignations.set(v, commissaire);
          course.evenement(`Dépanneuse envoyée vers la #${v.numero}`);
        }
      }
    }
  }

  // La dépanneuse disponible la plus proche (le long de la piste), du côté de la voiture.
  posteLePlusProche(voiture) {
    const c = this.course.circuit;
    const cote = voiture.ecartLateral >= 0 ? 1 : -1;
    let meilleur = null;
    let distance = Infinity;
    for (const commissaire of this.commissaires) {
      if (!commissaire.disponible || commissaire.poste.cote !== cote) continue;
      const d = Math.min(c.distanceDevant(commissaire.poste.indice, voiture.indicePiste), c.distanceDevant(voiture.indicePiste, commissaire.poste.indice));
      if (d < distance) {
        distance = d;
        meilleur = commissaire;
      }
    }
    return meilleur;
  }

  // Pannes moteur, tirées au hasard (cases « Incidents » et « Pannes »).
  tirerLesPannes() {
    const p = this.parametres;
    if (!p.incidents || !p.pannes) return;
    const proba = (p.probaPanne ?? GestionIncidents.PROBA_PANNE) * Course.PAS_TEMPS;
    for (const v of this.course.voitures) {
      if (v.etat !== VoitureF1.ETATS.COURSE || this.course.joueurs.includes(v)) continue;
      if (this.alea() < proba) this.provoquerPanne(v, this.alea() < GestionIncidents.PART_PANNES_PARTIELLES ? 'partielle' : 'totale');
    }
  }

  // Une panne (tirée, ou bouton du panneau sur la voiture choisie).
  provoquerPanne(voiture, type) {
    if (!voiture.subirPanne(type)) return false;
    this.course.evenement(`#${voiture.numero} ${voiture.pilote.code} : panne moteur ${type}`);
    this.course.radio(voiture, type === 'partielle' ? `${voiture.pilote.code} : « Je perds de la puissance ! » — « Box, box. »`
      : `${voiture.pilote.code} : « Plus rien, le moteur est mort. » — « Range-toi sur le côté. »`);
    return true;
  }

  // Ordres d'équipe : voir ordresEquipe.js.
  donnerLesOrdres() {
    const course = this.course;
    OrdresEquipe.decider(course, this.ordres, course.chrono, this.alea).forEach(({ lent, rapide, refus }) => {
      course.radio(lent, `Ingénieur : « ${lent.pilote.code}, laisse passer ${rapide.pilote.code}. »`);
      if (refus) {
        course.radio(lent, `${lent.pilote.code} : « Négatif. Je garde ma place. »`);
        return;
      }
      lent.laisserPasserCoequipier(rapide, OrdresEquipe.cote(lent));
      course.evenement(`Ordre d'équipe : #${lent.numero} laisse passer #${rapide.numero}`);
    });
  }

  // --- VSC -------------------------------------------------------------------------------------------

  // Profil de vitesse de référence du VSC : celui d'une voiture moyenne, un peu prudente.
  profilVSC() {
    const p = this.parametres;
    return this.course.circuit.profilVitesse(Math.round(p.vitesseMax * 0.9 * 50) / 50,
      Math.round(p.forceMax * VoitureF1.PART_LATERALE * 0.8 * 1000) / 1000, Math.round(p.forceMax * VoitureF1.PART_FREINAGE * 0.8 * 1000) / 1000);
  }

  // Le VSC est déclaré (incident, ou bouton). Pas pendant une safety car, ni à l'arrivée.
  declencherVSC() {
    const course = this.course;
    if (course.etat !== Course.ETATS.COURSE) return false;
    this.vsc = { phase: 'entree', temps: 0, facteur: 1, profil: this.profilVSC() };
    course.passerA(Course.ETATS.VSC);
    course.evenement('VIRTUAL SAFETY CAR');
    return true;
  }

  // Sortie du VSC : la piste est dégagée (plus de zone de danger) depuis la durée minimale.
  suivreLeVSC() {
    const v = this.vsc;
    if (v === null) return;
    if (v.phase === 'actif' && v.temps >= GestionIncidents.DUREE_MIN_VSC && this.zones.length === 0) {
      v.phase = 'sortie';
      v.temps = 0;
      this.course.evenement('Fin du VSC : la course reprend progressivement');
    }
    if (v.phase === 'sortie' && v.temps >= VoitureF1.DUREE_SORTIE_VSC) {
      this.vsc = null;
      this.course.passerA(Course.ETATS.COURSE);
    }
  }

  // Une safety car remplace le VSC.
  annulerVSC() {
    this.vsc = null;
  }

  // --- Relance ---------------------------------------------------------------------------------------

  // La safety car rentre : relance en accordéon. Le leader choisit son moment (tiré).
  demarrerRelance() {
    const course = this.course;
    this.relance = { temps: 0, depart: GestionIncidents.RELANCE_MIN + this.alea() * (GestionIncidents.RELANCE_MAX - GestionIncidents.RELANCE_MIN),
      relancees: new Map() };
    course.passerA(Course.ETATS.RELANCE);
    course.evenement('La safety car rentre : relance !');
  }

  // Dans l'ordre de la file : le leader au moment choisi, puis chacune quand celle de devant est
  // partie, après son temps de réaction. Quand toute la file est relancée : la course reprend.
  suivreLaRelance() {
    const r = this.relance;
    const course = this.course;
    const file = course.classement().filter(v => !v.horsCourse && !v.arrivee);
    let precedente = null;
    for (const v of file) {
      if (r.relancees.has(v)) {
        precedente = v;
        continue;
      }
      const depart = precedente === null ? r.depart : r.relancees.get(precedente) + v.reaction + GestionIncidents.REACTION_RELANCE;
      if (r.temps < depart) break;
      v.relancer();
      r.relancees.set(v, r.temps);
      if (precedente === null) course.evenement(`${v.pilote.code} relance la course`);
      precedente = v;
    }
    if (file.every(v => r.relancees.has(v))) {
      this.relance = null;
      course.passerA(Course.ETATS.COURSE);
    }
  }

  // --- Temps, forces, dessin ----------------------------------------------------------------------------

  applyBehaviors() {
    this.commissaires.forEach(commissaire => commissaire.applyBehaviors());
  }

  update(dt) {
    this.commissaires.forEach(commissaire => commissaire.update(dt));
    if (this.relance !== null) this.relance.temps += dt;
    const v = this.vsc;
    if (v !== null) {
      v.temps += dt;
      const f = this.parametres.facteurVSC ?? VoitureF1.FACTEUR_VSC;
      if (v.phase === 'entree') {
        v.facteur = 1 - (1 - f) * Math.min(1, v.temps / VoitureF1.DUREE_ENTREE_VSC);
        if (v.temps >= VoitureF1.DUREE_ENTREE_VSC) {
          v.phase = 'actif';
          v.temps = 0;
        }
      } else if (v.phase === 'actif') {
        v.facteur = f;
      } else {
        v.facteur = f + (1 - f) * Math.min(1, v.temps / VoitureF1.DUREE_SORTIE_VSC);
      }
    }
  }

  // Dépanneuses, et drapeaux jaunes agités au bord des zones de danger.
  show({ ombres = true } = {}) {
    this.commissaires.forEach(commissaire => commissaire.show({ ombres }));
    const c = this.course.circuit;
    const agite = Math.sin(this.course.chrono * 12) * 3;
    push();
    noStroke();
    this.zones.forEach(zone => {
      const poste = c.pointLateral(zone.indice - 30 / c.pas, (zone.ecart >= 0 ? 1 : -1) * (c.largeur / 2 + 10));
      stroke(60);
      strokeWeight(1);
      line(poste.x, poste.y, poste.x, poste.y - 12);
      noStroke();
      fill(255, 220, 0);
      quad(poste.x, poste.y - 12, poste.x + 9, poste.y - 12 + agite * 0.3, poste.x + 9 + agite * 0.2, poste.y - 6, poste.x, poste.y - 6);
    });
    pop();
  }

  // Debug : zones de danger (rouge), points de contournement (jaune), chemins des dépanneuses.
  showDebug() {
    const c = this.course.circuit;
    push();
    noFill();
    strokeWeight(1);
    this.zones.forEach(zone => {
      stroke('red');
      circle(zone.x, zone.y, (zone.rayon + VoitureF1.MARGE_CONTOURNEMENT) * 2);
      const cote = zone.ecart >= 0 ? -1 : 1;
      const p = c.pointLateral(zone.indice, zone.ecart + cote * (zone.rayon * 2 + VoitureF1.MARGE_CONTOURNEMENT));
      stroke('yellow');
      circle(p.x, p.y, 8);
    });
    pop();
    this.commissaires.forEach(commissaire => commissaire.showDebug());
  }
}
