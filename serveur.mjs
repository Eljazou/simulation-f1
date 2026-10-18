// Petit serveur HTTP local (Node 22, sans dépendance) pour jouer : en file://, le navigateur
// refuse de charger la police (assets/inconsolata.otf) et le jeu ne démarre pas.
//   node serveur.mjs [port]      puis ouvrir http://localhost:8080/
// start.bat le lance et ouvre le navigateur. Seuls les fichiers de ce dossier sont servis.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.otf': 'font/otf', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };

createServer(async (requete, reponse) => {
  try {
    const chemin = decodeURIComponent(new URL(requete.url, 'http://localhost').pathname);
    // pas d'icône : réponse vide (le navigateur la demande toujours)
    if (chemin === '/favicon.ico') {
      reponse.writeHead(204);
      reponse.end();
      return;
    }
    const fichier = normalize(join(RACINE, chemin === '/' ? 'index.html' : chemin));
    // jamais hors du dossier du jeu
    if (fichier !== RACINE && !fichier.startsWith(RACINE + sep)) throw new Error('interdit');
    const infos = await stat(fichier);
    const cible = infos.isDirectory() ? join(fichier, 'index.html') : fichier;
    const contenu = await readFile(cible);
    reponse.writeHead(200, { 'Content-Type': TYPES[extname(cible).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    reponse.end(contenu);
  } catch {
    reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    reponse.end('Introuvable');
  }
}).listen(PORT, () => console.log(`Circuit Formule 1 : http://localhost:${PORT}/  (Ctrl+C pour arrêter)`));
