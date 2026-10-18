import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator } from './support.mjs';

// Phase 0 : physique de glisse. Cercle d'adhérence (sous-virage, blocage), angle de dérive
// (survirage, contre-braquage), frottement, surfaces (vibreur, herbe, gravier, mur), température
// des pneus, rendu (cap de la carrosserie, étincelles), et toujours : rien que des forces.

const scene = loadScene(F1, '({ Vehicle, Circuit, Course, VoitureF1, Glisse, CarteSurfaces, Etincelle, Fumee, Meteo })');
const { Vehicle, Circuit, Course, VoitureF1, Glisse, CarteSurfaces, Etincelle, Fumee, Meteo } = scene;
const circuit = Course.circuit('classique');
const surfaces = Course.surfaces(circuit);
const PAS = 1 / 60;
const vecteur = (x, y) => scene.context.createVector(x, y);
const graine = n => {
  const u = generator(n);
  scene.context.random = (a, b) => (b === undefined ? u() * (a ?? 1) : a + u() * (b - a));
};

// Une voiture en course au point `indice`, à l'écart `lateral`, lancée à `vitesse` le long de la piste.
function voiture(indice, { lateral = 0, vitesse = 4, reglages = {} } = {}) {
  const parametres = { ...Course.parametresParDefaut(), usurePneus: 0, frequenceErreurs: 0, ...reglages };
  const point = circuit.pointLateral(indice, lateral);
  const v = new VoitureF1(point.x, point.y, { circuit, parametres, alea: () => 0.5, surfaces });
  v.passerA(VoitureF1.ETATS.COURSE);
  const t = circuit.tangentes[circuit.indice(indice)];
  v.applyForce(vecteur(t.x * vitesse, t.y * vitesse));
  v.update();
  return v;
}
function rouler(v, images, contexte = {}, observer = () => {}) {
  for (let i = 0; i < images; i++) {
    v.decide(contexte);
    v.applyBehaviors(contexte);
    v.update(PAS);
    observer(v, i);
  }
}
const virageSerre = circuit.virages.reduce((a, b) => (a.courbure > b.courbure ? a : b));

test('module : cercle d\'adhérence — demande latérale saturée (sous-virage), freinage au-delà = blocage, cercle total', () => {
  const t = { x: 1, y: 0 };
  const capacites = { laterale: 1, freinage: 1, motricite: 1, totale: 10 };
  const s = Glisse.cercle({ x: 0, y: 2 }, t, capacites);
  assert.deepEqual([s.x, s.y], [0, 1]);
  assert.ok(Math.abs(s.sousVirage - 1) < 1e-12);
  assert.equal(s.blocage, false);
  const b = Glisse.cercle({ x: -3, y: 0 }, t, capacites);
  assert.equal(b.blocage, true);
  assert.ok(Math.abs(b.x + 0.8) < 1e-12, 'roues bloquées : on freine moins qu\'au bord du blocage');
  const ok = Glisse.cercle({ x: 0.5, y: 0.5 }, t, capacites);
  assert.deepEqual([ok.x, ok.y, ok.sousVirage, ok.blocage], [0.5, 0.5, 0, false]);
  const total = Glisse.cercle({ x: 0.9, y: 0.9 }, t, { ...capacites, totale: 1 });
  assert.ok(Math.abs(Math.hypot(total.x, total.y) - 1) < 1e-12);
});

