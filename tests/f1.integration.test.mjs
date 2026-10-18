import test from 'node:test';
import assert from 'node:assert/strict';
import { page } from './page.mjs';

// Test d'intégration du jeu « Circuit Formule 1 » : les vrais scripts de index.html et le
// vrai sketch.js, avec des substituts de p5 et du DOM. Il vérifie le câblage : panneau
// (curseurs, cases, menus, boutons), touches p, s et d, clic sur une voiture. Le rendu réel se
// valide dans un navigateur.

const demarrerF1 = () => {
  const p = page().demarrer();
  p.choisir('f1');
  return p;
};
const etatCourse = p => p.evaluate('formule1.course.etat');
// Les graphiques du décor (de la taille du monde) et leurs copies : pas ceux des sprites de voitures.
// Le décor : les grands graphiques (taille du monde), sauf les calques des traces de pneus.
const calquesDesTraces = p => new Set(p.evaluate('[...Course.tracesParCircuit.values()].map(t => t.calque)'));
const graphiquesDuDecor = p => { const traces = calquesDesTraces(p); return p.decor.crees.filter(g => g.largeur >= 1000 && !traces.has(g)); };
const copiesDuDecor = p => { const traces = calquesDesTraces(p); return p.calls.filter(c => c[0] === 'image' && c[1] && c[1].largeur >= 1000 && !traces.has(c[1])); };
// Images jusqu'au départ (présentation 2,5 s, cinq feux, puis 0,5 à 3 s d'attente).
function jusquAuDepart(p) {
  for (let i = 0; i < 1200 && etatCourse(p) !== 'COURSE'; i++) p.draw();
  assert.equal(etatCourse(p), 'COURSE');
}

test('index.html : les scripts du circuit dans le bon ordre', () => {
  const { scripts } = page();
  const rang = nom => scripts.indexOf(nom);
  assert.equal(rang('circuit.js'), rang('grilleSpatiale.js') + 1);
  assert.ok(rang('particule.js') < rang('voitureF1.js'));        // VoitureF1 emprunte flee à Particule
  assert.ok(rang('voitureF1.js') < rang('safetyCar.js'));        // SafetyCar étend VoitureF1
  for (const mobile of ['voitureF1.js', 'safetyCar.js', 'fumee.js', 'drone.js']) {
    assert.ok(rang('vehicle.js') < rang(mobile) && rang(mobile) < rang('decorCircuit.js'), mobile);
  }
  assert.ok(rang('decorCircuit.js') < rang('classement.js') && rang('classement.js') < rang('course.js'));
  assert.ok(rang('course.js') < rang('reglagesF1.js') && rang('reglages.js') < rang('reglagesF1.js'));
  assert.ok(rang('reglagesF1.js') < rang('scenarios.js'));
  assert.equal(scripts.at(-1), 'sketch.js');
});

test('la course n\'est créée qu\'au premier affichage ; la créer ne tire pas random() de p5', () => {
  const p = page().demarrer();
  assert.equal(p.evaluate('formule1.demarre'), false);
  // le jeu F1 est le seul scénario : il est affiché dès l'ouverture
  assert.equal(p.evaluate('scenario.id'), 'f1');
  assert.equal(p.evaluate('scenario === formule1'), true);
  const tirages = p.tirages.nombre;
  assert.equal(p.evaluate('formule1.demarre'), false);
  // la course a son propre générateur à graine : la créer ne consomme rien de random()
  assert.equal(p.evaluate('formule1.course.etat'), 'PRESENTATION');
  assert.equal(p.tirages.nombre, tirages);
  // ensuite, seul wander (celui de vehicle.js : ici le drone) tire dans random()
  p.draw();
  assert.equal(p.evaluate('formule1.demarre'), true);
});

test('au démarrage : l\'interface F1 et son panneau sont visibles, pas d\'autre scénario ; Vehicle.debug reste éteint', () => {
  const p = demarrerF1();
  assert.equal(p.groupes.length, 0);                              // plus aucun contrôle data-scenario
  assert.equal(p.element('f1-ui').hidden, false);
  assert.equal(p.element('panneau-f1').hidden, false);
  assert.throws(() => p.choisir('encre'), { name: 'RangeError' });
  p.touche('d');
  assert.deepEqual([p.evaluate('debug'), p.evaluate('Vehicle.debug')], [true, false]);
});

