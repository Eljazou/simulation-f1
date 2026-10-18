import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, Vector, near, own } from './support.mjs';

// Particule : arrive sur son point sans le dépasser, fuit le curseur puis revient, et reste dans
// la fenêtre quand elle n'a pas de point.

const scene = () => loadScene(['vehicle.js', 'particule.js'], '({ Vehicle, Particule })');
const L = 1000;
const H = 700;
// Contexte minimal de applyBehaviors : ni curseur ni perturbation.
const seule = { largeur: L, hauteur: H };
// Une particule qui vise le point (x, y).
function visant(Particule, depart, point) {
  const particule = new Particule(...depart);
  particule.viser({ x: point[0], y: point[1] }, 0);
  return particule;
}
const pas = (particule, contexte = seule) => { particule.applyBehaviors(contexte); particule.update(); };

test('une Particule étend Vehicle, avec ses réglages et ses états de départ', () => {
  const { Vehicle, Particule } = scene();
  const particule = new Particule(10, 20);
  assert.equal(Object.getPrototypeOf(Particule), Vehicle);
  assert.ok(particule instanceof Vehicle);
  assert.deepEqual([particule.r, particule.maxSpeed, particule.maxForce, particule.rayonZoneDeFreinage], [4, 6, 0.4, 100]);
  assert.deepEqual([particule.etat, particule.cible, particule.rang], ['fraiche', null, -1]);
  // comportements et locomotion hérités, pas recopiés ; flee et update sont redéfinies
  for (const methode of ['seek', 'arrive', 'wander', 'boundaries', 'applyForce']) {
    assert.equal(particule[methode], Vehicle.prototype[methode], methode);
  }
  assert.notEqual(particule.flee, Vehicle.prototype.flee);
});

test('arrive : la particule converge vers son point, sans le dépasser, et s\'y arrête', () => {
  const { Particule } = scene();
  const particule = visant(Particule, [100, 100], [700, 450]);
  const direction = new Vector(600, 350).setMag(1);
  let precedente = particule.distanceCible();
  let vitesseMax = 0;
  for (let i = 0; i < 400; i++) {
    pas(particule);
    const distance = particule.distanceCible();
    assert.ok(distance <= precedente + 1e-9, `image ${i} : la distance augmente`);
    // jamais de l'autre côté du point : le reste à parcourir garde le sens du départ
    const reste = (700 - particule.pos.x) * direction.x + (450 - particule.pos.y) * direction.y;
    assert.ok(reste >= -1e-9, `image ${i} : point dépassé de ${-reste}`);
    assert.ok(particule.vel.mag() <= particule.maxSpeed + 1e-9, `image ${i}`);
    vitesseMax = Math.max(vitesseMax, particule.vel.mag());
    precedente = distance;
  }
  near(vitesseMax, particule.maxSpeed, 1e-6);          // elle a bien atteint sa vitesse de croisière
  assert.ok(particule.distanceCible() < 0.01, `distance finale ${particule.distanceCible()}`);
  assert.ok(particule.vel.mag() < 0.01, `vitesse finale ${particule.vel.mag()}`);
  assert.equal(particule.estArrivee(), true);
});

test('arrive : lancée à pleine vitesse au bord de la zone de freinage, elle ne dépasse pas', () => {
  const { Particule } = scene();
  const particule = visant(Particule, [300, 300], [400, 300]);   // à 100 px : bord de la zone
  particule.vel.set(6, 0);
  for (let i = 0; i < 300; i++) {
    pas(particule);
    assert.ok(particule.pos.x <= 400 + 1e-9, `image ${i} : x = ${particule.pos.x}`);
  }
  assert.ok(particule.distanceCible() < 0.01);
  assert.ok(particule.vel.mag() < 0.01);
});

