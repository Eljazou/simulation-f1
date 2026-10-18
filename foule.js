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
    const ctx = typeof drawingContext === 'undefined' ? null : drawingContext;
    return ctx && typeof ctx === 'object' && typeof ctx.bezierCurveTo === 'function' ? ctx : null;
  }

  // Un disque de diamètre d centré en (cx, cy), tracé exactement comme circle() de p5 1.7
  // (Renderer2D.ellipse : quatre courbes de Bézier, constante 0,5522847498), puis rempli.
  static disque(ctx, cx, cy, d) {
    const x = cx - d / 2;
    const y = cy - d / 2;
    const k = d / 2 * 0.5522847498;
    const xe = x + d;
    const ye = y + d;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.bezierCurveTo(x, cy - k, cx - k, y, cx, y);
    ctx.bezierCurveTo(cx + k, y, xe, cy - k, xe, cy);
    ctx.bezierCurveTo(xe, cy + k, cx + k, ye, cx, ye);
    ctx.bezierCurveTo(cx - k, ye, x, cy + k, x, cy);
    ctx.fill();
  }

  // La foule, sur les gradins : chacun saute (plus haut quand la tribune s'enthousiasme), la vague
  // parcourt les gradins, quelques drapeaux s'agitent. Les 800 disques sont tracés directement sur
  // le contexte 2D (même tracé, même couleur, même ordre que circle() et fill() de p5, sans créer
  // une couleur p5 par spectateur à chaque image) ; les drapeaux restent dessinés par p5.
  show() {
    // couleurs de la palette courante du décor (jour, nuit, pluie)
    const couleurs = this.decor.couleursFoule ?? DecorCircuit.COULEURS_FOULE;
    const ctx = Foule.contexte();
    if (this.styles?.couleurs !== couleurs) this.styles = { couleurs, css: couleurs.map(([r, v, b]) => `rgb(${r}, ${v}, ${b})`) };
    const xy = this.positions();
    push();
    noStroke();
    let style = null;
    let n0 = 0;
    this.decor.tribunes.forEach((tribune, k) => {
      const e = this.excitations[k];
      tribune.foule.forEach(([u, , couleur], n) => {
        const x = xy[2 * (n0 + n)];
        const y = xy[2 * (n0 + n) + 1];
        const vague = Math.max(0, Math.sin(this.horloge * 5 - u * 9));
        const saut = (0.3 + 1.6 * e) * (0.5 + 0.5 * Math.sin(this.horloge * (9 + (n % 5)) + n)) + 1.2 * e * vague;
        const diametre = 2.6 + 0.6 * e * vague;
        if (ctx !== null) {
          if (style !== couleur) {
            ctx.fillStyle = this.styles.css[couleur];
            style = couleur;
          }
          Foule.disque(ctx, x, y - saut, diametre);
        } else {
          fill(...couleurs[couleur]);
          circle(x, y - saut, diametre);
        }
        if (n % 23 === 0 && e > 0.2) {
          const drapeau = Foule.COULEURS_DRAPEAUX[n % Foule.COULEURS_DRAPEAUX.length];
          fill(...drapeau);
          const agite = Math.sin(this.horloge * 14 + n) * 2;
          triangle(x, y - saut - 2, x + 6, y - saut - 4 + agite, x, y - saut - 6);
          // fill() de p5 a changé la couleur du contexte
          style = null;
        }
      });
      n0 += tribune.foule.length;
    });
    pop();
  }
}
