// Outils communs aux tests : ce fichier ne se termine pas par .test.mjs, il n'est donc pas
// exécuté comme une suite par `node --test tests/*.test.mjs`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Racine du projet : le dossier qui contient tests/ (aucun chemin relatif vers l'extérieur).
export const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
export const chemin = name => join(RACINE, name);
export const read = name => readFileSync(chemin(name), 'utf8');

// vehicle.js est protégé : son empreinte SHA-256 (octets du fichier) doit rester celle de la copie
// d'origine, enregistrée dans tests/vehicle.sha256 (format de sha256sum : « empreinte  vehicle.js »).
export const sha256 = name => createHash('sha256').update(readFileSync(chemin(name))).digest('hex');
export const empreinteReference = () => read('tests/vehicle.sha256').trim().split(/\s+/)[0];

// Adaptateur vectoriel minimal pour exercer le vrai vehicle.js sans p5 ni DOM. Il reprend le
// comportement de p5.Vector pour les méthodes utilisées par l'exemple.
export class Vector {
  constructor(x = 0, y = 0) { this.set(x, y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vector(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  static random2D() { return new Vector(1, 0); }
}

// Générateur pseudo-aléatoire reproductible (congruentiel), valeurs dans [0, 1[.
export function generator(seed = 12345) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export const DRAWING = ['push', 'pop', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight',
  'circle', 'ellipse', 'arc', 'triangle', 'line', 'rect', 'translate', 'rotate', 'background',
  'text', 'textSize', 'textAlign', 'beginShape', 'endShape', 'vertex',
  // circuit Formule 1 : quadrilatères, échelle de la caméra, copie du décor précalculé, styles
  'quad', 'scale', 'image', 'strokeJoin', 'strokeCap', 'textFont', 'tint', 'noTint',
  // phase 3 : fusion des lumières, styles de texte, formes
  'blendMode', 'imageMode', 'rectMode', 'textStyle', 'bezierVertex', 'curveVertex', 'ellipseMode'];

// Constantes de p5 utilisées par les dessins.
export const CONSTANTES = { CLOSE: 'close', CENTER: 'center', LEFT: 'left', RIGHT: 'right', ROUND: 'round', SQUARE: 'square', TOP: 'top', BOTTOM: 'bottom', BASELINE: 'baseline',
  ADD: 'lighter', BLEND: 'source-over', MULTIPLY: 'multiply', SCREEN: 'screen', BOLD: 'bold', NORMAL: 'normal', CORNER: 'corner' };

// p5.Graphics factice : chaque appel de dessin est enregistré dans `calls` (un tableau partagé
// entre tous les graphiques créés, pour compter les dessins du décor).
export function graphiques() {
  const calls = [];
  const crees = [];
  const createGraphics = (largeur, hauteur) => {
    const g = new Proxy({ largeur, hauteur, retire: false, remove() { this.retire = true; } }, {
      get(cible, nom) {
        if (nom in cible) return cible[nom];
        return (...args) => { calls.push([nom, ...args]); };
      },
    });
    crees.push(g);
    return g;
  };
  return { createGraphics, calls, crees };
}

// Police factice : chaque caractère (hors espace) est un carré dont le contour est échantillonné,
// comme le fait font.textToPoints. Le nombre de points suit sampleFactor, et les points sortent
// dans l'ordre du tracé, lettre après lettre.
export function fakeFont() {
  const calls = [];
  return {
    calls,
    textBounds(texte, x, y, taille) {
      return { x, y: y - taille * 0.7, w: texte.length * taille * 0.6, h: taille * 0.7 };
    },
    textToPoints(texte, x, y, taille, options = {}) {
      calls.push({ texte, x, y, taille, options });
      const facteur = options.sampleFactor ?? 0.1;
      const cote = taille * 0.5;
      const points = [];
      [...texte].forEach((caractere, rang) => {
        if (caractere === ' ') return;
        const gauche = x + rang * taille * 0.6;
        const haut = y - taille * 0.7;
        const nombre = Math.max(4, Math.round(4 * cote * facteur));
        for (let i = 0; i < nombre; i++) {
          const s = (i / nombre) * 4;                 // abscisse le long du contour, 0..4
          const t = s % 1;
          const [px, py] = s < 1 ? [t, 0] : s < 2 ? [1, t] : s < 3 ? [1 - t, 1] : [0, 1 - t];
          points.push({ x: gauche + px * cote, y: haut + py * cote, alpha: 0 });
        }
      });
      return points;
    },
  };
}

// Charge des fichiers de l'exemple dans un contexte isolé et évalue `expression` pour en
// extraire les classes et modules. Les fonctions de dessin de p5 sont enregistrées dans `calls`
// (['circle', x, y, d]...) ; random de p5 suit `random` (générateur reproductible par défaut).
export function loadScene(files, expression, options = {}) {
  const { width = 1000, height = 700, uniform = generator(1) } = options;
  const calls = [];
  const record = name => (...args) => { calls.push([name, ...args]); };
  const context = vm.createContext({
    createVector: (x, y) => new Vector(x, y),
    p5: { Vector },
    width,
    height,
    random: (a, b) => (b === undefined ? uniform() * (a ?? 1) : a + uniform() * (b - a)),
    map: (v, a, b, c, d) => (v - a) / (b - a) * (d - c) + c,
    cos: Math.cos,
    sin: Math.sin,
    PI: Math.PI,
    PIE: 'pie',
    CENTER: 'center',
    drawingContext: { setLineDash: record('setLineDash') },
    ...CONSTANTES,
    ...Object.fromEntries(DRAWING.map(name => [name, record(name)])),
  });
  const decor = graphiques();
  context.createGraphics = decor.createGraphics;
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  return { ...vm.runInContext(expression, context), calls, context, graphiques: decor };
}

// Les fichiers du circuit Formule 1, dans leur ordre de chargement (Particule prête ses méthodes).
export const F1 = ['vehicle.js', 'grilleSpatiale.js', 'circuit.js', 'personnalites.js', 'pneus.js', 'reseauNeuronal.js', 'capteursVoiture.js', 'particule.js',
  'perturbation.js', 'voitureF1.js', 'voiturePilote.js', 'voitureNeuronale.js', 'incidentJoueur.js', 'safetyCar.js', 'fumee.js', 'etincelle.js', 'gerbeEau.js', 'gerbePoussiere.js', 'debris.js', 'billeGomme.js', 'drone.js', 'imageAlpha.js', 'planchesSprites.js', 'livrees.js', 'spriteVoiture.js', 'commissaire.js', 'mecanicien.js',
  'affectation.js', 'pointRejouer.js', 'ecranFin.js', 'decorCircuit.js', 'tracesPneus.js', 'foule.js', 'ambiance.js', 'effetsVitesse.js', 'meteo.js', 'strategie.js', 'glisse.js', 'surfaces.js', 'chronometrage.js', 'ordresEquipe.js', 'incidents.js', 'equipeDeStand.js', 'voieDesStands.js', 'classement.js', 'hudPilote.js', 'telemetrie.js', 'carteChaleur.js', 'bullesRadio.js', 'prediction.js', 'historiquePositions.js', 'miniCarte.js', 'camera.js', 'manager.js', 'defis.js', 'championnat.js', 'confetti.js', 'podium.js', 'ecranPartage.js', 'domF1.js', 'barreHaut.js', 'tourClassement.js', 'hudCourse.js', 'bandeauEvenements.js', 'ongletTelemetrie.js', 'ongletPrediction.js', 'ongletHistorique.js', 'panneauLateral.js', 'carteCircuit.js', 'fenetreAide.js', 'feuxDepart.js', 'bandeauNeutralisation.js', 'panneauStand.js', 'podiumFin.js', 'ecranRejouer.js', 'decompteReprise.js', 'encartRejouer.js', 'menuPause.js', 'menuModes.js', 'hudDuel.js', 'consignePilote.js', 'interfaceF1.js',
  'course.js', 'entraineur.js', 'modelesIA.js'];
// Copie un tableau créé dans le contexte vm vers le realm du test (pour deepStrictEqual).
export const own = array => Array.from(array);

export const near = (a, b, eps = 1e-9) => {
  if (!(Math.abs(a - b) <= eps)) throw new Error(`${a} != ${b} (à ${eps} près)`);
};

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
