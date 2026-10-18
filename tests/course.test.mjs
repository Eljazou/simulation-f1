import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator } from './support.mjs';

// Course : le directeur de course. États, feux, tours, classement, stands, safety car, et la
// grande simulation : 20 voitures, 3 tours, sans aucun contact.

const scene = loadScene(F1, '({ Vehicle, Circuit, VoitureF1, SafetyCar, Fumee, DroneCamera, Course, DecorCircuit, Classement, Camera })');
const { Vehicle, Circuit, VoitureF1, SafetyCar, Fumee, DroneCamera, Course, DecorCircuit, Classement, Camera } = scene;
const { PRESENTATION, FEUX, COURSE, SAFETY_CAR, ARRIVEE, RELANCE } = Course.ETATS;

function course(reglages = {}, graine = 1999) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages }, Circuit.generateur(graine));
}
// Avance pas à pas jusqu'à ce que `condition(c)` soit vraie ; échoue au-delà de `limite` pas.
function jusqua(c, condition, limite = 60 * 300) {
  for (let i = 0; i < limite; i++) {
    if (condition(c)) return i;
    c.pas();
  }
  return assert.fail('condition jamais atteinte');
}

test('ce qui bouge étend Vehicle ; circuit, décor, course, classement et caméra non', () => {
  const c = course({ nombreVoitures: 4 });
  for (const vehicule of [...c.voitures, c.safetyCar, c.drone, new Fumee(0, 0)]) assert.ok(vehicule instanceof Vehicle);
  for (const Classe of [VoitureF1, SafetyCar, Fumee, DroneCamera]) assert.ok(Classe.prototype instanceof Vehicle, Classe.name);
  // la safety car est une VoitureF1 spécialisée (donc un Vehicle) : elle réutilise sa conduite
  assert.equal(Object.getPrototypeOf(SafetyCar), VoitureF1);
  for (const Classe of [Circuit, DecorCircuit, Course, Classement, Camera]) {
    assert.ok(!(Classe.prototype instanceof Vehicle), Classe.name);
  }
  assert.ok(!(c instanceof Vehicle) && !(c.circuit instanceof Vehicle));
});

test('nouvelle course : voitures derrière leur place, écuries fictives, safety car garée, état PRESENTATION', () => {
  const c = course({ nombreVoitures: 8, ecuries: 3 });
  assert.equal(c.etat, PRESENTATION);
  assert.equal(c.voitures.length, 8);
  assert.deepEqual(new Set(c.voitures.map(v => v.ecurie.nom)).size, 3);
  assert.equal(new Set(c.voitures.map(v => v.numero)).size, 8);
  for (const v of c.voitures) {
    assert.equal(v.etat, VoitureF1.ETATS.GRILLE);
    // née RECUL_PRESENTATION pixels derrière sa place
    assert.ok(Math.abs(Math.hypot(v.pos.x - v.place.x, v.pos.y - v.place.y) - Course.RECUL_PRESENTATION) < 2);
  }
  assert.ok(c.safetyCar.dansSonBox && !c.safetyCar.enPiste);
  // les noms sont inventés : aucune écurie réelle
  const reelles = /ferrari|mercedes|red bull|mclaren|williams|alpine|haas|aston|sauber|racing bulls|renault|lotus/i;
  for (const ecurie of Course.ECURIES) assert.doesNotMatch(ecurie.nom, reelles);
  for (const mot of DecorCircuit.PUBLICITES) assert.doesNotMatch(mot, reelles);
});

