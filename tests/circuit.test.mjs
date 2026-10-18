import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, distance } from './support.mjs';

// Circuit : piste fermée, géométrie, ligne de course, virages, stands, grille. Il ne dépend pas de
// p5 : tout est calculé en nombres, une fois, à la construction.

const { Circuit } = loadScene(['circuit.js'], '({ Circuit })');
const PROFILS = Object.keys(Circuit.PROFILS);
// les circuits sont longs à calculer : un seul par profil pour toute la suite
const circuits = Object.fromEntries(PROFILS.map(profil => [profil, new Circuit(profil)]));
// Rayon de collision d'une voiture (voir voitureF1.js) : sert aux distances minimales.
const RAYON_VOITURE = 13;

test('trois profils inventés, chacun avec sa ligne droite des stands, et un profil inconnu est refusé', () => {
  assert.deepEqual(PROFILS, ['classique', 'rapide', 'technique']);
  assert.throws(() => new Circuit('monaco'), { name: 'RangeError' });
});

test('la piste est fermée : points réguliers, le dernier rejoint le premier, un tour complet de virage', () => {
  for (const [profil, c] of Object.entries(circuits)) {
    assert.ok(c.n > 300, profil);
    for (let i = 0; i < c.n; i++) {
      const ecart = distance(c.points[i], c.points[(i + 1) % c.n]);
      assert.ok(Math.abs(ecart - c.pas) < c.pas * 0.15, `${profil} : point ${i}, écart ${ecart}`);
    }
    // somme des angles de virage = ±2π : la courbe se referme sur elle-même sans boucle
    let total = 0;
    for (let i = 0; i < c.n; i++) {
      const a = c.tangentes[i];
      const b = c.tangentes[(i + 1) % c.n];
      total += Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
    }
    assert.ok(Math.abs(Math.abs(total) - 2 * Math.PI) < 1e-6, `${profil} : ${total}`);
    assert.ok(Math.abs(c.longueur - c.n * c.pas) < 1e-6);
  }
});

test('la piste ne se recoupe pas : deux portions éloignées le long du tracé restent séparées', () => {
  for (const [profil, c] of Object.entries(circuits)) {
    let minimum = Infinity;
    for (let i = 0; i < c.n; i++) {
      for (let j = i + 1; j < c.n; j++) {
        if (Math.min(j - i, c.n - j + i) * c.pas < 300) continue;
        minimum = Math.min(minimum, distance(c.points[i], c.points[j]));
      }
    }
    // une largeur de piste, plus de quoi placer bordures et dégagements
    assert.ok(minimum > c.largeur * 1.4, `${profil} : ${minimum}`);
    // et elle tient dans le monde, avec une marge pour le décor
    for (const p of c.points) assert.ok(p.x > 100 && p.x < c.largeurMonde - 100 && p.y > 100 && p.y < c.hauteurMonde - 150, profil);
  }
});

test('courbure : 1 / rayon sur un cercle, de signe opposé dans l\'autre sens ; nulle en ligne droite', () => {
  const R = 200;
  const cercle = Array.from({ length: 157 }, (_, i) => ({ x: R * Math.cos(i * 2 * Math.PI / 157), y: R * Math.sin(i * 2 * Math.PI / 157) }));
  const pas = 2 * Math.PI * R / 157;
  const { courbures, normales, tangentes } = Circuit.geometrie(cercle, pas);
  for (const k of courbures) assert.ok(Math.abs(k - 1 / R) < 1e-3 / R, `${k}`);
  assert.ok(Circuit.geometrie(cercle.slice().reverse(), pas).courbures.every(k => Math.abs(k + 1 / R) < 1e-3 / R));
  // normale = tangente tournée d'un quart de tour, unitaire
  normales.forEach((n, i) => {
    assert.ok(Math.abs(n.x * tangentes[i].x + n.y * tangentes[i].y) < 1e-9);
    assert.ok(Math.abs(Math.hypot(n.x, n.y) - 1) < 1e-9);
  });
  const droite = Array.from({ length: 20 }, (_, i) => ({ x: i * 8, y: 0 }));
  assert.ok(Circuit.geometrie(droite, 8).courbures.slice(4, 15).every(k => Math.abs(k) < 1e-12));
  // le circuit a bien des virages : sa courbure n'est pas nulle partout
  for (const c of Object.values(circuits)) assert.ok(Math.max(...c.courbures.map(Math.abs)) > 1 / 200);
});

