// Caméra du scénario « Circuit Formule 1 ». Ce n'est pas un objet de la scène : elle ne bouge
// rien, c'est un simple décalage (une échelle, une rotation) appliqué au dessin. Modes :
//   'circuit'    tout le circuit tient dans la zone visible (vue fixe, au démarrage) ;
//   'suivi'      elle se centre sur une voiture, plus près, avec un lissage ; le zoom recule un peu
//                avec la vitesse ; en mode jeu (option avance), le centre passe devant la voiture,
//                dans le sens de sa vitesse, pour montrer le virage qui arrive ;
//   'drone'      elle suit le drone (DroneCamera) qui survole le groupe de tête ;
//   'embarquee'  caméra embarquée : centrée un peu devant la voiture, le monde tourne pour que la
//                voiture pointe vers le haut, zoom selon la vitesse, légère secousse ;
//   'tv'         réalisation TV : elle change de plan toutes les DUREE_PLAN secondes (drone,
//                embarquée, vue d'ensemble, suivi), coupe franche entre deux plans.
class Camera {
  static MODES = ['circuit', 'suivi', 'drone', 'embarquee', 'tv'];
  // Grossissements (par rapport à la vue d'ensemble), lissage (par seconde).
  static ZOOM_SUIVI = 2.2;
  static ZOOM_DRONE = 1.7;
  static ZOOM_EMBARQUEE = 3.4;
  static LISSAGE = 4;
  // Réalisation TV : durée d'un plan, et ordre des plans.
  static DUREE_PLAN = 7;
  static PLANS_TV = ['drone', 'embarquee', 'circuit', 'suivi'];
  // Embarquée : la voiture est placée en bas de l'écran (elle regarde la route devant elle).
  static AVANCE_EMBARQUEE = 70;
  // Suivi en mode jeu : le centre passe jusqu'à AVANCE_JEU px (monde) devant la voiture, selon sa
  // vitesse (voir Scenarios.formule1).
  static AVANCE_JEU = 55;
  // Vue d'ensemble cadrée : part de la zone occupée par le circuit, marge au-delà du bord (monde).
  static REMPLISSAGE = 0.88;
  static MARGE_BORD = 20;

  constructor() {
    this.mode = 'circuit';
    // centre visé dans le monde, échelle (pixels d'écran par pixel du monde), rotation (radians)
    this.x = 0;
    this.y = 0;
    this.echelle = 1;
    this.rotation = 0;
    this.zone = { x: 0, y: 0, largeur: 1, hauteur: 1 };
    this.secousse = { x: 0, y: 0 };
    this.pret = false;
    this.plan = { indice: 0, temps: 0 };
    this.ensemble = null;
  }

  // Échelle et centre de la vue d'ensemble : le monde (largeurMonde × hauteurMonde) tient dans
  // la zone d'écran, en gardant ses proportions.
  static vueEnsemble(zone, largeurMonde, hauteurMonde) {
    const echelle = Math.min(zone.largeur / largeurMonde, zone.hauteur / hauteurMonde);
    return { x: largeurMonde / 2, y: hauteurMonde / 2, echelle };
  }