test('une course entière dans la page : présentation, feux, course, arrivée ; état affiché dans la barre ; sans erreur', () => {
  const p = demarrerF1();
  p.glisser('f1-nombre-voitures', 6);
  p.glisser('f1-nombre-tours', 1);
  p.glisser('f1-vitesse-simulation', 4);
  const vus = new Set();
  for (let i = 0; i < 4000 && !p.evaluate('formule1.course.terminee'); i++) {
    p.draw();
    vus.add(etatCourse(p));
  }
  assert.equal(p.evaluate('formule1.course.terminee'), true);
  assert.deepEqual([...vus], ['PRESENTATION', 'FEUX', 'COURSE', 'ARRIVEE']);
  assert.match(p.element('etat-f1').textContent, /^ARRIVEE · tour 1\/1 · 6 voitures · SEC$/);
  assert.ok(p.evaluate('formule1.course.voitures.every(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y].every(Number.isFinite))'));
  // le décor : préparé une seule fois, puis seulement recopié à chaque image
  assert.equal(graphiquesDuDecor(p).length, 1);
  assert.ok(copiesDuDecor(p).length > 100);
});

test('curseurs du panneau : valeur affichée, appliquée à la course ; hors plage, refusée', () => {
  const p = demarrerF1();
  p.draw();
  p.glisser('f1-poids-seek', 1.5);
  p.glisser('f1-rayon-freinage', 220);
  p.glisser('f1-poids-wander', 0.6);
  p.glisser('f1-vitesse-max', 6.5);
  assert.deepEqual(Array.from(p.evaluate('[parametresF1.poidsSeek, parametresF1.rayonFreinage, parametresF1.poidsWander, parametresF1.vitesseMax]')),
    [1.5, 220, 0.6, 6.5]);
  assert.deepEqual(['f1-poids-seek', 'f1-rayon-freinage', 'f1-poids-wander', 'f1-vitesse-max'].map(id => p.element(`${id}-valeur`).textContent),
    ['1.5', '220 px', '0.60', '6.5']);
  // les voitures lisent les réglages partagés
  assert.equal(p.evaluate('formule1.course.voitures.every(v => v.parametres === parametresF1)'), true);
  p.glisser('f1-nombre-voitures', 50);
  p.glisser('f1-vitesse-max', 0);
  assert.equal(p.evaluate('formule1.course.voitures.length'), 12);
  assert.equal(p.evaluate('parametresF1.vitesseMax'), 6.5);
  assert.equal(p.element('f1-vitesse-max-valeur').textContent, '6.5');
  // chaque curseur du panneau existe dans la page, démarre sur sa constante
  const curseurs = p.evaluate('[...ReglagesF1.CURSEURS, ...ReglagesF1.CURSEURS_AFFICHAGE].map(([cle, id]) => [id, String(ReglagesF1.PLAGES[cle].initial)])');
  // chaque curseur f1-… de la page est lié à un réglage, et inversement
  const dansLaPage = Object.values(p.attributs).filter(a => a.type === 'range' && a.id.startsWith('f1-')).map(a => a.id).sort();
  assert.deepEqual(Array.from(curseurs, ([id]) => id).sort(), dansLaPage);
  assert.ok(curseurs.length >= 37);
  for (const [id, initial] of curseurs) {
    assert.ok(p.attributs[id], `${id} absent de index.html`);
    assert.equal(p.attributs[id].value, initial, id);
  }
  // curseur d'affichage (durée du cycle jour/nuit) : il change le dessin, pas les paramètres
  p.glisser('f1-duree-cycle', 60);
  assert.equal(p.evaluate('formule1.affichage.dureeCycle'), 60);
  assert.equal(p.element('f1-duree-cycle-valeur').textContent, '60 s');
  assert.equal(p.evaluate('Object.hasOwn(formule1.course.parametres, "dureeCycle")'), false);
  p.glisser('f1-duree-cycle', 5);
  assert.equal(p.evaluate('formule1.affichage.dureeCycle'), 60);
});

test('réglages avant la première image : gardés pour la course qui sera créée', () => {
  const p = page().demarrer();
  p.glisser('f1-nombre-voitures', 9);
  p.glisser('f1-poids-arrive', 2.5);
  p.choisir('f1');
  p.draw();
  assert.equal(p.evaluate('formule1.course.voitures.length'), 9);
  assert.equal(p.evaluate('formule1.course.parametres.poidsArrive'), 2.5);
});