test('reproductible : même profil et même graine, même piste ; autre graine, autre piste', () => {
  const a = new Circuit('rapide', 7);
  const b = new Circuit('rapide', 7);
  assert.equal(JSON.stringify(a.points), JSON.stringify(b.points));
  assert.equal(JSON.stringify(a.decalagesLigne), JSON.stringify(b.decalagesLigne));
  const c = new Circuit('rapide', 8);
  assert.notEqual(JSON.stringify(a.points), JSON.stringify(c.points));
  // la ligne d'arrivée reste le point 0, sur la ligne droite des stands
  for (const circuit of [a, c]) assert.ok(Math.abs(circuit.courbures[0]) < 1 / 1000);
});

test('ligne de course : dans le couloir, apex à la corde, moins courbée que la ligne centrale', () => {
  for (const [profil, c] of Object.entries(circuits)) {
    const limite = c.largeur / 2 - Circuit.MARGE_LIGNE;
    assert.ok(c.decalagesLigne.every(d => Math.abs(d) <= limite + 1e-9), profil);
    assert.ok(c.virages.length >= 5, `${profil} : ${c.virages.length} virages`);
    // à l'apex d'un virage serré, la ligne est du côté intérieur : le côté vers lequel la piste
    // tourne. En moyenne elle s'approche de la corde ; pas toujours jusqu'au bout : dans un
    // enchaînement en S, la ligne coupe entre les deux cordes.
    const serres = c.virages.filter(virage => virage.courbure >= 1 / 150);
    for (const virage of serres) {
      assert.equal(Math.sign(c.decalagesLigne[virage.apex]), virage.sens, `${profil} : apex ${virage.apex}`);
    }
    const moyenne = serres.reduce((somme, v) => somme + Math.abs(c.decalagesLigne[v.apex]), 0) / serres.length;
    assert.ok(moyenne > limite * 0.5, `${profil} : apex en moyenne à ${moyenne} px du centre`);
    const pire = tableau => Math.max(...tableau.map(Math.abs));
    assert.ok(pire(c.courburesLigne) < pire(c.courbures), profil);
  }
});

test('profil de vitesse : plafonné en ligne droite, plus lent à l\'apex d\'un virage serré, freinage possible partout', () => {
  const c = circuits.classique;
  const [vmax, aLat, aFrein] = [5, 0.15, 0.12];
  const v = c.profilVitesse(vmax, aLat, aFrein);
  assert.equal(v.length, c.n);
  assert.ok(Math.max(...v) <= vmax);
  assert.equal(v[0], vmax);                                      // ligne d'arrivée : pleine vitesse
  const serre = c.virages.reduce((a, b) => (a.courbure > b.courbure ? a : b));
  assert.ok(v[serre.apex] < vmax * 0.6, `${v[serre.apex]}`);
  for (let i = 0; i < c.n; i++) {
    const suivant = v[(i + 1) % c.n];
    assert.ok(v[i] * v[i] <= suivant * suivant + 2 * aFrein * c.pas + 1e-9, `point ${i}`);
  }
  assert.equal(c.profilVitesse(vmax, aLat, aFrein), v);          // mémorisé
});

test('virages, secteurs et zones DRS', () => {
  for (const [profil, c] of Object.entries(circuits)) {
    for (const virage of c.virages) {
      assert.ok(c.dansIntervalle(virage.apex, virage.debut, virage.fin), profil);
      assert.ok(Math.abs(c.courburesLigne[virage.apex]) > Circuit.COURBURE_VIRAGE);
    }
    assert.deepEqual(Array.from(c.secteurs), [0, Math.round(c.n / 3), Math.round(2 * c.n / 3)]);
    assert.deepEqual([c.secteur(0), c.secteur(c.secteurs[1]), c.secteur(c.n - 1)], [0, 1, 2]);
    assert.ok(c.zonesDRS.length >= 1, profil);
    // une zone DRS est une ligne droite
    for (const zone of c.zonesDRS) {
      for (let i = zone.debut; i !== zone.fin; i = (i + 1) % c.n) assert.ok(!c.virages.some(v => c.dansIntervalle(i, v.debut, v.fin)));
    }
  }
  const c = circuits.classique;
  const virage = c.prochainVirage(0, c.longueur);
  assert.ok(virage !== null);
  assert.ok(c.virages.every(v => c.distanceDevant(0, v.apex) >= c.distanceDevant(0, virage.apex)));
  assert.equal(c.prochainVirage(virage.apex + 1, 1), null);
});

