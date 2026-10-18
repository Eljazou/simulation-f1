import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScene, F1, chemin } from './support.mjs';
import { page } from './page.mjs';

// Mode jeu (17 octobre 2026) :
//   1. pause : P et Échap (et le bouton de la barre) ; la simulation est figée (voitures, chronos,
//      feux, safety car, minuteries, particules) et repart au même instant ; overlay « PAUSE »
//      centré (Reprendre par défaut, Rejouer la course avec confirmation, Réglages, Menu ; ↑/↓,
//      Entrée, P/Échap = Reprendre) ; HUD et classement assombris derrière ; perte du focus en
//      jeu = pause automatique ;
//   2. bouton « JOUER » (rouge clair, en bas à droite) quand aucune partie n'est en cours ; menu
//      des modes (Solo, Deux joueurs, Championnat, Spectateur ; circuit, tours, ambiance ; Lancer,
//      Annuler) ; puis le choix du pilote au curseur, puis les feux ; une seule source de vérité
//      avec les réglages « Mode » et « Joueur » du panneau ;
//   3. feux : 5 rouges (1 s chacun), attente 0,5–3 s, puis les 5 colonnes au VERT 1 s (départ
//      exactement au passage au vert), puis fondu de 250 ms ;
//   4. caméra : en Solo et Championnat elle suit la voiture du joueur au départ de chaque course
//      (en voyant le virage suivant) ; deux joueurs : chaque moitié suit son joueur ; spectateur :
//      vue du circuit ; C et le bouton changent toujours de vue ;
//   5. F : plein écran dans tous les états (spectateur, course, pause, menus).

const scene = loadScene(F1, '({ Course, VoiturePilote, FeuxDepart, FenetreAide, EcranPartage, Circuit, MenuModes, MenuPause })');
const { Course, VoiturePilote, FeuxDepart, FenetreAide, EcranPartage, Circuit, MenuModes, MenuPause } = scene;

// --- outils de la page ---------------------------------------------------------------------
const jusqua = (p, condition, n = 3000) => { for (let i = 0; i < n && !p.evaluate(condition); i++) p.draw(); assert.ok(p.evaluate(condition), condition); };
// La page en 1920 × 1080 ; `avant(p)` est appelé avant setup() (substituts de window, document).
function ouvrir({ largeur = 1920, hauteur = 1080, avant = null } = {}) {
  const p = page({ largeur, hauteur });
  const evaluer = p.evaluate;
  p.evaluate = code => { const r = evaluer(code); return Array.isArray(r) ? Array.from(r) : r; };
  if (avant) avant(p);
  p.demarrer();
  // le substitut de p5 garde chaque appel de dessin : on les oublie à chaque image
  const dessiner = p.draw.bind(p);
  p.draw = (n = 1) => { for (let i = 0; i < n; i++) { dessiner(1); p.calls.length = 0; if (p.decor?.calls) p.decor.calls.length = 0; } };
  p.choisir('f1');
  p.draw();
  p.evaluate('interfaceF1.forcer()');
  return p;
}
const visible = (p, expression) => p.evaluate(`(() => { const e = ${expression}; return !!e && !e.hidden && !e.classList.contains('is-hidden'); })()`);
const JOUER = 'interfaceF1.menuModes.jouer';
const MODES = 'interfaceF1.menuModes.racine';
const PAUSE = 'interfaceF1.menuPause.racine';
const etat = p => p.evaluate('formule1.course.etat');
// clic sur un élément créé par l'interface (le DOM de test appelle ses écouteurs)
const cliquer = (p, expression) => p.evaluate(`${expression}.fire('click')`);
// Lance une partie par le menu (bouton JOUER, carte, Lancer) ; options du menu : circuit, tours, ambiance.
function lancer(p, mode, { profil = null, tours = null, ambiance = null } = {}) {
  cliquer(p, JOUER);
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, MODES), 'menu des modes ouvert');
  cliquer(p, `interfaceF1.menuModes.cartes.${mode}`);
  if (profil !== null) p.evaluate(`(() => { const s = interfaceF1.menuModes.circuit; s.value = '${profil}'; s.fire('change'); })()`);
  if (tours !== null) p.evaluate(`(() => { const s = interfaceF1.menuModes.tours; s.value = '${tours}'; s.fire('change'); })()`);
  if (ambiance !== null) cliquer(p, `interfaceF1.menuModes.ambiances.${ambiance}`);
  cliquer(p, 'interfaceF1.menuModes.boutonLancer');
  p.draw();
  p.evaluate('interfaceF1.forcer()');
}
// Une partie solo lancée par le menu, pilote choisi (voiture 3), en course.
function solo(options = {}) {
  const p = ouvrir(options);
  lancer(p, 'solo');
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[3])');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.draw(60);
  p.evaluate('interfaceF1.forcer()');
  return p;
}
// Ce qui doit rester figé en pause : véhicules, chronos, feux, safety car, particules, minuteries.
const instantane = p => p.evaluate(`JSON.stringify((() => {
  const c = formule1.course;
  const v = x => [x.pos.x, x.pos.y, x.vel.x, x.vel.y];
  return {
    voitures: c.voitures.map(v), sc: v(c.safetyCar), chrono: c.chrono, temps: c.tempsCourse, etat: c.etat, chronoEtat: c.chronoEtat, feux: c.feux,
    particules: [c.fumees, c.etincelles, c.poussieres, c.billes, c.gerbes, c.debris].map(l => l.map(v)),
    horloges: formule1.horloges, bandeau: interfaceF1.bandeau.reste, encarts: formule1.encarts.map(e => e.age),
  };
})())`);

