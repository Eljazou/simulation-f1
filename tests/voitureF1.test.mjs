import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, near } from './support.mjs';

// VoitureF1 : chaque comportement (seek, arrive, wander, évitement, garderSurPiste), leurs poids,
// les états, et la règle : aucun comportement n'écrit pos ou vel, seul applyForce change acc.

const scene = loadScene(F1, '({ Vehicle, Circuit, VoitureF1, Course, Particule })');
const { Vehicle, VoitureF1, Course, Particule } = scene;
const circuit = Course.circuit('classique');
const PAS = 1 / 60;
const { GRILLE, DEPART, COURSE, STAND, DRAPEAU, ARRIVEE } = VoitureF1.ETATS;
// le virage le plus serré du circuit
const serre = circuit.virages.reduce((a, b) => (a.courbure > b.courbure ? a : b));

// Une voiture sur sa place de grille. Usure des pneus nulle par défaut : le test choisit.
function voiture(reglages = {}, rang = 0) {
  const parametres = { ...Course.parametresParDefaut(), usurePneus: 0, ...reglages };
  const place = circuit.emplacementGrille(rang);
  return new VoitureF1(place.x, place.y, { circuit, parametres, place, box: circuit.stands.boxes[rang], alea: () => 0.5 });
}
// Une image pour une voiture seule (ou avec ses voisins).
function image(v, contexte = {}) {
  v.decide();
  v.applyBehaviors(contexte);
  v.update(PAS);
}
// Fait rouler une voiture partie de la grille jusqu'à la fin de son premier tour complet ;
// `observer(v)` est appelé à chaque image du tour.
function unTour(v, observer = () => {}) {
  v.demarrer();
  let i = 0;
  for (; i < 4000 && v.tour < 1; i++) image(v);
  for (; i < 8000 && v.tour < 2; i++) {
    image(v);
    observer(v);
  }
  assert.equal(v.tour, 2, 'la voiture aurait dû boucler son tour');
  return i;
}
const surLaPiste = v => Math.abs(v.ecartLateral) + v.r / 2 <= circuit.largeur / 2;

test('VoitureF1 étend Vehicle : position, vitesse, accélération et locomotion héritées', () => {
  const v = voiture();
  assert.equal(Object.getPrototypeOf(VoitureF1), Vehicle);
  assert.ok(v instanceof Vehicle);
  assert.equal(v.applyForce, Vehicle.prototype.applyForce);
  assert.equal(v.seek, Vehicle.prototype.seek);
  assert.equal(v.arrive, Vehicle.prototype.arrive);
  assert.equal(v.wander, Vehicle.prototype.wander);
  assert.equal(v.r, VoitureF1.RAYON);
  assert.equal(v.etat, GRILLE);
  assert.equal(v.tour, -1);                                     // derrière la ligne : le départ ouvre le tour 1
});

test('seek seul : la voiture fait un tour complet en restant sur la piste', () => {
  const v = voiture({ poidsArrive: 0, poidsWander: 0 });
  let sorties = 0;
  const actifs = new Set();
  const images = unTour(v, voitureCourante => {
    if (!surLaPiste(voitureCourante)) sorties++;
    for (const [nom, force] of Object.entries(voitureCourante.forces)) if (force.mag() > 0) actifs.add(nom);
  });
  assert.equal(sorties, 0);
  // seul seek pilote : arrive et wander, de poids nul, ne donnent aucune force
  assert.ok(actifs.has('seek'));
  assert.ok(!actifs.has('arrive') && !actifs.has('wander'), [...actifs].join(', '));
  // un tour en un temps raisonnable : entre 10 et 30 s à 60 images par seconde
  assert.ok(images > 600 && images < 3600, `${images} images`);
});