test('présentation puis feux : 5 feux un par seconde, extinction après 0,5 à 3 s, départ', () => {
  const c = course({ nombreVoitures: 6 });
  const debutFeux = jusqua(c, x => x.etat === FEUX);
  assert.ok(Math.abs(debutFeux * Course.PAS_TEMPS - Course.DUREE_PRESENTATION) < 2 * Course.PAS_TEMPS);
  // pendant la présentation, les voitures ont rejoint leur place et attendent
  for (const v of c.voitures) assert.ok(Math.hypot(v.pos.x - v.place.x, v.pos.y - v.place.y) < 3 && v.vitesse < 0.3);
  const allumages = [];
  let i = 0;
  for (; c.etat === FEUX && i < 1000; i++) {
    const avant = c.feux;
    c.pas();
    if (c.feux > avant) allumages.push(c.chronoEtat);
    // personne ne part avant l'extinction
    if (c.etat === FEUX) c.voitures.forEach(v => assert.equal(v.etat, VoitureF1.ETATS.GRILLE));
  }
  assert.equal(allumages.length, 5);
  // relevé après le pas qui allume le feu : au plus deux pas de décalage
  allumages.forEach((t, k) => assert.ok(Math.abs(t - k * Course.INTERVALLE_FEUX) <= 2 * Course.PAS_TEMPS + 1e-9, `${t}`));
  const duree = i * Course.PAS_TEMPS;
  assert.ok(duree >= 5 + Course.ATTENTE_FEUX_MIN - 0.05 && duree <= 5 + Course.ATTENTE_FEUX_MAX + 0.05, `${duree}`);
  assert.equal(c.etat, COURSE);
  assert.equal(c.feux, 0);
  c.voitures.forEach(v => assert.equal(v.etat, VoitureF1.ETATS.DEPART));
  // l'attente change d'une course à l'autre (tirée au hasard)
  assert.notEqual(course({}, 1).attenteFeux, course({}, 2).attenteFeux);
});

// Simule toute une course et mesure : distance minimale entre deux voitures (moins la somme de
// leurs rayons), plus longue sortie de piste (en images), états traversés.
function simuler(c, { safetyCarA = -1, limite = 60 * 400 } = {}) {
  let ecartMin = Infinity;
  const horsPiste = new Map();
  let sortieMax = 0;
  const etats = [];
  for (let i = 0; i < limite && !c.terminee; i++) {
    if (i === safetyCarA) c.demanderSafetyCar();
    c.pas();
    if (etats.at(-1) !== c.etat) etats.push(c.etat);
    const v = c.voitures;
    for (let a = 0; a < v.length; a++) {
      for (let b = a + 1; b < v.length; b++) {
        ecartMin = Math.min(ecartMin, Math.hypot(v[a].pos.x - v[b].pos.x, v[a].pos.y - v[b].pos.y) - v[a].r - v[b].r);
      }
      // hors de la piste : la carrosserie (demi-largeur) dépasse le bord, hors voie des stands
      const dehors = !v[a].auStand && Math.abs(v[a].ecartLateral) + VoitureF1.LARGEUR / 2 > c.circuit.largeur / 2;
      horsPiste.set(v[a], dehors ? (horsPiste.get(v[a]) ?? 0) + 1 : 0);
      sortieMax = Math.max(sortieMax, horsPiste.get(v[a]));
    }
  }
  return { ecartMin, sortieMax, etats };
}

// Le rayon de collision d'une voiture est sa demi-longueur (13 px pour 26 × 11) : deux cercles
// qui ne se chevauchent pas garantissent que les carrosseries ne se touchent pas. Aucune
// tolérance n'est donc ajoutée : la distance entre centres reste au moins la somme des rayons.
for (const profil of ['classique', 'technique']) {
  test(`20 voitures, 3 tours sur le circuit ${profil} : aucun contact, personne ne sort de la piste, tous à l'arrivée`, () => {
    const c = course({ profil, nombreVoitures: 20, nombreTours: 3 });
    const { ecartMin, sortieMax, etats } = simuler(c);
    assert.ok(c.terminee, 'la course aurait dû se terminer');
    assert.deepEqual(etats, [PRESENTATION, FEUX, COURSE, ARRIVEE]);
    assert.ok(ecartMin >= 0, `deux voitures à ${ecartMin} px de moins que la somme de leurs rayons`);
    // « durablement » : jamais plus d'une demi-seconde hors piste (ici, jamais)
    assert.ok(sortieMax <= 30, `${sortieMax} images hors piste`);
    assert.equal(c.ordreArrivee.length, 20);
    assert.ok(c.voitures.every(v => v.toursCompletes >= 2));
    assert.equal(c.ordreArrivee[0].toursCompletes, 3);
  });
}