// --- 1. Pause -----------------------------------------------------------------------------

test('pause (P) en mode jeu : overlay PAUSE centré (Reprendre par défaut), HUD et classement visibles mais assombris ; P reprend', () => {
  const p = solo();
  assert.equal(visible(p, PAUSE), false);
  p.touche('p');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.ok(visible(p, PAUSE));
  assert.equal(p.evaluate(`${PAUSE}.classList.contains('glass')`), true);
  assert.equal(p.evaluate('interfaceF1.menuPause.titre.textContent'), 'PAUSE');
  assert.deepEqual(p.evaluate('interfaceF1.menuPause.boutons.map(b => b.libelle.textContent)'), ['Reprendre', 'Rejouer la course', 'Réglages', 'Menu']);
  assert.equal(p.evaluate('interfaceF1.menuPause.choix'), 0);
  assert.equal(p.evaluate('interfaceF1.menuPause.boutons[0].b.classList.contains("choisi")'), true);
  // HUD et classement restent là, assombris par le voile
  assert.ok(visible(p, "document.getElementById('f1-hud')"));
  assert.ok(visible(p, "document.getElementById('f1-tour')"));
  assert.ok(visible(p, 'interfaceF1.voile'));
  p.touche('p');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  assert.equal(visible(p, PAUSE), false);
  assert.equal(visible(p, 'interfaceF1.voile'), false);
  // Échap, et le bouton de la barre, font la même chose
  p.touche('Escape');
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, PAUSE));
  p.touche('Escape');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(visible(p, PAUSE), false);
  p.element('f1-bouton-pause').fire('click');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.ok(visible(p, PAUSE));
  // le CSS : overlay centré à l'écran
  const css = readFileSync(chemin('interfaceF1.css'), 'utf8');
  const regle = css.match(/\.menu-pause\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(regle, /top:\s*50%/);
  assert.match(regle, /left:\s*50%/);
  assert.match(regle, /translate\(-50%,\s*-50%\)/);
});

test('pause : la simulation est vraiment figée (voitures, chronos, safety car, particules, minuteries), puis repart au même instant', () => {
  const p = solo();
  p.evaluate('formule1.course.demanderSafetyCar()');
  p.draw(90);
  assert.equal(etat(p), 'SAFETY_CAR');
  p.touche('p');
  const avant = instantane(p);
  p.draw(120);
  assert.equal(instantane(p), avant);
  // reprise : la première image repart de l'instant figé (un ou deux pas de 1/60 s)
  const chrono = p.evaluate('formule1.course.chrono');
  p.touche('p');
  p.draw();
  const ecart = p.evaluate('formule1.course.chrono') - chrono;
  assert.ok(ecart > 0 && ecart <= 2 * Course.PAS_TEMPS + 1e-9, `${ecart}`);
});

test('pause pendant les feux : les feux sont figés aussi', () => {
  const p = ouvrir();
  lancer(p, 'solo');
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[2])');
  jusqua(p, 'formule1.course.etat === "FEUX" && formule1.course.feux >= 2');
  p.touche('p');
  const avant = instantane(p);
  p.draw(240);
  assert.equal(instantane(p), avant);
  assert.equal(etat(p), 'FEUX');
});

test('overlay PAUSE au clavier : ↑/↓ choisissent, Entrée valide ; Rejouer (confirmation), Réglages (panneau), Menu (menu des modes) ; un seul overlay à la fois', () => {
  const p = solo();
  p.touche('Escape');
  p.evaluate('interfaceF1.forcer()');
  p.touche('ArrowUp');                                          // depuis Reprendre : on boucle sur Menu
  assert.equal(p.evaluate('interfaceF1.menuPause.choix'), 3);
  p.touche('ArrowDown');
  p.touche('ArrowDown');
  assert.equal(p.evaluate('interfaceF1.menuPause.choix'), 1);
  assert.equal(p.evaluate('interfaceF1.menuPause.boutons[1].b.classList.contains("choisi")'), true);
  // Rejouer : la confirmation remplace l'overlay ; Échap y revient
  const numero = p.evaluate('formule1.course.numeroCourse');
  p.touche('Enter');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.confirmationRejouer'), true);
  assert.equal(visible(p, PAUSE), false);
  p.touche('Escape');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.confirmationRejouer'), false);
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.ok(visible(p, PAUSE));
  assert.equal(p.evaluate('formule1.course.numeroCourse'), numero);
  // Réglages : le panneau latéral s'ouvre sur l'onglet Réglages, la course reste en pause
  p.evaluate('interfaceF1.menuPause.choisir(2)');
  p.touche('Enter');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('interfaceF1.panneau.ouvert'), true);
  assert.equal(p.evaluate('interfaceF1.panneau.onglet'), 'reglages');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  // Menu : le menu des modes, seul (l'overlay PAUSE se cache) ; Annuler revient à la pause
  p.evaluate('interfaceF1.menuPause.choisir(3)');
  p.touche('Enter');
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, MODES));
  assert.equal(visible(p, PAUSE), false);
  assert.ok(visible(p, 'interfaceF1.voile'));
  cliquer(p, 'interfaceF1.menuModes.boutonAnnuler');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(visible(p, MODES), false);
  assert.ok(visible(p, PAUSE));
  assert.equal(p.evaluate('formule1.course.numeroCourse'), numero);
  // Reprendre au clic
  cliquer(p, 'interfaceF1.menuPause.boutons[0].b');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  assert.equal(visible(p, PAUSE), false);
});

