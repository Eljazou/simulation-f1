import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator } from './support.mjs';

// IA de course avancée (bloc A) : aspiration, dépassement, duel, défense, drapeau bleu,
// personnalités, erreurs, stratégie de pit.

const scene = loadScene(F1, '({ Vehicle, Circuit, VoitureF1, Course, Personnalites, Strategie, Pneus })');
const { Circuit, VoitureF1, Course, Personnalites, Strategie, Pneus } = scene;
const circuit = Course.circuit('classique');
const PAS = 1 / 60;
const { COURSE } = VoitureF1.ETATS;

// Une voiture en course, au point `indice` de la piste, à l'écart latéral `lateral`.
function voiture(indice, lateral = 0, reglages = {}) {
  const parametres = { ...Course.parametresParDefaut(), usurePneus: 0, ...reglages };
  const point = circuit.pointLateral(indice, lateral);
  const v = new VoitureF1(point.x, point.y, { circuit, parametres, alea: () => 0.5 });
  v.passerA(COURSE);
  return v;
}
const suivi = (vehicule, distance) => ({ vehicule, distance });
// Avance des voitures ensemble (chacune voit les autres comme voisines, et celle de devant).
function rouler(voitures, images, observer = () => {}) {
  for (let i = 0; i < images; i++) {
    for (const v of voitures) {
      const autres = voitures.filter(autre => autre !== v);
      const devant = autres.map(a => suivi(a, circuit.distanceDevant(v.indicePiste, a.indicePiste)))
        .filter(s => s.distance > 0 && s.distance < circuit.longueur / 2).sort((a, b) => a.distance - b.distance)[0] ?? null;
      const derriere = autres.map(a => suivi(a, circuit.distanceDevant(a.indicePiste, v.indicePiste)))
        .filter(s => s.distance > 0 && s.distance < circuit.longueur / 2).sort((a, b) => a.distance - b.distance)[0] ?? null;
      v.contexte = { voisins: autres, devant, derriere };
      v.decide(v.contexte);
    }
    voitures.forEach(v => v.applyBehaviors(v.contexte));
    voitures.forEach(v => v.update(PAS));
    observer(i);
  }
}
const distanceEntre = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);

test('aspiration : dans le sillage, bonus de vitesse proportionnel à la proximité, plafonné ; hors du sillage, aucun', () => {
  // une ligne droite hors zone DRS (le DRS est un autre bonus, qui s'ajouterait à l'aspiration)
  const I = 375;
  for (let k = -12; k <= 12; k++) assert.equal(circuit.dansZoneDRS(circuit.indice(I + k)), false);
  const devant = voiture(I);
  const derriere = voiture(I - 60 / circuit.pas);
  const base = () => derriere.vitesseDeBase();
  // dans le sillage (même trajectoire), à 60 px
  derriere.decide({ devant: suivi(devant, 60) });
  derriere.applyBehaviors({ devant: suivi(devant, 60), voisins: [devant] });
  assert.ok(derriere.aspiration > 0);
  const bonus = derriere.bonusAspiration;
  assert.ok(bonus > 0 && bonus <= derriere.parametres.bonusAspiration + 1e-12);
  assert.ok(derriere.maxSpeed > base() && derriere.maxSpeed <= base() * (1 + derriere.parametres.bonusAspiration) + 1e-9);
  assert.ok(derriere.cibles.sillage, 'seek vers le centre du sillage');
  // plus près : plus de bonus, toujours plafonné
  derriere.decide({ devant: suivi(devant, 20) });
  assert.ok(derriere.bonusAspiration > bonus && derriere.bonusAspiration <= derriere.parametres.bonusAspiration);
  // déboîtée (un rayon et plus sur le côté) : plus d'aspiration
  const decalee = voiture(I - 60 / circuit.pas, 30);
  decalee.decide({ devant: suivi(devant, 60) });
  decalee.applyBehaviors({ devant: suivi(devant, 60), voisins: [devant] });
  assert.equal(decalee.aspiration, 0);
  assert.ok(decalee.maxSpeed <= decalee.vitesseDeBase() + 1e-9);
  // trop loin : rien
  derriere.decide({ devant: suivi(devant, derriere.parametres.distanceAspiration + 1) });
  assert.equal(derriere.bonusAspiration, 0);
  // IA avancée désactivée : jamais d'aspiration
  const sansIa = voiture(I - 60 / circuit.pas, 0, { iaAvancee: false });
  sansIa.decide({ devant: suivi(devant, 40) });
  assert.equal(sansIa.aspiration, 0);
  assert.equal(sansIa.traits, Personnalites.NEUTRE);
});

