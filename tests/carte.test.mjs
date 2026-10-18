import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, near } from './support.mjs';
import { page } from './page.mjs';

// Mini-carte HTML / SVG (design/ « Mini-carte — gros plan, états et modes ») : projection des
// positions sur le tracé généré, écartement sans superposition, secteurs, survol, modes et états.

const scene = loadScene(F1, '({ Vehicle, Circuit, Course, VoitureF1, CarteCircuit })');
const { Vehicle, Circuit, Course, VoitureF1, CarteCircuit } = scene;

function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages }, Circuit.generateur(1999));
}
function jusqua(c, condition, limite = 60 * 400) {
  for (let i = 0; i < limite; i++) {
    if (condition(c)) return i;
    c.pas();
  }
  return assert.fail('condition jamais atteinte');
}
const enCourse = c => jusqua(c, x => x.etat === Course.ETATS.COURSE);

test('mini-carte : pas un Vehicle ; le tracé vient du Circuit généré (trois profils, boîte qui contient piste et stands)', () => {
  assert.ok(!(CarteCircuit.prototype instanceof Vehicle));
  for (const profil of ['classique', 'rapide', 'technique']) {
    const c = course({ profil, nombreVoitures: 2 }).circuit;
    const b = CarteCircuit.boite(c);
    for (const p of [...c.points, ...c.stands.points]) {
      assert.ok(p.x > b.x && p.x < b.x + b.largeur && p.y > b.y && p.y < b.y + b.hauteur, profil);
    }
    // le chemin commence au point 0 du circuit (la ligne d'arrivée)
    assert.ok(CarteCircuit.chemin(c.points, true).startsWith(`M${c.points[0].x.toFixed(1)} ${c.points[0].y.toFixed(1)}`));
    assert.ok(CarteCircuit.NOMS[profil]);
  }
});

test('projection : une voiture en piste est dessinée sur la ligne centrale (son point de piste) ; au stand ou en abandon, à sa vraie place', () => {
  const c = course({ nombreVoitures: 8 });
  enCourse(c);
  for (let i = 0; i < 60 * 8; i++) c.pas();
  const victime = c.voitures[3];
  c.provoquerAccident(victime.pos.x, victime.pos.y, 'test', victime);
  const pos = CarteCircuit.positions(c);
  for (const p of pos) {
    if (p.statut === 'course') {
      const point = c.circuit.points[p.voiture.indicePiste];
      assert.deepEqual([p.x, p.y], [point.x, point.y]);
      // la normale est perpendiculaire à la tangente du tracé
      const t = c.circuit.tangentes[p.voiture.indicePiste];
      near(p.nx * t.x + p.ny * t.y, 0, 1e-9);
      near(Math.hypot(p.nx, p.ny), 1, 1e-9);
    } else {
      assert.deepEqual([p.x, p.y], [p.voiture.pos.x, p.voiture.pos.y]);
    }
  }
  assert.equal(pos.find(p => p.voiture === victime).statut, 'abandon');
});

test('écartement : après le départ (voitures en peloton), aucun point n\'en recouvre un autre ; poussée perpendiculaire au tracé', () => {
  const c = course({ nombreVoitures: 20 });
  enCourse(c);
  for (let i = 0; i < 60 * 3; i++) c.pas();
  const vue = CarteCircuit.boite(c.circuit);
  const echelle = CarteCircuit.echelle(vue);
  const avant = CarteCircuit.positions(c);
  const origines = avant.map(p => ({ x: p.x, y: p.y }));
  // au départ, des points se recouvrent bien (sinon le test ne prouverait rien)
  const proches = pts => {
    let n = 0;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) * echelle < CarteCircuit.ECART_MIN - 1e-6) n++;
    return n;
  };
  assert.ok(proches(avant) > 0);
  const apres = CarteCircuit.ecarter(avant, echelle);
  assert.equal(proches(apres), 0);
  // chaque déplacement est parallèle à la normale du point (perpendiculaire au tracé)
  apres.forEach((p, k) => {
    const dx = p.x - origines[k].x;
    const dy = p.y - origines[k].y;
    near(dx * p.ny - dy * p.nx, 0, 1e-6);
  });
  // deux points déjà assez écartés ne bougent pas
  const seuls = [{ x: 0, y: 0, nx: 0, ny: 1, surTrace: true }, { x: 1000, y: 0, nx: 0, ny: 1, surTrace: true }];
  CarteCircuit.ecarter(seuls, 0.15);
  assert.deepEqual(seuls.map(p => [p.x, p.y]), [[0, 0], [1000, 0]]);
});

