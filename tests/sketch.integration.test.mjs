import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chemin } from './support.mjs';
import { page } from './page.mjs';

// Test d'intégration : exécute les vrais scripts de index.html, dans leur ordre de chargement
// (sauf p5), avec des substituts de p5 et du DOM. Il vérifie le câblage de sketch.js pour le jeu
// F1 seul : démarrage, canvas, touches, clic, souris, fenêtre. Le rendu réel se valide dans un
// navigateur.

test('index.html : vehicle.js avant ses sous-classes, sketch.js en dernier, chaque script existe', () => {
  const { scripts } = page();
  const rang = nom => {
    const position = scripts.indexOf(nom);
    assert.ok(position >= 0, `${nom} absent de index.html`);
    assert.equal(scripts.lastIndexOf(nom), position, `${nom} chargé deux fois`);
    return position;
  };
  assert.ok(rang('libraries/p5.min.js') < rang('vehicle.js'));
  assert.equal(rang('grilleSpatiale.js'), rang('vehicle.js') + 1);
  for (const fichier of ['particule.js', 'perturbation.js', 'voitureF1.js', 'pointRejouer.js']) {
    assert.ok(rang('vehicle.js') < rang(fichier), `vehicle.js doit précéder ${fichier}`);
  }
  assert.ok(rang('particule.js') < rang('pointRejouer.js'));       // PointRejouer étend Particule
  assert.ok(rang('affectation.js') < rang('ecranFin.js'));         // l'écran REJOUER s'en sert
  assert.ok(rang('reglages.js') < rang('reglagesF1.js'));
  assert.ok(rang('scenarios.js') < rang('sketch.js'));
  assert.equal(scripts.at(-1), 'sketch.js');
  for (const script of scripts) assert.ok(existsSync(chemin(script)), `${script} introuvable`);
});

test('index.html : rien des anciens exercices (encre, serpents, scénario classique), p5.sound non chargée', () => {
  const { scripts, html } = page();
  for (const ancien of ['encre.js', 'snake.js', 'snakeWander.js', 'plume.js', 'oiseau.js', 'rapace.js', 'mangeur.js',
    'curseurSouris.js', 'anneauPlume.js', 'libraries/p5.sound.min.js']) {
    assert.ok(!scripts.includes(ancien), ancien);
  }
  assert.doesNotMatch(html, /Encre vivante|Murmuration|serpent|Hello!/i);
  assert.doesNotMatch(html, /<select id="(scenario|f1-scenario)"/);
});

test('démarrage : le jeu F1 tout de suite, canvas plein écran, interface visible, sans erreur', () => {
  const p = page({ largeur: 1280, hauteur: 720 }).demarrer();
  assert.equal(p.evaluate('scenario.id'), 'f1');
  assert.deepEqual([p.context.width, p.context.height], [1280, 720]);
  assert.equal(p.element('f1-ui').hidden, false);
  assert.equal(p.element('panneau-f1').hidden, false);
  assert.doesNotThrow(() => p.draw(120));
  assert.equal(p.evaluate('formule1.demarre'), true);
  assert.equal(p.evaluate('formule1.course.etat'), 'PRESENTATION');
});

test('fenêtre redimensionnée : le canvas suit, la simulation ne change pas de monde', () => {
  const p = page().demarrer();
  p.draw(5);
  p.context.windowWidth = 1920;
  p.context.windowHeight = 1080;
  p.evaluate('windowResized()');
  assert.deepEqual([p.context.width, p.context.height], [1920, 1080]);
  assert.equal(p.evaluate('formule1.course.circuit.largeurMonde'), 1800);
  // une hauteur changée sans événement (plein écran) : draw() réajuste le canvas, une seule fois
  p.context.windowHeight = 900;
  const avant = p.resizes.length;
  p.draw(3);
  assert.equal(p.context.height, 900);
  assert.equal(p.resizes.length, avant + 1);
});

test('après une longue pause de l\'onglet, une image ne compte que pour 0,1 s (8 pas au plus)', () => {
  const p = page().demarrer();
  p.draw();
  const chrono = p.evaluate('formule1.course.chrono');
  p.context.deltaTime = 60000;
  p.draw();
  const ecoule = p.evaluate('formule1.course.chrono') - chrono;
  assert.ok(ecoule > 0 && ecoule <= 8 / 60 + 1e-9, `${ecoule}`);
});

test('touche d : bascule le debug et la case Debug ; Vehicle.debug reste éteint', () => {
  const p = page().demarrer();
  p.draw();
  p.touche('d');
  assert.deepEqual([p.evaluate('debug'), p.element('f1-debug').checked, p.evaluate('Vehicle.debug')], [true, true, false]);
  p.touche('D');
  assert.deepEqual([p.evaluate('debug'), p.element('f1-debug').checked], [false, false]);
  // dans un menu déroulant, la touche ne va pas au jeu
  p.touche('d', p.element('f1-profil'));
  assert.equal(p.evaluate('debug'), false);
});

test('clic sur l\'interface : pas un clic de scène ; clic droit : ignoré', () => {
  const p = page().demarrer();
  p.draw();
  p.evaluate('formule1.course.selection = null');
  const voiture = p.evaluate('formule1.course.voitures[0]');
  const ecran = p.evaluate('formule1.camera.versEcran(formule1.course.voitures[0].pos.x, formule1.course.voitures[0].pos.y)');
  p.clic(ecran.x, ecran.y, p.element('f1-bouton-pause'));
  assert.equal(p.evaluate('formule1.course.selection'), null);
  p.clic(ecran.x, ecran.y, undefined, 'right');
  assert.equal(p.evaluate('formule1.course.selection'), null);
  p.clic(ecran.x, ecran.y);
  assert.equal(p.evaluate('formule1.course.selection'), voiture);
});

test('souris : survol d\'une voiture = curseur main ; F9 : diagnostic de performance', () => {
  const p = page().demarrer();
  p.draw();
  const ecran = p.evaluate('formule1.camera.versEcran(formule1.course.voitures[0].pos.x, formule1.course.voitures[0].pos.y)');
  p.souris(ecran.x, ecran.y);
  assert.equal(p.element('canvas').style.cursor, 'pointer');
  p.souris(2, 2);
  assert.equal(p.element('canvas').style.cursor, '');
  p.touche('F9');
  assert.equal(p.evaluate('diagnostic.actif'), true);
});
