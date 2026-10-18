import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator, near } from './support.mjs';
import { page } from './page.mjs';

// Phase 5 : modes de jeu. Manager (consignes, appels au stand, ordres d'équipe), défis (étoiles,
// stockage protégé), championnat (barème, meilleur tour, classements), podium et confettis (des
// Vehicle), multijoueur en écran partagé (deux VoiturePilote, touches séparées), REJOUER, et un test
// de charge : tous les systèmes avec 20 voitures.

const scene = loadScene(F1, `({ Vehicle, Circuit, Course, VoitureF1, VoiturePilote, Pneus, Manager, Defis, Championnat, Confetti,
  Podium, EcranPartage })`);
const { Vehicle, Circuit, Course, VoitureF1, VoiturePilote, Pneus, Manager, Defis, Championnat, Confetti, Podium, EcranPartage } = scene;
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

test('classes : les confettis sont des Vehicle ; manager, championnat, podium, écran partagé n\'en sont pas', () => {
  assert.ok(new Confetti(0, 0, 100) instanceof Vehicle);
  for (const Classe of [Manager, Championnat, Podium, EcranPartage]) assert.ok(!(Classe.prototype instanceof Vehicle), Classe.name);
});

test('consignes : attaque plus rapide et use plus les pneus, économie l\'inverse ; consigne inconnue refusée', () => {
  const c = course({ nombreVoitures: 2 });
  const v = c.voitures[0];
  const base = v.vitesseDeBase();
  v.consigner('attaque');
  near(v.vitesseDeBase(), base * VoitureF1.CONSIGNES.attaque.vitesse, 1e-12);
  v.consigner('economie');
  near(v.vitesseDeBase(), base * VoitureF1.CONSIGNES.economie.vitesse, 1e-12);
  assert.throws(() => v.consigner('turbo'), { name: 'RangeError' });
  assert.equal(v.consigne, 'economie');
  // usure : même course, une voiture en attaque, l'autre en économie
  const usure = consigne => {
    graine(5);
    const d = course({ nombreVoitures: 2, usurePneus: 0.03 });
    d.voitures.forEach(x => x.consigner(consigne));
    enCourse(d);
    for (let i = 0; i < 900; i++) d.pas();
    return 1 - d.voitures[0].pneus;
  };
  assert.ok(usure('attaque') > usure('normal') && usure('normal') > usure('economie'));
});

test('manager : appel au stand avec les pneus choisis (son écurie seulement) ; la stratégie automatique ne touche pas son écurie', () => {
  const c = course({ nombreVoitures: 6, ecuries: 3 });
  const m = new Manager(c, Course.ECURIES[1]);
  assert.equal(c.ecurieGeree, Course.ECURIES[1]);
  const [a, b] = m.voitures(c);
  assert.ok(a.ecurie === Course.ECURIES[1] && b.ecurie === Course.ECURIES[1]);
  assert.equal(m.voiture(c, 2), null);
  enCourse(c);
  assert.equal(m.rentrer(c, a, 'DUR'), true);
  assert.ok(a.demandeStand && a.pneuDemande === 'DUR');
  assert.ok(c.messagesRadio.some(r => r.voiture === a && r.texte.includes('Box')));
  const autre = c.voitures.find(v => v.ecurie !== Course.ECURIES[1]);
  assert.equal(m.rentrer(c, autre, 'DUR'), false);
  assert.throws(() => m.rentrer(c, b, 'SLICK'));
  // pneus usés sous le seuil : l'IA rentre seule, l'écurie dirigée attend les ordres
  c.voitures.forEach(v => { v.pneus = 0.05; v.demandeStand = false; });
  c.gererLesStands();
  assert.equal(b.demandeStand, false);
  assert.ok(c.voitures.filter(v => v.ecurie !== Course.ECURIES[1]).every(v => v.demandeStand));
  assert.throws(() => m.diriger(c, { nom: 'Inconnue' }), { name: 'RangeError' });
});