test('secteurs : trois portions jointives qui couvrent tout le tour ; progression du tour par secteur', () => {
  const c = course({ nombreVoitures: 2 });
  const s = CarteCircuit.secteurs(c.circuit);
  assert.equal(s.length, 3);
  assert.equal(s[0].debut, 0);
  for (let k = 0; k < 3; k++) assert.equal(s[k].fin, s[(k + 1) % 3].debut);
  const longueurs = s.map(({ debut, fin }) => (fin - debut + c.circuit.n) % c.circuit.n || c.circuit.n);
  assert.equal(longueurs.reduce((a, b) => a + b, 0), c.circuit.n);
  assert.deepEqual(Array.from(CarteCircuit.COULEURS_SECTEURS), ['#5b8def', '#e0b84a', '#4fbf86']);
  // une voiture au milieu du secteur 2 : S1 fait, S2 à moitié, S3 à venir
  const v = c.voitures[0];
  const milieu = s[1].debut + Math.floor(longueurs[1] / 2);
  const faux = { circuit: c.circuit, indicePiste: milieu };
  const pr = CarteCircuit.progression(faux);
  assert.equal(pr.secteur, 1);
  assert.equal(pr.parts[0], 1);
  near(pr.parts[1], Math.floor(longueurs[1] / 2) / longueurs[1], 1e-9);
  assert.equal(pr.parts[2], 0);
  near(pr.tour, milieu / c.circuit.n, 1e-12);
  assert.ok(v);
});

function circuitDansLaPage() {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  p.draw();
  for (let i = 0; i < 1200 && p.evaluate('formule1.course.etat') !== 'COURSE'; i++) p.draw();
  for (let i = 0; i < 300; i++) p.draw();
  p.evaluate('interfaceF1.forcer()');
  return p;
}

test('dans la page : un point par voiture, leader « 1 », survol = infobulle « #n CODE · Pk · écart », clic = suivre', () => {
  const p = circuitDansLaPage();
  assert.equal(p.element('f1-carte').hidden, false);
  assert.match(p.element('f1-carte-nom').textContent, /^VALMORA$/);
  assert.match(p.element('f1-carte-longueur').textContent, /^\d+,\d\d KM$/);
  const n = p.evaluate('formule1.course.voitures.length');
  assert.equal(p.evaluate('interfaceF1.carte.points.size'), n);
  // le leader seul porte le « 1 »
  const uns = JSON.parse(p.evaluate(`JSON.stringify(formule1.course.voitures.map(v => !interfaceF1.carte.points.get(v).un.hidden))`));
  assert.equal(uns.filter(Boolean).length, 1);
  // un élément SVG ignore l'attribut hidden : il est caché par display="none"
  const affiches = JSON.parse(p.evaluate(`JSON.stringify(formule1.course.voitures.map(v => interfaceF1.carte.points.get(v).un.getAttribute('display')))`));
  assert.equal(affiches.filter(d => d === 'inline').length, 1);
  assert.equal(affiches.filter(d => d === 'none').length, n - 1);
  assert.equal(uns.indexOf(true), p.evaluate('formule1.course.voitures.indexOf(formule1.course.classement()[0])'));
  // survol de la 3e du classement
  p.evaluate('interfaceF1.carte.points.get(formule1.course.classement()[2]).g.fire("mouseenter")');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-carte-infobulle').hidden, false);
  const attendu = p.evaluate(`(() => { const v = formule1.course.classement()[2]; const l = TourClassement.lignes(formule1.course, 'leader').find(x => x.voiture === v);
    return '#' + v.numero + ' ' + v.pilote.code + ' · P3 · ' + l.ecart; })()`);
  assert.equal(p.evaluate('interfaceF1.carte.texteInfobulle'), attendu);
  p.evaluate('interfaceF1.carte.points.get(formule1.course.classement()[2]).g.fire("mouseleave")');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-carte-infobulle').hidden, true);
  // clic sur un point : la voiture est suivie (anneau et étiquette)
  p.evaluate('interfaceF1.carte.points.get(formule1.course.classement()[4]).g.fire("click")');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.selection === formule1.course.classement()[4]'), true);
  assert.equal(p.evaluate('interfaceF1.carte.suivieDom.code.textContent'), p.evaluate('formule1.course.selection.pilote.code'));
});

