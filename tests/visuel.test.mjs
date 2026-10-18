import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator, near } from './support.mjs';

// Phase 3 : rendu. Traces de pneus persistantes (et leur gomme), poussière et billes de gomme
// (des Vehicle, plafonnés selon la qualité), ambiance jour / nuit (lumières en mode additif),
// foule animée, effets de vitesse, caméras drone / embarquée / réalisation TV, drone qui survole le
// groupe de tête. Ce qui ne bouge pas (ambiance, foule, effets, traces, caméra) n'est pas un Vehicle.

const scene = loadScene(F1, `({ Vehicle, Circuit, Course, VoitureF1, DroneCamera, Camera, Ambiance, Foule, EffetsVitesse,
  TracesPneus, GerbePoussiere, BilleGomme, SpriteVoiture, CarteSurfaces })`);
const { Vehicle, Circuit, Course, VoitureF1, DroneCamera, Camera, Ambiance, Foule, EffetsVitesse,
  TracesPneus, GerbePoussiere, BilleGomme, SpriteVoiture, CarteSurfaces } = scene;
const graine = n => {
  const u = generator(n);
  scene.context.random = (a, b) => (b === undefined ? u() * (a ?? 1) : a + u() * (b - a));
};
function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages }, Circuit.generateur(1999));
}
function jusqua(c, condition, limite = 60 * 300) {
  for (let i = 0; i < limite; i++) {
    if (condition(c)) return i;
    c.pas();
  }
  return assert.fail('condition jamais atteinte');
}
const enCourse = c => jusqua(c, x => x.etat === Course.ETATS.COURSE);
const appels = nom => scene.calls.filter(a => a[0] === nom);

test('classes : poussière, billes de gomme et drone sont des Vehicle ; ambiance, foule, effets, traces, caméra n\'en sont pas', () => {
  assert.ok(new GerbePoussiere(0, 0) instanceof Vehicle);
  assert.ok(new BilleGomme(0, 0) instanceof Vehicle);
  assert.ok(new DroneCamera(0, 0, 100, 100) instanceof Vehicle);
  const c = course({ nombreVoitures: 2 });
  for (const fixe of [new Ambiance(), new Foule(Course.decor(c.circuit)), new EffetsVitesse(), new TracesPneus(c.circuit), new Camera()]) {
    assert.ok(!(fixe instanceof Vehicle), fixe.constructor.name);
  }
  assert.ok(!(SpriteVoiture.prototype instanceof Vehicle));
});

test('traces de pneus : la gomme s\'accumule sur la trajectoire et donne un peu d\'adhérence ; le calque n\'existe que si on dessine', () => {
  const c = course({ nombreVoitures: 4 });
  const traces = new TracesPneus(c.circuit, new CarteSurfaces(c.circuit, Course.decor(c.circuit)));
  enCourse(c);
  for (let i = 0; i < 600; i++) {
    c.pas();
    traces.deposer(c.voitures, false);
  }
  assert.equal(traces.calque, null);                              // gomme seulement, aucun dessin
  const gomme = traces.surfaces.gomme;
  assert.ok(gomme.some(g => g > 0), 'aucune gomme déposée');
  // là où il y a le plus de gomme, le bonus d'adhérence est positif sur la trajectoire, nul loin d'elle
  const i = gomme.indexOf(Math.max(...gomme));
  assert.ok(traces.surfaces.bonusGomme(i, 0) >= 0);
  assert.ok(Math.max(...c.circuit.points.map((_, k) => traces.surfaces.bonusGomme(k, 0))) > 0);
  assert.ok(Math.max(...c.circuit.points.map((_, k) => traces.surfaces.bonusGomme(k, 0))) <= CarteSurfaces.GOMME_MAX + 1e-12);
  // en dessinant : un calque de la taille du monde, des traits sous les roues arrière
  traces.deposer(c.voitures, true);
  traces.deposer(c.voitures, true);
  assert.ok(traces.calque !== null && traces.traits > 0);
  assert.ok(traces.calque.largeur >= c.circuit.largeurMonde);
  traces.effacer();
  assert.equal(traces.traits, 0);
});

