// Grille spatiale : un outil de calcul, pas une entité. Elle ne bouge pas et ne se déplace pas :
// ce n'est donc pas un Vehicle. Elle sert à trouver vite les voisins d'un oiseau.
//
// Sans elle, chaque oiseau compare sa position à celle de tous les autres : pour 600 oiseaux,
// 360 000 distances par image. La grille découpe la fenêtre en cellules carrées dont le côté est
// le rayon de perception. Un voisin situé à moins de ce rayon est forcément dans la cellule de
// l'oiseau ou dans l'une des 8 cellules qui la touchent : on ne regarde que ces 9 cellules.
//
// La grille est reconstruite à chaque image (les oiseaux ont bougé). Le résultat est exactement
// celui du calcul direct, voisinsParForceBrute, qui sert de référence dans les tests.
class GrilleSpatiale {
  // largeur, hauteur = taille de la fenêtre ; taille = côté d'une cellule, en pixels.
  constructor(largeur, hauteur, taille) {
    if (!(taille > 0) || !Number.isFinite(taille)) {
      throw new RangeError('La taille d\'une cellule doit être un nombre positif.');
    }
    this.largeur = largeur;
    this.hauteur = hauteur;
    this.taille = taille;
    this.colonnes = Math.max(1, Math.ceil(largeur / taille));
    this.lignes = Math.max(1, Math.ceil(hauteur / taille));
    // une liste de véhicules par cellule, rangées ligne après ligne
    this.cellules = Array.from({ length: this.colonnes * this.lignes }, () => []);
  }

  // Colonne et ligne de la cellule qui contient un point. Un véhicule sorti de la fenêtre est
  // rangé dans la cellule du bord la plus proche : deux véhicules proches l'un de l'autre restent
  // ainsi dans des cellules voisines, même hors de la fenêtre.
  colonne(x) {
    return Math.min(this.colonnes - 1, Math.max(0, Math.floor(x / this.taille)));
  }

  ligne(y) {
    return Math.min(this.lignes - 1, Math.max(0, Math.floor(y / this.taille)));
  }

  // Vide la grille puis range chaque véhicule dans sa cellule.
  reconstruire(vehicules) {
    this.cellules.forEach(cellule => { cellule.length = 0; });
    vehicules.forEach(vehicule => {
      this.cellules[this.ligne(vehicule.pos.y) * this.colonnes + this.colonne(vehicule.pos.x)].push(vehicule);
    });
  }

  // Les véhicules rangés dans la grille à moins de `rayon` pixels de `vehicule` (lui-même exclu).
  // Le rayon ne peut pas dépasser le côté d'une cellule : au-delà, des voisins seraient hors des
  // 9 cellules regardées.
  voisins(vehicule, rayon = this.taille) {
    if (rayon > this.taille) {
      throw new RangeError('Le rayon de recherche ne peut pas dépasser la taille d\'une cellule.');
    }
    const colonne = this.colonne(vehicule.pos.x);
    const ligne = this.ligne(vehicule.pos.y);
    const trouves = [];

    for (let l = Math.max(0, ligne - 1); l <= Math.min(this.lignes - 1, ligne + 1); l++) {
      for (let c = Math.max(0, colonne - 1); c <= Math.min(this.colonnes - 1, colonne + 1); c++) {
        this.cellules[l * this.colonnes + c].forEach(autre => {
          if (autre !== vehicule && GrilleSpatiale.proches(vehicule, autre, rayon)) trouves.push(autre);
        });
      }
    }
    return trouves;
  }

  // Vrai si deux véhicules sont à moins de `rayon` pixels l'un de l'autre. On compare les carrés
  // des distances : cela évite une racine carrée et un vecteur temporaire par comparaison, ce
  // qui compte quand elle est faite des dizaines de milliers de fois par image.
  static proches(a, b, rayon) {
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    return dx * dx + dy * dy < rayon * rayon;
  }

  // Le calcul direct, sans grille : on compare à tous les véhicules. Même règle que voisins().
  static voisinsParForceBrute(vehicules, vehicule, rayon) {
    return vehicules.filter(autre => autre !== vehicule && GrilleSpatiale.proches(vehicule, autre, rayon));
  }
}
