// Point lumineux du mot « REJOUER » (design/ : « Écran REJOUER ») : une Particule (donc un
// Vehicle) qui rejoint sa case de la matrice 7 × 5 par arrive, comme dans « Encre vivante ». Elle
// ne change que son dessin : un disque de 14 px (moins sur un petit écran : diametre, donné par la
// disposition de EcranFin) avec un halo, à la couleur d'accent pour la première lettre, blanc
// cassé (#f2f4f7) pour les autres.
class PointRejouer extends Particule {
  static DIAMETRE = 14;
  static ACCENT = [225, 6, 0];
  static BLANC = [242, 244, 247];

  // premiere : le point appartient-il à la première lettre (accent) ?
  constructor(x, y, premiere = false, diametre = PointRejouer.DIAMETRE) {
    super(x, y);
    this.diametre = diametre;
    this.teinte = premiere ? PointRejouer.ACCENT : PointRejouer.BLANC;
    this.premiere = premiere;
  }

  show() {
    if (this.mangee || this.enVol) return;
    push();
    noStroke();
    // halo (box-shadow 10 px du design : accent à 60 %, blanc à 35 %)
    fill(...this.teinte, 255 * (this.premiere ? 0.6 : 0.35) * 0.45);
    circle(this.pos.x, this.pos.y, this.diametre * (1 + 10 / PointRejouer.DIAMETRE));
    fill(...this.teinte);
    circle(this.pos.x, this.pos.y, this.diametre);
    pop();
  }
}
