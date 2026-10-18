// Voie des stands « spectaculaire » (case du panneau) : un gestionnaire, qui ne bouge pas (ce n'est
// pas un Vehicle) et ne calcule aucune force. Il tient :
//   - une équipe de stand par écurie (EquipeDeStand, qui possède ses Mecanicien) et le box
//     partagé par les voitures de l'écurie ;
//   - la FILE D'ATTENTE : une voiture dont le box est occupé par sa coéquipière attend derrière
//     (arrive, avec une distance à garder : arrêt « empilé ») ;
//   - le LIMITEUR : une ligne blanche à l'entrée ; la franchir trop vite = pénalité de stand ;
//   - le FEU DE SORTIE : rouge quand une voiture arrive sur la piste à la hauteur de la sortie,
//     vert sinon ; la voiture attend sur la ligne (arrive) ;
//   - les PÉNALITÉS DE STAND (5 ou 10 s, purgées au prochain arrêt, sans intervention des
//     mécaniciens) et les TEMPS D'ARRÊT (affichés, « 2.4 s »).
// Les voitures lisent leurs ordres (attenteBox, feuSortie, arretAutorise) : elles seules
// appliquent des forces.
class VoieDesStands {
  static TAILLE_EQUIPE = 16;
  // Excès de vitesse toléré à la ligne du limiteur (part de la limite), pénalité de stand (s).
  static TOLERANCE_LIMITEUR = 1.1;
  static PENALITE_LIMITEUR = 5;
  // Feu de sortie : rouge si une voiture en piste est à moins de cette distance avant la sortie.
  static FENETRE_FEU = 220;
  // File : la première voiture attend RECUL_FILE pixels derrière le box (les suivantes, une
  // longueur et une marge de plus chacune), à DECALAGE_FILE pixels de la voie rapide, vers les box.
  static ATTENTE = VoitureF1.LONGUEUR + 4;
  static RECUL_FILE = 22;
  static DECALAGE_FILE = 19;
  // Durée d'affichage d'un temps d'arrêt (secondes).
  static DUREE_AFFICHAGE = 5;

  constructor(course) {
    this.course = course;
    const c = course.circuit;
    const s = c.stands;
    this.feu = 'vert';
    this.affichages = [];
    // une équipe par box utilisé (box partagé par écurie), créée une seule fois par course
    this.equipes = new Map();
    course.voitures.forEach(v => {
      if (this.equipes.has(v.box)) return;
      const k = Math.min(s.points.length - 2, v.box.indiceVoie);
      const t = s.tangentes[k];
      const exterieur = { x: (v.box.x - s.points[k].x), y: (v.box.y - s.points[k].y) };
      const l = Math.hypot(exterieur.x, exterieur.y) || 1;
      const alea = Circuit.generateur(Course.GRAINE + 31 + this.equipes.size);
      this.equipes.set(v.box, new EquipeDeStand(v.box, t, { x: exterieur.x / l, y: exterieur.y / l }, v.ecurie.couleurs,
        course.parametres.tailleEquipe ?? VoieDesStands.TAILLE_EQUIPE, alea));
    });
    course.voitures.forEach(v => { v.gereParEquipe = true; });
  }

  get parametres() {
    return this.course.parametres;
  }

  equipeDe(voiture) {
    return this.equipes.get(voiture.box) ?? null;
  }

  // Place d'attente du rang `rang` de la file d'un box : dans la voie de travail, derrière le box.
  static pointAttente(circuit, box, rang) {
    const s = circuit.stands;
    const k = Math.max(0, box.indiceVoie - Math.round((VoieDesStands.RECUL_FILE + VoieDesStands.ATTENTE * rang) / circuit.pas));
    const reference = s.points[box.indiceVoie];
    const n = { x: box.x - reference.x, y: box.y - reference.y };
    const l = Math.hypot(n.x, n.y) || 1;
    return { x: s.points[k].x + n.x / l * VoieDesStands.DECALAGE_FILE, y: s.points[k].y + n.y / l * VoieDesStands.DECALAGE_FILE, indiceVoie: k };
  }

  // --- Décisions (Course.decide) -------------------------------------------------------------------

  decide() {
    const course = this.course;
    const { ENTREE, ARRET, SORTIE } = VoitureF1.PHASES_STAND;
    const s = course.circuit.stands;
    this.feu = this.calculerFeu();
    // rang dans la file de chaque box : la plus avancée dans la voie d'abord
    const files = new Map();
    course.voitures.filter(v => v.auStand && v.phaseStand === ENTREE && v.attenteBox)
      .sort((a, b) => b.indiceVoie - a.indiceVoie)
      .forEach(v => {
        const rang = files.get(v.box) ?? 0;
        v.rangFile = rang;
        files.set(v.box, rang + 1);
      });
    course.voitures.forEach(v => {
      v.feuSortie = this.parametres.feuSortie === false ? 'vert' : this.feu;
      if (!v.auStand) return;
      const equipe = this.equipeDe(v);
      // file d'attente : le box est pris par une coéquipière (arrêtée, ou servie)
      if (v.phaseStand === ENTREE && v.etatApresStand !== VoitureF1.ETATS.ARRIVEE && equipe !== null) {
        // pris : servie par l'équipe, ou une coéquipière pas encore sortie de la place d'arrêt
        const encombre = course.voitures.some(o => o !== v && o.box === v.box && o.auStand && o.phaseStand === SORTIE &&
          Math.hypot(o.pos.x - v.box.x, o.pos.y - v.box.y) < VoitureF1.LONGUEUR + 8);
        const prise = (equipe.voiture !== null && equipe.voiture !== v) || encombre;
        v.attenteBox = prise;
        if (!prise && equipe.libre) equipe.preparer(v);
      } else {
        v.attenteBox = false;
      }
      // limiteur : la ligne blanche franchie trop vite
      if (v.phaseStand === ENTREE && !v.limiteurFranchi && v.indiceVoie >= s.limiteur) {
        v.limiteurFranchi = true;
        if (v.vitesse > VoitureF1.VITESSE_STANDS * VoieDesStands.TOLERANCE_LIMITEUR) {
          this.penaliser(v, VoieDesStands.PENALITE_LIMITEUR, 'excès de vitesse dans la voie des stands');
        }
      }
      if (v.phaseStand === SORTIE) v.limiteurFranchi = false;
      // l'arrêt : l'équipe travaille ; elle libère la voiture
      if (v.phaseStand === ARRET && equipe !== null && equipe.voiture === v) {
        if (equipe.decide(v.estArreteeAuBox(), this.parametres.dureeRoue ?? EquipeDeStand.DUREE_ROUE)) {
          v.arretAutorise = true;
          const a = equipe.dernierArret;
          const texte = `${a.duree.toFixed(1)} s${a.penalite > 0 ? ` (pénalité ${a.penalite} s)` : ''}`;
          this.affichages.push({ x: v.box.x, y: v.box.y, texte, age: 0 });
          course.evenement(`#${v.numero} ${v.pilote.code} : arrêt en ${texte}`);
          course.radio(v, `Ingénieur : « Arrêt en ${a.duree.toFixed(1)} s, go go go ! »`);
          v.dernierArretAuStand = a.duree;
        }
      }
    });
  }