test('seek : le point d\'anticipation est sur la ligne de course, plus loin quand la voiture va vite', () => {
  const v = voiture({ poidsWander: 0 });
  v.demarrer();
  v.reaction = 0;
  image(v);
  const lent = circuit.distanceDevant(v.indicePiste, circuit.projeter(v.cibles.seek.x, v.cibles.seek.y));
  // quelques dizaines d'images plus tard, toujours sur la ligne droite, mais lancée
  for (let i = 0; i < 40; i++) image(v);
  assert.ok(v.vitesse > 4);
  const rapide = circuit.distanceDevant(v.indicePiste, circuit.projeter(v.cibles.seek.x, v.cibles.seek.y));
  assert.ok(rapide > lent, `${lent} puis ${rapide}`);
  const i = circuit.projeter(v.cibles.seek.x, v.cibles.seek.y);
  assert.ok(Math.abs(circuit.ecartLateral(v.cibles.seek.x, v.cibles.seek.y, i) - circuit.decalagesLigne[i]) < 1.5);
});

test('arrive : la voiture freine avant le virage serré, elle est bien plus lente à l\'apex qu\'en ligne droite', () => {
  const v = voiture({ poidsWander: 0 });
  let droite = 0;
  let apex = Infinity;
  let freinageVu = false;
  unTour(v, voitureCourante => {
    if (voitureCourante.indicePiste < 20) droite = Math.max(droite, voitureCourante.vitesse);
    if (circuit.dansIntervalle(voitureCourante.indicePiste, serre.apex - 3, serre.apex + 3)) apex = Math.min(apex, voitureCourante.vitesse);
    // dans la zone de freinage, la force d'arrive s'oppose à la vitesse : les feux s'allument
    if (voitureCourante.forces.arrive && voitureCourante.freine) freinageVu = true;
  });
  assert.ok(droite > 4, `${droite}`);
  assert.ok(apex < droite * 0.6, `apex ${apex}, ligne droite ${droite}`);
  assert.ok(freinageVu);
});

test('arrive : d négatif (map non borné) donne une vitesse désirée qui descend jusqu\'à celle du virage, pas jusqu\'à 0', () => {
  // la formule de vehicle.js : vitesse désirée = maxSpeed × (distance - d) / (rayon - d)
  const [maxSpeed, rayon, vApex] = [5, 160, 2];
  const d = -vApex * rayon / (maxSpeed - vApex);
  const desiree = distance => maxSpeed * (distance - d) / (rayon - d);
  near(desiree(rayon), maxSpeed);
  near(desiree(0), vApex);
  assert.ok(desiree(80) > vApex && desiree(80) < maxSpeed);
  // et le code l'applique ainsi : d calculé pour l'apex visé
  const source = VoitureF1.prototype.freinerPourLeVirage.toString();
  assert.match(source, /const d = -vApex \* rayon \/ \(this\.maxSpeed - vApex\);/);
  assert.match(source, /const rayon = this\.rayonDeFreinage\(\);/);
  assert.match(source, /this\.arrive\(apex, d\)/);
});

test('arrive au box : vitesse proche de 0, arrêtée sur sa marque, sans le dépasser', () => {
  const v = voiture({ poidsWander: 0 }, 3);
  v.demarrer();
  v.demanderStand();
  const box = circuit.stands.boxes[3];
  let auBox = null;
  let depassement = 0;
  for (let i = 0; i < 6000 && auBox === null; i++) {
    image(v);
    if (v.phaseStand === VoitureF1.PHASES_STAND.ARRET) {
      // la voiture ne va jamais plus loin que son box le long de la voie
      depassement = Math.max(depassement, v.indiceVoie - box.indiceVoie);
      if (v.estArreteeAuBox()) auBox = i;
    }
  }
  assert.ok(auBox !== null, 'la voiture aurait dû s\'arrêter au box');
  assert.ok(depassement <= 1, `${depassement} points au-delà du box`);
  assert.ok(v.vitesse < VoitureF1.VITESSE_ARRETEE);
  assert.ok(Math.hypot(v.pos.x - box.x, v.pos.y - box.y) < VoitureF1.TOLERANCE_BOX);
  // et elle y reste (arrive avec d = 0 : pas de recul)
  for (let i = 0; i < 30; i++) image(v);
  assert.ok(Math.hypot(v.pos.x - box.x, v.pos.y - box.y) < VoitureF1.TOLERANCE_BOX);
});

