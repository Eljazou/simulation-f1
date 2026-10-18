// Fumée de freinage : un petit Vehicle purement visuel (il ne compte ni dans le classement ni
// dans l'évitement). Il naît derrière une voiture qui freine (règle de scène), reçoit son élan
// sous forme d'une force à sa première image, puis freine tout seul (arrive vers sa propre
// position : vitesse désirée nulle) et s'efface au bout de DUREE secondes.
// Ses constantes sont lues sur this.constructor : une sous-classe (GerbeEau) peut les changer.
class Fumee extends Vehicle {
  static DUREE = 0.8;
  static RAYON = 3;
  // Le nuage grossit de CROISSANCE pixels de rayon pendant sa vie.
  static CROISSANCE = 9;
  static VITESSE_MAX = 2;
  static FORCE_MAX = 0.06;

  // x, y = point de naissance ; elan = { x, y } : la force reçue à la première image.
  constructor(x, y, elan = { x: 0, y: 0 }) {
    super(x, y);
    this.r = this.constructor.RAYON;
    this.maxSpeed = this.constructor.VITESSE_MAX;
    this.maxForce = this.constructor.FORCE_MAX;
    this.elan = createVector(elan.x, elan.y);
    this.age = 0;
  }

  get terminee() {
    return this.age >= this.constructor.DUREE;
  }

  // Part de la vie écoulée, entre 0 et 1.
  get vieillesse() {
    return Math.min(1, this.age / this.constructor.DUREE);
  }

  applyBehaviors() {
    if (this.elan !== null) {
      this.applyForce(this.elan);
      this.elan = null;
      return;
    }
    // arrive vers sa propre position : la vitesse désirée est nulle, la force freine
    this.applyForce(this.arrive(this.pos.copy()));
  }

  update(dt = 0) {
    this.age += dt;
    super.update();
  }

  // Un nuage gris qui grossit et s'efface.
  show() {
    push();
    noStroke();
    fill(215, 215, 215, 110 * (1 - this.vieillesse));
    circle(this.pos.x, this.pos.y, 2 * (this.r + Fumee.CROISSANCE * this.vieillesse));
    pop();
  }
}