test('manager : ordre d\'équipe (la voiture de devant laisse passer) ; refus selon l\'obéissance ; consigne transmise', () => {
  const c = course({ nombreVoitures: 6, ecuries: 3 });
  const m = new Manager(c, Course.ECURIES[0]);
  enCourse(c);
  for (let i = 0; i < 300; i++) c.pas();
  const [devant, derriere] = c.classement().filter(v => v.ecurie === Course.ECURIES[0]);
  devant.traits.obeissance = 1;
  const ordre = m.inverser(c);
  assert.equal(ordre.lent, devant);
  assert.equal(ordre.refus, false);
  assert.equal(devant.laisserPasser.coequipier, derriere);
  devant.laisserPasser = null;
  devant.traits.obeissance = 0;
  const refus = m.inverser(c);
  assert.equal(refus.refus, true);
  assert.equal(devant.laisserPasser, null);
  assert.ok(c.messagesRadio.some(r => r.texte.includes('Négatif')));
  assert.equal(m.consigner(c, derriere, 'attaque'), true);
  assert.equal(derriere.consigne, 'attaque');
});

test('défis : étoiles selon le bilan (bords inclus) ; rang de grille ; défi inconnu refusé', () => {
  const remontee = Defis.defi('remontee');
  assert.equal(remontee.etoiles({ fini: true, position: 1 }), 3);
  assert.equal(remontee.etoiles({ fini: true, position: 5 }), 2);
  assert.equal(remontee.etoiles({ fini: true, position: 10 }), 1);
  assert.equal(remontee.etoiles({ fini: true, position: 11 }), 0);
  assert.equal(remontee.etoiles({ fini: false, position: 1 }), 0);
  const sansFaute = Defis.defi('sansFaute');
  assert.equal(sansFaute.etoiles({ fini: true, position: 3, penalites: 0 }), 3);
  assert.equal(sansFaute.etoiles({ fini: true, position: 4, penalites: 0 }), 2);
  assert.equal(sansFaute.etoiles({ fini: true, position: 1, penalites: 5 }), 1);
  const tour = Defis.defi('tourRapide');
  assert.equal(tour.etoiles({ ecartMeilleurTour: 0 }), 3);
  assert.equal(tour.etoiles({ ecartMeilleurTour: 0.5 }), 2);
  assert.equal(tour.etoiles({ ecartMeilleurTour: 1 }), 1);
  assert.equal(tour.etoiles({ ecartMeilleurTour: 1.01 }), 0);
  assert.equal(tour.etoiles({ ecartMeilleurTour: null }), 0);
  const manager = Defis.defi('manager');
  assert.equal(manager.etoiles({ positionsEcurie: [1, 14] }), 3);
  assert.equal(manager.etoiles({ positionsEcurie: [4, 10] }), 2);
  assert.equal(manager.etoiles({ positionsEcurie: [4, 11] }), 1);
  assert.equal(manager.etoiles({ positionsEcurie: [null, 11] }), 0);
  assert.equal(Defis.rangDeGrille(remontee, 12), 11);
  assert.equal(Defis.rangDeGrille(sansFaute, 10), 5);
  assert.throws(() => Defis.defi('inconnu'), { name: 'RangeError' });
});

test('défis : le meilleur résultat est gardé ; stockage absent, illisible ou qui refuse l\'écriture : pas d\'erreur', () => {
  const memoire = new Map();
  const stockage = { getItem: k => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) };
  let etat = Defis.enregistrer(stockage, {}, 'remontee', 2);
  assert.equal(etat.remontee, 2);
  etat = Defis.enregistrer(stockage, etat, 'remontee', 1);
  assert.equal(etat.remontee, 2);
  assert.equal(Defis.charger(stockage).remontee, 2);
  assert.throws(() => Defis.enregistrer(stockage, etat, 'remontee', 4), { name: 'RangeError' });
  // JSON abîmé, getItem qui lève (navigation privée), setItem qui lève (quota) : rien ne casse
  assert.deepEqual(Object.keys(Defis.charger({ getItem: () => '{abîmé' })), []);
  const interdit = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(Object.keys(Defis.charger(interdit)), []);
  const enMemoire = Defis.enregistrer(interdit, { sansFaute: 1 }, 'tourRapide', 3);
  assert.equal(enMemoire.tourRapide, 3);
  assert.equal(enMemoire.sansFaute, 1);
  assert.equal(Defis.enregistrer(null, {}, 'manager', 1).manager, 1);
});

