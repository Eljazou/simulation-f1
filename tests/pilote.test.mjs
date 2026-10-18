import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, near } from './support.mjs';

// Mode pilote : la voiture du joueur (des forces, pas de position écrite), DRS, stand, pneus ;
// le choix de la voiture ; les pénalités ; l'accident (débris, safety car, écran de fin) ; le
// podium ; le HUD et l'écran REJOUER.

const scene = loadScene(F1, '({ Vehicle, Circuit, VoitureF1, VoiturePilote, Debris, Perturbation, Particule, EcranFin, HudPilote, Course, IncidentJoueur })');
const { Vehicle, Circuit, VoitureF1, VoiturePilote, Debris, Perturbation, Particule, EcranFin, HudPilote, Course, IncidentJoueur } = scene;
const { COURSE, PARC } = VoitureF1.ETATS;
const circuit = Course.circuit('classique');
const vecteur = (x, y) => scene.context.createVector(x, y);

function course(reglages = {}, graine = 1999) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, modePilote: true, ...reglages }, Circuit.generateur(graine));
}
// Une voiture du joueur en course, au point `indice`, lancée le long de la piste.
function pilote(indice = 20, reglages = {}) {
  const parametres = { ...Course.parametresParDefaut(), usurePneus: 0, ...reglages };
  const point = circuit.pointLateral(indice, 0);
  const v = new VoiturePilote(point.x, point.y, { circuit, parametres, alea: () => 0.5 });
  v.passerA(COURSE);
  const t = circuit.tangentes[indice];
  v.applyForce(vecteur(t.x * 3, t.y * 3));
  v.update();
  return v;
}
const piloter = (v, commandes, contexte = {}) => {
  v.commander(commandes);
  v.decide(contexte);
  v.applyBehaviors(contexte);
};
const angle = (a, b) => {
  let d = Math.abs(Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  return d > Math.PI ? 2 * Math.PI - d : d;
};

test('ce qui bouge est un Vehicle (voiture du joueur, débris, particules du mot) ; HUD et écran de fin non', () => {
  assert.equal(Object.getPrototypeOf(VoiturePilote), VoitureF1);
  assert.equal(Object.getPrototypeOf(Debris), Vehicle);
  assert.ok(pilote() instanceof Vehicle);
  assert.ok(!(HudPilote.prototype instanceof Vehicle) && !(EcranFin.prototype instanceof Vehicle));
});

test('commandes : des forces seulement ; sans touche, le point-cible est droit devant, à la distance réglée', () => {
  const v = pilote();
  const pos = v.pos.copy();
  const vel = v.vel.copy();
  piloter(v, {});
  // decide et applyBehaviors n'écrivent ni pos ni vel
  assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], [pos.x, pos.y, vel.x, vel.y]);
  assert.ok(v.acc.mag() > 0);
  const vers = vecteur(v.pointCible.x - v.pos.x, v.pointCible.y - v.pos.y);
  assert.ok(Math.abs(vers.mag() - v.parametres.distancePointCible) < 1e-9);
  assert.ok(angle(vers, v.vel) < 1e-9);
  // ni garderSurPiste ni évitement automatique
  assert.equal(v.forces.piste.mag(), 0);
  assert.equal(v.obstacle, null);
});

test('direction : gauche et droite tournent le point-cible de ANGLE_BRAQUAGE ; la force tourne la voiture du même côté', () => {
  for (const [touche, signe] of [['gauche', -1], ['droite', 1]]) {
    const v = pilote();
    piloter(v, { [touche]: true });
    const vers = vecteur(v.pointCible.x - v.pos.x, v.pointCible.y - v.pos.y);
    assert.ok(Math.abs(angle(vers, v.vel) - VoiturePilote.ANGLE_BRAQUAGE) < 1e-9);
    // composante latérale de la force (signe dans le repère de la voiture)
    const cap = v.cap;
    const laterale = -v.forces.seek.x * Math.sin(cap) + v.forces.seek.y * Math.cos(cap);
    assert.equal(Math.sign(laterale), signe, touche);
  }
});