test('wander : le décalage latéral varie mais reste borné à la piste ; poids 0 : la ligne de course', () => {
  // écart à la ligne de course, en moyenne et au pire, sur un tour
  const ecarts = reglages => {
    const v = voiture(reglages);
    const mesures = [];
    let sorties = 0;
    unTour(v, voitureCourante => {
      mesures.push(Math.abs(voitureCourante.ecartLateral - circuit.decalagesLigne[voitureCourante.indicePiste]));
      if (!surLaPiste(voitureCourante)) sorties++;
    });
    return { moyenne: mesures.reduce((a, b) => a + b, 0) / mesures.length, pire: Math.max(...mesures), sorties };
  };
  const parfait = ecarts({ poidsWander: 0 });
  const errant = ecarts({ poidsWander: 2, wanderRadius: 60 });
  const extreme = ecarts({ poidsWander: 2, wanderRadius: 80, displaceRange: 1, distanceCercle: 10 });
  // sans wander, la voiture suit la ligne de course (à quelques pixels : elle coupe un peu les
  // virages en visant un point devant elle)
  assert.ok(parfait.moyenne < 3, `${parfait.moyenne}`);
  // avec wander, le décalage varie nettement...
  assert.ok(errant.moyenne > 3 * parfait.moyenne && errant.pire > 30, JSON.stringify(errant));
  // ...mais la voiture ne quitte jamais la piste, même aux valeurs extrêmes des curseurs
  for (const resultat of [parfait, errant, extreme]) assert.equal(resultat.sorties, 0);
});

test('wander : poids à 0, aucune force ; le point de wander reste devant la voiture', () => {
  const v = voiture({ poidsWander: 0 });
  v.demarrer();
  for (let i = 0; i < 300; i++) {
    image(v);
    if (v.forces.wander) assert.equal(v.forces.wander.mag(), 0);
    assert.ok(Math.abs(v.wanderTheta) <= Math.PI / 2 + 1e-12);
  }
});

test('poids à 0 : seek absent, la voiture ne part pas ; arrive absent, aucune force de freinage', () => {
  const v = voiture({ poidsSeek: 0, poidsWander: 0 });
  const depart = { x: v.pos.x, y: v.pos.y };
  v.demarrer();
  for (let i = 0; i < 300; i++) image(v);
  assert.ok(Math.hypot(v.pos.x - depart.x, v.pos.y - depart.y) < 1, 'sans seek, rien ne la pousse');
  assert.equal(v.forces.seek.mag(), 0);

  const w = voiture({ poidsArrive: 0, poidsWander: 0 });
  let arriveVue = false;
  unTour(w, voitureCourante => {
    if (voitureCourante.forces.arrive) {
      arriveVue = true;
      assert.equal(voitureCourante.forces.arrive.mag(), 0);
    }
  });
  assert.ok(arriveVue, 'le comportement est bien évalué, avec un poids nul');
});

test('garderSurPiste : une vraie force (pas une vitesse), vers l\'intérieur, limitée à maxForce ; nulle au milieu', () => {
  const i = 40;
  const t = circuit.tangentes[i];
  for (const cote of [1, -1]) {
    const point = circuit.pointLateral(i, cote * (circuit.largeur / 2 + 5));
    const v = new VoitureF1(point.x, point.y, { circuit, parametres: Course.parametresParDefaut(), alea: () => 0.5 });
    v.applyForce(scene.context.createVector(t.x * 4, t.y * 4));
    v.update();
    v.decide();
    v.maxSpeed = 5;
    const force = v.garderSurPiste();
    assert.ok(force.mag() > 0 && force.mag() <= v.maxForce + 1e-9, `${force.mag()}`);
    // elle ramène vers la piste
    const n = circuit.normales[v.indicePiste];
    assert.ok((force.x * n.x + force.y * n.y) * cote < 0);
  }
  const milieu = circuit.pointLateral(i, 0);
  const v = new VoitureF1(milieu.x, milieu.y, { circuit, parametres: Course.parametresParDefaut(), alea: () => 0.5 });
  assert.equal(v.garderSurPiste().mag(), 0);
});

test('flee : empruntée à Particule, s\'éloigne de la cible, limitée à maxForce', () => {
  const v = voiture();
  assert.match(VoitureF1.prototype.flee.toString(), /Particule\.prototype\.flee\.call\(this, cible\)/);
  const cible = scene.context.createVector(v.pos.x + 10, v.pos.y);
  const force = v.flee(cible);
  assert.ok(force.x < 0);
  assert.ok(force.mag() <= v.maxForce + 1e-9);
  assert.notEqual(VoitureF1.prototype.flee, Particule.prototype.flee);
});