test('défis : bilan d\'une vraie course (joueur, pénalités, écart au meilleur tour IA)', () => {
  const c = course({ nombreVoitures: 4, nombreTours: 2, modePilote: true });
  c.choisirJoueur(3);
  const b = Defis.bilan(c);
  assert.equal(b.position, 4);
  assert.equal(b.penalites, 0);
  assert.equal(b.ecartMeilleurTour, null);
  c.joueur.penalites = 5;
  assert.equal(Defis.bilan(c).penalites, 5);
});

// Course factice terminée : ordre donné, abandons, meilleur tour.
function courseFinie(codes, { abandons = [], meilleur = null } = {}) {
  const voitures = codes.map((code, k) => ({ pilote: { code, nom: `Pilote ${code}` }, ecurie: { nom: `E${k % 3}`, couleurs: [[k, 0, 0]] }, horsCourse: false }));
  return {
    voitures,
    classement: () => voitures,
    chronometrage: { abandon: v => abandons.includes(v.pilote.code), meilleurTour: meilleur === null ? null : { voiture: voitures.find(v => v.pilote.code === meilleur) } },
  };
}

test('championnat : barème 25-18-15-12-10-8-6-4-2-1, +1 au meilleur tour s\'il est dans les dix, abandons sans point', () => {
  const codes = Array.from({ length: 12 }, (_, k) => `P${k + 1}`);
  const lignes = Championnat.pointsDe(courseFinie(codes, { meilleur: 'P3' }));
  assert.deepEqual(Array.from(lignes, l => l.points), [25, 18, 16, 12, 10, 8, 6, 4, 2, 1, 0, 0]);
  assert.equal(lignes[2].meilleurTour, true);
  // meilleur tour hors des dix : pas de point
  assert.deepEqual(Array.from(Championnat.pointsDe(courseFinie(codes, { meilleur: 'P11' })), l => l.points).slice(9), [1, 0, 0]);
  // un abandon (classé derrière par le chronométrage) : aucun point, pas de position
  const abandon = Championnat.pointsDe(courseFinie(['A', 'B', 'C'], { abandons: ['C'], meilleur: 'C' }));
  assert.deepEqual(Array.from(abandon, l => [l.points, l.position]), [[25, 1], [18, 2], [0, null]]);
});

test('championnat : trois manches, classements pilotes et écuries (égalité : victoires), manche suivante après l\'enregistrement', () => {
  const ch = new Championnat();
  assert.deepEqual(Array.from(ch.manches), ['classique', 'rapide', 'technique']);
  assert.equal(ch.suivante(), null);                              // pas encore enregistrée
  assert.equal(ch.enregistrer(courseFinie(['A', 'B', 'C'])), true);
  assert.equal(ch.enregistrer(courseFinie(['A', 'B', 'C'])), false);   // une seule fois
  assert.equal(ch.suivante(), 'rapide');
  ch.enregistrer(courseFinie(['B', 'A', 'C']));
  // A et B : 43 points chacun, une victoire chacun ; meilleur résultat : 1 pour les deux -> ordre stable
  const pilotes = ch.classementPilotes();
  assert.deepEqual(Array.from(pilotes.slice(0, 2), p => p.points), [43, 43]);
  assert.equal(ch.suivante(), 'technique');
  ch.enregistrer(courseFinie(['B', 'C', 'A']));
  assert.equal(ch.termine, true);
  assert.equal(ch.suivante(), null);
  const final = ch.classementPilotes();
  assert.deepEqual(Array.from(final, p => [p.cle, p.points, p.victoires]), [['B', 68, 2], ['A', 58, 1], ['C', 48, 0]]);
  // écuries : la somme de leurs pilotes (A : E0, B : E1, C : E2 dans chaque course factice selon le rang)
  const ecuries = ch.classementEcuries();
  assert.equal(ecuries.reduce((s, e) => s + e.points, 0), final.reduce((s, p) => s + p.points, 0));
  // à égalité de points, le plus de victoires passe devant
  const egalite = new Championnat(['classique', 'rapide']);
  egalite.enregistrer(courseFinie(['X', 'Y']));
  egalite.suivante();
  egalite.enregistrer(courseFinie(['Y', 'X']));
  assert.deepEqual(Array.from(egalite.classementPilotes(), p => p.points), [43, 43]);
  assert.throws(() => new Championnat(['monaco']), { name: 'RangeError' });
});