test('arrive : dans la zone de freinage la vitesse désirée est proportionnelle à la distance', () => {
  const { Particule } = scene();
  const particule = visant(Particule, [0, 0], [50, 0]);          // à mi-zone : moitié de maxSpeed
  particule.vel.set(3, 0);
  particule.applyBehaviors(seule);
  near(particule.acc.mag(), 0);                                  // déjà à la bonne vitesse
  assert.equal(particule.freine, true);
  const loin = visant(Particule, [0, 0], [500, 0]);
  loin.applyBehaviors(seule);
  near(loin.acc.x, loin.maxForce);                               // hors zone : force maximale
  assert.equal(loin.freine, false);
});

test('la force d\'arrivée seule ne dépasse jamais maxForce', () => {
  const { Particule } = scene();
  const particule = visant(Particule, [900, 50], [100, 600]);
  particule.vel.set(-3, -5);
  for (let i = 0; i < 300; i++) {
    particule.applyBehaviors(seule);
    assert.ok(particule.acc.mag() <= particule.maxForce + 1e-9, `image ${i}`);
    particule.update();
  }
});

test('flee redéfinie : retourne un vecteur qui éloigne, limité à maxForce', () => {
  const { Particule } = scene();
  const particule = new Particule(200, 200);
  const force = particule.flee(new Vector(260, 200));            // menace à droite
  assert.ok(force instanceof Vector);                            // une valeur est retournée
  near(force.mag(), particule.maxForce);
  near(force.x, -particule.maxForce);                            // vers la gauche
  near(force.y, 0);
  // flee calcule une force : elle ne déplace rien et n'applique rien elle-même
  assert.deepEqual([particule.pos.x, particule.pos.y, particule.vel.x, particule.vel.y, particule.acc.x, particule.acc.y],
    [200, 200, 0, 0, 0, 0]);
});

test('flee : vitesse désirée opposée à la cible, moins la vitesse actuelle (seek inversé)', () => {
  const { Particule } = scene();
  const particule = new Particule(0, 0);
  particule.vel.set(0, 4);
  const menace = new Vector(30, 40);
  const force = particule.flee(menace);
  const desiree = new Vector(-30, -40).setMag(particule.maxSpeed);
  const attendue = Vector.sub(desiree, new Vector(0, 4)).limit(particule.maxForce);
  near(force.x, attendue.x);
  near(force.y, attendue.y);
  assert.ok(force.mag() <= particule.maxForce + 1e-12);
  // exactement l'opposé de la vitesse désirée de seek : seek(menace) viserait (+30, +40)
  const versMenace = particule.seek(menace);
  assert.ok(force.x * versMenace.x + force.y * versMenace.y < 0);
});

test('flee : force faible non amplifiée, et valeur finie même sur la menace', () => {
  const { Particule } = scene();
  const particule = new Particule(100, 100);
  particule.vel.set(-5.9, 0);                                    // fuit déjà presque à maxSpeed
  const force = particule.flee(new Vector(200, 100));
  near(force.x, -0.1);
  near(force.y, 0);
  const dessus = new Particule(50, 50);
  dessus.vel.set(1, 2);
  const nulle = dessus.flee(new Vector(50, 50));                 // aucune direction de fuite
  assert.ok(Number.isFinite(nulle.x) && Number.isFinite(nulle.y));
  assert.ok(nulle.mag() <= dessus.maxForce + 1e-12);
});

test('garderDansFenetre : une force (pas une vitesse), limitée à maxForce, nulle loin des bords', () => {
  const { Particule } = scene();
  const centre = new Particule(500, 350);
  centre.vel.set(3, 1);
  const aucune = centre.garderDansFenetre(L, H);
  assert.deepEqual([aucune.x, aucune.y], [0, 0]);

  const bord = new Particule(10, 350);                           // à 10 px du bord gauche
  bord.vel.set(-4, 0);                                           // et elle sort
  const force = bord.garderDansFenetre(L, H);
  // boundaries() de Vehicle renvoie ici la vitesse désirée, de norme maxSpeed
  near(bord.boundaries(0, 0, L, H, 40).mag(), bord.maxSpeed);
  // garderDansFenetre renvoie la force : vitesse désirée - vitesse actuelle, limitée
  const attendue = Vector.sub(new Vector(6, 0), new Vector(-4, 0)).limit(bord.maxForce);
  near(force.x, attendue.x);
  near(force.y, attendue.y);
  near(force.mag(), bord.maxForce);
  assert.ok(force.mag() < bord.maxSpeed);
});

