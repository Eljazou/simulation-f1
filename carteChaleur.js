// Carte de chaleur du scénario « Circuit Formule 1 » : la vitesse moyenne de toutes les voitures en
// chaque point de la piste (bleu : lent, rouge : rapide), et les lieux des dépassements (points
// blancs). Une aide de dessin, pas un Vehicle : elle lit les voitures. Le tracé coloré est
// précalculé dans un p5.Graphics, redessiné toutes les RAFRAICHIR secondes seulement.
class CarteChaleur {
  static RAFRAICHIR = 2;
  static FACTEUR = 0.5;
  static DEPASSEMENTS_MAX = 200;
  // Une voiture plus lente que ça (arrêtée, au stand) ne compte pas dans la moyenne.
  static VITESSE_MIN = 0.3;

  constructor() {
    this.chrono = null;
    this.circuit = null;
    this.sommes = null;
    this.comptes = null;
    this.depassements = [];
    this.vus = new Map();
    this.calque = null;
    this.depuis = Infinity;
  }

  reinitialiser(course) {
    this.chrono = course.chronometrage;
    this.circuit = course.circuit;
    this.sommes = new Float64Array(course.circuit.n);
    this.comptes = new Uint32Array(course.circuit.n);
    this.depassements = [];
    this.vus = new Map(course.voitures.map(v => [v, v.depassements]));
    this.depuis = Infinity;
  }

  // Vitesse moyenne au point i (null : aucune mesure).
  moyenne(i) {
    return this.comptes[i] === 0 ? null : this.sommes[i] / this.comptes[i];
  }

  // Couleur d'une vitesse relative r (0 à 1) : bleu, vert, jaune, rouge.
  static couleur(r) {
    const t = Math.max(0, Math.min(1, r));
    const paliers = [[40, 90, 230], [40, 200, 120], [245, 215, 40], [235, 50, 40]];
    const u = t * (paliers.length - 1);
    const k = Math.min(paliers.length - 2, Math.floor(u));
    const f = u - k;
    return paliers[k].map((c, j) => Math.round(c + (paliers[k + 1][j] - c) * f));
  }

  update(dt, course) {
    if (course.chronometrage !== this.chrono) this.reinitialiser(course);
    this.depuis += dt;
    for (const v of course.voitures) {
      if (v.etat === VoitureF1.ETATS.COURSE && !v.auStand && v.vitesse > CarteChaleur.VITESSE_MIN) {
        this.sommes[v.indicePiste] += v.vitesse;
        this.comptes[v.indicePiste]++;
      }
      // un dépassement de plus : on retient où il a eu lieu
      const avant = this.vus.get(v) ?? 0;
      if (v.depassements > avant && this.depassements.length < CarteChaleur.DEPASSEMENTS_MAX) {
        this.depassements.push({ x: v.pos.x, y: v.pos.y });
      }
      this.vus.set(v, v.depassements);
    }
  }

  // Le tracé coloré (précalculé), puis les dépassements.
  show() {
    if (this.circuit === null) return;
    const c = this.circuit;
    if (this.depuis >= CarteChaleur.RAFRAICHIR) {
      this.depuis = 0;
      this.dessiner();
    }
    push();
    image(this.calque, 0, 0, c.largeurMonde, c.hauteurMonde);
    noStroke();
    this.depassements.forEach(p => {
      fill(255, 255, 255, 200);
      circle(p.x, p.y, 7);
      fill(20, 20, 20, 200);
      circle(p.x, p.y, 3);
    });
    pop();
  }

  dessiner() {
    const c = this.circuit;
    if (this.calque === null || this.calque.circuit !== c) {
      if (this.calque !== null && typeof this.calque.remove === 'function') this.calque.remove();
      this.calque = createGraphics(Math.ceil(c.largeurMonde * CarteChaleur.FACTEUR), Math.ceil(c.hauteurMonde * CarteChaleur.FACTEUR));
      this.calque.pixelDensity(1);
      this.calque.circuit = c;
    }
    const g = this.calque;
    g.clear();
    g.push();
    g.scale(CarteChaleur.FACTEUR);
    const moyennes = Array.from({ length: c.n }, (_, i) => this.moyenne(i));
    const connues = moyennes.filter(m => m !== null);
    if (connues.length > 0) {
      const min = Math.min(...connues);
      const max = Math.max(...connues);
      // une bande sur la piste, en quadrilatères jointifs entre les deux bords (pas de traits
      // épais : leurs bouts carrés feraient des éventails dans les virages)
      const demi = c.largeur * 0.3;
      g.noStroke();
      for (let i = 0; i < c.n; i++) {
        const m = moyennes[i];
        if (m === null) continue;
        const [r, v, b] = CarteChaleur.couleur(max > min ? (m - min) / (max - min) : 0.5);
        g.fill(r, v, b, 150);
        const j = (i + 1) % c.n;
        const [a1, a2, b1, b2] = [c.pointLateral(i, -demi), c.pointLateral(i, demi), c.pointLateral(j, -demi), c.pointLateral(j, demi)];
        g.quad(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y, b1.x, b1.y);
      }
    }
    g.pop();
  }
}
