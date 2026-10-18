import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, Vector, near } from './support.mjs';

// Perturbation : véhicule éphémère, immobile, qui fournit une force de répulsion aux voisins.

const scene = () => loadScene(['vehicle.js', 'particule.js', 'perturbation.js'], '({ Vehicle, Particule, Perturbation })');
const contexte = perturbations => ({ perturbations, largeur: 1000, hauteur: 700 });

test('une Perturbation étend Vehicle, avec ses réglages', () => {
  const { Vehicle, Perturbation } = scene();
  const perturbation = new Perturbation(300, 200);
  assert.equal(Object.getPrototypeOf(Perturbation), Vehicle);
  assert.ok(perturbation instanceof Vehicle);
  assert.deepEqual([perturbation.r, perturbation.maxForce, perturbation.age], [220, 3, 0]);
  assert.deepEqual([Perturbation.RAYON, Perturbation.DUREE, Perturbation.FORCE_MAX], [220, 0.5, 3]);
  assert.deepEqual([perturbation.terminee, perturbation.intensite, perturbation.declenche], [false, 1, false]);
  assert.equal(perturbation.applyForce, Vehicle.prototype.applyForce);
});

test('répulsion : la force éloigne du centre, limitée par maxForce et réduite par la distance', () => {
  const { Vehicle, Perturbation } = scene();
  const perturbation = new Perturbation(500, 300);
  const proche = new Vehicle(555, 300);                          // à 55 px : un quart du rayon
  const force = perturbation.repousser(proche);
  assert.ok(force instanceof Vector);
  near(force.y, 0);
  near(force.x, 3 * (1 - 55 / 220));                             // 2,25 vers la droite
  const autreCote = perturbation.repousser(new Vehicle(500, 190));   // à 110 px, au-dessus
  near(autreCote.x, 0);
  near(autreCote.y, -1.5);
  assert.ok(force.mag() <= perturbation.maxForce + 1e-12);
  assert.equal(perturbation.declenche, true);
});

test('répulsion : nulle au bord du rayon et au-delà (bord exclu)', () => {
  const { Vehicle, Perturbation } = scene();
  const perturbation = new Perturbation(500, 300);
  for (const x of [720, 720.001, 2000]) {
    const force = perturbation.repousser(new Vehicle(x, 300));
    assert.deepEqual([force.x, force.y], [0, 0], `x = ${x}`);
  }
  assert.equal(perturbation.declenche, false);                   // personne dans le rayon
  assert.ok(perturbation.repousser(new Vehicle(719.9, 300)).x > 0);
  assert.equal(perturbation.declenche, true);
});

test('répulsion : c\'est une force de pilotage, elle tient compte de la vitesse du véhicule', () => {
  const { Vehicle, Perturbation } = scene();
  const perturbation = new Perturbation(500, 300);
  // véhicule (maxSpeed 4) qui s'éloigne déjà presque à sa vitesse maximale : force faible
  const fuyard = new Vehicle(510, 300);
  fuyard.vel.set(3.9, 0);
  near(perturbation.repousser(fuyard).x, 0.1);
  // véhicule qui fonce vers le centre : force maximale à cette distance
  const fonceur = new Vehicle(510, 300);
  fonceur.vel.set(-4, 0);
  near(perturbation.repousser(fonceur).x, 3 * (1 - 10 / 220));
  // repousser ne touche ni au véhicule ni à la perturbation
  assert.deepEqual([fonceur.pos.x, fonceur.vel.x, fonceur.acc.x], [510, -4, 0]);
  assert.deepEqual([perturbation.pos.x, perturbation.pos.y, perturbation.acc.x], [500, 300, 0]);
});

test('véhicule exactement au centre : force finie, limitée, qui ne fait que freiner', () => {
  const { Vehicle, Perturbation } = scene();
  const perturbation = new Perturbation(500, 300);
  const dessus = new Vehicle(500, 300);
  dessus.vel.set(2, 0);
  const force = perturbation.repousser(dessus);
  near(force.x, -2);
  near(force.y, 0);
  const immobile = perturbation.repousser(new Vehicle(500, 300));
  assert.deepEqual([immobile.x, immobile.y], [0, 0]);
});