test('garderDansFenetre : chaque bord repousse vers l\'intérieur, force faible non amplifiée', () => {
  const { Particule } = scene();
  const cas = [[5, 350, 'x', 1], [L - 5, 350, 'x', -1], [500, 5, 'y', 1], [500, H - 5, 'y', -1]];
  for (const [x, y, axe, sens] of cas) {
    const particule = new Particule(x, y);
    const force = particule.garderDansFenetre(L, H);
    assert.ok(force[axe] * sens > 0, `bord (${x}, ${y})`);
    assert.ok(force.mag() <= particule.maxForce + 1e-12);
  }
  const presqueBon = new Particule(5, 350);
  presqueBon.vel.set(5.9, 0);                                    // rentre déjà presque à maxSpeed
  near(presqueBon.garderDansFenetre(L, H).x, 0.1);
  // la marge est réglable : à 60 px du bord, rien avec 40 px de marge, une force avec 80
  const moyen = new Particule(60, 350);
  assert.equal(moyen.garderDansFenetre(L, H).mag(), 0);
  assert.ok(moyen.garderDansFenetre(L, H, 80).x > 0);
});

test('particule sans point : elle erre et reste dans la fenêtre', () => {
  const { Particule } = scene();
  const dehors = p => Math.max(-p.pos.x, p.pos.x - L, -p.pos.y, p.pos.y - H);
  // partie de l'intérieur à pleine vitesse, dans les quatre directions : elle ne sort jamais
  for (const depart of [[500, 350], [60, 60], [L - 60, H - 60], [60, H - 60], [L - 60, 60]]) {
    for (const vitesse of [[6, 0], [-6, 0], [0, 6], [0, -6], [4.2, 4.2], [-4.2, -4.2]]) {
      const particule = new Particule(...depart);
      particule.vel.set(...vitesse);
      for (let i = 0; i < 2000; i++) {
        pas(particule);
        assert.ok(dehors(particule) <= 0, `départ ${depart}, vitesse ${vitesse}, image ${i}`);
        assert.ok(particule.vel.mag() <= particule.maxSpeed + 1e-9);
      }
      assert.ok(particule.vel.mag() > 0.5);                      // elle erre vraiment
    }
  }
});

test('particule lancée vers l\'extérieur depuis un coin : elle revient, puis ne ressort plus', () => {
  const { Particule } = scene();
  const dehors = p => Math.max(-p.pos.x, p.pos.x - L, -p.pos.y, p.pos.y - H);
  const particule = new Particule(L - 10, H - 10);
  particule.vel.set(4.2, 4.2);                                   // déjà dans la marge, et elle sort
  let pire = 0;
  for (let i = 0; i < 120; i++) { pas(particule); pire = Math.max(pire, dehors(particule)); }
  assert.ok(pire > 0 && pire < 30, `sortie de ${pire} px`);     // elle sort un peu : inertie
  assert.ok(dehors(particule) <= 0);                             // revenue en moins de 2 s
  for (let i = 0; i < 2000; i++) { pas(particule); assert.ok(dehors(particule) <= 0, `image ${i}`); }
});

test('curseur : fuite seulement dans le rayon de répulsion (bord exclu), avec son poids', () => {
  const { Particule } = scene();
  const curseur = { pos: new Vector(150, 100), rayonRepulsion: 50 };
  const particule = visant(Particule, [100, 100], [100, 100]);   // posée sur son point
  particule.applyBehaviors({ ...seule, curseur });
  assert.equal(particule.fuit, false);                           // exactement à 50 px : hors rayon
  near(particule.acc.mag(), 0);

  curseur.pos.set(149, 100);
  particule.applyBehaviors({ ...seule, curseur });
  assert.equal(particule.fuit, true);
  near(particule.acc.x, -Particule.POIDS_FUITE * particule.maxForce);   // fuite ×2, arrivée nulle
  near(particule.acc.y, 0);

  curseur.rayonRepulsion = 0;                                    // rayon nul : jamais de fuite
  const autre = visant(Particule, [149, 100], [149, 100]);
  autre.applyBehaviors({ ...seule, curseur });
  assert.equal(autre.fuit, false);
});

