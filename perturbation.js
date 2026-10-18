// Perturbation : un Vehicle éphémère créé par un clic. Il ne se déplace pas (aucune force ne lui
// est appliquée) et disparaît au bout de DUREE secondes. Tant qu'il existe, il fournit une force
// de répulsion aux véhicules voisins, qui l'appliquent eux-mêmes avec applyForce : la
// perturbation ne déplace jamais personne directement.
class Perturbation extends Vehicle {
  // Rayon d'action, en pixels.
  static RAYON = 220;
  // Durée de vie, en secondes.
  static DUREE = 0.5;
  // Force de répulsion maximale : au centre, à l'instant du clic. Bien plus que la force d'une
  // particule (0.4) : le souffle l'emporte sur son retour vers son point.
  static FORCE_MAX = 3;

  constructor(x, y) {
    super(x, y);
    this.r = Perturbation.RAYON;
    this.maxForce = Perturbation.FORCE_MAX;
    // temps écoulé depuis le clic, en secondes
    this.age = 0;
    // vrai quand au moins un véhicule est dans le rayon d'action (sert au mode debug)
    this.declenche = false;
  }

  get terminee() {
    return this.age >= Perturbation.DUREE;
  }

  // Intensité du souffle : 1 à l'instant du clic, 0 à la fin de la vie.
  get intensite() {
    return Math.max(0, 1 - this.age / Perturbation.DUREE);
  }

  // Force de répulsion pour un véhicule voisin. La vitesse désirée s'éloigne du centre à la
  // vitesse maximale du véhicule ; force = vitesse désirée - vitesse du véhicule. Elle est limitée
  // à maxForce, réduite par la distance (nulle au bord du rayon) et par l'âge (nulle à la fin).
  // (Véhicule exactement au centre : aucune direction n'existe, la force ne fait que le freiner.)
  repousser(vehicule) {
    const ecart = p5.Vector.sub(vehicule.pos, this.pos);
    const distance = ecart.mag();
    if (this.terminee || distance >= this.r) return createVector(0, 0);
    this.declenche = true;

    ecart.setMag(vehicule.maxSpeed);
    const force = p5.Vector.sub(ecart, vehicule.vel);
    force.limit(this.maxForce * this.intensite * (1 - distance / this.r));
    return force;
  }

  // ETAPE 3 : la perturbation vieillit. dt = temps écoulé depuis l'image précédente, en secondes
  // (deltaTime / 1000). La locomotion reste celle de Vehicle : sans force, elle ne bouge pas.
  update(dt = 0) {
    this.age += dt;
    super.update();
  }

  // Une onde qui s'élargit jusqu'au rayon d'action en s'effaçant. En mode debug : le rayon
  // d'action, jaune, et rouge quand un véhicule est dedans.
  show(debug = false) {
    push();
    noFill();
    stroke(255, 255, 255, 200 * this.intensite);
    strokeWeight(3);
    circle(this.pos.x, this.pos.y, this.r * 2 * (1 - this.intensite));
    if (debug) {
      stroke(this.declenche ? 'red' : 'yellow');
      strokeWeight(1);
      circle(this.pos.x, this.pos.y, this.r * 2);
    }
    pop();
  }
}
