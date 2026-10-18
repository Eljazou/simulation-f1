// Décor du circuit : il ne bouge pas, ce n'est donc pas un Vehicle. Tout est dessiné UNE FOIS
// dans un p5.Graphics, puis seulement recopié à chaque image. Il n'est redessiné que si le
// circuit, la résolution ou une option de dessin change (redimensionnement, autre profil, cases
// « traces de gomme » ou « ombres », autres écuries). Chaque palette (jour, nuit, pluie) a son
// propre graphique, gardé en mémoire : passer de l'une à l'autre ne redessine rien.
//
// Les calques suivent la fiche technique du design (design/ : « Palette et fiche technique de la
// scène », calques 1 à 17 ; le 19 est dessiné après les voitures par showEnHauteur) : chaque
// calque est le MÊME tracé (la ligne centrale) dessiné avec un trait plus ou moins large — mur,
// clôture, bande d'herbe, dégagements, vibreurs, ligne blanche, asphalte — sans calcul d'offset.
//
// Les placements (arbres, tribunes, graviers...) sont tirés avec une graine fixe : le même circuit
// donne toujours le même décor. Ils sont calculés à la construction, sans rien dessiner.
class DecorCircuit {
  static GRAINE = 31;
  // Herbe tondue (calque 1) : motif de 96 px, bandes de 48 px, tourné de -18°.
  static MOTIF_HERBE = 96;
  static BANDE_TONTE = 48;
  static ANGLE_TONTE = -18;
  // Espace libre mesuré de chaque côté de la piste jusqu'à cette distance du bord.
  static PORTEE_LIBRE = 130;
  // Bacs à gravier : à l'extérieur des virages plus serrés que ce rayon, profondeur maximale.
  static RAYON_GRAVIER = 220;
  static PROFONDEUR_GRAVIER = 60;
  static ARBRES = 170;
  static GRAIN_PISTE = 2600;
  // Largeurs des traits du design (pixels du monde), tous sur la ligne centrale.
  static TRAITS = { ombreMurs: 262, cloture: 256, mur: 249, herbe: 241, degagementCouleur: 226, degagementGris: 200,
    vibreur: 122, ligneBlanche: 107, asphalte: 100, reflet: 60, brillance: 40, ligneCourse: 30, gomme: 26, voie: 38, voieAsphalte: 33 };
  // Pneus empilés : rayon d'une pile (Ø 8,8) et distances à l'axe (deux rangées).
  static RAYON_PILE = 4.4;
  static DISTANCES_PILES = [103, 112];
  // Tribunes : de 78 à 118 px au-delà du bord (derrière le mur, qui est à 120 px de l'axe).
  static TRIBUNE = { pres: 78, loin: 118 };
  // Résolution du dessin : pixels du graphique par pixel du monde (bornes).
  static FACTEUR_MIN = 1;
  static FACTEUR_MAX = 2;
  // Panneaux publicitaires FICTIFS (mots inventés, aucune marque réelle) et leurs couleurs
  // [fond, texte] (design : calque 17, 112 × 12, texte 10 px).
  static PUBLICITES = ['KALIX', 'NORDA', 'VELTRA', 'ORBIS', 'MERAN'];
  static COULEURS_PUBLICITES = [['#e8e8e8', '#111111'], ['#1a3d7c', '#ffffff'], ['#111111', '#f2c200'], ['#e8e8e8', '#c8202e'], ['#111111', '#e8e8e8']];
  static COULEURS_FOULE = [[232, 232, 232], [208, 74, 58], [58, 111, 208], [242, 201, 76], [232, 232, 232], [58, 111, 208]];
  // Panneaux de freinage : distances (mètres) avant les deux gros freinages.
  static PANNEAUX_FREINAGE = [150, 100, 50];
  // Les trois palettes de la scène (design : tableau « Palette de la scène » et ambiances de la
  // maquette) ; teinte : voile posé sur tout ce qui n'est pas la piste (nuit, pluie).
  static PALETTES = {
    jour: { herbeA: '#2f5634', herbeB: '#294d2e', cloture: '#5b6066', mur: '#b9bbb7', ombreMurs: 0.35, degagementA: '#a3343a', degagementB: '#2f5fa6',
      degagementGris: '#555a61', gravier: '#c9b48a', gravierPoint: '#a8936a', blanc: '#eceef0', asphalte: '#4a4e55', reflet: '#5a5f66', ligneCourse: '#33363b',
      gomme: '#25272b', joint: '#3e4248', vibreurRouge: '#c8202e', vibreurBlanc: '#eef0f2', voie: '#40444a', garage: '#1c1e22', batiment: '#7c838c', toit: '#5d636b',
      vitres: 0.6, arbre: '#2b4a29', arbreReflet: '#3e6a37', gradins: '#3b3f45', foule: ['#e8e8e8', '#d04a3a', '#3a6fd0', '#f2c94c'], passerelle: '#9aa0a6',
      teinte: '#02050c', opaciteTeinte: 0, brillance: 0, flaques: 0, ombres: 0.5 },
    nuit: { herbeA: '#13241a', herbeB: '#102017', cloture: '#2f3338', mur: '#73766f', ombreMurs: 0.5, degagementA: '#5e2025', degagementB: '#1f3a66',
      degagementGris: '#33373d', gravier: '#6e634c', gravierPoint: '#574e3b', blanc: '#d4d7db', asphalte: '#2d3137', reflet: '#3a3f46', ligneCourse: '#1f2226',
      gomme: '#16181b', joint: '#272a2f', vibreurRouge: '#a01d27', vibreurBlanc: '#cfd2d6', voie: '#2a2e33', garage: '#3a3020', batiment: '#3d434b', toit: '#2e333a',
      vitres: 0.9, arbre: '#132514', arbreReflet: '#1d3a1e', gradins: '#22252a', foule: ['#bfc3c8', '#a83a2e', '#2f5aa8', '#c9a640'], passerelle: '#5d6268',
      teinte: '#02050c', opaciteTeinte: 0.35, brillance: 0.05, flaques: 0, ombres: 0.35 },
    pluie: { herbeA: '#2a4430', herbeB: '#253d2a', cloture: '#4d5157', mur: '#9a9d9a', ombreMurs: 0.25, degagementA: '#7e2c31', degagementB: '#2a4f86',
      degagementGris: '#454a51', gravier: '#9d8c69', gravierPoint: '#80714f', blanc: '#d9dcdf', asphalte: '#33373c', reflet: '#4a5866', ligneCourse: '#2a2d32',
      gomme: '#2a2d31', joint: '#2b2f34', vibreurRouge: '#a3222d', vibreurBlanc: '#d9dcdf', voie: '#33373d', garage: '#1c1e22', batiment: '#646b74', toit: '#4d535b',
      vitres: 0.5, arbre: '#25402a', arbreReflet: '#325a34', gradins: '#33373d', foule: ['#d5d9de', '#3a6fd0', '#c9cdd2', '#e0b84a'], passerelle: '#858b92',
      teinte: '#0b141c', opaciteTeinte: 0.18, brillance: 0.24, flaques: 0.28, ombres: 0.25 },
  };