test('dépassement : sur 3 tours, la voiture plus rapide double la plus lente sans jamais la toucher', () => {
  const lente = voiture(30, 0, { poidsWander: 0 });
  const rapide = voiture(30 - 120 / circuit.pas, 0, { poidsWander: 0 });
  // caractéristiques des voitures (des paramètres, pas des vitesses)
  lente.facteurVitesse = 0.82;
  rapide.facteurVitesse = 1.04;
  let distanceMin = Infinity;
  let deboite = false;
  rouler([lente, rapide], 60 * 60, () => {
    distanceMin = Math.min(distanceMin, distanceEntre(lente, rapide));
    if (Math.abs(rapide.decalageDepassement) > 10) deboite = true;
  });
  assert.ok(deboite, 'la voiture rapide aurait dû déboîter');
  assert.ok(rapide.progression > lente.progression + circuit.longueur * 0.1, 'elle aurait dû doubler');
  assert.ok(distanceMin >= lente.r + rapide.r, `distance minimale ${distanceMin}`);
  assert.ok(rapide.tour >= 3);
});

test('duel : deux voitures côte à côte restent séparées dans un virage, l\'une dedans, l\'autre dehors', () => {
  const virage = circuit.virages.reduce((a, b) => (a.courbure > b.courbure ? a : b));
  const depart = circuit.indice(virage.apex - 220 / circuit.pas);
  const gauche = voiture(depart, 22, { poidsWander: 0.5 });
  const droite = voiture(depart, -22, { poidsWander: 0.5 });
  for (const v of [gauche, droite]) {
    v.applyForce(scene.context.createVector(circuit.tangentes[depart].x * 3.5, circuit.tangentes[depart].y * 3.5));
    v.update();
  }
  let distanceMin = Infinity;
  let duelVu = 0;
  let exterieurPlusTot = false;
  rouler([gauche, droite], 200, () => {
    distanceMin = Math.min(distanceMin, distanceEntre(gauche, droite));
    if (gauche.duel !== null && droite.duel !== null) {
      duelVu++;
      // celle de l'extérieur freine plus tôt (zone de freinage plus grande)
      const exterieure = gauche.duelExterieur() ? gauche : droite.duelExterieur() ? droite : null;
      if (exterieure !== null) exterieurPlusTot ||= exterieure.rayonDeFreinage() > exterieure.parametres.rayonFreinage * exterieure.traits.freinage;
    }
  });
  assert.ok(duelVu > 10, `${duelVu} images en duel`);
  assert.ok(exterieurPlusTot);
  assert.ok(distanceMin >= 2 * VoitureF1.RAYON, `${distanceMin}`);
  // le wander est réduit en duel
  assert.ok(VoitureF1.WANDER_DUEL < 1 && VoitureF1.SEPARATION_DUEL > 1);
});

test('défense : un seul changement de ligne défensif par ligne droite, vers l\'intérieur du virage', () => {
  const devant = voiture(10);
  const attaquant = voiture(10 - 50 / circuit.pas);
  const virage = circuit.prochainVirage(10, circuit.longueur);
  // l'attaquant est dans son sillage : la défense commence
  devant.decide({ derriere: suivi(attaquant, 50) });
  assert.equal(devant.defense.cote, virage.sens);
  assert.equal([...devant.changementsDefense.values()].reduce((a, b) => a + b, 0), 1);
  // l'attaquant s'écarte puis revient : pas de deuxième changement sur la même ligne droite
  devant.decide({ derriere: null });
  devant.decide({ derriere: suivi(attaquant, 40) });
  assert.equal([...devant.changementsDefense.values()].reduce((a, b) => a + b, 0), 1);
  // la ligne visée est l'intérieur du virage
  assert.equal(Math.sign(devant.ligneVisee()), virage.sens);
  // sur une course complète : au plus un changement par ligne droite, et des défenses ont eu lieu
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 12, nombreTours: 3 }, Circuit.generateur(5));
  for (let i = 0; i < 60 * 300 && !c.terminee; i++) c.pas();
  const changements = c.voitures.flatMap(v => [...v.changementsDefense.values()]);
  assert.ok(changements.length > 0);
  assert.ok(changements.every(n => n <= 1), `jusqu'à ${Math.max(...changements)} par ligne droite`);
});

