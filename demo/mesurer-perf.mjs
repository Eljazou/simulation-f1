// Mesure des performances du jeu dans Chrome (Playwright), GPU activé.
//   node mesurer-perf.mjs [--url <adresse>] [--duree 30] [--qualites eleve,moyen,bas]
//     [--scenarios sec,pluie] [--dpr 1.25] [--viewport 1920x1080] [--sortie resultats.json]
//     [--profil] [--headless] [--js <code exécuté dans la page avant la mesure>]
// Sans --url, le serveur local du jeu (serveur.mjs) est lancé sur un port libre.
// Pour chaque scénario et chaque qualité : une page neuve en 1920 × 1080, la course démarre, puis
// pendant --duree secondes (--viewport : une autre taille de fenêtre) :
//   - chaque appel de draw() (p5) est daté : images/s moyennes, minimales (la plus longue image)
//     et 1 % les plus lentes, ms par image ;
//   - draw() est découpé : simulation (scenario.update), dessin du canvas (scenario.show),
//     interface HTML (interfaceF1.mettreAJour) ;
//   - une trace Chrome : temps occupé du thread principal de la page (JS, style et mise en page,
//     peinture), du thread du compositeur et du GPU (raster, composition, flous CSS) ;
//   - écritures dans la page (MutationObserver) et particules vivantes.
// --profil : en plus, 10 s de profil JS (fonctions les plus coûteuses) et le nombre d'appels au
// contexte 2D par image, sur le premier scénario.
// Le GPU utilisé par Chrome est lu dans chrome://gpu.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const JEU = dirname(ICI);

