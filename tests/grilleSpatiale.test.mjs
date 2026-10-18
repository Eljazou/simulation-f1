import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, generator, Vector } from './support.mjs';

// GrilleSpatiale : découpage de la fenêtre en cellules, et recherche des voisins dans les 9
// cellules proches. Le résultat doit être exactement celui du calcul direct (brute-force).

const { Vehicle, GrilleSpatiale } = loadScene(['vehicle.js', 'grilleSpatiale.js'], '({ Vehicle, GrilleSpatiale })');
// `nombre` véhicules à des positions au hasard (graine fixe) dans un rectangle donné.
function vehicules(nombre, graine, { x0 = 0, y0 = 0, x1 = 1000, y1 = 700 } = {}) {
  const alea = generator(graine);
  return Array.from({ length: nombre }, () => new Vehicle(x0 + alea() * (x1 - x0), y0 + alea() * (y1 - y0)));
}
// Rangs, dans `tous`, des véhicules d'une liste : pour comparer deux listes sans tenir compte de l'ordre.
const rangs = (tous, liste) => Array.from(liste, v => tous.indexOf(v)).sort((a, b) => a - b);

test('la grille est un outil de calcul : ce n\'est pas un Vehicle', () => {
  const grille = new GrilleSpatiale(1000, 700, 50);
  assert.equal(grille instanceof Vehicle, false);
  for (const propriete of ['pos', 'vel', 'acc', 'applyForce', 'update', 'show']) assert.equal(propriete in grille, false, propriete);
});

test('découpage : des cellules de la taille demandée couvrent toute la fenêtre', () => {
  const grille = new GrilleSpatiale(1000, 700, 50);
  assert.deepEqual([grille.taille, grille.colonnes, grille.lignes, grille.cellules.length], [50, 20, 14, 280]);
  // une fenêtre qui n'est pas un multiple de la taille : une colonne et une ligne de plus
  const autre = new GrilleSpatiale(1010, 701, 50);
  assert.deepEqual([autre.colonnes, autre.lignes], [21, 15]);
  // cellule plus grande que la fenêtre : une seule cellule
  const unique = new GrilleSpatiale(100, 80, 300);
  assert.deepEqual([unique.colonnes, unique.lignes], [1, 1]);
});

test('cellule d\'un point : bords compris, et hors fenêtre la cellule du bord le plus proche', () => {
  const grille = new GrilleSpatiale(1000, 700, 50);
  assert.deepEqual([grille.colonne(0), grille.colonne(49.9), grille.colonne(50), grille.colonne(999)], [0, 0, 1, 19]);
  assert.deepEqual([grille.ligne(0), grille.ligne(50), grille.ligne(699)], [0, 1, 13]);
  assert.deepEqual([grille.colonne(-30), grille.colonne(1000), grille.colonne(5000)], [0, 19, 19]);
  assert.deepEqual([grille.ligne(-1), grille.ligne(700), grille.ligne(9999)], [0, 13, 13]);
});

test('taille de cellule invalide : RangeError', () => {
  for (const taille of [0, -5, NaN, Infinity, undefined, 'abc']) {
    assert.throws(() => new GrilleSpatiale(1000, 700, taille), { name: 'RangeError' }, String(taille));
  }
});

test('voisins : exactement ceux du brute-force, sur des positions au hasard (graine fixe)', () => {
  for (const [nombre, graine, taille] of [[300, 7, 50], [600, 21, 50], [200, 3, 20], [150, 99, 150], [400, 5, 37]]) {
    const tous = vehicules(nombre, graine);
    const grille = new GrilleSpatiale(1000, 700, taille);
    grille.reconstruire(tous);
    let total = 0;
    for (const vehicule of tous) {
      const attendus = rangs(tous, GrilleSpatiale.voisinsParForceBrute(tous, vehicule, taille));
      assert.deepEqual(rangs(tous, grille.voisins(vehicule)), attendus, `graine ${graine}, taille ${taille}`);
      total += attendus.length;
    }
    assert.ok(total > 20, `le jeu de positions doit contenir des voisins (${total})`);
  }
});

