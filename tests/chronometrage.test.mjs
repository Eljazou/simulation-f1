import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, sha256, empreinteReference } from './support.mjs';

// Chronométrage réaliste : temps de course (départ aux feux, arrêt au damier), points de
// chronométrage (passages interpolés, jamais deux fois), écarts au dernier point commun,
// doublés, arrivée figée, classement final, pénalités, temps au tour et secteurs (couleurs),
// format des temps. Les voitures « fictives » sont de simples objets avec une position, avancés
// à vitesse connue le long de la ligne centrale : les temps de passage ont une valeur analytique.

const scene = loadScene(F1, '({ Vehicle, Circuit, Course, VoitureF1, Chronometrage })');
const { Vehicle, Circuit, Course, VoitureF1, Chronometrage } = scene;
const circuit = Course.circuit('classique');
const L = circuit.longueur;
const N = circuit.pointsChrono.length;
const DT = 1 / 60;

// Une voiture fictive : position sur la ligne centrale à l'abscisse (déroulée) s.
function fictive(nom, s0, vitesse) {
  const v = { nom, pos: { x: 0, y: 0 }, auStand: false, s: s0, vitesse };
  placer(v, s0);
  return v;
}
function placer(v, s) {
  v.s = s;
  const u = ((s % L) + L) % L;
  const i = Math.floor(u / circuit.pas);
  const t = u / circuit.pas - i;
  const a = circuit.points[i % circuit.n];
  const b = circuit.points[(i + 1) % circuit.n];
  v.pos = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
// Avance de `secondes` : chaque voiture avance de vitesse(v) × dt, puis le chronométrage relève.
function rouler(chrono, voitures, secondes, nombreTours = 99, evenements = []) {
  const pas = Math.round(secondes / DT);
  for (let i = 0; i < pas; i++) {
    voitures.forEach(v => placer(v, v.s + (typeof v.vitesse === 'function' ? v.vitesse(v) : v.vitesse) * DT));
    evenements.push(...chrono.update(DT, nombreTours));
  }
  return evenements;
}
function nouveau(voitures) {
  const chrono = new Chronometrage(circuit, voitures);
  chrono.demarrer();
  return chrono;
}

test('le chronométrage ne bouge pas : ce n\'est pas un Vehicle ; le circuit définit N points et 3 secteurs fixes', () => {
  assert.ok(!(Chronometrage.prototype instanceof Vehicle));
  assert.equal(N, Circuit.POINTS_CHRONO);
  assert.equal(circuit.pointsChrono[0], 0);
  circuit.pointsChrono.forEach((d, k) => assert.ok(Math.abs(d - k * L / N) < 1e-9));
  assert.deepEqual(Array.from(circuit.secteursChrono), [0, N / 3, 2 * N / 3]);
  // abscisse continue : exacte sur la ligne centrale, entre deux points
  const v = fictive('a', 1234.5, 0);
  assert.ok(Math.abs(circuit.abscisse(v.pos.x, v.pos.y) - 1234.5) < 1e-6);
});

test('format des temps : m:ss.mmm, et h:mm:ss.mmm au-delà d\'une heure', () => {
  assert.equal(Chronometrage.formater(0), '0:00.000');
  assert.equal(Chronometrage.formater(58.21), '0:58.210');
  assert.equal(Chronometrage.formater(62.3456), '1:02.346');
  assert.equal(Chronometrage.formater(599.9996), '10:00.000');
  assert.equal(Chronometrage.formater(3600), '1:00:00.000');
  assert.equal(Chronometrage.formater(3723.004), '1:02:03.004');
  assert.equal(Course.formaterTemps(62.3456), '1:02.346');
  assert.equal(Chronometrage.texteTours(1), '+1 TOUR');
  assert.equal(Chronometrage.texteTours(2), '+2 TOURS');
});

test('interpolation : le temps de passage de chaque point est à moins de dt/2 de sa valeur analytique', () => {
  const s0 = -50;
  const vitesse = 317;                                            // px/s : pas un multiple des points
  const v = fictive('a', s0, vitesse);
  const chrono = nouveau([v]);
  rouler(chrono, [v], 2.2 * L / vitesse);
  const passages = chrono.etat(v).passages;
  assert.ok(passages.length > 2 * N);
  passages.forEach((t, k) => {
    const attendu = (k * L / N - s0) / vitesse;                   // distance du point k depuis la grille
    assert.ok(Math.abs(t - attendu) < DT / 2, `point ${k} : ${t} au lieu de ${attendu}`);
  });
  // le relevé n'est pas « l'image la plus proche » : il tombe entre deux images
  assert.ok(passages.some(t => Math.abs(t / DT - Math.round(t / DT)) > 0.05));
});

test('un point n\'est enregistré qu\'une fois par tour et par voiture ; reculer puis repasser ne change rien', () => {
  const v = fictive('a', -20, 200);
  const chrono = nouveau([v]);
  rouler(chrono, [v], 1);                                         // franchit le point 0 puis avance
  const etat = chrono.etat(v);
  const k = etat.k;
  const premier = etat.passages[k];
  // recul de 300 px (en arrière de plusieurs points), puis retour en avant
  v.vitesse = -300;
  rouler(chrono, [v], 1);
  assert.equal(etat.k, k);
  v.vitesse = 300;
  rouler(chrono, [v], 1);
  assert.equal(etat.passages[k], premier, 'le premier passage reste');
  // tous les index relevés sont distincts et consécutifs
  const releves = Object.keys(etat.passages).map(Number);
  assert.deepEqual(releves, releves.map((_, i) => i));
  // horloge : temps simulé, 3 s
  assert.ok(Math.abs(chrono.horloge - 3) < 1e-9);
});

test('écart : deux voitures à vitesse égale, la seconde partie 1,5 s plus tard, sont à 1,5 s ; intervalle idem', () => {
  const vitesse = 300;
  const a = fictive('a', -30, vitesse);
  const b = fictive('b', -30 - 1.5 * vitesse, vitesse);
  const chrono = nouveau([b, a]);                                 // ordre de grille sans importance
  rouler(chrono, [a, b], 20);
  assert.deepEqual(chrono.classement(), [a, b]);
  for (const mode of ['leader', 'intervalle']) {
    const e = chrono.ecarts(mode).get(b);
    assert.ok(Math.abs(e.valeur - 1.5) < 1e-6, `${mode} : ${e.valeur}`);
    assert.equal(e.texte, '+1.5');
  }
  assert.equal(chrono.ecarts().get(a).texte, 'Leader');
  // l'écart ne change qu'au passage d'un point : entre deux points, il reste le même
  const avant = chrono.ecarts().get(b).valeur;
  const k = chrono.etat(b).k;
  rouler(chrono, [a, b], DT * 2);
  if (chrono.etat(b).k === k) assert.equal(chrono.ecarts().get(b).valeur, avant);
});

test('classement en direct : par point franchi, puis par temps de passage ; pas par position instantanée', () => {
  const a = fictive('a', -20, 300);
  const b = fictive('b', -40, 300);
  const chrono = nouveau([a, b]);
  rouler(chrono, [a, b], 3);
  assert.deepEqual(chrono.classement(), [a, b]);
  // b dépasse a juste après un point : tant qu'il n'a pas franchi le point suivant, a reste devant
  // s'ils sont au même point… b doit être plus loin d'un point entier pour passer devant
  const kA = chrono.etat(a).k;
  placer(b, chrono.distancePoint(kA) + 1);                        // b au même point que a, juste devant
  chrono.update(DT, 99);
  assert.equal(chrono.etat(b).k, kA);
  assert.deepEqual(chrono.classement(), [a, b], 'au même point, le premier passé reste devant');
  placer(b, chrono.distancePoint(kA + 1) + 1);
  chrono.update(DT, 99);
  assert.deepEqual(chrono.classement(), [b, a]);
});

test('gaps au leader : jamais négatifs, croissants d\'un rang au suivant (hors doublés), dans une vraie course', () => {
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 12, nombreTours: 3 }, Circuit.generateur(4));
  let verifications = 0;
  for (let i = 0; i < 60 * 400 && !c.terminee; i++) {
    c.pas();
    if (i % 15 !== 0 || c.tempsCourse < 5) continue;
    const ecarts = c.ecarts('leader');
    const valeurs = c.classement().map(v => ecarts.get(v)).filter(e => e.tours === 0 && e.valeur !== null).map(e => e.valeur);
    valeurs.forEach(x => assert.ok(x >= 0));
    for (let r = 1; r < valeurs.length; r++) assert.ok(valeurs[r] >= valeurs[r - 1], valeurs.join(' '));
    verifications++;
  }
  assert.ok(verifications > 100);
  // et l'imposition de l'ordre a bien lieu : un cas construit où le brut décroît
  const vitesse = 300;
  const leader = fictive('L', -10, vitesse);
  const deux = fictive('2', -10 - 2 * vitesse, vitesse);
  const trois = fictive('3', -10 - 2.2 * vitesse, vitesse);
  const chrono = nouveau([leader, deux, trois]);
  rouler(chrono, [leader, deux, trois], 10);
  // 2 perd 1 s entre deux points (il ralentit), 3 n'a pas encore atteint ce point
  deux.vitesse = 0;
  rouler(chrono, [leader, deux, trois], 0.3);
  const e = chrono.ecarts();
  assert.ok(e.get(trois).valeur >= e.get(deux).valeur);
});

