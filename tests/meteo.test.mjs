import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';

// Bloc pluie : la météo (modes, transitions lentes, hystérésis des états, humidité en retard,
// éclairs), les pneus (adhérence, usure, choix), les gerbes d'eau (des Vehicle), l'effet sur les
// voitures, et la grande simulation : 20 voitures, 3 tours sous la pluie, sans aucun contact.

const scene = loadScene(F1, '({ Vehicle, Circuit, VoitureF1, Fumee, GerbeEau, Meteo, Pneus, Course })');
const { Vehicle, Circuit, VoitureF1, Fumee, GerbeEau, Meteo, Pneus, Course } = scene;
const { SEC, BRUINE, PLUIE, ORAGE } = Meteo.ETATS;

function course(reglages = {}, graine = 1999) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages }, Circuit.generateur(graine));
}
// Fait passer `secondes` secondes, par pas de dt.
function attendre(meteo, secondes, dt = 1 / 60) {
  for (let t = 0; t < secondes - 1e-9; t += dt) meteo.update(dt);
}

test('météo : la météo et les pneus ne bougent pas (pas des Vehicle) ; la gerbe d\'eau est une Fumee, donc un Vehicle', () => {
  assert.ok(!(new Meteo({}) instanceof Vehicle));
  assert.equal(Object.getPrototypeOf(GerbeEau), Fumee);
  assert.ok(new GerbeEau(0, 0) instanceof Vehicle);
  assert.equal(typeof Pneus.adherence, 'function');
});

test('météo sèche (bloc désactivé) : aucune pluie, adhérence 1, état SEC, même après des minutes', () => {
  const m = new Meteo({ modeMeteo: 'sec' });
  attendre(m, 300, 0.5);
  assert.deepEqual([m.intensite, m.humidite, m.adherence, m.etat, m.flash], [0, 0, 1, SEC, 0]);
});

test('mode manuel : l\'intensité va lentement vers celle du curseur (VITESSE_TRANSITION par seconde), sans la dépasser', () => {
  const p = { modeMeteo: 'manuel', intensitePluie: 0 };
  const m = new Meteo(p);
  assert.equal(m.intensite, 0);
  p.intensitePluie = 0.8;
  attendre(m, 1);
  assert.ok(Math.abs(m.intensite - Meteo.VITESSE_TRANSITION) < 1e-6, `${m.intensite}`);
  attendre(m, 30);
  assert.ok(Math.abs(m.intensite - 0.8) < 1e-9);
  // intensité hors de [0, 1] : bornée
  p.intensitePluie = 3;
  assert.equal(m.cibleDuMode(), 1);
});

test('humidité : la piste se mouille vite et sèche lentement (elle suit la pluie avec retard)', () => {
  const p = { modeMeteo: 'manuel', intensitePluie: 1 };
  const m = new Meteo(p);
  // départ sous la pluie : sans transition
  assert.deepEqual([m.intensite, m.humidite], [1, 1]);
  p.intensitePluie = 0;
  attendre(m, 15);
  assert.equal(m.intensite, 0);
  // l'humidité baisse de SECHAGE par seconde au plus : il en reste beaucoup
  assert.ok(m.humidite >= 1 - Meteo.SECHAGE * 15 - 1e-9 && m.humidite > 0.5, `${m.humidite}`);
  // remouillage : MOUILLAGE par seconde, plus rapide que le séchage
  assert.ok(Meteo.MOUILLAGE > Meteo.SECHAGE);
});

test('adhérence de la piste : de 1 (sèche) à ADHERENCE_MIN (détrempée), selon l\'effet réglé', () => {
  const p = { modeMeteo: 'manuel', intensitePluie: 1, effetAdherence: 1 };
  const m = new Meteo(p);
  assert.equal(m.adherence, Meteo.ADHERENCE_MIN);
  p.effetAdherence = 0;
  assert.equal(m.adherence, 1);
  p.effetAdherence = 0.5;
  assert.ok(Math.abs(m.adherence - (1 - (1 - Meteo.ADHERENCE_MIN) * 0.5)) < 1e-12);
  assert.ok(m.visibilite < 1 && m.visibilite >= 0.4);
});

