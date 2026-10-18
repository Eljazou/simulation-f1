// Démonstration automatique filmée du jeu « Circuit Formule 1 » (Playwright).
//   cd demo && npm install && node demo.mjs        (ou lancer-demo.bat)
// Le script démarre le serveur local du jeu (serveur.mjs), ouvre le jeu en 1920 × 1080 dans
// Chromium (sans fenêtre, accélération GPU), enregistre la vidéo (recordVideo) et joue un
// scénario complet avec des sous-titres incrustés (un div temporaire ajouté à la page, jamais au
// code du jeu). Pendant le scénario, il vérifie la console et la présence de chaque élément
// attendu, puis écrit rapport.md (captures d'écran des étapes en échec dans rapport/).
// Sortie : videos/demo-f1.mp4 (ffmpeg-static), ou videos/demo-f1.webm si ffmpeg est absent.
// Le jeu n'est pas modifié : tout passe par la page (clics, touches, curseurs du panneau, API
// publique du contrôleur comme le ferait un clic). Le pilote automatique du joueur ne fait
// qu'envoyer des touches W A S D (et Espace pour le DRS) au jeu, comme un clavier.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calerFichiers } from './calage.mjs';

const DEMO = dirname(fileURLToPath(import.meta.url));
const RACINE = dirname(DEMO);
const VIDEOS = join(DEMO, 'videos');
const BRUT = join(VIDEOS, 'brut');
const CAPTURES = join(DEMO, 'rapport');
const LARGEUR = 1920;
const HAUTEUR = 1080;
// p5 tire l'aléa de wander() avec random() : graine fixe, pour une démonstration reproductible
// (la course, la météo, les incidents et l'entraînement ont déjà leurs propres graines fixes)
const GRAINE_P5 = 2026;
const NOM_MODELE = 'Démo Playwright';
const RAPIDE = process.argv.includes('--rapide');

// --- Outils ----------------------------------------------------------------------------------

const attendre = ms => new Promise(r => setTimeout(r, RAPIDE ? Math.min(ms, 300) : ms));
const horodatage = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function portLibre() {
  return new Promise((resoudre, rejeter) => {
    const s = createServer();
    s.once('error', rejeter);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resoudre(port));
    });
  });
}

async function demarrerServeur() {
  const port = await portLibre();
  const serveur = spawn(process.execPath, [join(RACINE, 'serveur.mjs'), String(port)], { cwd: RACINE, stdio: 'ignore' });
  const url = `http://localhost:${port}/`;
  for (let k = 0; k < 50; k++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { serveur, url };
    } catch { /* pas encore prêt */ }
    await new Promise(r => setTimeout(r, 200));
  }
  serveur.kill();
  throw new Error('Le serveur local ne répond pas.');
}

