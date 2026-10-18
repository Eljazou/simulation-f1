// Confetti du podium : un Vehicle (en coordonnées d'écran). Il naît au-dessus du podium (règle de
// scène : Podium les place une fois), puis il tombe en voletant : seek vers un point du sol sous
// lui, petite vitesse maximale (la résistance de l'air), plus wander (le flottement). Arrivé au sol,
// il s'y pose (arrive vers sa propre position : il freine jusqu'à l'arrêt). Il tourne sur lui-même
// en tombant (attribut de dessin). Il vit DUREE_VIE secondes (il s'efface pendant la dernière) :
// le podium retire ensuite les confettis éteints ou sortis de l'écran.
class Confetti extends Vehicle {
  static VITESSE_MAX = 1.6;
  static FORCE_MAX = 0.05;
  static POIDS_CHUTE = 1;
  static POIDS_FLOTTEMENT = 0.8;
  static DUREE_VIE = 8;
  static FONDU = 1;
  static COULEURS = [[250, 210, 40], [230, 50, 60], [60, 140, 240], [70, 200, 110], [245, 245, 245], [190, 110, 255]];

  // sol = ordonnée (écran) où il se pose ; couleur : l'une des COULEURS.
  constructor(x, y, sol, couleur = Confetti.COULEURS[0]) {
    super(x, y);
    this.maxSpeed = Confetti.VITESSE_MAX;
    this.maxForce = Confetti.FORCE_MAX;
    this.r = 3;
    this.sol = sol;
    this.couleur = couleur;
    this.distanceCercle = 30;
    this.wanderRadius = 20;
    this.displaceRange = 0.4;
    this.angle = 0;
    this.pose = false;
    this.age = 0;
  }

  // Éteint : sa durée de vie est écoulée.
  get eteint() {
    return this.age >= Confetti.DUREE_VIE;
  }

  // Sorti de l'écran (largeur × hauteur), avec une marge.
  sorti(largeur, hauteur, marge = 30) {
    return this.pos.x < -marge || this.pos.x > largeur + marge || this.pos.y > hauteur + marge;
  }

  // Posé : il est arrivé au sol.
  decide() {
    if (!this.pose && this.pos.y >= this.sol) this.pose = true;
  }

  applyBehaviors() {
    if (this.pose) {
      this.applyForce(this.arrive(this.pos.copy()));
      return;
    }
    this.applyForce(this.seek(createVector(this.pos.x, this.sol + 40)).mult(Confetti.POIDS_CHUTE));
    this.applyForce(this.wander().mult(Confetti.POIDS_FLOTTEMENT));
  }

  update(dt = 0) {
    this.age += dt;
    if (!this.pose) this.angle += dt * (4 + 6 * Math.abs(this.vel.x));
    super.update();
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    noStroke();
    // il s'efface pendant sa dernière seconde
    const opacite = Math.max(0, Math.min(1, (Confetti.DUREE_VIE - this.age) / Confetti.FONDU));
    fill(...this.couleur, 255 * opacite);
    // vu par la tranche quand il tourne : le rectangle s'aplatit
    rect(-3, -2 * Math.abs(Math.cos(this.angle * 1.7)) - 0.4, 6, 4 * Math.abs(Math.cos(this.angle * 1.7)) + 0.8);
    pop();
  }
}
