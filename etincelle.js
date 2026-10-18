// Étincelle du fond plat : le patin de titane frotte la piste (forte vitesse, compression au
// freinage, vibreur). C'est une Fumee (donc un Vehicle) aux réglages d'étincelle : même cycle de
// vie (élan reçu comme une force à la première image, friction par arrive vers sa propre
// position, effacement au bout de DUREE secondes), mais très rapide, très brève, et dessinée en
// trait lumineux orienté selon sa vitesse. Purement visuelle ; Course plafonne leur nombre.
class Etincelle extends Fumee {
  static DUREE = 0.22;
  static RAYON = 0.8;
  static CROISSANCE = 0;
  static VITESSE_MAX = 9;
  static FORCE_MAX = 0.35;

  show() {
    const v = this.vel;
    const vie = 1 - this.vieillesse;
    push();
    stroke(255, 200 + 55 * vie, 90 * vie, 230 * vie);
    strokeWeight(1.2);
    line(this.pos.x, this.pos.y, this.pos.x - v.x * 1.6, this.pos.y - v.y * 1.6);
    pop();
  }
}