test('pilotage : decide et applyBehaviors n\'écrivent ni pos ni vel ; seul applyForce change acc ; update = locomotion de Vehicle', () => {
  const voitures = [0, 1, 2, 3].map(rang => voiture({}, rang));
  voitures.forEach(v => v.demarrer());
  let forcesVues = 0;
  for (let n = 0; n < 900; n++) {
    voitures.forEach(v => {
      const avant = [v.pos.x, v.pos.y, v.vel.x, v.vel.y];
      v.decide();
      assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], avant);
      assert.deepEqual([v.acc.x, v.acc.y], [0, 0]);

      // espion : on additionne les forces passées à applyForce
      const somme = { x: 0, y: 0 };
      v.applyForce = force => {
        somme.x += force.x;
        somme.y += force.y;
        forcesVues++;
        Vehicle.prototype.applyForce.call(v, force);
      };
      v.applyBehaviors({ voisins: voitures.filter(autre => autre !== v) });
      delete v.applyForce;
      assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], avant);
      near(v.acc.x, somme.x, 1e-12);
      near(v.acc.y, somme.y, 1e-12);

      // locomotion : vitesse + accélération, limitée à maxSpeed ; position + vitesse
      const vx = v.vel.x + v.acc.x;
      const vy = v.vel.y + v.acc.y;
      const m = Math.hypot(vx, vy);
      const k = m > v.maxSpeed ? v.maxSpeed / m : 1;
      v.update(PAS);
      near(v.vel.x, vx * k, 1e-9);
      near(v.vel.y, vy * k, 1e-9);
      near(v.pos.x, avant[0] + vx * k, 1e-9);
      assert.deepEqual([v.acc.x, v.acc.y], [0, 0]);
    });
  }
  assert.ok(forcesVues > 1000);
});

test('états : GRILLE -> DEPART (temps de réaction) -> COURSE ; neutraliser, relancer, terminer', () => {
  const v = voiture();
  for (let i = 0; i < 60; i++) image(v);
  assert.equal(v.etat, GRILLE);
  // sur la grille, arrive vers sa place : elle s'y arrête
  assert.ok(Math.hypot(v.pos.x - v.place.x, v.pos.y - v.place.y) < 3 && v.vitesse < 0.2);
  v.demarrer();
  assert.equal(v.etat, DEPART);
  // pendant son temps de réaction, elle ne bouge pas encore
  const place = { x: v.pos.x, y: v.pos.y };
  for (let t = PAS; t < v.reaction - PAS; t += PAS) image(v);
  assert.ok(Math.hypot(v.pos.x - place.x, v.pos.y - place.y) < 0.5);
  for (let i = 0; i < 60; i++) image(v);
  assert.ok(v.vitesse > 1);
  for (let t = 0; t < VoitureF1.DUREE_DEPART + 0.1; t += PAS) image(v);
  assert.equal(v.etat, COURSE);
  // safety car : drapeau, puis reprise
  v.neutraliser();
  assert.equal(v.etat, DRAPEAU);
  image(v);
  assert.ok(v.maxSpeed <= v.parametres.vitesseSafetyCar * VoitureF1.FACTEUR_NEUTRALISATION + 1e-9);
  v.relancer();
  assert.equal(v.etat, COURSE);
  v.terminer();
  assert.deepEqual([v.etat, v.arrivee], [ARRIVEE, true]);
});

test('tours : franchir la ligne d\'arrivée ajoute un tour, une seule fois par passage', () => {
  const v = voiture({ poidsWander: 0 });
  v.demarrer();
  const passages = [];
  for (let i = 0; i < 5000 && v.tour < 2; i++) {
    image(v);
    if (v.ligneFranchie) passages.push([i, v.tour]);
  }
  assert.deepEqual(passages.map(([, tour]) => tour), [0, 1, 2]);
  // entre deux passages, un tour entier de piste
  assert.ok(passages[2][0] - passages[1][0] > 600);
  assert.equal(v.toursCompletes, 2);
  assert.ok(Math.abs(v.progression - (2 * circuit.longueur + v.indicePiste * circuit.pas)) < 1e-9);
});

