// Drone caméra : il survole le circuit avec un wander léger, seek vers le groupe de tête (la caméra
// « drone » le suit), et reste au-dessus du monde (garderDansFenetre, empruntée à Particule). Son
// ombre est décalée au sol (il vole haut) ; il s'incline dans le sens de son accélération.
class DroneCamera extends Vehicle {
  static VITESSE_MAX = 1.6;
  static FORCE_MAX = 0.04;
  static RAYON = 14;
  static POIDS_WANDER = 1;
  static POIDS_MONDE = 2;
  static POIDS_GROUPE = 1.2;
  // Distance aux bords du monde à partir de laquelle il fait demi-tour.
  static MARGE = 120;
  // Décalage de l'ombre au sol, et vitesse de rotation des hélices (tours par seconde).
  static OMBRE = 26;
  static ROTATION = 6;

  // largeur, hauteur = taille du monde qu'il survole.
  constructor(x, y, largeur, hauteur) {
    super(x, y);
    this.r = DroneCamera.RAYON;
    this.maxSpeed = DroneCamera.VITESSE_MAX;
    this.maxForce = DroneCamera.FORCE_MAX;
    this.distanceCercle = 80;
    this.wanderRadius = 30;
    this.displaceRange = 0.2;
    this.largeur = largeur;
    this.hauteur = hauteur;
    this.horloge = 0;
    // inclinaison (attribut de dessin) : la part latérale de la dernière accélération
    this.inclinaison = 0;
    this.cible = null;
  }

  // Remplace boundaries() de Vehicle (qui renvoie une vitesse) : on emprunte la méthode corrigée
  // de Particule plutôt que de la recopier.
  garderDansFenetre(largeur, hauteur, marge) {
    return Particule.prototype.garderDansFenetre.call(this, largeur, hauteur, marge);
  }

  // contexte : groupe = { x, y } le centre du groupe de tête (ou null : il erre seulement).
  applyBehaviors({ groupe = null } = {}) {
    this.applyForce(this.wander().mult(DroneCamera.POIDS_WANDER));
    this.cible = groupe;
    if (groupe !== null) this.applyForce(this.arrive(createVector(groupe.x, groupe.y)).mult(DroneCamera.POIDS_GROUPE));
    this.applyForce(this.garderDansFenetre(this.largeur, this.hauteur, DroneCamera.MARGE).mult(DroneCamera.POIDS_MONDE));
  }

  update(dt = 0) {
    this.horloge += dt;
    // inclinaison : lissée, d'après l'accélération de l'image (lue, jamais écrite)
    const vise = Math.max(-1, Math.min(1, this.acc.mag() / Math.max(1e-6, this.maxForce * 2)));
    this.inclinaison += (vise - this.inclinaison) * 0.1;
    super.update();
  }

  // Quadricoptère : ombre au sol, bras en croix, quatre hélices qui tournent.
  show({ ombres = true } = {}) {
    const cap = this.vel.mag() > 0.05 ? this.vel.heading() : 0;
    const bras = 11;
    push();
    noStroke();
    if (ombres) {
      fill(0, 0, 0, 40);
      circle(this.pos.x + DroneCamera.OMBRE, this.pos.y + DroneCamera.OMBRE, 30);
    }
    translate(this.pos.x, this.pos.y);
    rotate(cap + Math.PI / 4);
    // incliné : le côté qui avance s'abaisse (vu de dessus, il paraît un peu écrasé)
    scale(1, 1 - 0.18 * this.inclinaison);
    stroke(40);
    strokeWeight(2.5);
    line(-bras, -bras, bras, bras);
    line(-bras, bras, bras, -bras);
    noStroke();
    fill(35);
    rect(-5, -5, 10, 10, 2);
    fill(230, 40, 40);
    circle(3, 0, 3);
    const angle = this.horloge * DroneCamera.ROTATION * 2 * Math.PI;
    for (const [x, y] of [[-bras, -bras], [bras, bras], [-bras, bras], [bras, -bras]]) {
      fill(200, 200, 210, 90);
      circle(x, y, 13);
      stroke(240, 240, 250, 160);
      strokeWeight(1);
      line(x - Math.cos(angle) * 6, y - Math.sin(angle) * 6, x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
      noStroke();
    }
    pop();
  }
}