test('accélérateur : pleine vitesse de base ; relâché, le régime de croisière ; frein : force opposée à la vitesse, limitée', () => {
  const v = pilote();
  piloter(v, { haut: true });
  assert.ok(Math.abs(v.maxSpeed - v.vitesseDeBase()) < 1e-9);
  piloter(v, { haut: false });
  assert.ok(Math.abs(v.maxSpeed - v.vitesseDeBase() * v.parametres.regimeCroisiere) < 1e-9);
  piloter(v, { bas: true });
  const frein = v.forces.frein;
  assert.ok(frein && frein.mag() > 0);
  assert.ok(frein.mag() <= v.maxForce + 1e-9);
  assert.ok(angle(frein, vecteur(-v.vel.x, -v.vel.y)) < 1e-9);
  // au frein, seule la part latérale du seek reste
  const t = { x: Math.cos(v.cap), y: Math.sin(v.cap) };
  assert.ok(Math.abs(v.forces.seek.x * t.x + v.forces.seek.y * t.y) < 1e-9);
  // freiner longtemps : la voiture ralentit
  const avant = v.vitesse;
  for (let i = 0; i < 30; i++) {
    piloter(v, { bas: true });
    v.update(1 / 60);
  }
  assert.ok(v.vitesse < avant);
});

test('DRS : seulement dans une zone DRS, à moins d\'une seconde de la voiture de devant, touche enfoncée', () => {
  const zone = Array.from({ length: circuit.n }, (_, i) => i).find(i => circuit.dansZoneDRS(i) && circuit.dansZoneDRS(i + 10));
  const horsZone = Array.from({ length: circuit.n }, (_, i) => i).find(i => !circuit.dansZoneDRS(i) && !circuit.dansZoneDRS(i + 10));
  const autre = pilote(zone + 6);
  const proche = { vehicule: autre, distance: 0.5 * 60 * autre.vel.mag() };       // une demi-seconde
  const loin = { vehicule: autre, distance: 2 * 60 * autre.vel.mag() };           // deux secondes
  const v = pilote(zone);
  piloter(v, { haut: true, drs: true }, { devant: proche });
  assert.equal(v.drsActif, true);
  assert.ok(Math.abs(v.maxSpeed - v.vitesseDeBase() * (1 + v.parametres.bonusDRS)) < 1e-9);
  piloter(v, { haut: true, drs: false }, { devant: proche });
  assert.deepEqual([v.drsDisponible, v.drsActif], [true, false]);
  piloter(v, { haut: true, drs: true }, { devant: loin });
  assert.equal(v.drsActif, false);
  const dehors = pilote(horsZone);
  piloter(dehors, { haut: true, drs: true }, { devant: proche });
  assert.equal(dehors.drsActif, false);
});

test('stand : P demande l\'arrêt avec les pneus choisis (1 à 5) ; refusé en accident', () => {
  const v = pilote();
  v.choisirPneus(VoiturePilote.TOUCHES_PNEUS[4]);
  assert.equal(v.demanderArret(), true);
  assert.deepEqual([v.demandeStand, v.pneuDemande], [true, 'INTER']);
  v.choisirPneus('PLUIE');
  assert.equal(v.pneuDemande, 'PLUIE');
  assert.throws(() => v.choisirPneus('NEIGE'), { name: 'RangeError' });
  const w = pilote();
  w.accidenter();
  assert.equal(w.demanderArret(), false);
});

test('accident : la voiture du joueur freine jusqu\'à l\'arrêt (une force), sans jamais repartir', () => {
  const v = pilote();
  v.accidenter();
  assert.equal(v.accidentee, true);
  let precedente = v.vitesse;
  for (let i = 0; i < 600; i++) {
    piloter(v, { haut: true });
    if (v.forces.freinage) assert.ok(v.forces.freinage.mag() <= v.maxForce + 1e-9);
    v.update(1 / 60);
    assert.ok(v.vitesse <= precedente + 1e-9);
    precedente = v.vitesse;
  }
  assert.ok(v.vitesse < 0.05, `${v.vitesse}`);
});

