import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator } from './support.mjs';

// Phase 1 : comportements de course. VSC (écarts gardés, vitesse sous la limite, sortie
// progressive), relance en accordéon, zones de danger (contournement d'une voiture arrêtée,
// drapeaux jaunes, dépanneuse), doublage au freinage, fatigue, ordres d'équipe, pannes, mur.

const scene = loadScene(F1, '({ Vehicle, Circuit, Course, VoitureF1, Commissaire, GestionIncidents, OrdresEquipe })');
const { Vehicle, Circuit, Course, VoitureF1, Commissaire, GestionIncidents, OrdresEquipe } = scene;
const { COURSE, SAFETY_CAR, VSC, RELANCE } = Course.ETATS;
const graine = n => {
  const u = generator(n);
  scene.context.random = (a, b) => (b === undefined ? u() * (a ?? 1) : a + u() * (b - a));
};
function course(reglages = {}, graineCourse = 1999) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages }, Circuit.generateur(graineCourse));
}
function jusqua(c, condition, limite = 60 * 300) {
  for (let i = 0; i < limite; i++) {
    if (condition(c)) return i;
    c.pas();
  }
  return assert.fail('condition jamais atteinte');
}
// Plus petite distance entre deux voitures (moins la somme des rayons), sur toutes les voitures.
const ecartMin = c => {
  let min = Infinity;
  const v = c.voitures;
  for (let a = 0; a < v.length; a++) {
    for (let b = a + 1; b < v.length; b++) min = Math.min(min, Math.hypot(v[a].pos.x - v[b].pos.x, v[a].pos.y - v[b].pos.y) - v[a].r - v[b].r);
  }
  return min;
};
// Écarts le long de la piste entre voitures consécutives du classement (distance continue du
// chronométrage) : Map « devant-derrière » -> écart, pour comparer les mêmes paires plus tard.
const ecartsFile = c => {
  const ordre = c.classement().filter(v => v.etat === VoitureF1.ETATS.COURSE);
  return new Map(ordre.slice(1).map((v, k) => [`${ordre[k].numero}-${v.numero}`,
    c.chronometrage.etat(ordre[k]).distance - c.chronometrage.etat(v).distance]));
};

test('classes : la dépanneuse est un Vehicle ; le gestionnaire d\'incidents et les ordres d\'équipe ne bougent pas', () => {
  const c = course({ nombreVoitures: 4 });
  assert.ok(c.incidents.commissaires.length >= 4);
  c.incidents.commissaires.forEach(d => assert.ok(d instanceof Vehicle && d instanceof Commissaire));
  assert.ok(!(c.incidents instanceof Vehicle));
  assert.equal(typeof OrdresEquipe.decider, 'function');
  // chaque dépanneuse attend à son poste, hors de la piste
  c.incidents.commissaires.forEach(d => {
    const i = c.circuit.projeter(d.pos.x, d.pos.y);
    assert.ok(Math.abs(c.circuit.ecartLateral(d.pos.x, d.pos.y, i)) > c.circuit.largeur / 2);
  });
});

