import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator, near } from './support.mjs';

// Phase 4 : télémétrie (deux pilotes comparés), carte de chaleur, bulles de radio, prédiction de
// victoire (formule documentée), historique des positions, mini-carte. Des aides de lecture : aucune
// n'est un Vehicle, aucune ne change la course.

const scene = loadScene(F1, `({ Vehicle, Circuit, Course, VoitureF1, Telemetrie, CarteChaleur, BullesRadio, Prediction,
  HistoriquePositions, MiniCarte })`);
const { Vehicle, Circuit, Course, VoitureF1, Telemetrie, CarteChaleur, BullesRadio, Prediction, HistoriquePositions, MiniCarte } = scene;
const graine = n => {
  const u = generator(n);
  scene.context.random = (a, b) => (b === undefined ? u() * (a ?? 1) : a + u() * (b - a));
};
function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages }, Circuit.generateur(1999));
}
function jusqua(c, condition, limite = 60 * 300, chaquePas = () => {}) {
  for (let i = 0; i < limite; i++) {
    if (condition(c)) return i;
    c.pas();
    chaquePas(c);
  }
  return assert.fail('condition jamais atteinte');
}
const enCourse = c => jusqua(c, x => x.etat === Course.ETATS.COURSE);
const appels = nom => scene.calls.filter(a => a[0] === nom);

test('classes : télémétrie, carte de chaleur, radio, prédiction, historique, mini-carte ne sont pas des Vehicle', () => {
  for (const Classe of [Telemetrie, CarteChaleur, BullesRadio, Prediction, HistoriquePositions, MiniCarte]) {
    assert.ok(!(Classe.prototype instanceof Vehicle), Classe.name);
  }
});

test('les outils de lecture ne changent jamais la course (mêmes positions, avec ou sans eux)', () => {
  const positions = outils => {
    graine(11);
    const c = course({ nombreVoitures: 8 });
    const t = new Telemetrie();
    const h = new HistoriquePositions();
    const carte = new CarteChaleur();
    for (let i = 0; i < 1500; i++) {
      c.pas();
      if (outils) {
        t.update(c);
        h.update(c);
        carte.update(1 / 60, c);
        Prediction.probabilites(c);
      }
    }
    return c.voitures.map(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y]);
  };
  assert.deepEqual(positions(true), positions(false));
});

test('télémétrie : une mesure par PERIODE de temps de course, fenêtre de DUREE s, rien avant le départ, remise à zéro à la nouvelle course', () => {
  const c = course({ nombreVoitures: 4 });
  const t = new Telemetrie();
  for (let i = 0; i < 60; i++) {
    c.pas();
    t.update(c);
  }
  assert.ok([...t.series.values()].every(s => s.length === 0));
  enCourse(c);
  const debut = c.chronometrage.horloge;
  jusqua(c, x => x.chronometrage.horloge - debut >= 5, 60 * 60, x => t.update(x));
  const serie = t.series.get(c.voitures[0]);
  // une mesure toutes les 0,1 s : environ 50 en 5 s (au pas d'1/60 s près)
  assert.ok(Math.abs(serie.length - 5 / Telemetrie.PERIODE) <= 2, `${serie.length} mesures`);
  // intervalle moyen : PERIODE (à un pas de simulation près pour chaque mesure)
  near((serie.at(-1).t - serie[0].t) / (serie.length - 1), Telemetrie.PERIODE, 1 / 60 / (serie.length - 1) + 1e-9);
  for (let k = 1; k < serie.length; k++) assert.ok(serie[k].t - serie[k - 1].t >= Telemetrie.PERIODE - 1 / 60 - 1e-9);
  const m = serie.at(-1);
  for (const cle of ['vitesse', 'accelerateur', 'frein', 'temperature', 'derive']) assert.ok(Number.isFinite(m[cle]), cle);
  assert.ok(m.accelerateur >= 0 && m.accelerateur <= 1 && m.frein >= 0 && m.frein <= 1);
  // fenêtre glissante
  jusqua(c, x => x.chronometrage.horloge - debut >= Telemetrie.DUREE + 6, 60 * 60, x => t.update(x));
  const longue = t.series.get(c.voitures[0]);
  assert.ok(longue[0].t >= longue.at(-1).t - Telemetrie.DUREE - 1e-9);
  assert.ok(longue.length <= Telemetrie.DUREE / Telemetrie.PERIODE + 2);
  c.nouvelleCourse();
  t.update(c);
  assert.equal(t.series.size, 0);
});