const options = (() => {
  const args = process.argv.slice(2);
  const valeur = (nom, defaut) => {
    const i = args.indexOf(`--${nom}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : defaut;
  };
  return {
    url: valeur('url', null),
    duree: Number(valeur('duree', 30)),
    qualites: valeur('qualites', 'eleve,moyen,bas').split(','),
    scenarios: valeur('scenarios', 'sec,pluie').split(','),
    dpr: Number(valeur('dpr', 1.25)),
    viewport: valeur('viewport', '1920x1080').split('x').map(Number),
    sortie: valeur('sortie', null),
    profil: args.includes('--profil'),
    headless: args.includes('--headless'),
    // code exécuté dans la page juste avant la mesure (expériences du diagnostic)
    js: valeur('js', null),
  };
})();

const portLibre = () => new Promise(ok => {
  const s = createServer();
  s.listen(0, () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});

// Le GPU vu par Chrome (chrome://gpu) : le moteur de rendu, l'état des fonctions accélérées.
async function lireGpu(navigateur) {
  const page = await navigateur.newPage();
  await page.goto('chrome://gpu');
  await page.waitForTimeout(2500);
  // la page est faite de composants à shadow DOM : le texte est lu en les parcourant
  const texte = await page.evaluate(() => {
    const lire = n => {
      let s = n.shadowRoot ? lire(n.shadowRoot) : '';
      for (const c of n.childNodes) s += c.nodeType === 3 ? `${c.textContent} ` : lire(c);
      if (n.tagName && /^(TR|DIV|LI|H3|P)$/.test(n.tagName)) s += '\n';
      return s;
    };
    return lire(document.body);
  });
  await page.close();
  const lignes = texte.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const valeur = cle => lignes.find(l => l.startsWith(`${cle} `))?.slice(cle.length).replace(/^\s*:\s*/, '').trim() ?? null;
  const statut = cle => lignes.find(l => l.startsWith(`* ${cle}:`))?.slice(cle.length + 3).trim() ?? null;
  return {
    glRenderer: valeur('GL_RENDERER'),
    gpu0: valeur('GPU0'),
    gpu1: valeur('GPU1'),
    actif: lignes.find(l => /^GPU\d/.test(l) && l.includes('*ACTIVE*'))?.match(/\[([^\]]+)\]/)?.[1] ?? null,
    canvas: statut('Canvas'),
    compositing: statut('Compositing'),
    rasterization: statut('Rasterization'),
    webgl: statut('WebGL'),
  };
}

// Installe la mesure dans la page : draw() et ses trois parties sont datés, les écritures dans la
// page comptées. Rien ne change dans le jeu (les fonctions d'origine sont appelées telles quelles).
function installerMesure() {
  const m = { draws: [], update: 0, show: 0, interface: 0, mutations: 0, particules: [], debut: performance.now() };
  window.__mesure = m;
  const chrono = (objet, nom, cle) => {
    const original = objet[nom];
    objet[nom] = function (...a) {
      const t = performance.now();
      try { return original.apply(this, a); } finally { m[cle] += performance.now() - t; }
    };
  };
  const drawOriginal = window.draw;
  window.draw = function () {
    const t = performance.now();
    drawOriginal();
    m.draws.push(t, performance.now() - t);
  };
  chrono(formule1, 'update', 'update');
  chrono(formule1, 'show', 'show');
  chrono(interfaceF1, 'mettreAJour', 'interface');
  new MutationObserver(l => { m.mutations += l.length; })
    .observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  m.minuteur = setInterval(() => {
    m.particules.push(DiagnosticPerf.entites(formule1).particules);
  }, 1000);
}

function relever() {
  const m = window.__mesure;
  clearInterval(m.minuteur);
  const c = document.querySelector('canvas');
  return {
    draws: m.draws, update: m.update, show: m.show, interface: m.interface, mutations: m.mutations,
    duree: performance.now() - m.debut, particules: m.particules,
    canvas: { largeur: c.width, hauteur: c.height, css: [c.clientWidth, c.clientHeight] },
    densite: pixelDensity(), ratio: devicePixelRatio,
    qualite: formule1.affichage.qualite,
    etat: formule1.course.etat, meteo: formule1.course.meteo.etat, humidite: formule1.course.meteo.humidite,
    voitures: formule1.course.voitures.length,
  };
}

// Statistiques des images (instants et durées de draw() en ms).
function statsImages(r) {
  const debuts = [];
  const durees = [];
  for (let k = 0; k < r.draws.length; k += 2) {
    debuts.push(r.draws[k]);
    durees.push(r.draws[k + 1]);
  }
  const intervalles = debuts.slice(1).map((t, k) => t - debuts[k]);
  const tri = [...intervalles].sort((a, b) => a - b);
  const p99 = tri[Math.min(tri.length - 1, Math.floor(tri.length * 0.99))];
  const total = debuts.at(-1) - debuts[0];
  const moyenne = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const n = durees.length;
  // FPS par seconde : la seconde la plus lente
  const parSeconde = [];
  for (let s = 0; s < Math.floor(total / 1000); s++) {
    parSeconde.push(debuts.filter(t => t >= debuts[0] + s * 1000 && t < debuts[0] + (s + 1) * 1000).length);
  }
  return {
    images: n,
    fpsMoyen: (intervalles.length / total) * 1000,
    fpsMin: 1000 / tri.at(-1),
    fps1pc: 1000 / p99,
    fpsPireSeconde: Math.min(...parSeconde),
    msParImage: moyenne(intervalles),
    msDraw: moyenne(durees),
    msDrawMax: Math.max(...durees),
    msUpdate: r.update / n,
    msShow: r.show / n,
    msInterface: r.interface / n,
    mutationsParSeconde: r.mutations / (r.duree / 1000),
    particulesMax: Math.max(0, ...r.particules),
  };
}

// Trace Chrome : temps occupé (union des tâches de premier niveau) par thread, et découpage du
// thread principal de la page.
function analyserTrace(fichier, dureeMs, images) {
  const { traceEvents } = JSON.parse(readFileSync(fichier, 'utf8'));
  const noms = new Map();
  const processus = new Map();
  for (const e of traceEvents) {
    if (e.ph === 'M' && e.name === 'thread_name') noms.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.ph === 'M' && e.name === 'process_name') processus.set(e.pid, e.args.name);
  }
  // événements complets par thread
  const parThread = new Map();
  for (const e of traceEvents) {
    if (e.ph !== 'X' || !(e.dur > 0)) continue;
    const cle = `${e.pid}:${e.tid}`;
    if (!parThread.has(cle)) parThread.set(cle, []);
    parThread.get(cle).push(e);
  }
  const union = evts => {
    const tri = evts.map(e => [e.ts, e.ts + e.dur]).sort((a, b) => a[0] - b[0]);
    let total = 0;
    let fin = -Infinity;
    for (const [a, b] of tri) {
      if (b <= fin) continue;
      total += b - Math.max(a, fin);
      fin = b;
    }
    return total / 1000;
  };
  const threads = [...parThread].map(([cle, evts]) => ({ cle, nom: noms.get(cle) ?? '?', processus: processus.get(Number(cle.split(':')[0])) ?? '?', evts, occupe: union(evts) }));
  const principal = threads.filter(t => t.nom === 'CrRendererMain').sort((a, b) => b.occupe - a.occupe)[0];
  const compositeur = threads.filter(t => t.nom === 'Compositor' && t.processus === principal?.processus && t.cle.split(':')[0] === principal.cle.split(':')[0])[0];
  const gpu = threads.filter(t => t.nom === 'CrGpuMain').sort((a, b) => b.occupe - a.occupe)[0];
  const viz = threads.filter(t => t.nom === 'VizCompositorThread').sort((a, b) => b.occupe - a.occupe)[0];
  const raster = threads.filter(t => /CompositorTileWorker|RasterWorker/.test(t.nom) && t.cle.split(':')[0] === principal?.cle.split(':')[0]);
  const groupe = (t, re) => (t ? union(t.evts.filter(e => re.test(e.name))) : 0);
  const parImage = ms => ms / images;
  const p = principal;
  return {
    principalOccupe: parImage(p?.occupe ?? 0),
    js: parImage(groupe(p, /^(FireAnimationFrame|FunctionCall|EvaluateScript|TimerFire|EventDispatch|RunMicrotasks|V8\.Execute|v8\.callFunction)$/)),
    gc: parImage(groupe(p, /^(MinorGC|MajorGC|V8\.GC_SCAVENGER|V8\.GC_MARK_COMPACTOR|V8\.GCScavenger|V8\.GCCompactor|BlinkGC\.AtomicPhase)$/)),
    styleLayout: parImage(groupe(p, /^(UpdateLayoutTree|Layout|RecalculateStyles|ScheduleStyleRecalculation|InvalidateLayout|HitTest)$/)),
    peinture: parImage(groupe(p, /^(PrePaint|Paint|Layerize|Commit|UpdateLayer|CompositeLayers|PaintImage|Decode Image)$/)),
    compositeur: parImage(compositeur?.occupe ?? 0),
    raster: parImage(raster.reduce((s, t) => s + t.occupe, 0)),
    gpu: parImage(gpu?.occupe ?? 0),
    viz: parImage(viz?.occupe ?? 0),
    gpuPourcent: 100 * (gpu?.occupe ?? 0) / dureeMs,
    principalPourcent: 100 * (p?.occupe ?? 0) / dureeMs,
  };
}

async function preparerPage(navigateur, url, scenario, qualite) {
  const [width, height] = options.viewport;
  const contexte = await navigateur.newContext({ viewport: { width, height }, deviceScaleFactor: options.dpr, locale: 'fr-FR' });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', e => erreurs.push(`exception : ${e.message}`));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof formule1 !== 'undefined' && formule1 && formule1.demarre, null, { timeout: 60000 });
  await page.evaluate(({ scenario, qualite }) => {
    // qualité fixe : la détection automatique (si elle existe) est coupée pendant la mesure
    if ('qualiteAuto' in formule1.affichage) formule1.afficher('qualiteAuto', false);
    formule1.afficher('qualite', qualite);
    if (scenario === 'pluie') {
      parametresF1.modeMeteo = 'manuel';
      parametresF1.intensitePluie = 0.8;
      formule1.recommencer();
    }
  }, { scenario, qualite });
  await page.waitForFunction(() => formule1.course.etat === 'COURSE', null, { timeout: 90000 });
  if (options.js) await page.evaluate(options.js);
  // quelques secondes de course : le peloton s'étire, les effets apparaissent
  await page.waitForTimeout(3000);
  return { contexte, page, erreurs };
}

async function mesurer(navigateur, url, scenario, qualite, dossierTrace) {
  const { contexte, page, erreurs } = await preparerPage(navigateur, url, scenario, qualite);
  const trace = join(dossierTrace, `${scenario}-${qualite}.json`);
  await navigateur.startTracing(page, { path: trace, categories: ['devtools.timeline', 'toplevel', 'v8', 'gpu', 'cc', 'viz'] });
  await page.evaluate(installerMesure);
  await page.waitForTimeout(options.duree * 1000);
  const brut = await page.evaluate(relever);
  await navigateur.stopTracing();
  await contexte.close();
  const images = statsImages(brut);
  const chrome = analyserTrace(trace, brut.duree, images.images);
  rmSync(trace, { force: true });
  return { scenario, qualite, ...images, chrome, canvas: brut.canvas, densite: brut.densite, ratio: brut.ratio,
    qualiteLue: brut.qualite, etat: brut.etat, meteo: brut.meteo, humidite: brut.humidite, voitures: brut.voitures, erreurs };
}

// Profil JS (10 s) et appels au contexte 2D par image.
async function profiler(navigateur, url, scenario, qualite) {
  const { contexte, page } = await preparerPage(navigateur, url, scenario, qualite);
  const cdp = await contexte.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(10000);
  const { profile } = await cdp.send('Profiler.stop');
  const pas = new Map(profile.nodes.map(n => [n.id, n]));
  const soi = new Map();
  const deltas = profile.timeDeltas;
  profile.samples.forEach((id, k) => {
    const n = pas.get(id);
    const f = n.callFrame;
    const fichier = f.url.split('/').pop() || '(natif)';
    const cle = `${f.functionName || '(anonyme)'} ${fichier}:${f.lineNumber + 1}${fichier === 'p5.min.js' ? `:${f.columnNumber + 1}` : ''}`;
    soi.set(cle, (soi.get(cle) ?? 0) + (deltas[k] ?? 0) / 1000);
  });
  const total = [...soi.values()].reduce((s, x) => s + x, 0);
  const actif = total - (soi.get('(idle) (natif):0') ?? 0) - (soi.get('(program) (natif):0') ?? 0);
  const fonctions = [...soi].filter(([cle]) => !/^\((idle|program)\)/.test(cle))
    .sort((a, b) => b[1] - a[1]).slice(0, 30).map(([cle, ms]) => ({ fonction: cle, ms: Math.round(ms), pourcent: +(100 * ms / actif).toFixed(1) }));
  // par fichier
  const parFichier = new Map();
  for (const [cle, ms] of soi) {
    if (/^\((idle|program)\)/.test(cle)) continue;
    const fichier = cle.split(' ').pop().split(':')[0];
    parFichier.set(fichier, (parFichier.get(fichier) ?? 0) + ms);
  }
  const fichiers = [...parFichier].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([f, ms]) => ({ fichier: f, pourcent: +(100 * ms / actif).toFixed(1) }));
  // appels au contexte 2D par image (sur 3 s)
  const appels = await page.evaluate(async () => {
    const compte = {};
    const proto = CanvasRenderingContext2D.prototype;
    const principal = document.querySelector('canvas').getContext('2d');
    const noms = ['fill', 'stroke', 'fillRect', 'strokeRect', 'arc', 'ellipse', 'lineTo', 'moveTo', 'bezierCurveTo', 'drawImage', 'fillText', 'beginPath', 'save', 'restore', 'setTransform', 'translate', 'rotate', 'scale'];
    const originaux = {};
    for (const nom of noms) {
      originaux[nom] = proto[nom];
      proto[nom] = function (...a) {
        const cle = (this === principal ? '' : 'hors écran : ') + nom;
        compte[cle] = (compte[cle] ?? 0) + 1;
        return originaux[nom].apply(this, a);
      };
    }
    const debut = frameCount;
    await new Promise(ok => setTimeout(ok, 3000));
    const images = frameCount - debut;
    for (const nom of noms) proto[nom] = originaux[nom];
    return Object.fromEntries(Object.entries(compte).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v / images)]));
  });
  await contexte.close();
  return { scenario, qualite, fonctions, fichiers, appelsParImage: appels };
}

const dossierTrace = mkdtempSync(join(tmpdir(), 'perf-f1-'));
let serveur = null;
let url = options.url;
if (url === null) {
  const port = await portLibre();
  serveur = spawn(process.execPath, [join(JEU, 'serveur.mjs'), String(port)], { stdio: 'ignore' });
  url = `http://localhost:${port}/`;
  await new Promise(ok => setTimeout(ok, 800));
}

// une fenêtre recouverte par une autre (éditeur au premier plan...) serait ralentie par Chrome à
// environ 1 image/s : ces options gardent le rendu normal (sans rien changer au GPU utilisé)
const navigateur = await chromium.launch({ channel: 'chrome', headless: options.headless, args: ['--window-size=1920,1080', '--window-position=0,0',
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const resultat = { viewport: options.viewport, js: options.js, date: new Date().toISOString(), url, dpr: options.dpr, duree: options.duree, navigateur: navigateur.version(), gpu: null, mesures: [], profil: null };
try {
  resultat.gpu = await lireGpu(navigateur);
  console.log('GPU actif :', resultat.gpu.actif, '| canvas :', resultat.gpu.canvas, '|', resultat.gpu.glRenderer);
  // préchauffage : la première page du navigateur compile les shaders du GPU (images très lentes)
  const chauffe = await preparerPage(navigateur, url, options.scenarios[0], options.qualites[0]);
  await chauffe.page.waitForTimeout(5000);
  await chauffe.contexte.close();
  for (const scenario of options.scenarios) {
    for (const qualite of options.qualites) {
      const m = await mesurer(navigateur, url, scenario, qualite, dossierTrace);
      resultat.mesures.push(m);
      console.log(`${scenario} ${qualite} : ${m.fpsMoyen.toFixed(1)} img/s moy, ${m.fpsMin.toFixed(1)} min, 1 % ${m.fps1pc.toFixed(1)}, ` +
        `${m.msParImage.toFixed(2)} ms/image, draw ${m.msDraw.toFixed(2)} ms (simulation ${m.msUpdate.toFixed(2)}, canvas ${m.msShow.toFixed(2)}, interface ${m.msInterface.toFixed(2)}), ` +
        `GPU ${m.chrome.gpu.toFixed(2)} ms/image (${m.chrome.gpuPourcent.toFixed(0)} %), thread principal ${m.chrome.principalPourcent.toFixed(0)} %, ` +
        `${Math.round(m.mutationsParSeconde)} écritures DOM/s, canvas ${m.canvas.largeur}×${m.canvas.hauteur}${m.erreurs.length ? `, ERREURS ${m.erreurs.length}` : ''}`);
    }
  }
  if (options.profil) {
    resultat.profil = await profiler(navigateur, url, options.scenarios[0], options.qualites.includes('moyen') ? 'moyen' : options.qualites[0]);
    console.log('Profil JS (soi, % du temps actif) :');
    resultat.profil.fichiers.slice(0, 12).forEach(f => console.log(`  ${f.pourcent} %  ${f.fichier}`));
    resultat.profil.fonctions.slice(0, 15).forEach(f => console.log(`  ${f.pourcent} %  ${f.fonction}`));
    console.log('Appels 2D par image :', JSON.stringify(resultat.profil.appelsParImage));
  }
} finally {
  await navigateur.close();
  if (serveur !== null) serveur.kill();
  rmSync(dossierTrace, { recursive: true, force: true });
}
if (options.sortie) writeFileSync(resolve(options.sortie), JSON.stringify(resultat, null, 2));