test('overlay PAUSE : Rejouer → Entrée relance la course (numéro suivant, sans pause) ; en championnat « Rejouer la manche »', () => {
  const p = solo();
  p.touche('p');
  p.evaluate('interfaceF1.forcer()');
  p.evaluate('interfaceF1.menuPause.choisir(1)');
  const numero = p.evaluate('formule1.course.numeroCourse');
  p.touche('Enter');
  p.touche('Enter');
  assert.equal(p.evaluate('formule1.course.numeroCourse'), numero + 1);
  assert.equal(p.evaluate('formule1.course.pause'), false);
  const q = ouvrir();
  lancer(q, 'championnat');
  q.evaluate('formule1.choisirVoiture(formule1.course.voitures[1])');
  jusqua(q, 'formule1.course.etat === "COURSE"');
  q.touche('p');
  q.evaluate('interfaceF1.forcer()');
  assert.equal(q.evaluate('interfaceF1.menuPause.boutons[1].libelle.textContent'), 'Rejouer la manche');
});

test('pause automatique : la fenêtre perd le focus (ou l\'onglet est caché) en mode jeu ; pas en spectateur', () => {
  const ecouteurs = {};
  const avant = p => {
    p.context.window = { addEventListener: (nom, fn) => { (ecouteurs[`window:${nom}`] ??= []).push(fn); } };
    p.context.document.addEventListener = (nom, fn) => { (ecouteurs[`document:${nom}`] ??= []).push(fn); };
  };
  const envoyer = nom => (ecouteurs[nom] ?? []).forEach(fn => fn({}));
  // spectateur : rien
  const s = ouvrir({ avant });
  jusqua(s, 'formule1.course.etat === "COURSE"');
  envoyer('window:blur');
  assert.equal(s.evaluate('formule1.course.pause'), false);
  // en jeu : pause, et l'overlay
  for (const k of Object.keys(ecouteurs)) delete ecouteurs[k];
  const p = solo({ avant });
  p.touche('w');
  envoyer('window:blur');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.ok(visible(p, PAUSE));
  assert.equal(p.evaluate('formule1.course.joueur.commandes.haut'), false, 'plus aucune touche tenue');
  p.touche('p');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  p.context.document.hidden = true;
  envoyer('document:visibilitychange');
  assert.equal(p.evaluate('formule1.course.pause'), true);
});

test('spectateur : P et Échap mettent en pause comme avant, sans overlay de jeu', () => {
  const p = ouvrir();
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.touche('p');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.equal(visible(p, PAUSE), false);
  p.touche('Escape');
  assert.equal(p.evaluate('formule1.course.pause'), false);
});

test('pilotage : P met en pause (plus d\'arrêt au stand) ; B demande l\'arrêt au stand ; deux joueurs : P met en pause aussi', () => {
  const p = solo();
  p.touche('4');
  p.touche('b');
  assert.equal(p.evaluate('formule1.course.joueur.demandeStand'), true);
  assert.equal(p.evaluate('formule1.course.joueur.pneuDemande'), 'INTER');
  const q = solo();
  q.touche('p');
  assert.equal(q.evaluate('formule1.course.joueur.demandeStand'), false);
  assert.equal(q.evaluate('formule1.course.pause'), true);
  const d = ouvrir();
  lancer(d, 'duo');
  d.evaluate('formule1.choisirVoiture(formule1.course.voitures[1])');
  d.evaluate('formule1.choisirVoiture(formule1.course.voitures[2])');
  jusqua(d, 'formule1.course.etat === "COURSE"');
  d.touche('p');
  d.evaluate('interfaceF1.forcer()');
  assert.equal(d.evaluate('formule1.course.pause'), true);
  assert.ok(visible(d, PAUSE));
});

// --- 2. Bouton JOUER et menu des modes ------------------------------------------------------