test('nombre de voitures, profil, nouvelle course : une nouvelle course, sur le bon circuit', () => {
  const p = demarrerF1();
  jusquAuDepart(p);
  p.glisser('f1-nombre-voitures', 4);
  assert.deepEqual([etatCourse(p), p.evaluate('formule1.course.voitures.length')], ['PRESENTATION', 4]);
  const profil = p.element('f1-profil');
  assert.equal(profil.value, 'classique');
  profil.value = 'technique';
  profil.fire('change');
  assert.equal(p.evaluate('formule1.course.circuit.profil'), 'technique');
  assert.equal(profil.flous, 1);
  profil.value = 'inexistant';
  profil.fire('change');
  assert.equal(p.evaluate('formule1.course.circuit.profil'), 'technique');
  for (let i = 0; i < 400; i++) p.draw();
  p.element('f1-nouvelle-course').fire('click');
  assert.equal(etatCourse(p), 'PRESENTATION');
});

test('boutons Pause et Safety car, touche p', () => {
  const p = demarrerF1();
  jusquAuDepart(p);
  p.element('f1-safety-car').fire('click');
  p.draw();
  assert.equal(etatCourse(p), 'SAFETY_CAR');
  p.element('f1-pause').fire('click');
  p.draw();
  assert.equal(p.element('f1-pause').textContent, 'Reprendre');
  assert.match(p.element('etat-f1').textContent, /PAUSE$/);
  const chrono = p.evaluate('formule1.course.chrono');
  p.draw(30);
  assert.equal(p.evaluate('formule1.course.chrono'), chrono);
  p.touche('p');
  p.draw(30);
  assert.ok(p.evaluate('formule1.course.chrono') > chrono);
  assert.equal(p.element('f1-pause').textContent, 'Pause');
  p.touche('P');
  assert.equal(p.evaluate('formule1.course.pause'), true);
});

test('touche s et bouton : le panneau se replie et se déplie ; la caméra récupère la place', () => {
  const p = demarrerF1();
  p.draw();
  const zone = () => p.evaluate('formule1.camera.zone.largeur');
  const ouvert = zone();
  p.touche('s');
  assert.equal(p.element('f1-contenu').hidden, true);
  assert.equal(p.element('f1-replier').textContent, 'Panneau ◂');
  p.draw();
  assert.equal(zone(), ouvert + 300);
  p.element('f1-replier').fire('click');
  assert.equal(p.element('f1-contenu').hidden, false);
});

test('cases d\'affichage : elles ne changent que le dessin ; incidents : un réglage de course', () => {
  const p = demarrerF1();
  p.draw();
  const cocher = (id, valeur) => { p.element(id).checked = valeur; p.element(id).fire('change'); };
  for (const id of ['f1-decor', 'f1-classement', 'f1-gomme', 'f1-fumee', 'f1-ombres', 'f1-drone', 'f1-incidents']) {
    assert.equal(p.element(id).checked, true, id);
  }
  cocher('f1-decor', false);
  p.calls.length = 0;
  p.draw();
  assert.equal(copiesDuDecor(p).length, 0);
  cocher('f1-decor', true);
  cocher('f1-gomme', false);
  p.draw();
  assert.equal(graphiquesDuDecor(p).length, 2);                  // redessiné sans les traces
  cocher('f1-classement', false);
  p.calls.length = 0;
  p.draw();
  assert.ok(!p.calls.some(c => c[0] === 'text' && c[1] === 'Leader'));
  cocher('f1-incidents', false);
  assert.equal(p.evaluate('parametresF1.incidents'), false);
  assert.equal(p.evaluate('formule1.affichage.drone'), true);
  cocher('f1-drone', false);
  assert.equal(p.evaluate('formule1.affichage.drone'), false);
});

