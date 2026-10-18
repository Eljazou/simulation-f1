// Gerbe d'eau : une gouttelette de sillage, émise derrière une voiture sur piste mouillée. C'est
// une Fumee (donc un Vehicle) aux réglages d'eau : même cycle de vie (élan reçu comme une force à
// la première image, puis friction par arrive vers sa propre position, effacement au bout de
// DUREE secondes), plus rapide, plus courte, et dessinée en gouttes bleutées. Purement visuelle :
// elle ne compte ni dans le classement ni dans l'évitement. Course plafonne leur nombre.
class GerbeEau extends Fumee {
  static DUREE = 0.5;
  static RAYON = 1.6;
  static CROISSANCE = 3;
  static VITESSE_MAX = 3.5;
  static FORCE_MAX = 0.12;
  // Valeur de départ du curseur « quantité de gerbes » (plafond global).
  static QUANTITE = 220;

  show() {
    push();
    noStroke();
    fill(200, 220, 240, 150 * (1 - this.vieillesse));
    circle(this.pos.x, this.pos.y, 2 * (this.r + GerbeEau.CROISSANCE * this.vieillesse));
    pop();
  }
}
