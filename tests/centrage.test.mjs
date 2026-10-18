import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';
import { page } from './page.mjs';

// Écran REJOUER centré sur l'écran : les cibles des points (des PointRejouer, donc des Vehicle,
// qui arrivent avec arrive()) sont dans le repère de l'ÉCRAN, sans la caméra ; le mot est centré
// horizontalement ; le groupe « mot + boutons + touches + bilan » est centré verticalement, les
// boutons HTML placés depuis la même disposition ; le mot ne sort jamais de l'écran ; les cibles
// suivent un changement de taille de la fenêtre.

const scene = loadScene(F1, '({ EcranFin, PointRejouer, Particule, Vehicle })');
const { EcranFin, PointRejouer, Particule, Vehicle } = scene;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (±${eps})`);
const bornes = cases => {
  const xs = cases.map(c => c.x);
  const ys = cases.map(c => c.y);
  return { gauche: Math.min(...xs), droite: Math.max(...xs), haut: Math.min(...ys), bas: Math.max(...ys) };
};

test('cibles du mot : leur centre horizontal est le centre de l\'écran, à toutes les tailles ; aucun point ne sort', () => {
  for (const [w, h] of [[1920, 1080], [1280, 720], [1366, 768], [800, 600], [420, 700]]) {
    const d = EcranFin.disposition(w, h);
    const cases = EcranFin.matrice(d);
    const b = bornes(cases);
    const r = d.point / 2;
    // écart gauche = écart droit (bords des points compris)
    near((b.gauche - r) - 0, w - (b.droite + r), 1e-6, `${w}×${h} écarts gauche / droit`);
    near((b.gauche + b.droite) / 2, w / 2, 1e-6, `${w}×${h} centre`);
    assert.ok(b.gauche - r >= 0 && b.droite + r <= w && b.haut - r >= 0 && b.bas + r <= h, `${w}×${h} dans l'écran`);
    // largeur réelle du mot = celle annoncée par la disposition
    near(b.droite - b.gauche + d.point, d.motLargeur, 1e-6, `${w}×${h} largeur du mot`);
  }
});

test('pas des points = min(pas par défaut, 0,8 × largeur / colonnes) ; le diamètre suit le pas', () => {
  const pasDefaut = EcranFin.POINT + EcranFin.ESPACE;
  const colonnes = EcranFin.MOT.length * 5;
  for (const w of [1920, 1280, 600, 420, 320]) {
    const d = EcranFin.disposition(w, 800);
    near(d.pas, Math.min(pasDefaut, 0.8 * w / colonnes), 1e-9, `pas à ${w}`);
    near(d.point, EcranFin.POINT * d.pas / pasDefaut, 1e-9, `diamètre à ${w}`);
  }
  // à 420 px, le pas est réduit ; les points dessinés aussi
  const petit = new EcranFin(420, 700, { x: 210, y: 350 }, () => 0.5);
  assert.ok(petit.disposition.pas < pasDefaut);
  assert.ok(petit.particules.every(p => p.diametre === petit.disposition.point));
});

test('groupe centré verticalement : mot, 40 px, boutons et touches, puis le bilan ; une seule référence', () => {
  for (const [w, h] of [[1920, 1080], [1280, 720], [1366, 768]]) {
    const d = EcranFin.disposition(w, h);
    const D = EcranFin.DISPOSITION;
    near(d.actionsHaut, d.motHaut + d.motHauteur + D.ECART_MOT, 1e-9, 'boutons 40 px sous le mot');
    near(d.bilanHaut, d.actionsHaut + D.ACTIONS + D.ECART_BILAN, 1e-9, 'bilan sous les touches');
    const groupeHaut = d.motHaut;
    const groupeBas = d.bilanHaut + D.BILAN;
    near(groupeHaut, h - groupeBas, 1e-6, `${w}×${h} marge haute = marge basse`);
    const cases = EcranFin.matrice(d);
    const b = bornes(cases);
    near(b.haut - d.point / 2, d.motHaut, 1e-6, 'haut du mot');
  }
});

test('les points restent des Particule (Vehicle) qui rejoignent leur case par arrive ; nés au point donné (écran)', () => {
  assert.ok(PointRejouer.prototype instanceof Particule && PointRejouer.prototype instanceof Vehicle);
  const e = new EcranFin(1280, 720, { x: 100, y: 600 }, () => 0);
  assert.ok(e.particules.every(p => Math.hypot(p.pos.x - 100, p.pos.y - 600) <= EcranFin.DISPERSION + 1e-9));
  for (let i = 0; i < 60 * 20 && !e.forme; i++) {
    e.applyBehaviors();
    e.update();
  }
  assert.equal(e.forme, true);
  // tous posés : les points eux-mêmes (pas seulement leurs cibles) forment un mot centré
  for (let i = 0; i < 60 * 30 && e.rassemblement < 1; i++) {
    e.applyBehaviors();
    e.update();
  }
  assert.equal(e.rassemblement, 1);
  // arrive : les points finissent de se poser sur leur case
  for (let i = 0; i < 60 * 10; i++) {
    e.applyBehaviors();
    e.update();
  }
  const xs = e.particules.map(p => p.pos.x);
  near(Math.min(...xs) + Math.max(...xs), 1280, 2, 'mot formé centré');
});