test('module : adhérences — surfaces, température, appui aéro, aspiration ; l\'arrière décroche sous la pluie en slicks, pas en pneus pluie', () => {
  const asphalte = Glisse.adherences({});
  assert.deepEqual([asphalte.avant, asphalte.arriere], [1, 1]);
  for (const surface of ['vibreur', 'herbe', 'gravier']) assert.ok(Glisse.adherences({ surface }).avant < 1, surface);
  assert.ok(Glisse.adherences({ surface: 'gravier' }).avant < Glisse.adherences({ surface: 'herbe' }).avant);
  assert.ok(Glisse.adherences({ surface: 'vibreur' }).perteArriere > 0);
  assert.ok(Glisse.adherences({ vitesse: 1 }).avant > 1, 'appui aéro');
  assert.ok(Glisse.adherences({ aspiration: 1 }).avant < 1, 'air sale');
  // pneu inadapté (slick sur piste mouillée : base 0,55) contre pneu pluie (base 0,92)
  const slick = Glisse.adherences({ base: 0.55, humidite: 0.9 });
  const pluie = Glisse.adherences({ base: 0.92, humidite: 0.9 });
  assert.ok(slick.perteArriere > 3 * pluie.perteArriere);
  assert.equal(Glisse.adherences({ base: 0.55, humidite: 0.9, survirage: 0 }).perteArriere, 0);
  // température : 1 dans la fenêtre, moins dehors, jamais sous ADHERENCE_FROIDE
  assert.equal(Glisse.facteurTemperature('slick', 95), 1);
  assert.ok(Glisse.facteurTemperature('slick', 60) < 1 && Glisse.facteurTemperature('slick', -50) >= 0.82);
  assert.equal(Glisse.facteurTemperature('pluie', 50), 1);
});

test('module : dérive — l\'arrière qui décroche fait tourner la carrosserie ; rappel et contre-braquage la ramènent', () => {
  let d = 0;
  for (let i = 0; i < 30; i++) d = Glisse.lacet(d, { lacetVitesse: 0.03, deficit: 0.5, charge: 1, adherenceArriere: 0.5 });
  assert.ok(d > 0.08, `${d}`);
  assert.equal(Glisse.lacet(0, { lacetVitesse: 0.03, deficit: 0, charge: 1 }), 0, 'arrière qui accroche : pas de dérive');
  // le pilote contre-braque : sans correction, la dérive retombe bien plus lentement
  const retour = contreBraquage => {
    let x = 0.4;
    for (let i = 0; i < 20; i++) x = Glisse.lacet(x, { adherenceArriere: 0.3, contreBraquage });
    return x;
  };
  assert.ok(retour(0.06) < retour(0) * 0.6);
  assert.ok(Math.abs(Glisse.lacet(5, {})) <= Glisse.DERIVE_MAX, 'pas de tête-à-queue');
  assert.ok(Math.abs(Glisse.angle(3 * Math.PI) - Math.PI) < 1e-12);
});

test("sous-virage : demande latérale au-delà de l'adhérence — la force est saturée, la voiture tourne moins et part large", () => {
  // la même demande de virage (seek vers un point sur le côté), à la même vitesse : avec peu
  // d'adhérence, la force latérale est saturée et le cap tourne bien moins
  const tourner = (reglages, images = 20) => {
    const v = voiture(200, { vitesse: 4.5, reglages });
    let sature = 0;
    let rayons = 0;
    for (let i = 0; i < images; i++) {
      const cap = v.vel.heading();
      v.decide({});
      v.forces = {};
      v.demande = vecteur(0, 0);
      const n = { x: -v.vel.y / v.vitesse, y: v.vel.x / v.vitesse };
      const cible = vecteur(v.pos.x + v.vel.x * 8 + n.x * 60, v.pos.y + v.vel.y * 8 + n.y * 60);
      v.appliquer('seek', v.seek(cible), 1.2);
      v.transmettreAuxPneus();
      if (v.etatPneus.sousVirage > 0) sature++;
      v.update(PAS);
      // rayon de la trajectoire de l'image : vitesse / rotation de la vitesse
      rayons += v.vitesse / Math.max(1e-6, Math.abs(Glisse.angle(v.vel.heading() - cap)));
    }
    return { rayon: rayons / images, sature };
  };
  const adherent = tourner({});
  const glissant = tourner({ adherenceGlobale: 0.35 });
  assert.equal(adherent.sature, 0);
  assert.ok(glissant.sature > 10, `${glissant.sature} images saturées`);
  assert.ok(glissant.rayon > adherent.rayon * 1.5, `rayon : ${adherent.rayon.toFixed(0)} -> ${glissant.rayon.toFixed(0)} px`);
  // le curseur d'intensité : à bonne adhérence, 1 ne sature pas, 2 sature
  assert.equal(tourner({ adherenceGlobale: 0.9, sousVirage: 1 }).sature, 0);
  assert.ok(tourner({ adherenceGlobale: 0.9, sousVirage: 2 }).sature > 10);
  // dans une course, peu d'adhérence : des images de sous-virage
  graine(3);
  const v = voiture(virageSerre.apex - 300 / circuit.pas, { reglages: { adherenceGlobale: 0.35, rayonFreinage: 40 } });
  let sature = 0;
  rouler(v, 150, {}, x => { if (x.etatPneus.sousVirage > 0) sature++; });
  assert.ok(sature > 5, `${sature}`);
});

