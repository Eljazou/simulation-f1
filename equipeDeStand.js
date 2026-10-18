// Équipe de stand d'une écurie : un gestionnaire, qui ne bouge pas (ce n'est pas un Vehicle). Il
// possède les mécaniciens (des Vehicle) et leur dit où aller ; eux s'y rendent par arrive.
//
// Déroulé d'un arrêt :
//   ATTENTE    chacun à sa place, au fond du garage ;
//   PRETE      une voiture de l'écurie arrive dans la voie : chacun gagne son poste autour du
//              box (les « pose » portent un pneu neuf) ;
//   PENALITE   la voiture est arrêtée avec une pénalité de stand : personne ne la touche pendant
//              ce temps (chronomètre visible) ;
//   TRAVAIL    pour chaque roue : le pistolet dévisse, le « retire » emporte le pneu usé, le
//              « pose » met le neuf, le pistolet revisse (DUREE de la roue, tirée) ; sans « pose »
//              dans une petite équipe, le « retire » fait les deux, plus lentement ;
//   LIBERATION les crics redescendent, le « lollipop » se lève : la voiture peut partir ;
//   ATTENTE    retour de chacun à sa place, les pneus usés posés au fond du garage.
// Le temps d'arrêt (de l'immobilisation à la libération) est mesuré et affiché.
class EquipeDeStand {
  static ETATS = { ATTENTE: 'ATTENTE', PRETE: 'PRETE', PENALITE: 'PENALITE', TRAVAIL: 'TRAVAIL', LIBERATION: 'LIBERATION' };
  static ROUES = ['AVG', 'AVD', 'ARG', 'ARD'];
  // Rôles, dans l'ordre où une équipe les pourvoit (les 12 premiers sont indispensables).
  static ROLES = ['pistolet AVG', 'pistolet AVD', 'pistolet ARG', 'pistolet ARD', 'retire AVG', 'retire AVD', 'retire ARG',
    'retire ARD', 'cric avant', 'cric arriere', 'sucette', 'extincteur 1', 'pose AVG', 'pose AVD', 'pose ARG', 'pose ARD',
    'extincteur 2', 'aileron G', 'aileron D', 'assistant'];
  static TAILLE_MIN = 12;
  static TAILLE_MAX = 20;
  // Durées (secondes) : roue (valeur de départ du curseur), surcroît sans « pose », crics et
  // lollipop à la libération.
  static DUREE_ROUE = 1.8;
  static SURCROIT_SANS_POSE = 0.6;
  static DUREE_LIBERATION = 0.4;

  // box = { x, y, indiceVoie } (le point d'arrêt) ; tangente = { x, y } (sens de la voie) ;
  // exterieur = vecteur unitaire vers le garage ; couleurs = celles de l'écurie ; taille = 12 à
  // 20 ; alea = générateur (durées des roues).
  constructor(box, tangente, exterieur, couleurs, taille = 16, alea = Math.random) {
    this.box = box;
    this.t = tangente;
    this.n = exterieur;
    this.alea = alea;
    this.etat = EquipeDeStand.ETATS.ATTENTE;
    this.voiture = null;
    this.temps = 0;
    this.roues = null;
    this.dernierArret = null;
    const n = Math.max(EquipeDeStand.TAILLE_MIN, Math.min(EquipeDeStand.TAILLE_MAX, Math.round(taille)));
    // règle de scène : les mécaniciens naissent à leur place d'attente, une seule fois
    this.mecaniciens = EquipeDeStand.ROLES.slice(0, n).map((role, k) => {
      const p = this.placeAttente(k);
      return new Mecanicien(p.x, p.y, role, couleurs);
    });
    this.mecaniciens.forEach((m, k) => { m.indice = k; });
  }

  // Point du repère de la voiture arrêtée : avance (le long de la voie), cote (vers le garage).
  point(avance, cote) {
    return { x: this.box.x + this.t.x * avance + this.n.x * cote, y: this.box.y + this.t.y * avance + this.n.y * cote };
  }

  // Place d'attente du mécanicien k : au fond du garage, sur deux rangs.
  placeAttente(k) {
    const rang = k % 2;
    const colonne = Math.floor(k / 2) - 4.5;
    return this.point(colonne * 4.2, 22 + rang * 6);
  }

  // Poste de travail d'un rôle autour de la voiture arrêtée (repère : avant +, garage +).
  poste(role) {
    const L = VoitureF1.LONGUEUR / 2;
    const l = VoitureF1.LARGEUR / 2;
    const roue = nom => ({ x: nom.startsWith('AV') ? L - 5 : -L + 5, cote: nom.endsWith('G') ? 1 : -1 });
    const [type, quoi] = role.split(' ');
    if (type === 'pistolet') {
      const r = roue(quoi);
      return this.point(r.x, r.cote * (l + 5));
    }
    if (type === 'retire' || type === 'pose') {
      const r = roue(quoi);
      return this.point(r.x + (type === 'retire' ? 4 : -4) * (r.x > 0 ? 1 : -1), r.cote * (l + 8));
    }
    if (type === 'cric') return this.point(quoi === 'avant' ? L + 7 : -L - 7, 0);
    if (type === 'sucette') return this.point(L + 13, 4);
    if (type === 'extincteur') return this.point(quoi === '1' ? 2 : -6, 14);
    if (type === 'aileron') return this.point(L + 3, (quoi === 'G' ? 1 : -1) * (l + 4));
    return this.point(-L - 12, 8);
  }