test('pneus et carburant : l\'usure baisse la vitesse de base, bornée ; le réservoir plein ralentit un peu', () => {
  const v = voiture({ usurePneus: 0.5 });
  const neuve = v.vitesseDeBase();
  v.demarrer();
  for (let i = 0; i < 600; i++) image(v);
  assert.ok(v.pneus < 1 && v.pneus >= VoitureF1.PNEUS_MIN);
  assert.ok(v.vitesseDeBase() < neuve);
  for (let i = 0; i < 6000; i++) image(v);
  assert.equal(v.pneus, VoitureF1.PNEUS_MIN);
  const pleine = voiture();
  const vide = voiture();
  vide.consommer(0);
  assert.ok(vide.vitesseDeBase() > pleine.vitesseDeBase());
  vide.consommer(2);
  assert.equal(vide.carburant, 1);
  const lente = voiture();
  lente.subirIncident();
  assert.ok(lente.vitesseDeBase() < pleine.vitesseDeBase() * 0.5);
  assert.ok(lente.demandeStand);
});

test('évitement : derrière une voiture lente, la voiture freine, garde l\'écart puis dépasse sans contact', () => {
  const p = { ...Course.parametresParDefaut(), usurePneus: 0, poidsWander: 0 };
  const placer = (indice, decalage) => {
    const point = circuit.pointLateral(indice, decalage);
    return { x: point.x, y: point.y };
  };
  // la ligne droite des stands : la lente devant, la rapide 120 px derrière, sur la même ligne
  const a = placer(10, 0);
  const b = placer(10 - 120 / circuit.pas, 0);
  const lente = new VoitureF1(a.x, a.y, { circuit, parametres: { ...p, vitesseMax: 2 }, alea: () => 0.5 });
  const rapide = new VoitureF1(b.x, b.y, { circuit, parametres: p, alea: () => 0.5 });
  for (const v of [lente, rapide]) {
    v.demarrer();
    v.reaction = 0;
  }
  let distanceMin = Infinity;
  let suivie = false;
  let depassee = false;
  for (let i = 0; i < 1500 && !depassee; i++) {
    lente.decide();
    rapide.decide();
    lente.applyBehaviors({ voisins: [rapide] });
    rapide.applyBehaviors({ voisins: [lente] });
    lente.update(PAS);
    rapide.update(PAS);
    distanceMin = Math.min(distanceMin, Math.hypot(lente.pos.x - rapide.pos.x, lente.pos.y - rapide.pos.y));
    if (rapide.obstacle !== null && rapide.forces.suivi) suivie = true;
    depassee = rapide.progression > lente.progression + 40;
  }
  assert.ok(suivie, 'la voiture lente aurait dû entrer dans le cône d\'anticipation');
  assert.ok(depassee, 'la voiture rapide aurait dû dépasser');
  assert.ok(distanceMin >= lente.r + rapide.r, `distance minimale ${distanceMin}`);
});

test('évitement : séparation et répulsion d\'urgence limitées, opposées au voisin', () => {
  const v = voiture();
  const w = voiture({}, 1);
  const point = circuit.pointLateral(v.indicePiste, v.ecartLateral + 20);
  // un voisin factice tout près, sur le côté (un vrai Vehicle, immobile)
  const voisin = new Vehicle(point.x, point.y);
  voisin.r = VoitureF1.RAYON;
  v.demarrer();
  v.applyBehaviors({ voisins: [voisin] });
  assert.ok(v.forces.separation.mag() <= v.maxForce * v.parametres.poidsSeparation + 1e-9);
  assert.ok(v.forces.urgence.mag() <= v.maxForce * VoitureF1.POIDS_URGENCE + 1e-9);
  const vers = { x: voisin.pos.x - v.pos.x, y: voisin.pos.y - v.pos.y };
  assert.ok(v.forces.separation.x * vers.x + v.forces.separation.y * vers.y < 0);
  assert.ok(v.chevauchement);
  // sans voisin : aucune force d'évitement
  w.applyBehaviors({ voisins: [] });
  for (const nom of ['separation', 'urgence', 'anticipation', 'suivi', 'contournement']) assert.equal(w.forces[nom], undefined);
});