function cheminFfmpeg() {
  try {
    const module = join(DEMO, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (existsSync(module)) return module;
  } catch { /* absent */ }
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0 ? 'ffmpeg' : null;
}

// --- Outils installés dans la page (sous-titres, surlignage, clavier, pilote automatique) ----
// Ils n'existent que dans cette page pendant la démonstration ; le jeu ne les connaît pas.

// --- Rapport ---------------------------------------------------------------------------------

const etapes = [];
const erreursConsole = [];
let page = null;

function verifier(condition, message) {
  if (!condition) throw new Error(message);
}

async function etape(nom, action) {
  const debut = Date.now();
  const erreursAvant = erreursConsole.length;
  const verifs = [];
  const noter = texte => verifs.push(texte);
  let ok = true;
  let detail = '';
  let capture = null;
  try {
    await action(noter);
    const nouvelles = erreursConsole.slice(erreursAvant);
    if (nouvelles.length > 0) throw new Error(`erreur(s) dans la console : ${nouvelles.map(e => e.texte).join(' | ')}`);
  } catch (erreur) {
    ok = false;
    detail = String(erreur.message ?? erreur).split('\n')[0];
    try {
      mkdirSync(CAPTURES, { recursive: true });
      capture = join(CAPTURES, `echec-${String(etapes.length + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: capture });
    } catch { capture = null; }
  }
  const duree = ((Date.now() - debut) / 1000).toFixed(1);
  etapes.push({ nom, ok, detail, verifs, capture, duree });
  console.log(`${ok ? 'OK' : 'KO'}  ${nom} (${duree} s)${ok ? '' : ` : ${detail}`}`);
}

// --- Sous-titres, voix off et chronologie ------------------------------------------------------
// Chaque sous-titre porte l'id de sa réplique dans narration.json. Avant d'en afficher un autre
// (ou de l'effacer), le sous-titre courant reste à l'écran au moins la durée de sa voix (mesurée par
// voix.mjs --synthese) plus MARGE_VOIX : l'étape s'allonge, la voix n'est jamais pressée. Les
// instants réels (horloge du script) sont convertis en temps de la vidéo à la fin (timeline.json).
const MARGE_VOIX = 0.5;
const DUREES_VOIX = (() => {
  try {
    const narration = JSON.parse(readFileSync(join(DEMO, 'narration.json'), 'utf8'));
    return new Map(narration.filter(r => r.dureeAudio).map(r => [r.id, r.dureeAudio]));
  } catch {
    return new Map();
  }
})();
const chronologie = [];
let sousTitreCourant = null;

// Attend que la voix du sous-titre courant ait fini (et la marge) ; ne fait rien sans voix.
async function finirVoix() {
  if (sousTitreCourant === null || RAPIDE) return;
  const voix = DUREES_VOIX.get(sousTitreCourant.id);
  if (!voix) return;
  const reste = voix + MARGE_VOIX - (Date.now() - sousTitreCourant.debut) / 1000;
  if (reste > 0) await new Promise(r => setTimeout(r, reste * 1000));
}

async function sousTitre(chapitre, texte, id = null) {
  await finirVoix();
  const maintenant = Date.now();
  if (sousTitreCourant !== null) sousTitreCourant.fin = maintenant;
  await page.evaluate(([c, t]) => window.__demo.sousTitre(c, t), [chapitre, texte]);
  sousTitreCourant = texte ? { id, chapitre, texte, debut: maintenant, fin: null } : null;
  if (sousTitreCourant !== null) chronologie.push(sousTitreCourant);
}
const surligner = selecteur => page.evaluate(s => window.__demo.surligner(s), selecteur);
const etat = () => page.evaluate(() => formule1.course.etat);

// Attend qu'une condition (évaluée dans la page) soit vraie ; renvoie sa valeur.
async function attendreQue(fonction, argument, delai, message) {
  try {
    const h = await page.waitForFunction(fonction, argument, { timeout: delai, polling: 100 });
    return await h.jsonValue();
  } catch {
    throw new Error(message);
  }
}

// Un curseur du panneau : valeur posée puis événement « input » (comme un geste de la souris).
async function curseur(id, valeur) {
  await page.evaluate(([i, v]) => {
    const e = document.getElementById(i);
    const section = e.closest('details');
    if (section) section.open = true;
    e.scrollIntoView({ block: 'center' });
    e.value = String(v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, valeur]);
}

// Un menu du panneau : sélection visible par Playwright (événement « change »).
async function menu(id, valeur) {
  await page.evaluate(i => {
    const e = document.getElementById(i);
    const section = e.closest('details');
    if (section) section.open = true;
    e.scrollIntoView({ block: 'center' });
  }, id);
  await page.selectOption(`#${id}`, valeur);
}

async function ouvrirReglages() {
  await page.evaluate(() => interfaceF1.panneau.ouvrir('reglages'));
  await attendre(400);
}

async function cliquerPanneau(id) {
  await page.evaluate(i => {
    const e = document.getElementById(i);
    const section = e.closest('details');
    if (section) section.open = true;
    e.scrollIntoView({ block: 'center' });
  }, id);
  await page.click(`#${id}`);
}

// Choisir sa voiture au clic, avant le départ (mode pilote) : clic sur la voiture à l'écran.
// Deux joueurs : J1 clique d'abord (joueurs = 1), puis J2 (joueurs = 2).
async function choisirVoitureAuClic(rang, joueurs = 1) {
  const point = await page.evaluate(r => {
    const v = formule1.course.voitures[r];
    return formule1.camera.versEcran(v.pos.x, v.pos.y);
  }, rang);
  await page.mouse.move(point.x, point.y, { steps: 12 });
  await attendre(300);
  await page.mouse.click(point.x, point.y);
  await attendre(300);
  const choisi = await page.evaluate(n => formule1.course.joueur !== null && formule1.course.joueurs.length >= n, joueurs);
  if (!choisi) {
    // filet : le même choix par l'API du contrôleur (celle qu'appelle le clic)
    await page.evaluate(r => formule1.choisirVoiture(formule1.course.voitures[r]), rang);
  }
  return choisi;
}

// Menu JOUER : bouton JOUER (sauf si le menu est déjà ouvert, depuis le menu pause), carte de
// mode, options, Lancer.
async function menuJouer({ mode, tours, adversaires = 'Classiques', modele = null, ouvrir = true }) {
  if (ouvrir) await page.click('#f1-jouer');
  await page.waitForSelector('#f1-menu-modes:not([hidden])', { timeout: 5000 });
  await attendre(900);
  await page.click(`#f1-menu-modes .carte-mode:has-text("${mode}")`);
  await attendre(600);
  await page.selectOption('#f1-menu-modes .menu-modes-champ:has-text("Tours") select', String(tours));
  await page.click('#f1-menu-modes .menu-modes-champ:has-text("Ambiance") .seg:has-text("Jour")');
  await page.click(`#f1-menu-modes .menu-modes-champ:has-text("Adversaires") .seg:has-text("${adversaires}")`);
  await attendre(500);
  if (modele !== null) {
    await page.selectOption('#f1-menu-modes .menu-modes-champ:has-text("Modèle IA") select', { label: modele });
    await attendre(500);
  }
  await attendre(900);
  await page.click('#f1-menu-modes .bouton-principal:has-text("Lancer")');
  await attendre(400);
}

// --- Scénario --------------------------------------------------------------------------------

async function scenario(url, debutVideo) {
  let debutUtile = 0;

  await etape('Chargement du jeu (1920 × 1080, graines fixes)', async noter => {
    await page.goto(url);
    await attendreQue(() => typeof formule1 !== 'undefined' && formule1 !== undefined && formule1.demarre && interfaceF1 !== null, null, 30000,
      'le jeu ne démarre pas');
    await page.evaluate(g => {
      formule1.course.pause = true;
      randomSeed(g);
      noiseSeed(g);
    }, GRAINE_P5);
    await page.addScriptTag({ path: join(DEMO, 'outils-page.js') });
    // une longue course de 12 voitures, simulation à 1,5x
    await curseur('f1-nombre-tours', 12);
    await curseur('f1-nombre-voitures', 12);
    // présentation au ralenti (0,25x) : les voitures attendent sur la grille pendant l'intro, les
    // feux ne s'allument pas avant la fin de la narration ; 1,5x dès les feux
    await curseur('f1-vitesse-simulation', 0.25);
    // mode pilote : un contact léger du pilote automatique dans le peloton reste un frôlement
    // (sinon un accident, une remise en piste et une pénalité pourraient couper la démonstration)
    await curseur('f1-vitesse-impact', 150);
    await page.evaluate(() => {
      interfaceF1.panneau.fermer?.();
      if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer();
      formule1.camera.choisirMode('circuit');
    });
    await attendre(500);
    const infos = await page.evaluate(() => ({
      canvas: document.querySelector('canvas') !== null, tour: !document.getElementById('f1-tour').hidden,
      carte: !document.getElementById('f1-carte').hidden, profil: formule1.course.circuit.profil, graine: formule1.course.circuit.graine,
      voitures: formule1.course.voitures.length,
    }));
    verifier(infos.canvas, 'canvas absent');
    verifier(infos.voitures === 12, `12 voitures attendues, ${infos.voitures} trouvées`);
    noter(`circuit ${infos.profil} #${infos.graine}, ${infos.voitures} voitures, 12 tours, graine p5 ${GRAINE_P5}`);
    debutUtile = (Date.now() - debutVideo) / 1000;
    await page.evaluate(() => formule1.recommencer());
    await sousTitre('Bienvenue', 'Démonstration automatique du jeu Circuit Formule 1, filmée avec Playwright.', 'intro');
  });

  await etape('Feux de départ et course IA', async noter => {
    await sousTitre('Circuit Formule 1', 'Douze monoplaces pilotées par des steering behaviors (seek, arrive, wander, séparation) se présentent sur la grille.', 'grille');
    await attendreQue(() => ['FEUX', 'COURSE'].includes(formule1.course.etat), null, 60000, 'les feux ne s\'allument pas');
    await sousTitre('Feux de départ', 'Les cinq feux rouges s\'allument un à un… puis s\'éteignent : c\'est le départ !', 'feux');
    await curseur('f1-vitesse-simulation', 1.5);
    const feux = await page.evaluate(() => !document.getElementById('f1-feux').hidden);
    verifier(feux, 'les feux de départ (#f1-feux) ne sont pas affichés');
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 20000, 'la course ne part pas');
    await sousTitre('Course IA', 'Chaque voiture suit la ligne de course, freine avant les virages (arrive) et évite les autres.', 'course-ia');
    await attendre(5000);
    const v = await page.evaluate(() => formule1.course.voitures.filter(x => x.vitesse > 0.5).length);
    verifier(v >= 10, `seulement ${v} voitures roulent`);
    noter(`${v} voitures en mouvement après le départ`);
  });

  await etape('Classement et mini-carte', async noter => {
    await surligner('#f1-tour');
    await sousTitre('Classement', 'La tour de classement : positions, écarts au leader, pneus et arrêts, mise à jour à chaque image.', 'classement');
    await attendre(3500);
    const lignes = await page.evaluate(() => document.getElementById('f1-tour-lignes').children.length);
    verifier(lignes === 12, `12 lignes de classement attendues, ${lignes} trouvées`);
    await surligner('#f1-carte');
    await sousTitre('Mini-carte', 'La mini-carte montre tout le circuit, les secteurs et la position de chaque voiture.', 'mini-carte');
    await attendre(3500);
    const carte = await page.evaluate(() => document.querySelectorAll('#f1-carte-svg *').length);
    verifier(carte > 5, 'la mini-carte (#f1-carte-svg) est vide');
    await surligner('#f1-tour-lignes > :first-child');
    await sousTitre('Suivre un pilote', 'Un clic sur une ligne du classement choisit ce pilote ; la caméra le suit.', 'suivre-pilote');
    await attendre(1200);
    await page.click('#f1-tour-lignes > :first-child');
    await page.evaluate(() => formule1.camera.choisirMode('suivi'));
    await surligner(null);
    await attendre(4000);
    const choisi = await page.evaluate(() => formule1.course.selection?.pilote.code ?? null);
    verifier(choisi !== null, 'le clic sur le classement ne choisit aucun pilote');
    noter(`${lignes} lignes, mini-carte dessinée, pilote suivi : ${choisi}`);
  });

  await etape('Mode pilote : touches W A S D simulées et DRS', async noter => {
    await page.evaluate(() => formule1.camera.choisirMode('circuit'));
    await sousTitre('Mode pilote', 'Bouton JOUER : on choisit « Solo » pour piloter soi-même une voiture contre l\'IA.', 'pilote-menu');
    await menuJouer({ mode: 'Solo', tours: 5 });
    await sousTitre('Mode pilote', 'Avant le départ, un clic sur une monoplace de la grille : elle devient la nôtre.', 'pilote-choix');
    await attendre(1500);
    const auClic = await choisirVoitureAuClic(3);
    await page.evaluate(() => window.__demo.clavier(true));
    await page.evaluate(() => window.__demo.pilote(true));
    await sousTitre('Mode pilote', 'Commandes au clavier QWERTY : W accélère, S freine, A et D tournent. Ici, les touches sont simulées par le script.', 'pilote-commandes');
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 25000, 'la course du mode pilote ne part pas');
    await attendre(6000);
    await sousTitre('DRS', 'Dans une zone DRS, à moins d\'une seconde de la voiture de devant, ESPACE ouvre l\'aileron arrière : plus de vitesse en ligne droite.', 'drs');
    const drs = await attendreQue(() => window.__demo.etatPilote().drsActive > 0, null, 30000, 'le DRS ne s\'est pas ouvert en 30 s')
      .then(() => true).catch(e => e);
    await attendre(3000);
    const p = await page.evaluate(() => ({ ...window.__demo.etatPilote(), hud: !document.getElementById('f1-hud').hidden,
      vitesse: formule1.course.joueur?.vitesse ?? 0, code: formule1.course.joueur?.pilote.code, rapport: document.getElementById('f1-hud-vitesse').textContent }));
    noter(`voiture ${p.code} choisie ${auClic ? 'au clic' : 'par l\'API (clic manqué)'} ; frappes : W ${p.compteurs.w}, A ${p.compteurs.a}, S ${p.compteurs.s}, D ${p.compteurs.d}, Espace ${p.compteurs[' ']} ; HUD ${p.rapport} km/h`);
    verifier(p.hud, 'le HUD du pilote (#f1-hud) n\'est pas affiché');
    verifier(p.compteurs.w > 0 && p.compteurs.a + p.compteurs.d > 0, 'aucune touche de conduite envoyée');
    verifier(p.vitesse > 0.5, 'la voiture du joueur ne roule pas');
    if (drs !== true) throw drs;
    noter('DRS ouvert (Espace) observé');
  });

  await etape('Mode multijoueur local : écran partagé', async noter => {
    const CHAPITRE = 'Mode multijoueur local : écran partagé';
    await page.evaluate(() => { window.__demo.pilote(false); window.__demo.clavier(0); });
    await sousTitre('Multijoueur local', 'Mode multijoueur local : écran partagé. Échap met la course en pause, « Menu » ouvre le choix du mode.', 'multi-intro');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#f1-menu-pause:not([hidden])', { timeout: 5000 });
    await attendre(1500);
    await page.click('#f1-menu-pause button:has-text("Menu")');
    await sousTitre(CHAPITRE, 'Carte « Deux joueurs » : deux pilotes sur le même clavier, l\'écran est partagé en deux.', 'multi-carte');
    await menuJouer({ mode: 'Deux joueurs', tours: 5, ouvrir: false });
    await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
    await sousTitre(CHAPITRE, 'Chaque joueur choisit sa voiture d\'un clic sur la grille : J1 d\'abord, puis J2.', 'multi-choix');
    await attendre(1200);
    const clic1 = await choisirVoitureAuClic(4, 1);
    await attendre(700);
    const clic2 = await choisirVoitureAuClic(5, 2);
    const depart = await page.evaluate(() => ({ multijoueur: formule1.course.multijoueur, codes: formule1.course.joueurs.map(j => j.pilote.code) }));
    verifier(depart.multijoueur && depart.codes.length === 2, 'le mode deux joueurs ne démarre pas (écran partagé absent)');
    await page.evaluate(() => { window.__demo.clavier(2); window.__demo.pilote(true); });
    await sousTitre(CHAPITRE, 'J1 : W A S D, Espace pour le DRS. J2 : flèches, Entrée pour le DRS. Les touches des deux joueurs sont simulées en même temps.', 'multi-touches');
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 25000, 'la course à deux ne part pas');
    // les deux voitures roulent chacune selon ses touches : leurs vitesses relevées pendant 4 s
    const vitesses = [];
    for (let k = 0; k < 8; k++) {
      await attendre(500);
      vitesses.push(await page.evaluate(() => formule1.course.joueurs.map(j => j.vitesse)));
    }
    await surligner('#f1-duel .duel-panneau');
    await sousTitre(CHAPITRE, 'En bas, le HUD de chaque joueur ; au centre, le duel : positions, écart entre J1 et J2, tours menés.', 'multi-hud');
    await attendre(3500);
    await surligner(null);
    // la voix du HUD finit avant le duel (sinon le dépassement aurait lieu pendant qu'elle parle)
    await finirVoix();
    // duel : en ligne droite, celui de devant lève le pied et l'autre se décale pour passer
    await attendreQue(() => {
      const c = formule1.course;
      const ci = c.circuit;
      return c.joueurs.every(j => {
        let m = 0;
        for (let k = 0; k < 30; k++) m = Math.max(m, Math.abs(ci.courburesLigne[ci.indice(j.indicePiste + k)]));
        return m < 0.004;
      });
    }, null, 20000, '').catch(() => null);
    const duel = await page.evaluate(() => {
      const c = formule1.course;
      const o = c.classement();
      const devant = o.indexOf(c.joueurs[0]) < o.indexOf(c.joueurs[1]) ? 0 : 1;
      const derriere = c.joueurs[1 - devant];
      const lat = c.circuit.decalagesLigne[derriere.indicePiste];
      window.__demo.reglerJoueur(devant, { facteur: 0.85 });
      window.__demo.reglerJoueur(1 - devant, { decalage: lat > 0 ? -26 : 26 });
      return { devant, codes: c.joueurs.map(j => j.pilote.code) };
    });
    const d = duel.devant;
    await sousTitre(CHAPITRE, `Duel : J${d + 1} (${duel.codes[d]}) lève le pied, J${2 - d} (${duel.codes[1 - d]}) se décale et tente le dépassement…`, 'multi-duel');
    const depasse = await attendreQue(dv => {
      const c = formule1.course;
      const o = c.classement();
      return o.indexOf(c.joueurs[dv]) > o.indexOf(c.joueurs[1 - dv]);
    }, d, 20000, '').then(() => true).catch(() => false);
    if (depasse) await sousTitre(CHAPITRE, `Dépassement ! J${2 - d} passe devant J${d + 1} : le duel s'inverse au centre de l'écran.`, 'multi-depassement');
    await attendre(1500);
    await page.evaluate(() => { window.__demo.reglerJoueur(0, { facteur: 1, decalage: 0 }); window.__demo.reglerJoueur(1, { facteur: 1, decalage: 0 }); });
    await attendre(3500);
    const r = await page.evaluate(() => ({
      huds: [...document.querySelectorAll('#f1-duel .duel-hud')].filter(e => e.getBoundingClientRect().width > 0).length,
      duel: !document.getElementById('f1-duel').hidden,
      kmh: [...document.querySelectorAll('#f1-duel .duel-vitesse')].map(e => e.textContent),
      etat: window.__demo.etatPilote(),
      incidents: formule1.course.joueurs.filter(j => j.incident).length,
    }));
    const c = r.etat.compteurs;
    const differentes = vitesses.some(([a, b]) => Math.abs(a - b) > 0.05);
    noter(`J1 ${depart.codes[0]} et J2 ${depart.codes[1]} choisis ${clic1 && clic2 ? 'au clic' : 'par l\'API (clic manqué)'} ; ${r.huds} HUD visibles (${r.kmh.join(' / ')} km/h)`);
    noter(`frappes J1 : W ${c.w}, A ${c.a}, S ${c.s}, D ${c.d}, Espace ${c[' ']} ; J2 : ↑ ${c.arrowup}, ← ${c.arrowleft}, ↓ ${c.arrowdown}, → ${c.arrowright}, Entrée ${c.enter}`);
    noter(`DRS ouvert : J1 ${r.etat.joueurs[0].drsActive > 0 ? 'oui' : 'non'}, J2 ${r.etat.joueurs[1].drsActive > 0 ? 'oui' : 'non'} ; dépassement entre joueurs : ${depasse ? `oui (J${2 - d} devant J${d + 1})` : 'non observé'}`);
    verifier(r.duel && r.huds === 2, `écran partagé : ${r.huds} HUD visible(s) au lieu de 2`);
    verifier(c.w > 0 && c.arrowup > 0 && c.a + c.d > 0 && c.arrowleft + c.arrowright > 0, 'les touches d\'un des deux joueurs n\'ont pas été envoyées');
    verifier(vitesses.at(-1).every(v => v > 0.5), 'une des deux voitures ne roule pas');
    verifier(differentes, 'les deux voitures ont exactement la même vitesse : pilotage indépendant non démontré');
    verifier(r.incidents === 0, 'un joueur est en incident');
  });

  await etape('Pit stop', async noter => {
    await page.evaluate(() => window.__demo.pilote(false));
    await page.evaluate(() => window.__demo.clavier(false));
    await sousTitre('Pit stop', 'Retour en spectateur. Dans le panneau, l\'usure des pneus est poussée au maximum : les voitures vont devoir s\'arrêter.', 'pit-usure');
    await page.evaluate(() => interfaceF1.lancerPartie({ mode: 'spectateur', profil: formule1.course.parametres.profil, tours: 12, ambiance: 'jour', adversaires: 'classiques' }));
    await ouvrirReglages();
    await curseur('f1-usure-pneus', 0.1);
    await attendre(800);
    await curseur('f1-seuil-stand', 0.8);
    await attendre(1500);
    await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 25000, 'la course ne repart pas');
    // la voix finit avant de guetter l'entrée au stand (l'arrêt au box ne doit pas passer pendant)
    await finirVoix();
    const code = await attendreQue(() => {
      const v = formule1.course.voitures.find(x => x.auStand);
      if (!v) return false;
      formule1.choisirVoiture(v);
      formule1.camera.choisirMode('suivi');
      return v.pilote.code;
    }, null, 45000, 'aucune voiture n\'entre au stand');
    await sousTitre('Pit stop', `${code} entre dans la voie des stands : limiteur de vitesse, arrêt au box, l\'équipe change les quatre roues.`, 'pit-entree');
    await attendreQue(() => formule1.course.selection && formule1.course.selection.phaseStand === 'ARRET', null, 30000, 'la voiture n\'arrive pas au box');
    await attendreQue(() => formule1.course.selection && formule1.course.selection.phaseStand === 'SORTIE', null, 30000, 'l\'arrêt au box ne finit pas');
    await sousTitre('Pit stop', 'Pneus neufs : la voiture repart et rejoint la piste en sortie de voie des stands.', 'pit-sortie');
    await attendre(3500);
    const arrets = await page.evaluate(() => formule1.course.voitures.reduce((s, v) => s + v.arretsAuStand, 0));
    verifier(arrets > 0, 'aucun arrêt au stand compté');
    noter(`arrêt observé pour ${code} ; ${arrets} arrêt(s) comptés`);
    // usure revenue à la normale (sinon tout le monde s'arrêterait sans fin)
    await curseur('f1-usure-pneus', await page.evaluate(() => VoitureF1.USURE_PNEUS));
    await curseur('f1-seuil-stand', await page.evaluate(() => VoitureF1.SEUIL_STAND));
  });

  await etape('Virtual Safety Car (VSC) et panne', async noter => {
    await page.evaluate(() => formule1.camera.choisirMode('circuit'));
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 30000, 'la course n\'est pas en régime normal');
    await ouvrirReglages();
    await sousTitre('VSC', 'Le bouton VSC du panneau déclare une Virtual Safety Car : tout le monde ralentit et garde ses écarts.', 'vsc');
    await cliquerPanneau('f1-vsc-bouton');
    await attendreQue(() => formule1.course.etat === 'VSC', null, 3000, 'l\'état VSC n\'est pas atteint');
    await attendre(800);
    await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
    const bandeau = await page.evaluate(() => !document.getElementById('f1-neutralisation').hidden);
    await attendre(5000);
    await sousTitre('VSC', 'Fin du VSC : la course reprend.', 'vsc-fin');
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 30000, 'le VSC ne se termine pas');
    await attendre(1500);
    await sousTitre('Panne', 'Le bouton « Panne » provoque une panne moteur sur la voiture choisie : elle ralentit et s\'arrête.', 'panne');
    const victime = await page.evaluate(() => {
      const c = formule1.course;
      const v = c.voitures.find(x => x.etat === VoitureF1.ETATS.COURSE && !x.auStand);
      c.selection = null;
      formule1.choisirVoiture(v);
      formule1.camera.choisirMode('suivi');
      return v.pilote.code;
    });
    await ouvrirReglages();
    await cliquerPanneau('f1-panne-bouton');
    await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
    await attendre(6000);
    const panne = await page.evaluate(() => {
      const v = formule1.course.selection;
      return { vitesse: v.vitesse, etat: v.etat, horsCourse: v.horsCourse, panne: v.panne ?? null };
    });
    verifier(bandeau, 'le bandeau VSC (#f1-neutralisation) n\'est pas affiché');
    verifier(panne.horsCourse || panne.vitesse < 0.5 || panne.etat !== 'COURSE', `la voiture ${victime} ne semble pas en panne`);
    noter(`VSC déclaré puis levé ; panne de ${victime} (état ${panne.etat}, vitesse ${panne.vitesse.toFixed(2)})`);
  });

  await etape('Safety car', async noter => {
    await page.evaluate(() => formule1.camera.choisirMode('circuit'));
    await sousTitre('Safety car', 'Le bouton « Safety car » la fait sortir : le peloton se regroupe derrière elle, dépassements interdits.', 'safety-car');
    const deja = await etat();
    if (deja !== 'SAFETY_CAR') {
      await attendreQue(() => ['COURSE', 'VSC'].includes(formule1.course.etat), null, 30000, 'safety car impossible (course ni en régime normal ni sous VSC)');
      await ouvrirReglages();
      await cliquerPanneau('f1-safety-car');
      await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
    }
    await attendreQue(() => formule1.course.etat === 'SAFETY_CAR', null, 5000, 'l\'état SAFETY_CAR n\'est pas atteint');
    await page.evaluate(() => { formule1.course.selection = null; formule1.camera.choisirMode('tv'); });
    await attendre(7000);
    const sc = await page.evaluate(() => ({ drapeau: formule1.course.drapeau, roule: formule1.course.safetyCar.vitesse > 0.2 }));
    verifier(sc.drapeau === 'sc', `drapeau ${sc.drapeau} au lieu de « sc »`);
    noter(`safety car en piste (déjà sortie après la panne : ${deja === 'SAFETY_CAR' ? 'oui' : 'non'}), drapeau ${sc.drapeau}, caméra TV`);
  });

  await etape('Ambiance : jour, nuit et pluie', async noter => {
    await ouvrirReglages();
    await sousTitre('Ambiance', 'Le moment de la journée change l\'éclairage : du jour au crépuscule…', 'crepuscule');
    await menu('f1-moment', 'crepuscule');
    await attendre(3000);
    await sousTitre('Ambiance', '… puis la nuit : phares, piste éclairée, ciel étoilé.', 'nuit');
    await menu('f1-moment', 'nuit');
    await attendre(1000);
    await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); formule1.camera.choisirMode('circuit'); });
    await attendre(3500);
    const nuit = await page.evaluate(() => formule1.obscurite);
    await ouvrirReglages();
    await sousTitre('Pluie', 'Météo « manuel » et intensité de pluie au maximum : la piste se mouille, l\'adhérence baisse, gerbes d\'eau.', 'pluie');
    await menu('f1-moment', 'jour');
    await menu('f1-mode-meteo', 'manuel');
    await curseur('f1-intensite-pluie', 0.9);
    await attendre(1200);
    await page.evaluate(() => {
      if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer();
      formule1.choisirVoiture(formule1.course.leader);
      formule1.camera.choisirMode('suivi');
    });
    const pluie = await attendreQue(() => ['PLUIE', 'ORAGE'].includes(formule1.course.meteo.etat) && formule1.course.meteo.etat, null, 30000,
      'la pluie n\'arrive pas');
    await sousTitre('Pluie', `État de la piste : ${pluie}. Les voitures freinent plus tôt et glissent davantage.`, 'pluie-etat');
    await attendre(6000);
    const humidite = await page.evaluate(() => formule1.course.meteo.humidite);
    verifier(nuit > 0.3, `obscurité de nuit trop faible (${nuit})`);
    noter(`obscurité de nuit ${nuit.toFixed(2)} ; météo ${pluie}, humidité ${humidite.toFixed(2)}`);
    // retour au sec pour la suite
    await page.evaluate(() => formule1.regler('modeMeteo', 'sec'));
    await page.evaluate(() => { document.getElementById('f1-mode-meteo').value = 'sec'; });
  });

  await etape('Onglets du panneau latéral', async noter => {
    await page.evaluate(() => formule1.camera.choisirMode('circuit'));
    const onglets = [
      ['telemetrie', 'Télémétrie', 'Télémétrie : vitesse, gaz et frein du pilote choisi, comparés à un autre pilote.', '#f1-tele-graphes *'],
      ['prediction', 'Prédiction', 'Prédiction : probabilités de victoire, de podium et de top 5 estimées pendant la course.', '#f1-pred-lignes > *'],
      ['historique', 'Historique', 'Historique : l\'évolution des positions tour après tour et les faits de course.', '#f1-histo-svg *'],
      ['reglages', 'Réglages', 'Réglages : tous les curseurs du jeu (seek, arrive, wander, météo, incidents…), actifs pendant la course.', '#f1-reglages *'],
    ];
    const resultats = [];
    for (const [id, titre, texte, contenu] of onglets) {
      await sousTitre(`Panneau · ${titre}`, texte, `onglet-${id}`);
      // panneau fermé : le rail d'icônes ; panneau ouvert : les onglets de son en-tête
      const ouvert = await page.evaluate(() => interfaceF1.panneau.ouvert);
      await page.click(ouvert ? `#f1-onglet-${id}` : `#f1-rail-${id}`);
      await attendre(400);
      await page.evaluate(i => { if (!interfaceF1.panneau.ouvert || interfaceF1.panneau.onglet !== i) interfaceF1.panneau.ouvrir(i); }, id);
      await surligner(`#f1-page-${id}`);
      await attendre(3200);
      const r = await page.evaluate(([i, s]) => ({ visible: !document.getElementById(`f1-page-${i}`).hidden, elements: document.querySelectorAll(s).length }), [id, contenu]);
      resultats.push(`${titre} : ${r.elements} élément(s)`);
      verifier(r.visible, `l'onglet ${titre} ne s'affiche pas`);
      verifier(r.elements > 0, `l'onglet ${titre} est vide`);
    }
    await surligner(null);
    noter(resultats.join(' ; '));
  });

  await etape('Page « Entraînement IA » : générations à vitesse maximale', async noter => {
    await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
    await sousTitre('Entraînement IA', 'Le bouton « Entraînement IA » ouvre la page de neuroévolution : un petit réseau de neurones dose seek, arrive, wander et séparation.', 'ia-page');
    await surligner('#f1-bouton-entrainement');
    await attendre(1800);
    await surligner(null);
    await page.click('#f1-bouton-entrainement');
    await page.waitForSelector('#ia-page:not([hidden])', { timeout: 10000 });
    await attendreQue(() => pageEntrainement.entraineur !== null, null, 10000, 'l\'entraîneur n\'est pas créé');
    await attendre(1200);
    await sousTitre('Entraînement IA', 'Vitesse au maximum (20x), population de 20 voitures, graine fixe ; puis « Démarrer ».', 'ia-reglages');
    await curseur('ia-population', 20);
    await attendre(500);
    await curseur('ia-vitesse', 20);
    await attendre(800);
    await page.click('#ia-demarrer');
    await attendre(1500);
    await surligner('#ia-reseau-svg');
    await sousTitre('Le réseau', 'À gauche, le réseau 8 → 12 → 4 : 8 capteurs (bords, courbure, vitesse, voisine…) en entrée, les 4 poids des comportements en sortie.', 'ia-reseau');
    await attendre(6000);
    await surligner('#ia-fitness-svg');
    await sousTitre('Les courbes', 'À droite, la fitness de chaque génération (meilleure et moyenne) : sélection, croisement et mutation améliorent la population.', 'ia-courbes');
    await attendre(6000);
    await surligner('#ia-poids-svg');
    await sousTitre('Les poids', 'Les poids choisis par le meilleur réseau tout au long du tour : seek, arrive, wander et séparation.', 'ia-poids');
    const generation = await attendreQue(() => Number(document.getElementById('ia-generation').textContent) >= 4 && document.getElementById('ia-generation').textContent,
      null, 180000, 'moins de 4 générations en 3 minutes');
    await attendre(1500);
    await surligner(null);
    const r = await page.evaluate(() => ({
      reseau: document.querySelectorAll('#ia-reseau-svg line, #ia-reseau-svg path, #ia-reseau-svg circle').length,
      fitness: document.querySelectorAll('#ia-fitness-svg path, #ia-fitness-svg polyline').length,
      poids: document.querySelectorAll('#ia-poids-svg path, #ia-poids-svg polyline').length,
      meilleur: document.getElementById('ia-meilleur').textContent, statut: document.getElementById('ia-statut').textContent,
      note: document.getElementById('ia-note').textContent,
    }));
    await page.click('#ia-pause');
    noter(`génération ${generation}, meilleure fitness ${r.meilleur}, note ${r.note}, ${r.statut} ; SVG : réseau ${r.reseau}, fitness ${r.fitness}, poids ${r.poids} tracés`);
    verifier(r.reseau > 10, 'le réseau n\'est pas dessiné');
    verifier(r.fitness > 0, 'aucune courbe de fitness');
  });

  await etape('Sauvegarde du modèle', async noter => {
    await sousTitre('Sauvegarde', `On nomme le meilleur réseau « ${NOM_MODELE} » et on le sauvegarde (stockage local du navigateur).`, 'sauvegarde');
    await page.click('#ia-nom-modele');
    await page.fill('#ia-nom-modele', '');
    await page.locator('#ia-nom-modele').pressSequentially(NOM_MODELE, { delay: 70 });
    await attendre(600);
    await page.click('#ia-sauvegarder');
    await attendre(2000);
    const r = await page.evaluate(nom => ({ message: document.getElementById('ia-message').textContent,
      liste: gestionnaireModeles.liste().some(m => m.nom === nom), stocke: Object.keys(localStorage).length }), NOM_MODELE);
    verifier(r.message.includes('sauvegardé'), `message inattendu : « ${r.message} »`);
    verifier(r.liste, 'le modèle n\'apparaît pas dans la liste');
    noter(`message « ${r.message} » ; ${r.stocke} clé(s) dans localStorage`);
    await sousTitre('Sauvegarde', 'Retour à la course.', 'retour-course');
    await attendre(1200);
    await page.click('#ia-retour');
    await page.waitForSelector('#ia-page', { state: 'hidden', timeout: 5000 });
  });

  await etape('Course contre les adversaires « IA entraînée »', async noter => {
    await sousTitre('Course IA entraînée', `Menu JOUER : Solo, 1 tour, adversaires « IA entraînée » avec le modèle « ${NOM_MODELE} ».`, 'ia-course-menu');
    await menuJouer({ mode: 'Solo', tours: 1, adversaires: 'IA entraînée', modele: NOM_MODELE });
    await attendre(1200);
    await choisirVoitureAuClic(5);
    await page.evaluate(() => window.__demo.clavier(true));
    await page.evaluate(() => window.__demo.pilote(true));
    await attendre(800);
    const r = await page.evaluate(() => {
      const c = formule1.course;
      return { neuronales: c.voitures.filter(v => v instanceof VoitureNeuronale).length, modele: c.parametres.modeleIA?.nom ?? null,
        badges: document.querySelectorAll('#f1-tour-lignes .ia-badge-ligne').length };
    });
    await surligner('#f1-tour');
    await sousTitre('Course IA entraînée', 'Le badge « IA » du classement marque les voitures dont le réseau entraîné dose les comportements à chaque image.', 'ia-badges');
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 25000, 'la course ne part pas');
    await attendre(3000);
    await surligner(null);
    await page.evaluate(() => formule1.camera.choisirMode('tv'));
    await sousTitre('Course IA entraînée', 'Un tour de course contre les IA (la voiture du joueur est conduite par les touches simulées).', 'ia-course');
    verifier(r.modele === NOM_MODELE, `modèle des adversaires : ${r.modele}`);
    verifier(r.neuronales >= 10, `${r.neuronales} VoitureNeuronale seulement`);
    verifier(r.badges >= 10, `${r.badges} badges IA dans le classement`);
    noter(`${r.neuronales} adversaires VoitureNeuronale, modèle « ${r.modele} », ${r.badges} badges IA`);
  });

  await etape('Arrivée et podium', async noter => {
    await attendreQue(() => formule1.course.etat === 'ARRIVEE', null, 120000, 'pas de drapeau à damier en 2 minutes');
    await sousTitre('Arrivée', 'Drapeau à damier ! Chaque voiture le reçoit à son passage sur la ligne.', 'arrivee');
    await page.evaluate(() => formule1.camera.choisirMode('circuit'));
    await attendreQue(() => formule1.course.etat === 'FIN', null, 120000, 'tout le monde n\'arrive pas en 2 minutes');
    await page.evaluate(() => window.__demo.pilote(false));
    await page.evaluate(() => window.__demo.clavier(false));
    await sousTitre('Podium', 'Les trois premiers rejoignent le podium…', 'podium-arrivee');
    await page.waitForSelector('#f1-podium:not([hidden])', { timeout: 15000 });
    await attendre(800);
    await sousTitre('Podium', 'Podium de fin : vainqueur, marches, classement final, points et meilleur tour. Boutons REJOUER et MENU.', 'podium');
    await surligner('#f1-podium .podium-marches');
    await attendre(4000);
    await surligner('#f1-podium .podium-classement');
    await attendre(3500);
    await surligner(null);
    const r = await page.evaluate(() => ({ titre: document.querySelector('#f1-podium .podium-victoire')?.textContent ?? '',
      lignes: document.querySelectorAll('#f1-podium .podium-classement *').length,
      rejouer: [...document.querySelectorAll('#f1-podium button')].some(b => b.textContent.includes('REJOUER')) }));
    verifier(r.titre.startsWith('VICTOIRE DE'), `titre du podium : « ${r.titre} »`);
    verifier(r.rejouer, 'pas de bouton REJOUER sur le podium');
    noter(`« ${r.titre} », classement final affiché, bouton REJOUER présent`);
  });

  await etape('Écran REJOUER (défi « Tour rapide »)', async noter => {
    await sousTitre('Écran REJOUER', 'En mode Défi, l\'arrivée forme le mot REJOUER avec des points d\'encre qui se placent en « arrive ».', 'rejouer-defi');
    await page.keyboard.press('Escape');
    await attendre(800);
    await ouvrirReglages();
    await menu('f1-mode', 'defi');
    await attendre(500);
    await menu('f1-defi', 'tourRapide');
    await cliquerPanneau('f1-defi-lancer');
    await curseur('f1-vitesse-simulation', 2.5);
    await page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
    // après MENU, la course attend en pause : le bouton Pause de la barre du haut la relance
    if (await page.evaluate(() => formule1.course.pause)) await page.click('#f1-bouton-pause');
    await page.evaluate(() => window.__demo.clavier(true));
    await page.evaluate(() => window.__demo.pilote(true));
    await sousTitre('Défi « Tour rapide »', 'Trois tours, simulation accélérée 2,5x ; le pilote automatique envoie toujours les touches W A S D.', 'defi');
    await attendreQue(() => formule1.course.etat === 'COURSE', null, 25000, 'le défi ne part pas');
    await page.evaluate(() => formule1.camera.choisirMode('tv'));
    await attendreQue(() => formule1.course.etat === 'FIN', null, 240000, 'le défi ne se termine pas en 4 minutes');
    await page.evaluate(() => window.__demo.pilote(false));
    await page.evaluate(() => window.__demo.clavier(false));
    await page.waitForSelector('#f1-rejouer:not([hidden])', { timeout: 15000 });
    await sousTitre('Écran REJOUER', 'Le mot REJOUER se forme ; Entrée rejoue, Échap revient au menu. Fin de la démonstration.', 'rejouer');
    await attendre(7000);
    const r = await page.evaluate(() => ({ boutons: [...document.querySelectorAll('#f1-rejouer button')].map(b => b.textContent),
      bilan: document.querySelector('#f1-rejouer .rejouer-bilan')?.textContent ?? '', ecranFin: formule1.ecranFin !== null }));
    verifier(r.ecranFin, 'l\'écran de fin (points REJOUER) n\'existe pas');
    verifier(r.boutons.includes('REJOUER'), 'pas de bouton REJOUER');
    noter(`boutons ${r.boutons.join(' / ')} ; bilan : ${r.bilan.replace(/\s+/g, ' ').trim()}`);
    await sousTitre('En résumé', 'Steering behaviors, course complète, multijoueur et IA entraînée par neuroévolution : merci d\'avoir regardé !', 'conclusion');
    await sousTitre('', '');
    await attendre(1500);
  });

  return debutUtile;
}