test('la souris fait fuir la particule, qui revient ensuite à sa place', () => {
  const { Particule } = scene();
  const particule = visant(Particule, [400, 300], [400, 300]);
  const curseur = { pos: new Vector(430, 300), rayonRepulsion: 90 };
  for (let i = 0; i < 90; i++) pas(particule, { ...seule, curseur });
  assert.ok(particule.distanceCible() > 30, `écart ${particule.distanceCible()}`);
  assert.ok(particule.pos.x < 400);                              // du côté opposé au curseur
  for (let i = 0; i < 400; i++) pas(particule);                  // le curseur est parti
  assert.ok(particule.distanceCible() < 0.01);
  assert.ok(particule.vel.mag() < 0.01);
});

test('perturbations : chaque force fournie est appliquée, en plus de l\'arrivée', () => {
  const { Particule } = scene();
  const particule = visant(Particule, [100, 100], [100, 100]);
  const vues = [];
  const perturbations = [
    { repousser: p => { vues.push(p); return new Vector(1, 0); } },
    { repousser: () => new Vector(0, -2) },
  ];
  particule.applyBehaviors({ ...seule, perturbations });
  assert.deepEqual([particule.acc.x, particule.acc.y], [1, -2]);
  assert.equal(vues[0], particule);
});

test('détachée (effacement) : elle lâche son point, erre et reste dans la fenêtre', () => {
  const { Particule } = scene();
  const particule = visant(Particule, [500, 350], [900, 350]);
  particule.applyBehaviors({ ...seule, detachee: true });
  // errance douce : norme maxForce × POIDS_DETACHEMENT, pas la force d'arrivée (maxForce vers la droite)
  near(particule.acc.mag(), particule.maxForce * Particule.POIDS_DETACHEMENT);
  assert.ok(Particule.POIDS_DETACHEMENT < Particule.POIDS_ERRANCE);
  // une particule sans point erre plus franchement
  const libre = new Particule(500, 350);
  libre.applyBehaviors(seule);
  near(libre.acc.mag(), libre.maxForce * Particule.POIDS_ERRANCE);
  assert.equal(particule.freine, false);
  assert.notEqual(particule.cible, null);                        // le point est conservé
});

test('états : fraîche -> fixée une seule fois ; mangée : ni force, ni mouvement, ni dessin', () => {
  const { Particule, calls } = scene();
  const particule = visant(Particule, [100, 100], [300, 100]);
  assert.equal(particule.fixer(), true);
  assert.equal(particule.fixer(), false);
  assert.deepEqual([particule.etat, particule.fixee, particule.mangee], ['fixee', true, false]);
  particule.manger();
  assert.deepEqual([particule.etat, particule.fixee, particule.mangee], ['mangee', false, true]);
  assert.equal(particule.fixer(), false);                        // une particule mangée ne se fixe pas
  particule.vel.set(2, 0);
  calls.length = 0;
  pas(particule);
  particule.show();
  particule.showDebug(true);
  assert.deepEqual([particule.pos.x, particule.acc.x], [100, 0]);
  assert.equal(calls.length, 0);
  particule.rafraichir();
  assert.equal(particule.etat, 'fraiche');
  // une particule sans point n'a nulle part où se fixer
  const libre = new Particule(0, 0);
  assert.equal(libre.fixer(), false);
  assert.equal(libre.etat, 'fraiche');
  pas(particule);
  assert.ok(particule.pos.x > 100);                              // elle repart vers son point
});