test('billes de gomme : immobiles seules ; balayées par une voiture qui passe tout près (flee) ; effacées au bout de DUREE', () => {
  const bille = new BilleGomme(100, 100);
  for (let i = 0; i < 30; i++) {
    bille.applyBehaviors({ voitures: [] });
    bille.update(1 / 60);
  }
  near(bille.pos.x, 100, 1e-9);
  near(bille.pos.y, 100, 1e-9);
  // une voiture rapide juste à gauche : la bille part vers la droite
  const voiture = { pos: scene.context.createVector(92, 100), vitesse: 5 };
  bille.applyBehaviors({ voitures: [voiture] });
  bille.update(1 / 60);
  assert.ok(bille.pos.x > 100, `x = ${bille.pos.x}`);
  // une voiture lente ou lointaine ne la touche pas
  const autre = new BilleGomme(0, 0);
  autre.applyBehaviors({ voitures: [{ pos: scene.context.createVector(BilleGomme.PORTEE, 0), vitesse: 5 }, { pos: scene.context.createVector(2, 0), vitesse: 0.2 }] });
  autre.update(1 / 60);
  near(autre.pos.x, 0, 1e-12);
  autre.update(BilleGomme.DUREE);
  assert.ok(autre.termine);
});

test('poussière et billes : plafonnées selon la qualité (bas 0,4, moyen 1, élevé 1,5) ; options décochées : aucune', () => {
  for (const [qualite, facteur] of [['bas', 0.4], ['moyen', 1], ['eleve', 1.5]]) {
    const c = course({ nombreVoitures: 20 });
    c.affichage.qualite = qualite;
    assert.equal(c.facteurQualite, facteur);
    enCourse(c);
    for (let i = 0; i < 180; i++) c.pas();                       // lancées (plus de 1 px par image)
    for (let i = 0; i < 400; i++) {
      c.voitures.forEach(v => { v.surface = 'gravier'; v.pneus = 0.3; });
      c.emettreLesPoussieres();
    }
    assert.ok(c.poussieres.length <= Course.POUSSIERE_MAX * facteur && c.poussieres.length > 0, `${qualite} : ${c.poussieres.length}`);
    assert.ok(c.billes.length <= Course.BILLES_MAX * facteur && c.billes.length > 0, `${qualite} : ${c.billes.length}`);
    assert.ok(c.poussieres.every(p => p instanceof GerbePoussiere) && c.billes.every(b => b instanceof BilleGomme));
  }
  const c = course({ nombreVoitures: 6 });
  c.affichage.poussiere = false;
  c.affichage.billes = false;
  enCourse(c);
  for (let i = 0; i < 200; i++) {
    c.voitures.forEach(v => { v.surface = 'herbe'; v.pneus = 0.3; });
    c.emettreLesPoussieres();
  }
  assert.equal(c.poussieres.length + c.billes.length, 0);
});

test('effets visuels : ils ne changent jamais la course (mêmes positions, toutes options cochées ou non)', () => {
  const positions = affichage => {
    graine(7);
    const c = course({ nombreVoitures: 8 });
    Object.assign(c.affichage, affichage);
    for (let i = 0; i < 1500; i++) c.pas();
    return c.voitures.map(v => [v.pos.x, v.pos.y]);
  };
  const tout = positions({ traces: true, poussiere: true, billes: true, fumee: true, etincelles: true, qualite: 'eleve' });
  const rien = positions({ traces: false, poussiere: false, billes: false, fumee: false, etincelles: false, qualite: 'bas' });
  assert.deepEqual(tout, rien);
});