test('fenêtre redimensionnée : les cibles sont recalculées, les points repartent vers les nouvelles (sans en créer)', () => {
  const e = new EcranFin(1920, 1080, { x: 960, y: 540 }, () => 0.3);
  const particules = [...e.particules];
  for (let i = 0; i < 60 * 10; i++) { e.applyBehaviors(); e.update(); }
  e.adapter(1280, 720);
  assert.deepEqual([...e.particules], particules);
  const b = bornes(e.cases);
  near((b.gauche + b.droite) / 2, 640, 1e-6, 'nouveau centre');
  // chaque point vise la case qui lui était affectée, à sa nouvelle place
  e.particules.forEach((p, k) => {
    const c = e.points[e.affectation[k]];
    assert.deepEqual([p.cible.x, p.cible.y], [c.x, c.y]);
  });
  assert.equal(e.forme, false);
  for (let i = 0; i < 60 * 20 && !e.forme; i++) { e.applyBehaviors(); e.update(); }
  assert.equal(e.forme, true);
});

// --- dans la page (vrai sketch.js) ------------------------------------------------------------
function finDansLaPage({ largeur, hauteur, camera = 'circuit' }) {
  const p = page({ largeur, hauteur }).demarrer();
  const dessiner = p.draw.bind(p);
  p.draw = (n = 1) => { for (let i = 0; i < n; i++) { dessiner(1); p.calls.length = 0; if (p.decor?.calls) p.decor.calls.length = 0; } };
  p.choisir('f1');
  p.draw();
  // l'écran REJOUER vient à la fin d'un défi (voiture du joueur imposée)
  p.evaluate("formule1.choisirMode('defi')");
  p.evaluate(`formule1.camera.choisirMode('${camera}')`);
  for (let i = 0; i < 3000 && p.evaluate('formule1.course.etat') !== 'COURSE'; i++) p.draw();
  p.draw(30);
  p.evaluate('formule1.course.finirLaPartie()');
  for (let i = 0; i < 60 * 7 && p.evaluate('formule1.ecranFin === null'); i++) p.draw();
  p.draw(2);
  p.evaluate('interfaceF1.forcer()');
  return p;
}

test('dans la page : le centre des cibles est le centre de l\'écran, vue complète comme caméra suiveuse', () => {
  for (const [largeur, hauteur, camera] of [[1920, 1080, 'circuit'], [1920, 1080, 'suivi'], [1280, 720, 'suivi'], [1366, 768, 'circuit']]) {
    const p = finDansLaPage({ largeur, hauteur, camera });
    const r = JSON.parse(p.evaluate(`(() => { const e = formule1.ecranFin; const xs = e.points.map(c => c.x), ys = e.points.map(c => c.y);
      return JSON.stringify({ g: Math.min(...xs), d: Math.max(...xs), w: width, h: height, rayon: e.disposition.point / 2 }); })()`));
    near(r.w, largeur, 0, 'largeur du canvas');
    near(r.g - r.rayon, r.w - (r.d + r.rayon), 1e-6, `${largeur}×${hauteur} ${camera} : écart gauche = écart droit`);
    // les boutons HTML et le bilan sont placés depuis la même disposition
    const d = JSON.parse(p.evaluate('JSON.stringify(formule1.ecranFin.disposition)'));
    assert.equal(p.evaluate('interfaceF1.rejouer.actions.style.top'), `${d.actionsHaut}px`);
    assert.equal(p.evaluate('interfaceF1.rejouer.bilan.style.top'), `${d.bilanHaut}px`);
  }
});

test('dans la page : le mot est dessiné hors de la caméra (une fois, en écran) ; le clic sur le mot formé relance', () => {
  const p = finDansLaPage({ largeur: 1280, hauteur: 720, camera: 'suivi' });
  for (let i = 0; i < 60 * 20 && !p.evaluate('formule1.ecranFin.forme'); i++) p.draw();
  assert.equal(p.evaluate('formule1.ecranFin.forme'), true);
  // un point dessiné : appel circle aux coordonnées de la cible (repère de l'écran, sans translate de la caméra)
  const z = JSON.parse(p.evaluate('JSON.stringify(formule1.ecranFin.zone)'));
  // le clic est lu en coordonnées de l'écran
  p.clic(z.x + z.largeur / 2, z.y + z.hauteur / 2);
  p.draw();
  assert.equal(p.evaluate('formule1.course.etat'), 'PRESENTATION');
});

test('dans la page : la fenêtre change de taille → les cibles suivent (windowResized)', () => {
  const p = finDansLaPage({ largeur: 1920, hauteur: 1080, camera: 'circuit' });
  p.context.windowWidth = 1366;
  p.context.windowHeight = 768;
  p.evaluate('windowResized()');
  p.draw();
  const r = JSON.parse(p.evaluate(`(() => { const e = formule1.ecranFin; const xs = e.points.map(c => c.x);
    return JSON.stringify({ g: Math.min(...xs), d: Math.max(...xs), w: width, rayon: e.disposition.point / 2 }); })()`));
  assert.equal(r.w, 1366);
  near(r.g - r.rayon, r.w - (r.d + r.rayon), 1e-6, 'centré après redimensionnement');
});