test('durée de vie : l\'intensité décroît, la perturbation est terminée exactement à DUREE', () => {
  const { Vehicle, Perturbation } = scene();
  const perturbation = new Perturbation(500, 300);
  const voisin = new Vehicle(555, 300);
  const pleine = perturbation.repousser(voisin).x;
  perturbation.update(0.25);
  assert.deepEqual([perturbation.age, perturbation.intensite, perturbation.terminee], [0.25, 0.5, false]);
  near(perturbation.repousser(voisin).x, pleine / 2);            // moitié de vie : moitié de force
  perturbation.update(0.25);                                     // 0,5 s : bord compris
  assert.deepEqual([perturbation.intensite, perturbation.terminee], [0, true]);
  const eteinte = perturbation.repousser(voisin);
  assert.deepEqual([eteinte.x, eteinte.y], [0, 0]);
  perturbation.update(3);
  assert.equal(perturbation.intensite, 0);                       // jamais négative
});

test('elle ne se déplace pas : aucune force, la locomotion de Vehicle la laisse sur place', () => {
  const { Vehicle, Perturbation } = scene();
  const perturbation = new Perturbation(123, 456);
  const voisin = new Vehicle(150, 456);
  for (let i = 0; i < 20; i++) { perturbation.repousser(voisin); perturbation.update(0.01); }
  assert.deepEqual([perturbation.pos.x, perturbation.pos.y, perturbation.vel.x, perturbation.vel.y], [123, 456, 0, 0]);
  perturbation.update();                                         // sans durée : elle ne vieillit pas
  near(perturbation.age, 0.2);
});

test('un clic disperse une particule rangée sur son point, puis elle y revient', () => {
  const { Particule, Perturbation } = scene();
  const particule = new Particule(400, 300);
  particule.viser({ x: 400, y: 300 }, 0);
  const perturbations = [new Perturbation(440, 300)];
  let plusLoin = 0;
  for (let i = 0; i < 600; i++) {
    particule.applyBehaviors(contexte(perturbations));
    particule.update();
    perturbations.forEach(perturbation => perturbation.update(1 / 60));
    if (perturbations.length > 0 && perturbations[0].terminee) perturbations.length = 0;
    plusLoin = Math.max(plusLoin, particule.distanceCible());
    assert.ok(particule.vel.mag() <= particule.maxSpeed + 1e-9);
  }
  assert.ok(plusLoin > 40, `dispersion de ${plusLoin} px`);
  assert.ok(particule.distanceCible() < 0.01);                   // revenue à sa place
  assert.ok(particule.vel.mag() < 0.01);
});

test('une particule hors du rayon n\'est pas dérangée', () => {
  const { Particule, Perturbation } = scene();
  const particule = new Particule(100, 100);
  particule.viser({ x: 100, y: 100 }, 0);
  const perturbations = [new Perturbation(700, 500)];
  for (let i = 0; i < 30; i++) { particule.applyBehaviors(contexte(perturbations)); particule.update(); }
  assert.deepEqual([particule.pos.x, particule.pos.y], [100, 100]);
});

test('dessin : une onde qui s\'élargit en s\'effaçant ; debug : rayon d\'action jaune ou rouge', () => {
  const { Vehicle, Perturbation, calls } = scene();
  const perturbation = new Perturbation(300, 200);
  perturbation.show();
  assert.deepEqual(calls.filter(c => c[0] === 'circle'), [['circle', 300, 200, 0]]);
  assert.deepEqual(calls.find(c => c[0] === 'stroke'), ['stroke', 255, 255, 255, 200]);

  perturbation.update(0.25);
  calls.length = 0;
  perturbation.show();
  assert.deepEqual(calls.filter(c => c[0] === 'circle'), [['circle', 300, 200, 220]]);   // mi-vie : mi-rayon
  assert.deepEqual(calls.find(c => c[0] === 'stroke'), ['stroke', 255, 255, 255, 100]);

  calls.length = 0;
  perturbation.show(true);
  assert.deepEqual(calls.filter(c => c[0] === 'circle')[1], ['circle', 300, 200, 440]);  // diamètre = 2 × rayon
  assert.ok(calls.some(c => c[0] === 'stroke' && c[1] === 'yellow'));
  perturbation.repousser(new Vehicle(310, 200));
  calls.length = 0;
  perturbation.show(true);
  assert.ok(calls.some(c => c[0] === 'stroke' && c[1] === 'red'));
  assert.ok(!calls.some(c => c[0] === 'stroke' && c[1] === 'yellow'));
  assert.equal(calls.filter(c => c[0] === 'push').length, calls.filter(c => c[0] === 'pop').length);
});