test('transitions : PRESENTATION -> FEUX -> COURSE -> SAFETY_CAR -> RELANCE -> COURSE -> ARRIVEE, sans contact', () => {
  const c = course({ nombreVoitures: 12, nombreTours: 3 });
  const { ecartMin, etats } = simuler(c, { safetyCarA: 60 * 25 });
  assert.deepEqual(etats, [PRESENTATION, FEUX, COURSE, SAFETY_CAR, RELANCE, COURSE, ARRIVEE]);
  assert.ok(ecartMin >= 0, `${ecartMin}`);
  assert.ok(c.terminee);
  // la safety car est rentrée à sa place
  assert.ok(c.safetyCar.auStand);
});

test('safety car : sortie par la voie des stands, les voitures se rangent derrière, gardent l\'écart, puis la course reprend', () => {
  const c = course({ nombreVoitures: 10, nombreTours: 8 });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 12; i++) c.pas();
  assert.ok(c.demanderSafetyCar());
  assert.equal(c.demanderSafetyCar(), true);                    // redemandée : sans effet de plus
  c.pas();
  assert.equal(c.etat, SAFETY_CAR);
  assert.ok(c.voitures.filter(v => !v.auStand).every(v => v.etat === VoitureF1.ETATS.DRAPEAU));
  const sc = c.safetyCar;
  assert.equal(sc.phaseStand, VoitureF1.PHASES_STAND.SORTIE);
  jusqua(c, x => x.safetyCar.enPiste);
  // la file se forme : on laisse rouler, puis on observe jusqu'au rappel
  let ordre = null;
  let changements = 0;
  let ecartFile = Infinity;
  let mesures = 0;
  for (let t = 0; c.etat === SAFETY_CAR && t < 60 * 60; t++) {
    c.pas();
    if (c.chronoEtat < 15 || !sc.enPiste) continue;
    // file : les véhicules en piste, rangés le long du tracé à partir de la safety car
    const file = c.surLaPiste().sort((a, b) => c.circuit.distanceDevant(a.indicePiste, sc.indicePiste)
      - c.circuit.distanceDevant(b.indicePiste, sc.indicePiste));
    assert.equal(file[0], sc);
    const cle = file.map(v => v.numero).join(',');
    if (ordre !== null && cle !== ordre) changements++;
    ordre = cle;
    // derrière la safety car : à sa vitesse, et à distance l'une de l'autre
    for (let k = 1; k < file.length; k++) {
      const d = c.circuit.distanceDevant(file[k].indicePiste, file[k - 1].indicePiste);
      if (d < VoitureF1.PORTEE_FILE) {
        ecartFile = Math.min(ecartFile, d);
        mesures++;
      }
    }
    assert.ok(file.slice(1).every(v => v.maxSpeed <= c.parametres.vitesseSafetyCar * VoitureF1.FACTEUR_NEUTRALISATION + 1e-9));
  }
  assert.ok(mesures > 100, 'des voitures auraient dû rouler en file');
  // personne ne double dans la file, et l'écart reste au-dessus de deux rayons de voiture
  assert.equal(changements, 0);
  assert.ok(ecartFile >= 2 * VoitureF1.RAYON, `${ecartFile}`);
  // la safety car rentre : relance en accordéon (voir incidents.test.mjs), puis la course reprend
  assert.equal(c.etat, RELANCE);
  jusqua(c, x => x.etat === COURSE, 60 * 15);
  assert.ok(sc.auStand);
  assert.ok(c.voitures.filter(v => !v.auStand).every(v => v.etat === VoitureF1.ETATS.COURSE));
  for (let i = 0; i < 60 * 6; i++) c.pas();
  assert.ok(Math.max(...c.voitures.map(v => v.vitesse)) > c.parametres.vitesseSafetyCar * 1.5);
  jusqua(c, x => x.safetyCar.garee);
});

