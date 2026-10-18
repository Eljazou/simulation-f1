import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read, loadScene, F1 } from './support.mjs';

// ImageAlpha : copier une image avec une opacité par globalAlpha (sans la copie intermédiaire de
// tint() de p5 1.7). Avec un vrai contexte 2D : globalAlpha, rétabli après ; sans contexte : tint().

function contexte({ avecCtx = true, alphaDeDepart = 1 } = {}) {
  const appels = [];
  const ctx = avecCtx ? { globalAlpha: alphaDeDepart } : undefined;
  const c = vm.createContext({
    drawingContext: ctx,
    image: (...a) => appels.push(['image', ctx ? ctx.globalAlpha : null, ...a.slice(1)]),
    tint: (...a) => appels.push(['tint', ...a]),
    noTint: () => appels.push(['noTint']),
  });
  vm.runInContext(`${read('imageAlpha.js')}\nthis.ImageAlpha = ImageAlpha;`, c);
  return { ImageAlpha: c.ImageAlpha, appels, ctx };
}

test('avec un vrai contexte : globalAlpha pendant la copie, rétabli après ; jamais tint()', () => {
  const { ImageAlpha, appels, ctx } = contexte();
  ImageAlpha.dessiner('g', 0.4, 1, 2, 3, 4);
  assert.deepEqual(appels, [['image', 0.4, 1, 2, 3, 4]]);
  assert.equal(ctx.globalAlpha, 1);
});

test('l\'opacité se multiplie à celle déjà en place (un appelant qui a baissé globalAlpha)', () => {
  const { ImageAlpha, appels, ctx } = contexte({ alphaDeDepart: 0.5 });
  ImageAlpha.dessiner('g', 0.5, 0, 0, 1, 1);
  assert.equal(appels[0][1], 0.25);
  assert.equal(ctx.globalAlpha, 0.5);
});

test('bornes : opacité 1 ou plus = copie simple ; 0 ou moins = rien', () => {
  const { ImageAlpha, appels, ctx } = contexte();
  ImageAlpha.dessiner('g', 1, 0, 0, 1, 1);
  ImageAlpha.dessiner('g', 3, 0, 0, 1, 1);
  ImageAlpha.dessiner('g', 0, 0, 0, 1, 1);
  ImageAlpha.dessiner('g', -2, 0, 0, 1, 1);
  assert.deepEqual(appels.map(a => a[0]), ['image', 'image']);
  assert.deepEqual(appels.map(a => a[1]), [1, 1]);
  assert.equal(ctx.globalAlpha, 1);
});

test('tuiles : une seule opacité pour toutes les copies, rétablie à la fin', () => {
  const { ImageAlpha, appels, ctx } = contexte();
  ImageAlpha.tuiles('motif', 0.25, poser => { for (let k = 0; k < 3; k++) poser(k * 10, 0, 10, 10); });
  assert.deepEqual(appels, [['image', 0.25, 0, 0, 10, 10], ['image', 0.25, 10, 0, 10, 10], ['image', 0.25, 20, 0, 10, 10]]);
  assert.equal(ctx.globalAlpha, 1);
  // opacité nulle : aucune copie
  ImageAlpha.tuiles('motif', 0, poser => poser(0, 0, 1, 1));
  assert.equal(appels.length, 3);
});

test('sans vrai contexte (substitut de p5) : tint(255, a) puis noTint(), comme avant', () => {
  const { ImageAlpha, appels } = contexte({ avecCtx: false });
  ImageAlpha.dessiner('g', 0.5, 0, 0, 1, 1);
  assert.deepEqual(appels, [['tint', 255, 127.5], ['image', null, 0, 0, 1, 1], ['noTint']]);
  appels.length = 0;
  ImageAlpha.tuiles('m', 0.5, poser => { poser(0, 0, 1, 1); poser(1, 0, 1, 1); });
  assert.deepEqual(appels.map(a => a[0]), ['tint', 'image', 'image', 'noTint']);
});

test('reflet des lumières : teinte bleutée calculée une fois par calque, réutilisée ensuite', () => {
  const scene = loadScene(F1, '({ Ambiance, graphiques: createGraphics })');
  const amb = new scene.Ambiance();
  const lumieres = { nom: 'calque' };
  const a = amb.refletDe(lumieres, 900, 550);
  const b = amb.refletDe(lumieres, 900, 550);
  assert.equal(a, b);
  assert.equal(a.largeur, 900);
  assert.equal(a.hauteur, 550);
  assert.notEqual(amb.refletDe({ nom: 'autre' }, 900, 550), a);
});

// le code sans ses commentaires (ils parlent de tint())
const code = fichier => read(fichier).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('garde : plus aucun tint() pour une simple opacité dans les effets plein écran, le décor et les ombres', () => {
  assert.match('  tint(255, 40);', /\btint\(/);
  assert.doesNotMatch('  noTint();', /\btint\(/);
  for (const fichier of ['meteo.js', 'decorCircuit.js', 'spriteVoiture.js']) assert.doesNotMatch(code(fichier), /\btint\(/, fichier);
  // dans l'ambiance, la seule teinte restante est celle du reflet, calculée une fois (refletDe)
  const ambiance = code('ambiance.js');
  assert.deepEqual([...ambiance.matchAll(/\btint\(([^)]*)\)/g)].map(m => m[1]), ['200, 210, 255']);
  assert.match(ambiance, /g\.tint\(200, 210, 255\)/);
});
