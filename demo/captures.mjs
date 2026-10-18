// Captures d'écran du README (docs/screenshots/), prises dans le vrai jeu avec Playwright.
//   cd demo && node captures.mjs
// Même environnement que demo.mjs (serveur local, Chromium sans fenêtre avec GPU, 1920 × 1080) ;
// le pilote automatique de outils-page.js conduit la voiture du joueur ; aucun sous-titre.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = dirname(fileURLToPath(import.meta.url));
const RACINE = dirname(DEMO);
const SORTIE = join(RACINE, 'docs', 'screenshots');

const portLibre = () => new Promise((resoudre, rejeter) => {
  const s = createServer();
  s.once('error', rejeter);
  s.listen(0, () => {
    const { port } = s.address();
    s.close(() => resoudre(port));
  });
});

async function principal() {
  mkdirSync(SORTIE, { recursive: true });
  const port = await portLibre();
  const serveur = spawn(process.execPath, [join(RACINE, 'serveur.mjs'), String(port)], { cwd: RACINE, stdio: 'ignore' });
  const url = `http://localhost:${port}/`;
  for (let k = 0; k < 50; k++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch { /* pas encore prêt */ }
    await new Promise(r => setTimeout(r, 200));
  }
  const navigateur = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await (await navigateur.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'fr-FR' })).newPage();
  const attendre = ms => page.waitForTimeout(ms);
  const quand = (f, arg, delai = 60000) => page.waitForFunction(f, arg, { timeout: delai, polling: 100 });
  const capture = async nom => {
    await page.screenshot({ path: join(SORTIE, nom), type: 'jpeg', quality: 85 });
    console.log(`docs/screenshots/${nom}`);
  };
  const fermerPanneau = () => page.evaluate(() => { if (interfaceF1.panneau.ouvert) interfaceF1.panneau.basculer(); });
  const partie = (mode, tours, joueurs) => page.evaluate(([m, t, j]) => {
    interfaceF1.lancerPartie({ mode: m, profil: 'classique', tours: t, ambiance: 'jour', adversaires: 'classiques' });
    j.forEach(rang => formule1.choisirVoiture(formule1.course.voitures[rang]));
    window.__demo.pilote(true);
  }, [mode, tours, joueurs]);

  try {
    await page.goto(url);
    await quand(() => typeof formule1 !== 'undefined' && formule1 && formule1.demarre && interfaceF1 !== null, null, 30000);
    await page.addScriptTag({ path: join(DEMO, 'outils-page.js') });
    await page.evaluate(() => {
      randomSeed(2026);
      formule1.regler('vitesseImpact', 150);
      formule1.regler('vitesseSimulation', 1.5);
      formule1.regler('nombreTours', 12);
    });
    await fermerPanneau();

    // 1. course vue d'ensemble : classement, mini-carte, peloton
    await page.evaluate(() => { formule1.recommencer(); formule1.camera.choisirMode('circuit'); });
    await quand(() => formule1.course.etat === 'COURSE');
    await attendre(9000);
    await capture('01-course.jpg');

    // 2. nuit et pluie, caméra sur le leader
    await page.evaluate(() => {
      formule1.afficher('moment', 'nuit');
      formule1.regler('modeMeteo', 'manuel');
      formule1.regler('intensitePluie', 0.9);
      formule1.choisirVoiture(formule1.course.leader);
      formule1.camera.choisirMode('suivi');
    });
    await quand(() => ['PLUIE', 'ORAGE'].includes(formule1.course.meteo.etat));
    await attendre(4000);
    await capture('02-nuit-pluie.jpg');
    await page.evaluate(() => { formule1.afficher('moment', 'jour'); formule1.regler('modeMeteo', 'sec'); formule1.camera.choisirMode('circuit'); });

    // 3. panneau latéral : télémétrie du pilote choisi
    await attendre(3000);
    await page.evaluate(() => interfaceF1.panneau.ouvrir('telemetrie'));
    await attendre(4000);
    await capture('03-telemetrie.jpg');
    await fermerPanneau();

    // 4. mode pilote (HUD, caméra embarquée de suivi)
    await partie('solo', 5, [3]);
    await quand(() => formule1.course.etat === 'COURSE');
    await attendre(9000);
    await capture('04-mode-pilote.jpg');

    // 5. multijoueur local : écran partagé
    await page.evaluate(() => window.__demo.pilote(false));
    await partie('duo', 5, [4, 5]);
    await quand(() => formule1.course.etat === 'COURSE' && formule1.course.multijoueur);
    await attendre(9000);
    await capture('05-multijoueur.jpg');

    // 6. page d'entraînement (neuroévolution)
    await page.evaluate(() => window.__demo.pilote(false));
    await page.click('#f1-bouton-entrainement');
    await quand(() => pageEntrainement.entraineur !== null);
    await page.evaluate(() => {
      for (const [id, v] of [['ia-population', 20], ['ia-vitesse', 20]]) {
        const e = document.getElementById(id);
        e.value = String(v);
        e.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.click('#ia-demarrer');
    await quand(() => Number(document.getElementById('ia-generation').textContent) >= 3, null, 180000);
    await capture('06-entrainement.jpg');
    await page.click('#ia-pause');
    await page.click('#ia-retour');

    // 7. podium de fin (course d'un tour)
    await partie('solo', 1, [3]);
    await page.waitForSelector('#f1-podium:not([hidden])', { timeout: 180000 });
    await attendre(1500);
    await capture('07-podium.jpg');
  } finally {
    await navigateur.close();
    serveur.kill();
  }
}

principal().catch(erreur => {
  console.error(erreur);
  process.exitCode = 1;
});