test('VSC : entrée progressive, vitesse sous la limite, écarts gardés, pas de dépassement, sortie progressive', () => {
  graine(5);
  const c = course({ nombreVoitures: 10, nombreTours: 10 });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 25; i++) c.pas();
  assert.ok(c.incidents.declencherVSC());
  assert.equal(c.etat, VSC);
  assert.equal(c.drapeau, 'vsc');
  // entrée progressive : le facteur descend de 1 à facteurVSC en DUREE_ENTREE_VSC
  c.pas();
  assert.ok(c.incidents.vsc.facteur < 1 && c.incidents.vsc.facteur > c.parametres.facteurVSC);
  jusqua(c, x => x.incidents.vsc.phase === 'actif', 60 * 5);
  // le temps que quelques points de chronométrage soient passés au rythme du VSC
  for (let i = 0; i < 60 * 4; i++) c.pas();
  // écarts en TEMPS aux points de chronométrage (intervalles) : tout le monde suit le même profil
  // de vitesse réduit, ils sont gardés (en distance, ils se resserrent dans les virages lents)
  const intervalles = () => new Map(c.classement().filter(v => v.etat === VoitureF1.ETATS.COURSE)
    .map(v => [v.numero, c.ecarts('intervalle').get(v)]).filter(([, e]) => e.valeur !== null && e.valeur > 0));
  const avant = intervalles();
  // l'ordre des voitures restées en piste (passer devant une voiture qui s'arrête au stand est permis)
  const ordreAvant = c.classement();
  const auStand = new Set();
  let depasse = false;
  for (let i = 0; i < 60 * 3; i++) {
    c.pas();
    assert.equal(c.etat, VSC);
    c.voitures.filter(v => v.auStand || v.demandeStand).forEach(v => auStand.add(v));
    for (const v of c.voitures.filter(x => x.etat === VoitureF1.ETATS.COURSE)) {
      assert.ok(v.maxSpeed <= v.limiteVSC() + 1e-9, 'maxSpeed sous la limite');
      assert.ok(v.vitesse <= v.limiteVSC() + 0.15, `vitesse ${v.vitesse} > ${v.limiteVSC()}`);
      if (v.drs) depasse = true;
    }
  }
  assert.equal(depasse, false, 'pas de DRS sous VSC');
  const enPiste = liste => liste.filter(v => !auStand.has(v)).map(v => v.numero).join(',');
  assert.equal(enPiste(c.classement()), enPiste(ordreAvant), 'personne ne double');
  const apres = intervalles();
  let comparees = 0;
  avant.forEach((e, numero) => {
    if (!apres.has(numero)) return;
    comparees++;
    const x = apres.get(numero).valeur;
    // une voiture collée à celle de devant lève le pied (pas de dépassement) : son intervalle
    // peut s'ouvrir, et celle de derrière la rattrape un peu (au plus 0,3 s : pas de
    // regroupement) ; au-delà de 1,2 s, les intervalles sont gardés
    assert.ok(x > e.valeur - 0.3, `intervalle de la #${numero} réduit : ${e.valeur.toFixed(2)} -> ${x.toFixed(2)} s`);
    if (e.valeur > 1.2) assert.ok(Math.abs(x - e.valeur) < Math.max(0.35, e.valeur * 0.15), `intervalle de la #${numero} : ${e.valeur.toFixed(2)} -> ${x.toFixed(2)} s`);
  });
  assert.ok(comparees >= 5, `${comparees}`);
  // la piste est dégagée : sortie progressive, puis la course reprend
  jusqua(c, x => x.incidents.vsc === null || x.incidents.vsc.phase === 'sortie', 60 * 20);
  if (c.incidents.vsc !== null) {
    const f0 = c.incidents.vsc.facteur;
    for (let i = 0; i < 60; i++) c.pas();
    assert.ok(c.incidents.vsc === null || c.incidents.vsc.facteur > f0);
  }
  jusqua(c, x => x.etat === COURSE, 60 * 10);
  assert.ok(ecartMin(c) >= 0);
});

test('relance : le leader choisit son moment, chaque voiture relance après celle de devant (accordéon), sans contact', () => {
  graine(6);
  const c = course({ nombreVoitures: 12, nombreTours: 10 });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 15; i++) c.pas();
  c.demanderSafetyCar();
  c.pas();
  assert.equal(c.etat, SAFETY_CAR);
  let min = Infinity;
  jusqua(c, x => { min = Math.min(min, ecartMin(x)); return x.etat === RELANCE; }, 60 * 80);
  const relance = c.incidents.relance;
  assert.ok(relance.depart >= GestionIncidents.RELANCE_MIN && relance.depart <= GestionIncidents.RELANCE_MAX);
  const file = c.classement().filter(v => !v.horsCourse);
  jusqua(c, x => { min = Math.min(min, ecartMin(x)); return x.etat === COURSE; }, 60 * 20);
  const instants = file.map(v => relance.relancees.get(v));
  assert.ok(instants.every(t => t !== undefined));
  assert.ok(instants[0] >= relance.depart - 1e-9, 'le leader part au moment choisi');
  for (let k = 1; k < instants.length; k++) {
    assert.ok(instants[k] >= instants[k - 1] + file[k].reaction + GestionIncidents.REACTION_RELANCE - 1e-9, `voiture ${k}`);
  }
  for (let i = 0; i < 60 * 8; i++) {
    c.pas();
    min = Math.min(min, ecartMin(c));
  }
  assert.ok(min >= 0, `${min}`);
});