test('caméra : menu « suivre la voiture choisie » ; clic sur une voiture pour la choisir', () => {
  const p = demarrerF1();
  for (let i = 0; i < 60; i++) p.draw();
  // position à l'écran de la voiture 3, d'après la caméra
  const ecran = JSON.parse(p.evaluate(`(() => {
    const v = formule1.course.voitures[3];
    const c = formule1.camera;
    return JSON.stringify([(v.pos.x - c.x) * c.echelle + c.zone.x + c.zone.largeur / 2, (v.pos.y - c.y) * c.echelle + c.zone.y + c.zone.hauteur / 2]);
  })()`));
  p.clic(ecran[0], ecran[1]);
  assert.equal(p.evaluate('formule1.course.selection === formule1.course.voitures[3]'), true);
  const camera = p.element('f1-camera');
  camera.value = 'suivi';
  camera.fire('change');
  assert.equal(p.evaluate('formule1.camera.mode'), 'suivi');
  for (let i = 0; i < 240; i++) p.draw();
  const ecartCamera = p.evaluate('Math.hypot(formule1.camera.x - formule1.course.selection.pos.x, formule1.camera.y - formule1.course.selection.pos.y)');
  assert.ok(ecartCamera < 40, `${ecartCamera}`);
  // un clic dans le vide : plus de voiture choisie (la caméra suit alors le leader)
  p.clic(5, 5);
  assert.equal(p.evaluate('formule1.course.selection'), null);
});

// --- Course avancée, météo, mode pilote --------------------------------------------------------

test('index.html : les scripts des blocs IA avancée, pluie et pilote, avant ceux qui s\'en servent', () => {
  const { scripts } = page();
  const rang = nom => scripts.indexOf(nom);
  for (const nom of ['personnalites.js', 'pneus.js', 'voiturePilote.js', 'gerbeEau.js', 'debris.js', 'ecranFin.js', 'meteo.js',
    'strategie.js', 'hudPilote.js']) assert.ok(rang(nom) > 0, nom);
  assert.ok(rang('personnalites.js') < rang('voitureF1.js') && rang('pneus.js') < rang('voitureF1.js'));
  assert.ok(rang('voitureF1.js') < rang('voiturePilote.js'));    // VoiturePilote étend VoitureF1
  assert.ok(rang('fumee.js') < rang('gerbeEau.js'));             // GerbeEau étend Fumee
  assert.ok(rang('perturbation.js') < rang('debris.js'));
  assert.ok(rang('encre.js') < rang('ecranFin.js') && rang('particule.js') < rang('ecranFin.js'));
  for (const nom of ['voiturePilote.js', 'gerbeEau.js', 'debris.js', 'meteo.js', 'strategie.js', 'hudPilote.js', 'ecranFin.js']) {
    assert.ok(rang(nom) < rang('course.js'), nom);
  }
  assert.ok(rang('course.js') < rang('scenarios.js'));
});