// --- Programme principal ---------------------------------------------------------------------

async function principal() {
  rmSync(BRUT, { recursive: true, force: true });
  rmSync(CAPTURES, { recursive: true, force: true });
  mkdirSync(BRUT, { recursive: true });
  const debut = Date.now();
  const { serveur, url } = await demarrerServeur();
  console.log(`Serveur : ${url}`);
  // sans fenêtre, avec le GPU (Direct3D 11 sous Windows) : 60 images/s en 1920 × 1080, contre ≈ 30
  // avec le rendu logiciel par défaut
  const navigateur = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const contexte = await navigateur.newContext({ viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: 1,
    recordVideo: { dir: BRUT, size: { width: LARGEUR, height: HAUTEUR } }, locale: 'fr-FR' });
  const debutVideo = Date.now();
  page = await contexte.newPage();
  page.on('console', m => { if (m.type() === 'error') erreursConsole.push({ texte: m.text(), quand: horodatage() }); });
  page.on('pageerror', e => erreursConsole.push({ texte: `exception : ${e.message}`, quand: horodatage() }));
  let debutUtile = 0;
  let images = null;
  try {
    debutUtile = await scenario(url, debutVideo);
    images = await page.evaluate(() => new Promise(r => {
      let n = 0;
      const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); };
      requestAnimationFrame(f);
    }));
  } catch (erreur) {
    etapes.push({ nom: 'Scénario interrompu', ok: false, detail: String(erreur.message ?? erreur), verifs: [], capture: null, duree: '0' });
  }
  const video = page.video();
  const finVideo = Date.now();
  await contexte.close();
  await navigateur.close();
  serveur.kill();
  const brute = video ? await video.path() : readdirSync(BRUT).map(n => join(BRUT, n))[0];

  // Horloge du script -> temps de la vidéo : l'enregistreur démarre un peu après newContext ; ce
  // retard est la différence entre la durée écoulée (jusqu'à la fermeture) et la durée du .webm.
  const dureeBrute = dureeMedia(brute);
  const retard = dureeBrute === null ? 0 : Math.min(5, Math.max(-5, (finVideo - debutVideo) / 1000 - dureeBrute));
  const debutCoupe = Math.max(0, debutUtile - retard - 0.3);

  // Conversion : H.264 à 30 images/s (le .webm de Playwright a une cadence variable), début de la
  // vidéo coupé (page blanche du chargement) ; sinon le .webm tel quel.
  const ffmpeg = cheminFfmpeg();
  let sortie;
  let coupe = debutCoupe;
  if (ffmpeg !== null) {
    sortie = join(VIDEOS, 'demo-f1.mp4');
    const r = spawnSync(ffmpeg, ['-y', '-ss', debutCoupe.toFixed(3), '-i', brute, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', '18', '-tune', 'animation', '-movflags', '+faststart', '-an', sortie], { stdio: 'inherit' });
    if (r.status !== 0) {
      sortie = join(VIDEOS, 'demo-f1.webm');
      renameSync(brute, sortie);
      coupe = 0;
    }
  } else {
    sortie = join(VIDEOS, 'demo-f1.webm');
    renameSync(brute, sortie);
    coupe = 0;
  }
  ecrireTimeline({ sortie, debutVideo, retard, coupe, finVideo });
  // instants recalés sur l'image (décalage entre l'horloge du script et l'enregistreur)
  try {
    const d = calerFichiers();
    console.log(`Chronologie recalée sur l'image : ${d >= 0 ? '+' : ''}${d.toFixed(3)} s`);
  } catch (erreur) {
    console.log(`Calage de la chronologie impossible : ${erreur.message}`);
  }
  if (existsSync(join(VIDEOS, 'demo-f1.webm')) && sortie.endsWith('.mp4')) rmSync(join(VIDEOS, 'demo-f1.webm'));
  if (sortie.endsWith('.mp4')) {
    // le .webm brut est gardé à côté, pour comparaison
    renameSync(brute, join(VIDEOS, 'demo-f1-brut.webm'));
  }
  rmSync(BRUT, { recursive: true, force: true });

  ecrireRapport({ sortie, duree: (Date.now() - debut) / 1000, images, ffmpeg });
  const ko = etapes.filter(e => !e.ok).length;
  console.log(`\nVidéo : ${sortie}\nRapport : ${join(DEMO, 'rapport.md')}\n${etapes.length - ko}/${etapes.length} étapes OK`);
  process.exitCode = ko === 0 ? 0 : 1;
}

// Durée d'un fichier vidéo ou audio (ffprobe de ffprobe-static, ou celui du système) ; null sinon.
function dureeMedia(fichier) {
  const candidats = [join(DEMO, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'), 'ffprobe'];
  for (const ffprobe of candidats) {
    if (ffprobe !== 'ffprobe' && !existsSync(ffprobe)) continue;
    const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier], { encoding: 'utf8' });
    const d = Number(String(r.stdout).trim());
    if (r.status === 0 && Number.isFinite(d) && d > 0) return d;
  }
  return null;
}

// timeline.json : chaque sous-titre affiché, avec ses instants dans la vidéo finale (secondes),
// pour placer la voix off (voix.mjs --montage) ; narration.json reçoit début et durée affichée.
function ecrireTimeline({ sortie, debutVideo, retard, coupe, finVideo }) {
  const enVideo = t => Math.round(((t - debutVideo) / 1000 - retard - coupe) * 1000) / 1000;
  const sousTitres = chronologie.map((s, k) => {
    const debut = Math.max(0, enVideo(s.debut));
    const fin = enVideo(s.fin ?? finVideo);
    return { ordre: k + 1, id: s.id, chapitre: s.chapitre, texte: s.texte, debut, fin, duree: Math.round((fin - debut) * 1000) / 1000 };
  });
  writeFileSync(join(DEMO, 'timeline.json'), `${JSON.stringify({ video: relative(DEMO, sortie).split('\\').join('/'), date: horodatage(),
    retardEnregistreur: Math.round(retard * 1000) / 1000, debutCoupe: Math.round(coupe * 1000) / 1000, sousTitres }, null, 2)}\n`, 'utf8');
  try {
    const chemin = join(DEMO, 'narration.json');
    const narration = JSON.parse(readFileSync(chemin, 'utf8'));
    for (const r of narration) {
      const s = sousTitres.find(x => x.id === r.id);
      r.debut = s ? Math.round(s.debut * 100) / 100 : null;
      r.duree = s ? Math.round(s.duree * 100) / 100 : null;
    }
    writeFileSync(chemin, `${JSON.stringify(narration, null, 2)}\n`, 'utf8');
  } catch { /* pas de narration.json : la chronologie suffit */ }
}

function ecrireRapport({ sortie, duree, images, ffmpeg }) {
  const rel = chemin => relative(DEMO, chemin).split('\\').join('/');
  const echappe = texte => String(texte).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const ok = etapes.filter(e => e.ok).length;
  const lignes = [
    '# Rapport de la démonstration automatique',
    '',
    `- Date : ${horodatage()}`,
    `- Résultat : **${ok}/${etapes.length} étapes OK**`,
    `- Vidéo : \`${rel(sortie)}\`${sortie.endsWith('.mp4') ? ' (H.264, 30 images/s ; brut Playwright : `videos/demo-f1-brut.webm`)' : ' (ffmpeg absent : .webm de Playwright)'}`,
    `- Durée du script : ${(duree / 60).toFixed(1)} min ; fenêtre 1920 × 1080, Chromium sans fenêtre (GPU)` +
      (images === null ? '' : ` ; ${images.toFixed(0)} images/s mesurées en fin de scénario`),
    `- ffmpeg : ${ffmpeg === null ? 'absent' : 'ffmpeg-static'}`,
    `- Erreurs dans la console : **${erreursConsole.length}**`,
    '',
    '| # | Étape | Résultat | Durée | Vérifications / détail | Capture |',
    '|---|---|---|---|---|---|',
    ...etapes.map((e, k) => `| ${k + 1} | ${echappe(e.nom)} | ${e.ok ? 'OK' : '**KO**'} | ${e.duree} s | ${echappe([...e.verifs, e.detail].filter(Boolean).join(' ; '))} | ${e.capture ? `[capture](${rel(e.capture)})` : ''} |`),
    '',
    '## Console',
    '',
    erreursConsole.length === 0 ? 'Aucune erreur (`console.error` ou exception) pendant tout le scénario.'
      : erreursConsole.map(e => `- ${e.quand} : ${echappe(e.texte)}`).join('\n'),
    '',
    '## Méthode',
    '',
    '- Le jeu n\'est pas modifié : le script ajoute à la page un calque temporaire (sous-titres, cadre de surlignage, clavier) et pilote le jeu par des clics, des touches, les curseurs et boutons du panneau, et l\'API publique du contrôleur (`formule1`) là où un clic à l\'écran serait fragile (choix du pilote suivi, caméra).',
    '- Graines fixes : course, météo, incidents et entraînement ont leurs graines (constantes du jeu, graine 1 de l\'entraînement) ; `randomSeed` de p5 est fixé pour `wander()`.',
    '- Événements rares déclenchés de façon sûre : usure des pneus et seuil de stand au maximum (pit stop), bouton VSC, bouton Panne, bouton Safety car, météo « manuel » + intensité 0,9 (pluie) ; vitesse d\'impact au maximum (150 km/h) pour qu\'un contact léger du pilote automatique reste un frôlement.',
    '- Mode pilote : un pilote automatique dans la page envoie des événements clavier W / A / S / D / Espace (avec `key` et `keyCode`, lus par p5) ; il vise la ligne de course et suit le profil de vitesse de la voiture.',
    '- Multijoueur local : le même pilote automatique conduit les deux voitures en même temps, chacune avec ses touches (J1 : W A S D + Espace ; J2 : flèches + Entrée). Le dépassement entre joueurs est mis en scène en ligne droite : celui de devant vise 85 % de sa vitesse, l\'autre décale sa trajectoire de 26 px.',
    '',
  ];
  writeFileSync(join(DEMO, 'rapport.md'), lignes.join('\n'), 'utf8');
}

principal().catch(erreur => {
  console.error(erreur);
  process.exitCode = 1;
});