test('télémétrie : les deux pilotes comparés selon le mode ; clic sur l\'en-tête pour replier ; replié, seul l\'en-tête est dessiné', () => {
  const c = course({ nombreVoitures: 6, ecuries: 3 });
  enCourse(c);
  for (let i = 0; i < 600; i++) c.pas();
  const ordre = c.classement();
  c.selection = ordre[2];
  assert.deepEqual(Array.from(Telemetrie.paire(c, 'devant')), [ordre[2], ordre[1]]);
  assert.deepEqual(Array.from(Telemetrie.paire(c, 'derriere')), [ordre[2], ordre[3]]);
  assert.deepEqual(Array.from(Telemetrie.paire(c, 'leader')), [ordre[2], ordre[0]]);
  const [, coequipier] = Telemetrie.paire(c, 'coequipier');
  assert.ok(coequipier !== ordre[2] && coequipier.ecurie === ordre[2].ecurie);
  // une écurie par voiture : pas de coéquipier, B est null
  const seuls = course({ nombreVoitures: 3, ecuries: 3 });
  assert.equal(Telemetrie.paire(seuls, 'coequipier')[1], null);
  // sans voiture choisie : le leader, comparé au deuxième
  c.selection = null;
  assert.deepEqual(Array.from(Telemetrie.paire(c, 'devant')), [ordre[0], ordre[1]]);
  const t = new Telemetrie();
  const zone = { x: 0, y: 0, largeur: 800, hauteur: 600 };
  scene.calls.length = 0;
  t.show(c, zone);
  const deplie = appels('beginShape').length;
  assert.equal(deplie, Telemetrie.COURBES.reduce((n, courbe) => n + courbe.cles.length * 2, 0));
  // un clic hors de l'en-tête n'est pas pris ; sur l'en-tête, le panneau se replie
  assert.equal(t.clic(zone.largeur - 2, 2), false);
  const e = t.entete;
  assert.equal(t.clic(e.x + 5, e.y + 5), true);
  assert.equal(t.replie, true);
  scene.calls.length = 0;
  t.show(c, zone);
  assert.equal(appels('beginShape').length, 0);
  assert.equal(t.clic(t.entete.x + 5, t.entete.y + 5), true);
  assert.equal(t.replie, false);
});

// Une course factice pour vérifier la formule exactement.
function courseFactice({ voitures, ecarts, meilleurs, tours = 5, demarre = true, vainqueur = null, abandons = [] }) {
  return {
    voitures,
    classement: () => voitures,
    parametres: { nombreTours: tours },
    chronometrage: {
      demarre, vainqueur,
      abandon: v => abandons.includes(v),
      meilleurPersonnel: v => (meilleurs.has(v) ? { temps: meilleurs.get(v) } : null),
      ecarts: () => ecarts,
    },
  };
}
const voitureFactice = (nom, reglages = {}) => ({ nom, tour: 2, pneus: 0.9, penaliteStand: 0, auStand: false, horsCourse: false,
  parametres: { seuilStand: 0.35 }, ...reglages });

test('prédiction : la formule documentée (écart, rythme × tours restants, stand à faire, σ selon les tours restants)', () => {
  const a = voitureFactice('A');
  const b = voitureFactice('B');
  const d = voitureFactice('D', { pneus: 0.3 });                   // devra encore s'arrêter
  const ecarts = new Map([[a, { valeur: 0, tours: 0 }], [b, { valeur: 1.5, tours: 0 }], [d, { valeur: 0.5, tours: 0 }]]);
  const meilleurs = new Map([[a, 16.0], [b, 15.8], [d, 16.1]]);
  const c = courseFactice({ voitures: [a, b, d], ecarts, meilleurs });
  const p = Prediction.probabilites(c);
  const L = 3;                                                      // 5 tours, le leader en a fait 2
  const sigma = Prediction.T_BASE + Prediction.T_RACINE * Math.sqrt(L + 1);
  // place en piste : A 1re, B 2e, D 3e (ordre du classement)
  const q = Prediction.POIDS_PLACE;
  const projete = { A: 0 + 0.2 * L, B: 1.5 + 0 + q, D: 0.5 + 0.3 * L + Prediction.PERTE_STAND + 2 * q };
  const min = Math.min(...Object.values(projete));
  const scores = Object.fromEntries(Object.entries(projete).map(([k, v]) => [k, Math.exp(-(v - min) / sigma)]));
  const somme = scores.A + scores.B + scores.D;
  near(p.get(a), scores.A / somme, 1e-12);
  near(p.get(b), scores.B / somme, 1e-12);
  near(p.get(d), scores.D / somme, 1e-12);
  near(p.get(a) + p.get(b) + p.get(d), 1, 1e-12);
  // une pénalité de stand à purger fait baisser la probabilité
  d.penaliteStand = 10;
  assert.ok(Prediction.probabilites(c).get(d) < p.get(d));
  // abandon : 0 ; vainqueur connu : 1 pour lui
  const apres = Prediction.probabilites(courseFactice({ voitures: [a, b, d], ecarts, meilleurs, abandons: [b] }));
  assert.equal(apres.get(b), 0);
  const fin = Prediction.probabilites(courseFactice({ voitures: [a, b, d], ecarts, meilleurs, vainqueur: a }));
  assert.deepEqual([fin.get(a), fin.get(b), fin.get(d)], [1, 0, 0]);
});