test('états : SEC, BRUINE, PLUIE, ORAGE ; on entre au seuil exact, on ne sort qu\'à HYSTERESIS en dessous', () => {
  const m = new Meteo({ modeMeteo: 'sec' });
  const [s1, s2, s3] = Meteo.SEUILS;
  const etatPour = intensite => {
    m.intensite = intensite;
    m.mettreAJourEtat();
    return m.etat;
  };
  assert.equal(etatPour(s1 - 1e-6), SEC);
  assert.equal(etatPour(s1), BRUINE);                            // seuil inclusif
  assert.equal(etatPour(s2), PLUIE);
  assert.equal(etatPour(s3), ORAGE);
  // juste sous le seuil : on reste (hystérésis)
  assert.equal(etatPour(s3 - Meteo.HYSTERESIS / 2), ORAGE);
  assert.equal(etatPour(s3 - Meteo.HYSTERESIS), ORAGE);          // le seuil de sortie est strict
  assert.equal(etatPour(s3 - Meteo.HYSTERESIS - 1e-6), PLUIE);
  assert.equal(etatPour(s1 - Meteo.HYSTERESIS - 1e-6), SEC);     // plusieurs niveaux d'un coup
  // pas de clignotement au voisinage d'un seuil (une fois entré en PLUIE)
  assert.equal(etatPour(s2 + 0.01), PLUIE);
  const etats = new Set();
  for (let k = 0; k < 50; k++) etats.add(etatPour(s2 + (k % 2 ? 0.01 : -0.01)));
  assert.equal(etats.size, 1);
});

test('mode automatique : le programme (sec, averse, orage, éclaircie) se répète toutes les PERIODE s', () => {
  const m = new Meteo({ modeMeteo: 'automatique' });
  const etats = new Set();
  for (let t = 0; t < Meteo.PERIODE; t += 0.5) {
    m.update(0.5);
    etats.add(m.etat);
  }
  assert.deepEqual([...etats].sort(), [BRUINE, ORAGE, PLUIE, SEC].sort());
  // le programme est périodique
  m.chrono = 50;
  const a = m.cibleDuMode();
  m.chrono = 50 + Meteo.PERIODE;
  assert.equal(m.cibleDuMode(), a);
});

test('mode aléatoire : reproductible (graine), un tirage toutes les PERIODE_ALEATOIRE s', () => {
  const trace = () => {
    const m = new Meteo({ modeMeteo: 'aleatoire' }, Circuit.generateur(5));
    const cibles = [];
    for (let k = 0; k < 4; k++) {
      attendre(m, Meteo.PERIODE_ALEATOIRE, 0.5);
      cibles.push(m.cibleAleatoire);
    }
    return cibles;
  };
  const a = trace();
  assert.deepEqual(a, trace());
  assert.ok(new Set(a).size > 1);
  a.forEach(cible => assert.ok(cible >= 0 && cible <= 1));
});

test('éclairs : seulement en ORAGE ; un flash de DUREE_ECLAIR s, purement dessiné', () => {
  const p = { modeMeteo: 'manuel', intensitePluie: 0.6 };
  const m = new Meteo(p, () => 0);
  attendre(m, 30);
  assert.equal(m.etat, PLUIE);
  assert.equal(m.flash, 0);
  p.intensitePluie = 1;
  let flashs = 0;
  for (let t = 0; t < 30; t += 1 / 60) {
    m.update(1 / 60);
    if (m.flash === Meteo.DUREE_ECLAIR) flashs++;
  }
  assert.equal(m.etat, ORAGE);
  assert.ok(flashs >= 2, `${flashs} éclairs`);
  assert.ok(m.flash <= Meteo.DUREE_ECLAIR);
});

test('réinitialiser : une nouvelle course repart de l\'état visé, sans transition', () => {
  const p = { modeMeteo: 'manuel', intensitePluie: 0 };
  const m = new Meteo(p);
  p.intensitePluie = 0.9;
  attendre(m, 2);
  m.reinitialiser();
  assert.deepEqual([m.intensite, m.humidite, m.etat, m.chrono], [0.9, 0.9, ORAGE, 0]);
});