test('incident : drapeau jaune, la voiture ralentit puis rentre au stand ; la safety car sort', () => {
  const c = course({ nombreVoitures: 6, nombreTours: 6 });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 8; i++) c.pas();
  const victime = c.voitures[2];
  c.provoquerIncident(victime);
  assert.equal(c.drapeau, 'jaune');
  assert.match(c.evenements.at(-1).texte, /Drapeau jaune/);
  assert.ok(victime.incident && victime.demandeStand);
  c.pas();
  assert.equal(c.etat, SAFETY_CAR);
  assert.equal(c.drapeau, 'sc');
  jusqua(c, () => victime.arretsAuStand === 1);
  assert.equal(victime.incident, false);
});

test('incidents tirés au hasard seulement si la case est cochée, et seulement en course', () => {
  const sans = course({ nombreVoitures: 6 });
  sans.etat = COURSE;
  for (let i = 0; i < 2000; i++) sans.tirerLesIncidents();
  assert.ok(sans.voitures.every(v => !v.incident));
  const avec = new Course({ ...Course.parametresParDefaut(), nombreVoitures: 6, incidents: true }, generator(3));
  avec.voitures.forEach(v => { v.etat = VoitureF1.ETATS.COURSE; });
  avec.etat = COURSE;
  let tirages = 0;
  while (!avec.voitures.some(v => v.incident) && tirages < 1e6) {
    avec.tirerLesIncidents();
    tirages++;
  }
  assert.ok(avec.voitures.some(v => v.incident));
  assert.ok(avec.safetyCarDemandee);
});

test('pit stop dans la course : pneus usés sous le seuil -> demande, entrée, arrêt au box, pneus neufs, sortie', () => {
  // arrêt de base (sans IA avancée : la stratégie anticiperait, voir strategie.test.mjs)
  const c = course({ nombreVoitures: 6, nombreTours: 10, usurePneus: 0.04, seuilStand: 0.5, iaAvancee: false });
  jusqua(c, x => x.etat === COURSE);
  const v = c.voitures[0];
  jusqua(c, () => v.demandeStand);
  assert.ok(v.pneus < 0.5);
  jusqua(c, () => v.auStand);
  jusqua(c, () => v.phaseStand === VoitureF1.PHASES_STAND.ARRET && v.estArreteeAuBox());
  assert.ok(Math.hypot(v.pos.x - v.box.x, v.pos.y - v.box.y) < VoitureF1.TOLERANCE_BOX);
  jusqua(c, () => v.phaseStand === VoitureF1.PHASES_STAND.SORTIE);
  assert.ok(v.pneus > 0.99);
  jusqua(c, () => !v.auStand);
  assert.equal(v.etat, VoitureF1.ETATS.COURSE);
  assert.equal(v.arretsAuStand, 1);
});

// Classement, écarts, temps au tour et format des temps : voir chronometrage.test.mjs.

test('vitesse de simulation : elle multiplie dt (plus ou moins de pas par image) ; pause : aucun pas', () => {
  const c = course({ nombreVoitures: 2 });
  const pasPourUneSeconde = () => {
    let total = 0;
    for (let i = 0; i < 60; i++) total += c.avancer(1 / 60);
    return total;
  };
  assert.equal(pasPourUneSeconde(), 60);
  c.regler('vitesseSimulation', 2);
  assert.equal(pasPourUneSeconde(), 120);
  c.regler('vitesseSimulation', 0.25);
  assert.equal(pasPourUneSeconde(), 15);
  c.regler('vitesseSimulation', 4);
  // une image très longue ne fait pas plus de PAS_MAX pas
  assert.equal(c.avancer(1), Course.PAS_MAX);
  const chrono = c.chrono;
  assert.equal(c.basculerPause(), true);
  assert.equal(c.avancer(1 / 60), 0);
  assert.equal(c.chrono, chrono);
  assert.equal(c.basculerPause(), false);
});