test('doublé : « +1 TOUR » quand le leader a au moins N points d\'avance ; « +2 TOURS » ensuite', () => {
  const leader = fictive('L', -10, 900);
  const lent = fictive('l', -30, 250);
  const chrono = nouveau([leader, lent]);
  let vu = null;
  for (let i = 0; i < 60 * 40 && vu !== '+2 TOURS'; i++) {
    rouler(chrono, [leader, lent], DT);
    const texte = chrono.ecarts().get(lent).texte;
    const avance = chrono.etat(leader).k - chrono.etat(lent).k;
    if (chrono.etat(lent).k < 0) continue;
    if (avance < N) assert.match(texte, /^\+\d+\.\d$/);
    else assert.equal(texte, Chronometrage.texteTours(Math.floor(avance / N)));
    if (texte === '+1 TOUR' && vu === null) vu = texte;
    if (texte === '+2 TOURS') vu = texte;
  }
  assert.equal(vu, '+2 TOURS');
});

test('temps de course : départ aux feux seulement, arrêt à l\'arrivée du leader, figé pendant 10 s simulées ; pause', () => {
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 4, nombreTours: 1 }, Circuit.generateur(3));
  while (c.etat !== Course.ETATS.COURSE) {
    assert.equal(c.tempsCourse, 0);
    assert.equal(c.chronometrage.demarre, false);
    c.pas();
  }
  // le pas de l'extinction des feux compte déjà : dt depuis le départ
  assert.equal(c.chronometrage.demarre, true);
  assert.equal(c.tempsCourse, DT);
  // il avance de dt par pas
  const avant = c.tempsCourse;
  for (let i = 0; i < 60; i++) c.pas();
  assert.ok(Math.abs(c.tempsCourse - avant - 1) < 1e-9);
  // pause : aucun pas, temps arrêté
  c.basculerPause();
  c.avancer(1);
  assert.ok(Math.abs(c.tempsCourse - avant - 1) < 1e-9);
  c.basculerPause();
  while (c.chronometrage.vainqueur === null) c.pas();
  const fige = c.tempsCourse;
  assert.equal(fige, c.chronometrage.tempsVainqueur);
  assert.equal(fige, c.chronometrage.arrivee(c.chronometrage.vainqueur).temps);
  for (let i = 0; i < 60 * 10; i++) c.pas();
  assert.equal(c.tempsCourse, fige);
  assert.ok(c.chronometrage.horloge > fige + 9.9);                // l'horloge chronomètre les autres
  assert.equal(c.etat, Course.ETATS.ARRIVEE);
  // le tour 1 part de la grille : son temps est celui du passage au point N depuis l'extinction
  const v = c.chronometrage.vainqueur;
  assert.equal(c.chronometrage.tours(v)[0].temps, c.chronometrage.etat(v).passages[N]);
});

