// Safety car : une voiture de sécurité. Elle étend VoitureF1 (donc Vehicle) pour réutiliser sa
// conduite, sans la recopier : suivi de la voie des stands, arrive dans sa place de parking,
// évitement, garderSurPiste. Ce qui change : sa vitesse (réduite, sans usure ni profil de
// course), son cycle de vie et son dessin.
//
// Cycle : garée au bout de la voie des stands (phase GARAGE) -> deployer() : elle sort par la
// voie (SORTIE) -> en piste (état DRAPEAU) : seek sur la ligne de course à vitesse réduite, les
// voitures se rangent derrière elle -> rappeler() : elle rentre au prochain passage devant la voie
// des stands (ENTREE) et se gare. Course relance la course quand elle entre dans la voie.
class SafetyCar extends VoitureF1 {
  // Vitesse en piste (valeur de départ de parametres.vitesseSafetyCar).
  static VITESSE = 2.4;
  static COULEURS = [[205, 210, 218], [30, 30, 34], [255, 150, 0]];

  constructor(circuit, parametres) {
    const parking = circuit.stands.parking;
    super(parking.x, parking.y, {
      circuit, parametres, numero: 0, ecurie: { nom: 'Direction de course', couleurs: SafetyCar.COULEURS },
      pilote: { nom: 'Safety car', code: 'SC' }, place: parking, box: parking, alea: () => 0.5,
    });
    // elle naît garée : dans la voie des stands, à sa place
    this.passerA(VoitureF1.ETATS.STAND);
    this.phaseStand = VoitureF1.PHASES_STAND.GARAGE;
    this.indiceVoie = parking.indiceVoie;
    this.capRepos = Math.atan2(circuit.stands.tangentes[parking.indiceVoie].y, circuit.stands.tangentes[parking.indiceVoie].x);
    // temps écoulé (secondes) : fait clignoter la rampe lumineuse
    this.horloge = 0;
    // la safety car roule doucement : pas de glisse réaliste
    this.sansGlisse = true;
  }

  // En piste : elle mène la file.
  get enPiste() {
    return this.etat === VoitureF1.ETATS.DRAPEAU;
  }

  // Garée à sa place.
  get garee() {
    return this.phaseStand === VoitureF1.PHASES_STAND.GARAGE && this.estArreteeAuBox();
  }

  // Elle quitte sa place et sort par la voie des stands, puis roule en tête de la file.
  deployer() {
    if (this.phaseStand !== VoitureF1.PHASES_STAND.GARAGE) return false;
    this.demandeStand = false;
    this.phaseStand = VoitureF1.PHASES_STAND.SORTIE;
    this.etatApresStand = VoitureF1.ETATS.DRAPEAU;
    return true;
  }

  // Fin de la neutralisation : elle rentrera au prochain passage devant la voie des stands.
  rappeler() {
    if (this.enPiste) this.demanderStand();
  }

  decide() {
    super.decide();
    // la safety car ne fait pas d'arrêt au stand : arrivée à sa place, elle s'y gare
    if (this.phaseStand === VoitureF1.PHASES_STAND.ARRET) this.phaseStand = VoitureF1.PHASES_STAND.GARAGE;
  }

  // Vitesse réduite en piste, limiteur dans la voie des stands. (Ce sont des paramètres.)
  moduler() {
    this.maxForce = this.parametres.forceMax;
    this.drs = false;
    this.maxSpeed = this.auStand ? VoitureF1.VITESSE_STANDS : this.parametres.vitesseSafetyCar;
  }

  update(dt = 0) {
    this.horloge += dt;
    super.update(dt);
    // pas d'usure de pneus : elle ne court pas
    this.pneus = 1;
  }

  // Berline vue de dessus, argentée, avec une rampe lumineuse orange qui clignote en piste.
  show({ ombres = true } = {}) {
    const L = VoitureF1.LONGUEUR / 2;
    const l = VoitureF1.LARGEUR / 2 + 1;
    push();
    if (ombres) {
      push();
      translate(this.pos.x + 3, this.pos.y + 4);
      rotate(this.cap);
      noStroke();
      fill(0, 0, 0, 50);
      rect(-L, -l, 2 * L, 2 * l, 4);
      pop();
    }
    translate(this.pos.x, this.pos.y);
    rotate(this.cap);
    noStroke();
    fill(...SafetyCar.COULEURS[0]);
    rect(-L, -l, 2 * L, 2 * l, 4);
    // pare-brise, toit, lunette arrière
    fill(...SafetyCar.COULEURS[1]);
    rect(1, -l + 1.5, 4, 2 * l - 3, 1.5);
    rect(-8, -l + 1.5, 3, 2 * l - 3, 1.5);
    fill(170, 175, 185);
    rect(-5, -l + 1.5, 6, 2 * l - 3, 1);
    // rampe lumineuse : clignote deux fois par seconde quand elle est en piste
    const allumee = this.enPiste && Math.floor(this.horloge * 4) % 2 === 0;
    fill(...(allumee ? SafetyCar.COULEURS[2] : [120, 80, 30]));
    rect(-2.5, -l + 0.5, 2, 2 * l - 1, 0.5);
    if (allumee) {
      fill(255, 170, 0, 70);
      circle(-1.5, 0, 16);
    }
    pop();
  }
}