test('choix de la voiture : la course attend le joueur ; une VoiturePilote à son rang ; seulement avant le départ', () => {
  const c = course({ nombreVoitures: 6 });
  for (let i = 0; i < 60 * 5; i++) c.pas();
  assert.equal(c.etat, Course.ETATS.PRESENTATION);
  assert.equal(c.joueur, null);
  assert.equal(c.choisirJoueur(2), true);
  assert.ok(c.joueur instanceof VoiturePilote && c.voitures[2] === c.joueur);
  assert.equal(c.voitures.filter(v => v instanceof VoiturePilote).length, 1);
  assert.throws(() => c.choisirJoueur(6), { name: 'RangeError' });
  assert.equal(c.joueurSuivant(), true);
  assert.equal(c.voitures.indexOf(c.joueur), 3);
  for (let i = 0; i < 60 * 15 && c.etat !== Course.ETATS.COURSE; i++) c.pas();
  assert.equal(c.etat, Course.ETATS.COURSE);
  assert.equal(c.choisirJoueur(0), false);
  c.oublierJoueur();
  assert.equal(c.joueur, null);
  // sans le mode pilote : ni attente ni joueur
  const sans = course({ modePilote: false, nombreVoitures: 4 });
  assert.equal(sans.choisirJoueur(0), false);
  for (let i = 0; i < 60 * 3; i++) sans.pas();
  assert.notEqual(sans.etat, Course.ETATS.PRESENTATION);
});

// (règle d'origine, jusqu'au 17 octobre 2026 : carrosserie hors de l'asphalte 1,5 s d'affilée =
// +5 s, une fois par sortie (HORS_PISTE_TOLERE, PENALITE, surveillerLeJoueur). Remplacée par les
// limites de piste : quatre roues au-delà du vibreur 500 ms, deux avertissements, puis +5 s ; voir
// limitesPiste.test.mjs. Ce qui reste : une fois par sortie, et la case « Pénalités » décochée
// n'en donne aucune.)
test('pénalités : limites de piste, une fois par sortie ; case décochée : aucune', () => {
  const c = course({ nombreVoitures: 4, avertissementsLimites: 0 });
  c.murs = Course.decor(c.circuit).murs;
  c.choisirJoueur(0);
  for (let i = 0; i < 60 * 15 && c.etat !== Course.ETATS.COURSE; i++) c.pas();
  const j = c.joueur;
  j.passerA(COURSE);
  assert.equal(Object.hasOwn(Course, 'HORS_PISTE_TOLERE'), false);
  assert.equal(typeof c.surveillerLeJoueur, 'undefined');
  const i = 40;
  const sortir = (secondes, ecart = c.circuit.largeur / 2 + 30) => {
    for (let t = 0; t < secondes - 1e-9; t += Course.PAS_TEMPS) {
      const q = c.circuit.pointLateral(i, ecart);
      j.pos.set(q.x, q.y);
      j.indicePiste = i;
      j.ecartLateral = ecart;
      c.surveillerLesLimites(j);
    }
  };
  sortir(0.4);
  assert.equal(j.penalites, 0);
  sortir(0.2);
  assert.equal(j.penalites, 5);
  sortir(5);
  assert.equal(j.penalites, 5);                                   // une seule par sortie
  sortir(Course.PAS_TEMPS, 0);
  sortir(0.6);
  assert.equal(j.penalites, 10);
  c.parametres.penalites = false;
  sortir(Course.PAS_TEMPS, 0);
  sortir(1);
  assert.equal(j.penalites, 10);
});

