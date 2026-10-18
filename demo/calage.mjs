// Calage de timeline.json sur l'image : l'horloge du script et celle de l'enregistreur de
// Playwright diffèrent d'un décalage constant (≈ 0,5 s, mesuré), que la durée du .webm ne donne pas
// exactement. Pour chaque sous-titre, on cherche dans la vidéo l'image où la zone du sous-titre
// change le plus, près de l'instant noté ; l'écart médian (robuste : une autre animation dans la
// zone ne le fausse pas) est appliqué à toute la chronologie.
//   node calage.mjs        recale timeline.json (et narration.json) sur videos/demo-f1.mp4
// demo.mjs l'appelle après chaque enregistrement.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = dirname(fileURLToPath(import.meta.url));
// Zone des sous-titres dans l'image 1920 × 1080 (bas de l'écran), réduite pour la comparaison.
const ZONE = 'crop=1400:150:260:900';
const LARGEUR = 140;
const HAUTEUR = 15;
// Fenêtre de recherche autour de l'instant noté (secondes).
const AVANT = 2;
const APRES = 1;

function ffmpeg() {
  const p = join(DEMO, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  return existsSync(p) ? p : 'ffmpeg';
}

// Instant (secondes) du plus grand changement de la zone des sous-titres entre debut et fin.
function changement(video, debut, duree) {
  const r = spawnSync(ffmpeg(), ['-loglevel', 'error', '-ss', debut.toFixed(3), '-t', duree.toFixed(3), '-i', video,
    '-vf', `${ZONE},scale=${LARGEUR}:${HAUTEUR},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const taille = LARGEUR * HAUTEUR;
  const images = Math.floor(r.stdout.length / taille);
  let meilleur = 0;
  let indice = -1;
  for (let i = 1; i < images; i++) {
    let d = 0;
    for (let p = 0; p < taille; p++) d += Math.abs(r.stdout[i * taille + p] - r.stdout[(i - 1) * taille + p]);
    if (d > meilleur) {
      meilleur = d;
      indice = i;
    }
  }
  return indice < 0 ? null : debut + indice / 30;
}

// Recale la chronologie (objet de timeline.json) ; renvoie le décalage appliqué (secondes).
export function caler(timeline, video) {
  const ecarts = [];
  for (const s of timeline.sousTitres) {
    const debut = Math.max(0, s.debut - AVANT);
    const t = changement(video, debut, s.debut - debut + APRES);
    if (t !== null) ecarts.push(t - s.debut);
  }
  if (ecarts.length === 0) return 0;
  ecarts.sort((a, b) => a - b);
  const decalage = Math.round(ecarts[Math.floor(ecarts.length / 2)] * 1000) / 1000;
  const arrondi = x => Math.round(x * 1000) / 1000;
  for (const s of timeline.sousTitres) {
    s.debut = arrondi(Math.max(0, s.debut + decalage));
    s.fin = arrondi(s.fin + decalage);
    s.duree = arrondi(s.fin - s.debut);
  }
  timeline.calage = { decalage, mesures: ecarts.length, ecartMin: arrondi(ecarts[0]), ecartMax: arrondi(ecarts.at(-1)) };
  return decalage;
}

// Programme : recale timeline.json et met à jour début et durée dans narration.json.
export function calerFichiers() {
  const cheminTimeline = join(DEMO, 'timeline.json');
  const timeline = JSON.parse(readFileSync(cheminTimeline, 'utf8'));
  // un calage déjà appliqué est d'abord retiré (relancer le calage ne le cumule pas)
  if (timeline.calage) {
    for (const s of timeline.sousTitres) {
      s.debut -= timeline.calage.decalage;
      s.fin -= timeline.calage.decalage;
    }
  }
  const decalage = caler(timeline, join(DEMO, timeline.video));
  writeFileSync(cheminTimeline, `${JSON.stringify(timeline, null, 2)}\n`, 'utf8');
  const cheminNarration = join(DEMO, 'narration.json');
  if (existsSync(cheminNarration)) {
    const narration = JSON.parse(readFileSync(cheminNarration, 'utf8'));
    for (const r of narration) {
      const s = timeline.sousTitres.find(x => x.id === r.id);
      r.debut = s ? Math.round(s.debut * 100) / 100 : null;
      r.duree = s ? Math.round(s.duree * 100) / 100 : null;
    }
    writeFileSync(cheminNarration, `${JSON.stringify(narration, null, 2)}\n`, 'utf8');
  }
  return decalage;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const d = calerFichiers();
  console.log(`Chronologie recalée sur l'image : décalage ${d >= 0 ? '+' : ''}${d.toFixed(3)} s.`);
}