  // « #rrggbb » -> [r, v, b] ; avec alpha (0 à 1) -> [r, v, b, a].
  static rgb(hex, alpha = null) {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return alpha === null ? c : [...c, Math.round(255 * alpha)];
  }

  // Bruit de valeur lissé, reproductible (comme noise() de p5, mais sans état global) : valeurs
  // aléatoires aux nœuds d'une grille, interpolées en douceur. Résultat entre 0 et 1.
  static bruit(x, y, graine = DecorCircuit.GRAINE) {
    const noeud = (i, j) => {
      let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(graine, 2147483647);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const i = Math.floor(x);
    const j = Math.floor(y);
    const lisse = t => t * t * (3 - 2 * t);
    const u = lisse(x - i);
    const v = lisse(y - j);
    const haut = noeud(i, j) + (noeud(i + 1, j) - noeud(i, j)) * u;
    const bas = noeud(i, j + 1) + (noeud(i + 1, j + 1) - noeud(i, j + 1)) * u;
    return haut + (bas - haut) * v;
  }

  // Distance au bord de la piste d'un spectateur (v de 0 à 1) : sur les gradins, devant le toit.
  static distanceSpectateur(v) {
    const { pres, loin } = DecorCircuit.TRIBUNE;
    return pres + 2 + v * ((loin - pres) * 0.7 - 4);
  }

  constructor(circuit) {
    this.circuit = circuit;
    this.graphique = null;
    this.graphiques = new Map();
    this.palette = 'jour';
    this.cle = '';
    // nombre de fois où le décor a été dessiné (il ne doit l'être qu'au changement)
    this.generations = 0;
    this.calculerEspaceLibre();
    this.calculerPlacements();
  }

  // Couleurs de la foule animée (foule.js), dans la palette courante.
  get couleursFoule() {
    const f = DecorCircuit.PALETTES[this.palette].foule.map(c => DecorCircuit.rgb(c));
    return [f[0], f[1], f[2], f[3], f[0], f[2]];
  }

  // libre[cote][i] : distance à la ligne centrale, du côté `cote` (+1 le long de la normale,
  // -1 de l'autre côté), jusqu'à laquelle on peut construire sans empiéter sur une autre partie
  // de la piste ni sortir du monde. Les points du tracé sont rangés par cases pour aller vite.
  calculerEspaceLibre() {
    const c = this.circuit;
    const demi = c.largeur / 2;
    const taille = 60;
    const cases = new Map();
    c.points.forEach((p, j) => {
      const cle = `${Math.floor(p.x / taille)};${Math.floor(p.y / taille)}`;
      if (!cases.has(cle)) cases.set(cle, []);
      cases.get(cle).push(j);
    });
    const plusProche = (x, y) => {
      let min = Infinity;
      const cx = Math.floor(x / taille);
      const cy = Math.floor(y / taille);
      for (let a = cx - 3; a <= cx + 3; a++) {
        for (let b = cy - 3; b <= cy + 3; b++) {
          for (const j of cases.get(`${a};${b}`) ?? []) min = Math.min(min, Math.hypot(c.points[j].x - x, c.points[j].y - y));
        }
      }
      return min;
    };
    this.libre = { '1': [], '-1': [] };
    for (const cote of [1, -1]) {
      for (let i = 0; i < c.n; i++) {
        let d = demi;
        while (d < demi + DecorCircuit.PORTEE_LIBRE) {
          const essai = d + 6;
          const p = c.pointLateral(i, cote * essai);
          const dansLeMonde = p.x > 10 && p.x < c.largeurMonde - 10 && p.y > 10 && p.y < c.hauteurMonde - 10;
          if (!dansLeMonde || plusProche(p.x, p.y) < essai - 1) break;
          d = essai;
        }
        this.libre[cote].push(d);
      }
    }
  }

  // Vrai si le point d'indice i est le long de la voie des stands (côté extérieur réservé).
  presDesStands(i) {
    const s = this.circuit.stands;
    return this.circuit.dansIntervalle(i, s.debut, s.fin);
  }

  // Graviers, rails, dégagements, tribunes, panneaux et arbres : où ils vont, sans les dessiner.
  calculerPlacements() {
    const c = this.circuit;
    const alea = Circuit.generateur(DecorCircuit.GRAINE + c.graine);
    const demi = c.largeur / 2;

    // dégagements (design : T1 et T6 en asphalte coloré, T7 et T8 en asphalte gris) : les deux
    // virages qui suivent les plus longues lignes droites (gros freinages), puis les deux plus
    // serrés des autres
    const droiteAvant = (v, k) => {
      const precedent = c.virages[(k - 1 + c.virages.length) % c.virages.length];
      return (v.debut - precedent.fin + c.n) % c.n;
    };
    const parDroite = c.virages.map((v, k) => ({ v, d: droiteAvant(v, k) })).sort((a, b) => b.d - a.d);
    this.freinages = parDroite.slice(0, 2).map(x => x.v);
    this.degagementsGris = c.virages.filter(v => !this.freinages.includes(v)).sort((a, b) => b.courbure - a.courbure).slice(0, 2);

    // bacs à gravier : à l'extérieur des virages serrés, de l'apex à un peu après la sortie
    this.graviers = [];
    c.virages.filter(v => v.courbure > 1 / DecorCircuit.RAYON_GRAVIER).forEach(virage => {
      const cote = -virage.sens;
      const tranche = [];
      for (let i = virage.apex - 6; i <= virage.fin + 10; i++) {
        const k = c.indice(i);
        if (cote === c.exterieur && this.presDesStands(k)) continue;
        const profondeur = Math.min(DecorCircuit.PROFONDEUR_GRAVIER, this.libre[cote][k] - demi - 14);
        if (profondeur > 12) tranche.push({ i: k, profondeur });
      }
      if (tranche.length > 3) this.graviers.push({ cote, tranche, virage });
    });

    // rail de sécurité : derrière les graviers, sinon à 30 px du bord, toujours dans l'espace libre
    // (il porte les panneaux publicitaires ; le mur de béton du design est dessiné à 120 px)
    this.rails = { '1': [], '-1': [] };
    for (const cote of [1, -1]) {
      for (let i = 0; i < c.n; i++) {
        const gravier = this.graviers.find(g => g.cote === cote && g.tranche.some(t => t.i === i));
        const profondeur = gravier ? gravier.tranche.find(t => t.i === i).profondeur + 10 : 30;
        const voulu = demi + 6 + profondeur;
        const possible = this.libre[cote][i] - 6;
        const bloque = cote === c.exterieur && this.presDesStands(i);
        this.rails[cote].push(bloque || possible < demi + 12 ? null : Math.min(voulu, possible));
      }
      // lissage : le rail ne fait pas de marches d'un point à l'autre
      for (let passe = 0; passe < 3; passe++) {
        const r = this.rails[cote];
        this.rails[cote] = r.map((d, i) => {
          if (d === null) return null;
          const voisins = [r[(i - 1 + c.n) % c.n], d, r[(i + 1) % c.n]].filter(v => v !== null);
          return Math.min(d, voisins.reduce((s, v) => s + v, 0) / voisins.length);
        });
      }
    }

    // tribunes : derrière le mur (TRIBUNE.pres à TRIBUNE.loin au-delà du bord), là où il y a la
    // place, espacées
    this.tribunes = [];
    const longueur = 14;
    for (const cote of [-c.exterieur, c.exterieur]) {
      for (let i = 0; i < c.n && this.tribunes.length < 5; i += 4) {
        if (cote === c.exterieur && this.presDesStands(i)) continue;
        const debut = i;
        let assez = true;
        for (let k = 0; k < longueur; k++) {
          if (this.libre[cote][c.indice(debut + k)] < demi + DecorCircuit.TRIBUNE.loin + 2) assez = false;
        }
        const loin = this.tribunes.every(t => Math.min(Math.abs(t.debut - debut), c.n - Math.abs(t.debut - debut)) > 60);
        if (assez && loin) this.tribunes.push({ cote, debut, longueur, foule: Array.from({ length: 160 }, () => [alea(), alea(), Math.floor(alea() * 6)]) });
      }
    }

    // panneaux publicitaires (112 px) le long des lignes droites, côté extérieur des zones DRS
    this.panneaux = [];
    const pasPanneaux = Math.round(136 / c.pas);
    c.zonesDRS.forEach((zone, z) => {
      for (let i = zone.debut, rang = 0; i !== zone.fin; i = (i + 1) % c.n, rang++) {
        if (rang % pasPanneaux !== 0) continue;
        const cote = c.exterieur === 1 && this.presDesStands(i) ? -1 : 1;
        const rail = this.rails[cote][i];
        if (rail === null) continue;
        const n = z * 3 + rang / pasPanneaux;
        this.panneaux.push({ i, cote, distance: rail + 8, texte: DecorCircuit.PUBLICITES[n % DecorCircuit.PUBLICITES.length], couleurs: n % DecorCircuit.COULEURS_PUBLICITES.length });
      }
    });

    // arbres (rayon 12 à 24) : au hasard, derrière les murs, loin des stands et des tribunes
    this.arbres = [];
    const voie = c.stands.points;
    for (let essai = 0; essai < DecorCircuit.ARBRES * 8 && this.arbres.length < DecorCircuit.ARBRES; essai++) {
      const x = 20 + alea() * (c.largeurMonde - 40);
      const y = 20 + alea() * (c.hauteurMonde - 40);
      const rayon = 12 + alea() * 12;
      const k = c.projeter(x, y);
      if (Math.hypot(c.points[k].x - x, c.points[k].y - y) < demi + 75 + rayon) continue;
      if (voie.some(p => Math.hypot(p.x - x, p.y - y) < 150)) continue;
      if (this.tribunes.some(t => {
        const centre = c.pointLateral(t.debut + t.longueur / 2, t.cote * (demi + 98));
        return Math.hypot(centre.x - x, centre.y - y) < 100;
      })) continue;
      this.arbres.push({ x, y, rayon, teinte: alea() });
    }

    // flaques (pluie) : quelques ellipses au bord de la piste
    this.flaques = Array.from({ length: 6 }, () => {
      const i = Math.floor(alea() * c.n);
      return { i, lateral: (alea() < 0.5 ? -1 : 1) * (demi - 12 - alea() * 14), rx: 18 + alea() * 28, ry: 7 + alea() * 3 };
    });
  }

  // Facteur de résolution pour une échelle de caméra donnée : assez de pixels pour la vue
  // d'ensemble et un peu de zoom, sans dépasser FACTEUR_MAX (mémoire).
  static facteurPour(echelle) {
    return Math.min(DecorCircuit.FACTEUR_MAX, Math.max(DecorCircuit.FACTEUR_MIN, Math.ceil(echelle * 2) / 2));
  }

  // Prépare le graphique de la palette demandée s'il n'existe pas ou si quelque chose a changé.
  // options : facteur, gomme, ombres, couleurs (couleur de l'écurie de chaque box), foule (false :
  // tribunes vides, la foule animée est dessinée à part, voir foule.js), palette ('jour', 'nuit',
  // 'pluie'), textesSol (numéros de grille et « DRS » ; masqués sous l'échelle 0,75 du design).
  preparer({ facteur = 1, gomme = true, ombres = true, couleurs = [], foule = true, palette = 'jour', textesSol = true } = {}) {
    if (!DecorCircuit.PALETTES[palette]) throw new RangeError(`Palette inconnue : ${palette}.`);
    // un graphique par palette ET par facteur de résolution : changer de caméra (vue d'ensemble,
    // suivi zoomé) ne redessine rien une fois les deux préparés
    const cle = JSON.stringify([gomme, ombres, couleurs, foule, textesSol]);
    if (cle !== this.cle) {
      // une option change : tous les graphiques sont libérés
      for (const g of this.graphiques.values()) if (g.remove) g.remove();
      this.graphiques.clear();
      this.cle = cle;
    }
    this.palette = palette;
    const nom = `${palette}|${facteur}`;
    // le navigateur peut libérer le contexte d'un grand canvas (mémoire) : il est alors redessiné
    const existant = this.graphiques.get(nom);
    const ctx = existant?.drawingContext;
    if (existant && ctx && typeof ctx === 'object' && typeof ctx.isContextLost === 'function' && ctx.isContextLost()) {
      if (existant.remove) existant.remove();
      this.graphiques.delete(nom);
    }
    if (this.graphiques.has(nom)) {
      this.graphique = this.graphiques.get(nom);
      return false;
    }
    const c = this.circuit;
    const g = createGraphics(Math.ceil(c.largeurMonde * facteur), Math.ceil(c.hauteurMonde * facteur));
    g.pixelDensity(1);
    g.scale(facteur);
    this.facteur = facteur;
    this.dessiner(g, { gomme, ombres, couleurs, foule, textesSol, P: DecorCircuit.PALETTES[palette], palette });
    this.graphiques.set(nom, g);
    this.graphique = g;
    this.generations++;
    return true;
  }

  // À chaque image : seulement la copie du graphique précalculé (opacite < 1 : fondu d'une
  // palette sur une autre, pendant une transition jour/nuit ou sec/pluie).
  show(opacite = 1) {
    if (this.graphique === null) return;
    ImageAlpha.dessiner(this.graphique, opacite, 0, 0, this.circuit.largeurMonde, this.circuit.hauteurMonde);
  }

  // Les abords du monde (au-delà du graphique) : la même herbe tondue, dessinée à chaque image en
  // quelques bandes (le cadrage sur le circuit peut montrer un peu au-delà du bord du monde).
  showAbords(marge = 1200) {
    const c = this.circuit;
    const P = DecorCircuit.PALETTES[this.palette];
    const L = c.largeurMonde;
    const H = c.hauteurMonde;
    push();
    noStroke();
    fill(...DecorCircuit.rgb(P.herbeA));
    rect(-marge, -marge, L + 2 * marge, marge);
    rect(-marge, H, L + 2 * marge, marge);
    rect(-marge, 0, marge, H);
    rect(L, 0, marge, H);
    // bandes : même phase que le motif du décor (origine du monde, -18°)
    fill(...DecorCircuit.rgb(P.herbeB));
    rotate(DecorCircuit.ANGLE_TONTE * Math.PI / 180);
    const d = Math.hypot(L, H) + 2 * marge;
    for (let x = -Math.ceil(d / DecorCircuit.MOTIF_HERBE) * DecorCircuit.MOTIF_HERBE; x < d; x += DecorCircuit.MOTIF_HERBE) {
      rect(x, -d, DecorCircuit.BANDE_TONTE, 2 * d);
    }
    pop();
  }

  // Version sans décor (case décochée) : fond uni et piste, dessinés directement.
  showSimple() {
    const c = this.circuit;
    push();
    noStroke();
    fill(40, 70, 40);
    rect(0, 0, c.largeurMonde, c.hauteurMonde);
    this.tracer(null, c.points, [70, 72, 76], c.largeur);
    this.tracer(null, c.stands.points, [80, 82, 86], 30, false);
    pop();
  }

  // Une polyligne épaisse (piste, voie), sur le graphique `g`, ou directement à l'écran si g
  // est null (fonctions globales de p5).
  tracer(g, points, couleur, epaisseur, fermee = true) {
    const d = g ?? globalThis;
    d.noFill();
    d.stroke(...couleur);
    d.strokeWeight(epaisseur);
    d.strokeJoin(ROUND);
    d.beginShape();
    points.forEach(p => d.vertex(p.x, p.y));
    if (fermee) d.endShape(CLOSE);
    else d.endShape();
  }

  // --- Outils de dessin du design (flou, tirets, motifs) : sur un vrai contexte 2D seulement ;
  // dans les tests (graphique factice), le dessin se fait sans ces effets.

  static contexte(g) {
    const ctx = g.drawingContext;
    return ctx && typeof ctx.setLineDash === 'function' && typeof ctx.createPattern === 'function' ? ctx : null;
  }

  // Dessine `dessin` avec un flou gaussien de `px` pixels du monde.
  flou(g, px, dessin) {
    const ctx = DecorCircuit.contexte(g);
    if (ctx !== null) ctx.filter = `blur(${px * (this.facteur ?? 1)}px)`;
    dessin();
    if (ctx !== null) ctx.filter = 'none';
  }

  // Tirets (longueurs en pixels du monde), ou trait plein (null).
  static tirets(g, motif) {
    const ctx = DecorCircuit.contexte(g);
    if (ctx !== null) ctx.setLineDash(motif ?? []);
  }

  // Un motif du design (herbe tondue, gravier, gradins, toit) comme style de remplissage ou de
  // trait ; sans vrai contexte, null (la couleur de base est alors utilisée).
  motif(g, nom, P) {
    const ctx = DecorCircuit.contexte(g);
    if (ctx === null || typeof document === 'undefined') return null;
    const toile = document.createElement('canvas');
    const t = toile.getContext('2d');
    if (nom === 'herbe') {
      toile.width = DecorCircuit.MOTIF_HERBE;
      toile.height = DecorCircuit.MOTIF_HERBE;
      t.fillStyle = P.herbeA;
      t.fillRect(0, 0, toile.width, toile.height);
      t.fillStyle = P.herbeB;
      t.fillRect(0, 0, DecorCircuit.BANDE_TONTE, toile.height);
    } else if (nom === 'gravier') {
      toile.width = 6;
      toile.height = 6;
      t.fillStyle = P.gravier;
      t.fillRect(0, 0, 6, 6);
      t.fillStyle = P.gravierPoint;
      t.beginPath(); t.arc(1.5, 1.5, 0.8, 0, 2 * Math.PI); t.arc(4.5, 4, 0.7, 0, 2 * Math.PI); t.fill();
    } else if (nom === 'gradins') {
      toile.width = 7;
      toile.height = 7;
      t.fillStyle = P.gradins;
      t.fillRect(0, 0, 7, 7);
      [[1.8, 1.8, 1.4], [5.3, 2.4, 1.4], [2.6, 5.4, 1.4], [5.9, 5.8, 1.3]].forEach(([x, y, r], k) => {
        t.fillStyle = P.foule[k];
        t.beginPath(); t.arc(x, y, r, 0, 2 * Math.PI); t.fill();
      });
    } else {
      toile.width = 8;
      toile.height = 8;
      t.fillStyle = P.toit;
      t.fillRect(0, 0, 8, 8);
      t.fillStyle = 'rgba(0,0,0,0.18)';
      t.fillRect(0, 0, 8, 1.2);
    }
    const m = ctx.createPattern(toile, 'repeat');
    if (nom === 'herbe' && typeof m.setTransform === 'function' && typeof DOMMatrix === 'function') {
      m.setTransform(new DOMMatrix().rotate(DecorCircuit.ANGLE_TONTE));
    }
    return m;
  }

  // Un angle de texte « à l'endroit » (jamais tête en bas) : retourné d'un demi-tour si besoin.
  static lisible(angle) {
    return Math.cos(angle) < 0 ? angle + Math.PI : angle;
  }

  // Espacement des lettres (letter-spacing du design), si le contexte le permet.
  static espacement(g, px) {
    const ctx = g === null ? globalThis.drawingContext : g.drawingContext;
    if (ctx && typeof ctx === 'object' && 'letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
  }

  // Remplit (ou trace) avec un motif si possible, sinon avec sa couleur de base.
  static avecMotif(g, motif, trait = false) {
    if (motif === null) return;
    const ctx = DecorCircuit.contexte(g);
    if (trait) ctx.strokeStyle = motif;
    else ctx.fillStyle = motif;
  }

  // Les points de la ligne centrale de l'indice `debut` à `fin` (circulaire).
  troncon(debut, fin, decalage = 0) {
    const c = this.circuit;
    const pts = [];
    const longueur = (c.indice(fin) - c.indice(debut) + c.n) % c.n;
    for (let k = 0; k <= longueur; k++) pts.push(decalage === 0 ? c.points[c.indice(debut + k)] : c.pointLateral(c.indice(debut + k), decalage));
    return pts;
  }

  // Un trait le long d'un tronçon (ou de tout le tracé), avec ses options : couleur, largeur,
  // tirets, extrémités, motif.
  trait(g, points, couleur, largeur, { fermee = false, tirets = null, bouts = SQUARE, motif = null } = {}) {
    g.noFill();
    g.stroke(...couleur);
    g.strokeWeight(largeur);
    g.strokeJoin(ROUND);
    g.strokeCap(bouts);
    DecorCircuit.tirets(g, tirets);
    DecorCircuit.avecMotif(g, motif, true);
    g.beginShape();
    points.forEach(p => g.vertex(p.x, p.y));
    if (fermee) g.endShape(CLOSE);
    else g.endShape();
    DecorCircuit.tirets(g, null);
  }

  // Tout le décor, dans l'ordre des calques du design (1 à 17).
  dessiner(g, { gomme, ombres, couleurs, foule = true, textesSol = true, P }) {
    const c = this.circuit;
    const T = DecorCircuit.TRAITS;
    const rgb = DecorCircuit.rgb;
    const demi = c.largeur / 2;
    const alea = Circuit.generateur(DecorCircuit.GRAINE * 7 + c.graine);
    const herbe = this.motif(g, 'herbe', P);
    const tout = c.points;

    // 1. herbe tondue : deux tons, bandes de 48 px tournées de -18°
    g.noStroke();
    g.fill(...rgb(P.herbeA));
    DecorCircuit.avecMotif(g, herbe);
    g.rect(0, 0, c.largeurMonde, c.hauteurMonde);
    if (herbe === null) {
      // sans motif : les bandes, dessinées une à une
      g.push();
      g.translate(c.largeurMonde / 2, c.hauteurMonde / 2);
      g.rotate(DecorCircuit.ANGLE_TONTE * Math.PI / 180);
      g.fill(...rgb(P.herbeB));
      const d = Math.hypot(c.largeurMonde, c.hauteurMonde);
      for (let x = -d; x < d; x += DecorCircuit.MOTIF_HERBE) g.rect(x, -d, DecorCircuit.BANDE_TONTE, 2 * d);
      g.pop();
    }

    // 2 à 5. ombre des murs, clôture, mur de béton (bande de 4 px à 120 px de l'axe), bande d'herbe
    if (ombres) {
      g.push();
      g.translate(5, 7);
      this.flou(g, 5, () => this.trait(g, tout, [0, 0, 0, 255 * P.ombreMurs], T.ombreMurs, { fermee: true }));
      g.pop();
    }
    this.trait(g, tout, rgb(P.cloture), T.cloture, { fermee: true, tirets: [1.5, 4] });
    this.trait(g, tout, rgb(P.mur), T.mur, { fermee: true });
    this.trait(g, tout, rgb(P.herbeA), T.herbe, { fermee: true, motif: herbe });

    // 6 et 7. dégagements : asphalte coloré (rouge + tirets bleus 22/22) aux deux gros freinages,
    // asphalte gris (bouts ronds) aux deux virages les plus serrés
    for (const v of this.freinages) {
      const pts = this.troncon(v.debut - 4, v.fin + 4);
      this.trait(g, pts, rgb(P.degagementA), T.degagementCouleur);
      this.trait(g, pts, rgb(P.degagementB), T.degagementCouleur, { tirets: [22, 22] });
    }
    for (const v of this.degagementsGris) this.trait(g, this.troncon(v.debut - 2, v.fin + 2), rgb(P.degagementGris), T.degagementGris, { bouts: ROUND });

    // 8. bacs à gravier (hors dégagements) : de 64 px de l'axe à leur profondeur, motif de points
    const gravier = this.motif(g, 'gravier', P);
    const enDegagement = virage => this.freinages.includes(virage) || this.degagementsGris.includes(virage);
    this.graviers.filter(gr => !enDegagement(gr.virage)).forEach(({ cote, tranche }) => {
      g.fill(...rgb(P.gravier));
      DecorCircuit.avecMotif(g, gravier);
      g.stroke(...rgb(P.gravierPoint));
      g.strokeWeight(1.5);
      g.beginShape();
      tranche.forEach(t => { const p = c.pointLateral(t.i, cote * (demi + 14)); g.vertex(p.x, p.y); });
      tranche.slice().reverse().forEach(t => { const p = c.pointLateral(t.i, cote * (demi + 4 + t.profondeur)); g.vertex(p.x, p.y); });
      g.endShape(CLOSE);
      g.noStroke();
    });
    // flaques (pluie)
    if (P.flaques > 0) {
      g.noStroke();
      g.fill(...rgb('#9fc0dc', P.flaques));
      this.flaques.forEach(f => {
        const p = c.pointLateral(f.i, f.lateral);
        const t = c.tangentes[f.i];
        g.push();
        g.translate(p.x, p.y);
        g.rotate(Math.atan2(t.y, t.x));
        g.ellipse(0, 0, 2 * f.rx, 2 * f.ry);
        g.pop();
      });
    }

    // 9. voie des stands, muret, garages, bâtiment
    this.dessinerStands(g, couleurs, ombres, P);

    // 10. décor : tribunes, arbres, puis la teinte (nuit, pluie) sur tout ce qui n'est pas la piste
    this.dessinerTribunes(g, ombres, foule, P);
    g.noStroke();
    this.arbres.forEach(arbre => {
      if (ombres) this.flou(g, 3, () => { g.fill(0, 0, 0, 0.38 * 255); g.circle(arbre.x + 7, arbre.y + 9, arbre.rayon * 2); });
      g.fill(...rgb(P.arbre));
      g.circle(arbre.x, arbre.y, arbre.rayon * 2);
      g.fill(...rgb(P.arbreReflet, 0.85));
      g.circle(arbre.x - arbre.rayon * 0.28, arbre.y - arbre.rayon * 0.28, arbre.rayon * 1.1);
    });
    if (P.opaciteTeinte > 0) {
      g.fill(...rgb(P.teinte, P.opaciteTeinte));
      g.rect(0, 0, c.largeurMonde, c.hauteurMonde);
    }

    // 11. vibreurs : aux virages seulement, trait 122, tirets rouges 10/10 sur blanc
    c.virages.forEach(v => {
      const pts = this.troncon(v.debut, v.fin);
      this.trait(g, pts, rgb(P.vibreurBlanc), T.vibreur);
      this.trait(g, pts, rgb(P.vibreurRouge), T.vibreur, { tirets: [10, 10] });
    });
    // 12 et 13. ligne blanche (3,5 px visibles de chaque côté), asphalte, reflet, grain
    this.trait(g, tout, rgb(P.blanc), T.ligneBlanche, { fermee: true });
    this.trait(g, tout, rgb(P.asphalte), T.asphalte, { fermee: true });
    this.flou(g, 9, () => this.trait(g, tout, rgb(P.reflet, 0.5), T.reflet, { fermee: true }));
    g.noStroke();
    for (let k = 0; k < DecorCircuit.GRAIN_PISTE; k++) {
      const p = c.pointLateral(alea() * c.n, (alea() - 0.5) * (c.largeur - 6));
      const clair = alea() < 0.5;
      g.fill(...(clair ? [255, 255, 255, 0.09 * 255 * 1.6] : [0, 0, 0, 0.16 * 255 * 1.6]));
      g.circle(p.x, p.y, 1.2 + alea() * 1.2);
    }

    // 14. ligne de course (trait 30, flou 3, 55 %) et gomme en entrée de virage (26 px)
    if (gomme) {
      this.flou(g, 3, () => {
        this.trait(g, c.ligne, rgb(P.ligneCourse, 0.55), T.ligneCourse, { fermee: true });
        c.virages.forEach(v => {
          const pts = [];
          for (let i = v.debut - 10; i <= v.apex; i++) pts.push(c.ligne[c.indice(i)]);
          this.trait(g, pts, rgb(P.gomme, 0.45), T.gomme, { bouts: ROUND });
        });
      });
    }

    // 15. traces de freinage (2,4 px), joints (3 px), billes hors trajectoire (Ø 2,6)
    this.freinages.concat(this.degagementsGris).forEach(v => {
      for (let k = 0; k < 3; k++) {
        const pts = [];
        const longueur = 18 + k * 3;
        for (let j = 0; j <= longueur; j++) {
          const i = c.indice(v.debut - longueur + j);
          const ecart = c.ecartLateral(c.ligne[i].x, c.ligne[i].y, i);
          pts.push(c.pointLateral(i, ecart + (k - 1) * 6 + Math.sin(j * 0.3 + k) * 2));
        }
        this.trait(g, pts, [14, 15, 17, 255 * (0.22 + k * 0.06)], 2.4, { bouts: ROUND });
      }
    });
    g.noStroke();
    g.fill(...rgb(P.joint, 0.6));
    // joints de dalles en travers de la ligne droite des stands
    for (const part of [0.03, 0.06]) {
      const i = c.indice(-Math.round(c.n * part));
      const t = c.tangentes[i];
      g.push();
      g.translate(c.points[i].x, c.points[i].y);
      g.rotate(Math.atan2(t.y, t.x));
      g.rect(-1.5, -demi + 1, 3, c.largeur - 2);
      g.pop();
    }
    g.fill(20, 21, 24, 0.75 * 255);
    c.virages.forEach(v => {
      for (let k = 0; k < 9; k++) {
        const i = c.indice(v.apex + Math.floor(alea() * 12));
        const p = c.pointLateral(i, -v.sens * (36 + alea() * 12));
        g.circle(p.x, p.y, 2.6);
      }
    });
    // brillance de la piste mouillée (trait 40 #bcd6ee, flou 9)
    if (P.brillance > 0) this.flou(g, 9, () => this.trait(g, tout, rgb('#bcd6ee', P.brillance), T.brillance, { fermee: true }));

    // 16. marquages : grille, damier, lignes DRS
    this.dessinerMarquages(g, textesSol);

    // 17. bordures : pneus empilés, panneaux de freinage, publicités
    this.dessinerBordures(g);
  }

  // Grille (équerres 9 × 30 et numéros), ligne d'arrivée (damier 2 × 20 carrés de 5 px), lignes
  // DRS (tirets 6/4) et leur inscription.
  dessinerMarquages(g, textesSol) {
    const c = this.circuit;
    const demi = c.largeur / 2;
    g.noFill();
    g.stroke(255, 255, 255, 0.85 * 255);
    g.strokeWeight(2.4);
    for (let rang = 0; rang < 20; rang++) {
      const place = c.emplacementGrille(rang);
      const t = c.tangentes[place.indice];
      const n = c.normales[place.indice];
      const av = { x: place.x + t.x * (VoitureF1.LONGUEUR / 2 + 4), y: place.y + t.y * (VoitureF1.LONGUEUR / 2 + 4) };
      const p = (a, b) => ({ x: av.x - t.x * a + n.x * b, y: av.y - t.y * a + n.y * b });
      g.beginShape();
      [p(9, -15), p(0, -15), p(0, 15), p(9, 15)].forEach(q => g.vertex(q.x, q.y));
      g.endShape();
      if (textesSol) {
        const q = p(18, 0);
        g.push();
        g.noStroke();
        g.fill(255, 255, 255, 0.6 * 255);
        g.translate(q.x, q.y);
        g.rotate(DecorCircuit.lisible(Math.atan2(t.y, t.x)));
        g.textAlign(CENTER, CENTER);
        g.textStyle(BOLD);
        g.textSize(10);
        g.text(String(rang + 1), 0, 0);
        g.pop();
      }
    }
    // damier : 2 colonnes le long de la piste, 20 carrés de 5 px en travers (toute la largeur)
    g.noStroke();
    const t0 = c.tangentes[0];
    g.push();
    g.translate(c.points[0].x, c.points[0].y);
    g.rotate(Math.atan2(t0.y, t0.x));
    for (let col = 0; col < 2; col++) {
      for (let r = 0; r < 20; r++) {
        g.fill(...((r + col) % 2 ? [17, 17, 17] : [255, 255, 255]));
        g.rect(col * 5, -demi + r * 5, 5, 5);
      }
    }
    g.pop();
    // zones DRS : une ligne en tirets en travers au début de chaque zone, « DRS » au sol
    c.zonesDRS.forEach(z => {
      const i = z.debut;
      const t = c.tangentes[i];
      g.push();
      g.translate(c.points[i].x, c.points[i].y);
      g.rotate(Math.atan2(t.y, t.x));
      g.stroke(255, 255, 255, 0.55 * 255);
      g.strokeWeight(2);
      DecorCircuit.tirets(g, [6, 4]);
      g.line(0, -demi + 1, 0, demi - 1);
      DecorCircuit.tirets(g, null);
      if (textesSol) {
        g.noStroke();
        g.fill(255, 255, 255, 0.42 * 255);
        // à l'endroit pour qui regarde l'écran (design : le second « DRS » est retourné)
        if (Math.cos(Math.atan2(t.y, t.x)) < 0) g.rotate(Math.PI);
        g.textAlign(LEFT, CENTER);
        g.textStyle(BOLD);
        g.textSize(20);
        DecorCircuit.espacement(g, 3);
        g.text('DRS', 26, demi - 16);
        DecorCircuit.espacement(g, 0);
      }
      g.pop();
    });
  }

  // Les pneus empilés (Ø 8,8, à 103 et 112 px de l'axe) à l'extérieur des dégagements et des
  // graviers : [{ k (indice du point), cote, d (distance à l'axe) }]. Dessinés, et murs pour la
  // détection des accidents (murs).
  pilesDePneus() {
    if (this.piles) return this.piles;
    const c = this.circuit;
    const pas = Math.max(1, Math.round(9 / c.pas));
    const piles = [];
    const pneus = v => {
      const cote = -v.sens;
      for (let i = v.debut; c.indice(i - v.debut) <= c.indice(v.fin + 6 - v.debut); i += pas) {
        const k = c.indice(i);
        if (cote === c.exterieur && this.presDesStands(k)) continue;
        for (const d of DecorCircuit.DISTANCES_PILES) {
          if (this.libre[cote][k] < d + 6) continue;
          piles.push({ k, cote, d });
        }
      }
    };
    this.freinages.concat(this.degagementsGris).forEach(pneus);
    this.graviers.forEach(gr => pneus(gr.virage));
    this.piles = piles;
    return piles;
  }

  // Ce que la voiture du joueur peut heurter, de chaque côté, en chaque point : la distance à l'axe
  // du premier obstacle (rail, ou bord intérieur d'une pile de pneus), null s'il n'y en a pas.
  get murs() {
    if (this.mursCalcules) return this.mursCalcules;
    const c = this.circuit;
    const pas = Math.max(1, Math.round(9 / c.pas));
    // les rails ne sont pas dessinés : jamais plus près que le mur dessiné (bord de l'herbe)
    const dessine = DecorCircuit.TRAITS.herbe / 2;
    const derriere = r => (r === null || r === undefined ? r : Math.max(r, dessine));
    const murs = { '1': this.rails['1'].map(derriere), '-1': this.rails['-1'].map(derriere) };
    for (const { k, cote, d } of this.pilesDePneus()) {
      for (let q = 0; q < pas; q++) {
        const i = c.indice(k + q);
        const bord = d - DecorCircuit.RAYON_PILE;
        const m = murs[String(cote)][i];
        murs[String(cote)][i] = m === null || m === undefined ? bord : Math.min(m, bord);
      }
    }
    this.mursCalcules = murs;
    return murs;
  }

  // Pneus empilés, panneaux de freinage (24 × 14 : 150, 100, 50 m) avant les gros freinages,
  // publicités.
  dessinerBordures(g) {
    const c = this.circuit;
    g.fill(22, 23, 26);
    g.stroke(74, 77, 82);
    g.strokeWeight(1.6);
    this.pilesDePneus().forEach(({ k, cote, d }) => {
      const p = c.pointLateral(k, cote * d);
      g.circle(p.x, p.y, 2 * DecorCircuit.RAYON_PILE);
    });
    // panneaux de freinage : à 72 px de l'axe, du côté extérieur du virage
    g.textAlign(CENTER, CENTER);
    g.textStyle(BOLD);
    g.textSize(10);
    this.freinages.forEach(v => {
      for (const metres of DecorCircuit.PANNEAUX_FREINAGE) {
        const i = c.indice(v.debut - Math.round(metres / Circuit.METRES_PAR_PX / c.pas));
        const cote = -v.sens;
        if (this.libre[cote][i] < 80) continue;
        const p = c.pointLateral(i, cote * 72);
        const t = c.tangentes[i];
        g.push();
        g.translate(p.x, p.y);
        g.rotate(DecorCircuit.lisible(Math.atan2(t.y, t.x)));
        g.stroke(26, 26, 26);
        g.strokeWeight(1);
        g.fill(242, 242, 242);
        g.rect(-12, -7, 24, 14, 1.5);
        g.noStroke();
        g.fill(17, 17, 17);
        g.text(String(metres), 0, 0.5);
        g.pop();
      }
    });
    // publicités fictives : 112 × 12, texte 10 px
    this.panneaux.forEach(panneau => {
      const p = c.pointLateral(panneau.i, panneau.cote * panneau.distance);
      const t = c.tangentes[panneau.i];
      const [fond, texte] = DecorCircuit.COULEURS_PUBLICITES[panneau.couleurs];
      g.push();
      g.translate(p.x, p.y);
      g.rotate(DecorCircuit.lisible(Math.atan2(t.y, t.x)));
      g.noStroke();
      g.fill(...DecorCircuit.rgb(fond));
      g.rect(-56, -6, 112, 12);
      g.fill(...DecorCircuit.rgb(texte));
      DecorCircuit.espacement(g, 2.5);
      g.text(panneau.texte, 0, 0.5);
      DecorCircuit.espacement(g, 0);
      g.pop();
    });
    g.noStroke();
  }

  // Voie des stands (trait 38 blanc + 33 asphalte), muret (5 px), garages (couleur de l'écurie en
  // haut, emplacement teinté et numéro), bâtiment au toit à motif.
  dessinerStands(g, couleurs, ombres, P) {
    const c = this.circuit;
    const s = c.stands;
    const demi = c.largeur / 2;
    const rgb = DecorCircuit.rgb;
    this.trait(g, s.points, rgb(P.blanc), DecorCircuit.TRAITS.voie, { bouts: ROUND });
    this.trait(g, s.points, rgb(P.voie), DecorCircuit.TRAITS.voieAsphalte, { bouts: ROUND });
    // muret entre la piste et la voie, sur la partie droite
    const muret = [];
    for (let k = s.premierBox - 6; k <= s.dernierBox + 6; k++) muret.push(c.pointLateral(s.indicesPiste[k], c.exterieur * (demi + 20)));
    if (ombres) {
      g.push();
      g.translate(2, 3);
      this.trait(g, muret, [0, 0, 0, 0.3 * 255], 6);
      g.pop();
    }
    this.trait(g, muret, rgb(P.mur), 5);
    // garages : un par box, derrière la place d'arrêt ; emplacement teinté sur la voie
    g.noStroke();
    const tangente = s.tangentes[Math.round((s.premierBox + s.dernierBox) / 2)];
    const angle = Math.atan2(tangente.y, tangente.x);
    const ecart = s.boxes.length > 1 ? Math.hypot(s.boxes[1].x - s.boxes[0].x, s.boxes[1].y - s.boxes[0].y) : 44;
    const largeurGarage = Math.min(54, ecart - 2);
    s.boxes.forEach((box, rang) => {
      const n = c.normales[box.indicePiste];
      const couleur = couleurs[rang] ?? [120, 120, 120];
      g.push();
      g.translate(box.x, box.y);
      g.rotate(angle);
      g.fill(...couleur, 0.14 * 255);
      g.stroke(255, 255, 255, 0.45 * 255);
      g.strokeWeight(1);
      g.rect(-largeurGarage / 2 + 1, -13, largeurGarage - 2, 26);
      g.noStroke();
      g.pop();
      g.push();
      g.translate(box.x + n.x * c.exterieur * 42, box.y + n.y * c.exterieur * 42);
      g.rotate(angle + (c.exterieur > 0 ? 0 : Math.PI));
      g.fill(...rgb(P.garage));
      g.rect(-largeurGarage / 2, -26, largeurGarage, 52);
      g.fill(...couleur);
      g.rect(-largeurGarage / 2, -26, largeurGarage, 6);
      g.fill(255, 255, 255, 0.45 * 255);
      g.textAlign(CENTER, CENTER);
      g.textSize(9);
      g.text(String(rang + 1), 0, 18);
      g.pop();
    });
    // bâtiment des stands, derrière les garages : ombre, toit à motif, liseré clair
    const premier = s.boxes[0];
    const dernier = s.parking;
    const n = c.normales[premier.indicePiste];
    const decalage = c.exterieur * 70;
    const epaisseur = c.exterieur * 60;
    const coins = [
      { x: premier.x - tangente.x * 30 + n.x * decalage, y: premier.y - tangente.y * 30 + n.y * decalage },
      { x: dernier.x + tangente.x * 30 + n.x * decalage, y: dernier.y + tangente.y * 30 + n.y * decalage },
    ];
    const quad = (dx, dy, k = 1) => g.quad(coins[0].x + dx, coins[0].y + dy, coins[1].x + dx, coins[1].y + dy,
      coins[1].x + n.x * epaisseur * k + dx, coins[1].y + n.y * epaisseur * k + dy, coins[0].x + n.x * epaisseur * k + dx, coins[0].y + n.y * epaisseur * k + dy);
    if (ombres) this.flou(g, 5, () => { g.fill(0, 0, 0, 0.35 * 255); quad(8, 10); });
    g.fill(...rgb(P.toit));
    DecorCircuit.avecMotif(g, this.motif(g, 'toit', P));
    quad(0, 0);
    g.fill(255, 255, 255, 0.12 * 255);
    quad(0, 0, 0.07);
  }

  // Tribunes (derrière le mur) : ombre, gradins couverts de foule (motif), toit sur 30 % du côté
  // le plus loin de la piste, contour.
  dessinerTribunes(g, ombres, foule, P) {
    const c = this.circuit;
    const demi = c.largeur / 2;
    const { pres, loin } = DecorCircuit.TRIBUNE;
    const gradins = foule ? this.motif(g, 'gradins', P) : null;
    const toit = this.motif(g, 'toit', P);
    g.noStroke();
    this.tribunes.forEach(tribune => {
      const bord = d => [tribune.debut, tribune.debut + tribune.longueur].map(i => c.pointLateral(i, tribune.cote * (demi + d)));
      const [a, b] = bord(pres);
      const [d, e] = bord(loin);
      const [f, h] = bord(pres + (loin - pres) * 0.7);
      if (ombres) this.flou(g, 5, () => { g.fill(0, 0, 0, 0.4 * 255); g.quad(a.x + 9, a.y + 11, b.x + 9, b.y + 11, e.x + 9, e.y + 11, d.x + 9, d.y + 11); });
      g.fill(...DecorCircuit.rgb(P.gradins));
      DecorCircuit.avecMotif(g, gradins);
      g.quad(a.x, a.y, b.x, b.y, h.x, h.y, f.x, f.y);
      if (foule && gradins === null) {
        tribune.foule.forEach(([u, v, couleur]) => {
          const p = c.pointLateral(tribune.debut + u * tribune.longueur, tribune.cote * (demi + DecorCircuit.distanceSpectateur(v)));
          g.fill(...DecorCircuit.rgb(P.foule[couleur % 4]));
          g.circle(p.x, p.y, 2.6);
        });
      }
      g.fill(...DecorCircuit.rgb(P.toit));
      DecorCircuit.avecMotif(g, toit);
      g.quad(f.x, f.y, h.x, h.y, e.x, e.y, d.x, d.y);
      g.noFill();
      g.stroke(0, 0, 0, 0.35 * 255);
      g.strokeWeight(1.5);
      g.quad(a.x, a.y, b.x, b.y, e.x, e.y, d.x, d.y);
      g.noStroke();
    });
  }

  // Secteurs sous drapeau jaune (design : « Animations », drapeau jaune) : un aplat #f5c518 à 12 %
  // (trait de 120 px sur le tracé), qui clignote à 1 Hz (opacité 0,9 <-> 0,45). horloge en secondes.
  showSecteursJaunes(secteurs, horloge = 0) {
    if (secteurs.size === 0) return;
    const c = this.circuit;
    const clignote = Math.floor(horloge * 2) % 2 === 0 ? 0.9 : 0.45;
    push();
    noFill();
    stroke(245, 197, 24, 255 * 0.12 * clignote / 0.9);
    strokeWeight(120);
    strokeJoin(ROUND);
    strokeCap(SQUARE);
    [0, 1, 2].forEach(s => {
      if (!secteurs.has(s)) return;
      beginShape();
      this.troncon(c.secteurs[s], c.secteurs[(s + 1) % 3]).forEach(p => vertex(p.x, p.y));
      endShape();
    });
    pop();
  }

  // Calque 19, dessiné APRÈS les voitures (elles passent dessous) : portique des feux sur la
  // ligne (7 × 190, cinq feux) et passerelle au nom du circuit (24 × 212). feux : nombre de feux
  // rouges allumés (0 à 5), vert : feux verts (départ donné).
  showEnHauteur({ ombres = true, feux = 0, vert = false } = {}) {
    const c = this.circuit;
    const P = DecorCircuit.PALETTES[this.palette];
    const rgb = DecorCircuit.rgb;
    const element = (i, dessin) => {
      const k = c.indice(i);
      const t = c.tangentes[k];
      push();
      translate(c.points[k].x, c.points[k].y);
      rotate(Math.atan2(t.y, t.x));
      dessin();
      pop();
    };
    noStroke();
    // passerelle : à 200 px avant la ligne
    element(-Math.round(200 / c.pas), () => {
      if (ombres) {
        fill(0, 0, 0, 0.32 * 255);
        rect(-12 + 8, -106 + 8, 26, 210);
      }
      fill(...rgb(P.passerelle));
      rect(-12, -106, 24, 212, 2);
      fill(255, 255, 255, 0.25 * 255);
      rect(-12, -106, 24, 3);
      fill(0, 0, 0, 0.25 * 255);
      rect(-12, 103, 24, 3);
      fill(27, 29, 33);
      push();
      textAlign(CENTER, CENTER);
      textStyle(BOLD);
      textSize(11);
      DecorCircuit.espacement(null, 3);
      text((Circuit.NOMS[c.profil] ?? c.profil).toUpperCase(), 0, 0);
      DecorCircuit.espacement(null, 0);
      pop();
    });
    // portique des feux : juste après le damier
    element(1, () => {
      if (ombres) {
        fill(0, 0, 0, 0.3 * 255);
        rect(4 + 7, -95 + 6, 6, 190);
      }
      fill(36, 39, 44);
      rect(4, -95, 7, 190, 1);
      for (let k = 0; k < 5; k++) {
        const allume = vert || k < feux;
        fill(...(vert ? [46, 204, 113] : allume ? [255, 42, 31] : [58, 18, 18]));
        circle(7.5, -30 + k * 12, 4.8);
      }
    });
  }
}