test('arrivée : chaque voiture enregistre son temps une seule fois ; repasser la ligne ne change rien', () => {
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 8, nombreTours: 2 }, Circuit.generateur(5));
  const enregistrees = new Map();
  for (let i = 0; i < 60 * 300 && !c.terminee; i++) {
    c.pas();
    c.voitures.forEach(v => {
      const a = c.chronometrage.arrivee(v);
      if (a === null) return;
      if (!enregistrees.has(v)) enregistrees.set(v, { ...a });
      assert.deepEqual({ ...a }, enregistrees.get(v), 'résultat figé');
    });
  }
  assert.ok(c.terminee);
  assert.equal(enregistrees.size, 8);
  const tempsVainqueur = c.chronometrage.tempsVainqueur;
  // chacune a fini à SON passage de ligne après le damier
  for (const [v, a] of enregistrees) {
    assert.ok(a.temps >= tempsVainqueur);
    assert.equal(a.ecart, a.temps - tempsVainqueur);
    assert.equal(v.arrivee, true);
  }
  // un tour de plus (tour d'honneur, garage) : rien ne change
  const classement = c.classement();
  const textes = classement.map(v => c.ecarts().get(v).texte);
  for (let i = 0; i < 60 * 20; i++) c.pas();
  assert.deepEqual(c.classement(), classement);
  assert.deepEqual(classement.map(v => c.ecarts().get(v).texte), textes);
  // affichage final : temps du vainqueur, puis écarts figés (3 décimales)
  assert.equal(textes[0], Chronometrage.formater(tempsVainqueur));
  textes.slice(1).forEach(t => assert.match(t, /^\+(\d+\.\d{3}|\d TOURS?)$/));
  assert.deepEqual(c.ordreArrivee.map(v => c.chronometrage.arrivee(v).temps), c.ordreArrivee.map(v => c.chronometrage.arrivee(v).temps).sort((x, y) => x - y));
});