test('confettis : ils tombent en voletant (forces seules, vitesse bornée), puis se posent au sol', () => {
  graine(9);
  const c = new Confetti(100, 0, 200);
  let maxVitesse = 0;
  for (let i = 0; i < 60 * 20; i++) {
    c.decide();
    c.applyBehaviors();
    c.update(1 / 60);
    maxVitesse = Math.max(maxVitesse, c.vel.mag());
  }
  assert.ok(c.pose);
  assert.ok(maxVitesse <= Confetti.VITESSE_MAX + 1e-9);
  assert.ok(c.vel.mag() < 0.05, `vitesse au sol ${c.vel.mag()}`);
  assert.ok(Math.abs(c.pos.y - 200) < 40);
  // le podium fait naître ses confettis une fois, au-dessus de l'écran
  const podium = new Podium([{ code: 'A', couleur: [1, 2, 3], points: 25, position: 1 }], new Championnat(), 800, 600);
  assert.equal(podium.confettis.length, Podium.CONFETTIS);
  assert.ok(podium.confettis.every(x => x instanceof Confetti && x.pos.y < 0));
  for (let i = 0; i < 120; i++) podium.update(1 / 60);
  assert.ok(podium.confettis.some(x => x.pos.y > 0));
  scene.calls.length = 0;
  podium.show();
  assert.ok(scene.calls.filter(a => a[0] === 'rect').length > Podium.CONFETTIS);
});

test('multijoueur : deux VoiturePilote ; touches séparées sans chevauchement ; un accident ne finit la partie que si les deux sont accidentés', () => {
  const c = course({ nombreVoitures: 6, modePilote: true });
  c.choisirJoueurs(4, 5);
  assert.ok(c.multijoueur);
  assert.ok(c.joueur instanceof VoiturePilote && c.joueur2 instanceof VoiturePilote && c.joueur !== c.joueur2);
  assert.ok(c.voitures.filter(v => v instanceof VoiturePilote).length === 2);
  assert.throws(() => c.choisirJoueurs(2, 2), { name: 'RangeError' });
  // touches : aucune n'appartient aux deux joueurs
  const [t1, t2] = EcranPartage.TOUCHES.map(t => new Set(Object.values(t)));
  assert.equal([...t1].filter(k => t2.has(k)).length, 0);
  assert.deepEqual({ ...EcranPartage.action('W') }, { joueur: 0, action: 'haut' });
  assert.deepEqual({ ...EcranPartage.action('ArrowUp') }, { joueur: 1, action: 'haut' });
  assert.deepEqual({ ...EcranPartage.action('/') }, { joueur: 1, action: 'stand' });
  assert.equal(EcranPartage.action('z'), null);
  const commandes = EcranPartage.commandes(1, new Set(['arrowleft', 'w']));
  assert.equal(commandes.gauche, true);
  assert.equal(commandes.haut, false);
  // pneus suivants : dans l'ordre de Pneus.NOMS, en boucle
  const j = c.joueur;
  j.pneuChoisi = Pneus.NOMS.at(-1);
  assert.equal(EcranPartage.pneusSuivants(j), Pneus.NOMS[0]);
  // la stratégie automatique ignore les deux joueurs
  enCourse(c);
  c.voitures.forEach(v => { v.pneus = 0.05; v.demandeStand = false; });
  c.gererLesStands();
  assert.equal(c.joueur.demandeStand || c.joueur2.demandeStand, false);
  // accident de J1, puis de J2 : chacun sa remise en piste, la partie continue (un accident ne la
  // finit jamais ; avant le 17 octobre 2026, elle finissait quand les deux étaient accidentés)
  c.provoquerAccident(c.joueur.pos.x, c.joueur.pos.y, 'test', c.joueur);
  assert.equal(c.joueur.incident.type, 'accident');
  assert.equal(c.joueur2.incident, null);
  c.provoquerAccident(c.joueur2.pos.x, c.joueur2.pos.y, 'test', c.joueur2);
  assert.equal(c.joueur2.incident.type, 'accident');
  for (let i = 0; i < 60 * 6; i++) c.pas();
  assert.notEqual(c.etat, Course.ETATS.FIN);
  // les deux moitiés d'écran se partagent la zone, sans se chevaucher
  const [g, d] = EcranPartage.zones({ x: 10, y: 20, largeur: 806, hauteur: 500 });
  assert.equal(g.largeur, d.largeur);
  assert.ok(g.x + g.largeur <= d.x);
  near(d.x + d.largeur, 816);
});

