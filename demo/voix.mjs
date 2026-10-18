// Voix off de la démonstration : synthèse vocale de narration.json, puis montage sur la vidéo.
//   node voix.mjs --synthese   un fichier audio par réplique (audio/), durée mesurée avec ffprobe
//   node voix.mjs --montage    chaque réplique à l'instant de son sous-titre (timeline.json, écrit
//                              par demo.mjs pendant l'enregistrement), mixage, normalisation,
//                              fusion avec videos/demo-f1.mp4 -> videos/demo-f1-voix.mp4
//   node voix.mjs              les deux (après une modification de texte : pas de nouvel
//                              enregistrement vidéo)
// Synthèse : edge-tts (gratuit, sans clé), voix VOIX ci-dessous ; sans edge-tts, la voix Windows
// (System.Speech, par PowerShell). Une réplique n'est regénérée que si son texte ou la voix change.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Réglages ------------------------------------------------------------------------------
// Voix edge-tts (liste : edge-tts --list-voices) : fr-FR-DeniseNeural, fr-FR-HenriNeural,
// fr-FR-EloiseNeural, fr-CA-SylvieNeural… La variable d'environnement VOIX la remplace.
const VOIX = process.env.VOIX ?? 'fr-FR-HenriNeural';
// Débit de la voix edge-tts (« +0% » : normal ; « -5% » plus posé).
const DEBIT = process.env.DEBIT ?? '+0%';
// Voix Windows de secours (System.Speech) : la première voix française installée sinon.
const VOIX_SECOURS = 'Microsoft Hortense Desktop';
// Marge après chaque réplique avant le sous-titre suivant (secondes).
const MARGE = 0.5;
// Accélération maximale permise (1,10 = 10 %) quand une réplique dépasse la place disponible.
const ACCELERATION_MAX = 1.1;
// Niveau visé par la normalisation (EBU R128, LUFS).
const NIVEAU = -16;

const DEMO = dirname(fileURLToPath(import.meta.url));
const AUDIO = join(DEMO, 'audio');
const NARRATION = join(DEMO, 'narration.json');
const TIMELINE = join(DEMO, 'timeline.json');
const VIDEO = join(DEMO, 'videos', 'demo-f1.mp4');
const SORTIE = join(DEMO, 'videos', 'demo-f1-voix.mp4');
const CACHE = join(AUDIO, 'cache.json');

const lireJson = (chemin, defaut) => (existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : defaut);
const ecrireJson = (chemin, valeur) => writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, 'utf8');

function binaire(module, ...chemins) {
  const p = join(DEMO, 'node_modules', module, ...chemins);
  if (existsSync(p)) return p;
  const nom = module.replace('-static', '');
  return spawnSync(nom, ['-version'], { stdio: 'ignore' }).status === 0 ? nom : null;
}
const FFMPEG = binaire('ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const FFPROBE = (() => {
  try {
    const dossier = join(DEMO, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch);
    const p = join(dossier, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (existsSync(p)) return p;
  } catch { /* absent */ }
  return spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0 ? 'ffprobe' : null;
})();

function executer(commande, args, options = {}) {
  const r = spawnSync(commande, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (r.status !== 0) throw new Error(`${commande} ${args.slice(0, 3).join(' ')}… : ${(r.stderr || r.error || '').toString().trim().split('\n').slice(-3).join(' ')}`);
  return r.stdout;
}

// Durée exacte d'un fichier audio ou vidéo (ffprobe), en secondes.
function duree(fichier) {
  if (FFPROBE === null) throw new Error('ffprobe introuvable (npm install dans demo/).');
  return Number(executer(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier]).trim());
}

// --- Synthèse ------------------------------------------------------------------------------