// Course fictive de 2 tours : A gagne, B finit dans le même tour, C est doublé, D abandonne.
function courseFictive() {
  const a = fictive('A', -10, 600);
  const b = fictive('B', -30, 560);
  const cc = fictive('C', -50, 250);
  const d = fictive('D', -70, 400);
  const chrono = nouveau([a, b, cc, d]);
  // D abandonne après 12 s, avec plus de distance que C (qui sera classé, doublé) : il est
  // classé après C quand même
  rouler(chrono, [a, b, cc, d], 12, 2);
  assert.ok(chrono.etat(d).k > N + 1 && chrono.etat(d).k > chrono.etat(cc).k);
  chrono.abandonner(d);
  d.vitesse = 0;
  const evenements = rouler(chrono, [a, b, cc, d], 40, 2);
  return { a, b, c: cc, d, chrono, evenements };
}

test('classement final : même tour par temps croissant, doublés après (tours faits), abandons à la fin', () => {
  const { a, b, c, d, chrono, evenements } = courseFictive();
  assert.equal(chrono.vainqueur, a);
  assert.ok(Math.abs(chrono.tempsVainqueur - (2 * L + 10) / 600) < DT / 2);
  assert.ok(Math.abs(chrono.arrivee(b).temps - (2 * L + 30) / 560) < DT / 2);
  // C finit à son prochain passage de ligne après le damier : un tour fait
  assert.equal(chrono.arrivee(c).tours, 1);
  assert.ok(Math.abs(chrono.arrivee(c).temps - (L + 50) / 250) < DT / 2);
  assert.equal(chrono.arrivee(d), null);
  assert.deepEqual(chrono.classement(), [a, b, c, d]);
  const e = chrono.ecarts();
  assert.equal(e.get(a).texte, Chronometrage.formater(chrono.tempsVainqueur));
  assert.equal(e.get(b).texte, `+${(chrono.arrivee(b).temps - chrono.tempsVainqueur).toFixed(3)}`);
  assert.equal(e.get(c).texte, '+1 TOUR');
  assert.equal(e.get(d).texte, 'DNF');
  // un abandon n'arrive jamais ; un damier, une arrivée par voiture classée
  assert.equal(evenements.filter(x => x.type === 'damier').length, 1);
  assert.equal(evenements.filter(x => x.type === 'arrivee').length, 3);
});

test('pénalité : +5 s ajoutées au temps final après l\'arrivée, avec reclassement et « (+5 s) »', () => {
  const a = fictive('A', -10, 600);
  const b = fictive('B', -10 - 0.5 * 600, 600);                  // 0,5 s derrière
  const chrono = nouveau([a, b]);
  assert.equal(chrono.penaliser(a, 5), false, 'refusée avant l\'arrivée');
  rouler(chrono, [a, b], 30, 1);
  assert.deepEqual(chrono.classement(), [a, b]);
  assert.equal(chrono.penaliser(a, 5), true);
  assert.deepEqual(chrono.classement(), [b, a]);
  const e = chrono.ecarts();
  assert.equal(e.get(b).texte, Chronometrage.formater(chrono.tempsFinal(b)));
  assert.match(e.get(a).texte, /^\+4\.50\d \(\+5 s\)$/);
  assert.ok(Math.abs(chrono.tempsFinal(a) - (chrono.arrivee(a).temps + 5)) < 1e-12);
  // le temps d'arrivée et l'écart figé, eux, ne changent pas
  assert.ok(Math.abs(chrono.arrivee(a).ecart) < 1e-12);
  // dans la course : la pénalité du joueur est ajoutée quand il reçoit le damier
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 3, nombreTours: 1 }, Circuit.generateur(2));
  c.voitures[0].penalites = 10;
  for (let i = 0; i < 60 * 200 && !c.terminee; i++) c.pas();
  assert.equal(c.chronometrage.arrivee(c.voitures[0]).penalite, 10);
  assert.match(c.ecarts().get(c.voitures[0]).texte, /\(\+10 s\)$/);
});