test('contact avec une voiture (selon la tolérance) ou avec le mur : accident, débris, safety car, puis remise en piste', () => {
  const c = course({ nombreVoitures: 6, toleranceCollision: 1 });
  c.choisirJoueur(1);
  for (let i = 0; i < 60 * 15 && c.etat !== Course.ETATS.COURSE; i++) c.pas();
  for (let i = 0; i < 60; i++) c.pas();
  const j = c.joueur;
  const autre = c.voitures[0];
  // assez loin selon la tolérance : rien
  const d = autre.pos.copy().sub(j.pos);
  c.parametres.toleranceCollision = 0.5;
  if (d.mag() >= (j.r + autre.r) * 0.5) {
    c.verifierLesContacts();
    assert.equal(j.incident, null);
  }
  // au contact (la scène place les deux voitures l'une sur l'autre : règle de test)
  c.parametres.toleranceCollision = 1;
  j.pos.set(autre.pos.x + 5, autre.pos.y);
  c.verifierLesContacts();
  assert.ok(j.incident !== null && /contact avec la #/.test(j.incident.cause));
  // (règle d'origine : la voiture du joueur en ACCIDENT puis fin de partie ; depuis le 17 octobre
  // 2026 elle est remise en piste, voir incidentsJoueur.test.mjs)
  assert.equal(j.sousControle, false);
  assert.equal(c.debris.length, Course.DEBRIS);
  assert.ok(c.debris.every(m => m instanceof Debris));
  assert.ok(c.perturbations.some(p => p instanceof Perturbation));
  // radio, puis safety car ; puis la voiture est remise en piste et la course continue
  assert.equal(j.incident.type, 'accident');
  for (let i = 0; i < 60 * IncidentJoueur.DUREE_RADIO + 2; i++) c.pas();
  assert.equal(c.etat, Course.ETATS.SAFETY_CAR);
  assert.ok(c.voitures.filter(v => v !== j && v.etat !== VoitureF1.ETATS.STAND).every(v => v.etat === VoitureF1.ETATS.DRAPEAU));
  for (let i = 0; i < 60 * (IncidentJoueur.DUREE_NEUTRALISATION + IncidentJoueur.DUREE_DECOMPTE) + 4; i++) c.pas();
  assert.equal(j.sousControle, true);
  assert.notEqual(c.etat, Course.ETATS.FIN);
  assert.equal(c.chronometrage.abandon(j), false);

  // le mur
  // (après le départ : avant, aucun contact ne compte, voir etats.test.mjs)
  const m = course({ nombreVoitures: 4 });
  m.choisirJoueur(0);
  for (let i = 0; i < 60 * 15 && m.etat !== Course.ETATS.COURSE; i++) m.pas();
  // (jusqu'au 17 octobre 2026, seul l'écart latéral comptait ; depuis, les coins de la carrosserie
  // à leur vraie place : la voiture est posée contre le mur, règle de test)
  const cote = m.joueur.ecartLateral >= 0 ? 1 : -1;
  const q = m.circuit.pointLateral(m.joueur.indicePiste, cote * m.distanceDuMur(m.joueur));
  m.joueur.pos.set(q.x, q.y);
  m.joueur.ecartLateral = cote * m.distanceDuMur(m.joueur);
  // vers le mur à 60 km/h (depuis le 18 octobre 2026, un accident demande 40 km/h ou plus)
  const nm = m.circuit.normales[m.joueur.indicePiste];
  m.joueur.vel.set(nm.x * cote * 60 / m.joueur.constructor.KMH, nm.y * cote * 60 / m.joueur.constructor.KMH);
  m.verifierLesContacts();
  assert.equal(m.joueur.incident.cause, 'contact avec le mur');
});

test('fin de partie sans accident : les trois premiers rejoignent le podium avec arrive, les autres s\'arrêtent', () => {
  const c = course({ nombreVoitures: 6 });
  c.choisirJoueur(5);
  for (let i = 0; i < 60 * 15 && c.etat !== Course.ETATS.COURSE; i++) c.pas();
  for (let i = 0; i < 60 * 3; i++) c.pas();
  const premiers = c.classement().slice(0, 3);
  c.finirLaPartie();
  assert.equal(c.etat, Course.ETATS.FIN);
  assert.deepEqual(c.podium, premiers);
  const places = c.placesDuPodium();
  premiers.forEach((v, k) => assert.deepEqual([v.place.x, v.place.y], [places[k].x, places[k].y]));
  assert.ok(c.voitures.every(v => v.etat === PARC));
  // ils y arrivent par des forces (arrive), et s'y arrêtent
  for (let i = 0; i < 60 * 20; i++) c.pas();
  premiers.forEach((v, k) => assert.ok(Math.hypot(v.pos.x - places[k].x, v.pos.y - places[k].y) < 6, `${k}`));
  // une deuxième fin ne change rien
  c.finirLaPartie();
  assert.deepEqual(c.podium, premiers);
});

test('débris : éjectés par la perturbation (une force), freinés par la friction, effacés après DUREE s', () => {
  const souffle = new Perturbation(100, 100);
  const morceau = new Debris(103, 100, [255, 0, 0]);
  assert.equal(morceau.vel.mag(), 0);
  morceau.applyBehaviors({ perturbations: [souffle] });
  morceau.update(1 / 60);
  assert.ok(morceau.vel.x > 0, 'poussé loin du centre');
  let vitesseMax = 0;
  for (let t = 0; t < Debris.DUREE; t += 1 / 60) {
    morceau.applyBehaviors({});
    morceau.update(1 / 60);
    vitesseMax = Math.max(vitesseMax, morceau.vel.mag());
    assert.ok(morceau.vel.mag() <= Debris.VITESSE_MAX + 1e-9);
  }
  assert.ok(morceau.vel.mag() < 0.1);
  assert.ok(morceau.termine);
});

test('écran de fin : REJOUER en matrice de points (design), une particule par point allumé ; clic accepté seulement dans le mot formé', () => {
  const ecran = new EcranFin(1000, 700, { x: 500, y: 350 }, scene.context.random);
  assert.ok(ecran.particules.every(p => p instanceof Particule));
  // 7 lettres de 7 × 5 cases ; une particule par case allumée (R 18, E 18, J 11, O 16, U 15)
  assert.equal(ecran.cases.length, 7 * 35);
  assert.equal(ecran.particules.length, 18 + 18 + 11 + 16 + 15 + 18 + 18);
  assert.equal(ecran.particules.filter(p => p.premiere).length, 18);      // le R d'accent
  // le mot est centré dans le monde ; cases de 14 px espacées de 6
  const xs = ecran.cases.map(c => c.x);
  near((Math.min(...xs) + Math.max(...xs)) / 2, 500, 1e-9);
  near(ecran.cases[1].x - ecran.cases[0].x, EcranFin.POINT + EcranFin.ESPACE, 1e-9);
  const affectees = Array.from(ecran.affectation).filter(k => k >= 0);
  assert.equal(new Set(affectees).size, affectees.length);
  const z = ecran.zone;
  const centre = { x: z.x + z.largeur / 2, y: z.y + z.hauteur / 2 };
  assert.equal(ecran.clicRejoue(centre.x, centre.y), false);     // pas encore formé
  for (let i = 0; i < 60 * 30 && !ecran.forme; i++) {
    ecran.applyBehaviors();
    ecran.update();
  }
  assert.ok(ecran.forme);
  assert.equal(ecran.clicRejoue(centre.x, centre.y), true);
  assert.equal(ecran.clicRejoue(z.x - 1, centre.y), false);
});

test('HUD : dessiné sans erreur avant le choix, en course et en accident', () => {
  const v = pilote();
  const hud = new HudPilote();
  const c = course({ nombreVoitures: 4 });
  hud.show(c, 1200, 800);
  c.choisirJoueur(0);
  for (let i = 0; i < 60 * 12; i++) c.pas();
  hud.show(c, 1200, 800);
  c.provoquerAccident(c.joueur.pos.x, c.joueur.pos.y, 'test');
  hud.show(c, 1200, 800);
  assert.ok(v.rapport >= 1 && v.rapport <= VoiturePilote.RAPPORTS);
  assert.equal(v.kmh, Math.round(v.vitesse * VoiturePilote.KMH));
});
