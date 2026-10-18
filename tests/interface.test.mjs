import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScene, F1, near, chemin } from './support.mjs';
import { page } from './page.mjs';

// Interface HTML du circuit (design/ : Design system, Tour de classement, HUD pilote, Onglets,
// Fenêtre d'aide). Les données affichées correspondent à l'état de la course ; l'interface ne
// modifie jamais une position ni une vitesse ; ancrages de 1280 × 720 à 1920 × 1080.

const scene = loadScene(F1, `({ Vehicle, Circuit, Course, VoitureF1, VoiturePilote, TourClassement, HudCourse, BandeauEvenements,
  OngletTelemetrie, OngletPrediction, OngletHistorique, PanneauLateral, FenetreAide, BarreHaut, InterfaceF1, Prediction,
  HistoriquePositions, Telemetrie, DomF1 })`);
const { Vehicle, Circuit, Course, VoitureF1, VoiturePilote, TourClassement, HudCourse, BandeauEvenements, OngletTelemetrie,
  OngletPrediction, OngletHistorique, PanneauLateral, FenetreAide, BarreHaut, InterfaceF1, Prediction, HistoriquePositions, Telemetrie, DomF1 } = scene;
const read = nom => readFileSync(chemin(nom), 'utf8');
const FICHIERS_UI = ['domF1.js', 'barreHaut.js', 'tourClassement.js', 'hudCourse.js', 'bandeauEvenements.js', 'ongletTelemetrie.js',
  'ongletPrediction.js', 'ongletHistorique.js', 'panneauLateral.js', 'fenetreAide.js', 'interfaceF1.js'];

function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages }, Circuit.generateur(1999));
}
function jusqua(c, condition, limite = 60 * 400) {
  for (let i = 0; i < limite; i++) {
    if (condition(c)) return i;
    c.pas();
  }
  return assert.fail('condition jamais atteinte');
}
const enCourse = c => jusqua(c, x => x.etat === Course.ETATS.COURSE);

