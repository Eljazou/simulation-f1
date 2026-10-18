// Substituts de p5 et du DOM pour exécuter les vrais scripts de la page sans navigateur (ce
// fichier n'est pas une suite : pas de .test.mjs). page() charge les scripts de index.html, dans
// leur ordre (sauf p5) : la page du jeu F1.
import vm from 'node:vm';
import { read, Vector, generator, fakeFont, DRAWING, CONSTANTES, graphiques } from './support.mjs';

// Hauteur rendue par offsetHeight (aucun élément de la page ne la change : le canvas prend toute
// la fenêtre).
export const HAUTEUR_BARRE = 48;

// Globales p5 communes aux deux chargements. `uniform` alimente random() de p5.
function p5Globals(uniform, largeur, hauteur) {
  const calls = [];
  const record = name => (...args) => { calls.push([name, ...args]); };
  const tirages = { nombre: 0 };
  const alea = () => { tirages.nombre++; return uniform(); };
  const globals = {
    createVector: (x, y) => new Vector(x, y),
    p5: { Vector },
    random: (a, b) => (b === undefined ? alea() * (a ?? 1) : a + alea() * (b - a)),
    map: (v, a, b, c, d) => (v - a) / (b - a) * (d - c) + c,
    cos: Math.cos,
    sin: Math.sin,
    floor: Math.floor,
    PI: Math.PI,
    PIE: 'pie',
    color: (...composantes) => ['color', ...composantes],
    lerpColor: (a, b, t) => ['lerpColor', a, b, t],
    loadFont: () => fakeFont(),
    windowWidth: largeur,
    windowHeight: hauteur,
    width: 0,
    height: 0,
    deltaTime: 1000 / 60,
    mouseX: 0,
    mouseY: 0,
    mouseButton: 'left',
    LEFT: 'left',
    RIGHT: 'right',
    key: '',
    drawingContext: { setLineDash: record('setLineDash') },
    ...CONSTANTES,
    ...Object.fromEntries(DRAWING.map(name => [name, record(name)])),
  };
  const decor = graphiques();
  globals.createGraphics = decor.createGraphics;
  return { globals, calls, tirages, decor };
}

function installer(context, resizes, canvas = {}) {
  context.createCanvas = (w, h) => { context.width = w; context.height = h; return { elt: canvas }; };
  context.resizeCanvas = (w, h) => { context.width = w; context.height = h; resizes.push([w, h]); };
}

