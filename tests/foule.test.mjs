import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, near } from './support.mjs';

// Foule animée (performance : 800 spectateurs à chaque image) : chaque spectateur est une copie
// (drawImage) d'un disque tracé une fois par couleur dans une planche de sprites, avec exactement
// les disques du chemin p5 (circle / fill) : mêmes centres, diamètres, couleurs, même ordre.
// Positions de base calculées une fois par décor.

const scene = loadScene(F1, '({ Circuit, Course, Foule, PlancheSprites })');
const { Circuit, Course, Foule, PlancheSprites } = scene;

function foule() {
  const c = new Course({ ...Course.parametresParDefaut(), nombreVoitures: 2, incidents: false }, Circuit.generateur(7));
  const f = new Foule(Course.decor(c.circuit));
  f.horloge = 1.37;
  f.excitations = f.excitations.map((_, k) => (k % 2 ? 0.8 : 0.1));
  return f;
}

// Les disques du chemin p5 : [x, y, diamètre, 'rgb(...)'] dans l'ordre.
function disquesP5(f) {
  scene.calls.length = 0;
  f.show();
  const disques = [];
  let couleur = null;
  for (const [nom, ...a] of scene.calls) {
    if (nom === 'fill') couleur = `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
    if (nom === 'circle') disques.push([a[0], a[1], a[2], couleur]);
  }
  return disques;
}

// Un contexte 2D factice qui enregistre les copies (drawImage à 9 arguments), à l'échelle 1.
function contexteCopies() {
  return { copies: [], getTransform: () => ({ a: 1, b: 0 }), drawImage(...a) { this.copies.push(a); } };
}

// Les disques du chemin direct : chaque copie ramenée au disque qu'elle montre (centre, diamètre,
// couleur de sa case dans la planche).
function disquesContexte(f) {
  const ctx = contexteCopies();
  const avant = scene.context.drawingContext;
  scene.context.drawingContext = ctx;
  scene.calls.length = 0;
  f.show();
  const triangles = scene.calls.filter(c => c[0] === 'triangle').length;
  const cercles = scene.calls.filter(c => c[0] === 'circle').length;
  scene.context.drawingContext = avant;
  const planche = Foule.PLANCHE;
  const [resolution] = [...planche.planches.keys()];
  const p = planche.planches.get(resolution);
  const couleurDe = new Map([...p.cases].map(([css, [sx, sy]]) => [`${sx},${sy}`, css]));
  const m = PlancheSprites.MARGE / resolution;
  const max = Foule.DIAMETRE + Foule.GONFLEMENT;
  const disques = ctx.copies.map(([source, sx, sy, sl, sh, dx, dy, dl, dh]) => {
    assert.equal(source, p.source);
    assert.equal(sl, p.l);
    assert.equal(sh, p.h);
    const echelle = dl * resolution / p.l;
    near(dh * resolution / p.h, echelle);
    return [dx - (planche.boite[0] - m) * echelle, dy - (planche.boite[1] - m) * echelle, echelle * max, couleurDe.get(`${sx},${sy}`)];
  });
  return { disques, triangles, cercles, planche: p };
}

test('foule : chaque spectateur est une copie de la planche, avec les disques de circle() / fill() de p5, dans le même ordre', () => {
  const f = foule();
  const attendus = disquesP5(f);
  const { disques, triangles, cercles } = disquesContexte(f);
  assert.equal(disques.length, attendus.length);
  assert.ok(disques.length >= 160);
  disques.forEach((d, k) => {
    assert.ok(Math.abs(d[0] - attendus[k][0]) < 1e-9 && Math.abs(d[1] - attendus[k][1]) < 1e-9, `centre ${k}`);
    assert.ok(Math.abs(d[2] - attendus[k][2]) < 1e-9, `diamètre ${k}`);
    assert.equal(d[3], attendus[k][3], `couleur ${k}`);
  });
  // drapeaux agités : toujours dessinés par p5 ; aucun disque tracé sur l'écran
  assert.ok(triangles > 0);
  assert.equal(cercles, 0);
});

test('foule : un disque par couleur est tracé une fois dans la planche, puis seulement recopié', () => {
  const f = foule();
  disquesContexte(f);
  const { planche } = disquesContexte(f);
  // une case par couleur distincte (deux indices de la palette peuvent avoir la même teinte)
  const couleurs = new Set(f.decor.tribunes.flatMap(t => t.foule.map(([, , c]) => f.styles.css[c])));
  assert.equal(planche.cases.size, couleurs.size);
  // une image de plus : ni nouvelle case, ni nouveau graphique
  const graphiques = scene.graphiques.crees.length;
  scene.graphiques.calls.length = 0;
  disquesContexte(f);
  assert.equal(planche.cases.size, couleurs.size);
  assert.equal(scene.graphiques.crees.length, graphiques);
  assert.equal(scene.graphiques.calls.filter(c => c[0] === 'circle').length, 0);
});

test('foule : positions de base calculées une fois (pas de pointLateral à chaque image)', () => {
  const f = foule();
  const circuit = f.circuit;
  let appels = 0;
  const pointLateral = circuit.pointLateral.bind(circuit);
  circuit.pointLateral = (...a) => { appels++; return pointLateral(...a); };
  f.show();
  const premiers = appels;
  const spectateurs = f.decor.tribunes.reduce((s, t) => s + t.foule.length, 0);
  assert.equal(premiers, spectateurs);
  f.show();
  f.show();
  assert.equal(appels, premiers);
  delete circuit.pointLateral;
});
