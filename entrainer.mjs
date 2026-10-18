// Entraînement sans affichage (Node 22) : le MÊME code que la page d'entraînement (entraineur.js,
// voitureNeuronale.js, reseauNeuronal.js... chargés tels quels dans node:vm, avec les substituts de
// p5 des tests), puis la sauvegarde du meilleur modèle dans models/.
//
//   node entrainer.mjs [--generations 40] [--population 30] [--graine 2026] [--neurones 12]
//
// Produit models/pilote-defaut.json (le document du modèle, à importer dans la page) et
// models/piloteDefaut.js (le même document, chargé par index.html : le modèle est proposé même
// sans serveur ni stockage). Le meilleur réseau est noté sur les circuits jamais vus toutes les
// --tous générations ; celui qui a la meilleure note est gardé.
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadScene, F1, generator, chemin } from './tests/support.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((paires, mot, k, liste) => {
  if (mot.startsWith('--')) paires.push([mot.slice(2), liste[k + 1]]);
  return paires;
}, []));
const nombre = (nom, defaut) => (args[nom] === undefined ? defaut : Number(args[nom]));
const generations = nombre('generations', 40);
const population = nombre('population', 30);
const graine = nombre('graine', 2026);
const neurones = nombre('neurones', 12);
const tous = nombre('tous', 4);

// random() de p5 (wander) : un générateur à graine, l'entraînement est reproductible
const { Entraineur, GestionnaireModeles } = loadScene(F1, '({ Entraineur, GestionnaireModeles })', { uniform: generator(graine) });
const entraineur = new Entraineur({ population, graine, caches: neurones, evaluationAuto: false });
const debut = performance.now();
let retenu = null;
console.log(`Entraînement : ${generations} générations, population ${population}, ${neurones} neurones cachés, graine ${graine}`);
entraineur.entrainer(generations, {
  surGeneration: h => {
    const c = h.circuit;
    console.log(`génération ${String(h.generation).padStart(3)}  étape ${h.etape}  ${h.niveau.padEnd(10)} ${`${c.profil}#${c.graine} h=${c.humidite}`.padEnd(26)}` +
      `meilleur ${h.meilleur.toFixed(1).padStart(6)}  moyenne ${h.moyenne.toFixed(1).padStart(6)}  (${((performance.now() - debut) / 1000).toFixed(0)} s)`);
    if ((h.generation + 1) % tous === 0 || h.generation === generations - 1) {
      const note = entraineur.evaluerTout(entraineur.meilleur.reseau);
      console.log(`  note sur les circuits jamais vus : ${note}/100  ${JSON.stringify(entraineur.detailNote)}`);
      if (retenu === null || note >= retenu.note) {
        retenu = { note, detail: entraineur.detailNote, reseau: entraineur.meilleur.reseau.cloner(), fitness: entraineur.meilleur.fitness, generation: h.generation + 1 };
      }
    }
  },
});
const document = GestionnaireModeles.documentDe(retenu.reseau, {
  nom: 'Pilote par défaut', date: new Date().toISOString(), generations: retenu.generation,
  meilleurFitness: Math.round(retenu.fitness * 10) / 10, note: retenu.note,
});
mkdirSync(chemin('models'), { recursive: true });
writeFileSync(chemin('models/pilote-defaut.json'), `${JSON.stringify(document, null, 2)}\n`);
writeFileSync(chemin('models/piloteDefaut.js'), `// Modèle d'IA fourni avec le jeu, produit par « node entrainer.mjs » (ne pas modifier à la main) :
// le même document que models/pilote-defaut.json, chargé par index.html (le modèle est proposé même
// sans serveur ni stockage du navigateur). Voir modelesIA.js pour le format.
const MODELE_PILOTE_DEFAUT = ${JSON.stringify(document)};
`);
console.log(`Modèle retenu : génération ${retenu.generation}, note ${retenu.note}/100, fitness ${retenu.fitness.toFixed(1)}`);
console.log(`Détail : ${JSON.stringify(retenu.detail)}`);
console.log(`Durée totale : ${((performance.now() - debut) / 1000).toFixed(0)} s. Écrit : models/pilote-defaut.json, models/piloteDefaut.js`);