test('viser et libérer : le point est copié, le rang suit', () => {
  const { Particule } = scene();
  const particule = new Particule(0, 0);
  const point = { x: 30, y: 40 };
  particule.viser(point, 7);
  point.x = 999;                                                 // le point d'origine peut changer
  assert.deepEqual([particule.cible.x, particule.cible.y, particule.rang], [30, 40, 7]);
  assert.equal(particule.distanceCible(), 50);
  assert.equal(particule.estArrivee(), false);
  assert.equal(particule.estArrivee(50), true);                  // bord compris
  particule.liberer();
  assert.deepEqual([particule.cible, particule.rang, particule.distanceCible()], [null, -1, Infinity]);
  assert.equal(particule.estArrivee(), false);
});

test('couleur selon la vitesse : froide à l\'arrêt, chaude à maxSpeed, bornée au-delà', () => {
  const { Particule } = scene();
  const particule = new Particule(0, 0);
  assert.deepEqual(own(particule.couleur()), [70, 150, 255]);
  particule.vel.set(3, 0);                                       // moitié de maxSpeed
  assert.deepEqual(own(particule.couleur()), [162.5, 130, 147.5]);
  particule.vel.set(0, 6);
  assert.deepEqual(own(particule.couleur()), [255, 110, 40]);
  particule.vel.set(60, 0);
  assert.deepEqual(own(particule.couleur()), [255, 110, 40]);
  particule.maxSpeed = 0;                                        // pas de division par zéro
  assert.deepEqual(own(particule.couleur()), [70, 150, 255]);
});

test('dessin : disque terne et réduit tant que l\'encre est fraîche, plein une fois fixée', () => {
  const { Particule, calls } = scene();
  const particule = new Particule(120, 80);
  particule.viser({ x: 120, y: 80 }, 0);
  particule.show();
  assert.deepEqual(calls.find(c => c[0] === 'fill'), ['fill', 70, 150, 255, 110]);
  near(calls.find(c => c[0] === 'circle')[3], 5.6);
  calls.length = 0;
  particule.fixer();
  particule.show();
  assert.deepEqual(calls.find(c => c[0] === 'fill'), ['fill', 70, 150, 255, 255]);
  assert.deepEqual(calls.find(c => c[0] === 'circle'), ['circle', 120, 80, 8]);
  assert.equal(calls.filter(c => c[0] === 'push').length, calls.filter(c => c[0] === 'pop').length);
});

test('debug : vecteur vers la cible ; témoin : zone de freinage au bon rayon, jaune puis rouge', () => {
  const { Particule, calls } = scene();
  const particule = visant(Particule, [100, 100], [400, 100]);
  particule.applyBehaviors(seule);
  particule.showDebug();
  assert.deepEqual(calls.find(c => c[0] === 'line'), ['line', 100, 100, 400, 100]);
  assert.equal(calls.filter(c => c[0] === 'circle').length, 0);  // pas de cercle hors témoin

  calls.length = 0;
  particule.showDebug(true);
  // rayon réel de 100 px : circle reçoit le diamètre, 200 (vehicle.js passe 100 par erreur)
  assert.deepEqual(calls.find(c => c[0] === 'circle'), ['circle', 400, 100, 200]);
  assert.ok(calls.some(c => c[0] === 'stroke' && c[1] === 'yellow'));
  assert.ok(!calls.some(c => c[0] === 'stroke' && c[1] === 'red'));

  calls.length = 0;
  particule.pos.set(350, 100);                                   // dans la zone : elle freine
  particule.applyBehaviors(seule);
  particule.showDebug(true);
  assert.ok(calls.some(c => c[0] === 'stroke' && c[1] === 'red'));
  assert.ok(!calls.some(c => c[0] === 'stroke' && c[1] === 'yellow'));

  particule.rayonZoneDeFreinage = 60;                            // le cercle suit le réglage
  calls.length = 0;
  particule.showDebug(true);
  assert.deepEqual(calls.find(c => c[0] === 'circle'), ['circle', 400, 100, 120]);
});

test('le mode debug de vehicle.js reste éteint : aucun dessin pendant le pilotage', () => {
  const { Particule, calls } = scene();
  const particule = visant(Particule, [100, 100], [150, 100]);
  calls.length = 0;
  particule.applyBehaviors(seule);
  assert.deepEqual(calls, []);
});
