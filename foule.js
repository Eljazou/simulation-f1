// Foule des tribunes, animée : un EFFET DESSINÉ, pas des Vehicle (personne ne se déplace : chacun
// saute sur place, agite un drapeau). Elle lit les tribunes du décor (positions des spectateurs,
// tirées une fois) et la course : quand le leader passe devant une tribune, ou qu'un dépassement a
// lieu à sa hauteur, la tribune s'enthousiasme (excitation à 1, qui retombe en DUREE_EXCITATION
// secondes) : sauts, vague qui parcourt les gradins, drapeaux agités.
class Foule {
  static DUREE_EXCITATION = 3;
  // Portée (le long de la piste) à laquelle un passage ou un dépassement excite une tribune.
  static PORTEE = 160;
  static COULEURS_DRAPEAUX = [[230, 40, 40], [250, 250, 250], [40, 90, 220], [250, 210, 40]];
  // Diamètre d'un spectateur, et ce qu'il gagne au sommet de la vague (tribune enthousiaste).
  static DIAMETRE = 2.6;
  static GONFLEMENT = 0.6;
  static PLANCHE = null;

  // decor = le DecorCircuit (ses tribunes) ; circuit = le Circuit.
  constructor(decor) {
    this.decor = decor;
    this.circuit = decor.circuit;
    this.horloge = 0;
    this.excitations = decor.tribunes.map(() => 0);
    this.depassementsVus = 0;
  }

  // Le centre (indice de piste) d'une tribune.
  indiceDe(tribune) {
    return this.circuit.indice(tribune.debut + tribune.longueur / 2);
  }

  // Une image : passage du leader, dépassements à hauteur d'une tribune.
  update(dt, course) {
    this.horloge += dt;
    const c = this.circuit;
    const leader = course.leader;
    const depassements = course.voitures.reduce((n, v) => n + v.depassements, 0);
    const nouveaux = depassements > this.depassementsVus;
    this.depassementsVus = depassements;
    this.decor.tribunes.forEach((tribune, k) => {
      const i = this.indiceDe(tribune);
      const pres = v => Math.min(c.distanceDevant(v.indicePiste, i), c.distanceDevant(i, v.indicePiste)) < Foule.PORTEE;
      const leaderPasse = leader !== null && leader.etat === VoitureF1.ETATS.COURSE && pres(leader);
      const depassementIci = nouveaux && course.voitures.some(v => v.etat === VoitureF1.ETATS.COURSE && pres(v) && v.depassements > 0);
      if (leaderPasse || depassementIci) this.excitations[k] = 1;
      else this.excitations[k] = Math.max(0, this.excitations[k] - dt / Foule.DUREE_EXCITATION);
    });
  }

  // Les positions de base des spectateurs (sur les gradins, avant le saut) : fixes, calculées une
  // fois par décor. [x0, y0, x1, y1, ...] dans l'ordre des tribunes et de leur foule.
  positions() {
    if (this.base && this.base.tribunes === this.decor.tribunes) return this.base.xy;
    const c = this.circuit;
    const demi = c.largeur / 2;
    const xy = [];
    this.decor.tribunes.forEach(tribune => {
      tribune.foule.forEach(([u, v]) => {
        const p = c.pointLateral(tribune.debut + u * tribune.longueur, tribune.cote * (demi + DecorCircuit.distanceSpectateur(v)));
        xy.push(p.x, p.y);
      });
    });
    this.base = { tribunes: this.decor.tribunes, xy };
    return xy;
  }

  // Le contexte 2D du canvas, s'il est réel (sinon, dans les tests, le dessin passe par p5).
  static contexte() {
    return PlancheSprites.contexte();
  }

  // Les disques de la foule, un par couleur, tracés une fois (planche de sprites) : la boîte du
  // plus gros disque (DIAMETRE + GONFLEMENT).
  static planche() {
    const r = (Foule.DIAMETRE + Foule.GONFLEMENT) / 2;
    Foule.PLANCHE ??= new PlancheSprites([-r, -r, r, r]);
    return Foule.PLANCHE;
  }

  // La foule, sur les gradins : chacun saute (plus haut quand la tribune s'enthousiasme), la vague
  // parcourt les gradins, quelques drapeaux s'agitent. Les 800 disques sont des copies d'un disque
  // tracé une fois par couleur (planche de sprites, même ordre, mêmes centres et diamètres que
  // circle() de p5) : une seule texture, que le GPU recopie en un lot, au lieu de 800 tracés
  // remplis. Sans vrai contexte (tests) : circle() et fill() de p5. Les drapeaux restent dessinés
  // par p5.
  show() {
    // couleurs de la palette courante du décor (jour, nuit, pluie)
    const couleurs = this.decor.couleursFoule ?? DecorCircuit.COULEURS_FOULE;
    const ctx = Foule.contexte();
    const max = Foule.DIAMETRE + Foule.GONFLEMENT;
    if (this.styles?.couleurs !== couleurs) {
      this.styles = { couleurs, css: couleurs.map(([r, v, b]) => `rgb(${r}, ${v}, ${b})`),
        traceurs: couleurs.map(couleur => g => { g.fill(...couleur); g.circle(0, 0, max); }) };
    }
    const { css, traceurs } = this.styles;
    const xy = this.positions();
    const planche = Foule.planche();
    const resolution = ctx === null ? 1 : planche.resolution(1, ctx);
    push();
    noStroke();
    let n0 = 0;
    this.decor.tribunes.forEach((tribune, k) => {
      const e = this.excitations[k];
      tribune.foule.forEach(([u, , couleur], n) => {
        const x = xy[2 * (n0 + n)];
        const y = xy[2 * (n0 + n) + 1];
        const vague = Math.max(0, Math.sin(this.horloge * 5 - u * 9));
        const saut = (0.3 + 1.6 * e) * (0.5 + 0.5 * Math.sin(this.horloge * (9 + (n % 5)) + n)) + 1.2 * e * vague;
        const diametre = Foule.DIAMETRE + Foule.GONFLEMENT * e * vague;
        if (ctx === null || !planche.copier(css[couleur], traceurs[couleur], x, y - saut, diametre / max, resolution, ctx)) {
          fill(...couleurs[couleur]);
          circle(x, y - saut, diametre);
        }
        if (n % 23 === 0 && e > 0.2) {
          const drapeau = Foule.COULEURS_DRAPEAUX[n % Foule.COULEURS_DRAPEAUX.length];
          fill(...drapeau);
          const agite = Math.sin(this.horloge * 14 + n) * 2;
          triangle(x, y - saut - 2, x + 6, y - saut - 4 + agite, x, y - saut - 6);
        }
      });
      n0 += tribune.foule.length;
    });
    pop();
  }
}