test('voisins : même résultat pour un rayon plus petit que la cellule (séparation)', () => {
  const tous = vehicules(400, 11);
  const grille = new GrilleSpatiale(1000, 700, 60);
  grille.reconstruire(tous);
  for (const rayon of [60, 30, 12.5, 1]) {
    for (const vehicule of tous) {
      assert.deepEqual(rangs(tous, grille.voisins(vehicule, rayon)),
        rangs(tous, GrilleSpatiale.voisinsParForceBrute(tous, vehicule, rayon)));
    }
  }
});

test('voisins : identiques au brute-force même pour des véhicules sortis de la fenêtre', () => {
  // positions débordant largement de la fenêtre de 400 × 300, de tous les côtés
  const tous = vehicules(500, 13, { x0: -200, y0: -150, x1: 600, y1: 450 });
  const grille = new GrilleSpatiale(400, 300, 40);
  grille.reconstruire(tous);
  for (const vehicule of tous) {
    assert.deepEqual(rangs(tous, grille.voisins(vehicule)),
      rangs(tous, GrilleSpatiale.voisinsParForceBrute(tous, vehicule, 40)));
  }
  assert.ok(tous.some(v => v.pos.x < 0) && tous.some(v => v.pos.x > 400) && tous.some(v => v.pos.y < 0) && tous.some(v => v.pos.y > 300));
});

test('voisins : de part et d\'autre d\'une frontière de cellule, et en diagonale', () => {
  const a = new Vehicle(99, 99);                                  // cellule (1, 1)
  const b = new Vehicle(101, 99);                                 // cellule (2, 1)
  const c = new Vehicle(101, 101);                                // cellule (2, 2), en diagonale de a
  const d = new Vehicle(260, 99);                                 // loin
  const grille = new GrilleSpatiale(1000, 700, 50);
  grille.reconstruire([a, b, c, d]);
  assert.deepEqual(rangs([a, b, c, d], grille.voisins(a)), [1, 2]);
  assert.deepEqual(rangs([a, b, c, d], grille.voisins(d)), []);
});

test('voisins : le véhicule lui-même est exclu ; à distance exactement égale au rayon, pas voisin', () => {
  const a = new Vehicle(100, 100);
  const juste = new Vehicle(150, 100);                            // distance = 50 = rayon
  const dedans = new Vehicle(100, 149.999);
  const double = new Vehicle(100, 100);                           // au même endroit qu'un autre : voisin quand même
  const tous = [a, juste, dedans, double];
  const grille = new GrilleSpatiale(1000, 700, 50);
  grille.reconstruire(tous);
  assert.deepEqual(rangs(tous, grille.voisins(a)), [2, 3]);
  assert.deepEqual(rangs(tous, GrilleSpatiale.voisinsParForceBrute(tous, a, 50)), [2, 3]);
});

test('voisins : un véhicule qui n\'est pas rangé dans la grille peut chercher ses voisins', () => {
  const tous = vehicules(100, 4);
  const grille = new GrilleSpatiale(1000, 700, 80);
  grille.reconstruire(tous);
  const visiteur = new Vehicle(500, 350);
  assert.deepEqual(rangs(tous, grille.voisins(visiteur)),
    rangs(tous, GrilleSpatiale.voisinsParForceBrute(tous, visiteur, 80)));
});

test('voisins : un rayon plus grand que la cellule est refusé (des voisins seraient manqués)', () => {
  const grille = new GrilleSpatiale(1000, 700, 50);
  grille.reconstruire(vehicules(10, 1));
  assert.throws(() => grille.voisins(new Vehicle(10, 10), 50.01), { name: 'RangeError' });
  assert.doesNotThrow(() => grille.voisins(new Vehicle(10, 10), 50));
});