test('pneus : adhérence et usure selon l\'humidité ; MEDIUM au sec vaut 1 (référence) ; les pneus pluie fondent au sec', () => {
  assert.deepEqual(Array.from(Pneus.NOMS), ['TENDRE', 'MEDIUM', 'DUR', 'INTER', 'PLUIE']);
  assert.equal(Pneus.adherence('MEDIUM', 0), 1);
  assert.equal(Pneus.usure('MEDIUM', 0), 1);
  // au sec, les slicks devant ; détrempé, les pneus pluie devant, les intermédiaires entre les deux
  assert.ok(Pneus.adherence('TENDRE', 0) > Pneus.adherence('INTER', 0));
  assert.ok(Pneus.adherence('PLUIE', 1) > Pneus.adherence('INTER', 1) && Pneus.adherence('INTER', 1) > Pneus.adherence('MEDIUM', 1));
  // les intermédiaires sont meilleurs que tout sur piste humide (pas détrempée)
  assert.ok(Pneus.adherence('INTER', 0.45) > Pneus.adherence('PLUIE', 0.45) && Pneus.adherence('INTER', 0.45) > Pneus.adherence('MEDIUM', 0.45));
  for (const nom of Pneus.NOMS) {
    for (const h of [-1, 0, 0.3, 1, 2]) {
      const a = Pneus.adherence(nom, h);
      assert.ok(a >= Pneus.ADHERENCE_MIN && a <= Pneus.ADHERENCE_MAX, `${nom} ${h}`);
    }
  }
  assert.ok(Pneus.usure('PLUIE', 0) > 2 * Pneus.usure('PLUIE', 1));
  assert.throws(() => Pneus.adherence('NEIGE'), { name: 'RangeError' });
});

test('pneus adaptés : pluie au-dessus de SEUIL_PLUIE, intermédiaires au-dessus de SEUIL_INTER (seuils inclusifs), slicks sinon', () => {
  assert.equal(Pneus.adapte(Pneus.SEUIL_PLUIE), 'PLUIE');
  assert.equal(Pneus.adapte(Pneus.SEUIL_PLUIE - 1e-6), 'INTER');
  assert.equal(Pneus.adapte(Pneus.SEUIL_INTER), 'INTER');
  assert.equal(Pneus.adapte(Pneus.SEUIL_INTER - 1e-6, 5), 'MEDIUM');
  assert.equal(Pneus.adapte(0, 2), 'TENDRE');
  assert.equal(Pneus.adapte(0, 10), 'DUR');
  assert.ok(Pneus.memeCategorie('TENDRE', 'DUR') && !Pneus.memeCategorie('INTER', 'PLUIE'));
});

test('voiture sous la pluie : adhérence du pneu monté -> maxForce plus faible, freinage plus tôt, vitesse de virage plus basse', () => {
  const circuit = Course.circuit('classique');
  const voiture = (pneus, intensite) => {
    const p = { ...Course.parametresParDefaut(), modeMeteo: 'manuel', intensitePluie: intensite };
    const v = new VoitureF1(circuit.points[0].x, circuit.points[0].y, { circuit, parametres: p, alea: () => 0.5 });
    v.typePneus = pneus;
    v.passerA(VoitureF1.ETATS.COURSE);
    const meteo = new Meteo(p);
    v.moduler(null, meteo);
    return v;
  };
  const seche = voiture('MEDIUM', 0);
  const mouillee = voiture('MEDIUM', 1);
  const pluie = voiture('PLUIE', 1);
  assert.equal(seche.adherence, 1);
  assert.equal(seche.maxForce, seche.parametres.forceMax * seche.facteurForce);
  assert.ok(mouillee.maxForce < seche.maxForce && pluie.maxForce > mouillee.maxForce);
  assert.ok(mouillee.rayonDeFreinage() > seche.rayonDeFreinage());
  const apex = circuit.virages[0].apex;
  assert.ok(mouillee.profil()[apex] < seche.profil()[apex]);
  // effet réglé à 0 : la pluie ne change rien à l'adhérence
  const p0 = { ...Course.parametresParDefaut(), modeMeteo: 'manuel', intensitePluie: 1, effetAdherence: 0 };
  const v0 = new VoitureF1(0, 0, { circuit, parametres: p0, alea: () => 0.5 });
  v0.mettreAJourAdherence(new Meteo(p0));
  assert.equal(v0.adherence, 1);
});