test('classes de l\'interface : aucune n\'étend Vehicle ; aucune n\'écrit pos, vel ou acc, ni n\'applique de force', () => {
  for (const Classe of [TourClassement, HudCourse, BandeauEvenements, OngletTelemetrie, OngletPrediction, OngletHistorique, PanneauLateral, FenetreAide, BarreHaut, InterfaceF1]) {
    assert.ok(!(Classe.prototype instanceof Vehicle), Classe.name);
  }
  for (const f of FICHIERS_UI) {
    const code = read(f);
    assert.doesNotMatch(code, /\.(pos|vel|acc)\s*(=[^=]|\.(set|add|sub|mult|div)\()/, f);
    assert.doesNotMatch(code, /applyForce|extends\s+Vehicle/, f);
  }
  // la garde attrape bien une écriture
  assert.match('voiture.pos = p', /\.(pos|vel|acc)\s*(=[^=]|\.(set|add|sub|mult|div)\()/);
});

test('tour de classement : l\'ordre, les positions, les écarts (3 décimales) et le leader suivent le chronométrage', () => {
  const c = course({ nombreVoitures: 8, nombreTours: 3 });
  enCourse(c);
  for (let i = 0; i < 60 * 20; i++) c.pas();
  const lignes = TourClassement.lignes(c, 'leader');
  const ordre = c.classement();
  assert.deepEqual(lignes.map(l => l.voiture), ordre);
  assert.deepEqual(lignes.map(l => l.position), ordre.map((_, k) => String(k + 1)));
  assert.deepEqual(lignes.map(l => l.code), ordre.map(v => v.pilote.code));
  assert.equal(lignes[0].ecart, `Tour ${TourClassement.tourEnCours(c)}`);
  const ecarts = c.ecarts('leader');
  lignes.slice(1).filter(l => l.statut === 'normal').forEach(l => {
    const e = ecarts.get(l.voiture);
    if (e.valeur !== null && e.tours === 0) assert.equal(l.ecart, `+${e.valeur.toFixed(3)}`);
  });
  // intervalle : la voiture devant
  const inter = TourClassement.lignes(c, 'intervalle');
  const intervalles = c.ecarts('intervalle');
  inter.slice(1).filter(l => l.statut === 'normal').forEach(l => {
    const e = intervalles.get(l.voiture);
    if (e.valeur !== null && e.tours === 0) assert.equal(l.ecart, `+${e.valeur.toFixed(3)}`);
  });
  // meilleur tour : une seule ligne, celle du chronométrage
  const meilleur = c.chronometrage.meilleurTour?.voiture ?? null;
  assert.equal(lignes.filter(l => l.meilleur).length, meilleur === null ? 0 : 1);
  if (meilleur) assert.ok(lignes.find(l => l.meilleur).voiture === meilleur);
  // pneu : la lettre du type monté
  lignes.forEach(l => assert.equal(l.pneu, DomF1.lettrePneu(l.voiture.typePneus)));
});

test('tour de classement : PIT au stand, abandon en bas (« — », ABD), voiture choisie marquée', () => {
  const c = course({ nombreVoitures: 6, nombreTours: 3 });
  enCourse(c);
  for (let i = 0; i < 60 * 5; i++) c.pas();
  const victime = c.classement()[1];
  c.provoquerAccident(victime.pos.x, victime.pos.y, 'test', victime);
  const auStand = c.classement().find(v => v !== victime);
  auStand.demanderStand();
  jusqua(c, () => auStand.auStand && auStand.phaseStand !== VoitureF1.PHASES_STAND.SORTIE);
  const lignes = TourClassement.lignes(c, 'leader', auStand);
  const derniere = lignes[lignes.length - 1];
  assert.equal(derniere.voiture, victime);
  assert.deepEqual([derniere.position, derniere.ecart, derniere.statut], ['—', 'ABD', 'abandon']);
  const pit = lignes.find(l => l.voiture === auStand);
  assert.deepEqual(Array.from([pit.ecart, pit.statut, pit.choisie]), ['PIT', 'stand', true]);
  // les positions des voitures classées restent 1..n-1 sans trou
  assert.deepEqual(Array.from(lignes.filter(l => l.statut !== "abandon"), l => Number(l.position)), [1, 2, 3, 4, 5]);
});

test('HUD : vitesse, rapport, position, DRS (indisponible / disponible / actif) et alerte pneus', () => {
  const c = course({ nombreVoitures: 4, modePilote: true });
  c.choisirJoueur(2);
  enCourse(c);
  for (let i = 0; i < 120; i++) c.pas();
  const j = c.joueur;
  const d = HudCourse.donnees(c, j, { accelerateur: 0.64, frein: 0 });
  assert.equal(d.kmh, Math.round(j.vitesse * VoiturePilote.KMH));
  assert.equal(d.rapport, j.rapport);
  assert.equal(d.position, c.classement().indexOf(j) + 1);
  assert.equal(d.total, 4);
  assert.deepEqual([d.gaz, d.frein], [64, 0]);
  assert.equal(HudCourse.voitureMontree(c), j);
  j.drsDisponible = false;
  j.drsActif = false;
  assert.equal(HudCourse.drs(j).etat, 'indisponible');
  j.drsDisponible = true;
  assert.equal(HudCourse.drs(j).etat, 'disponible');
  j.drsActif = true;
  assert.equal(HudCourse.drs(j).etat, 'actif');
  // alerte : usure au-delà de 70 %, ou température au-delà du haut de la fenêtre + 15 °C (bords exclus)
  const seuil = HudCourse.temperatureAlerte(j);
  assert.equal(seuil, 110 + 15);                                  // slicks : fenêtre 85-110 °C
  j.pneus = 0.3;
  j.temperaturePneus = seuil;
  assert.equal(HudCourse.donnees(c, j).alerte, false);
  j.pneus = 0.29;
  assert.equal(HudCourse.donnees(c, j).alerte, true);
  j.pneus = 0.9;
  j.temperaturePneus = seuil + 1;
  assert.equal(HudCourse.donnees(c, j).alerte, true);
  // devant / derrière : les voitures voisines du classement
  const ordre = c.classement();
  const rang = ordre.indexOf(j);
  assert.equal(HudCourse.donnees(c, j).devant?.voiture ?? null, ordre[rang - 1] ?? null);
  assert.equal(HudCourse.donnees(c, j).derriere?.voiture ?? null, ordre[rang + 1] ?? null);
});

test('bandeau : un type par message (PIT, RADIO, SC, ACCIDENT...), le code du pilote, un message à la fois pendant 4 s', () => {
  const m = BandeauEvenements.message({ texte: '#7 MIR : pneus usés, il rentrera (Dur)' });
  assert.deepEqual({ ...m }, { type: 'pit', qui: 'MIR', texte: 'pneus usés, il rentrera (Dur)' });
  assert.equal(BandeauEvenements.typeDe('Safety car en piste'), 'sc');
  assert.equal(BandeauEvenements.typeDe('ACCIDENT : #5 VAR, contact avec le mur'), 'accident');
  assert.equal(BandeauEvenements.typeDe('Virtual safety car (VSC)'), 'vsc');
  assert.equal(BandeauEvenements.typeDe('Drapeau jaune : #5 VAR accidentée'), 'jaune');
  assert.equal(BandeauEvenements.typeDe('Extinction des feux : départ !'), 'depart');
  assert.equal(BandeauEvenements.message({ texte: 'Laisse passer', voiture: { pilote: { code: 'KAR' } } }, true).type, 'radio');
});

test('prédiction : softmax documenté — plus de « 9 % partout » au départ ; podium et top 5 par Plackett-Luce', () => {
  const c = course({ nombreVoitures: 12, nombreTours: 5 });
  const p = Prediction.probabilites(c);
  const valeurs = c.voitures.map(v => p.get(v));
  near(valeurs.reduce((s, x) => s + x, 0), 1, 1e-9);
  // la grille compte : le poleman a bien plus que 1/12, et nettement plus que le dernier
  assert.ok(valeurs[0] > 2 / 12, `P1 = ${valeurs[0]}`);
  assert.ok(valeurs[0] > 5 * valeurs[11]);
  for (let k = 1; k < 12; k++) assert.ok(valeurs[k] < valeurs[k - 1]);
  // température : décroît quand il reste moins de tours
  assert.ok(Prediction.temperature(0) < Prediction.temperature(4));
  near(Prediction.temperature(3), Prediction.T_BASE + Prediction.T_RACINE * 2, 1e-12);
  // top k : chaque probabilité entre 0 et 1, leur somme vaut k ; P(top 3) ≥ P(victoire)
  const top3 = Prediction.probabilitesTop(c, 3);
  near([...top3.values()].reduce((s, x) => s + x, 0), 3, 1e-9);
  c.voitures.forEach(v => assert.ok(top3.get(v) >= p.get(v) - 0.02 && top3.get(v) <= 1));
  // reproductible (graine fixe)
  assert.deepEqual([...Prediction.probabilitesTop(c, 3).values()], [...top3.values()]);
  // k au moins le nombre de voitures : toutes à 1
  assert.ok([...Prediction.probabilitesTop(c, 12).values()].every(x => x === 1));
});

test('historique : positions par tour d\'après les passages du chronométrage ; faits marquants', () => {
  const c = course({ nombreVoitures: 6, nombreTours: 2 });
  enCourse(c);
  jusqua(c, x => x.chronometrage.vainqueur !== null, 60 * 200);
  for (let i = 0; i < 60 * 30 && !c.terminee; i++) c.pas();
  const { tours, positions } = HistoriquePositions.parTour(c);
  assert.equal(tours, 2);
  // grille : l'ordre de départ
  c.voitures.forEach((v, k) => assert.equal(positions.get(v)[0], k + 1));
  // chaque tour : une permutation des positions, dans l'ordre des temps de passage
  for (let t = 1; t <= tours; t++) {
    const colonne = c.voitures.map(v => positions.get(v)[t]).filter(x => x !== undefined).sort((a, b) => a - b);
    assert.deepEqual(colonne, colonne.map((_, k) => k + 1));
  }
  // au dernier tour, l'ordre est celui de l'arrivée
  const arrivee = c.classement().filter(v => positions.get(v)[2] !== undefined);
  arrivee.forEach((v, k) => assert.equal(positions.get(v)[2], k + 1));
  const faits = HistoriquePositions.faitsMarquants(c);
  faits.forEach(f => assert.ok(f.tour >= 1 && f.tour <= tours && /^[A-Z]{3}$/.test(f.code)));
  for (let k = 1; k < faits.length; k++) assert.ok(faits[k - 1].tour >= faits[k].tour);
});

test('télémétrie (onglet) : axe du temps sur 30 s (x de 36 à 276) ; valeurs bornées ; fenêtre de 30 s', () => {
  assert.equal(Telemetrie.DUREE, 30);
  near(OngletTelemetrie.x(100, 100), 276);
  near(OngletTelemetrie.x(70, 100), 36);
  near(OngletTelemetrie.x(85, 100), 156);
  near(OngletTelemetrie.y(340, 80, 340), 11);
  near(OngletTelemetrie.y(80, 80, 340), 141);
  near(OngletTelemetrie.y(1000, 80, 340), 11);                     // borné
  const vitesse = OngletTelemetrie.GRAPHES[0];
  const chemin = OngletTelemetrie.chemin([{ t: 70, vitesse: 2 }, { t: 100, vitesse: 4 }], vitesse, 80, 340, 100);
  assert.match(chemin, /^M36\.0 \d+\.\dL276\.0 \d+\.\d$/);
  // gaz / frein : le frein compte en négatif
  const commandes = OngletTelemetrie.GRAPHES[1];
  assert.equal(commandes.valeur({ accelerateur: 0.5, frein: 0 }), 50);
  assert.equal(commandes.valeur({ accelerateur: 0, frein: 0.8 }), -80);
});

test('panneau : recherche sans casse ni accents ; ancrages de 1280 × 720 à 1920 × 1080 sans chevauchement', () => {
  assert.ok(PanneauLateral.correspond('Écart à garder', 'ecart'));
  assert.ok(PanneauLateral.correspond('Usure des pneus', 'PNEU'));
  assert.ok(!PanneauLateral.correspond('Poids', 'freinage'));
  assert.ok(PanneauLateral.correspond('Poids', ''));
  for (const [w, h] of [[1280, 720], [1440, 900], [1600, 900], [1920, 1080]]) {
    const t = InterfaceF1.TAILLES[InterfaceF1.taille(w)];
    for (const panneauOuvert of [false, true]) {
      const z = InterfaceF1.zoneScene(w, h, { panneauOuvert });
      assert.ok(z.x >= 12 + t.tour + 12, `${w} : tour`);
      assert.ok(z.y >= 12 + 40 + 12, `${w} : barre`);
      assert.ok(z.y + z.hauteur <= h - 12 - 36, `${w} : bandeau`);
      if (panneauOuvert) assert.ok(z.x + z.largeur <= w - 12 - t.panneau, `${w} : panneau`);
      assert.ok(z.largeur > 0.4 * w && z.hauteur > 0.6 * h, `${w} : zone trop petite`);
    }
  }
  assert.equal(InterfaceF1.taille(1599), 'M');
  assert.equal(InterfaceF1.taille(1600), 'L');
});

// Le circuit dans la page, avec son interface.
function circuitDansLaPage(options = {}) {
  const p = page(options).demarrer();
  p.choisir('f1');
  p.draw();
  return p;
}
const jusquEnCourse = p => { for (let i = 0; i < 1200 && p.evaluate('formule1.course.etat') !== 'COURSE'; i++) p.draw(); };

test('dans la page : le canvas prend toute la fenêtre ; la barre du haut a le bouton « Entraînement IA » (plus de menu Scénario)', () => {
  const p = circuitDansLaPage();
  assert.deepEqual([p.context.width, p.context.height], [1200, 800]);
  assert.equal(p.element('f1-ui').hidden, false);
  assert.doesNotMatch(read('index.html'), /id="f1-scenario"|id="controles"|id="scenario"/);
  assert.match(read('index.html'), /<button id="f1-bouton-entrainement"[^>]*>/);
  assert.equal(p.evaluate('scenario.id'), 'f1');
});

test('dans la page : la tour reflète la course ; clic sur une ligne = choisir ; boutons écart / intervalle ; l\'interface ne bouge rien', () => {
  const p = circuitDansLaPage();
  jusquEnCourse(p);
  for (let i = 0; i < 600; i++) p.draw();
  p.evaluate('interfaceF1.forcer()');
  const codes = () => p.element('f1-tour-lignes').children.map(l => l.children[3].children[0].textContent);
  assert.deepEqual(codes(), JSON.parse(p.evaluate('JSON.stringify(formule1.course.classement().map(v => v.pilote.code))')));
  assert.equal(p.element('f1-tour-numero').textContent, String(p.evaluate('TourClassement.tourEnCours(formule1.course)')));
  assert.equal(p.element('f1-tour-temps').textContent, p.evaluate('Chronometrage.formater(formule1.course.chronometrage.tempsCourse)'));
  // clic sur la 3e ligne : cette voiture est choisie, sa ligne marquée, le HUD apparaît pour elle
  const ligne = p.element('f1-tour-lignes').children[2];
  ligne.fire('click');
  assert.equal(p.evaluate('formule1.course.selection === formule1.course.classement()[2]'), true);
  p.evaluate('interfaceF1.forcer()');
  assert.ok(ligne.classList.contains('choisie'));
  assert.equal(p.element('f1-hud').hidden, false);
  assert.equal(p.element('f1-hud-position').textContent, `P${p.evaluate('formule1.course.classement().indexOf(formule1.course.selection) + 1')}`);
  assert.equal(p.element('f1-hud-vitesse').textContent, String(p.evaluate('Math.round(formule1.course.selection.vitesse * 60)')));
  // intervalle
  p.element('f1-ecart-intervalle').fire('click');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.affichage.ecarts'), 'intervalle');
  assert.equal(p.element('f1-tour-colonne').textContent, 'Interv.');
  assert.ok(p.element('f1-ecart-intervalle').classList.contains('on'));
  // l'interface ne modifie ni position ni vitesse : course en pause, 50 mises à jour forcées
  p.evaluate('formule1.course.basculerPause()');
  const etat = () => p.evaluate('JSON.stringify(formule1.course.voitures.map(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y]))');
  const avant = etat();
  for (let i = 0; i < 50; i++) p.evaluate('interfaceF1.forcer()');
  for (const o of ['1', '2', '3', '4']) {
    p.touche(o);
    p.evaluate('interfaceF1.forcer()');
  }
  assert.equal(etat(), avant);
});

test('dans la page : onglets (touches 1 à 4, rail), aide (? h Échap), g, c, [ ] ; en pilotage, WASD conduisent toujours', () => {
  const p = circuitDansLaPage();
  jusquEnCourse(p);
  // panneau ouvert au départ sur Réglages ; touche 1 : Télémétrie
  assert.equal(p.element('f1-contenu').hidden, false);
  assert.equal(p.element('f1-page-reglages').hidden, false);
  p.touche('1');
  assert.equal(p.element('f1-page-telemetrie').hidden, false);
  assert.equal(p.element('f1-page-reglages').hidden, true);
  assert.equal(p.element('f1-onglet-telemetrie').getAttribute('aria-selected'), 'true');
  // fermé : le rail apparaît ; un bouton du rail rouvre sur son onglet
  p.touche('s');
  assert.equal(p.element('f1-rail').hidden, false);
  p.element('f1-rail-prediction').fire('click');
  assert.equal(p.element('f1-contenu').hidden, false);
  assert.equal(p.element('f1-page-prediction').hidden, false);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-pred-lignes').children.length, p.evaluate('formule1.course.voitures.length'));
  p.touche('3');
  p.evaluate('interfaceF1.forcer()');
  assert.ok(p.element('f1-histo-svg').children.length > 0);
  // aide
  p.touche('?');
  assert.equal(p.element('f1-aide').hidden, false);
  assert.equal(p.element('f1-aide-groupes').children.length, 4);
  p.touche('Escape');
  assert.equal(p.element('f1-aide').hidden, true);
  assert.equal(p.evaluate('formule1.course.pause'), false);       // Échap a fermé l'aide, pas mis en pause
  p.touche('h');
  assert.equal(p.element('f1-aide').hidden, false);
  p.touche('h');
  assert.equal(p.element('f1-aide').hidden, true);
  // g : écart / intervalle ; c : caméra suivante (le menu suit) ; ] : voiture suivante
  p.touche('g');
  assert.equal(p.evaluate('formule1.affichage.ecarts'), 'intervalle');
  p.touche('c');
  assert.equal(p.evaluate('formule1.camera.mode'), 'suivi');
  assert.equal(p.element('f1-camera').value, 'suivi');
  p.touche(']');
  assert.equal(p.evaluate('formule1.course.selection === formule1.course.classement()[1]'), true);
  // pilotage : h ouvre l'aide, mais W accélère toujours et 1 choisit des pneus (pas un onglet)
  const q = page().demarrer();
  q.choisir('f1');
  q.element('f1-mode-pilote').checked = true;
  q.element('f1-mode-pilote').fire('change');
  q.draw();
  q.evaluate('formule1.course.choisirJoueur(0)');
  jusquEnCourse(q);
  q.touche('h');
  assert.equal(q.element('f1-aide').hidden, false);
  q.touche('h');
  q.touche('w');
  q.draw();
  assert.equal(q.evaluate('formule1.course.joueur.commandes.haut'), true);
  q.touche('1');
  assert.equal(q.evaluate('formule1.course.joueur.pneuChoisi'), 'TENDRE');
  assert.equal(q.element('f1-page-reglages').hidden, false);
  q.touche('b');
  assert.equal(q.evaluate('formule1.course.joueur.demandeStand'), true);
});

test('dans la page : Réinitialiser remet chaque curseur à sa valeur de départ (et la course la reçoit)', () => {
  const p = circuitDansLaPage();
  p.glisser('f1-poids-seek', 2.5);
  p.glisser('f1-vitesse-max', 7);
  assert.equal(p.evaluate('parametresF1.poidsSeek'), 2.5);
  p.element('f1-reinitialiser').fire('click');
  assert.equal(p.evaluate('parametresF1.poidsSeek'), p.evaluate('ReglagesF1.PLAGES.poidsSeek.initial'));
  assert.equal(p.evaluate('parametresF1.vitesseMax'), p.evaluate('ReglagesF1.PLAGES.vitesseMax.initial'));
  assert.equal(p.element('f1-poids-seek').value, String(p.evaluate('ReglagesF1.PLAGES.poidsSeek.initial')));
  // remplissage rouge du curseur (variable --v)
  assert.match(p.element('f1-vitesse-max').style['--v'], /^\d+(\.\d)?%$/);
});

test('dans la page : le bandeau montre les vrais événements, un à la fois, puis s\'efface', () => {
  const p = circuitDansLaPage();
  jusquEnCourse(p);
  p.draw();
  assert.ok(p.element('f1-evenement').classList.contains('visible'));
  assert.match(p.element('f1-ev-texte').textContent + p.element('f1-ev-type').textContent, /feux|départ|COURSE|INFO/i);
  // plus rien de nouveau : après 4 s × la file, il s'efface
  p.evaluate('formule1.course.evenements.length = 0');
  for (let i = 0; i < 60 * 17; i++) p.evaluate('interfaceF1.bandeau.mettreAJour(formule1.course, 1 / 60)');
  assert.equal(p.element('f1-evenement').classList.contains('visible'), false);
});

test('tour : un dépassement ne déplace qu\'une ligne (pas les 12) ; le texte du bouton Pause n\'est réécrit que s\'il change', () => {
  const p = circuitDansLaPage();
  jusquEnCourse(p);
  p.draw(30);
  p.evaluate('interfaceF1.forcer()');
  const lignes = p.element('f1-tour-lignes');
  let deplacements = 0;
  const inserer = lignes.insertBefore.bind(lignes);
  lignes.insertBefore = (enfant, reference) => { deplacements++; return inserer(enfant, reference); };
  const codes = () => lignes.children.map(l => l.children[3].children[0].textContent);
  // les 4e et 5e échangent leur place
  p.evaluate('(() => { const c = formule1.course; const o = c.classement(); [o[3], o[4]] = [o[4], o[3]]; globalThis.__ordre = o; c.classement = () => globalThis.__ordre.slice(); })()');
  p.evaluate('interfaceF1.tour.mettreAJour(formule1.course)');
  assert.equal(deplacements, 1);
  assert.deepEqual(codes(), JSON.parse(p.evaluate('JSON.stringify(globalThis.__ordre.map(v => v.pilote.code))')));
  // le dernier passe en tête : une ligne déplacée
  deplacements = 0;
  p.evaluate('globalThis.__ordre.unshift(globalThis.__ordre.pop())');
  p.evaluate('interfaceF1.tour.mettreAJour(formule1.course)');
  assert.equal(deplacements, 1);
  assert.deepEqual(codes(), JSON.parse(p.evaluate('JSON.stringify(globalThis.__ordre.map(v => v.pilote.code))')));
  // même ordre : rien ne bouge
  deplacements = 0;
  p.evaluate('interfaceF1.tour.mettreAJour(formule1.course)');
  assert.equal(deplacements, 0);
  // bouton Pause : pas de réécriture d'un texte identique
  const pause = p.element('f1-pause');
  let ecritures = 0;
  let texte = pause.textContent;
  Object.defineProperty(pause, 'textContent', { get: () => texte, set: v => { ecritures++; texte = v; } });
  p.draw(10);
  assert.equal(texte, 'Pause');
  assert.equal(ecritures, 0);
  p.evaluate('formule1.course.basculerPause()');
  p.draw(5);
  assert.equal(texte, 'Reprendre');
  assert.equal(ecritures, 1);
});