test('prédiction : avant le départ, la grille ; plus il reste de tours, plus c\'est incertain ; dans une vraie course, somme 1', () => {
  const voitures = ['A', 'B', 'C'].map(n => voitureFactice(n));
  const avant = Prediction.probabilites(courseFactice({ voitures, ecarts: new Map(), meilleurs: new Map(), demarre: false }));
  assert.ok(avant.get(voitures[0]) > avant.get(voitures[1]) && avant.get(voitures[1]) > avant.get(voitures[2]));
  // même écart de 2 s : au dernier tour, le leader est plus sûr de gagner qu'à 10 tours de la fin
  const [a, b] = voitures;
  const ecarts = new Map([[a, { valeur: 0, tours: 0 }], [b, { valeur: 2, tours: 0 }]]);
  const fin = Prediction.probabilites(courseFactice({ voitures: [{ ...a, tour: 4 }, b].map((v, k) => (k === 0 ? Object.assign(a, { tour: 4 }) : v)), ecarts, meilleurs: new Map(), tours: 5 }));
  const loin = Prediction.probabilites(courseFactice({ voitures: [Object.assign(a, { tour: 0 }), b], ecarts, meilleurs: new Map(), tours: 10 }));
  assert.ok(fin.get(a) > loin.get(a));
  const c = course({ nombreVoitures: 8 });
  enCourse(c);
  for (let i = 0; i < 900; i++) c.pas();
  const p = Prediction.probabilites(c);
  near([...p.values()].reduce((s, x) => s + x, 0), 1, 1e-9);
  assert.ok([...p.values()].every(x => x >= 0 && x <= 1));
});

test('carte de chaleur : vitesse moyenne par point de piste, lieux des dépassements, couleurs bleu → rouge, remise à zéro', () => {
  const c = course({ nombreVoitures: 6 });
  const carte = new CarteChaleur();
  enCourse(c);
  const v = c.voitures[0];
  // moyenne en un point : la somme des vitesses mesurées divisée par leur nombre
  carte.update(1 / 60, c);
  const i = v.indicePiste;
  const attendu = c.voitures.filter(x => x.indicePiste === i && x.etat === VoitureF1.ETATS.COURSE && !x.auStand && x.vitesse > CarteChaleur.VITESSE_MIN);
  if (attendu.length > 0) near(carte.moyenne(i), attendu.reduce((s, x) => s + x.vitesse, 0) / attendu.length, 1e-9);
  for (let k = 0; k < 1200; k++) {
    c.pas();
    carte.update(1 / 60, c);
  }
  assert.ok(carte.comptes.some(n => n > 0));
  // un dépassement compté : sa position est retenue
  const avant = carte.depassements.length;
  v.depassements++;
  carte.update(1 / 60, c);
  assert.equal(carte.depassements.length, avant + 1);
  near(carte.depassements.at(-1).x, v.pos.x);
  assert.deepEqual(Array.from(CarteChaleur.couleur(0)), [40, 90, 230]);
  assert.deepEqual(Array.from(CarteChaleur.couleur(1)), [235, 50, 40]);
  // le tracé : précalculé, redessiné toutes les RAFRAICHIR secondes seulement
  const crees = scene.graphiques.crees.length;
  carte.show();
  assert.equal(scene.graphiques.crees.length, crees + 1);
  const g = carte.calque;
  carte.update(0.5, c);
  carte.show();
  assert.equal(carte.calque, g);
  assert.equal(scene.graphiques.crees.length, crees + 1);
  c.nouvelleCourse();
  carte.update(1 / 60, c);
  assert.equal(carte.depassements.length, 0);
});

