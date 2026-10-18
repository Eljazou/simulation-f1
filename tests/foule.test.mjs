import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';

// Foule animée : dessinée directement sur le contexte 2D (performance : 800 spectateurs à chaque
// image), avec exactement les disques du chemin p5 (circle / fill) : mêmes centres, diamètres,
// couleurs, même ordre. Positions de base calculées une fois par décor.

const scene = loadScene(F1, '({ Circuit, Course, Foule })');
const { Circuit, Course, Foule } = scene;

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

// Les disques du chemin direct (contexte 2D factice qui enregistre).
function disquesContexte(f) {
  const disques = [];
  // le disque : centre = point de départ décalé d'un rayon (moveTo(x, cy)), diamètre = l'écart
  // entre le départ et le point opposé du deuxième bezierCurveTo
  const ctx = { fillStyle: '', beginPath() { this.pts = []; }, moveTo(x, y) { this.pts.push([x, y]); },
    bezierCurveTo(...a) { this.pts.push([a[4], a[5]]); },
    fill() { const [[x0, cy], , [xe]] = this.pts; disques.push([(x0 + xe) / 2, cy, xe - x0, this.fillStyle]); } };
  const avant = scene.context.drawingContext;
  scene.context.drawingContext = ctx;
  scene.calls.length = 0;
  f.show();
  const triangles = scene.calls.filter(c => c[0] === 'triangle').length;
  scene.context.drawingContext = avant;
  return { disques, triangles };
}

test('foule : le dessin direct donne les mêmes disques que circle() / fill() de p5, dans le même ordre', () => {
  const f = foule();
  const attendus = disquesP5(f);
  const { disques, triangles } = disquesContexte(f);
  assert.equal(disques.length, attendus.length);
  assert.ok(disques.length >= 160);
  disques.forEach((d, k) => {
    assert.ok(Math.abs(d[0] - attendus[k][0]) < 1e-9 && Math.abs(d[1] - attendus[k][1]) < 1e-9, `centre ${k}`);
    assert.ok(Math.abs(d[2] - attendus[k][2]) < 1e-9, `diamètre ${k}`);
    assert.equal(d[3], attendus[k][3], `couleur ${k}`);
  });
  // drapeaux agités : toujours dessinés par p5
  assert.ok(triangles > 0);
});

test('foule : la couleur est rétablie après un drapeau (fill() de p5 change celle du contexte)', () => {
  const f = foule();
  const ctx = { fillStyle: '', beginPath() {}, moveTo() {}, bezierCurveTo() {}, fills: [], fill() { this.fills.push(this.fillStyle); } };
  const avant = scene.context.drawingContext;
  scene.context.drawingContext = ctx;
  // fill() de p5 (substitut) écrit la couleur du drapeau dans le contexte, comme le vrai p5
  const fill0 = scene.context.fill;
  scene.context.fill = (...a) => { ctx.fillStyle = `drapeau(${a.join(',')})`; };
  f.show();
  scene.context.fill = fill0;
  scene.context.drawingContext = avant;
  assert.ok(ctx.fills.length > 0);
  assert.ok(ctx.fills.every(s => s.startsWith('rgb(')), 'un spectateur a pris la couleur d\'un drapeau');
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
