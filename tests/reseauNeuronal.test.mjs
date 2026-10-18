import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadScene, read } from './support.mjs';

// ReseauNeuronal : perceptron 8 -> N -> 4 (tanh, sigmoïde), poids en tableaux typés, générateur à
// graine (mulberry32), cloner, muter, croiser, JSON. Il ne bouge rien : ce n'est pas un Vehicle.

const scene = loadScene(['vehicle.js', 'reseauNeuronal.js'], '({ Vehicle, ReseauNeuronal })');
const { ReseauNeuronal, Vehicle } = scene;
const graine = g => ReseauNeuronal.mulberry32(g);
const entrees = (k = 0) => Array.from({ length: 8 }, (_, i) => ((i * 37 + k * 11) % 100) / 100);

test('le réseau n\'est pas un Vehicle ; 8 entrées, N cachés, 4 sorties ; 13N + 4 poids en tableaux typés', () => {
  const r = new ReseauNeuronal(12, graine(1));
  assert.ok(!(r instanceof Vehicle));
  assert.notEqual(Object.getPrototypeOf(ReseauNeuronal), Vehicle);
  assert.equal(r.poidsCaches.length, 8 * 12);
  assert.equal(r.biaisCaches.length, 12);
  assert.equal(r.poidsSorties.length, 4 * 12);
  assert.equal(r.biaisSorties.length, 4);
  assert.equal(r.nombrePoids, 13 * 12 + 4);
  assert.equal(r.nombrePoids, 160);
  for (const t of r.tableaux) assert.equal(t.constructor.name, 'Float64Array');
  assert.equal(r.passeAvant(entrees()).length, 4);
});

test('N de 10 à 15 accepté ; hors bornes ou non entier refusé', () => {
  for (let n = 10; n <= 15; n++) assert.equal(new ReseauNeuronal(n, graine(n)).caches, n);
  for (const n of [9, 16, 0, 12.5, '12', NaN, -12]) {
    assert.throws(() => new ReseauNeuronal(n, graine(1)), { name: 'RangeError' }, String(n));
  }
});

test('passe avant déterministe : même graine, mêmes sorties ; graines différentes, réseaux différents', () => {
  const a = new ReseauNeuronal(12, graine(42));
  const b = new ReseauNeuronal(12, graine(42));
  const c = new ReseauNeuronal(12, graine(43));
  for (let k = 0; k < 20; k++) assert.deepEqual(a.passeAvant(entrees(k)), b.passeAvant(entrees(k)));
  assert.notDeepEqual(a.passeAvant(entrees()), c.passeAvant(entrees()));
  // le générateur lui-même est reproductible et dans [0, 1[
  const g1 = graine(7);
  const g2 = graine(7);
  for (let k = 0; k < 1000; k++) {
    const x = g1();
    assert.equal(x, g2());
    assert.ok(x >= 0 && x < 1);
  }
});

test('sorties toujours dans [0, 1] et finies, même pour des entrées extrêmes ou non finies', () => {
  const r = new ReseauNeuronal(15, graine(3));
  const cas = [entrees(), new Array(8).fill(0), new Array(8).fill(1), new Array(8).fill(1e6), new Array(8).fill(-1e6),
    [NaN, Infinity, -Infinity, undefined, null, 0.5, 2, -2]];
  for (const e of cas) {
    const s = r.passeAvant(e);
    assert.equal(s.length, 4);
    for (const x of s) assert.ok(Number.isFinite(x) && x >= 0 && x <= 1, `${x}`);
  }
  assert.throws(() => r.passeAvant([1, 2, 3]), { name: 'RangeError' });
  // activations cachées gardées pour le dessin : entre -1 et 1
  for (const h of r.activations) assert.ok(h >= -1 && h <= 1);
});

test('aucune dépendance à Math.random : construire, muter, croiser n\'y touchent pas', () => {
  const s = loadScene(['reseauNeuronal.js'], '({ ReseauNeuronal })');
  vm.runInContext('Math.random = () => { throw new Error("Math.random ne doit pas servir"); };', s.context);
  // la garde peut échouer : Math.random lève bien une erreur dans ce contexte
  assert.throws(() => vm.runInContext('Math.random()', s.context), /ne doit pas servir/);
  const R = s.ReseauNeuronal;
  const a = new R(12, R.mulberry32(1));
  const b = new R();
  a.muter(0.5, 0.3, R.mulberry32(2));
  a.croiser(b, R.mulberry32(3));
  a.cloner().passeAvant(entrees());
  b.muter(0.2, 0.1);
  // dans le code (hors commentaires, qui en parlent) : aucun appel
  const source = read('reseauNeuronal.js');
  assert.match(source, /Math\.random/);
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ''), /Math\.random/);
});

test('cloner() : mêmes sorties, mais tableaux indépendants', () => {
  const r = new ReseauNeuronal(12, graine(5));
  const c = r.cloner();
  assert.deepEqual(c.passeAvant(entrees()), r.passeAvant(entrees()));
  for (let k = 0; k < 4; k++) assert.notEqual(c.tableaux[k], r.tableaux[k]);
  const avant = Array.from(r.poidsCaches);
  c.poidsCaches[0] += 10;
  c.biaisSorties[1] = -5;
  assert.deepEqual(Array.from(r.poidsCaches), avant);
  assert.notDeepEqual(c.passeAvant(entrees()), r.passeAvant(entrees()));
});