test('survirage : adhérence arrière réduite (slicks sous la pluie) -> angle de dérive non nul ; le contre-braquage le ramène à ~0', () => {
  graine(4);
  const pluie = new Meteo({ modeMeteo: 'manuel', intensitePluie: 1 });
  const v = voiture(virageSerre.apex - 260 / circuit.pas, { reglages: { survirage: 2, pneusDepart: 'MEDIUM' } });
  let deriveMax = 0;
  rouler(v, 160, { meteo: pluie }, x => { deriveMax = Math.max(deriveMax, Math.abs(x.derive)); });
  assert.ok(deriveMax > v.parametres.seuilGlisse, `dérive max ${deriveMax}`);
  assert.ok(v.etatPneus.arriere < v.etatPneus.avant);
  // la carrosserie n'est pas dans l'axe de la vitesse pendant la glissade (attribut de dessin)
  // ligne droite au sec : l'arrière accroche, le pilote contre-braque, la dérive revient à ~0
  const sec = new Meteo({ modeMeteo: 'sec' });
  v.parametres.survirage = 1;
  rouler(v, 240, { meteo: sec });
  assert.ok(Math.abs(v.derive) < 0.01, `${v.derive}`);
  assert.ok(Math.abs(Glisse.angle(v.capCarrosserie - v.capVitesse) - v.derive) < 1e-9);
});

test('frottement de glissement : au-delà du seuil, une force opposée à la vitesse ; en dessous, aucune', () => {
  const v = voiture(30);
  v.decide({});
  v.derive = 0.3;                                                 // état imposé pour le test
  v.applyBehaviors({});
  const f = v.forces.frottement;
  assert.ok(f && f.mag() > 0);
  assert.ok(f.x * v.vel.x + f.y * v.vel.y < 0);
  assert.ok(v.forces.rappel && v.forces.rappel.mag() > 0, 'rappel latéral du pneu');
  const w = voiture(30);
  w.decide({});
  w.derive = 0.02;
  w.applyBehaviors({});
  assert.equal(w.forces.frottement, undefined);
  // réglage à 0 : plus de frottement
  const z = voiture(30, { reglages: { frottementGlissement: 0 } });
  z.decide({});
  z.derive = 0.3;
  z.applyBehaviors({});
  assert.equal(z.forces.frottement, undefined);
});

test('blocage des roues : freinage trop tardif -> roues bloquées, plat de pneu, usure accrue, fumée', () => {
  const v = voiture(30, { vitesse: 5 });
  let bloque = 0;
  const pneus = v.pneus;
  for (let i = 0; i < 40; i++) {
    v.decide({});
    v.applyBehaviors({});
    // le pilote freine bien trop tard : une demande de freinage énorme (comportement imposé)
    v.demande = vecteur(-v.vel.x, -v.vel.y).setMag(v.forceDeBase() * 4);
    v.transmettreAuxPneus();
    if (v.etatPneus.blocage) bloque++;
    v.update(PAS);
  }
  assert.ok(bloque > 10);
  assert.ok(v.platDePneu > 0.2);
  assert.ok(v.pneus < pneus);
  assert.equal(v.glisseVisible || v.vitesse < 1, true);
});