test('évitement : 19 voitures passent une voiture arrêtée en pleine piste, deux tours durant, sans contact ; drapeau jaune', () => {
  graine(7);
  const c = course({ nombreVoitures: 20, nombreTours: 4, depanneuse: false, vsc: false });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 20; i++) c.pas();
  // une voiture s'arrête sur la ligne de course (accident sans safety car : test du contournement)
  const arretee = c.classement()[5];
  arretee.accidenter();
  let min = Infinity;
  let contournements = 0;
  let jaune = false;
  for (let i = 0; i < 60 * 45 && !c.terminee; i++) {
    c.pas();
    min = Math.min(min, ecartMin(c));
    if (c.voitures.some(v => v.danger !== null)) contournements++;
    if (c.incidents.secteursJaunes.has(c.circuit.secteur(arretee.indicePiste))) jaune = true;
  }
  assert.ok(arretee.vitesse < 0.1);
  assert.ok(contournements > 60, `${contournements}`);
  assert.ok(jaune, 'drapeau jaune dans son secteur');
  assert.ok(min >= 0, `contact : ${min}`);
  // les autres ont continué : le leader a fait au moins deux tours de plus
  assert.ok(c.leader.toursCompletes >= 2);
});

test('dépanneuse : seek le long du bas-côté, arrive près de la voiture, la remorque (arrive) jusqu\'à son poste, puis retour', () => {
  graine(8);
  const c = course({ nombreVoitures: 6, nombreTours: 10, vsc: false });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 10; i++) c.pas();
  const v = c.classement()[3];
  v.subirPanne('totale');
  jusqua(c, x => v.etat === VoitureF1.ETATS.PANNE, 60 * 20);
  // rangée sur le bord, hors de la ligne de course
  assert.ok(Math.abs(v.ecartLateral) > c.circuit.largeur / 2 - 5, `${v.ecartLateral}`);
  jusqua(c, () => c.incidents.assignations.has(v), 60 * 5);
  const d = c.incidents.assignations.get(v);
  const etats = new Set();
  let distancePisteMin = Infinity;
  jusqua(c, () => {
    etats.add(d.etat);
    const i = c.circuit.projeter(d.pos.x, d.pos.y);
    distancePisteMin = Math.min(distancePisteMin, Math.abs(c.circuit.ecartLateral(d.pos.x, d.pos.y, i)));
    return v.etat === VoitureF1.ETATS.ABANDON && d.disponible;
  }, 60 * 120);
  assert.deepEqual([...etats].sort(), ['ACCROCHAGE', 'APPROCHE', 'POSTE', 'REMORQUAGE']);
  assert.ok(distancePisteMin > c.circuit.largeur / 2 - 1, 'elle ne roule jamais sur la piste');
  // la voiture est garée près du poste ; abandon au chronométrage
  // au bout du câble (deux rayons, l'attelage) et de son inertie
  assert.ok(Math.hypot(v.pos.x - d.poste.x, v.pos.y - d.poste.y) < 60);
  assert.equal(c.chronometrage.abandon(v), true);
  assert.equal(c.ecarts().get(v).texte, 'DNF');
});

// Deux voitures sur le circuit classique (comme dans iaAvancee.test.mjs).
function duo(reglages = {}) {
  const circuit = Course.circuit('classique');
  const parametres = { ...Course.parametresParDefaut(), usurePneus: 0, frequenceErreurs: 0, ...reglages };
  const voiture = (indice, lateral = 0) => {
    const p = circuit.pointLateral(indice, lateral);
    const v = new VoitureF1(p.x, p.y, { circuit, parametres, alea: generator(indice + 3), surfaces: Course.surfaces(circuit) });
    v.passerA(COURSE);
    return v;
  };
  const rouler = (voitures, images, observer = () => {}) => {
    for (let i = 0; i < images; i++) {
      for (const v of voitures) {
        const autres = voitures.filter(a => a !== v);
        const suivi = a => ({ vehicule: a, distance: circuit.distanceDevant(v.indicePiste, a.indicePiste) });
        const devant = autres.map(suivi).filter(s => s.distance > 0 && s.distance < circuit.longueur / 2).sort((a, b) => a.distance - b.distance)[0] ?? null;
        v.contexte = { voisins: autres, devant, derriere: null };
        v.decide(v.contexte);
      }
      voitures.forEach(v => v.applyBehaviors(v.contexte));
      voitures.forEach(v => v.update(1 / 60));
      observer(i);
    }
  };
  return { circuit, voiture, rouler };
}

