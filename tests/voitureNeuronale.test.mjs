import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, read, generator } from './support.mjs';

// VoitureNeuronale : une VoitureF1 dont le réseau dose seek, arrive, wander et séparation. Poids ->
// forces (norme bornée, poids nul = comportement absent, seul applyForce change l'accélération),
// variation par voiture, reprise de contrôle par la conduite classique.

const scene = loadScene(F1, '({ Vehicle, VoitureF1, VoitureNeuronale, ReseauNeuronal, Course, Entraineur })', { uniform: generator(4) });
const { Vehicle, VoitureF1, VoitureNeuronale, ReseauNeuronal, Course, Entraineur } = scene;
const e = new Entraineur({ population: 20, graine: 1, evaluationAuto: false });
const circuit = e.circuit('classique');
const logit = p => Math.log(p / (1 - p));
// Un réseau dont les sorties valent exactement ces poids (seek, arrive, wander, séparation).
function reseauFixe(poids) {
  const r = new ReseauNeuronal(12, ReseauNeuronal.mulberry32(1));
  r.poidsSorties.fill(0);
  poids.forEach((p, k) => { r.biaisSorties[k] = p <= 0 ? -60 : p >= 1 ? 60 : logit(p); });
  return r;
}
// Une manche d'une voiture neuronale (et des voisines éventuelles), avancée de n pas.
function rouler(poids, n = 240, autres = []) {
  const m = e.creerManche(circuit, [{ Classe: VoitureNeuronale, rang: 0, reseau: reseauFixe(poids) }, ...autres], { collisions: autres.length > 0 });
  for (let k = 0; k < n; k++) e.pasManche(m);
  return m;
}

test('VoitureNeuronale étend VoitureF1, donc Vehicle ; elle a un réseau et des capteurs à elle', () => {
  assert.equal(Object.getPrototypeOf(VoitureNeuronale), VoitureF1);
  assert.ok(VoitureNeuronale.prototype instanceof Vehicle);
  const v = rouler([1, 0.5, 0, 0], 1).suivis[0].voiture;
  assert.ok(v instanceof Vehicle && v instanceof VoitureF1);
  assert.ok(v.reseau instanceof ReseauNeuronal);
  // le réseau donné est cloné : deux voitures n'en partagent jamais un
  const r = reseauFixe([1, 0, 0, 0]);
  const m = e.creerManche(circuit, [{ Classe: VoitureNeuronale, rang: 0, reseau: r }, { Classe: VoitureNeuronale, rang: 1, reseau: r }]);
  assert.notEqual(m.suivis[0].voiture.reseau, r);
  assert.notEqual(m.suivis[0].voiture.reseau, m.suivis[1].voiture.reseau);
});

test('poids -> forces : force = Σ poids × comportement, de norme ≤ maxForce, à chaque image', () => {
  const m = e.creerManche(circuit, [{ Classe: VoitureNeuronale, rang: 0, reseau: new ReseauNeuronal(12, ReseauNeuronal.mulberry32(8)) }]);
  const v = m.suivis[0].voiture;
  let vues = 0;
  for (let k = 0; k < 600; k++) {
    e.pasManche(m);
    if (!v.pilotageNeuronal) continue;
    vues++;
    const f = v.forces.neurone;
    assert.ok(f.mag() <= v.maxForce + 1e-9, `${f.mag()} > ${v.maxForce}`);
    for (const nom of VoitureNeuronale.COMPORTEMENTS) {
      const poids = v.poidsNeuronaux[nom];
      assert.ok(poids >= 0 && poids <= 1);
      assert.ok(v.forcesNeuronales[nom].mag() <= poids * v.maxForce + 1e-9, nom);
    }
    // sans dépasser maxForce, la force appliquée est exactement la somme pondérée
    const somme = VoitureNeuronale.COMPORTEMENTS.reduce((s, nom) => ({ x: s.x + v.forcesNeuronales[nom].x, y: s.y + v.forcesNeuronales[nom].y }), { x: 0, y: 0 });
    const norme = Math.hypot(somme.x, somme.y);
    const echelle = norme > v.maxForce ? v.maxForce / norme : 1;
    assert.ok(Math.abs(f.x - somme.x * echelle) < 1e-9 && Math.abs(f.y - somme.y * echelle) < 1e-9);
  }
  assert.ok(vues > 500);
});

test('un poids à 0 : le comportement est absent ; seek seul : la force est celle de seek', () => {
  const m = rouler([1, 0, 0, 0], 200);
  const v = m.suivis[0].voiture;
  assert.ok(v.pilotageNeuronal);
  for (const nom of ['arrive', 'wander', 'separation']) assert.ok(v.forcesNeuronales[nom].mag() < 1e-12, nom);
  assert.ok(v.forcesNeuronales.seek.mag() > 0);
  assert.ok(Math.abs(v.forces.neurone.x - v.forcesNeuronales.seek.x) < 1e-12);
  // tout à 0 : aucune force neuronale, la voiture ne démarre pas (elle est éliminée, immobile)
  const zero = rouler([0, 0, 0, 0], 60 * 6);
  assert.ok(zero.suivis[0].voiture.forces.neurone.mag() < 1e-12);
  assert.equal(zero.suivis[0].eliminee, true);
  // wander seul : seule la part de wander est non nulle
  const w = rouler([0, 0, 1, 0], 200).suivis[0].voiture;
  for (const nom of ['seek', 'arrive', 'separation']) assert.ok(w.forcesNeuronales[nom].mag() < 1e-12, nom);
  assert.ok(w.forcesNeuronales.wander.mag() > 0);
});