// edge-tts : l'exécutable, ou le module Python ; null s'il est absent.
function commandeEdgeTts() {
  if (spawnSync('edge-tts', ['--help'], { stdio: 'ignore' }).status === 0) return ['edge-tts'];
  for (const python of ['python', 'py', 'python3']) {
    if (spawnSync(python, ['-m', 'edge_tts', '--help'], { stdio: 'ignore' }).status === 0) return [python, '-m', 'edge_tts'];
  }
  return null;
}

function syntheseEdge(commande, texte, fichier) {
  const [exe, ...prefixe] = commande;
  executer(exe, [...prefixe, '--voice', VOIX, `--rate=${DEBIT}`, '--text', texte, '--write-media', fichier]);
}

// Voix Windows : System.Speech, vers un fichier WAV (le texte passe par un fichier UTF-8).
function syntheseWindows(texte, fichier) {
  const tampon = `${fichier}.txt`;
  writeFileSync(tampon, texte, 'utf8');
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    `$voix = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq '${VOIX_SECOURS}' }`,
    "if (-not $voix) { $voix = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'fr-*' } | Select-Object -First 1 }",
    'if ($voix) { $s.SelectVoice($voix.VoiceInfo.Name) }',
    `$s.SetOutputToWaveFile('${fichier.replace(/'/g, "''")}')`,
    `$s.Speak([IO.File]::ReadAllText('${tampon.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`,
    '$s.Dispose()',
  ].join('; ');
  executer('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
  rmSync(tampon, { force: true });
}

function synthese() {
  mkdirSync(AUDIO, { recursive: true });
  const narration = lireJson(NARRATION, null);
  if (!Array.isArray(narration)) throw new Error('narration.json introuvable ou illisible.');
  const ids = new Set();
  for (const r of narration) {
    if (!r.id || !r.texte) throw new Error(`réplique ${r.ordre} : id et texte obligatoires.`);
    if (ids.has(r.id)) throw new Error(`id en double dans narration.json : ${r.id}`);
    ids.add(r.id);
  }
  const edge = commandeEdgeTts();
  const moteur = edge !== null ? `edge-tts ${VOIX}` : `Windows (System.Speech) ${VOIX_SECOURS}`;
  if (edge === null) console.log('edge-tts absent : voix Windows de secours.');
  const cache = lireJson(CACHE, {});
  let faites = 0;
  for (const r of narration) {
    const empreinte = createHash('sha1').update(`${moteur}|${DEBIT}|${r.texte}`).digest('hex').slice(0, 12);
    const base = `${String(r.ordre).padStart(2, '0')}-${r.id}`;
    const fichier = join(AUDIO, `${base}${edge !== null ? '.mp3' : '.wav'}`);
    if (cache[r.id]?.empreinte !== empreinte || !existsSync(fichier)) {
      // ancien fichier de cette réplique (autre ordre ou autre format)
      // (nom exact « 07-id.mp3 » : « defi » ne doit pas effacer « 47-rejouer-defi.mp3 »)
      const ancien = new RegExp(`^\\d+-${r.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(mp3|wav)$`);
      for (const nom of readdirSync(AUDIO)) if (ancien.test(nom)) rmSync(join(AUDIO, nom));
      let essai = 0;
      for (;;) {
        try {
          if (edge !== null) syntheseEdge(edge, r.texte, fichier);
          else syntheseWindows(r.texte, fichier);
          break;
        } catch (erreur) {
          // edge-tts passe par le réseau : deux nouvelles tentatives
          if (++essai >= 3) throw erreur;
        }
      }
      faites += 1;
    }
    r.fichierAudio = `audio/${fichier.split(/[\\/]/).at(-1)}`;
    r.dureeAudio = Math.round(duree(fichier) * 1000) / 1000;
    r.voix = moteur;
    cache[r.id] = { empreinte, fichier: r.fichierAudio };
    console.log(`${base.padEnd(24)} ${r.dureeAudio.toFixed(2)} s`);
  }
  ecrireJson(CACHE, cache);
  ecrireJson(NARRATION, narration);
  console.log(`Synthèse : ${narration.length} répliques (${faites} regénérées), voix ${moteur}.`);
}

