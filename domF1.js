// Outils DOM de l'interface du circuit (module sans classe) : créer des éléments HTML et SVG, et
// n'écrire dans la page que ce qui a changé (texte, attribut, classe, style). Le design system
// (design/ : « Implémentation ») demande de ne jamais provoquer de reflow inutile : l'interface
// est mise à jour à 10 Hz (textes) ou 30 Hz (HUD), et seulement là où une valeur change.
const DomF1 = (() => {
  const SVG = 'http://www.w3.org/2000/svg';

  // Lettre et classe CSS des pneus (pastille « contour + lettre » du design system).
  const LETTRES_PNEUS = { TENDRE: 'S', MEDIUM: 'M', DUR: 'H', INTER: 'I', PLUIE: 'W' };
  // Couleurs des pneus (variables --tyre-* du design system).
  const COULEURS_PNEUS = { S: '#ff3b30', M: '#f5c518', H: '#f2f2f2', I: '#34c759', W: '#2f80ff' };

  function el(tag, classe = '', texte = null) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== null) e.textContent = texte;
    return e;
  }

  function svg(tag, attributs = {}) {
    const e = document.createElementNS(SVG, tag);
    for (const [nom, valeur] of Object.entries(attributs)) e.setAttribute(nom, String(valeur));
    return e;
  }

  function texte(e, valeur) {
    const s = String(valeur);
    if (e.textContent !== s) e.textContent = s;
  }

  function attribut(e, nom, valeur) {
    const s = String(valeur);
    if (e.getAttribute(nom) !== s) e.setAttribute(nom, s);
  }

  function classe(e, nom, actif) {
    if (e.classList.contains(nom) !== Boolean(actif)) e.classList.toggle(nom, Boolean(actif));
  }

  function style(e, propriete, valeur) {
    if (propriete.startsWith('--')) {
      if (e.style.getPropertyValue(propriete) !== valeur) e.style.setProperty(propriete, valeur);
    } else if (e.style[propriete] !== valeur) {
      e.style[propriete] = valeur;
    }
  }

  // Cacher un élément : l'attribut hidden pour le HTML ; un élément SVG l'ignore, il lui faut
  // display="none" (sans cela le « 1 » du leader, les clés et les croix de la mini-carte restent
  // visibles sur toutes les voitures).
  function cacher(e, cache) {
    const c = Boolean(cache);
    if (e.hidden !== c) e.hidden = c;
    if (e.namespaceURI === SVG || e.espace === SVG) attribut(e, 'display', c ? 'none' : 'inline');
  }

  // [r, v, b] -> « rgb(r, v, b) » ; avec alpha : « rgba(...) ».
  function rgb([r, v, b], alpha = null) {
    return alpha === null ? `rgb(${r}, ${v}, ${b})` : `rgba(${r}, ${v}, ${b}, ${alpha})`;
  }

  // Une couleur éclaircie vers le blanc (texte lisible sur fond sombre, comme « #ffb066 » pour
  // l'orange #ff8a1f dans la télémétrie du design).
  function eclaircir([r, v, b], part = 0.35) {
    return [r, v, b].map(c => Math.round(c + (255 - c) * part));
  }

  function lettrePneu(type) {
    return LETTRES_PNEUS[type] ?? 'M';
  }

  // Écart signé au format du design : « +1.284 », « −0.747 » (vrai signe moins).
  function ecartSigne(secondes, decimales = 3) {
    if (secondes === null || !Number.isFinite(secondes)) return '—';
    const signe = secondes < 0 ? '−' : '+';
    return `${signe}${Math.abs(secondes).toFixed(decimales)}`;
  }

  return { SVG, LETTRES_PNEUS, COULEURS_PNEUS, el, svg, texte, attribut, classe, style, cacher, rgb, eclaircir, lettrePneu, ecartSigne };
})();
