// Écran de fin après un accident en mode pilote (design/ : « Écran REJOUER ») : le mot
// « REJOUER » en matrice de points (7 lignes × 5 colonnes par lettre, points de 14 px espacés de
// 6, 20 px entre les lettres), première lettre à la couleur d'accent. Ce gestionnaire ne bouge pas
// (ce n'est pas un Vehicle) : il possède les points allumés, des PointRejouer (des Particule, donc
// des Vehicle), leur donne chacun une case du mot par affectation au plus proche
// (Affectation.auPlusProche : jamais deux points sur la même case), puis les fait décider,
// piloter (arrive vers leur case) et avancer. Ils naissent autour du point de l'accident (règle de
// scène, une seule fois). Les cases éteintes sont le fond de l'écran (dessinées, immobiles). Le mot
// est un bouton : un clic dans son rectangle (une fois formé) ou Entrée relance une course.
//
// Tout est dans le REPÈRE DE L'ÉCRAN (pas de caméra) : le scénario le dessine après la scène, hors
// du translate / scale de la caméra. La disposition (EcranFin.disposition) centre le mot
// horizontalement et centre verticalement le groupe « mot, 40 px, boutons et touches, bilan » ;
// l'interface HTML place ses boutons et son bilan avec la même disposition. Le pas des points se
// réduit pour que le mot tienne dans 80 % de la largeur ; une nouvelle taille d'écran (adapter)
// recalcule les cases et les points repartent vers elles.
class EcranFin {
  static MOT = 'REJOUER';
  // Matrice de chaque lettre (design) : 7 lignes de 5 colonnes, « 1 » = point allumé.
  static GLYPHES = {
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  };
  static POINT = 14;
  static ESPACE = 6;
  static ENTRE_LETTRES = 20;
  // Part des points posés sur leur case pour que le mot soit « formé ».
  static SEUIL_FORME = 0.95;
  // Dispersion des points à la naissance autour du point de l'accident, en pixels.
  static DISPERSION = 60;
  // Marge autour du mot pour la zone cliquable.
  static MARGE = 16;
  // Fond de l'écran : #0b0d10, presque opaque.
  static OPACITE_FOND = 0.88;

  // Le groupe centré verticalement (px) : écart mot → boutons, hauteur des boutons et des touches
  // (.rejouer-actions : 48 + 18 + 26), écart → bilan, hauteur du bilan (.rejouer-bilan) ; le mot
  // tient dans LARGEUR_MAX de la largeur de l'écran.
  static DISPOSITION = { ECART_MOT: 40, ACTIONS: 92, ECART_BILAN: 24, BILAN: 58, LARGEUR_MAX: 0.8 };

  // La mise en page de l'écran (repère de l'écran) : pas des points = min(pas par défaut,
  // LARGEUR_MAX × largeur / colonnes), diamètre et espaces à la même échelle ; mot centré
  // horizontalement (motGauche = largeur / 2 − motLargeur / 2) ; groupe centré verticalement.
  static disposition(largeur, hauteur, mot = EcranFin.MOT) {
    const { POINT, ESPACE, ENTRE_LETTRES, DISPOSITION: D } = EcranFin;
    const pasDefaut = POINT + ESPACE;
    const pas = Math.min(pasDefaut, D.LARGEUR_MAX * largeur / (mot.length * 5));
    const echelle = pas / pasDefaut;
    const point = POINT * echelle;
    const espace = ESPACE * echelle;
    const entreLettres = ENTRE_LETTRES * echelle;
    const lettre = 5 * point + 4 * espace;
    const motLargeur = mot.length * lettre + (mot.length - 1) * entreLettres;
    const motHauteur = 7 * point + 6 * espace;
    const groupe = motHauteur + D.ECART_MOT + D.ACTIONS + D.ECART_BILAN + D.BILAN;
    const motHaut = Math.max(0, (hauteur - groupe) / 2);
    const actionsHaut = motHaut + motHauteur + D.ECART_MOT;
    return { largeur, hauteur, echelle, pas, point, espace, entreLettres, lettre, motLargeur, motHauteur,
      motGauche: largeur / 2 - motLargeur / 2, motHaut, actionsHaut, bilanHaut: actionsHaut + D.ACTIONS + D.ECART_BILAN };
  }