test('doublage au freinage : plongeon à l\'intérieur, réussi sans contact ; raté : sortie large puis retour sur la piste', () => {
  graine(9);
  // réussi : risque nul ; une voiture rapide collée derrière une lente, avant un virage
  const reussi = (risquePlongeon) => {
    const { circuit, voiture, rouler } = duo({ risquePlongeon });
    const virage = circuit.virages.reduce((a, b) => (a.courbure > b.courbure ? a : b));
    const lente = voiture(virage.apex - 420 / circuit.pas);
    const rapide = voiture(virage.apex - 470 / circuit.pas);
    lente.facteurVitesse = 0.85;
    rapide.facteurVitesse = 1.05;
    let min = Infinity;
    let largeMax = 0;
    rouler([lente, rapide], 60 * 12, () => {
      min = Math.min(min, Math.hypot(lente.pos.x - rapide.pos.x, lente.pos.y - rapide.pos.y) - lente.r - rapide.r);
      largeMax = Math.max(largeMax, Math.abs(rapide.ecartLateral - circuit.decalagesLigne[rapide.indicePiste]));
    });
    return { lente, rapide, min, largeMax, circuit };
  };
  const ok = reussi(0);
  assert.ok(ok.rapide.plongeons.tentes >= 1, 'un plongeon');
  assert.equal(ok.rapide.plongeons.rates, 0);
  assert.ok(ok.rapide.progression > ok.lente.progression, 'elle a doublé');
  assert.ok(ok.min >= 0, `${ok.min}`);
  // raté : risque 1 -> elle part large (erreur, dérive), puis revient sur la piste
  const rate = reussi(1);
  assert.ok(rate.rapide.plongeons.rates >= 1);
  assert.ok(rate.largeMax > ok.largeMax, `sortie large : ${ok.largeMax.toFixed(0)} -> ${rate.largeMax.toFixed(0)}`);
  assert.ok(Math.abs(rate.rapide.ecartLateral) < rate.circuit.largeur / 2, 'de retour sur la piste');
  assert.ok(rate.min >= 0, `${rate.min}`);
});

test('fatigue : la dispersion de la ligne grandit avec les tours, moins pour le pilote régulier', () => {
  const dispersion = (personnalite, tours) => {
    graine(10);
    const { circuit, voiture, rouler } = duo({ poidsWander: 0 });
    const v = voiture(20);
    v.changerDePersonnalite(personnalite);
    // la fatigue dépend des tours faits : on les impose (données de perception), puis on mesure un tour
    v.tour = tours;
    let somme = 0;
    let n = 0;
    rouler([v], 60 * 14, () => {
      somme += Math.abs(v.ecartLateral - circuit.decalagesLigne[v.indicePiste]);
      n++;
    });
    return { moyenne: somme / n, fatigue: v.fatigue };
  };
  const debut = dispersion('imprevisible', 0);
  const fin = dispersion('imprevisible', 5);
  const regulier = dispersion('regulier', 5);
  assert.equal(debut.fatigue, 0);
  assert.ok(fin.fatigue > regulier.fatigue && regulier.fatigue > 0);
  assert.ok(fin.moyenne > debut.moyenne + 1, `${debut.moyenne.toFixed(2)} -> ${fin.moyenne.toFixed(2)}`);
  assert.ok(regulier.moyenne < fin.moyenne, `régulier ${regulier.moyenne.toFixed(2)}, imprévisible ${fin.moyenne.toFixed(2)}`);
  // option désactivée : pas de fatigue
  const { voiture, rouler } = duo({ fatigue: false });
  const v = voiture(20);
  v.tour = 5;
  rouler([v], 10);
  assert.equal(v.fatigue, 0);
});

