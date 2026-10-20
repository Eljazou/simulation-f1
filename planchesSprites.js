// Planche de sprites : de petits dessins répétés à chaque image (disques de la foule, mécaniciens,
// roues des voitures) sont tracés UNE fois chacun dans une case d'un même canvas, puis recopiés
// (drawImage). Le GPU enchaîne les copies d'une même texture en un seul lot, au lieu d'un tracé
// rempli (et d'une couleur p5) par forme. Ce n'est pas un Vehicle : la planche ne bouge rien.
//   boite = [xMin, yMin, xMax, yMax] : la place d'un dessin, en unités du dessin (son point (0, 0)
//     compris) ; chaque case a une marge transparente de MARGE pixels (pas de débordement des
//     cases voisines quand la copie est lissée).
//   Une planche par résolution (pixels de la planche par unité du dessin) : la puissance de 2 juste
//     au-dessus de l'échelle de l'écran, pour qu'une copie ne soit jamais agrandie (au plus réduite
//     de moitié) ; elle ne change qu'avec le zoom de la caméra (et chaque planche reste en cache).
//   Sans vrai contexte 2D (tests), la copie passe par image() de p5 (mêmes rectangles).
class PlancheSprites {
  static COLONNES = 16;
  static LIGNES = 8;
  static MARGE = 1;
  static RESOLUTION_MIN = 1;
  static RESOLUTION_MAX = 32;

  // La résolution pour une échelle d'écran (pixels réels par unité du dessin).
  static resolutionPour(echelle) {
    const e = Math.max(PlancheSprites.RESOLUTION_MIN, Math.min(PlancheSprites.RESOLUTION_MAX, Number.isFinite(echelle) ? echelle : 1));
    return 2 ** Math.ceil(Math.log2(e) - 1e-9);
  }

  // Le contexte 2D de l'écran, s'il est réel (null dans les tests).
  static contexte() {
    const ctx = typeof drawingContext === 'undefined' ? null : drawingContext;
    return ctx && typeof ctx === 'object' && typeof ctx.drawImage === 'function' && typeof ctx.getTransform === 'function' ? ctx : null;
  }

  // L'échelle du repère courant (pixels réels par unité ; 1 sans vrai contexte).
  static echelle(ctx = PlancheSprites.contexte()) {
    if (ctx === null) return 1;
    const m = ctx.getTransform();
    return Math.hypot(m.a, m.b);
  }

  constructor(boite) {
    this.boite = boite;
    // résolution → { g, source, l, h, cases: Map(clé → [sx, sy]) }
    this.planches = new Map();
  }

  // La résolution qui convient au repère courant, pour un dessin à l'échelle `echelle`.
  resolution(echelle = 1, ctx = PlancheSprites.contexte()) {
    return PlancheSprites.resolutionPour(PlancheSprites.echelle(ctx) * echelle);
  }

  planche(resolution) {
    if (!this.planches.has(resolution)) {
      const [x0, y0, x1, y1] = this.boite;
      const M = PlancheSprites.MARGE;
      const l = Math.ceil((x1 - x0) * resolution) + 2 * M;
      const h = Math.ceil((y1 - y0) * resolution) + 2 * M;
      const g = createGraphics(l * PlancheSprites.COLONNES, h * PlancheSprites.LIGNES);
      g.pixelDensity(1);
      g.noStroke();
      this.planches.set(resolution, { g, source: g.elt ?? g, l, h, cases: new Map() });
    }
    return this.planches.get(resolution);
  }

  // La case d'un dessin ([sx, sy] en pixels de la planche), tracée à sa première demande par
  // dessiner(g) (en unités du dessin, g déjà placé et mis à l'échelle) ; null si la planche est pleine.
  case(cle, resolution, dessiner) {
    const p = this.planche(resolution);
    const connue = p.cases.get(cle);
    if (connue !== undefined) return connue;
    const k = p.cases.size;
    if (k >= PlancheSprites.COLONNES * PlancheSprites.LIGNES) return null;
    const [x0, y0] = this.boite;
    const M = PlancheSprites.MARGE;
    const sx = (k % PlancheSprites.COLONNES) * p.l;
    const sy = Math.floor(k / PlancheSprites.COLONNES) * p.h;
    p.g.push();
    p.g.translate(sx + M - x0 * resolution, sy + M - y0 * resolution);
    p.g.scale(resolution);
    p.g.noStroke();
    dessiner(p.g);
    p.g.pop();
    const c = [sx, sy];
    p.cases.set(cle, c);
    return c;
  }

  // Copie le dessin `cle` (tracé par dessiner(g) la première fois), son point (0, 0) en (x, y) du
  // repère courant, à l'échelle `echelle`. Renvoie false si la planche est pleine (l'appelant
  // dessine alors lui-même).
  copier(cle, dessiner, x = 0, y = 0, echelle = 1, resolution = null, ctx = PlancheSprites.contexte()) {
    const r = resolution ?? this.resolution(echelle, ctx);
    const c = this.case(cle, r, dessiner);
    if (c === null) return false;
    const p = this.planches.get(r);
    const m = PlancheSprites.MARGE / r;
    const dx = x + (this.boite[0] - m) * echelle;
    const dy = y + (this.boite[1] - m) * echelle;
    const dl = p.l / r * echelle;
    const dh = p.h / r * echelle;
    if (ctx !== null) ctx.drawImage(p.source, c[0], c[1], p.l, p.h, dx, dy, dl, dh);
    else image(p.g, dx, dy, dl, dh, c[0], c[1], p.l, p.h);
    return true;
  }
}