test('dans la page : modes complet / zoom (760 × 396, touches + et −), agrandir, décalée quand le panneau est ouvert', () => {
  const p = circuitDansLaPage();
  const vue = () => p.element('f1-carte-svg').getAttribute('viewBox').split(' ').map(Number);
  const b = JSON.parse(p.evaluate('JSON.stringify(CarteCircuit.boite(formule1.course.circuit))'));
  near(vue()[2], b.largeur, 0.1);
  p.evaluate('formule1.course.selection = formule1.course.classement()[0]');
  p.touche('+');
  p.evaluate('interfaceF1.forcer()');
  assert.deepEqual(vue().slice(2), [760, 396]);
  assert.ok(p.element('f1-carte-zoom').classList.contains('on'));
  // en zoom, les voitures voisines sont des formes avec leur code
  const formes = p.evaluate('formule1.course.voitures.filter(v => v !== formule1.course.selection && !interfaceF1.carte.points.get(v).carre.hidden).length');
  assert.ok(formes > 0);
  p.touche('-');
  p.evaluate('interfaceF1.forcer()');
  near(vue()[2], b.largeur, 0.1);
  p.element('f1-carte-agrandir').fire('click');
  assert.ok(p.element('f1-carte').classList.contains('agrandie'));
  assert.equal(p.element('f1-carte-agrandir').getAttribute('aria-pressed'), 'true');
  // panneau ouvert (par défaut) : la carte se décale à gauche du panneau ; fermé : elle revient
  assert.ok(p.element('f1-carte').classList.contains('panneau-ouvert'));
  p.touche('s');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-carte').classList.contains('panneau-ouvert'), false);
});

test('dans la page : états — drapeau jaune sur son secteur, abandon gris barré, safety car « SC », stand avec clé', () => {
  const p = circuitDansLaPage();
  // drapeau jaune (secteur 2) : le secteur clignote, avec son drapeau ; badge « JAUNE · S2 »
  p.evaluate('formule1.course.incidents.secteursJaunes = new Set([1])');
  p.evaluate('interfaceF1.carte.mettreAJour(formule1.course, { suivie: null })');
  assert.equal(p.element('f1-carte-badge').textContent, 'JAUNE · S2');
  assert.ok(p.element('f1-carte-badge').classList.contains('jaune'));
  assert.equal(p.evaluate('interfaceF1.carte.coucheJaune.children.length'), 2);
  // accident : abandon gris barré ; la safety car sort (par la voie des stands), puis point « SC »
  p.evaluate(`(() => { const c = formule1.course; const v = c.classement()[1]; c.provoquerAccident(v.pos.x, v.pos.y, 'test', v); })()`);
  for (let i = 0; i < 60 * 20 && !p.evaluate('formule1.course.safetyCar.enPiste'); i++) p.draw();
  p.evaluate('interfaceF1.forcer()');
  const victime = 'formule1.course.voitures.find(v => formule1.course.chronometrage.abandon(v))';
  assert.equal(p.evaluate(`interfaceF1.carte.points.get(${victime}).croix.hidden`), false);
  assert.equal(p.evaluate(`interfaceF1.carte.points.get(${victime}).disque.getAttribute('fill')`), '#6e7781');
  assert.equal(p.evaluate('formule1.course.safetyCar.enPiste'), true);
  assert.equal(p.element('f1-carte-badge').textContent, 'SAFETY CAR');
  assert.equal(p.evaluate('interfaceF1.carte.sc.hidden'), false);
  // au stand : la clé
  p.evaluate('formule1.course.voitures.forEach(v => { if (!formule1.course.chronometrage.abandon(v)) v.demanderStand(); })');
  for (let i = 0; i < 60 * 40 && !p.evaluate('formule1.course.voitures.some(v => v.auStand)'); i++) p.draw();
  p.evaluate('interfaceF1.forcer()');
  assert.ok(p.evaluate('formule1.course.voitures.some(v => v.auStand)'));
  assert.equal(p.evaluate('formule1.course.voitures.filter(v => v.auStand).every(v => !interfaceF1.carte.points.get(v).cle.hidden)'), true);
});