test('ambiance : obscurité de chaque moment ; le cycle passe du jour à la nuit ; la nuit, lumières en mode « screen » (design)', () => {
  const ambiance = new Ambiance();
  assert.equal(ambiance.obscurite('jour'), 0);
  assert.ok(ambiance.obscurite('crepuscule') > 0 && ambiance.obscurite('crepuscule') < ambiance.obscurite('nuit'));
  assert.equal(ambiance.obscurite('cycle'), 0);
  ambiance.update(Ambiance.DUREE_CYCLE / 2);
  near(ambiance.obscurite('cycle'), Ambiance.OBSCURITE.nuit, 1e-9);
  // durée du cycle plus courte : la nuit arrive plus vite
  const rapide = new Ambiance();
  rapide.update(Ambiance.DUREE_CYCLE / 4, Ambiance.DUREE_CYCLE / 2);
  near(rapide.obscurite('cycle'), Ambiance.OBSCURITE.nuit, 1e-9);
  // le jour : rien n'est dessiné ; la nuit : voile, lumières précalculées (une fois) copiées en
  // mode « screen » (design : fiche technique, Projecteurs)
  const c = course({ nombreVoitures: 4 });
  const decor = Course.decor(c.circuit);
  scene.calls.length = 0;
  ambiance.showMonde(c, decor, 'jour', 'moyen');
  assert.equal(scene.calls.length, 0);
  const crees = scene.graphiques.crees.length;
  ambiance.showMonde(c, decor, 'nuit', 'moyen');
  const modes = appels('blendMode').map(a => a[1]);
  assert.deepEqual([modes[0], modes.at(-1)], [scene.context.SCREEN, scene.context.BLEND]);
  assert.ok(appels('image').length >= 1 + c.voitures.length);  // lumières + phares
  const apres = scene.graphiques.crees.length;
  assert.ok(apres > crees);
  ambiance.showMonde(c, decor, 'nuit', 'moyen');
  assert.equal(scene.graphiques.crees.length, apres);            // précalculé : rien de recréé
  // qualité basse : ni grain ni vignette
  scene.calls.length = 0;
  ambiance.showEcran(800, 600, 'bas');
  assert.equal(scene.calls.length, 0);
});

test('foule : une tribune s\'enthousiasme au passage du leader, puis retombe en DUREE_EXCITATION secondes', () => {
  const c = course({ nombreVoitures: 2 });
  const decor = Course.decor(c.circuit);
  assert.ok(decor.tribunes.length > 0);
  const foule = new Foule(decor);
  const tribune = decor.tribunes[0];
  const leader = { etat: VoitureF1.ETATS.COURSE, indicePiste: foule.indiceDe(tribune), depassements: 0 };
  foule.update(1 / 60, { leader, voitures: [leader] });
  assert.equal(foule.excitations[0], 1);
  // le leader s'éloigne (moitié du tour plus loin) : l'excitation retombe
  leader.indicePiste = c.circuit.indice(foule.indiceDe(tribune) + c.circuit.n / 2);
  foule.update(Foule.DUREE_EXCITATION / 2, { leader, voitures: [leader] });
  near(foule.excitations[0], 0.5, 1e-9);
  foule.update(Foule.DUREE_EXCITATION, { leader, voitures: [leader] });
  assert.equal(foule.excitations[0], 0);
  // la foule se dessine (un point par spectateur)
  scene.calls.length = 0;
  foule.show();
  assert.ok(appels('circle').length >= tribune.foule.length);
});

test('effets de vitesse : rien sous le seuil ; à pleine vitesse, intensité proche de 1, lignes et secousse', () => {
  const effets = new EffetsVitesse();
  effets.update(1, { vitesse: 2 }, 10);
  assert.equal(effets.intensite, 0);
  near(effets.secousse().x, 0, 1e-12);
  scene.calls.length = 0;
  effets.show({ x: 0, y: 0, largeur: 800, hauteur: 600 });
  assert.equal(scene.calls.length, 0);
  for (let i = 0; i < 120; i++) effets.update(1 / 60, { vitesse: 10 }, 10);
  assert.ok(effets.intensite > 0.95);
  const s = effets.secousse();
  assert.ok(Math.hypot(s.x, s.y) <= EffetsVitesse.SECOUSSE * Math.SQRT2 + 1e-9);
  effets.show({ x: 0, y: 0, largeur: 800, hauteur: 600 });
  assert.equal(appels('line').length, EffetsVitesse.LIGNES);
  // aucune voiture suivie : l'effet retombe
  for (let i = 0; i < 240; i++) effets.update(1 / 60, null, 10);
  assert.ok(effets.intensite < 0.01);
});