test('drapeau bleu : la voiture prise d\'un tour s\'écarte latéralement de celle qui la double', () => {
  const doublee = voiture(40);
  const leader = voiture(40 - 60 / circuit.pas);
  leader.tour = doublee.tour + 1;                                // un tour d'avance (donnée de perception)
  doublee.decide({ derriere: suivi(leader, 60) });
  assert.equal(doublee.drapeauBleu, true);
  assert.equal(doublee.defense.cote, 0);                         // on ne défend pas contre un leader qui double
  doublee.applyBehaviors({ derriere: suivi(leader, 60), voisins: [leader] });
  const force = doublee.forces.drapeauBleu;
  assert.ok(force && force.mag() > 0);
  // purement latérale : perpendiculaire à la piste
  const t = circuit.tangentes[doublee.indicePiste];
  assert.ok(Math.abs(force.x * t.x + force.y * t.y) < 1e-9);
  // sans tour d'avance : pas de drapeau bleu
  leader.tour = doublee.tour;
  doublee.decide({ derriere: suivi(leader, 60) });
  assert.equal(doublee.drapeauBleu, false);
});

test('personnalités : quatre profils ; à voiture égale, un pilote agressif double plus tôt qu\'un régulier, lui-même plus tôt qu\'un prudent', () => {
  assert.deepEqual(Array.from(Personnalites.NOMS), ['agressif', 'prudent', 'regulier', 'imprevisible']);
  assert.equal(Personnalites.choisir('prudent', () => 0.9), 'prudent');
  assert.throws(() => Personnalites.choisir('fou', Math.random), { name: 'RangeError' });
  const P = Personnalites.PROFILS;
  assert.ok(P.agressif.depassement > P.prudent.depassement && P.prudent.securite > P.agressif.securite);
  assert.ok(P.imprevisible.erreurs > P.regulier.erreurs && P.imprevisible.wander > P.regulier.wander);
  // duel contrôlé : même voiture de tête (régulière), même suiveuse 14 % plus rapide ; seule la
  // personnalité de la suiveuse change. (Une course à 12 voitures mêle trop d'effets : écarts de
  // vitesse entre voitures, erreurs, stands.)
  const dateDuDepassement = personnalite => {
    // random() de p5 (wander) repart d'une graine fixe : le duel ne dépend pas des tests précédents
    const uniforme = generator(11);
    scene.context.random = (a, b) => (b === undefined ? uniforme() * (a ?? 1) : a + uniforme() * (b - a));
    // sans la glisse réaliste : le duel isole la décision de dépasser (la glisse ajoute la finesse
    // du pilote, qui change le rythme en virage)
    const tete = voiture(30, 0, { frequenceErreurs: 0, glisseRealiste: false });
    const suiveuse = voiture(30 - 100 / circuit.pas, 0, { frequenceErreurs: 0, glisseRealiste: false });
    tete.changerDePersonnalite('regulier');
    suiveuse.changerDePersonnalite(personnalite);
    tete.facteurVitesse = 0.97;
    suiveuse.facteurVitesse = 0.97 * 1.14;
    let date = Infinity;
    let distanceMin = Infinity;
    rouler([tete, suiveuse], 60 * 60, i => {
      distanceMin = Math.min(distanceMin, distanceEntre(tete, suiveuse));
      if (date === Infinity && suiveuse.progression > tete.progression + 30) date = i / 60;
    });
    assert.ok(distanceMin >= tete.r + suiveuse.r, `${personnalite} : distance minimale ${distanceMin}`);
    return date;
  };
  const agressif = dateDuDepassement('agressif');
  const regulier = dateDuDepassement('regulier');
  const prudent = dateDuDepassement('prudent');
  assert.ok(agressif < 20, `l'agressive aurait dû doubler (${agressif} s)`);
  assert.ok(agressif < regulier && regulier < prudent, `agressif ${agressif} s, régulier ${regulier} s, prudent ${prudent} s`);
});