test('séparation dosée : elle n\'agit qu\'avec une voisine proche, et grandit avec son poids', () => {
  const seule = rouler([1, 0, 0, 1], 200).suivis[0].voiture;
  assert.ok(seule.forcesNeuronales.separation.mag() < 1e-12);
  // une voisine à 20 px sur le côté (donnée par le contexte, comme le fait la course)
  const avec = poids => {
    const v = rouler([1, 0, 0, poids], 200).suivis[0].voiture;
    const n = v.circuit.normales[v.indicePiste];
    const voisine = { pos: v.pos.copy().add({ x: n.x * 20, y: n.y * 20 }), vel: v.vel.copy(), r: v.r };
    v.applyBehaviors({ voisins: [voisine], devant: null, meteo: null });
    assert.ok(v.pilotageNeuronal);
    return { v, voisine, f: v.forcesNeuronales.separation };
  };
  const forte = avec(1);
  const faible = avec(0.2);
  assert.ok(forte.f.mag() > 0);
  assert.ok(Math.abs(faible.f.mag() / forte.f.mag() - 0.2) < 0.02, `${faible.f.mag()} / ${forte.f.mag()}`);
  // elle éloigne de la voisine
  const vers = { x: forte.voisine.pos.x - forte.v.pos.x, y: forte.voisine.pos.y - forte.v.pos.y };
  assert.ok(forte.f.x * vers.x + forte.f.y * vers.y < 0);
  // poids 0 : aucune séparation dosée, même collée
  assert.ok(avec(0).f.mag() < 1e-12);
});