  // Vue d'ensemble « cadrée » (design/ : Palette et fiche technique, Adaptation) : le circuit (piste
  // et voie des stands, bords compris) remplit `remplissage` de la zone, sans passer sous les
  // rectangles `eviter` (mini-carte, HUD, en pixels d'écran). On essaie l'échelle la plus grande,
  // puis on la réduit par pas de 2 %, en décalant le centre dans la marge disponible.
  static cadrerCircuit(zone, circuit, { eviter = [], remplissage = Camera.REMPLISSAGE } = {}) {
    const marge = circuit.largeur / 2 + Camera.MARGE_BORD;
    const points = [...circuit.points, ...circuit.stands.points].filter((_, i) => i % 3 === 0);
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const boite = { x: Math.min(...xs) - marge, y: Math.min(...ys) - marge, largeur: Math.max(...xs) - Math.min(...xs) + 2 * marge, hauteur: Math.max(...ys) - Math.min(...ys) + 2 * marge };
    const cx = boite.x + boite.largeur / 2;
    const cy = boite.y + boite.hauteur / 2;
    const e0 = Math.min(zone.largeur * remplissage / boite.largeur, zone.hauteur * remplissage / boite.hauteur);
    const libre = (e, dx, dy) => eviter.every(r => points.every(p => {
      const x = zone.x + zone.largeur / 2 + dx + (p.x - cx) * e;
      const y = zone.y + zone.hauteur / 2 + dy + (p.y - cy) * e;
      const m = marge * e;
      return x < r.x - m || x > r.x + r.largeur + m || y < r.y - m || y > r.y + r.hauteur + m;
    }));
    for (let e = e0; e >= e0 * 0.6; e -= e0 * 0.02) {
      const jeuX = Math.max(0, (zone.largeur - boite.largeur * e) / 2);
      const jeuY = Math.max(0, (zone.hauteur - boite.hauteur * e) / 2);
      const decalages = [];
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) decalages.push([jeuX * a / 3, jeuY * b / 3]);
      decalages.sort((u, v) => Math.hypot(...u) - Math.hypot(...v));
      const bon = decalages.find(([dx, dy]) => libre(e, dx, dy));
      if (bon) return { x: cx - bon[0] / e, y: cy - bon[1] / e, echelle: e };
    }
    return { x: cx, y: cy, echelle: e0 };
  }

  // La vue d'ensemble utilisée par suivre() : celle donnée par cadrer() (scénario), sinon le monde.
  cadrer(vue) {
    this.ensemble = vue;
  }

  choisirMode(mode) {
    if (!Camera.MODES.includes(mode)) throw new RangeError(`Mode de caméra inconnu : ${mode}.`);
    this.mode = mode;
    this.plan = { indice: 0, temps: 0 };
  }

  // Le mode réellement utilisé (le plan en cours, en réalisation TV).
  get modeEffectif() {
    return this.mode === 'tv' ? Camera.PLANS_TV[this.plan.indice] : this.mode;
  }

  // Une image. zone = partie de l'écran où dessiner ; cible = la voiture suivie (ou null) ; dt en
  // secondes ; options : drone (le DroneCamera), vitesseRelative (0 à 1, de la cible), secousse
  // ({ x, y } en pixels d'écran, pour l'embarquée), zoom (grossissement du suivi), avance (px du
  // monde : centre du suivi devant la voiture), dtPlan (temps de la réalisation TV : 0 en pause).
  suivre(zone, largeurMonde, hauteurMonde, cible, dt, { drone = null, vitesseRelative = 0, secousse = { x: 0, y: 0 }, zoom = Camera.ZOOM_SUIVI, avance = 0, dtPlan = dt } = {}) {
    this.zone = zone;
    if (this.mode === 'tv') {
      this.plan.temps += dtPlan;
      if (this.plan.temps >= Camera.DUREE_PLAN) {
        this.plan = { indice: (this.plan.indice + 1) % Camera.PLANS_TV.length, temps: 0 };
        this.pret = false;                                       // coupe franche
      }
    }
    const ensemble = this.ensemble ?? Camera.vueEnsemble(zone, largeurMonde, hauteurMonde);
    const mode = this.modeEffectif;
    let vise = { ...ensemble, rotation: 0 };
    if (mode === 'suivi' && cible !== null) {
      // devant la voiture, dans le sens de sa vitesse (0 à l'arrêt)
      const vel = avance !== 0 && cible.vel ? cible.vel : { x: 0, y: 0 };
      const v = Math.hypot(vel.x, vel.y);
      const k = v > 1e-6 ? avance / v : 0;
      vise = { x: cible.pos.x + vel.x * k, y: cible.pos.y + vel.y * k, echelle: ensemble.echelle * zoom * (1 - 0.15 * vitesseRelative), rotation: 0 };
    } else if (mode === 'drone' && drone !== null) {
      vise = { x: drone.pos.x, y: drone.pos.y, echelle: ensemble.echelle * Camera.ZOOM_DRONE, rotation: 0 };
    } else if (mode === 'embarquee' && cible !== null) {
      const cap = cible.glisseActive ? cible.capCarrosserie : cible.cap;
      vise = {
        x: cible.pos.x + Math.cos(cap) * Camera.AVANCE_EMBARQUEE,
        y: cible.pos.y + Math.sin(cap) * Camera.AVANCE_EMBARQUEE,
        echelle: ensemble.echelle * Camera.ZOOM_EMBARQUEE * (1 - 0.2 * vitesseRelative),
        rotation: -cap - Math.PI / 2,
      };
    }
    const t = this.pret ? 1 - Math.exp(-Camera.LISSAGE * dt) : 1;
    this.x += (vise.x - this.x) * t;
    this.y += (vise.y - this.y) * t;
    this.echelle += (vise.echelle - this.echelle) * t;
    this.rotation += Glisse.angle(vise.rotation - this.rotation) * t;
    this.secousse = mode === 'embarquee' ? secousse : { x: 0, y: 0 };
    this.pret = true;
  }

  // Applique le décalage au dessin qui suit (entre push() et pop()).
  appliquer() {
    translate(this.zone.x + this.zone.largeur / 2 + this.secousse.x, this.zone.y + this.zone.hauteur / 2 + this.secousse.y);
    scale(this.echelle);
    if (this.rotation !== 0) rotate(this.rotation);
    translate(-this.x, -this.y);
  }

  // Point du monde -> point de l'écran (inverse de versMonde).
  versEcran(x, y) {
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    const dx = (x - this.x) * this.echelle;
    const dy = (y - this.y) * this.echelle;
    return { x: this.zone.x + this.zone.largeur / 2 + this.secousse.x + dx * c - dy * s,
      y: this.zone.y + this.zone.hauteur / 2 + this.secousse.y + dx * s + dy * c };
  }

  // Point de l'écran -> point du monde (pour un clic).
  versMonde(x, y) {
    const dx = (x - this.zone.x - this.zone.largeur / 2 - this.secousse.x) / this.echelle;
    const dy = (y - this.zone.y - this.zone.hauteur / 2 - this.secousse.y) / this.echelle;
    const c = Math.cos(-this.rotation);
    const s = Math.sin(-this.rotation);
    return { x: dx * c - dy * s + this.x, y: dx * s + dy * c + this.y };
  }
}