// --- Montage -------------------------------------------------------------------------------

function montage() {
  if (FFMPEG === null) throw new Error('ffmpeg introuvable (npm install dans demo/).');
  const narration = lireJson(NARRATION, []);
  const timeline = lireJson(TIMELINE, null);
  if (timeline === null) throw new Error('timeline.json absent : lancer d\'abord node demo.mjs (enregistrement).');
  if (!existsSync(VIDEO)) throw new Error(`vidéo absente : ${VIDEO}`);
  const dureeVideo = duree(VIDEO);
  const parId = new Map(narration.map(r => [r.id, r]));
  const sousTitres = timeline.sousTitres;
  const problemes = [];
  const plan = [];
  sousTitres.forEach((s, k) => {
    const r = parId.get(s.id);
    if (!r || !r.fichierAudio || !existsSync(join(DEMO, r.fichierAudio))) {
      problemes.push(`sous-titre « ${s.id} » (${s.debut.toFixed(1)} s) : aucun audio`);
      return;
    }
    // place disponible : jusqu'au sous-titre suivant (ou la fin de la vidéo), moins une marge
    const suivant = k + 1 < sousTitres.length ? sousTitres[k + 1].debut : dureeVideo;
    const place = suivant - s.debut - 0.1;
    let tempo = 1;
    if (r.dureeAudio > place) {
      tempo = r.dureeAudio / place;
      if (tempo > ACCELERATION_MAX) {
        problemes.push(`« ${s.id} » : la voix (${r.dureeAudio.toFixed(2)} s) dépasse sa place (${place.toFixed(2)} s) même accélérée de 10 % : ` +
          'relancer l\'enregistrement (node demo.mjs), qui allonge l\'étape');
        return;
      }
    }
    const fin = s.debut + r.dureeAudio / tempo;
    plan.push({ id: s.id, ordre: r.ordre, fichier: join(DEMO, r.fichierAudio), debut: s.debut, fin, tempo, suivant,
      affiche: s.duree, marge: s.duree - r.dureeAudio / tempo });
  });
  if (problemes.length > 0) throw new Error(`montage impossible :\n  - ${problemes.join('\n  - ')}`);
  // vérifications : une voix par sous-titre, aucune ne chevauche la suivante
  for (let k = 1; k < plan.length; k++) {
    if (plan[k - 1].fin > plan[k].debut) throw new Error(`chevauchement : « ${plan[k - 1].id} » finit à ${plan[k - 1].fin.toFixed(2)} s, « ${plan[k].id} » commence à ${plan[k].debut.toFixed(2)} s`);
  }

  // filtre : chaque réplique retardée à son instant (adelay), mixée sans atténuation, puis normalisée
  const entrees = ['-i', VIDEO];
  const filtres = [];
  plan.forEach((p, k) => {
    entrees.push('-i', p.fichier);
    const ms = Math.max(0, Math.round(p.debut * 1000));
    const tempo = p.tempo > 1.0001 ? `,atempo=${p.tempo.toFixed(4)}` : '';
    filtres.push(`[${k + 1}:a]aresample=48000,aformat=channel_layouts=stereo${tempo},adelay=${ms}|${ms}[v${k}]`);
  });
  filtres.push(`${plan.map((_, k) => `[v${k}]`).join('')}amix=inputs=${plan.length}:duration=longest:dropout_transition=0:normalize=0,` +
    `loudnorm=I=${NIVEAU}:TP=-1.5:LRA=11,apad,atrim=0:${dureeVideo.toFixed(3)}[voix]`);
  const script = join(AUDIO, 'montage.filtre');
  writeFileSync(script, filtres.join(';\n'), 'utf8');
  executer(FFMPEG, ['-y', '-loglevel', 'error', ...entrees, '-filter_complex_script', script, '-map', '0:v', '-map', '[voix]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', dureeVideo.toFixed(3), SORTIE]);

  // vérification de la sortie : une piste vidéo et une piste audio, même durée
  const flux = executer(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', SORTIE]).trim().split(/\s+/);
  if (!flux.includes('audio') || !flux.includes('video')) throw new Error(`la vidéo finale n'a pas de piste ${flux.includes('audio') ? 'vidéo' : 'audio'}`);
  const dureeFinale = duree(SORTIE);

  // narration.json : instants réels, et rapport
  for (const p of plan) Object.assign(parId.get(p.id), { debut: round(p.debut), duree: round(p.affiche) });
  ecrireJson(NARRATION, narration);
  ecrireRapport({ plan, dureeFinale, sansAudio: narration.filter(r => !sousTitres.some(s => s.id === r.id)).map(r => r.id) });
  console.log(`Vidéo avec voix : ${SORTIE} (${(dureeFinale / 60).toFixed(0)} min ${(dureeFinale % 60).toFixed(0).padStart(2, '0')} s), ${plan.length} répliques, ` +
    `accélération max ${((Math.max(...plan.map(p => p.tempo)) - 1) * 100).toFixed(1)} %, marge min ${Math.min(...plan.map(p => p.suivant - p.fin)).toFixed(2)} s.`);
}

const round = x => Math.round(x * 100) / 100;
const temps = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// Section « Voix off » de rapport.md (remplacée à chaque montage).
function ecrireRapport({ plan, dureeFinale, sansAudio }) {
  const chemin = join(DEMO, 'rapport.md');
  const debut = '<!-- voix-off -->';
  const fin = '<!-- /voix-off -->';
  const voix = lireJson(NARRATION, [])[0]?.voix ?? VOIX;
  const accelerees = plan.filter(p => p.tempo > 1.0001);
  const lignes = [
    debut,
    '## Voix off',
    '',
    `- Vidéo : \`videos/demo-f1-voix.mp4\` (${temps(dureeFinale)}, piste audio AAC normalisée à ${NIVEAU} LUFS) ; sans voix : \`videos/demo-f1.mp4\` ; ancienne vidéo : \`videos/demo-f1-sans-voix.mp4\``,
    `- Voix : ${voix} ; ${plan.length} répliques, une par sous-titre affiché ; aucun chevauchement ; ` +
      `${accelerees.length === 0 ? 'aucune réplique accélérée' : `${accelerees.length} accélérée(s) de ${((Math.max(...accelerees.map(p => p.tempo)) - 1) * 100).toFixed(1)} % au plus`}`,
    sansAudio.length === 0 ? '- Toutes les répliques de narration.json ont été placées.' : `- Répliques non placées (sous-titre absent de cet enregistrement) : ${sansAudio.join(', ')}`,
    '',
    '| # | Réplique | Début | Voix | Affiché | Marge avant la suivante |',
    '|---|---|---|---|---|---|',
    ...plan.map(p => `| ${p.ordre} | ${p.id} | ${temps(p.debut)} | ${(p.fin - p.debut).toFixed(2)} s${p.tempo > 1.0001 ? ` (×${p.tempo.toFixed(2)})` : ''} | ${p.affiche.toFixed(2)} s | ${(p.suivant - p.fin).toFixed(2)} s |`),
    fin,
  ];
  let texte = existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
  const a = texte.indexOf(debut);
  const b = texte.indexOf(fin);
  texte = a >= 0 && b > a ? texte.slice(0, a) + lignes.join('\n') + texte.slice(b + fin.length) : `${texte.trimEnd()}\n\n${lignes.join('\n')}\n`;
  writeFileSync(chemin, texte, 'utf8');
}

// --- Programme principal -------------------------------------------------------------------

const args = process.argv.slice(2);
const tout = !args.includes('--synthese') && !args.includes('--montage');
try {
  if (tout || args.includes('--synthese')) synthese();
  if (tout || args.includes('--montage')) montage();
} catch (erreur) {
  console.error(`Voix off : ${erreur.message}`);
  process.exitCode = 1;
}
