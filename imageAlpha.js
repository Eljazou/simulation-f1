// Copier une image avec une opacité (module sans classe). Avec p5 1.7, image() sous tint() recopie
// d'abord TOUTE l'image source dans un canvas intermédiaire (_getTintedImageCanvas), à chaque
// appel, même quand la teinte ne change que l'opacité : sous la pluie, 125 copies par image
// (motif des gouttes, grain, vignette, ombres) ont saturé le GPU. Ici l'opacité passe par
// globalAlpha du contexte 2D : même résultat (tint(255, a) ne fait que dessiner la source avec
// globalAlpha = a / 255 dans sa copie), sans copie. Sans vrai contexte (tests), tint() classique.
const ImageAlpha = (() => {
  function contexte() {
    const ctx = typeof drawingContext === 'undefined' ? null : drawingContext;
    return ctx && typeof ctx === 'object' && typeof ctx.globalAlpha === 'number' ? ctx : null;
  }

  // image(g, x, y, l, h) à l'opacité `opacite` (0 à 1).
  function dessiner(g, opacite, x, y, l, h) {
    const a = Math.max(0, Math.min(1, opacite));
    if (a <= 0) return;
    const ctx = contexte();
    if (a >= 1) {
      image(g, x, y, l, h);
    } else if (ctx !== null) {
      const avant = ctx.globalAlpha;
      ctx.globalAlpha = avant * a;
      image(g, x, y, l, h);
      ctx.globalAlpha = avant;
    } else {
      tint(255, 255 * a);
      image(g, x, y, l, h);
      noTint();
    }
  }

  // Plusieurs copies à la même opacité (motifs en tuiles) : parcourir(poser) appelle
  // poser(x, y, l, h) pour chaque copie.
  function tuiles(g, opacite, parcourir) {
    const a = Math.max(0, Math.min(1, opacite));
    if (a <= 0) return;
    const ctx = contexte();
    let avant = 1;
    if (a < 1 && ctx !== null) {
      avant = ctx.globalAlpha;
      ctx.globalAlpha = avant * a;
    } else if (a < 1) {
      tint(255, 255 * a);
    }
    parcourir((x, y, l, h) => image(g, x, y, l, h));
    if (a < 1 && ctx !== null) ctx.globalAlpha = avant;
    else if (a < 1) noTint();
  }

  // Un motif (graphique de `cote` pixels, ou [largeur, hauteur], répété sans espace) sur le
  // rectangle (0, 0, largeur, hauteur), à l'opacité `opacite`, une copie en (ox, oy) : sur un vrai
  // contexte, un seul remplissage (createPattern, préparé une fois par graphique) au lieu d'une
  // copie par tuile ; sinon, les tuiles une à une (mêmes positions).
  const motifs = new WeakMap();
  function motif(g, opacite, cote, largeur, hauteur, ox = 0, oy = 0) {
    const [cl, ch] = Array.isArray(cote) ? cote : [cote, cote];
    const a = Math.max(0, Math.min(1, opacite));
    if (a <= 0) return;
    const ctx = contexte();
    const source = g && typeof g === 'object' ? g.elt : null;
    if (ctx === null || typeof ctx.createPattern !== 'function' || !source || typeof source !== 'object') {
      tuiles(g, a, poser => {
        // la première tuile qui couvre le coin (0, 0)
        const x0 = ox - Math.ceil(ox / cl) * cl;
        const y0 = oy - Math.ceil(oy / ch) * ch;
        for (let x = x0; x < largeur; x += cl) {
          for (let y = y0; y < hauteur; y += ch) poser(x, y, cl, ch);
        }
      });
      return;
    }
    let m = motifs.get(g);
    if (m === undefined || m.ctx !== ctx) {
      m = { ctx, motif: ctx.createPattern(source, 'repeat') };
      motifs.set(g, m);
    }
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = m.motif;
    // le motif suit le repère courant : décalé de (ox, oy) en le remplissant depuis là
    ctx.translate(ox, oy);
    ctx.fillRect(-ox, -oy, largeur, hauteur);
    ctx.restore();
  }

  return { dessiner, tuiles, motif };
})();