test('reconstruire : la grille repart de zéro à chaque image', () => {
  const tous = vehicules(50, 2);
  const grille = new GrilleSpatiale(1000, 700, 50);
  grille.reconstruire(tous);
  assert.equal(grille.cellules.reduce((somme, cellule) => somme + cellule.length, 0), 50);
  // les véhicules se déplacent, certains quittent la scène
  const restants = tous.slice(0, 20);
  restants.forEach((v, i) => { v.pos = new Vector(900 - i, 600); });
  grille.reconstruire(restants);
  assert.equal(grille.cellules.reduce((somme, cellule) => somme + cellule.length, 0), 20);
  for (const vehicule of restants) {
    assert.deepEqual(rangs(restants, grille.voisins(vehicule)),
      rangs(restants, GrilleSpatiale.voisinsParForceBrute(restants, vehicule, 50)));
  }
  grille.reconstruire([]);
  assert.deepEqual(Array.from(grille.voisins(restants[0])), []);
});

test('la grille ne regarde que les 9 cellules proches : bien moins de distances calculées', () => {
  const tous = vehicules(600, 17);
  const grille = new GrilleSpatiale(1000, 700, 50);
  grille.reconstruire(tous);
  const origine = GrilleSpatiale.proches;
  let comparaisons = 0;
  GrilleSpatiale.proches = (a, b, rayon) => { comparaisons++; return origine(a, b, rayon); };
  try {
    for (const vehicule of tous) grille.voisins(vehicule);
    const avecGrille = comparaisons;
    comparaisons = 0;
    for (const vehicule of tous) GrilleSpatiale.voisinsParForceBrute(tous, vehicule, 50);
    const sansGrille = comparaisons;
    assert.equal(sansGrille, 600 * 599);
    assert.ok(avecGrille > 0 && avecGrille < sansGrille / 10, `${avecGrille} comparaisons avec la grille, ${sansGrille} sans`);
  } finally {
    GrilleSpatiale.proches = origine;
  }
});

test('voisins : un véhicule rangé hors des 9 cellules proches n\'est même pas regardé', () => {
  const grille = new GrilleSpatiale(1000, 700, 50);
  const chercheur = new Vehicle(475, 325);                        // cellule (9, 6)
  const proche = new Vehicle(520, 360);                           // cellule (10, 7), voisine
  // véhicules piégés, deux cellules plus loin dans chaque direction : lire leur position est une erreur
  const pieges = [[375, 325], [575, 325], [475, 225], [475, 425], [375, 225], [575, 425]].map(([x, y]) => {
    const piege = new Vehicle(x, y);
    return { piege, armer() { Object.defineProperty(piege, 'pos', { get() { throw new Error('véhicule lointain regardé'); } }); } };
  });
  grille.reconstruire([chercheur, proche, ...pieges.map(p => p.piege)]);
  pieges.forEach(p => p.armer());
  assert.deepEqual(Array.from(grille.voisins(chercheur)), []);    // proche est à 57 px : regardé, mais pas voisin
  assert.throws(() => GrilleSpatiale.voisinsParForceBrute([chercheur, ...pieges.map(p => p.piege)], chercheur, 50), /lointain/);
});

test('proches : distance strictement inférieure au rayon, comparée sans racine carrée', () => {
  const a = new Vehicle(0, 0);
  assert.equal(GrilleSpatiale.proches(a, new Vehicle(3, 4), 5), false);     // distance = 5 exactement
  assert.equal(GrilleSpatiale.proches(a, new Vehicle(3, 3.99), 5), true);
  assert.equal(GrilleSpatiale.proches(a, new Vehicle(-30, 40), 50.01), true);
  assert.equal(GrilleSpatiale.proches(a, a, 1), true);                      // l'exclusion de soi-même se fait dans voisins()
});

test('la grille ne modifie aucun véhicule', () => {
  const tous = vehicules(80, 6);
  const avant = JSON.stringify(tous.map(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y, v.acc.x, v.acc.y]));
  const grille = new GrilleSpatiale(1000, 700, 50);
  grille.reconstruire(tous);
  tous.forEach(v => grille.voisins(v));
  assert.equal(JSON.stringify(tous.map(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y, v.acc.x, v.acc.y])), avant);
});
