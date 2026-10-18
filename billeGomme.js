// Bille de gomme (« marbles ») : les petits morceaux de pneu qui s'accumulent hors de la ligne de
// course. Un Debris (donc un Vehicle) : immobile à sa naissance (règle de scène : Course la pose
// à côté de la trajectoire d'une voiture), puis balayée par les voitures qui passent tout près (une
// force d'éjection : flee de la voiture, d'autant plus forte qu'elle va vite), freinée par la
// friction (arrive vers sa propre position). Elle s'efface au bout de DUREE secondes.
class BilleGomme extends Debris {
  static DUREE = 40;
  static RAYON = 1.1;
  static VITESSE_MAX = 4;
  static FORCE_MAX = 0.5;
  // Une voiture balaie les billes à moins de cette distance ; force d'éjection par unité de vitesse.
  static PORTEE = 16;
  static EJECTION = 0.12;

  constructor(x, y) {
    super(x, y, [28, 26, 24]);
    this.r = BilleGomme.RAYON;
    this.maxSpeed = BilleGomme.VITESSE_MAX;
    this.maxForce = BilleGomme.FORCE_MAX;
  }

  get termine() {
    return this.age >= BilleGomme.DUREE;
  }

  // contexte : voitures = celles qui passent (balayage) ; perturbations (accident) comme un débris.
  applyBehaviors({ voitures = [], perturbations = [] } = {}) {
    for (const v of voitures) {
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.y - this.pos.y);
      if (d >= BilleGomme.PORTEE || v.vitesse < 0.5) continue;
      // éjection : flee de la voiture (empruntée à Particule), proportionnelle à sa vitesse
      const fuite = Particule.prototype.flee.call(this, v.pos.copy());
      this.applyForce(fuite.mult(BilleGomme.EJECTION * v.vitesse * (1 - d / BilleGomme.PORTEE) / Math.max(1e-6, this.maxForce)));
    }
    super.applyBehaviors({ perturbations });
  }

  show() {
    push();
    noStroke();
    fill(30, 28, 26, 220 * (1 - Math.min(1, this.age / BilleGomme.DUREE)));
    circle(this.pos.x, this.pos.y, this.r * 2);
    pop();
  }
}
