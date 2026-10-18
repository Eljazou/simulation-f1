// Vérification du jeu servi par HTTP (serveur local ou GitHub Pages), avec Playwright.
//   node verifier-site.mjs <url> [capture.jpg]
// Contrôles : aucune réponse HTTP en erreur (404…), aucune requête échouée, aucune erreur dans la
// console ; canvas affiché ; la course démarre ; la page « Entraînement IA » s'ouvre. Code de
// sortie 1 si un contrôle échoue.
import { chromium } from 'playwright';

const url = process.argv[2];
const capture = process.argv[3] ?? null;
if (!url) {
  console.error('Usage : node verifier-site.mjs <url> [capture.jpg]');
  process.exit(2);
}

const resultats = [];
const noter = (nom, ok, detail = '') => {
  resultats.push({ nom, ok, detail });
  console.log(`${ok ? 'OK' : 'KO'}  ${nom}${detail ? ` : ${detail}` : ''}`);
};

const navigateur = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await (await navigateur.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'fr-FR' })).newPage();
const erreursHttp = [];
const echecs = [];
const console_ = [];
page.on('response', r => { if (r.status() >= 400) erreursHttp.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', r => echecs.push(`${r.failure()?.errorText ?? 'échec'} ${r.url()}`));
page.on('console', m => { if (m.type() === 'error') console_.push(m.text()); });
page.on('pageerror', e => console_.push(`exception : ${e.message}`));

try {
  const reponse = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  noter('Page chargée', reponse !== null && reponse.ok(), reponse ? `HTTP ${reponse.status()}` : 'pas de réponse');
  await page.waitForFunction(() => typeof formule1 !== 'undefined' && formule1 && formule1.demarre, null, { timeout: 60000 });
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { l: c.width, h: c.height } : null;
  });
  noter('Canvas du jeu affiché', canvas !== null && canvas.l > 0 && canvas.h > 0, canvas ? `${canvas.l} × ${canvas.h}` : 'absent');
  await page.waitForFunction(() => formule1.course.etat === 'COURSE', null, { timeout: 60000 })
    .then(() => noter('La course démarre', true, 'feux puis départ'))
    .catch(() => noter('La course démarre', false, `état ${'?'}`));
  await page.waitForTimeout(6000);
  const roulent = await page.evaluate(() => formule1.course.voitures.filter(v => v.vitesse > 0.5).length);
  noter('Les voitures roulent', roulent >= 10, `${roulent} voitures en mouvement`);
  if (capture) await page.screenshot({ path: capture, type: 'jpeg', quality: 85 });
  await page.click('#f1-bouton-entrainement');
  const entrainement = await page.waitForSelector('#ia-page:not([hidden])', { timeout: 15000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(1500);
  const reseau = await page.evaluate(() => document.querySelectorAll('#ia-reseau-svg circle').length);
  noter('Page « Entraînement IA » ouverte', entrainement && reseau > 0, `${reseau} neurones dessinés`);
  const modele = await page.evaluate(() => gestionnaireModeles.liste().map(m => m.nom));
  noter('Modèle entraîné fourni disponible', modele.length > 0, modele.join(', '));
} catch (erreur) {
  noter('Scénario de vérification', false, String(erreur.message ?? erreur).split('\n')[0]);
}
noter('Aucune erreur HTTP (404…)', erreursHttp.length === 0, erreursHttp.join(' | '));
noter('Aucune requête échouée', echecs.length === 0, echecs.join(' | '));
noter('Aucune erreur dans la console', console_.length === 0, console_.join(' | '));
await navigateur.close();
const ko = resultats.filter(r => !r.ok).length;
console.log(`${resultats.length - ko}/${resultats.length} contrôles OK`);
process.exitCode = ko === 0 ? 0 : 1;