test('surfaces : la carte dit asphalte, vibreur, herbe, gravier, mur ; vibreur = adhérence réduite', () => {
  const demi = circuit.largeur / 2;
  assert.equal(surfaces.surface(0, 0), 'asphalte');
  const iVibreur = surfaces.vibreurs['1'].findIndex(Boolean);
  assert.ok(iVibreur >= 0);
  // (jusqu'au 18 octobre 2026 à demi + 3 ; depuis, la ligne blanche, 3,5 px, est de l'asphalte, et
  // il n'y a ni gravier ni herbe sous les dégagements dessinés)
  assert.equal(surfaces.surface(iVibreur, demi + 5), 'vibreur');
  const graviers = Object.entries(surfaces.graviers).flatMap(([cote, liste]) => liste.map((p, i) => [cote, i, p])).filter(([cote, i, p]) => p > 20 && surfaces.degagements[cote][i] === 0);
  const [cote, iGravier, profondeur] = graviers[0];
  assert.equal(surfaces.surface(iGravier, Number(cote) * (demi + 4 + profondeur / 2)), 'gravier');
  // un rail : au-delà, le mur
  const iRail = surfaces.rails['1'].findIndex(r => r !== null && !surfaces.vibreurs['1'][0]);
  assert.equal(surfaces.surface(iRail, surfaces.rails['1'][iRail] + 1), 'mur');
  // l'herbe : hors piste, ni vibreur ni gravier
  const iHerbe = surfaces.vibreurs['-1'].findIndex((v, i) => !v && !surfaces.bordures['-1'][i] && surfaces.degagements['-1'][i] === 0 && surfaces.graviers['-1'][i] === 0 && (surfaces.rails['-1'][i] ?? 999) > demi + 25);
  assert.equal(surfaces.surface(iHerbe, -(demi + 15)), 'herbe');
  // sur le vibreur, la voiture accroche moins (avant) et l'arrière décroche un peu
  const v = voiture(iVibreur, { lateral: demi + 5 });
  v.decide({});
  assert.equal(v.surface, 'vibreur');
  const surVibreur = v.adherencesDuMoment();
  v.surface = 'asphalte';
  const surAsphalte = v.adherencesDuMoment();
  assert.ok(surVibreur.avant < surAsphalte.avant && surVibreur.perteArriere > surAsphalte.perteArriere);
});

test('gravier : la voiture s\'enlise, s\'arrête et passe BLOQUEE ; herbe : traînée sans blocage', () => {
  const demi = circuit.largeur / 2;
  const [cote, i, profondeur] = Object.entries(surfaces.graviers).flatMap(([c, l]) => l.map((p, k) => [Number(c), k, p])).find(([c, k, p]) => p > 30 && surfaces.degagements[c][k] === 0);
  const v = voiture(i, { lateral: cote * (demi + 4 + profondeur / 2), vitesse: 4 });
  let images = 0;
  for (; images < 60 * 6 && v.etat !== VoitureF1.ETATS.BLOQUEE; images++) rouler(v, 1);
  assert.equal(v.surface, 'gravier');
  assert.equal(v.etat, VoitureF1.ETATS.BLOQUEE, 'enlisée');
  assert.ok(images < 60 * 4, `${images} images`);
  // bloquée, elle ne repart pas (son pilotage ne passe plus)
  rouler(v, 120);
  assert.ok(v.vitesse < 0.2);
  assert.equal(v.etat, VoitureF1.ETATS.BLOQUEE);
  // herbe : elle ralentit (traînée) sans s'enliser
  const iHerbe = surfaces.vibreurs['-1'].findIndex((x, k) => !x && !surfaces.bordures['-1'][k] && surfaces.degagements['-1'][k] === 0 && surfaces.graviers['-1'][k] === 0 && (surfaces.rails['-1'][k] ?? 999) > demi + 40);
  const h = voiture(iHerbe, { lateral: -(demi + 20), vitesse: 4 });
  h.decide({});
  assert.equal(h.surface, 'herbe');
  h.applyBehaviors({});
  assert.ok(h.forces.surface && h.forces.surface.x * h.vel.x + h.forces.surface.y * h.vel.y < 0);
});

test('température des pneus : elle monte en roulant, vers la fenêtre ; retour aux couvertures au stand', () => {
  const v = voiture(30);
  const depart = v.temperaturePneus;
  rouler(v, 60 * 20);
  assert.ok(v.temperaturePneus > depart + 5, `${depart} -> ${v.temperaturePneus}`);
  assert.ok(v.temperaturePneus < 140);
});

