import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RACINE, chemin, read } from './support.mjs';
import { page } from './page.mjs';

// Isolation : le projet simulation_f1 est autonome. Aucun fichier ne remonte hors du dossier
// (aucun chemin vers le dossier parent), index.html ne lance que le jeu F1, chaque script et chaque ressource référencés
// existent dans le dossier.

// Tous les fichiers du projet (chemins relatifs, séparateur /).
function fichiers(dossier = RACINE) {
  const liste = [];
  for (const nom of readdirSync(dossier)) {
    if (nom === 'node_modules' || nom === '.git') continue;
    const complet = join(dossier, nom);
    if (statSync(complet).isDirectory()) liste.push(...fichiers(complet));
    else liste.push(relative(RACINE, complet).split('\\').join('/'));
  }
  return liste;
}
const TEXTE = /\.(js|mjs|html|css|md|json|bat|sh|txt|sha256)$/;
// Le chemin du dossier parent, construit ici sans l'écrire en clair (ce fichier est lui aussi vérifié).
const PARENT = ['.', '.', '/'].join('');
// Les noms des dossiers voisins du dépôt d'origine, construits de même.
const ANCIENS = new RegExp(['3-Arri' + 'val', '1-Se' + 'ek', '2-Pursue' + 'Evade', 'AGENTS' + '\\.md', 'ARCHITECTURE' + '\\.md'].join('|'));
// Code tiers recopié tel quel : p5.min.js (bibliothèque) et les exports du design (maquettes). Leur
// code contient la suite « point, point, barre » sans que ce soit un chemin de fichier (identifiants
// de modules internes regroupés dans p5.min.js, une expression régulière dans support.js) : pour
// eux, seuls les vrais chargements (src, href, url(), import) sont vérifiés.
const TIERS = nom => nom.startsWith('libraries/') || nom.startsWith('design/');

test('isolation : aucun fichier du projet ne référence le dossier parent (ni les règles ni les exercices du dépôt d\'origine)', () => {
  const tous = fichiers().filter(nom => TEXTE.test(nom));
  assert.ok(tous.includes('index.html') && tous.includes('tests/isolation.test.mjs'));
  const fautifs = tous.filter(nom => !TIERS(nom) && read(nom).includes(PARENT));
  assert.deepEqual(fautifs, []);
  // la garde reconnaît bien un chemin vers le dossier parent
  assert.ok(`readFileSync('${PARENT}vehicle.js')`.includes(PARENT));
  assert.equal(PARENT.length, 3);
});

test('isolation : le code tiers (p5, exports du design) ne charge rien hors du dossier', () => {
  const chargement = /(src|href)\s*=\s*["']\.\.\/|url\(\s*["']?\.\.\/|\bfrom\s*["']\.\.\/|\bimport\s*\(\s*["']\.\.\//;
  assert.match(`<script src="${PARENT}vendor.js">`, chargement);
  assert.match(`import x from '${PARENT}y.js'`, chargement);
  assert.doesNotMatch(`t.match(/${PARENT}g)`, chargement);
  const tiers = fichiers().filter(nom => TIERS(nom) && TEXTE.test(nom));
  assert.ok(tiers.length > 0);
  for (const nom of tiers) assert.doesNotMatch(read(nom), chargement, nom);
});

test('isolation : aucun nom d\'ancien dossier du dépôt dans le code ou les tests', () => {
  const propres = fichiers().filter(nom => TEXTE.test(nom) && !TIERS(nom) && !nom.endsWith('.md'));
  for (const nom of propres) {
    assert.doesNotMatch(read(nom), ANCIENS, nom);
  }
  assert.match('voir le dossier 3-Arri' + 'val', ANCIENS);
});

test('isolation : index.html n\'affiche que le jeu F1 (pas de menu Scénario), chaque ressource existe', () => {
  const html = read('index.html');
  assert.match(html, /<title>Circuit Formule 1<\/title>/);
  assert.doesNotMatch(html, /data-scenario|id="controles"|<select id="scenario"|id="f1-scenario"/);
  assert.doesNotMatch(html, /Encre vivante|Murmuration|Classique \(serpent/);
  const scripts = [...html.matchAll(/<script src="([^"]+)">/g)].map(m => m[1]);
  const styles = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map(m => m[1]);
  assert.ok(scripts.length > 50 && styles.length === 2);
  for (const ressource of [...scripts, ...styles]) assert.ok(existsSync(chemin(ressource)), ressource);
  // la police de l'écran de fin est dans le dossier
  assert.match(read('sketch.js'), /loadFont\('\.\/assets\/inconsolata\.otf'\)/);
  assert.ok(existsSync(chemin('assets/inconsolata.otf')));
  // p5.sound n'est pas utilisée : elle n'est ni chargée ni copiée
  assert.ok(!scripts.some(s => s.includes('p5.sound')));
  assert.ok(!existsSync(chemin('libraries/p5.sound.min.js')));
});

test('isolation : la page démarre sur le jeu F1, sans autre scénario', () => {
  const p = page().demarrer();
  assert.equal(p.evaluate('typeof scenarios'), 'undefined');
  assert.equal(p.evaluate('typeof Encre'), 'undefined');
  assert.equal(p.evaluate('scenario === formule1 && scenario.id'), 'f1');
  p.draw(3);
  assert.equal(p.evaluate('formule1.demarre'), true);
});

test('isolation : l\'empreinte de référence de vehicle.js est dans le dossier', () => {
  const ligne = readFileSync(chemin('tests/vehicle.sha256'), 'utf8').trim();
  assert.match(ligne, /^[0-9a-f]{64}\s+vehicle\.js$/);
});
