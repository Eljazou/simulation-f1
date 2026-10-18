import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page } from './page.mjs';
import { chemin } from './support.mjs';

// Choix du pilote à la souris (mode pilote) : clic sur une voiture de la piste, sur une ligne du
// classement ou sur la mini-carte -> cette voiture devient une VoiturePilote conduite au clavier
// (l'ancienne redevient une voiture de l'IA) ; curseur « pointer » au survol d'une voiture ;
// consigne « Clique sur une voiture pour la piloter » puis « Tu pilotes XXX · WASD / flèches » ;
// le focus revient à la page. Deux joueurs : premier clic J1, second clic J2, jamais la même voiture.

const read = nom => readFileSync(chemin(nom), 'utf8');

function circuit({ pilote = true, mode = null } = {}) {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  p.draw();
  if (mode !== null) {
    p.element('f1-mode').value = mode;
    p.element('f1-mode').fire('change');
  }
  if (pilote) {
    const casier = p.element('f1-mode-pilote');
    if (!casier.checked) {
      casier.checked = true;
      casier.fire('change');
    }
  }
  p.draw(3);
  return p;
}
// position à l'écran de la voiture de rang r (par la caméra du scénario)
const ecran = (p, r) => p.evaluate(`(() => { const cam = formule1.camera; const v = formule1.course.voitures[${r}];
  const dx = (v.pos.x - cam.x) * cam.echelle, dy = (v.pos.y - cam.y) * cam.echelle; const c = Math.cos(cam.rotation), s = Math.sin(cam.rotation);
  return { x: cam.zone.x + cam.zone.largeur / 2 + cam.secousse.x + dx * c - dy * s, y: cam.zone.y + cam.zone.hauteur / 2 + cam.secousse.y + dx * s + dy * c }; })()`);
const code = (p, r) => p.evaluate(`formule1.course.voitures[${r}].pilote.code`);
const etat = p => p.evaluate('formule1.course.etat');
const joueur = p => p.evaluate('formule1.course.joueur?.pilote.code ?? null');
const joueur2 = p => p.evaluate('formule1.course.joueur2?.pilote.code ?? null');
const jusquEnCourse = p => { for (let i = 0; i < 1200 && etat(p) !== 'COURSE'; i++) p.draw(); };
const consigne = p => p.evaluate('interfaceF1.consigne.racine.textContent');