test('côte à côte : DRS seulement derrière (une longueur), freinage de suivi seulement dans le couloir, duel mesuré sur la piste', () => {
  // DRS : dans une zone DRS, derrière à moins d'une longueur, pas de DRS ; à une longueur, DRS
  const zone = Array.from({ length: circuit.n }, (_, i) => i).find(i => circuit.dansZoneDRS(i) && circuit.dansZoneDRS(i + 10));
  const v = voiture(zone);
  const autre = voiture(zone + 5);
  v.decide({ devant: suivi(autre, VoitureF1.LONGUEUR - 1) });
  v.applyBehaviors({ devant: suivi(autre, VoitureF1.LONGUEUR - 1), voisins: [] });
  assert.equal(v.drs, false);
  v.decide({ devant: suivi(autre, VoitureF1.LONGUEUR) });
  v.applyBehaviors({ devant: suivi(autre, VoitureF1.LONGUEUR), voisins: [] });
  assert.equal(v.drs, true);

  // couloir : une voiture déboîtée de la somme des rayons ne freine plus derrière l'autre
  const devant = voiture(200);
  const pile = voiture(200 - 60 / circuit.pas);
  const somme = pile.r + devant.r;
  const deboitee = voiture(200 - 60 / circuit.pas, somme + 1);
  const presque = voiture(200 - 60 / circuit.pas, somme - 1);
  assert.equal(pile.dansMonCouloir(devant), true);
  assert.equal(presque.dansMonCouloir(devant), true);
  assert.equal(deboitee.dansMonCouloir(devant), false);
  // sans IA avancée, toujours dans le couloir (comportement d'origine)
  assert.equal(voiture(200 - 60 / circuit.pas, somme + 1, { iaAvancee: false }).dansMonCouloir(devant), true);

  // duel : côte à côte dans le repère de la piste, même si le cap de la voiture est de biais
  const gauche = voiture(300, 20);
  const droite = voiture(300, -20);
  gauche.applyForce(scene.context.createVector(circuit.normales[300].x * 2, circuit.normales[300].y * 2));
  gauche.update();
  gauche.decide({ voisins: [droite] });
  assert.ok(gauche.duel !== null && gauche.duel.vehicule === droite);
  assert.ok(gauche.duel.lat < 0, "l'autre est du côté des écarts négatifs");
  // plus d'une longueur devant (le long de la piste) : pas de duel
  const loin = voiture(300 + (VoitureF1.LONGUEUR + 8) / circuit.pas, -20);
  gauche.decide({ voisins: [loin] });
  assert.equal(gauche.duel, null);
});

test('personnalités en défense : un pilote prudent ne ferme pas la porte, un combatif si', () => {
  const defend = personnalite => {
    const devant = voiture(10);
    const attaquant = voiture(10 - 50 / circuit.pas);
    devant.changerDePersonnalite(personnalite);
    devant.decide({ derriere: suivi(attaquant, 50) });
    return devant.defense.cote !== 0;
  };
  assert.ok(Personnalites.PROFILS.prudent.depassement < VoitureF1.DEFENSE_MIN);
  assert.equal(defend('prudent'), false);
  assert.equal(defend('regulier'), true);
  assert.equal(defend('agressif'), true);
});

test('erreurs : probabilité 0, aucune ; probabilité 1, la voiture part large puis revient sur la piste', () => {
  const tour = reglages => {
    const v = voiture(0, 0, reglages);
    v.changerDePersonnalite('imprevisible');
    let ecartMax = 0;
    let sortieMax = 0;
    let sortie = 0;
    for (let i = 0; i < 60 * 40 && v.tour < 2; i++) {
      v.decide({});
      v.applyBehaviors({});
      v.update(PAS);
      ecartMax = Math.max(ecartMax, Math.abs(v.ecartLateral - circuit.decalagesLigne[v.indicePiste]));
      sortie = Math.abs(v.ecartLateral) + VoitureF1.LARGEUR / 2 > circuit.largeur / 2 ? sortie + 1 : 0;
      sortieMax = Math.max(sortieMax, sortie);
    }
    return { v, ecartMax, sortieMax };
  };
  const sage = tour({ frequenceErreurs: 0, poidsWander: 0 });
  assert.equal(sage.v.erreurs, 0);
  assert.ok(sage.ecartMax < 20, `${sage.ecartMax}`);
  const fautif = tour({ frequenceErreurs: 1, poidsWander: 0 });
  assert.ok(fautif.v.erreurs >= 5, `${fautif.v.erreurs} erreurs`);
  assert.ok(fautif.ecartMax > sage.ecartMax + 10, `${fautif.ecartMax}`);
  // jamais durablement hors de la piste, et sur la piste à la fin
  assert.ok(fautif.sortieMax <= 30, `${fautif.sortieMax} images dehors`);
  assert.ok(Math.abs(fautif.v.ecartLateral) < circuit.largeur / 2);
  assert.equal(fautif.v.erreur, 0);
});