test('évitement : anticipation, la voiture s\'écarte d\'une trajectoire qui va croiser la sienne', () => {
  const v = voiture();
  v.demarrer();
  const { createVector } = scene.context;
  // la voiture roule vers +x à 4 ; l'autre arrive par le côté, 60 px devant et 60 px à gauche,
  // et descend vers sa trajectoire : sans réaction, elles se rencontrent dans 15 images
  v.applyForce(createVector(4, 0));
  v.update();
  const autre = new Vehicle(v.pos.x + 60, v.pos.y + 60);
  autre.r = VoitureF1.RAYON;
  autre.applyForce(createVector(0, -4));
  autre.update();
  autre.applyForce(createVector(0, 0));
  // trop loin pour la séparation, hors du cône : seule l'anticipation peut réagir
  v.applyBehaviors({ voisins: [autre] });
  assert.equal(v.forces.separation, undefined);
  assert.equal(v.obstacle, null);
  const f = v.forces.anticipation;
  assert.ok(f && f.mag() > 0, 'la collision future aurait dû être anticipée');
  assert.ok(f.mag() <= v.maxForce * v.parametres.poidsSeparation + 1e-9);
  // elle s'écarte de l'endroit de la rencontre : vers le bas (y croissant), à l'opposé de l'autre
  assert.ok(f.y > 0, `${f.x}, ${f.y}`);
  // trajectoires parallèles, sans rencontre : aucune anticipation
  const w = voiture();
  w.demarrer();
  w.applyForce(createVector(4, 0));
  w.update();
  const parallele = new Vehicle(w.pos.x + 60, w.pos.y + 60);
  parallele.r = VoitureF1.RAYON;
  parallele.applyForce(createVector(4, 0));
  parallele.update();
  w.applyBehaviors({ voisins: [parallele] });
  assert.equal(w.forces.anticipation, undefined);
});

test('stand : entrée par la voie, arrêt de la durée prévue, pneus neufs, sortie sur la piste', () => {
  const v = voiture({ poidsWander: 0, usurePneus: 0.3 }, 5);
  v.demarrer();
  v.demanderStand();
  const phases = [];
  let arret = 0;
  let pneusAvant = null;
  let pneusALaSortie = null;
  for (let i = 0; i < 9000 && !(phases.includes('SORTIE') && v.etat === COURSE); i++) {
    if (v.phaseStand === 'ARRET') pneusAvant = v.pneus;
    image(v);
    const phase = v.etat === STAND ? v.phaseStand : v.etat;
    if (phases.at(-1) !== phase) phases.push(phase);
    if (phase === 'SORTIE' && pneusALaSortie === null) pneusALaSortie = v.pneus;
    if (v.phaseStand === 'ARRET' && v.estArreteeAuBox()) arret += PAS;
  }
  assert.deepEqual(phases.slice(-4), ['ENTREE', 'ARRET', 'SORTIE', COURSE]);
  // arrêt au box : la durée tirée (entre 2 et 3 s). Le compteur de la voiture s'arrête dès qu'il
  // l'atteint (à une image près) ; vu de l'extérieur, mesuré après la locomotion, l'arrêt dure
  // la même chose à deux images près (celle où elle s'immobilise et celle où elle repart)
  assert.ok(v.dureeArret >= VoitureF1.DUREE_ARRET_MIN && v.dureeArret <= VoitureF1.DUREE_ARRET_MAX);
  assert.ok(v.arret >= v.dureeArret && v.arret < v.dureeArret + PAS + 1e-9, `${v.arret}`);
  assert.ok(Math.abs(arret - v.dureeArret) <= 2 * PAS + 1e-9, `${arret} au lieu de ${v.dureeArret}`);
  // usés à l'entrée, neufs en quittant le box (puis ils s'usent de nouveau en roulant)
  assert.ok(pneusAvant < 0.5, `${pneusAvant}`);
  assert.ok(pneusALaSortie > 0.99, `${pneusALaSortie}`);
  assert.equal(v.arretsAuStand, 1);
  assert.equal(v.demandeStand, false);
});