test('multijoueur dans la page : le menu Mode, les touches de J1 et J2, deux vues du monde à chaque image', () => {
  const p = page().demarrer();
  p.choisir('f1');
  p.draw();
  const mode = p.element('f1-mode');
  mode.value = 'multijoueur';
  mode.fire('change');
  assert.equal(p.evaluate('formule1.mode'), 'multijoueur');
  assert.equal(p.evaluate('formule1.course.joueurs.length'), 2);
  // seuls les contrôles du mode choisi sont visibles
  assert.ok(p.groupesModes.filter(g => g.dataset.mode === 'multijoueur').every(g => !g.hidden));
  assert.ok(p.groupesModes.filter(g => g.dataset.mode === 'manager').every(g => g.hidden));
  for (let i = 0; i < 400 && p.evaluate('formule1.course.etat') !== 'COURSE'; i++) p.draw();
  p.touche('w');
  p.touche('ArrowRight');
  p.draw();
  assert.equal(p.evaluate('formule1.course.joueur.commandes.haut'), true);
  assert.equal(p.evaluate('formule1.course.joueur2.commandes.haut'), false);
  assert.equal(p.evaluate('formule1.course.joueur2.commandes.droite'), true);
  // d et s sont des touches de conduite de J1 : ni debug ni panneau
  p.touche('d');
  assert.equal(p.evaluate('debug'), false);
  // Q : arrêt au stand de J1 seulement
  p.touche('q');
  assert.equal(p.evaluate('formule1.course.joueur.demandeStand'), true);
  assert.equal(p.evaluate('formule1.course.joueur2.demandeStand'), false);
  // deux vues : le décor est recopié deux fois par image
  p.calls.length = 0;
  p.draw();
  const traces = new Set(p.evaluate('[...Course.tracesParCircuit.values()].map(t => t.calque)'));
  const copies = p.calls.filter(c => c[0] === 'image' && c[1] && c[1].largeur >= 1000 && !traces.has(c[1]));
  assert.equal(copies.length, 2);
  // retour à la course libre : le mode pilote du panneau (décoché) est rétabli, plus de joueur
  mode.value = 'course';
  mode.fire('change');
  assert.equal(p.evaluate('formule1.course.parametres.modePilote'), false);
  assert.equal(p.evaluate('formule1.course.joueurs.length'), 0);
});

test('manager, défi et championnat dans la page : boutons, étoiles enregistrées (localStorage), podium et manche suivante', () => {
  const memoire = new Map();
  const p = page({ stockage: { getItem: k => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) } }).demarrer();
  p.choisir('f1');
  p.draw();
  const mode = p.element('f1-mode');
  // manager : l'écurie, la voiture, les pneus, le bouton Box
  mode.value = 'manager';
  mode.fire('change');
  assert.equal(p.evaluate('formule1.course.ecurieGeree === Course.ECURIES[0]'), true);
  assert.ok(p.element('f1-manager-ecurie').children.length === p.evaluate('Course.ECURIES.length'));
  for (let i = 0; i < 600 && p.evaluate('formule1.course.etat') !== 'COURSE'; i++) p.draw();
  p.element('f1-manager-pneus').value = 'DUR';
  p.element('f1-manager-box').fire('click');
  assert.equal(p.evaluate('formule1.manager.voiture(formule1.course, 0).pneuDemande'), 'DUR');
  const consigne = p.element('f1-manager-consigne');
  consigne.value = 'attaque';
  consigne.fire('change', { target: consigne });
  assert.equal(p.evaluate('formule1.manager.voiture(formule1.course, 0).consigne'), 'attaque');
  // défi : lancé depuis le panneau ; à la fin (ici : fin de partie forcée), étoiles notées et
  // enregistrées ; le mot REJOUER se forme même sans accident
  mode.value = 'defi';
  mode.fire('change');
  p.element('f1-defi').value = 'sansFaute';
  p.element('f1-defi-lancer').fire('click');
  assert.equal(p.evaluate('formule1.defi.id'), 'sansFaute');
  assert.equal(p.evaluate('formule1.course.joueur !== null'), true);
  p.evaluate('formule1.course.finirLaPartie()');
  p.draw();
  assert.notEqual(p.evaluate('formule1.resultatDefi'), null);
  assert.ok(memoire.has(p.evaluate('Defis.CLE')));
  assert.equal(p.evaluate('formule1.ecranFin !== null'), true);
  // championnat : 4 voitures, 1 tour, en accéléré ; podium à l'arrivée, puis Entrée : manche 2
  p.glisser('f1-nombre-voitures', 4);
  p.glisser('f1-nombre-tours', 1);
  p.glisser('f1-vitesse-simulation', 4);
  mode.value = 'championnat';
  mode.fire('change');
  assert.equal(p.evaluate('formule1.course.parametres.profil'), 'classique');
  for (let i = 0; i < 6000 && p.evaluate('formule1.podium') === null; i++) {
    p.calls.length = 0;                                           // le journal des dessins : pas de quoi saturer la mémoire
    p.draw();
  }
  assert.notEqual(p.evaluate('formule1.podium'), null);
  assert.equal(p.evaluate('formule1.championnat.resultats.length'), 1);
  assert.ok(p.evaluate('formule1.podium.confettis.every(c => c instanceof Vehicle)'));
  p.touche('Enter');
  assert.equal(p.evaluate('formule1.podium'), null);
  assert.equal(p.evaluate('formule1.course.parametres.profil'), 'rapide');
  assert.match(p.element('f1-championnat-etat').textContent, /^$|Manche/);
  p.draw();
  assert.match(p.element('f1-championnat-etat').textContent, /^Manche 2\/3 \(Rapide\) · meneur : /);
});

