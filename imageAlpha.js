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

  return { dessiner, tuiles };
})();