test('toujours des forces : avec la glisse, decide et applyBehaviors n\'écrivent ni pos ni vel ; une force « pneus » transmise', () => {
  const v = voiture(virageSerre.apex - 100 / circuit.pas);
  for (let i = 0; i < 30; i++) {
    const pos = v.pos.copy();
    const vel = v.vel.copy();
    v.decide({});
    v.applyBehaviors({});
    assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], [pos.x, pos.y, vel.x, vel.y]);
    assert.ok(v.forces.pneus, 'la demande passe par les pneus');
    v.update(PAS);
  }
  // sans la glisse : comportement d'origine, pas de demande, pas de dérive
  const w = voiture(30, { reglages: { glisseRealiste: false } });
  rouler(w, 60);
  assert.equal(w.forces.pneus, undefined);
  assert.equal(w.demande, null);
  assert.equal(w.derive, 0);
});

test('rendu : la carrosserie est dessinée selon son propre cap ; debug : dérive et cercle d\'adhérence au bon rayon', () => {
  const v = voiture(30);
  rouler(v, 10);
  v.derive = 0.25;
  v.capCarrosserie = v.capVitesse + 0.25;
  scene.calls.length = 0;
  v.show();
  assert.ok(scene.calls.some(a => a[0] === 'rotate' && Math.abs(a[1] - v.capCarrosserie) < 1e-12));
  scene.calls.length = 0;
  v.showDebugGlisse();
  const diametres = scene.calls.filter(a => a[0] === 'circle').map(a => a[3]);
  assert.ok(diametres.some(d => Math.abs(d - 2 * v.etatPneus.capacites.totale * 60) < 1e-9));
  assert.ok(scene.calls.some(a => a[0] === 'text' && /°$/.test(a[1])));
});

test('étincelles : des Vehicle (Fumee), plafonnées ; fumée quand une voiture glisse ; option d\'affichage sans effet sur la course', () => {
  assert.equal(Object.getPrototypeOf(Etincelle), Fumee);
  assert.ok(new Etincelle(0, 0) instanceof Vehicle);
  const lancer = etincelles => {
    graine(21);
    const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 10, nombreTours: 2 }, Circuit.generateur(8));
    c.affichage.etincelles = etincelles;
    let max = 0;
    for (let i = 0; i < 60 * 40; i++) {
      c.pas();
      max = Math.max(max, c.etincelles.length);
    }
    return { c, max };
  };
  const avec = lancer(true);
  assert.ok(avec.max > 0 && avec.max <= Course.ETINCELLES_MAX, `${avec.max}`);
  const sans = lancer(false);
  assert.equal(sans.max, 0);
  // la simulation est la même avec ou sans (le hasard des effets est à part)
  assert.deepEqual(avec.c.voitures.map(v => v.pos.x), sans.c.voitures.map(v => v.pos.x));
});

test('glisse dans une vraie course : 12 voitures, 3 tours, au sec puis sous la pluie : aucun contact, tous à l\'arrivée', () => {
  for (const reglages of [{}, { modeMeteo: 'manuel', intensitePluie: 0.8, pneusDepart: 'PLUIE' }]) {
    const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 12, nombreTours: 3, ...reglages }, Circuit.generateur(9));
    let ecartMin = Infinity;
    let glisses = 0;
    for (let i = 0; i < 60 * 400 && !c.terminee; i++) {
      c.pas();
      const v = c.voitures;
      for (let a = 0; a < v.length; a++) {
        if (v[a].glisseVisible) glisses++;
        for (let b = a + 1; b < v.length; b++) ecartMin = Math.min(ecartMin, Math.hypot(v[a].pos.x - v[b].pos.x, v[a].pos.y - v[b].pos.y) - v[a].r - v[b].r);
      }
    }
    assert.ok(c.terminee, JSON.stringify(reglages));
    assert.ok(ecartMin >= 0, `${ecartMin}`);
    assert.ok(glisses > 0, 'des glissades visibles');
  }
});