test('charge : tous les systèmes, 20 voitures : le pas de simulation reste dans le budget (et pas plus de 3 fois le minimum)', () => {
  // Deux courses de 20 voitures mesurées dans les mêmes conditions : tout activé (pluie, glisse,
  // incidents, pannes, mécaniciens, ordres, effets en qualité élevée, manager) et le strict minimum.
  // Le temps processeur de CE processus (les autres fichiers de tests tournent en parallèle). Le
  // banc node (faux vecteurs, vm) est environ 5 fois plus lent que la page (environ 1 ms par pas).
  const preparer = tout => {
    graine(2);
    const p = Course.parametresParDefaut();
    const c = new Course({ ...p, nombreVoitures: 20, incidents: tout, pannes: tout, glisseRealiste: tout, pitSpectaculaire: tout,
      ordresEquipe: tout, iaAvancee: tout, modeMeteo: tout ? 'pluie' : 'sec' }, Circuit.generateur(1999));
    Object.assign(c.affichage, tout ? { traces: true, poussiere: true, billes: true, qualite: 'eleve' } : { traces: false, poussiere: false, billes: false, qualite: 'bas' });
    if (tout) new Manager(c, Course.ECURIES[2]);
    enCourse(c);
    return c;
  };
  const tout = preparer(true);
  const minimum = preparer(false);
  const cpu = { tout: 0, minimum: 0 };
  // mesures alternées par paquets : une rafale de charge extérieure touche les deux
  for (let paquet = 0; paquet < 30; paquet++) {
    for (const [nom, c] of [['tout', tout], ['minimum', minimum]]) {
      const debut = process.cpuUsage();
      for (let i = 0; i < 60; i++) c.pas();
      const d = process.cpuUsage(debut);
      cpu[nom] += (d.user + d.system) / 1000;
    }
  }
  const pas = 30 * 60;
  const ms = cpu.tout / pas;
  const rapport = cpu.tout / cpu.minimum;
  console.log(`charge : ${ms.toFixed(2)} ms par pas (tout), ${(cpu.minimum / pas).toFixed(2)} ms (minimum), rapport ${rapport.toFixed(2)}`);
  assert.ok(ms < 16, `${ms.toFixed(2)} ms par pas : plus d'une image à 60 images/s`);
  assert.ok(rapport < 3, `rapport ${rapport.toFixed(2)}`);
  assert.ok(tout.voitures.every(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y].every(Number.isFinite)));
  assert.ok(tout.poussieres.length <= Course.POUSSIERE_MAX * 1.5 && tout.billes.length <= Course.BILLES_MAX * 1.5);
});
