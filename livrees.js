// Livrées des écuries FICTIVES (module de données, pas une entité). Pour chaque écurie de
// Course.ECURIES (même nom), les teintes du design (design/ : « Palette et fiche technique de la
// scène », « Voiture — zoom coté et états ») en plus des trois couleurs de l'écurie (p1 corps,
// p2 bande, p3 liseré) : clair et foncé (dégradé de la carrosserie), numéro, casque, et la couleur
// d'interface (tour de classement, mini-carte, garages ; plus lisible que p1 pour Novaro, Aurel
// et Tessa). Aucun logo, aucune marque, aucun nom réel.
const Livrees = (() => {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const livree = (clair, fonce, numero, casque, ui) => ({ clair: rgb(clair), fonce: rgb(fonce), numero: rgb(numero), casque: rgb(casque), ui: rgb(ui) });
  const LIVREES = {
    Halden: livree('#7bb0ff', '#1846b8', '#ffffff', '#ffffff', '#2f7bff'),
    'Corsa Nera': livree('#ffb46a', '#cf5e08', '#15171b', '#ffd166', '#ff8a1f'),
    'Velis GP': livree('#62e3cc', '#0c8a75', '#0b2a33', '#e8fffb', '#19c3a6'),
    Kestrel: livree('#ffe066', '#bf9500', '#1b1b1b', '#1b1b1b', '#f2c200'),
    Ardent: livree('#f6f7f9', '#9aa1aa', '#1d1f24', '#00a3c7', '#d9dde3'),
    Moravia: livree('#e45a9f', '#850d49', '#ffffff', '#ffd1e6', '#c0186b'),
    Aurel: livree('#46b977', '#125f33', '#ffffff', '#d4af37', '#2fb36a'),
    Novaro: livree('#40549a', '#0e1838', '#ffffff', '#ff5a36', '#8fa6ff'),
    Sable: livree('#4a4c52', '#121316', '#c9a24a', '#c9a24a', '#c9a24a'),
    Tessa: livree('#b8714a', '#5a2f17', '#ffffff', '#f3e2c7', '#c9773f'),
  };

  // La livrée d'une écurie ({ nom, couleurs }) : son entrée, ou une livrée tirée de ses couleurs.
  function de(ecurie) {
    if (LIVREES[ecurie.nom]) return LIVREES[ecurie.nom];
    const [p1, p2] = ecurie.couleurs;
    const melange = (c, cible, t) => c.map((x, i) => Math.round(x + (cible[i] - x) * t));
    return { clair: melange(p1, [255, 255, 255], 0.35), fonce: melange(p1, [0, 0, 0], 0.35), numero: p2, casque: p2, ui: p1 };
  }

  // Couleur d'interface d'une écurie ([r, v, b]).
  function ui(ecurie) {
    return de(ecurie).ui;
  }

  return { LIVREES, de, ui };
})();