test('voie des stands : part de la piste et y revient, à l\'extérieur ; boxes espacés, loin de la piste', () => {
  for (const [profil, c] of Object.entries(circuits)) {
    const { points, ecarts, boxes, parking, indicesPiste } = c.stands;
    assert.ok(Math.abs(ecarts[0]) < 1e-9 && Math.abs(ecarts.at(-1)) < 1e-9, profil);
    assert.ok(Math.max(...ecarts.map(Math.abs)) === Circuit.ECART_STANDS);
    assert.equal(indicesPiste[0], c.stands.debut);
    // la voie entoure la ligne d'arrivée (point 0)
    assert.ok(indicesPiste.includes(0));
    // côté extérieur : loin du centre du circuit
    assert.ok(ecarts.every(e => e * c.exterieur >= 0));
    assert.equal(boxes.length, 20);
    const ecartsBoxes = boxes.slice(1).map((box, k) => distance(box, boxes[k]));
    // assez d'écart pour entrer dans son box sans frôler le voisin ; la voie suit la ligne droite
    // des stands, qui n'est pas parfaitement droite : l'écart varie un peu d'un box à l'autre
    for (const e of ecartsBoxes) assert.ok(e >= 38 && e <= Circuit.ESPACEMENT_BOX + 3, `${profil} : ${e}`);
    for (const box of [...boxes, parking]) {
      // une voiture arrêtée au box ne touche ni la voie ni la piste
      const k = box.indiceVoie;
      assert.ok(distance(box, points[k]) >= 2 * RAYON_VOITURE + 4, profil);
      assert.ok(Math.abs(c.ecartLateral(box.x, box.y, box.indicePiste)) > c.largeur / 2 + 2 * RAYON_VOITURE, profil);
    }
    c.placerBoxes(6);
    assert.equal(c.stands.boxes.length, 6);
    c.placerBoxes(20);
    assert.equal(c.projeterStands(points[30].x + 3, points[30].y - 2), 30);
    assert.equal(c.projeterStands(points[30].x, points[30].y, 25), 30);
  }
});

test('grille : derrière la ligne d\'arrivée, deux colonnes, sans contact entre deux voitures', () => {
  for (const c of Object.values(circuits)) {
    const places = Array.from({ length: 20 }, (_, rang) => c.emplacementGrille(rang));
    for (let i = 0; i < 20; i++) {
      // derrière la ligne : il faut avancer pour l'atteindre
      assert.ok(c.distanceDevant(places[i].indice, 0) > 0 && c.distanceDevant(places[i].indice, 0) < c.longueur / 4);
      assert.ok(Math.abs(c.ecartLateral(places[i].x, places[i].y, places[i].indice)) < c.largeur / 2 - RAYON_VOITURE);
      for (let j = i + 1; j < 20; j++) assert.ok(distance(places[i], places[j]) > 2 * RAYON_VOITURE + 6);
    }
    // la pole est devant la deuxième place
    assert.ok(c.distanceDevant(places[1].indice, places[0].indice) > 0);
  }
});

test('projection : la recherche locale donne le même point que la recherche sur tout le tracé', () => {
  const c = circuits.technique;
  for (let i = 0; i < c.n; i += 7) {
    const p = c.pointLateral(i, 30);
    assert.equal(c.projeter(p.x, p.y), i);
    assert.equal(c.projeter(p.x, p.y, c.indice(i - 5)), i);
    assert.ok(Math.abs(c.ecartLateral(p.x, p.y, i) - 30) < 1e-9);
  }
  assert.equal(c.indice(-1), c.n - 1);
  assert.equal(c.indice(c.n + 2), 2);
  assert.equal(c.distanceDevant(c.n - 2, 1), 3 * c.pas);
});