// La page du jeu. Fenêtre de `largeur` × `hauteur`.
// stockage : un faux localStorage (window.localStorage) ; sans lui, window n'existe pas dans la page.
export function page({ largeur = 1200, hauteur = 800, graine = 2026, stockage = undefined } = {}) {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)">\s*<\/script>/g)].map(m => m[1]);
  const { globals, calls, tirages, decor } = p5Globals(generator(graine), largeur, hauteur);
  const resizes = [];

  // DOM : un élément par id, avec les attributs lus dans index.html. Les éléments créés par les
  // scripts (createElement, createElementNS) ont la même interface : enfants, attributs, classes,
  // style, événements.
  const elements = new Map();
  const nouvelElement = (extra = {}) => {
    const events = {};
    const classes = new Set();
    const attributs = new Map();
    const e = {
      events, value: '', textContent: '', hidden: false, flous: 0, checked: false, offsetHeight: HAUTEUR_BARRE,
      style: { setProperty(nom, valeur) { this[nom] = valeur; }, getPropertyValue(nom) { return this[nom] ?? ''; } },
      dataset: {},
      children: [],
      parentNode: null,
      attributs,
      addEventListener(name, fn) { (events[name] ??= []).push(fn); },
      fire(name, evenement = {}) { for (const fn of events[name] ?? []) fn({ target: e, currentTarget: e, preventDefault() {}, stopPropagation() {}, ...evenement }); },
      blur() { this.flous++; },
      focus() { this.focusee = true; },
      // comme le vrai DOM : un élément déjà placé est déplacé (retiré de son parent d'abord)
      appendChild(enfant) {
        if (enfant && typeof enfant === 'object') {
          if (enfant.parentNode) enfant.parentNode.removeChild(enfant);
          enfant.parentNode = e;
        }
        this.children.push(enfant);
        return enfant;
      },
      removeChild(enfant) { this.children = this.children.filter(x => x !== enfant); return enfant; },
      // comme le vrai DOM : l'enfant est retiré de son parent, puis placé avant `reference` (à la fin si null)
      insertBefore(enfant, reference) {
        if (enfant.parentNode) enfant.parentNode.removeChild(enfant);
        enfant.parentNode = e;
        const k = reference === null ? -1 : this.children.indexOf(reference);
        if (k < 0) this.children.push(enfant);
        else this.children.splice(k, 0, enfant);
        return enfant;
      },
      replaceChildren(...enfants) { this.children.forEach(x => { if (x && typeof x === 'object') x.parentNode = null; }); this.children = []; enfants.forEach(x => this.appendChild(x)); },
      remove() { if (e.parentNode) e.parentNode.removeChild(e); },
      setAttribute(nom, valeur) { attributs.set(nom, String(valeur)); },
      getAttribute(nom) { return attributs.has(nom) ? attributs.get(nom) : null; },
      removeAttribute(nom) { attributs.delete(nom); },
      querySelectorAll() { return []; },
      classList: {
        add: (...noms) => noms.forEach(n => classes.add(n)),
        remove: (...noms) => noms.forEach(n => classes.delete(n)),
        toggle: (nom, force) => { const actif = force === undefined ? !classes.has(nom) : Boolean(force); if (actif) classes.add(nom); else classes.delete(nom); return actif; },
        contains: nom => classes.has(nom),
      },
      get className() { return [...classes].join(' '); },
      set className(valeur) { classes.clear(); String(valeur).split(/\s+/).filter(Boolean).forEach(n => classes.add(n)); },
      ...extra,
    };
    return e;
  };
  const element = (id, extra = {}) => {
    if (!elements.has(id)) elements.set(id, nouvelElement({ id, ...extra }));
    return elements.get(id);
  };
  const attributs = {};
  for (const [, balise] of html.matchAll(/<input ([^>]*)>/g)) {
    const lu = Object.fromEntries([...balise.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    attributs[lu.id] = lu;
    Object.assign(element(lu.id), { value: lu.value, type: lu.type, tagName: 'INPUT', checked: /\schecked\b/.test(balise) });
  }
  // menus : chacun prend la valeur de son option marquée selected
  const menus = Object.fromEntries([...html.matchAll(/<select id="([^"]+)">([\s\S]*?)<\/select>/g)].map(m => [m[1], m[2]]));
  for (const [id, contenu] of Object.entries(menus)) {
    Object.assign(element(id), { tagName: 'SELECT', value: contenu.match(/<option value="([^"]+)" selected>/)?.[1] ?? '' });
  }
  for (const [, id, texte] of html.matchAll(/<output id="([^"]+)"[^>]*>([^<]*)<\/output>/g)) element(id).textContent = texte;
  const groupes = [...html.matchAll(/<\w+([^>]*) data-scenario="([^"]+)"( hidden)?>/g)]
    .map(([, autres, scenario, hidden], i) => {
      const id = autres.match(/id="([^"]+)"/)?.[1] ?? `groupe-${i}`;
      return element(id, { dataset: { scenario }, hidden: Boolean(hidden) });
    });

  // contrôles d'un mode de jeu (data-mode) : visibles dans ce mode seulement
  const groupesModes = [...html.matchAll(/<\w+([^>]*) data-mode="([^"]+)"[^>]*>/g)]
    .map(([, autres, mode], i) => Object.assign(element(autres.match(/id="([^"]+)"/)?.[1] ?? `mode-${i}`), { dataset: { mode } }));
  const context = vm.createContext({
    ...(stockage === undefined ? {} : { window: { localStorage: stockage, addEventListener() {} } }),
    ...globals,
    console,
    document: {
      getElementById: id => element(id),
      querySelectorAll: selecteur => (selecteur === '[data-scenario]' ? groupes : selecteur === '[data-mode]' ? groupesModes : []),
      createElement: tagName => nouvelElement({ tagName: tagName.toUpperCase() }),
      createElementNS: (espace, tagName) => nouvelElement({ tagName, espace }),
      body: element('body'),
      documentElement: element('html'),
    },
  });
  const canvas = element('canvas', { tagName: 'CANVAS' });
  installer(context, resizes, canvas);
  // Math.random de la page (placement des particules et des mangeurs) : un générateur à part,
  // pour ne pas décaler les tirages de random() de p5.
  vm.runInContext('Math.random = __alea;', Object.assign(context, { __alea: generator(graine + 1) }));
  for (const src of scripts.filter(src => !src.startsWith('libraries/'))) {
    vm.runInContext(read(src), context, { filename: src });
  }

  const evaluate = code => vm.runInContext(code, context);
  return { context, evaluate, element, groupes, groupesModes, attributs, calls, resizes, scripts, tirages, html, decor,
    demarrer() { evaluate('preload(); setup();'); return this; },
    draw(n = 1) { for (let i = 0; i < n; i++) evaluate('draw()'); },
    // Le jeu F1 est le seul scénario : il est déjà affiché (rien à faire). Tout autre id est refusé.
    choisir(id) { if (id !== 'f1') throw new RangeError(`Scénario inconnu : ${id}.`); },
    // Touche pressée ; `cible` = l'élément qui a le focus (par défaut : la scène).
    touche(key, cible = canvas) { context.key = key; context.__evenement = { target: cible }; evaluate('keyPressed(__evenement)'); },
    souris(x, y) { context.mouseX = x; context.mouseY = y; evaluate('mouseMoved()'); },
    clic(x, y, cible = canvas, bouton = 'left') {
      context.mouseX = x; context.mouseY = y;
      context.mouseButton = bouton;
      context.__evenement = { target: cible };
      evaluate('mousePressed(__evenement)');
      context.mouseButton = 'left';
    },
    glisser(id, valeur) { element(id).value = String(valeur); element(id).fire('input'); },
  };
}