test('gerbes d\'eau : seulement sur piste mouillée et si la case est cochée ; nombre plafonné ; elles s\'effacent', () => {
  const rouler = (reglages, pas = 60 * 25) => {
    const c = course({ nombreVoitures: 8, nombreTours: 3, ...reglages });
    let max = 0;
    for (let i = 0; i < pas; i++) {
      c.pas();
      max = Math.max(max, c.gerbes.length);
    }
    return { c, max };
  };
  assert.equal(rouler({ modeMeteo: 'sec' }).max, 0);
  assert.equal(rouler({ modeMeteo: 'manuel', intensitePluie: 0.9, gerbes: false }).max, 0);
  const { c, max } = rouler({ modeMeteo: 'manuel', intensitePluie: 0.9, quantiteGerbes: 40 });
  assert.ok(max > 0 && max <= 40, `${max}`);
  c.gerbes.forEach(gerbe => assert.ok(gerbe instanceof GerbeEau));
  // une gerbe vit DUREE secondes
  const g = new GerbeEau(0, 0, { x: 1, y: 0 });
  for (let t = 0; t < GerbeEau.DUREE + 0.05; t += 1 / 60) {
    g.applyBehaviors();
    g.update(1 / 60);
  }
  assert.ok(g.terminee);
});

test('stratégie sous la pluie : partis en mediums, les pilotes passent aux pneus pluie (après leur délai de réaction)', () => {
  const c = course({ nombreVoitures: 10, nombreTours: 3, modeMeteo: 'manuel', intensitePluie: 0.9, pneusDepart: 'MEDIUM' });
  for (let i = 0; i < 60 * 400 && !c.terminee; i++) c.pas();
  assert.ok(c.terminee);
  assert.ok(c.voitures.every(v => v.typePneus === 'PLUIE'), c.voitures.map(v => v.typePneus).join(','));
});

// La grande simulation, sous la pluie. Même mesure que pour le sec (course.test.mjs) : la distance
// entre centres reste au moins la somme des rayons, sans tolérance.
for (const [profil, pneus, intensite] of [['classique', 'PLUIE', 0.9], ['technique', 'PLUIE', 0.9], ['classique', 'MEDIUM', 0.9]]) {
  test(`pluie : 20 voitures, 3 tours sur le circuit ${profil}, pneus ${pneus} au départ : aucun contact, au plus deux abandons`, () => {
    const c = course({ profil, nombreVoitures: 20, nombreTours: 3, modeMeteo: 'manuel', intensitePluie: intensite, pneusDepart: pneus });
    let ecartMin = Infinity;
    let sortieMax = 0;
    const horsPiste = new Map();
    for (let i = 0; i < 60 * 500 && !c.terminee; i++) {
      c.pas();
      const v = c.voitures;
      for (let a = 0; a < v.length; a++) {
        for (let b = a + 1; b < v.length; b++) {
          ecartMin = Math.min(ecartMin, Math.hypot(v[a].pos.x - v[b].pos.x, v[a].pos.y - v[b].pos.y) - v[a].r - v[b].r);
        }
        // une voiture hors course (accidentée, remorquée, garée au poste) ne compte plus
        const dehors = !v[a].auStand && !v[a].horsCourse && Math.abs(v[a].ecartLateral) + VoitureF1.LARGEUR / 2 > c.circuit.largeur / 2;
        horsPiste.set(v[a], dehors ? (horsPiste.get(v[a]) ?? 0) + 1 : 0);
        sortieMax = Math.max(sortieMax, horsPiste.get(v[a]));
      }
    }
    assert.ok(c.terminee, 'la course aurait dû se terminer');
    assert.equal(c.meteo.etat, ORAGE);
    assert.ok(c.meteo.adherence < 0.6);
    assert.ok(ecartMin >= 0, `deux voitures à ${ecartMin} px de moins que la somme de leurs rayons`);
    // personne ne reste durablement hors piste : au plus deux secondes d'affilée (glisse réaliste :
    // un doublage au freinage raté envoie parfois une voiture large, dans l'herbe ou le gravier,
    // d'où elle revient ; en slicks, une voiture glisse aussi en attendant son arrêt)
    assert.ok(sortieMax <= 120, `${sortieMax} images hors piste`);
    // glisse réaliste : sous la pluie, une voiture peut partir au mur ou s'enliser dans le gravier
    // (erreur, doublage au freinage raté) : au plus deux abandons, tous les autres à l'arrivée
    const abandons = c.voitures.filter(v => c.chronometrage.abandon(v)).length;
    assert.equal(c.ordreArrivee.length + abandons, 20);
    assert.ok(abandons <= 2, `${abandons} abandons`);
  });
}