test('CSS : les calques plein écran (feux, REJOUER, écran partagé) laissent passer les clics vers la scène', () => {
  const css = read('interfaceF1.css');
  // la règle générale « #f1-ui > * » rend chaque calque cliquable : elle l'emporte sur « .feux »
  assert.match(css, /#f1-ui > \*,\s*#panneau-f1 > \* \{\s*pointer-events: auto;/);
  for (const calque of ['feux', 'rejouer', 'duel']) {
    assert.match(css, new RegExp(`#f1-ui > \\.${calque}[^{]*\\{[^}]*pointer-events: none`), calque);
  }
  // la garde reconnaît bien la forme attendue
  assert.match('#f1-ui > .feux, #f1-ui > .x { pointer-events: none; }', /#f1-ui > \.feux[^{]*\{[^}]*pointer-events: none/);
  // les boutons de l'écran REJOUER restent cliquables
  assert.match(css, /\.bouton-principal[^{]*\{[^}]*pointer-events: auto/);
});

test('clic sur une voiture de la piste (mode pilote, avant le départ) : elle devient mon pilote, conduit au clavier ; la course démarre', () => {
  const p = circuit();
  assert.equal(etat(p), 'PRESENTATION');
  assert.equal(joueur(p), null);
  assert.equal(consigne(p), 'Clique sur une voiture pour la piloter');
  const cible = code(p, 3);
  const { x, y } = ecran(p, 3);
  p.clic(x, y);
  assert.equal(joueur(p), cible);
  assert.equal(p.evaluate('formule1.course.joueur instanceof VoiturePilote'), true);
  // les autres restent à l'IA
  assert.equal(p.evaluate('formule1.course.voitures.filter(v => v instanceof VoiturePilote).length'), 1);
  p.draw(3);
  assert.equal(consigne(p), `Tu pilotes ${cible} · WASD / flèches`);
  // la course n'attend plus : feux puis départ
  jusquEnCourse(p);
  assert.equal(etat(p), 'COURSE');
  p.touche('w');
  p.draw();
  assert.equal(p.evaluate('formule1.course.joueur.commandes.haut'), true);
  p.evaluate('keyReleased()');
  // la consigne reste DUREE_APRES_DEPART (4 s) après le départ, puis s'efface
  assert.equal(p.evaluate('interfaceF1.consigne.racine.hidden'), false);
  for (let i = 0; i < 600 && p.evaluate('formule1.course.chronometrage.tempsCourse') < 4.1; i++) p.draw();
  p.draw();
  assert.equal(p.evaluate('interfaceF1.consigne.racine.hidden'), true);
});

test('changer de pilote avant le départ : la nouvelle voiture passe au clavier, l\'ancienne retourne à l\'IA', () => {
  const p = circuit();
  const a = ecran(p, 2);
  p.clic(a.x, a.y);
  assert.equal(joueur(p), code(p, 2));
  p.draw();
  const b = ecran(p, 6);
  p.clic(b.x, b.y);
  assert.equal(joueur(p), code(p, 6));
  assert.equal(p.evaluate('formule1.course.voitures[2] instanceof VoiturePilote'), false);
  assert.equal(p.evaluate('formule1.course.voitures[6] instanceof VoiturePilote'), true);
});

test('le clic choisit la voiture la plus proche du curseur, à 20 px de la voiture (zone d\'au moins 24 px)', () => {
  const p = circuit();
  const n = p.evaluate('formule1.course.voitures.length');
  for (const [dx, dy] of [[20, 0], [0, 20], [-14, 14]]) {
    // la grille est reformée après chaque choix : positions relues à chaque clic
    const positions = Array.from({ length: n }, (_, r) => ecran(p, r));
    const x = positions[4].x + dx;
    const y = positions[4].y + dy;
    const proche = positions.map((q, r) => [Math.hypot(q.x - x, q.y - y), r]).sort((a, b) => a[0] - b[0])[0];
    assert.ok(proche[0] <= 24);
    p.clic(x, y);
    assert.equal(joueur(p), code(p, proche[1]), `décalage ${dx}, ${dy}`);
    p.draw();
  }
});

test('clic sur une ligne du classement : même choix de pilote ; la ligne rend le focus (les touches vont au jeu)', () => {
  const p = circuit();
  p.evaluate('interfaceF1.forcer()');
  const lignes = p.element('f1-tour-lignes');
  const ligne = lignes.children[5];
  const visee = ligne.children[3].children[0].textContent;
  const flous = ligne.flous;
  ligne.fire('click');
  assert.equal(joueur(p), visee);
  assert.ok(ligne.flous > flous, 'la ligne cliquée garde le focus');
  p.evaluate('interfaceF1.forcer()');
  // mon pilote est surligné dans la tour ; le HUD affiche ses données
  const choisie = p.element('f1-tour-lignes').children.find(l => l.classList.contains('choisie'));
  assert.equal(choisie.children[3].children[0].textContent, visee);
  assert.equal(p.element('f1-hud').hidden, false);
});

test('mon pilote : halo et étiquette sur la piste (comme une voiture suivie)', () => {
  const p = circuit();
  const { x, y } = ecran(p, 3);
  p.clic(x, y);
  p.evaluate('globalThis.__suivies = []; const s = Course.prototype.showSuivie; Course.prototype.showSuivie = function (v, t) { __suivies.push(v.pilote.code); return s.call(this, v, t); }');
  p.draw();
  assert.deepEqual(Array.from(p.evaluate('__suivies')), [code(p, 3)]);
});

test('survol : le curseur devient une main au-dessus d\'une voiture, redevient normal ailleurs', () => {
  const p = circuit();
  const canvas = p.element('canvas');
  const { x, y } = ecran(p, 1);
  p.souris(x, y);
  assert.equal(canvas.style.cursor, 'pointer');
  p.souris(5, 1075);
  assert.equal(canvas.style.cursor, '');
});

test('après le départ, en pause, au stand : le pilote ne change pas, le clic fait seulement suivre la voiture', () => {
  const p = circuit();
  const a = ecran(p, 3);
  p.clic(a.x, a.y);
  const moi = joueur(p);
  jusquEnCourse(p);
  p.draw(30);
  const b = ecran(p, 7);
  p.clic(b.x, b.y);
  assert.equal(joueur(p), moi);
  assert.equal(p.evaluate('formule1.course.selection?.pilote.code'), code(p, 7));
  // en pause non plus
  p.evaluate('formule1.course.basculerPause()');
  const c = ecran(p, 8);
  p.clic(c.x, c.y);
  assert.equal(joueur(p), moi);
});

test('sans mode pilote : un clic fait seulement suivre la voiture (spectateur), pas de consigne de pilotage', () => {
  const p = circuit({ pilote: false });
  const { x, y } = ecran(p, 3);
  p.clic(x, y);
  assert.equal(joueur(p), null);
  assert.equal(p.evaluate('formule1.course.selection?.pilote.code'), code(p, 3));
  p.draw(2);
  assert.equal(p.evaluate('interfaceF1.consigne.racine.hidden'), true);
});

test('deux joueurs : premier clic = J1, second clic = J2 ; une voiture déjà prise est refusée', () => {
  const p = circuit({ pilote: false, mode: 'multijoueur' });
  assert.equal(p.evaluate('formule1.course.joueurs.length'), 2);
  const a = ecran(p, 2);
  p.clic(a.x, a.y);
  assert.equal(joueur(p), code(p, 2));
  p.draw();
  const b = ecran(p, 7);
  p.clic(b.x, b.y);
  assert.equal(joueur(p), code(p, 2));
  assert.equal(joueur2(p), code(p, 7));
  p.draw();
  // troisième clic : de nouveau J1 ; la voiture de J2 est refusée
  const c = ecran(p, 7);
  p.clic(c.x, c.y);
  assert.equal(joueur(p), code(p, 2));
  assert.equal(joueur2(p), code(p, 7));
  p.draw(2);
  assert.match(consigne(p), /^J1 \w+ · WASD \+ Espace — J2 \w+ · flèches \+ Entrée — clic : J1$/);
});

test('défi : la voiture est imposée par le défi ; le clic ne la change pas', () => {
  const p = circuit({ pilote: false, mode: 'defi' });
  const moi = joueur(p);
  assert.notEqual(moi, null);
  const r = p.evaluate(`formule1.course.voitures.findIndex(v => v !== formule1.course.joueur)`);
  const { x, y } = ecran(p, r);
  p.clic(x, y);
  assert.equal(joueur(p), moi);
  p.draw(2);
  assert.equal(consigne(p), `Défi : tu pilotes ${moi} · WASD / flèches`);
});

test('la case Mode pilote rend le focus après un changement (Espace ne la décoche pas)', () => {
  const p = page().demarrer();
  p.choisir('f1');
  const casier = p.element('f1-mode-pilote');
  const flous = casier.flous;
  casier.checked = true;
  casier.fire('change');
  assert.ok(casier.flous > flous);
});