test('réglages : nombre de voitures, écuries et profil relancent une course ; les autres s\'appliquent en direct', () => {
  const c = course({ nombreVoitures: 4 });
  jusqua(c, x => x.etat === COURSE);
  c.regler('nombreVoitures', 7);
  assert.equal(c.voitures.length, 7);
  assert.equal(c.etat, PRESENTATION);
  assert.equal(c.circuit.stands.boxes.length, 7);
  c.regler('profil', 'rapide');
  assert.equal(c.circuit.profil, 'rapide');
  assert.equal(c.circuit, Course.circuit('rapide'));             // calculé une seule fois
  const voitures = c.voitures;
  c.regler('vitesseMax', 6);
  assert.equal(c.voitures, voitures);
  assert.ok(c.voitures.every(v => v.parametres.vitesseMax === 6));
  c.regler('nombreTours', 9);
  assert.equal(c.resume().tours, 9);
  assert.throws(() => c.regler('inconnu', 1), { name: 'RangeError' });
  assert.equal(c.demanderSafetyCar(), false);                    // pas en présentation
});

test('voiture choisie d\'un clic : la plus proche du point, dans un rayon', () => {
  const c = course({ nombreVoitures: 5 });
  const v = c.voitures[3];
  assert.equal(c.voitureEn(v.pos.x + 5, v.pos.y - 3), v);
  assert.equal(c.voitureEn(-500, -500), null);
});

test('fumée : naît derrière une voiture qui freine, reçoit son élan (une force), freine seule et s\'efface', () => {
  const f = new Fumee(100, 100, { x: 0.05, y: 0 });
  f.applyBehaviors();
  f.update(1 / 60);
  const elan = f.vel.x;
  assert.ok(elan > 0 && elan <= Fumee.VITESSE_MAX);
  for (let i = 0; i < 10; i++) {
    f.applyBehaviors();
    f.update(1 / 60);
  }
  assert.ok(f.vel.mag() < elan);
  for (let i = 0; i < 60; i++) f.update(1 / 60);
  assert.ok(f.terminee);
  // dans la course : des fumées apparaissent au freinage, et disparaissent
  const c = course({ nombreVoitures: 8 });
  let vues = 0;
  for (let i = 0; i < 60 * 30; i++) {
    c.pas();
    vues = Math.max(vues, c.fumees.length);
    assert.ok(c.fumees.length <= Course.FUMEES_MAX);
  }
  assert.ok(vues > 0);
  c.affichage.fumee = false;
  for (let i = 0; i < 60; i++) c.pas();
  assert.equal(c.fumees.length, 0);
});

test('drone : wander léger, il reste au-dessus du monde', () => {
  const d = new DroneCamera(900, 550, Circuit.LARGEUR_MONDE, Circuit.HAUTEUR_MONDE);
  for (let i = 0; i < 4000; i++) {
    d.applyBehaviors();
    d.update(1 / 60);
    assert.ok(d.pos.x > 0 && d.pos.x < Circuit.LARGEUR_MONDE && d.pos.y > 0 && d.pos.y < Circuit.HAUTEUR_MONDE);
  }
  assert.ok(d.vel.mag() <= DroneCamera.VITESSE_MAX + 1e-9);
});

test('safety car : garée, déployée, en piste à vitesse réduite, rappelée, de nouveau garée', () => {
  const c = course({ nombreVoitures: 2 });
  const sc = c.safetyCar;
  assert.equal(sc.deployer(), true);
  assert.equal(sc.deployer(), false);
  for (let i = 0; i < 60 * 30 && !sc.enPiste; i++) {
    sc.decide();
    sc.applyBehaviors({});
    sc.update(1 / 60);
  }
  assert.ok(sc.enPiste);
  for (let i = 0; i < 600; i++) {
    sc.decide();
    sc.applyBehaviors({});
    sc.update(1 / 60);
    assert.ok(sc.vitesse <= c.parametres.vitesseSafetyCar + 1e-9);
  }
  sc.rappeler();
  for (let i = 0; i < 60 * 120 && !sc.garee; i++) {
    sc.decide();
    sc.applyBehaviors({});
    sc.update(1 / 60);
  }
  assert.ok(sc.garee);
  assert.equal(sc.pneus, 1);
});