  // Les cases du mot, placées par la disposition : [{ x, y, allume, lettre }].
  static matrice(d, mot = EcranFin.MOT) {
    const cases = [];
    [...mot].forEach((ch, l) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
          cases.push({ x: d.motGauche + l * (d.lettre + d.entreLettres) + c * d.pas + d.point / 2, y: d.motHaut + r * d.pas + d.point / 2,
            allume: EcranFin.GLYPHES[ch][r][c] === '1', lettre: l });
        }
      }
    });
    return cases;
  }

  // largeur, hauteur = taille de l'écran ; origine = { x, y } de l'accident, à l'écran ; alea =
  // générateur entre 0 et 1.
  constructor(largeur, hauteur, origine, alea = Math.random) {
    this.placer(largeur, hauteur);
    const allumees = this.cases.filter(c => c.allume);
    this.particules = allumees.map(c => {
      const angle = alea() * 2 * Math.PI;
      const rayon = alea() * EcranFin.DISPERSION;
      return new PointRejouer(origine.x + Math.cos(angle) * rayon, origine.y + Math.sin(angle) * rayon, c.lettre === 0, this.disposition.point);
    });
    this.affectation = Affectation.auPlusProche(this.particules.map(particule => particule.pos), this.points);
    // la couleur suit la case : un point de la première lettre est rouge
    this.particules.forEach((particule, k) => {
      if (this.affectation[k] >= 0) {
        const premiere = allumees[this.affectation[k]].lettre === 0;
        particule.premiere = premiere;
        particule.teinte = premiere ? PointRejouer.ACCENT : PointRejouer.BLANC;
        particule.viser(this.points[this.affectation[k]], this.affectation[k]);
        particule.fixer();
      }
    });
  }

  // Disposition, cases, points allumés et zone cliquable pour un écran de cette taille.
  placer(largeur, hauteur) {
    this.largeur = largeur;
    this.hauteur = hauteur;
    this.disposition = EcranFin.disposition(largeur, hauteur);
    this.cases = EcranFin.matrice(this.disposition);
    this.points = this.cases.filter(c => c.allume).map(c => ({ x: c.x, y: c.y }));
    // le rectangle englobant du mot : la zone cliquable
    const xs = this.cases.map(p => p.x);
    const ys = this.cases.map(p => p.y);
    const demi = this.disposition.point / 2;
    this.zone = {
      x: Math.min(...xs) - demi - EcranFin.MARGE,
      y: Math.min(...ys) - demi - EcranFin.MARGE,
      largeur: Math.max(...xs) - Math.min(...xs) + 2 * (demi + EcranFin.MARGE),
      hauteur: Math.max(...ys) - Math.min(...ys) + 2 * (demi + EcranFin.MARGE),
    };
  }

  // L'écran a changé de taille : nouvelles cases ; chaque point garde sa case (même affectation)
  // et repart vers elle avec arrive. Renvoie vrai si quelque chose a changé.
  adapter(largeur, hauteur) {
    if (largeur === this.largeur && hauteur === this.hauteur) return false;
    this.placer(largeur, hauteur);
    this.particules.forEach((particule, k) => {
      particule.diametre = this.disposition.point;
      if (this.affectation[k] >= 0) particule.viser(this.points[this.affectation[k]], this.affectation[k]);
    });
    return true;
  }

  // Part des particules qui ont un point et y sont posées.
  get rassemblement() {
    const visees = this.particules.filter(particule => particule.cible !== null);
    if (visees.length === 0) return 1;
    return visees.filter(particule => particule.estArrivee()).length / visees.length;
  }

  // Le mot est formé : il accepte le clic.
  get forme() {
    return this.rassemblement >= EcranFin.SEUIL_FORME;
  }

  // Un point de l'écran dans la zone du mot ?
  contient(x, y) {
    const z = this.zone;
    return x >= z.x && x <= z.x + z.largeur && y >= z.y && y <= z.y + z.hauteur;
  }

  // Un clic, en coordonnées de l'écran : vrai s'il vaut « rejouer » (dans le mot, une fois formé).
  clicRejoue(x, y) {
    return this.forme && this.contient(x, y);
  }

  applyBehaviors() {
    const contexte = { largeur: this.largeur, hauteur: this.hauteur };
    this.particules.forEach(particule => particule.applyBehaviors(contexte));
  }

  update() {
    this.particules.forEach(particule => particule.update());
  }

  // Le fond sombre, les cases éteintes (rgba(255, 255, 255, .06)), puis les points, dans le repère
  // de l'écran (à appeler hors de la caméra). Les boutons et les touches sont dans l'interface
  // HTML (EcranRejouer).
  show() {
    push();
    noStroke();
    // fond du design (#0b0d10) sur tout l'écran, la course restant devinée dessous
    fill(11, 13, 16, EcranFin.OPACITE_FOND * 255);
    rect(0, 0, this.largeur, this.hauteur);
    fill(255, 255, 255, 0.06 * 255);
    this.cases.forEach(c => { if (!c.allume) circle(c.x, c.y, this.disposition.point); });
    pop();
    this.particules.forEach(particule => particule.show());
  }
}