test('muter() : taux 0 = inchangé ; taux 1 = tous les poids bougent ; amplitude réglable ; valeurs invalides refusées', () => {
  const r = new ReseauNeuronal(12, graine(9));
  const avant = r.tableaux.map(t => Array.from(t));
  assert.equal(r.muter(0, 0.5, graine(1)), 0);
  assert.deepEqual(r.tableaux.map(t => Array.from(t)), avant);
  assert.equal(r.muter(0.5, 0, graine(1)), 0);
  assert.deepEqual(r.tableaux.map(t => Array.from(t)), avant);
  const tout = r.cloner();
  assert.equal(tout.muter(1, 0.5, graine(2)), r.nombrePoids);
  tout.tableaux.forEach((t, k) => t.forEach((w, i) => assert.notEqual(w, avant[k][i])));
  // à taux égal, une plus grande amplitude écarte plus les poids
  const ecart = amplitude => {
    const m = r.cloner();
    m.muter(1, amplitude, graine(3));
    return m.tableaux.reduce((s, t, k) => s + t.reduce((a, w, i) => a + Math.abs(w - avant[k][i]), 0), 0);
  };
  assert.ok(ecart(1) > 5 * ecart(0.1));
  assert.throws(() => r.muter(-0.1, 0.1), { name: 'RangeError' });
  assert.throws(() => r.muter(1.5, 0.1), { name: 'RangeError' });
  assert.throws(() => r.muter(0.1, -1), { name: 'RangeError' });
  // reproductible : même graine, même mutation
  const m1 = r.cloner();
  const m2 = r.cloner();
  m1.muter(0.3, 0.4, graine(11));
  m2.muter(0.3, 0.4, graine(11));
  assert.deepEqual(m1.tableaux.map(t => Array.from(t)), m2.tableaux.map(t => Array.from(t)));
});

test('croiser() : chaque neurone caché vient en bloc d\'un parent, l\'enfant a des poids des deux parents', () => {
  const a = new ReseauNeuronal(12, graine(21));
  const b = new ReseauNeuronal(12, graine(22));
  const enfant = a.croiser(b, graine(4));
  let deA = 0;
  let deB = 0;
  for (let h = 0; h < 12; h++) {
    const ligne = r => [...Array.from(r.poidsCaches.slice(h * 8, h * 8 + 8)), r.biaisCaches[h], ...[0, 1, 2, 3].map(s => r.poidsSorties[s * 12 + h])];
    const e = ligne(enfant);
    if (JSON.stringify(e) === JSON.stringify(ligne(a))) deA++;
    else if (JSON.stringify(e) === JSON.stringify(ligne(b))) deB++;
    else assert.fail(`neurone ${h} mélangé`);
  }
  assert.ok(deA > 0 && deB > 0, `${deA} de A, ${deB} de B`);
  assert.equal(deA + deB, 12);
  for (let s = 0; s < 4; s++) assert.ok([a.biaisSorties[s], b.biaisSorties[s]].includes(enfant.biaisSorties[s]));
  // les parents ne changent pas ; architectures différentes : refusé
  assert.deepEqual(Array.from(a.poidsCaches), Array.from(new ReseauNeuronal(12, graine(21)).poidsCaches));
  assert.throws(() => a.croiser(new ReseauNeuronal(10, graine(1))), { name: 'RangeError' });
});

test('JSON : aller-retour exact (texte compris) ; version ou tailles incompatibles refusées', () => {
  const r = new ReseauNeuronal(13, graine(77));
  r.muter(1, 0.7, graine(5));
  const texte = JSON.stringify(r.versJSON());
  const relu = ReseauNeuronal.depuisJSON(JSON.parse(texte));
  assert.equal(relu.caches, 13);
  relu.tableaux.forEach((t, k) => assert.deepEqual(Array.from(t), Array.from(r.tableaux[k])));
  for (let k = 0; k < 10; k++) assert.deepEqual(relu.passeAvant(entrees(k)), r.passeAvant(entrees(k)));
  const json = r.versJSON();
  assert.equal(json.version, ReseauNeuronal.VERSION);
  assert.deepEqual({ ...json.architecture }, { entrees: 8, caches: 13, sorties: 4, activationCachee: 'tanh', activationSortie: 'sigmoide' });
  assert.throws(() => ReseauNeuronal.depuisJSON({ ...json, version: 99 }), { name: 'RangeError', message: /version/i });
  assert.throws(() => ReseauNeuronal.depuisJSON({ ...json, architecture: { ...json.architecture, caches: 20 } }), { name: 'RangeError' });
  assert.throws(() => ReseauNeuronal.depuisJSON({ ...json, architecture: { ...json.architecture, entrees: 6 } }), { name: 'RangeError' });
  assert.throws(() => ReseauNeuronal.depuisJSON({ ...json, poids: { ...json.poids, caches: json.poids.caches.slice(1) } }), { name: 'RangeError' });
  assert.throws(() => ReseauNeuronal.depuisJSON({ ...json, poids: { ...json.poids, biaisSorties: [1, 2, 'x', 4] } }), { name: 'RangeError' });
  assert.throws(() => ReseauNeuronal.depuisJSON(null), { name: 'RangeError' });
});