test('temps au tour et secteurs : violet (meilleur de la course), vert (meilleur personnel), jaune (autre)', () => {
  // A : tours à 600, 700, 650 px/s ; B : 640, 660, 620 px/s (le meilleur de la course est A, tour 2)
  const vitessePar = vitesses => v => vitesses[Math.min(vitesses.length - 1, Math.max(0, Math.floor(v.s / L)))];
  const a = fictive('A', -10, null);
  a.vitesse = vitessePar([600, 700, 650]);
  const b = fictive('B', -40, null);
  b.vitesse = vitessePar([640, 660, 620]);
  const chrono = nouveau([a, b]);
  rouler(chrono, [a, b], 25);
  const [a1, a2, a3] = chrono.tours(a);
  const [b1, b2, b3] = chrono.tours(b);
  assert.ok(a3 && b3);
  // temps d'un tour lancé : L / vitesse
  assert.ok(Math.abs(a2.temps - L / 700) < DT);
  assert.ok(Math.abs(a3.temps - L / 650) < DT);
  // les trois secteurs font le tour
  assert.ok(Math.abs(a2.secteurs.reduce((x, y) => x + y, 0) - a2.temps) < 1e-9);
  assert.equal(chrono.meilleurTour.fiche, a2);
  assert.equal(chrono.couleurTour(a, a2), 'violet');
  assert.equal(chrono.couleurTour(a, a3), 'jaune');
  assert.equal(chrono.couleurTour(a, a1), 'jaune');
  assert.equal(chrono.couleurTour(b, b2), 'vert');                // meilleur personnel de B
  assert.equal(chrono.couleurTour(b, b1), 'jaune');
  assert.equal(chrono.couleurTour(b, b3), 'jaune');
  assert.equal(chrono.meilleurPersonnel(b), b2);
  // secteurs : même règle
  assert.equal(chrono.couleurSecteur(a, 0, a2.secteurs[0]), 'violet');
  assert.equal(chrono.couleurSecteur(b, 0, b2.secteurs[0]), 'vert');
  assert.equal(chrono.couleurSecteur(a, 0, a3.secteurs[0]), 'jaune');
  // le tour 1 part de la grille (de l'arrêt) : il compte la distance depuis la grille
  assert.ok(Math.abs(a1.temps - (L + 10) / 600) < DT);
});

test('tour avec arrêt au stand : marqué IN, OUT ou IN/OUT, avec le temps passé dans la voie', () => {
  const v = fictive('a', -10, 600);
  const chrono = nouveau([v]);
  rouler(chrono, [v], 5);                                         // tour 1 bouclé ?
  v.auStand = true;
  rouler(chrono, [v], 3);
  v.auStand = false;
  rouler(chrono, [v], 25);
  const tours = chrono.tours(v);
  const marques = tours.filter(t => t.stand !== null);
  assert.ok(marques.length >= 1 && marques.length <= 2);
  const sortie = marques.at(-1);
  assert.ok(['OUT', 'IN/OUT'].includes(sortie.stand));
  assert.ok(Math.abs(sortie.tempsStand - 3) < 2 * DT);
  if (marques.length === 2) assert.equal(marques[0].stand, 'IN');
  assert.ok(tours.some(t => t.stand === null));
});

test('dans une course : le classement et les écarts de la tour viennent du chronométrage', () => {
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 6, nombreTours: 3 }, Circuit.generateur(6));
  for (let i = 0; i < 60 * 40; i++) c.pas();
  assert.deepEqual(c.classement(), c.chronometrage.classement());
  assert.equal(c.leader, c.chronometrage.classement()[0]);
  const e = c.ecarts('leader');
  assert.equal(e.get(c.leader).texte, 'Leader');
  c.classement().slice(1).forEach(v => assert.match(e.get(v).texte, /^\+(\d+\.\d|\d TOURS?)$/));
  // les intervalles : jamais négatifs, toujours un temps (hors doublés) ; le leader n'en a pas
  const intervalles = c.ecarts('intervalle');
  assert.equal(intervalles.get(c.leader).texte, 'Leader');
  c.classement().slice(1).forEach(v => {
    const e = intervalles.get(v);
    if (e.tours === 0) assert.ok(e.valeur >= 0 && Number.isFinite(e.valeur));
  });
  // meilleur tour de la course, après deux tours
  assert.ok(c.meilleurTour !== null && c.meilleurTour.temps > 8 && c.meilleurTour.temps < 40);
});

test('vehicle.js inchangé : même empreinte que la copie d\'origine (tests/vehicle.sha256)', () => {
  assert.equal(sha256('vehicle.js'), empreinteReference());
  // et VoitureF1 reste un Vehicle (le chronométrage ne pilote rien)
  assert.ok(VoitureF1.prototype instanceof Vehicle);
});