test('caméras : drone, embarquée (la voiture pointe vers le haut), réalisation TV qui change de plan ; versMonde inverse le dessin', () => {
  const zone = { x: 0, y: 0, largeur: 700, hauteur: 500 };
  const camera = new Camera();
  const drone = { pos: { x: 400, y: 300 } };
  camera.choisirMode('drone');
  camera.suivre(zone, 1800, 1100, null, 1 / 60, { drone });
  near(camera.x, 400);
  near(camera.y, 300);
  // embarquée : la caméra regarde devant la voiture ; le cap de la voiture devient « vers le haut »
  camera.choisirMode('embarquee');
  const voiture = { pos: { x: 500, y: 500 }, cap: 0.7, glisseActive: false };
  for (let i = 0; i < 600; i++) camera.suivre(zone, 1800, 1100, voiture, 1 / 60, { secousse: { x: 0, y: 0 } });
  near(Math.cos(camera.rotation + voiture.cap), Math.cos(-Math.PI / 2), 1e-6);
  near(camera.x, 500 + Math.cos(0.7) * Camera.AVANCE_EMBARQUEE, 1e-6);
  // versMonde : un point du monde, dessiné (rotation comprise), puis ramené dans le monde
  const monde = { x: 520, y: 470 };
  const dx = monde.x - camera.x;
  const dy = monde.y - camera.y;
  const c = Math.cos(camera.rotation);
  const s = Math.sin(camera.rotation);
  const ecran = { x: zone.largeur / 2 + camera.echelle * (dx * c - dy * s), y: zone.hauteur / 2 + camera.echelle * (dx * s + dy * c) };
  const retour = camera.versMonde(ecran.x, ecran.y);
  near(retour.x, monde.x, 1e-6);
  near(retour.y, monde.y, 1e-6);
  scene.calls.length = 0;
  camera.appliquer();
  assert.deepEqual(scene.calls.map(a => a[0]), ['translate', 'scale', 'rotate', 'translate']);
  // réalisation TV : un plan dure DUREE_PLAN secondes, puis le suivant
  camera.choisirMode('tv');
  assert.equal(camera.modeEffectif, Camera.PLANS_TV[0]);
  const vus = new Set();
  for (let t = 0; t < Camera.DUREE_PLAN * Camera.PLANS_TV.length + 1; t += 0.5) {
    camera.suivre(zone, 1800, 1100, voiture, 0.5, { drone });
    vus.add(camera.modeEffectif);
  }
  assert.deepEqual([...vus].sort(), [...Camera.PLANS_TV].sort());
});

test('drone : arrive vers le groupe de tête (force, jamais de position écrite), reste au-dessus du monde', () => {
  graine(3);
  const drone = new DroneCamera(200, 200, 1800, 1100);
  const groupe = { x: 1200, y: 700 };
  const depart = Math.hypot(groupe.x - 200, groupe.y - 200);
  for (let i = 0; i < 60 * 20; i++) {
    drone.applyBehaviors({ groupe });
    drone.update(1 / 60);
    assert.ok(drone.vel.mag() <= DroneCamera.VITESSE_MAX + 1e-9);
  }
  assert.ok(Math.hypot(groupe.x - drone.pos.x, groupe.y - drone.pos.y) < depart / 4);
  // sans groupe : il erre, sans quitter le monde
  graine(4);
  const libre = new DroneCamera(900, 550, 1800, 1100);
  for (let i = 0; i < 60 * 60; i++) {
    libre.applyBehaviors({ groupe: null });
    libre.update(1 / 60);
  }
  assert.ok(libre.pos.x > 0 && libre.pos.x < 1800 && libre.pos.y > 0 && libre.pos.y < 1100);
  // dans une course : le drone vise le centre des trois premiers
  const c = course({ nombreVoitures: 6 });
  assert.equal(c.groupeDeTete(), null);                          // avant le départ
  enCourse(c);
  const tete = c.classement().slice(0, 3);
  const centre = c.groupeDeTete();
  near(centre.x, tete.reduce((s, v) => s + v.pos.x, 0) / 3, 1e-9);
});