  // Où les pneus usés sont posés : au fond du garage, derrière.
  depot() {
    return this.point(-14, 28);
  }

  mecanicien(role) {
    return this.mecaniciens.find(m => m.role === role) ?? null;
  }

  get libre() {
    return this.etat === EquipeDeStand.ETATS.ATTENTE;
  }

  // Une voiture de l'écurie va s'arrêter : chacun à son poste.
  preparer(voiture) {
    if (this.etat !== EquipeDeStand.ETATS.ATTENTE) return false;
    this.voiture = voiture;
    this.etat = EquipeDeStand.ETATS.PRETE;
    this.mecaniciens.forEach(m => {
      const p = this.poste(m.role);
      m.aller(p.x, p.y);
      m.porte = m.role.startsWith('pose') ? 'neuf' : null;
    });
    return true;
  }

  // Une image de l'arrêt. voiture arrêtée dans le box ? (immobile, au bon endroit) ; renvoie true à
  // l'instant où la voiture est libérée.
  decide(arretee, dureeRoue = EquipeDeStand.DUREE_ROUE) {
    const { PRETE, PENALITE, TRAVAIL, LIBERATION } = EquipeDeStand.ETATS;
    const v = this.voiture;
    if (this.etat === PRETE && arretee) {
      this.temps = 0;
      this.debutArret = 0;
      this.etat = v.penaliteStand > 0 ? PENALITE : TRAVAIL;
      if (this.etat === TRAVAIL) this.commencerLesRoues(dureeRoue);
    } else if (this.etat === PENALITE && this.temps >= v.penaliteStand) {
      this.etat = TRAVAIL;
      this.commencerLesRoues(dureeRoue);
    } else if (this.etat === TRAVAIL) {
      this.suivreLesRoues();
      if (this.roues.every(r => r.fini)) {
        this.etat = LIBERATION;
        this.tempsLiberation = 0;
      }
    } else if (this.etat === LIBERATION && this.tempsLiberation >= EquipeDeStand.DUREE_LIBERATION) {
      this.dernierArret = { voiture: v, duree: this.temps, penalite: v.penaliteStand };
      this.rentrer();
      return true;
    }
    return false;
  }

  // Chaque roue : sa durée (tirée), et qui y travaille.
  commencerLesRoues(dureeRoue) {
    this.roues = EquipeDeStand.ROUES.map(nom => {
      const pose = this.mecanicien(`pose ${nom}`);
      const duree = dureeRoue * (0.9 + 0.2 * this.alea()) + (pose === null ? EquipeDeStand.SURCROIT_SANS_POSE : 0);
      return { nom, duree, temps: 0, fini: false, retire: this.mecanicien(`retire ${nom}`), pose };
    });
  }

  // Une roue avance quand son pistolet et son « retire » sont en place ; à mi-chemin, le pneu usé
  // part (porté par le « retire »), le neuf est posé ; à la fin, la roue est revissée.
  suivreLesRoues() {
    this.roues.forEach(r => {
      if (r.fini) return;
      const pistolet = this.mecanicien(`pistolet ${r.nom}`);
      if (!pistolet.enPlace || !r.retire.enPlace) return;
      r.temps += Course.PAS_TEMPS;
      if (r.temps >= r.duree / 2 && r.retire.porte === null && !r.depose) {
        r.retire.porte = 'ancien';
        r.depose = true;
        if (r.pose !== null) r.pose.porte = null;
        const d = this.depot();
        r.retire.aller(d.x, d.y);
      }
      if (r.temps >= r.duree) r.fini = true;
    });
    // le pneu usé posé au fond du garage, le « retire » revient à son poste
    this.roues.forEach(r => {
      if (r.retire.porte === 'ancien' && r.retire.enPlace) {
        r.retire.porte = null;
        const p = this.poste(r.retire.role);
        r.retire.aller(p.x, p.y);
      }
    });
  }

  // Tout le monde retourne à sa place d'attente.
  rentrer() {
    this.etat = EquipeDeStand.ETATS.ATTENTE;
    this.voiture = null;
    this.roues = null;
    this.tempsLiberation = undefined;
    this.mecaniciens.forEach(m => {
      const p = this.placeAttente(m.indice);
      m.aller(p.x, p.y);
      m.porte = null;
    });
  }

  applyBehaviors() {
    this.mecaniciens.forEach(m => m.applyBehaviors());
  }

  update(dt) {
    this.temps += dt;
    if (this.tempsLiberation !== undefined) this.tempsLiberation += dt;
    this.mecaniciens.forEach(m => m.update(dt));
  }

  show() {
    this.mecaniciens.forEach(m => m.show());
    // la sucette : rouge pendant l'arrêt, verte à la libération (un disque au bout du bâton)
    const sucette = this.mecanicien('sucette');
    if (sucette && this.etat !== EquipeDeStand.ETATS.ATTENTE) {
      push();
      noStroke();
      fill(...(this.etat === EquipeDeStand.ETATS.LIBERATION ? [40, 220, 80] : [230, 30, 30]));
      circle(sucette.pos.x + this.t.x * 4, sucette.pos.y + this.t.y * 4, 3);
      pop();
    }
  }

  // Debug : le poste de chaque mécanicien (petit cercle jaune, rouge s'il n'y est pas encore).
  showDebug() {
    push();
    noFill();
    strokeWeight(0.5);
    this.mecaniciens.forEach(m => {
      stroke(m.enPlace ? 'yellow' : 'red');
      circle(m.cible.x, m.cible.y, 3);
    });
    pop();
  }
}