test('bouton JOUER : visible sans partie en cours, rouge clair en bas à droite ; plus d\'entrée « mode » dans la barre du haut', () => {
  const p = ouvrir();
  assert.ok(visible(p, JOUER));
  assert.equal(p.evaluate(`${JOUER}.textContent`), 'JOUER');
  assert.equal(p.evaluate(`${JOUER}.tagName`), 'BUTTON');
  // la barre du haut n'affiche plus le mode de jeu (« Grand Prix · 5 tours »)
  const html = readFileSync(chemin('index.html'), 'utf8');
  const barre = html.slice(html.indexOf('<header id="f1-barre"'), html.indexOf('</header>', html.indexOf('<header id="f1-barre"')));
  assert.doesNotMatch(barre, /f1-scenario-libelle|Grand Prix/);
  // le style demandé
  const css = readFileSync(chemin('interfaceF1.css'), 'utf8');
  const regle = sel => css.match(new RegExp(`${sel.replace(/[.:#]/g, m => `\\${m}`)}\\s*\\{[^}]*\\}`))?.[0] ?? '';
  const base = regle('.bouton-jouer');
  assert.match(base, /background:\s*#ff5a52/);
  assert.match(base, /height:\s*48px/);
  assert.match(base, /border-radius:\s*8px/);
  assert.match(base, /right:\s*var\(--gap\)/);
  assert.match(base, /bottom:\s*var\(--gap\)/);
  assert.match(base, /font-size:\s*18px/);
  assert.match(base, /Barlow Condensed/);
  assert.match(base, /color:\s*#fff/);
  assert.match(base, /box-shadow/);
  assert.match(regle('.bouton-jouer:hover'), /#ff7069/);
  assert.match(regle('.bouton-jouer:active'), /#e8473f/);
  // panneau ouvert : à gauche du panneau (ni sur le panneau ni sur le rail)
  assert.match(regle('.bouton-jouer.panneau-ouvert'), /right:\s*calc\(var\(--gap\) \* 2 \+ var\(--panel-w\)\)/);
  p.evaluate('interfaceF1.panneau.ouvrir("reglages")');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate(`${JOUER}.classList.contains('panneau-ouvert')`), true);
  // le menu des modes aussi : le panneau passe au-dessus de l'interface (en 1280 px il cachait Lancer)
  assert.equal(p.evaluate(`${MODES}.classList.contains('panneau-ouvert')`), true);
  assert.match(regle('.menu-modes.panneau-ouvert'), /left:\s*calc\(50% - var\(--panel-w\) \/ 2 - var\(--gap\) \/ 2\)/);
});

test('bouton JOUER : masqué pendant qu\'on joue (choix du pilote compris), revenu à la fin de la course', () => {
  const p = solo();
  assert.equal(visible(p, JOUER), false);
  p.evaluate('formule1.course.finirLaPartie()');
  p.draw(2);
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, JOUER));
  const q = ouvrir();
  lancer(q, 'solo');
  assert.equal(visible(q, JOUER), false, 'choix du pilote : partie en cours');
});

test('menu des modes : clic sur JOUER ou Entrée ; 4 cartes (titre, explication, icône), circuit, tours, ambiance, Lancer, Annuler ; Échap ou Annuler ne changent rien', () => {
  const p = ouvrir();
  const numero = p.evaluate('formule1.course.numeroCourse');
  p.touche('Enter');
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, MODES));
  assert.equal(visible(p, JOUER), false);
  assert.ok(visible(p, 'interfaceF1.voile'));
  assert.equal(p.evaluate(`${MODES}.classList.contains('glass')`), true);
  assert.deepEqual(p.evaluate('MenuModes.MODES.map(m => m.id)'), ['solo', 'duo', 'championnat', 'spectateur']);
  assert.deepEqual(p.evaluate('MenuModes.MODES.map(m => m.titre)'), ['Solo', 'Deux joueurs', 'Championnat', 'Spectateur']);
  assert.deepEqual(p.evaluate('MenuModes.MODES.map(m => m.texte)'), ['Je pilote une voiture contre l\'IA',
    'Écran partagé, J1 WASD + Espace, J2 flèches + Entrée', '3 courses, points cumulés', 'Je regarde la course sans piloter']);
  for (const m of ['solo', 'duo', 'championnat', 'spectateur']) {
    assert.equal(p.evaluate(`interfaceF1.menuModes.cartes.${m}.children.length`), 3, `${m} : icône, titre, explication`);
    assert.equal(p.evaluate(`interfaceF1.menuModes.cartes.${m}.children[0].tagName`), 'svg');
  }
  assert.deepEqual(p.evaluate('interfaceF1.menuModes.circuit.children.map(o => o.value)'), Object.keys(Circuit.PROFILS));
  assert.deepEqual(p.evaluate('interfaceF1.menuModes.tours.children.map(o => Number(o.value))'), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.deepEqual(p.evaluate('Object.keys(interfaceF1.menuModes.ambiances)'), ['jour', 'nuit', 'pluie']);
  assert.equal(p.evaluate('interfaceF1.menuModes.boutonLancer.textContent'), 'Lancer');
  assert.equal(p.evaluate('interfaceF1.menuModes.boutonLancer.classList.contains("bouton-principal")'), true);
  assert.equal(p.evaluate('interfaceF1.menuModes.boutonAnnuler.textContent'), 'Annuler');
  // valeurs de départ : celles du jeu (circuit, tours, ambiance)
  assert.equal(p.evaluate('interfaceF1.menuModes.circuit.value'), p.evaluate('formule1.course.parametres.profil'));
  assert.equal(Number(p.evaluate('interfaceF1.menuModes.tours.value')), p.evaluate('formule1.course.parametres.nombreTours'));
  assert.equal(p.evaluate('interfaceF1.menuModes.ambiance'), 'jour');
  // ← → : carte suivante ; Échap : fermé, rien n'a changé
  const choix = p.evaluate('interfaceF1.menuModes.mode');
  p.touche('ArrowRight');
  assert.notEqual(p.evaluate('interfaceF1.menuModes.mode'), choix);
  p.touche('Escape');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(visible(p, MODES), false);
  assert.ok(visible(p, JOUER));
  assert.equal(p.evaluate('formule1.course.numeroCourse'), numero);
  assert.equal(p.evaluate('formule1.course.pause'), false);
  cliquer(p, JOUER);
  cliquer(p, 'interfaceF1.menuModes.boutonAnnuler');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(visible(p, MODES), false);
  assert.equal(p.evaluate('formule1.course.numeroCourse'), numero);
  // le CSS : centré, une carte par mode
  const css = readFileSync(chemin('interfaceF1.css'), 'utf8');
  const regle = css.match(/\.menu-modes\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(regle, /translate\(-50%,\s*-50%\)/);
});

test('Solo : Lancer → choix du pilote au curseur (la course attend), puis les feux ; circuit, tours, ambiance appliqués ; le panneau suit', () => {
  const p = ouvrir();
  const autre = Object.keys(Circuit.PROFILS).find(k => k !== p.evaluate('formule1.course.parametres.profil'));
  lancer(p, 'solo', { profil: autre, tours: 3, ambiance: 'nuit' });
  assert.equal(visible(p, MODES), false);
  assert.equal(p.evaluate('formule1.modeJeu'), 'solo');
  assert.equal(p.evaluate('formule1.mode'), 'course');
  assert.equal(p.evaluate('formule1.course.parametres.modePilote'), true);
  assert.equal(p.evaluate('formule1.course.parametres.profil'), autre);
  assert.equal(p.evaluate('formule1.course.parametres.nombreTours'), 3);
  assert.equal(p.evaluate('formule1.affichage.moment'), 'nuit');
  assert.equal(p.evaluate('formule1.course.parametres.modeMeteo'), 'sec');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  // une seule source de vérité : les réglages « Mode » et « Joueur » du panneau disent la même chose
  assert.equal(p.element('f1-mode').value, 'course');
  assert.equal(p.element('f1-mode-pilote').checked, true);
  assert.equal(p.element('f1-nombre-tours').value, '3');
  assert.equal(p.element('f1-nombre-tours-valeur').textContent, '3');
  assert.equal(p.element('f1-profil').value, autre);
  assert.equal(p.element('f1-moment').value, 'nuit');
  // choix du pilote : la course attend, vue du circuit pour cliquer
  p.draw(400);
  assert.equal(etat(p), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.camera.mode'), 'circuit');
  assert.match(p.evaluate('interfaceF1.consigne.racine.textContent'), /Clique sur une voiture/);
  // le même choix qu'un clic sur la voiture ou sur sa ligne du classement (choixPilote.test.mjs)
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[4])');
  assert.equal(p.evaluate('formule1.course.joueur === formule1.course.voitures[4]'), true);
  jusqua(p, 'formule1.course.etat === "FEUX"');
  jusqua(p, 'formule1.course.etat === "COURSE"');
});

test('caméra en Solo : elle suit la voiture du joueur au départ, centrée devant elle (virage suivant en vue) ; C change de vue ; une nouvelle course revient au suivi', () => {
  const p = solo();
  assert.equal(p.evaluate('formule1.camera.mode'), 'suivi');
  assert.equal(p.element('f1-camera').value, 'suivi');
  p.touche('w');
  // (180 images jusqu'au 18 octobre 2026 ; depuis, le dégagement est de l'asphalte : plein gaz tout
  // droit, la voiture atteint les pneus empilés avant, accident, arrêtée)
  p.draw(120);
  const r = p.evaluate(`(() => { const c = formule1.camera, j = formule1.course.joueur;
    const v = j.vel.mag(); const dx = c.x - j.pos.x, dy = c.y - j.pos.y;
    return [Math.hypot(dx, dy), (dx * j.vel.x + dy * j.vel.y) / Math.max(1e-9, v), c.echelle / formule1.camera.ensemble.echelle]; })()`);
  assert.ok(r[0] < 90, `centre près de la voiture (${r[0]})`);
  assert.ok(r[1] > 10, `centre devant la voiture (${r[1]})`);
  assert.ok(r[2] > 1.5, `zoom (${r[2]})`);
  // C en pilotage : vue suivante (la touche n'est pas une commande de conduite)
  p.touche('c');
  assert.equal(p.evaluate('formule1.camera.mode'), 'drone');
  cliquer(p, "document.getElementById('f1-bouton-camera')");
  assert.equal(p.evaluate('formule1.camera.mode'), 'embarquee');
  p.touche('c');
  p.touche('c');
  assert.equal(p.evaluate('formule1.camera.mode'), 'circuit');
  // rejouer : au départ de la nouvelle course, la caméra suit de nouveau
  p.touche('r');
  p.touche('Enter');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  assert.equal(p.evaluate('formule1.camera.mode'), 'suivi');
});

test('Deux joueurs : Lancer → J1 puis J2 choisissent au curseur (la course attend les deux), puis les feux ; chaque moitié suit son joueur', () => {
  const p = ouvrir();
  lancer(p, 'duo');
  assert.equal(p.evaluate('formule1.modeJeu'), 'duo');
  assert.equal(p.evaluate('formule1.mode'), 'multijoueur');
  assert.equal(p.evaluate('formule1.course.joueurs.length'), 0);
  assert.equal(p.element('f1-mode').value, 'multijoueur');
  p.draw(300);
  assert.equal(etat(p), 'PRESENTATION');
  assert.match(p.evaluate('interfaceF1.consigne.racine.textContent'), /J1/);
  assert.equal(p.evaluate('formule1.choisirVoiture(formule1.course.voitures[5])'), 'pilote');
  assert.equal(p.evaluate('formule1.course.joueur === formule1.course.voitures[5]'), true);
  p.draw(300);
  assert.equal(etat(p), 'PRESENTATION', 'on attend J2');
  p.evaluate('interfaceF1.forcer()');
  assert.match(p.evaluate('interfaceF1.consigne.racine.textContent'), /J2/);
  assert.equal(p.evaluate('formule1.choisirVoiture(formule1.course.voitures[5])'), 'refus');
  assert.equal(p.evaluate('formule1.choisirVoiture(formule1.course.voitures[7])'), 'pilote');
  assert.equal(p.evaluate('formule1.course.multijoueur'), true);
  assert.deepEqual(p.evaluate('formule1.course.joueurs.map(j => formule1.course.voitures.indexOf(j))'), [5, 7]);
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.draw(120);
  const ecarts = p.evaluate(`formule1.partage.cameras.map((cam, k) => { const j = formule1.course.joueurs[k];
    return [cam.mode, Math.hypot(cam.x - j.pos.x, cam.y - j.pos.y)]; })`);
  for (const [mode, d] of ecarts) {
    assert.equal(mode, 'suivi');
    assert.ok(d < 60, `${d}`);
  }
});

test('Championnat : Lancer → championnat en pilote, circuit de la manche ; ambiance pluie : piste mouillée dès le départ ; la caméra suit', () => {
  const p = ouvrir();
  lancer(p, 'championnat', { ambiance: 'pluie', tours: 2 });
  assert.equal(p.evaluate('formule1.modeJeu'), 'championnat');
  assert.equal(p.evaluate('formule1.championnat !== null'), true);
  assert.equal(p.evaluate('formule1.course.parametres.modePilote'), true);
  assert.equal(p.evaluate('formule1.course.parametres.profil'), p.evaluate('formule1.championnat.mancheCourante'));
  assert.equal(p.evaluate('formule1.course.parametres.modeMeteo'), 'manuel');
  assert.ok(p.evaluate('formule1.course.meteo.humidite') > 0.3);
  assert.equal(p.element('f1-mode').value, 'championnat');
  assert.equal(p.element('f1-mode-meteo').value, 'manuel');
  p.draw(300);
  assert.equal(etat(p), 'PRESENTATION');
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[0])');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  assert.equal(p.evaluate('formule1.camera.mode'), 'suivi');
});

