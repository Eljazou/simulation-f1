// Débris d'un accident : un petit Vehicle éphémère. Il naît au point de contact (règle de
// scène), immobile ; la Perturbation créée au même endroit l'éjecte (il applique sa force de
// répulsion), puis la friction (arrive vers sa propre position : vitesse désirée nulle) le
// ralentit. Il s'efface au bout de DUREE secondes.
class Debris extends Vehicle {
  static DUREE = 3;
  static RAYON = 2.5;
  static VITESSE_MAX = 6;
  static FORCE_MAX = 0.06;

  // couleur = [rouge, vert, bleu] : un morceau de la livrée.
  constructor(x, y, couleur = [200, 200, 200]) {
    super(x, y);
    this.r = Debris.RAYON;
    this.maxSpeed = Debris.VITESSE_MAX;
    this.maxForce = Debris.FORCE_MAX;
    this.couleur = couleur;
    this.age = 0;
  }

  get termine() {
    return this.age >= Debris.DUREE;
  }

  // contexte : perturbations = les souffles en cours (celui de l'accident).
  applyBehaviors({ perturbations = [] } = {}) {
    perturbations.forEach(perturbation => this.applyForce(perturbation.repousser(this)));
    // friction : arrive vers sa propre position, la force s'oppose à la vitesse
    this.applyForce(this.arrive(this.pos.copy()));
  }

  update(dt = 0) {
    this.age += dt;
    super.update();
  }

  // Un éclat de carrosserie qui s'efface ; il tourne selon la direction de sa vitesse.
  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.mag() > 0.05 ? this.vel.heading() : 0);
    noStroke();
    fill(...this.couleur, 255 * (1 - Math.min(1, this.age / Debris.DUREE)));
    rect(-this.r, -this.r / 2, 2 * this.r, this.r);
    pop();
  }
}
