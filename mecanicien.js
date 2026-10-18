// Mécanicien d'une équipe de stand : un Vehicle, piloté uniquement par des forces (arrive vers le
// point que son équipe lui donne). Il ne décide rien seul : EquipeDeStand lui dit où aller et ce
// qu'il porte. Rôles : 'pistolet' (visse et dévisse une roue), 'retire' (emporte le pneu usé),
// 'pose' (apporte le pneu neuf), 'cric' (avant ou arrière), 'sucette' (le « lollipop » qui
// libère la voiture), 'extincteur'.
class Mecanicien extends Vehicle {
  static VITESSE_MAX = 1.8;
  static FORCE_MAX = 0.3;
  static RAYON = 2.6;
  // Zone de freinage d'arrive : il ralentit en approchant de son point.
  static FREINAGE = 18;
  // À moins de cette distance de son point, il y est.
  static EN_PLACE = 1.5;

  // x, y = sa place d'attente (naissance) ; role ; couleurs = celles de l'écurie (combinaison).
  constructor(x, y, role, couleurs) {
    super(x, y);
    this.r = Mecanicien.RAYON;
    this.maxSpeed = Mecanicien.VITESSE_MAX;
    this.maxForce = Mecanicien.FORCE_MAX;
    this.rayonZoneDeFreinage = Mecanicien.FREINAGE;
    this.role = role;
    this.couleurs = couleurs;
    this.cible = { x, y };
    // ce qu'il porte : null, 'neuf' ou 'ancien' (un pneu), et son orientation de dessin
    this.porte = null;
    this.cap = 0;
    this.horloge = 0;
  }

  // Son équipe lui donne un point à rejoindre.
  aller(x, y) {
    this.cible = { x, y };
  }

  get enPlace() {
    return Math.hypot(this.pos.x - this.cible.x, this.pos.y - this.cible.y) < Mecanicien.EN_PLACE;
  }

  // ARRIVE vers son point : il s'y arrête sans le dépasser.
  applyBehaviors() {
    this.applyForce(this.arrive(createVector(this.cible.x, this.cible.y)));
  }

  update(dt = 0) {
    this.horloge += dt;
    super.update();
    if (this.vel.mag() > 0.15) this.cap = this.vel.heading();
  }

  // Vu de dessus : épaules à la couleur de l'écurie, casque, et ce qu'il tient.
  show() {
    const [principale, secondaire] = this.couleurs;
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.cap);
    noStroke();
    fill(...principale);
    ellipse(0, 0, 3.6, 5.6);
    fill(...secondaire);
    circle(0.3, 0, 2.6);
    if (this.porte !== null) {
      // un pneu tenu devant lui (le neuf a une bande de couleur)
      fill(20);
      circle(2.8, 0, 3.4);
      if (this.porte === 'neuf') {
        fill(250, 210, 40);
        circle(2.8, 0, 1.4);
      }
    }
    if (this.role === 'sucette') {
      stroke(80);
      strokeWeight(0.5);
      line(0, 0, 4, 0);
      noStroke();
      fill(230, 30, 30);
      circle(4.6, 0, 2.6);
    }
    if (this.role === 'extincteur') {
      fill(220, 30, 30);
      rect(1.2, -0.8, 2.2, 1.6, 0.5);
    }
    pop();
  }
}