test('Spectateur : Lancer → la course part sans pilote, vue du circuit ; le bouton JOUER reste là', () => {
  const p = ouvrir();
  lancer(p, 'solo');
  // depuis une partie en cours, le menu se rouvre par la pause (Menu)
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[3])');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.touche('p');
  p.evaluate('interfaceF1.menuPause.choisir(3)');
  p.touche('Enter');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('interfaceF1.menuModes.mode'), 'solo');
  cliquer(p, 'interfaceF1.menuModes.cartes.spectateur');
  cliquer(p, 'interfaceF1.menuModes.boutonLancer');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.modeJeu'), 'spectateur');
  assert.equal(p.evaluate('formule1.course.parametres.modePilote'), false);
  assert.equal(p.element('f1-mode-pilote').checked, false);
  assert.equal(p.evaluate('formule1.course.pause'), false);
  assert.equal(p.evaluate('formule1.camera.mode'), 'circuit');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  assert.equal(p.evaluate('formule1.camera.mode'), 'circuit');
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, JOUER));
});

test('une seule source de vérité : un changement dans le panneau (mode, mode pilote, tours) se retrouve dans le menu', () => {
  const p = ouvrir();
  p.element('f1-mode').value = 'championnat';
  p.element('f1-mode').fire('change');
  p.element('f1-mode-pilote').checked = true;
  p.element('f1-mode-pilote').fire('change');
  p.glisser('f1-nombre-tours', 7);
  assert.equal(p.evaluate('formule1.modeJeu'), 'championnat');
  cliquer(p, JOUER);
  assert.equal(p.evaluate('interfaceF1.menuModes.mode'), 'championnat');
  assert.equal(p.evaluate('interfaceF1.menuModes.tours.value'), '7');
  cliquer(p, 'interfaceF1.menuModes.boutonAnnuler');
  p.element('f1-mode').value = 'multijoueur';
  p.element('f1-mode').fire('change');
  assert.equal(p.evaluate('formule1.modeJeu'), 'duo');
  p.element('f1-mode').value = 'course';
  p.element('f1-mode').fire('change');
  p.element('f1-mode-pilote').checked = false;
  p.element('f1-mode-pilote').fire('change');
  assert.equal(p.evaluate('formule1.modeJeu'), 'spectateur');
  // le scénario refuse un mode inconnu sans rien changer
  assert.throws(() => p.evaluate("formule1.lancerPartie({ mode: 'tournoi' })"), /Mode de partie inconnu/);
  assert.equal(p.evaluate('formule1.modeJeu'), 'spectateur');
});

