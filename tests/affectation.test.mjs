import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, generator, own, distance } from './support.mjs';

// Affectation particule -> point au plus proche (module Affectation, sans état), utilisée par
// l'écran REJOUER pour placer les points du mot.

const { Affectation } = loadScene(['affectation.js'], '({ Affectation })');
const L = 1000;
const H = 700;
const nuage = (n, graine, largeur = L, hauteur = H) => {
  const alea = generator(graine);
  return Array.from({ length: n }, () => ({ x: alea() * largeur, y: alea() * hauteur }));
};

// --- Affectation au plus proche ---------------------------------------------------------------

test('affectation : jamais le même point pour deux particules', () => {
  for (const [particules, points] of [[300, 300], [120, 400], [1000, 1000], [1, 1], [50, 51]]) {
    for (const graine of [1, 2, 3]) {
      const affectation = own(Affectation.auPlusProche(nuage(particules, graine), nuage(points, graine + 10)));
      assert.equal(affectation.length, particules);
      assert.equal(new Set(affectation).size, particules, `${particules} particules, ${points} points`);
      assert.ok(affectation.every(k => Number.isInteger(k) && k >= 0 && k < points));
    }
  }
});

test('affectation : plus de particules que de points, les particules en trop n\'ont pas de point', () => {
  const affectation = own(Affectation.auPlusProche(nuage(300, 4), nuage(120, 5)));
  const servies = affectation.filter(k => k >= 0);
  assert.equal(servies.length, 120);
  assert.equal(new Set(servies).size, 120);                      // tous les points sont pris, une fois
  assert.equal(affectation.filter(k => k === -1).length, 180);
  assert.ok(affectation.slice(0, 120).every(k => k >= 0));       // les premières sont servies
  assert.ok(affectation.slice(120).every(k => k === -1));
});

test('affectation : chaque particule reçoit le point libre le plus proche au moment de son tour', () => {
  const positions = nuage(80, 6);
  const points = nuage(200, 7);
  const affectation = own(Affectation.auPlusProche(positions, points));
  const pris = new Set();
  positions.forEach((position, i) => {
    const libres = points.map((point, k) => [k, distance(position, point)]).filter(([k]) => !pris.has(k));
    const meilleure = Math.min(...libres.map(([, d]) => d));
    assert.equal(distance(position, points[affectation[i]]), meilleure, `particule ${i}`);
    pris.add(affectation[i]);
  });
});

test('affectation : des particules déjà posées sur les points les gardent (même mot : rien ne bouge)', () => {
  const points = nuage(250, 8);
  // les particules sont sur les points, dans un autre ordre
  const ordre = points.map((_, k) => (k * 37) % 250);
  const positions = ordre.map(k => ({ ...points[k] }));
  assert.deepEqual(own(Affectation.auPlusProche(positions, points)), ordre);
});

test('affectation : cas limites et reproductibilité', () => {
  assert.deepEqual(own(Affectation.auPlusProche([], nuage(5, 1))), []);
  assert.deepEqual(own(Affectation.auPlusProche(nuage(3, 1), [])), [-1, -1, -1]);
  const positions = nuage(60, 9);
  const points = nuage(60, 10);
  assert.deepEqual(own(Affectation.auPlusProche(positions, points)), own(Affectation.auPlusProche(positions, points)));
  // deux particules au même endroit : deux points différents quand même
  const jumelles = [{ x: 10, y: 10 }, { x: 10, y: 10 }];
  assert.deepEqual(own(Affectation.auPlusProche(jumelles, [{ x: 0, y: 0 }, { x: 11, y: 10 }])), [1, 0]);
});

test('affectation : les entrées ne sont pas modifiées', () => {
  const positions = nuage(20, 11);
  const points = nuage(30, 12);
  const avant = JSON.stringify([positions, points]);
  Affectation.auPlusProche(positions, points);
  assert.equal(JSON.stringify([positions, points]), avant);
});