test('panneau : IA avancée, météo, pneus et personnalités appliqués à la course ; valeur inconnue refusée', () => {
  const p = demarrerF1();
  p.draw();
  const cocher = (id, valeur) => { p.element(id).checked = valeur; p.element(id).fire('change'); };
  const menu = (id, valeur) => { p.element(id).value = valeur; p.element(id).fire('change'); };
  assert.equal(p.evaluate('parametresF1.iaAvancee'), true);
  cocher('f1-ia-avancee', false);
  assert.equal(p.evaluate('formule1.course.voitures.every(v => !v.iaAvancee)'), true);
  cocher('f1-ia-avancee', true);
  // météo : mode, puis intensité (curseur actif pendant le glissement)
  assert.equal(p.evaluate('formule1.course.meteo.mode'), 'sec');
  menu('f1-mode-meteo', 'manuel');
  p.glisser('f1-intensite-pluie', 0.9);
  assert.equal(p.evaluate('formule1.course.meteo.mode'), 'manuel');
  assert.equal(p.evaluate('formule1.course.meteo.cibleDuMode()'), 0.9);
  assert.equal(p.element('f1-intensite-pluie-valeur').textContent, '0.90');
  menu('f1-mode-meteo', 'tempete');
  assert.equal(p.evaluate('parametresF1.modeMeteo'), 'manuel');
  // pneus de départ : une nouvelle course, chaussée de ces pneus
  menu('f1-pneus-depart', 'PLUIE');
  assert.equal(etatCourse(p), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.course.voitures.every(v => v.typePneus === "PLUIE")'), true);
  // personnalités de toute la grille
  menu('f1-personnalites', 'prudent');
  assert.equal(p.evaluate('formule1.course.voitures.every(v => v.personnalite === "prudent")'), true);
  // profil de la voiture choisie
  p.evaluate('formule1.course.selection = formule1.course.voitures[2]');
  menu('f1-profil-voiture', 'agressif');
  assert.equal(p.evaluate('formule1.course.voitures[2].personnalite'), 'agressif');
  assert.equal(p.evaluate('formule1.course.voitures[1].personnalite'), 'prudent');
  // sous la pluie, une course tourne sans erreur et dessine pluie et gerbes
  for (let i = 0; i < 900; i++) p.draw();
  assert.ok(p.evaluate('formule1.course.meteo.humidite') > 0.5);
  assert.ok(p.evaluate('formule1.course.gerbes.length') > 0);
});

test('case Debug : même effet que la touche d, les deux restent d\'accord ; Vehicle.debug reste éteint', () => {
  const p = demarrerF1();
  const caseDebug = p.element('f1-debug');
  assert.equal(caseDebug.checked, false);
  caseDebug.checked = true;
  caseDebug.fire('change');
  assert.deepEqual([p.evaluate('debug'), p.evaluate('Vehicle.debug')], [true, false]);
  p.touche('d');
  assert.deepEqual([p.evaluate('debug'), caseDebug.checked], [false, false]);
  p.touche('d');
  assert.equal(caseDebug.checked, true);
});

// Mode pilote : case cochée, voiture choisie (Tab).
function demarrerPilote() {
  const p = demarrerF1();
  p.draw();
  p.element('f1-mode-pilote').checked = true;
  p.element('f1-mode-pilote').fire('change');
  p.touche('Tab');
  assert.equal(p.evaluate('formule1.course.joueur !== null'), true);
  return p;
}
const relacher = (p, key) => { p.context.key = key; p.evaluate('keyReleased()'); };
const commandes = p => JSON.parse(p.evaluate('JSON.stringify(formule1.course.joueur.commandes)'));

test('mode pilote : la course attend le choix ; Tab choisit une voiture ; le bouton « autre voiture » revient au choix', () => {
  const p = demarrerF1();
  p.draw();
  p.element('f1-mode-pilote').checked = true;
  p.element('f1-mode-pilote').fire('change');
  for (let i = 0; i < 300; i++) p.draw();
  assert.equal(etatCourse(p), 'PRESENTATION');
  p.touche('Tab');
  assert.equal(p.evaluate('formule1.course.joueur instanceof VoiturePilote'), true);
  assert.equal(p.evaluate('formule1.course.voitures.indexOf(formule1.course.joueur)'), 0);
  p.touche('Tab');
  assert.equal(p.evaluate('formule1.course.voitures.indexOf(formule1.course.joueur)'), 1);
  p.element('f1-choisir-voiture').fire('click');
  assert.equal(p.evaluate('formule1.course.joueur'), null);
});

test('touches de conduite : W A S D et flèches (clavier QWERTY), pas Z ni Q ; relâcher arrête la commande', () => {
  const p = demarrerPilote();
  jusquAuDepart(p);
  for (const [touche, commande] of [['w', 'haut'], ['W', 'haut'], ['ArrowUp', 'haut'], ['s', 'bas'], ['ArrowDown', 'bas'],
    ['a', 'gauche'], ['ArrowLeft', 'gauche'], ['d', 'droite'], ['ArrowRight', 'droite'], [' ', 'drs']]) {
    p.touche(touche);
    p.draw();
    assert.equal(commandes(p)[commande], true, touche);
    relacher(p, touche);
    p.draw();
    assert.equal(commandes(p)[commande], false, touche);
  }
  // Z et Q (AZERTY) ne conduisent pas
  for (const touche of ['z', 'q']) {
    p.touche(touche);
    p.draw();
    assert.ok(Object.values(commandes(p)).every(v => v === false), touche);
  }
  // en pilotage, d tourne à droite : le debug ne bascule pas ; s freine : le panneau reste ouvert
  assert.equal(p.evaluate('debug'), false);
  const replie = p.element('f1-replier').textContent;
  p.touche('s');
  p.draw();
  assert.equal(p.element('f1-replier').textContent, replie);
  relacher(p, 's');
});

// (règle d'origine, jusqu'au 17 octobre 2026 : en pilotage, P demandait l'arrêt au stand, B aussi.
// Depuis, P est la pause comme en spectateur, et l'arrêt au stand est B ; voir modeJeu.test.mjs)
test('touches B (stand, avec les pneus 1 à 5), P et Échap (pause) ; Entrée relance après la fin', () => {
  const p = demarrerPilote();
  jusquAuDepart(p);
  p.touche('4');
  p.touche('b');
  assert.deepEqual(JSON.parse(p.evaluate('JSON.stringify([formule1.course.joueur.demandeStand, formule1.course.joueur.pneuDemande])')),
    [true, 'INTER']);
  p.touche('Escape');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  p.touche('Escape');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  p.touche('p');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  p.touche('p');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  // fin de partie (tous arrivés ; un accident ne la finit plus) : les touches redeviennent des
  // raccourcis, Entrée relance
  p.evaluate('formule1.course.finirLaPartie()');
  p.draw(2);
  assert.equal(etatCourse(p), 'FIN');
  assert.equal(p.evaluate('formule1.pilotage()'), false);
  p.touche('Enter');
  assert.equal(etatCourse(p), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.ecranFin'), null);
});

test('écran de fin : le mot REJOUER se forme ; un clic dessus relance une course', () => {
  // l'écran REJOUER vient à la fin d'un défi (ou d'une partie à deux) ; le mot est dans le repère
  // de l'écran
  const p = demarrerF1();
  p.draw();
  p.evaluate("formule1.choisirMode('defi')");
  jusquAuDepart(p);
  p.evaluate('formule1.course.finirLaPartie()');
  p.draw();
  for (let i = 0; i < 60 * 20 && !p.evaluate('formule1.ecranFin.forme'); i++) p.draw();
  assert.equal(p.evaluate('formule1.ecranFin.forme'), true);
  const ecran = JSON.parse(p.evaluate('(() => { const z = formule1.ecranFin.zone; return JSON.stringify([z.x + z.largeur / 2, z.y + z.hauteur / 2]); })()'));
  p.clic(ecran[0], ecran[1]);
  assert.equal(etatCourse(p), 'PRESENTATION');
});

// --- Chronométrage ---------------------------------------------------------------------------------

test('chronométrage dans la page : script avant course.js ; chrono à 0 avant les feux ; bouton leader / intervalle', () => {
  const { scripts } = page();
  const rang = nom => scripts.indexOf(nom);
  assert.ok(rang('circuit.js') < rang('chronometrage.js') && rang('chronometrage.js') < rang('course.js'));
  assert.ok(rang('chronometrage.js') < rang('classement.js') && rang('chronometrage.js') < rang('hudPilote.js'));
  const p = demarrerF1();
  p.draw();
  // la tour de classement est dans la page (interface HTML, design/ « Tour de classement ») :
  // temps de course dans l'en-tête, écarts en chasse fixe à 3 décimales
  const ecarts = () => p.element('f1-tour-lignes').children.map(ligne => ligne.children[4].children[0].textContent);
  const textes = () => [p.element('f1-tour-temps').textContent, ...ecarts()];
  p.draw();
  assert.equal(p.element('f1-tour-temps').textContent, '0:00.000', 'chrono à zéro pendant la présentation');
  assert.equal(p.element('f1-tour-colonne').textContent, 'Leader');
  jusquAuDepart(p);
  for (let i = 0; i < 60 * 25; i++) p.draw();
  const temps = p.evaluate('formule1.course.tempsCourse');
  assert.ok(temps > 20 && temps < 30, `${temps}`);
  for (let i = 0; i < 6; i++) p.draw();
  assert.ok(textes().some(t => /^\+\d+\.\d{3}$/.test(t)), 'écarts au leader, 3 décimales');
  assert.ok(textes().some(t => /^\d+:\d\d\.\d{3}$/.test(t) && t !== '0:00.000'), 'temps de course et derniers tours');
  // le bouton bascule l'écart au leader et l'intervalle (affichage seulement)
  const bouton = p.element('f1-ecarts');
  assert.equal(bouton.textContent, 'Écarts : leader');
  bouton.fire('click');
  assert.equal(p.evaluate('formule1.affichage.ecarts'), 'intervalle');
  assert.equal(bouton.textContent, 'Écarts : intervalle');
  assert.equal(p.evaluate('formule1.course.affichage.ecarts'), 'intervalle');
  p.draw();
  bouton.fire('click');
  assert.equal(p.evaluate('formule1.affichage.ecarts'), 'leader');
  // pause : le temps de course ne bouge pas
  p.touche('p');
  const fige = p.evaluate('formule1.course.tempsCourse');
  p.draw(30);
  assert.equal(p.evaluate('formule1.course.tempsCourse'), fige);
});