// --- 3. Feux rouges puis verts --------------------------------------------------------------

test('feux : 5 rouges (1 s chacun), attente 0,5–3 s, puis les 5 au VERT pendant 1 s ; départ exactement au passage au vert ; fondu de 250 ms', () => {
  const c = new Course({ ...Course.parametresParDefaut(), nombreVoitures: 4 });
  assert.deepEqual(Array.from(FeuxDepart.ETAPES), ['Prêt', '1', '2', '3', '4', '5', 'Vert']);
  assert.equal(FeuxDepart.DUREE_VERT, 1);
  assert.equal(FeuxDepart.DUREE_FONDU, 0.25);
  let precedent = null;
  const debuts = {};
  for (let i = 0; i < 60 * 12 && c.etat !== Course.ETATS.COURSE; i++) {
    precedent = { etat: c.etat, feux: c.feux, depart: c.departDonne, etape: FeuxDepart.etape(c) };
    c.pas();
    if (c.etat === Course.ETATS.FEUX && debuts[c.feux] === undefined) debuts[c.feux] = c.chronoEtat;
  }
  // un feu de plus chaque seconde
  for (let n = 2; n <= 5; n++) assert.ok(Math.abs(debuts[n] - debuts[n - 1] - Course.INTERVALLE_FEUX) < 0.02, `${n} : ${debuts[n] - debuts[n - 1]}`);
  // l'image d'avant : 5 rouges, pas de départ ; celle-ci : vert ET départ
  assert.deepEqual(precedent, { etat: 'FEUX', feux: 5, depart: false, etape: 5 });
  assert.equal(c.etat, Course.ETATS.COURSE);
  assert.equal(c.departDonne, true);
  assert.equal(FeuxDepart.etape(c), 6);
  assert.equal(FeuxDepart.fondu(c), false);
  assert.ok(c.attenteFeux >= Course.ATTENTE_FEUX_MIN && c.attenteFeux <= Course.ATTENTE_FEUX_MAX);
  // 1 s au vert, puis le fondu (250 ms), puis plus rien
  let n = 0;
  for (; n < 120 && !FeuxDepart.fondu(c); n++) {
    assert.equal(FeuxDepart.etape(c), 6);
    c.pas();
  }
  assert.ok(Math.abs(c.chronoEtat - FeuxDepart.DUREE_VERT) < Course.PAS_TEMPS + 1e-9, `vert pendant ${c.chronoEtat} s`);
  assert.equal(FeuxDepart.etape(c), 6);
  for (n = 0; n < 60 && FeuxDepart.etape(c) !== null; n++) c.pas();
  assert.ok(Math.abs(c.chronoEtat - FeuxDepart.DUREE_VERT - FeuxDepart.DUREE_FONDU) < Course.PAS_TEMPS + 1e-9, `fondu jusqu'à ${c.chronoEtat} s`);
  // le portique du décor passe au vert le même temps
  assert.equal(Course.DUREE_FEUX_VERTS, FeuxDepart.DUREE_VERT);
});