test('bulles de radio : la plus récente par voiture, MAX à la fois, texte coupé ; dessinées au-dessus de la voiture', () => {
  const c = course({ nombreVoitures: 6 });
  const [a, b] = c.voitures;
  c.radio(a, 'Premier message');
  c.radio(a, 'Laisse passer ton coéquipier au prochain virage');
  c.radio(b, 'Box box');
  const visibles = BullesRadio.visibles(c.messagesRadio);
  assert.equal(visibles.length, 2);
  assert.equal(visibles.find(m => m.voiture === a).texte, 'Laisse passer ton coéquipier au prochain virage');
  c.voitures.forEach((v, k) => c.radio(v, `Message ${k}`));
  assert.ok(BullesRadio.visibles(c.messagesRadio).length <= BullesRadio.MAX);
  const lignes = BullesRadio.lignes('Ordre d\'équipe : laisse passer la voiture numéro 12 dans la ligne droite');
  assert.ok(lignes.length >= 2 && lignes.every(l => l.length <= BullesRadio.LARGEUR_MAX));
  assert.equal(lignes.join(' '), 'Ordre d\'équipe : laisse passer la voiture numéro 12 dans la ligne droite');
  // dessin : la bulle est au-dessus de la voiture (y plus petit)
  c.messagesRadio = [{ texte: 'Box box', voiture: a, age: 1 }];
  scene.calls.length = 0;
  new BullesRadio().show(c, 1);
  const bulle = appels('rect')[0];
  assert.ok(bulle[2] < a.pos.y);
  // pas de message : rien
  c.messagesRadio = [];
  scene.calls.length = 0;
  new BullesRadio().show(c, 1);
  assert.equal(appels('rect').length, 0);
});

test('historique des positions : une mesure par seconde de course, positions du classement, arrêt à l\'arrivée', () => {
  const c = course({ nombreVoitures: 5, nombreTours: 1 });
  const h = new HistoriquePositions();
  enCourse(c);
  const debut = c.chronometrage.horloge;
  jusqua(c, x => x.chronometrage.horloge - debut >= 10.5, 60 * 30, x => h.update(x));
  assert.ok(Math.abs(h.mesures.length - 11) <= 1, `${h.mesures.length} mesures`);
  const ordre = c.classement();
  const derniere = h.mesures.at(-1);
  // à l'image de la dernière mesure, positions 1..n, toutes différentes
  assert.deepEqual([...derniere.positions.values()].sort((x, y) => x - y), [1, 2, 3, 4, 5]);
  assert.equal(h.positions(ordre[0]).length, h.mesures.length);
  jusqua(c, x => x.chronometrage.vainqueur !== null, 60 * 120, x => h.update(x));
  const n = h.mesures.length;
  for (let i = 0; i < 180; i++) {
    c.pas();
    h.update(c);
  }
  assert.equal(h.mesures.length, n);
});

test('mini-carte : tout le circuit tient dans le carré ; tracé précalculé une fois ; un point par voiture', () => {
  const c = course({ nombreVoitures: 6 });
  const m = new MiniCarte();
  for (const p of c.circuit.points) {
    const q = MiniCarte.versCarte(c.circuit, p.x, p.y);
    assert.ok(q.x >= MiniCarte.MARGE - 1e-9 && q.x <= MiniCarte.TAILLE - MiniCarte.MARGE + 1e-9);
    assert.ok(q.y >= MiniCarte.MARGE - 1e-9 && q.y <= MiniCarte.TAILLE - MiniCarte.MARGE + 1e-9);
  }
  const crees = scene.graphiques.crees.length;
  scene.calls.length = 0;
  m.show(c, 0, 0);
  m.show(c, 0, 0);
  assert.equal(scene.graphiques.crees.length, crees + 1);
  // deux fois : 6 voitures + le cercle du leader (+ la voiture choisie : aucune)
  assert.ok(appels('circle').length >= 2 * c.voitures.length);
  // drapeau jaune dans un secteur : il est tracé en jaune
  c.incidents.secteursJaunes = new Set([1]);
  scene.calls.length = 0;
  m.show(c, 0, 0);
  assert.ok(appels('line').length > 5);
});

test('télémétrie : gaz et frein lissés (la demande du steering change à chaque image) ; l\'état de la voiture n\'est pas touché', () => {
  const voiture = { vitesse: 3, maxForce: 0.5, freine: false, temperaturePneus: 90, derive: 0, etatPneus: { demande: { long: 0.5, lat: 0 } } };
  const chronometrage = { horloge: 0, demarre: true };
  const c = { voitures: [voiture], chronometrage };
  const t = new Telemetrie();
  for (let i = 0; i < 600; i++) {
    voiture.etatPneus.demande.long = i % 2 === 0 ? 0.5 : 0;     // plein gaz une image sur deux
    chronometrage.horloge = i / 60;
    t.update(c);
  }
  const serie = t.series.get(voiture);
  const recentes = serie.slice(-20).map(m => m.accelerateur);
  // la courbe montre la tendance (à mi-gaz), pas le clignotement 0 / 1
  assert.ok(recentes.every(a => a > 0.3 && a < 0.7), recentes.join(' '));
  assert.equal(voiture.etatPneus.demande.long, 0);               // lu, jamais écrit
  // gaz constant : la valeur lissée le rejoint
  for (let i = 600; i < 700; i++) {
    voiture.etatPneus.demande.long = 0.5;
    chronometrage.horloge = i / 60;
    t.update(c);
  }
  near(t.series.get(voiture).at(-1).accelerateur, 1, 1e-3);
});
