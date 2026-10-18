import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';
import { page } from './page.mjs';

// Diagnostic de performance (?debug=perf ou F9) : fenêtre glissante de 2 s, images/s moyennes et
// minimales, durée de draw(), particules, redessins du décor, écritures dans la page. Le temps est
// injecté (durées en ms, comme deltaTime) : aucun minuteur ni horloge dans le fichier.

const { Vehicle, DiagnosticPerf } = loadScene([...F1, 'diagnosticPerf.js'], '({ Vehicle, DiagnosticPerf })');

test('diagnostic : pas un Vehicle ; demandé par ?debug=perf (seul ou parmi d\'autres valeurs), pas autrement', () => {
  assert.ok(!(DiagnosticPerf.prototype instanceof Vehicle));
  assert.equal(DiagnosticPerf.demande('?debug=perf'), true);
  assert.equal(DiagnosticPerf.demande('?scenario=f1&debug=perf'), true);
  assert.equal(DiagnosticPerf.demande('?debug=ui,perf'), true);
  for (const r of ['', '?debug=1', '?perf', '?debug=performance', '?xdebug=perf']) assert.equal(DiagnosticPerf.demande(r), false, r);
});

test('images/s : moyenne et minimum (la plus longue image) sur la fenêtre de 2 s', () => {
  const d = new DiagnosticPerf();
  for (let i = 0; i < 120; i++) d.enregistrer(1000 / 60, 4);
  let s = d.stats();
  assert.ok(Math.abs(s.fpsMoyen - 60) < 1e-6);
  assert.ok(Math.abs(s.fpsMin - 60) < 1e-6);
  assert.equal(s.drawMoyen, 4);
  // une image de 50 ms : le minimum tombe à 20 images/s, la moyenne baisse un peu
  d.enregistrer(50, 30);
  s = d.stats();
  assert.ok(Math.abs(s.fpsMin - 20) < 1e-6);
  assert.ok(s.fpsMoyen < 60 && s.fpsMoyen > 50);
  assert.equal(s.drawMax, 30);
  // 2 s plus tard, l'image lente est sortie de la fenêtre
  for (let i = 0; i < 125; i++) d.enregistrer(1000 / 60, 4);
  s = d.stats();
  assert.ok(Math.abs(s.fpsMin - 60) < 1e-6);
  assert.equal(s.drawMax, 4);
  // la fenêtre garde au plus 2 s d'images
  assert.ok(s.images <= 121, String(s.images));
});

test('fenêtre : une image exactement 2 s plus ancienne reste comptée ; au-delà, elle sort', () => {
  const d = new DiagnosticPerf();
  d.enregistrer(100, 1);
  for (let i = 0; i < 20; i++) d.enregistrer(100, 1);
  // instants 0,1 ... 2,1 s : la première (0,1 s) est à exactement 2 s de la dernière
  assert.equal(d.stats().images, 21);
  d.enregistrer(100, 1);
  assert.equal(d.stats().images, 21);
});

test('une durée nulle ou invalide n\'est pas enregistrée ; sans image, tout vaut 0', () => {
  const d = new DiagnosticPerf();
  for (const dt of [0, -5, NaN, undefined]) d.enregistrer(dt, 3);
  const s = d.stats();
  assert.equal(s.images, 0);
  assert.equal(s.fpsMoyen, 0);
  assert.equal(s.fpsMin, 0);
  assert.equal(s.ecrituresParSeconde, 0);
});

test('écritures dans la page par seconde ; redessins du décor sur la fenêtre', () => {
  const d = new DiagnosticPerf();
  for (let i = 0; i < 120; i++) {
    d.compterEcritures(3);
    d.enregistrer(1000 / 60, 2, { redessins: i < 60 ? 1 : 2 });
  }
  const s = d.stats();
  assert.ok(Math.abs(s.ecrituresParSeconde - 180) < 2, String(s.ecrituresParSeconde));
  assert.equal(s.redessinsDecor, 2);
  assert.equal(s.redessinsFenetre, 1);
  // plus aucun redessin pendant 2 s : 0 sur la fenêtre, le total reste
  for (let i = 0; i < 130; i++) d.enregistrer(1000 / 60, 2, { redessins: 2 });
  assert.equal(d.stats().redessinsDecor, 2);
  assert.equal(d.stats().redessinsFenetre, 0);
  assert.equal(d.stats().ecrituresParSeconde, 0);
});

test('particules : les groupes de la course, comptés sans rien changer ; sans course, 0', () => {
  const course = { fumees: [1, 2], gerbes: [1], etincelles: [], poussieres: [1, 2, 3], billes: [], debris: [1] };
  const p = DiagnosticPerf.particules(course);
  assert.equal(p.total, 7);
  assert.equal(p.detail.poussieres, 3);
  assert.equal(course.fumees.length, 2);
  assert.equal(DiagnosticPerf.particules(null).total, 0);
});

test('le cadre : réécrit au plus 2 fois par seconde, seulement allumé', () => {
  const p = page().demarrer();
  const d = p.evaluate('new DiagnosticPerf(document.body)');
  assert.equal(d.racine.hidden, true);
  d.enregistrer(16, 2);
  d.afficher(1 / 60, null);
  assert.equal(d.racine.textContent, '');
  d.activer(true);
  assert.equal(d.racine.hidden, false);
  d.afficher(1 / 60, null);
  const premier = d.racine.textContent;
  assert.match(premier, /images\/s/);
  assert.match(premier, /devicePixelRatio 1/);
  for (let i = 0; i < 20; i++) d.enregistrer(10, 9);
  // moins d'une demi-seconde : le texte ne change pas
  d.afficher(0.2, null);
  assert.equal(d.racine.textContent, premier);
  d.afficher(0.4, null);
  assert.notEqual(d.racine.textContent, premier);
  d.basculer();
  assert.equal(d.racine.hidden, true);
});

test('sketch.js : F9 allume le diagnostic (même en pilotage), ?debug=perf l\'allume au démarrage ; il mesure draw() sans changer la course', () => {
  const p = page();
  p.context.pixelDensity = () => 1;
  let t = 0;
  p.context.performance = { now: () => (t += 2.5) };
  p.demarrer();
  p.choisir('f1');
  assert.equal(p.evaluate('diagnostic.actif'), false);
  p.draw(5);
  p.touche('F9');
  assert.equal(p.evaluate('diagnostic.actif'), true);
  p.draw(40);
  const s = p.evaluate('diagnostic.stats()');
  assert.equal(s.images, 40);
  assert.ok(Math.abs(s.fpsMoyen - 60) < 1e-6);
  assert.ok(s.drawMoyen > 0);
  assert.ok(s.redessinsDecor >= 1);
  assert.match(p.evaluate('diagnostic.racine.textContent'), /particules \d+/);
  // la course avance exactement comme sans diagnostic
  const temoin = page().demarrer();
  temoin.choisir('f1');
  temoin.draw(45);
  const voitures = x => x.evaluate('JSON.stringify([formule1.course.etat, formule1.course.chronoEtat, formule1.course.voitures.map(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y])])');
  assert.equal(voitures(p), voitures(temoin));
  p.touche('F9');
  assert.equal(p.evaluate('diagnostic.actif'), false);

  // ?debug=perf
  const q = page();
  q.context.location = { search: '?debug=perf' };
  q.context.pixelDensity = () => 1;
  q.demarrer();
  assert.equal(q.evaluate('diagnostic.actif'), true);
});