test('feux : le joueur ne peut pas accélérer avant le vert (pas de faux départ)', () => {
  const p = ouvrir();
  lancer(p, 'solo');
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[3])');
  jusqua(p, 'formule1.course.etat === "FEUX"');
  const depart = p.evaluate('[formule1.course.joueur.pos.x, formule1.course.joueur.pos.y]');
  p.touche('w');
  for (let i = 0; i < 60 * 9 && etat(p) === 'FEUX'; i++) {
    p.draw();
    if (etat(p) === 'FEUX') {
      const pos = p.evaluate('[formule1.course.joueur.pos.x, formule1.course.joueur.pos.y]');
      assert.ok(Math.hypot(pos[0] - depart[0], pos[1] - depart[1]) < 1, 'immobile pendant les feux');
    }
  }
  assert.equal(etat(p), 'COURSE');
  p.draw(60);
  assert.ok(p.evaluate('formule1.course.joueur.kmh') > 20, 'il part au vert');
});

test('feux dans la page : colonnes rouges une à une, puis toutes VERTES (même halo), puis fondu de 250 ms', () => {
  const p = ouvrir();
  const rouges = () => p.evaluate('interfaceF1.feux.colonnes.filter(([a, b]) => a.classList.contains("allume") && b.classList.contains("allume")).length');
  const verts = () => p.evaluate('interfaceF1.feux.colonnes.filter(([a, b]) => a.classList.contains("vert") && b.classList.contains("vert")).length');
  const vus = new Set();
  for (let i = 0; i < 1200 && etat(p) !== 'COURSE'; i++) {
    p.draw();
    if (etat(p) === 'FEUX') {
      vus.add(rouges());
      assert.equal(verts(), 0);
    }
  }
  assert.ok([1, 2, 3, 4, 5].every(n => vus.has(n)), [...vus].join(','));
  assert.equal(verts(), 5);
  assert.equal(rouges(), 0);
  assert.equal(p.evaluate('interfaceF1.feux.racine.hidden'), false);
  assert.equal(p.evaluate('interfaceF1.feux.racine.classList.contains("fondu")'), false);
  assert.equal(p.evaluate('interfaceF1.feux.etapes[6].etape.children[1].textContent'), 'Vert');
  p.draw(62);
  assert.equal(p.evaluate('interfaceF1.feux.racine.classList.contains("fondu")'), true);
  assert.equal(p.evaluate('interfaceF1.feux.racine.hidden'), false);
  p.draw(16);
  assert.equal(p.evaluate('interfaceF1.feux.racine.hidden'), true);
  const css = readFileSync(chemin('interfaceF1.css'), 'utf8');
  const vert = css.match(/\.feu\.vert\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(vert, /#2ecc71/);
  assert.match(vert, /box-shadow:\s*0 0 18px/);                 // même halo que le rouge
  assert.match(css.match(/\.feu\.allume\s*\{[^}]*\}/)[0], /box-shadow:\s*0 0 18px/);
  assert.match(css.match(/\.feux\s*\{[^}]*\}/)[0], /transition:\s*opacity 250ms/);
  assert.match(css.match(/\.feux\.fondu\s*\{[^}]*\}/)?.[0] ?? '', /opacity:\s*0/);
});

// --- 5. Plein écran ---------------------------------------------------------------------------