test('seul applyForce modifie l\'accélération ; aucune écriture de pos, vel ou acc dans le fichier', () => {
  const m = rouler([0.8, 0.4, 0.2, 0.5], 100);
  const v = m.suivis[0].voiture;
  const appliquees = [];
  const original = v.applyForce;
  v.applyForce = function (force) { appliquees.push(force.copy()); return original.call(this, force); };
  v.decide({ voisins: [], devant: null, meteo: null });
  v.acc.set(0, 0);
  v.applyBehaviors({ voisins: [], devant: null, meteo: null });
  const somme = appliquees.reduce((s, f) => ({ x: s.x + f.x, y: s.y + f.y }), { x: 0, y: 0 });
  assert.ok(appliquees.length > 0);
  assert.ok(Math.abs(v.acc.x - somme.x) < 1e-12 && Math.abs(v.acc.y - somme.y) < 1e-12);
  const code = read('voitureNeuronale.js').replace(/\/\/.*$/gm, '');
  const ecriture = /\.(pos|vel|acc)(\.[xy])?\s*([-+*/]?=(?!=)|\.(set|add|sub|mult|div|setMag|limit|normalize|rotate|setHeading|lerp)\s*\()/;
  assert.match('this.vel.add(f)', ecriture);
  assert.doesNotMatch(code, ecriture);
  for (const methode of ['seek', 'arrive', 'wander', 'applyForce', 'update']) {
    assert.doesNotMatch(code, new RegExp(`^\\s*${methode}\\s*\\([^)]*\\)\\s*\\{`, 'm'), `${methode} redéfinie`);
  }
});

test('variation des poids par voiture : 0 = identiques ; sinon un facteur par comportement, borné', () => {
  const r = reseauFixe([0.5, 0.5, 0.5, 0.5]);
  const options = (numero, variation) => ({ circuit, parametres: e.parametres, numero, alea: () => 0.5, reseau: r, variation });
  const p = circuit.emplacementGrille(0);
  const a = new VoitureNeuronale(p.x, p.y, options(1, 0));
  const b = new VoitureNeuronale(p.x, p.y, options(2, 0));
  assert.deepEqual(Array.from(a.facteursPoids), [1, 1, 1, 1]);
  assert.deepEqual(Array.from(a.poidsPour(new Array(8).fill(0.3)) && Object.values(a.poidsPour(new Array(8).fill(0.3)))),
    Array.from(Object.values(b.poidsPour(new Array(8).fill(0.3)))));
  const c = new VoitureNeuronale(p.x, p.y, options(3, 0.2));
  const d = new VoitureNeuronale(p.x, p.y, options(4, 0.2));
  for (const f of c.facteursPoids) assert.ok(f >= 0.8 && f <= 1.2);
  assert.notDeepEqual(Array.from(c.facteursPoids), Array.from(d.facteursPoids));
  // reproductible (graine du numéro), borné à VARIATION_MAX, et les poids restent dans [0, 1]
  assert.deepEqual(Array.from(new VoitureNeuronale(p.x, p.y, options(3, 0.2)).facteursPoids), Array.from(c.facteursPoids));
  const grande = new VoitureNeuronale(p.x, p.y, options(5, 5));
  assert.equal(grande.variation, VoitureNeuronale.VARIATION_MAX);
  for (const x of Object.values(grande.poidsPour(new Array(8).fill(1)))) assert.ok(x >= 0 && x <= 1);
});

test('reprise de contrôle : stand, safety car, VSC, relance, danger, panne → conduite classique ; puis le réseau reprend', () => {
  const m = rouler([1, 0.5, 0.1, 0.5], 200);
  const v = m.suivis[0].voiture;
  assert.equal(v.neuroneActif, true);
  const essayer = (preparer, contexte = {}) => {
    preparer();
    v.applyBehaviors({ voisins: [], devant: null, meteo: null, ...contexte });
    return v.pilotageNeuronal;
  };
  const { COURSE, DRAPEAU, STAND } = VoitureF1.ETATS;
  assert.equal(essayer(() => v.passerA(DRAPEAU)), false);            // safety car : conduite classique
  assert.ok(v.forces.seek !== undefined);
  assert.equal(essayer(() => v.passerA(COURSE)), true);
  v.decide({ relance: true });
  assert.equal(v.enRelance, true);
  assert.equal(essayer(() => {}), false);                            // relance en accordéon
  v.decide({ relance: false });
  assert.equal(essayer(() => {}), true);
  assert.equal(essayer(() => { v.vsc = { profil: new Array(circuit.n).fill(2), facteur: 0.5 }; }), false);   // VSC
  v.vsc = null;
  assert.equal(essayer(() => { v.danger = { x: 0, y: 0, distance: 100, rayon: 10, ecart: 0 }; }), false);
  v.danger = null;
  assert.equal(essayer(() => { v.panne = { type: 'partielle', age: 0, cote: 1 }; }), false);
  v.panne = null;
  assert.equal(essayer(() => { v.passerA(STAND); v.phaseStand = VoitureF1.PHASES_STAND.ENTREE; v.indiceVoie = 0; }), false); // stand
  v.phaseStand = null;
  v.indiceVoie = -1;
  v.passerA(COURSE);
  assert.equal(essayer(() => {}), true);
  // la règle est documentée en tête du fichier
  assert.match(read('voitureNeuronale.js'), /RÈGLE DE REPRISE DE CONTRÔLE/);
});

test('maxSpeed : sans le plafond de virage en pilotage neuronal (il faut freiner avec arrive), sauf dans le trafic', () => {
  const m = rouler([1, 0.5, 0, 0.5], 300);
  const v = m.suivis[0].voiture;
  // dans un virage serré, une VoitureF1 serait plafonnée par son profil ; la voiture neuronale non
  const virage = [...circuit.virages].sort((a, b) => b.courbure - a.courbure)[0];
  const profil = v.profil();
  assert.ok(profil[virage.apex] < v.vitesseDeBase() - 0.5);
  v.moduler(null, null);
  assert.ok(Math.abs(v.maxSpeed - v.vitesseDeBase()) < 1e-9);
  // une voisine collée : le plafond du profil revient (comme une VoitureF1)
  v.voisinsPercus = [{ pos: v.pos.copy().add({ x: 5, y: 0 }), r: v.r }];
  v.moduler(null, null);
  assert.ok(v.maxSpeed <= profil[v.indicePiste] + 1e-9);
});

test('le filet de sécurité garderSurPiste passe par les pneus en pilotage neuronal (nom « filet »)', () => {
  const v = rouler([1, 0, 0, 0], 120).suivis[0].voiture;
  // forcer un écart : on lit seulement ce qu'appliquer fait d'une force nommée « piste »
  const demande = v.demande;
  v.pilotageNeuronal = true;
  v.demande = demande ?? v.vel.copy().mult(0);
  const avant = v.demande.copy();
  v.appliquer('piste', v.vel.copy().setMag(0.1), 1);
  assert.ok(v.forces.filet !== undefined && v.forces.piste === undefined);
  assert.ok(Math.abs(v.demande.x - avant.x) > 0 || Math.abs(v.demande.y - avant.y) > 0);
});

test('debug : rayons des capteurs et barres des 4 poids, dessinés sans erreur ; la course classique ne change pas', () => {
  const s = loadScene(F1, '({ VoitureNeuronale, Entraineur, ReseauNeuronal })', { uniform: generator(4) });
  const en = new s.Entraineur({ population: 20, graine: 1, evaluationAuto: false });
  const mm = en.creerManche(en.circuit('classique'), [{ Classe: s.VoitureNeuronale, rang: 0, reseau: new s.ReseauNeuronal(12, s.ReseauNeuronal.mulberry32(3)) }]);
  for (let k = 0; k < 200; k++) en.pasManche(mm);
  s.calls.length = 0;
  mm.suivis[0].voiture.showDebug();
  assert.ok(s.calls.filter(c => c[0] === 'line').length >= 3);
  assert.ok(s.calls.filter(c => c[0] === 'rect').length >= 4);
  // VoitureF1 n'a pas changé : Course.parametresParDefaut garde des adversaires classiques
  assert.equal(Course.parametresParDefaut().adversaires, 'classiques');
});