test('ordres d\'équipe : le pilote lent laisse passer son coéquipier plus rapide, sans contact ; l\'ordre est inversé', () => {
  graine(11);
  const c = course({ nombreVoitures: 2, ecuries: 1, nombreTours: 6, plongeon: false });
  const [lent, rapide] = c.voitures;
  lent.facteurVitesse = 0.9;
  rapide.facteurVitesse = 1.05;
  lent.changerDePersonnalite('prudent');                         // il obéit (obéissance 1)
  jusqua(c, x => x.etat === COURSE);
  let min = Infinity;
  let ordre = false;
  jusqua(c, x => {
    min = Math.min(min, ecartMin(x));
    if (lent.laisserPasser !== null) ordre = true;
    return x.classement()[0] === rapide && ordre;
  }, 60 * 120);
  assert.ok(ordre, 'ordre donné');
  assert.ok(c.messagesRadio.some(m => /laisse passer/.test(m.texte)), 'message radio');
  for (let i = 0; i < 60 * 3; i++) {
    c.pas();
    min = Math.min(min, ecartMin(c));
  }
  assert.equal(c.classement()[0], rapide, 'ordre inversé');
  assert.equal(lent.laisserPasser, null, 'l\'ordre est terminé');
  assert.ok(min >= 0, `${min}`);
  // option désactivée : aucun ordre
  const d = course({ nombreVoitures: 2, ecuries: 1, nombreTours: 6, ordresEquipe: false });
  d.voitures[0].facteurVitesse = 0.9;
  d.voitures[1].facteurVitesse = 1.05;
  jusqua(d, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 30; i++) {
    d.pas();
    assert.equal(d.voitures[0].laisserPasser, null);
  }
});

test('panne partielle : la vitesse baisse, la voiture rentre au stand et y abandonne ; totale : elle se range et s\'arrête', () => {
  graine(12);
  const c = course({ nombreVoitures: 4, nombreTours: 10, vsc: true });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 8; i++) c.pas();
  const [a, b] = c.classement();
  const base = a.vitesseDeBase();
  assert.ok(c.incidents.provoquerPanne(a, 'partielle'));
  assert.equal(c.incidents.provoquerPanne(a, 'partielle'), false, 'une seule panne');
  for (let i = 0; i < 60 * 5; i++) c.pas();
  assert.ok(Math.abs(a.facteurMoteur - VoitureF1.PANNE_PARTIELLE) < 1e-9);
  assert.ok(a.vitesseDeBase() < base * 0.7);
  assert.equal(a.demandeStand || a.auStand || a.etat === VoitureF1.ETATS.ABANDON, true);
  jusqua(c, () => a.etat === VoitureF1.ETATS.ABANDON, 60 * 90);
  assert.equal(c.chronometrage.abandon(a), true);
  // totale : rangée sur le bord, arrêtée ; VSC déclaré
  assert.ok(c.incidents.provoquerPanne(b, 'totale'));
  jusqua(c, () => b.etat === VoitureF1.ETATS.PANNE, 60 * 20);
  assert.ok(b.vitesse < 0.3);
  assert.ok(Math.abs(b.ecartLateral) > c.circuit.largeur / 2 - 5);
  assert.equal(c.etat, VSC);
  assert.ok(c.incidents.zones.some(z => z.vehicule === b));
  assert.throws(() => b.subirPanne('legere'), { name: 'RangeError' });
});

test('mur : une voiture de l\'IA qui touche le mur est accidentée (débris, safety car) ; pannes tirées seulement avec Incidents', () => {
  const c = course({ nombreVoitures: 6, nombreTours: 10 });
  jusqua(c, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 5; i++) c.pas();
  const v = c.classement()[2];
  // la scène place la voiture contre le rail (règle de test)
  const rail = c.surfaces.rails['1'].findIndex((r, i) => r !== null && Math.abs(i - v.indicePiste) < 30);
  const point = c.circuit.pointLateral(rail, c.surfaces.rails['1'][rail] + 2);
  v.pos.set(point.x, point.y);
  c.pas();
  c.pas();
  assert.equal(v.etat, VoitureF1.ETATS.ACCIDENT);
  assert.ok(c.debris.length > 0);
  assert.equal(c.etat, SAFETY_CAR);
  // sans « Incidents » : jamais de panne tirée, même avec une probabilité énorme
  const d = course({ nombreVoitures: 6, nombreTours: 10, probaPanne: 0.005 });
  d.parametres.probaPanne = 1;
  jusqua(d, x => x.etat === COURSE);
  for (let i = 0; i < 60 * 5; i++) d.pas();
  assert.ok(d.voitures.every(x => x.panne === null));
  d.parametres.incidents = true;
  for (let i = 0; i < 10; i++) d.pas();
  assert.ok(d.voitures.some(x => x.panne !== null));
});