// Substituts : requestFullscreen / exitFullscreen comptés, fullscreenchange envoyé comme le navigateur.
function avecPleinEcran(p) {
  p.context.__appels = { entrer: 0, sortir: 0 };
  p.context.__ecouteurs = {};
  p.evaluate(`(() => {
    document.fullscreenElement = null;
    document.addEventListener = (nom, fn) => { (__ecouteurs[nom] ??= []).push(fn); };
    const changer = e => { document.fullscreenElement = e; (__ecouteurs.fullscreenchange ?? []).forEach(fn => fn({})); };
    document.documentElement.requestFullscreen = () => { __appels.entrer++; changer(document.documentElement); return Promise.resolve(); };
    document.exitFullscreen = () => { __appels.sortir++; changer(null); return Promise.resolve(); };
  })()`);
}
const appels = p => ({ ...p.context.__appels });

test('F : plein écran ON/OFF en spectateur, en course (mode jeu), en pause, dans le menu des modes et avec l\'aide ouverte', () => {
  const p = ouvrir({ avant: avecPleinEcran });
  p.touche('f');
  assert.deepEqual(appels(p), { entrer: 1, sortir: 0 });
  p.touche('F');
  assert.deepEqual(appels(p), { entrer: 1, sortir: 1 });
  // menu des modes
  cliquer(p, JOUER);
  p.touche('f');
  assert.deepEqual(appels(p), { entrer: 2, sortir: 1 });
  assert.ok(visible(p, MODES), 'le menu reste ouvert');
  p.touche('f');
  cliquer(p, 'interfaceF1.menuModes.cartes.solo');
  cliquer(p, 'interfaceF1.menuModes.boutonLancer');
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[3])');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  // en course : c'était le défaut (la touche partait aux commandes de conduite)
  assert.equal(p.evaluate('formule1.pilotage()'), true);
  p.touche('f');
  assert.deepEqual(appels(p), { entrer: 3, sortir: 2 });
  assert.equal(p.evaluate('formule1.course.joueur.commandes.haut'), false);
  // en pause
  p.touche('p');
  p.touche('f');
  assert.deepEqual(appels(p), { entrer: 3, sortir: 3 });
  assert.equal(p.evaluate('formule1.course.pause'), true, 'F ne reprend pas la course');
  // aide ouverte
  p.touche('?');
  p.touche('f');
  assert.deepEqual(appels(p), { entrer: 4, sortir: 3 });
  assert.equal(p.element('f1-aide').hidden, false);
});

test('F : passage en plein écran → canvas redimensionné et interface recalculée', () => {
  const p = ouvrir({ avant: avecPleinEcran });
  const avant = p.resizes.length;
  const largeurAvant = p.evaluate('formule1.camera.zone.largeur');
  p.context.windowWidth = 2560;
  p.context.windowHeight = 1440;
  p.touche('f');
  assert.ok(p.resizes.length > avant, `resizeCanvas appelé (${avant} → ${p.resizes.length}, ${JSON.stringify(appels(p))})`);
  assert.deepEqual(Array.from(p.resizes.at(-1)), [2560, p.evaluate('hauteurScene()')]);
  p.draw();
  const zone = p.evaluate('JSON.stringify(formule1.camera.zone)');
  assert.ok(JSON.parse(zone).largeur >= largeurAvant + 2560 - 1920 - 1, `${largeurAvant} → ${zone}`);
  // overlays centrés : le menu des modes et la pause se placent au centre en CSS (50 % / 50 %)
  cliquer(p, JOUER);
  assert.ok(visible(p, MODES));
});

test('F n\'est ni une commande de conduite ni une autre action ; aide : P, F, C et Entrée', () => {
  const touches = p => p.evaluate('JSON.stringify(EcranPartage.TOUCHES)');
  const p = ouvrir();
  assert.doesNotMatch(touches(p), /"f"/);
  assert.equal(Object.values(VoiturePilote.TOUCHES_PNEUS ?? {}).includes('f'), false);
  assert.equal(Object.keys(VoiturePilote.TOUCHES_PNEUS ?? {}).includes('f'), false);
  const lignes = FenetreAide.GROUPES.flatMap(([, rangees]) => rangees);
  const trouve = (texte, touche) => lignes.some(([action, t]) => texte.test(action) && t.includes(touche));
  assert.ok(trouve(/^Pause/, 'P'));
  assert.ok(trouve(/^Pause/, 'Échap'));
  assert.ok(trouve(/Plein écran/, 'F'));
  assert.ok(trouve(/caméra/i, 'C'));
  assert.ok(trouve(/JOUER|mode de jeu/i, 'Entrée'));
  assert.ok(trouve(/Arrêt au stand/, 'B'));
  assert.equal(trouve(/Arrêt au stand/, 'P'), false, 'P est la pause');
});

// --- classes ----------------------------------------------------------------------------------

test('MenuPause et MenuModes ne sont pas des Vehicle ; un mode inconnu est refusé', () => {
  // (contexte vm : Object.prototype n'est pas celui de ce fichier, on compare le nom)
  for (const Classe of [MenuPause, MenuModes]) assert.equal(Object.getPrototypeOf(Classe.prototype).constructor.name, 'Object');
  assert.deepEqual(Array.from(MenuPause.ACTIONS, ([id]) => id), ['reprendre', 'rejouer', 'reglages', 'menu']);
  assert.deepEqual(Array.from(MenuModes.AMBIANCES), ['jour', 'nuit', 'pluie']);
});
