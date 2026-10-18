// Poussière soulevée par une voiture qui roule dans l'herbe ou le gravier : une Fumee (donc un
// Vehicle) aux réglages de poussière : même cycle de vie (élan reçu comme une force à la première
// image, puis friction par arrive vers sa propre position, effacement au bout de DUREE secondes),
// plus lente, plus large, couleur de terre. Purement visuelle ; Course plafonne leur nombre.
class GerbePoussiere extends Fumee {
  static DUREE = 1.2;
  static RAYON = 3;
  static CROISSANCE = 12;
  static VITESSE_MAX = 1.6;
  static FORCE_MAX = 0.05;

  show() {
    push();
    noStroke();
    fill(170, 145, 100, 120 * (1 - this.vieillesse));
    circle(this.pos.x, this.pos.y, 2 * (this.r + GerbePoussiere.CROISSANCE * this.vieillesse));
    pop();
  }
}
