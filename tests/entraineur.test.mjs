import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, read, generator } from './support.mjs';

// Entraineur : neuroévolution (population, élitisme, tournoi, croisement, mutation), fitness,
// élimination, curriculum, étapes 1 et 2, circuits de test jamais vus, budget de temps par image.

const charger = (graine = 5) => loadScene(F1, '({ Vehicle, Entraineur, ReseauNeuronal, VoitureNeuronale, VoitureF1, Circuit })', { uniform: generator(graine) });
const scene = charger();
const { Vehicle, Entraineur, ReseauNeuronal, VoitureNeuronale, VoitureF1, Circuit } = scene;
const circuits = new Map();
const nouvel = (options = {}) => new Entraineur({ population: 20, graine: 1, evaluationAuto: false, circuits, ...options });
// stats de conduite : un tour propre de base, modifiable
const stats = (modif = {}) => ({ distance: 4000, longueur: 4000, tours: 1, secteurs: 3, vitesseMoyenne: 0.9, ecartMoyen: 0.1, tempsFilet: 0,
  tempsHorsPiste: 0, contacts: 0, tempsGlisse: 0, tempsImmobile: 0, tempsArriere: 0, ...modif });

test('l\'entraîneur n\'est pas un Vehicle et ne bouge rien lui-même (pas d\'écriture de pos, vel, acc)', () => {
  assert.notEqual(Object.getPrototypeOf(Entraineur), Vehicle);
  assert.ok(!(nouvel() instanceof Vehicle));
  const code = read('entraineur.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\.(pos|vel|acc)(\.[xy])?\s*([-+*/]?=(?!=)|\.(set|add|sub|mult|div|setMag|limit)\s*\()/);
  assert.doesNotMatch(code, /applyForce|Math\.random|setInterval|setTimeout|Date\.now|performance\.now|millis|frameCount/);
});

test('population de la bonne taille (bornée de 20 à 100) ; chaque individu est une VoitureNeuronale au départ', () => {
  const e = nouvel({ population: 30 });
  assert.equal(e.reseaux.length, 30);
  assert.equal(e.individus.length, 30);
  for (const i of e.individus) {
    assert.ok(i.suivi.voiture instanceof VoitureNeuronale);
    assert.equal(i.suivi.voiture.etat, VoitureF1.ETATS.DEPART);
  }
  // toutes à la position de départ (la grille), immobiles
  const p = e.circuit('ecole').emplacementGrille(0);
  for (const i of e.individus) assert.ok(Math.hypot(i.suivi.voiture.pos.x - p.x, i.suivi.voiture.pos.y - p.y) < 1e-9);
  assert.equal(nouvel({ population: 5 }).taillePopulation, 20);
  assert.equal(nouvel({ population: 500 }).taillePopulation, 100);
});

test('fitness : la formule documentée ; une meilleure conduite a un meilleur fitness', () => {
  const w = Entraineur.POIDS_FITNESS;
  const f = Entraineur.fitness(stats());
  assert.ok(Math.abs(f - (100 + w.tour + 3 * w.secteur + 0.9 * w.vitesse + 0.9 * w.ligne)) < 1e-9);
  // plus loin, plus vite, mieux placé : mieux ; sortie, contact, glisse, immobilité, recul : moins bien
  assert.ok(Entraineur.fitness(stats({ distance: 8000, tours: 2, secteurs: 6 })) > f);
  assert.ok(Entraineur.fitness(stats({ vitesseMoyenne: 1 })) > f);
  for (const malus of [{ tempsFilet: 2 }, { tempsHorsPiste: 1 }, { contacts: 1 }, { tempsGlisse: 3 }, { tempsImmobile: 2 }, { tempsArriere: 1 }]) {
    assert.ok(Entraineur.fitness(stats(malus)) < f, JSON.stringify(malus));
  }
  // progression dominante : un tour de plus vaut plus que tous les bonus de régularité
  assert.ok(Entraineur.fitness(stats({ distance: 8000 })) - f > w.vitesse + w.ligne);
  // pondérations réglables
  assert.equal(Entraineur.fitness(stats({ contacts: 2 }), { contact: 0 }), f);
});

test('meilleure conduite = meilleur fitness, en vrai : seek fort et peu de wander bat wander fort, sous la pluie', () => {
  const e = nouvel();
  const logit = p => Math.log(p / (1 - p));
  const fixe = poids => {
    const r = new ReseauNeuronal(12, ReseauNeuronal.mulberry32(1));
    r.poidsSorties.fill(0);
    poids.forEach((p, k) => { r.biaisSorties[k] = logit(p); });
    return r;
  };
  const m = e.creerManche(e.circuit('technique'), [{ Classe: VoitureNeuronale, rang: 0, reseau: fixe([0.95, 0.3, 0.02, 0.5]) },
    { Classe: VoitureNeuronale, rang: 0, reseau: fixe([0.2, 0.2, 0.99, 0.5]) }], { humidite: 0.6 });
  for (let k = 0; k < 60 * 30; k++) e.pasManche(m);
  const [bon, mauvais] = m.suivis.map(s => Entraineur.fitness(s.stats));
  assert.ok(bon > mauvais + 30, `${bon} contre ${mauvais}`);
  assert.ok(m.suivis[0].stats.distance > m.suivis[1].stats.distance);
});

test('élimination : sortie de piste durable, immobilité, marche arrière ; pas avant les seuils', () => {
  const e = nouvel();
  const c = e.circuit('ecole');
  // une « voiture » simple : on règle exactement ce que mesurer() lit
  const fausse = (modif = {}) => ({ circuit: c, progression: 100, tour: 0, indicePiste: 10, ecartLateral: 0, vitesse: 3, derive: 0,
    etatPneus: { sousVirage: 0 }, forces: {}, ...modif });
  const suivi = v => ({ voiture: v, stats: Entraineur.nouvellesStats(v), eliminee: false });
  const dt = Entraineur.PAS_TEMPS;
  const avancer = (s, secondes, maj = () => {}) => {
    for (let t = 0; t < secondes - 1e-9; t += dt) {
      maj(s.voiture);
      e.mesurer(s, dt, 10);
    }
  };
  // hors de la piste (centre au-delà du bord) : éliminée après DUREE_SORTIE, pas avant
  const dehors = suivi(fausse({ ecartLateral: c.largeur / 2 + 5 }));
  avancer(dehors, Entraineur.DUREE_SORTIE - 0.1);
  assert.equal(dehors.eliminee, false);
  avancer(dehors, 0.2);
  assert.equal(dehors.eliminee, true);
  assert.ok(dehors.stats.tempsHorsPiste > Entraineur.DUREE_SORTIE);
  // revenir sur la piste remet le compteur à zéro
  const retour = suivi(fausse({ ecartLateral: 60 }));
  avancer(retour, 1.5);
  retour.voiture.ecartLateral = 0;
  avancer(retour, 0.1);
  retour.voiture.ecartLateral = 60;
  avancer(retour, 1.5);
  assert.equal(retour.eliminee, false);
  // immobile : sous VITESSE_IMMOBILE pendant plus de DUREE_IMMOBILE
  const arretee = suivi(fausse({ vitesse: 0 }));
  avancer(arretee, Entraineur.DUREE_IMMOBILE - 0.1);
  assert.equal(arretee.eliminee, false);
  avancer(arretee, 0.2);
  assert.equal(arretee.eliminee, true);
  // marche arrière : la progression recule pendant plus de DUREE_ARRIERE
  const recul = suivi(fausse());
  avancer(recul, Entraineur.DUREE_ARRIERE + 0.1, v => { v.progression -= 2; });
  assert.equal(recul.eliminee, true);
  assert.ok(recul.stats.tempsArriere > Entraineur.DUREE_ARRIERE);
  // une voiture qui roule normalement n'est jamais éliminée
  const normale = suivi(fausse());
  avancer(normale, 10, v => { v.progression += 4; });
  assert.equal(normale.eliminee, false);
  assert.ok(Math.abs(normale.stats.distance - 4 * 600) < 5);
});

test('nouvelle génération : même taille, élites copiés tels quels, une part d\'aléatoires, enfants par tournoi', () => {
  const e = nouvel({ population: 40 });
  const tries = e.reseaux.map((reseau, k) => ({ reseau, fitness: 1000 - k })).sort((a, b) => b.fitness - a.fitness);
  const suivants = e.nouvelleGeneration(tries);
  assert.equal(suivants.length, 40);
  const elites = Math.max(1, Math.round(Entraineur.ELITISME * 40));
  for (let k = 0; k < elites; k++) {
    assert.deepEqual(Array.from(suivants[k].poidsCaches), Array.from(tries[k].reseau.poidsCaches));
    assert.notEqual(suivants[k], tries[k].reseau);
  }
  // le tournoi favorise les meilleurs : sur 2 000 tirages, le meilleur est choisi bien plus souvent que le dernier
  const compte = new Map();
  for (let k = 0; k < 2000; k++) { const g = e.tournoi(tries); compte.set(g, (compte.get(g) ?? 0) + 1); }
  assert.ok((compte.get(tries[0]) ?? 0) > 5 * (compte.get(tries[39]) ?? 0));
});

test('génération complète : fin quand toutes sont éliminées, ont fait leurs tours, ou au temps max ; historique et meilleur', () => {
  const e = nouvel({ dureeGeneration: 6 });
  let pas = 0;
  while (e.generation === 0) { e.pas(); pas++; }
  assert.ok(pas <= 6 * 60 + 1, `${pas}`);
  assert.equal(e.historique.length, 1);
  const h = e.historique[0];
  assert.ok(h.meilleur >= h.moyenne);
  assert.equal(e.meilleur.fitness, h.meilleur);
  assert.equal(e.reseaux.length, 20);
  assert.equal(e.individus.length, 20);
});

test('graine fixe = entraînement reproductible (même historique, mêmes poids)', () => {
  const un = (() => { const s = charger(9); const e = new s.Entraineur({ population: 20, graine: 7, dureeGeneration: 4, evaluationAuto: false }); e.entrainer(2); return e; })();
  const deux = (() => { const s = charger(9); const e = new s.Entraineur({ population: 20, graine: 7, dureeGeneration: 4, evaluationAuto: false }); e.entrainer(2); return e; })();
  assert.equal(JSON.stringify(un.historique.map(h => [h.meilleur, h.moyenne])), JSON.stringify(deux.historique.map(h => [h.meilleur, h.moyenne])));
  assert.deepEqual(Array.from(un.reseaux[5].poidsSorties), Array.from(deux.reseaux[5].poidsSorties));
  // une autre graine : une autre population
  const s = charger(9);
  const autre = new s.Entraineur({ population: 20, graine: 8, dureeGeneration: 4, evaluationAuto: false });
  assert.notDeepEqual(Array.from(autre.reseaux[0].poidsCaches), Array.from(un.reseaux[0].poidsCaches));
});

test('tendance : sur le circuit simple, en 8 générations, le meilleur fitness monte et la moyenne monte d\'au moins 3 %', () => {
  const s = charger(5);
  const e = new s.Entraineur({ population: 20, graine: 1, evaluationAuto: false, dureeGeneration: 20, circuitFixe: { profil: 'ecole', humidite: 0.8 } });
  e.entrainer(8);
  const premiere = e.historique[0];
  const derniere = e.historique.at(-1);
  assert.ok(derniere.meilleur > premiere.meilleur, `${premiere.meilleur} -> ${derniere.meilleur}`);
  assert.ok(derniere.moyenne > premiere.moyenne * 1.03, `${premiere.moyenne} -> ${derniere.moyenne}`);
});

test('mutation : taux et amplitude baissent quand le meilleur fitness stagne, sans descendre sous le plancher', () => {
  const e = nouvel({ dureeGeneration: 2 });
  e.pas();
  e.individus.forEach(i => { i.suivi.eliminee = true; });
  for (let g = 0; g < Entraineur.STAGNATION * 6; g++) {
    // même fitness à chaque génération : stagnation
    e.individus.forEach(i => { i.suivi.stats = { ...i.suivi.stats, distance: 0, tours: 0, secteurs: 0 }; i.suivi.eliminee = true; });
    e.finirGeneration();
  }
  assert.ok(e.taux < e.tauxBase);
  assert.ok(e.amplitude < e.amplitudeBase);
  assert.ok(e.taux >= e.tauxBase * Entraineur.MUTATION_MIN - 1e-12);
  assert.ok(e.amplitude >= e.amplitudeBase * Entraineur.MUTATION_MIN - 1e-12);
});

test('curriculum : école, Classique, Technique (humide), Rapide (mouillé), puis aléatoire ; puis étape 2 (trafic)', () => {
  const e = nouvel();
  assert.deepEqual(Array.from(Entraineur.NIVEAUX, n => n.id), ['ecole', 'classique', 'technique', 'rapide', 'aleatoire']);
  assert.equal(e.nomNiveau, 'ecole');
  assert.equal(e.etape, 1);
  // un meilleur fitness au-dessus du seuil fait passer au niveau suivant
  const forcer = fitness => {
    e.individus.forEach((i, k) => { i.suivi.stats = { ...Entraineur.nouvellesStats(i.suivi.voiture), distance: 0 }; });
    const original = Entraineur.fitness;
    Entraineur.fitness = () => fitness;
    try { e.finirGeneration(); } finally { Entraineur.fitness = original; }
  };
  forcer(Entraineur.SEUIL_CURRICULUM - 1);
  assert.equal(e.nomNiveau, 'ecole');
  for (const attendu of ['classique', 'technique', 'rapide', 'aleatoire']) {
    forcer(Entraineur.SEUIL_CURRICULUM + 1);
    assert.equal(e.nomNiveau, attendu);
  }
  assert.equal(e.circuitCourant.humidite >= 0 && e.circuitCourant.humidite <= Entraineur.HUMIDITE_ALEATOIRE, true);
  assert.equal(e.etape, 1);
  // dernier niveau : au-dessus de SEUIL_ETAPE2, étape 2 avec la MÊME population
  const avant = e.reseaux.map(r => Array.from(r.poidsCaches));
  forcer(Entraineur.SEUIL_ETAPE2 + 1);
  assert.equal(e.etape, 2);
  assert.equal(e.individus.length, 20);
  // étape 2 : manches avec collisions, des VoitureF1 classiques parmi les neuronales, sur la grille
  assert.ok(e.manches.length >= 3);
  for (const m of e.manches) {
    assert.equal(m.collisions, true);
    assert.ok(m.suivis.some(s => s.voiture instanceof VoitureF1 && !(s.voiture instanceof VoitureNeuronale)));
    assert.ok(new Set(m.suivis.map(s => s.voiture.numero)).size === m.suivis.length);
  }
  assert.ok(avant.length === 20);
  // un pas en trafic : voisines perçues, contacts comptés sans erreur
  for (let k = 0; k < 120; k++) e.pas();
  assert.ok(e.suivis.some(s => s.voiture.voisinsPercus && s.voiture.voisinsPercus.length > 0));
});

test('sans curriculum : des variantes aléatoires dès le départ', () => {
  assert.equal(nouvel({ curriculum: false }).nomNiveau, 'aleatoire');
});

test('circuits de test jamais utilisés à l\'entraînement (graines réservées)', () => {
  const e = nouvel({ curriculum: false });
  const reservees = new Set(Entraineur.CIRCUITS_TEST.map(c => c.graine));
  for (let k = 0; k < 5000; k++) {
    const g = e.graineAleatoire();
    assert.ok(!reservees.has(g) && g !== Circuit.GRAINE && Number.isInteger(g) && g > 0);
    const c = e.circuitDuNiveau();
    assert.ok(!reservees.has(c.graine));
  }
  // les circuits courus pendant l'entraînement ne sont jamais ceux des tests
  const tests = new Set(Entraineur.CIRCUITS_TEST.map(Entraineur.cleTest));
  for (const cle of e.circuitsEntrainement) assert.ok(!tests.has(cle), cle);
  assert.equal(Entraineur.CIRCUITS_TEST.length, 3);
  assert.deepEqual(Array.from(Entraineur.CIRCUITS_TEST, c => c.humidite), [0, 0.4, 0.7]);
});

test('budget de temps par image respecté à 20x ; sans contrainte, 20 pas par image à 20x', () => {
  let maintenant = 0;
  // horloge : chaque lecture avance d'une milliseconde (un pas « coûte » 1 ms)
  const e = nouvel({ vitesse: 20, budgetMs: 12, horloge: () => maintenant++ });
  e.demarrer();
  const pas = e.avancer(1 / 60);
  assert.ok(pas > 0 && pas <= 12, `${pas} pas`);
  assert.equal(e.reserve, 0);                 // le reste est abandonné : pas de rattrapage
  assert.ok(e.vitesseEffective < 20);
  const libre = nouvel({ vitesse: 20, budgetMs: 12 });
  libre.demarrer();
  assert.equal(libre.avancer(1 / 60), 20);
  assert.ok(Math.abs(libre.vitesseEffective - 20) < 1e-6);
  // en pause : rien
  libre.pause();
  assert.equal(libre.avancer(1), 0);
  // la réserve ne dépasse jamais RESERVE_MAX
  libre.demarrer();
  libre.avancer(10);
  assert.ok(libre.reserve <= Entraineur.RESERVE_MAX);
});

test('note de qualité : sur 100, sur les 3 circuits de test ; badge prêt au-dessus du seuil ; arrêt automatique', () => {
  const e = nouvel({ seuilPret: 0, arretAuto: true });
  e.demarrer();
  const note = e.evaluerTout(e.reseaux[0]);
  assert.ok(Number.isInteger(note) && note >= 0 && note <= 100);
  const d = e.detailNote;
  assert.equal(d.toursDemandes, 6);
  assert.ok(Number.isInteger(d.nombreContacts) && d.contacts >= 0 && d.contacts <= 20);
  assert.equal(d.tempsAuTour.length, 3);
  assert.equal(d.references.length, 3);
  for (const r of d.references) assert.ok(r > 5 && r < 40, `${r}`);
  assert.ok(Math.abs(note - Math.round(d.tours + d.temps + d.contacts)) < 1e-9);
  assert.equal(e.pret, true);
  assert.equal(e.enCours, false);             // arrêt automatique quand le modèle est prêt
  const f = nouvel({ seuilPret: 101 });
  f.evaluerTout(f.reseaux[0]);
  assert.equal(f.pret, false);
});

test('tester le modèle : seul, puis contre des classiques, sur un circuit de test ; l\'évolution est suspendue', () => {
  const e = nouvel();
  e.lancerTest('seul');
  assert.equal(e.demo.manche.suivis.length, 1);
  const generation = e.generation;
  e.avancer(0.5);
  assert.ok(e.demo.manche.temps > 0);
  assert.equal(e.generation, generation);
  e.lancerTest('trafic');
  assert.ok(e.demo.manche.suivis.some(s => !(s.voiture instanceof VoitureNeuronale)));
  assert.ok(Entraineur.CIRCUITS_TEST.some(c => c.profil === e.demo.circuit.profil && c.graine === e.demo.circuit.graine));
  e.arreterTest();
  assert.equal(e.demo, null);
});

test('le circuit école est construit sans changer les profils du jeu', () => {
  const avant = Object.keys(Circuit.PROFILS);
  const c = Entraineur.circuitEcole();
  assert.equal(c.profil, 'ecole');
  assert.ok(c.n > 100 && c.virages.length >= 2);
  assert.deepEqual(Object.keys(Circuit.PROFILS), avant);
  assert.deepEqual(avant, ['classique', 'rapide', 'technique']);
});

test('charger un réseau : la population repart de lui (lui-même, puis des copies mutées)', () => {
  const e = nouvel();
  const r = new ReseauNeuronal(12, ReseauNeuronal.mulberry32(99));
  e.chargerReseau(r);
  assert.equal(e.reseaux.length, 20);
  assert.deepEqual(Array.from(e.reseaux[0].poidsCaches), Array.from(r.poidsCaches));
  assert.notDeepEqual(Array.from(e.reseaux[1].poidsCaches), Array.from(r.poidsCaches));
});