  // Feu de sortie : rouge si une voiture en piste arrive à la hauteur de la sortie de la voie.
  calculerFeu() {
    const c = this.course.circuit;
    const sortie = c.stands.fin;
    const arrive = this.course.voitures.some(v => !v.auStand && !v.horsCourse &&
      c.distanceDevant(v.indicePiste, sortie) < VoieDesStands.FENETRE_FEU && v.vitesse > 0.5);
    return arrive ? 'rouge' : 'vert';
  }

  // Pénalité de stand (5 ou 10 s) : purgée au prochain arrêt, sans intervention de l'équipe.
  penaliser(voiture, secondes, raison = 'pénalité') {
    if (![5, 10].includes(secondes)) throw new RangeError(`Pénalité de stand : 5 ou 10 s, pas ${secondes}.`);
    voiture.penaliteStand = (voiture.penaliteStand ?? 0) + secondes;
    this.course.evenement(`#${voiture.numero} ${voiture.pilote.code} : pénalité de stand ${secondes} s (${raison})`);
    this.course.radio(voiture, `Ingénieur : « Pénalité de ${secondes} secondes, à purger au prochain arrêt. »`);
    if (voiture !== this.course.joueur && !voiture.auStand) voiture.demanderStand();
  }

  // --- Forces, temps, dessin --------------------------------------------------------------------------

  applyBehaviors() {
    this.equipes.forEach(equipe => equipe.applyBehaviors());
  }

  update(dt) {
    this.equipes.forEach(equipe => equipe.update(dt));
    this.affichages.forEach(a => { a.age += dt; });
    this.affichages = this.affichages.filter(a => a.age < VoieDesStands.DUREE_AFFICHAGE);
  }

  // Mécaniciens, ligne blanche du limiteur, feu de sortie, temps d'arrêt et pénalités en cours.
  show() {
    const c = this.course.circuit;
    const s = c.stands;
    this.equipes.forEach(equipe => equipe.show());
    push();
    // ligne blanche du limiteur, en travers de la voie
    const k = Math.min(s.points.length - 1, s.limiteur);
    const t = s.tangentes[k];
    const p = s.points[k];
    stroke(250);
    strokeWeight(1.5);
    line(p.x - t.y * 15, p.y + t.x * 15, p.x + t.y * 15, p.y - t.x * 15);
    // feu de sortie
    const q = s.points[Math.min(s.points.length - 1, s.sortie)];
    noStroke();
    fill(30);
    rect(q.x - 4, q.y - 9, 8, 14, 2);
    fill(...(this.feu === 'rouge' ? [255, 40, 30] : [80, 20, 20]));
    circle(q.x, q.y - 5, 4);
    fill(...(this.feu === 'vert' ? [40, 230, 80] : [20, 60, 30]));
    circle(q.x, q.y + 1, 4);
    // temps d'arrêt affichés au-dessus du box, puis chronomètre des pénalités en cours
    textAlign(CENTER, CENTER);
    textSize(8);
    this.affichages.forEach(a => {
      fill(10, 12, 18, 200);
      rect(a.x - 18, a.y - 26, 36, 11, 3);
      fill(255, 230, 120, 255 * Math.min(1, VoieDesStands.DUREE_AFFICHAGE - a.age));
      text(a.texte, a.x, a.y - 20);
    });
    this.equipes.forEach(equipe => {
      if (equipe.etat !== EquipeDeStand.ETATS.PENALITE) return;
      const reste = Math.max(0, equipe.voiture.penaliteStand - equipe.temps);
      fill(200, 30, 30, 220);
      rect(equipe.box.x - 22, equipe.box.y - 26, 44, 11, 3);
      fill(255);
      text(`PÉNALITÉ ${reste.toFixed(1)}`, equipe.box.x, equipe.box.y - 20);
    });
    pop();
  }

  // Debug : postes des mécaniciens, et point d'attente de la file devant chaque box.
  showDebug() {
    this.equipes.forEach(equipe => {
      equipe.showDebug();
      const attente = VoieDesStands.pointAttente(this.course.circuit, equipe.box, 0);
      push();
      noFill();
      stroke(0, 200, 255);
      circle(attente.x, attente.y, 8);
      pop();
    });
  }
}