test('stratégie : usure, météo (après le délai du pilote), safety car, undercut, coéquipier au stand', () => {
  const v = { arrivee: false, auStand: false, demandeStand: false, pneus: 0.6, typePneus: 'MEDIUM' };
  const base = { seuil: 0.35, toursRestants: 5 };
  assert.equal(Strategie.decider(v, base).rentrer, false);
  assert.deepEqual({ ...Strategie.decider({ ...v, pneus: 0.3 }, base) }, { rentrer: true, raison: 'usure', pneus: 'MEDIUM' });
  // pluie : pneus inadaptés, mais seulement après le délai de réaction du pilote
  assert.equal(Strategie.decider(v, { ...base, humidite: 0.8, attenteMeteo: 1, reaction: 3 }).rentrer, false);
  assert.deepEqual({ ...Strategie.decider(v, { ...base, humidite: 0.8, attenteMeteo: 3, reaction: 3 }) }, { rentrer: true, raison: 'meteo', pneus: 'PLUIE' });
  assert.equal(Strategie.decider(v, { ...base, humidite: 0.4, attenteMeteo: 9 }).pneus, 'INTER');
  // safety car : arrêt « gratuit » si les pneus sont entamés
  assert.equal(Strategie.decider(v, { ...base, safetyCar: true }).raison, 'safety car');
  assert.equal(Strategie.decider({ ...v, pneus: 0.9 }, { ...base, safetyCar: true }).rentrer, false);
  // undercut : proche de la voiture de devant, loin de celle de derrière
  const entame = { ...v, pneus: 0.45 };
  assert.equal(Strategie.decider(entame, { ...base, secondesDevant: 1, secondesDerriere: 5 }).raison, 'undercut');
  assert.equal(Strategie.decider(entame, { ...base, secondesDevant: 1, secondesDerriere: 1 }).rentrer, false);
  // coéquipier au stand : on attend, sauf pneus vraiment morts
  assert.equal(Strategie.decider({ ...v, pneus: 0.3 }, { ...base, coequipierAuStand: true }).rentrer, false);
  assert.equal(Strategie.decider({ ...v, pneus: 0.1 }, { ...base, coequipierAuStand: true }).rentrer, true);
  // déjà au stand, arrivée, dernier tour : rien
  assert.equal(Strategie.decider({ ...v, pneus: 0.1, auStand: true }, base).rentrer, false);
  assert.equal(Strategie.decider({ ...v, pneus: 0.1 }, { ...base, toursRestants: 0 }).rentrer, false);
  // un pilote qui use ses pneus rentre un peu plus tôt
  assert.equal(Strategie.decider({ ...v, pneus: 0.37 }, { ...base, gestionPneus: 1.25 }).rentrer, true);
  assert.equal(Pneus.adapte(0, 12), 'DUR');
});

test('stratégie dans la course : arrêts décalés entre coéquipiers, pneus changés au stand', () => {
  // usure réglée pour que les pneus ne meurent pas pendant que le coéquipier rejoint le stand : à
  // 0,03, ils passent du seuil d'arrêt au seuil d'urgence en 6 s environ, moins d'un tour, et
  // l'exception « pneus morts » fait alors s'arrêter les deux ensemble (voulu, mais pas testé ici)
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, nombreVoitures: 8, ecuries: 4, nombreTours: 8, usurePneus: 0.015 },
    Circuit.generateur(11));
  let ensemble = 0;
  for (let i = 0; i < 60 * 300 && !c.terminee; i++) {
    c.pas();
    for (const ecurie of new Set(c.voitures.map(v => v.ecurie))) {
      const auBox = c.voitures.filter(v => v.ecurie === ecurie && v.phaseStand === VoitureF1.PHASES_STAND.ARRET);
      if (auBox.length > 1) ensemble++;
    }
  }
  assert.ok(c.voitures.reduce((n, v) => n + v.arretsAuStand, 0) >= 8);
  // deux voitures d'une même écurie ne sont presque jamais arrêtées ensemble (sauf pneus morts)
  assert.ok(ensemble < 60, `${ensemble} images avec deux coéquipiers arrêtés`);
});
