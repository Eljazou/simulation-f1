import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, near } from './support.mjs';
import { page } from './page.mjs';

// Scène du circuit d'après le design (design/ : « Palette et fiche technique de la scène »,
// « Voiture — zoom coté et états », écrans principaux jour / nuit / pluie) : palettes du décor
// (une copie par image), livrées, sprite des voitures (un graphique par voiture, en cache),
// cadrage du circuit hors de la mini-carte et du HUD, et une course de 20 voitures sur 3 tours.

const scene = loadScene(F1, '({ Vehicle, Circuit, Course, VoitureF1, DecorCircuit, SpriteVoiture, Livrees, Camera, Ambiance, Meteo })');
const { Vehicle, Circuit, Course, VoitureF1, DecorCircuit, SpriteVoiture, Livrees, Camera, Ambiance, Meteo } = scene;
const circuit = new Circuit('classique');
const appels = nom => scene.calls.filter(appel => appel[0] === nom);

function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages });
}

test('décor : une palette par graphique (jour, nuit, pluie), gardée en cache ; une seule copie par image', () => {
  const d = new DecorCircuit(circuit);
  const { crees } = scene.graphiques;
  const avant = crees.length;
  assert.equal(d.preparer({ palette: 'jour' }), true);
  assert.equal(d.preparer({ palette: 'nuit' }), true);
  assert.equal(d.preparer({ palette: 'pluie' }), true);
  assert.equal(crees.length, avant + 3);
  assert.equal(d.generations, 3);
  // revenir à une palette déjà dessinée ne redessine rien, sur autant d'images qu'on veut
  for (let i = 0; i < 50; i++) {
    assert.equal(d.preparer({ palette: i % 2 ? 'jour' : 'nuit' }), false);
  }
  assert.equal(d.generations, 3);
  assert.equal(d.palette, 'jour');
  scene.calls.length = 0;
  d.show();
  assert.deepEqual(scene.calls.map(a => a[0]), ['image']);
  // fondu (transition) : la même copie, teintée
  scene.calls.length = 0;
  d.show(0.4);
  assert.deepEqual(scene.calls.map(a => a[0]), ['tint', 'image', 'noTint']);
  near(scene.calls[0][2], 0.4 * 255, 1e-9);
  // une option change : tous les graphiques sont libérés, seule la palette demandée est redessinée
  const anciens = crees.slice(avant);
  assert.equal(d.preparer({ palette: 'nuit', gomme: false }), true);
  assert.ok(anciens.every(g => g.retire));
  assert.equal(d.generations, 4);
  assert.throws(() => d.preparer({ palette: 'neon' }), /Palette inconnue/);
  // contexte du canvas perdu (le navigateur l'a libéré) : la palette est redessinée
  const perdu = d.graphique;
  perdu.drawingContext = { isContextLost: () => true };
  assert.equal(d.preparer({ palette: 'nuit', gomme: false }), true);
  assert.equal(perdu.retire, true);
  assert.equal(d.generations, 5);
  assert.equal(d.preparer({ palette: 'nuit', gomme: false }), false);
});

test('décor : valeurs du design (palettes, traits, publicités fictives, tribunes derrière le mur)', () => {
  const P = DecorCircuit.PALETTES;
  assert.deepEqual(Object.keys(P), ['jour', 'nuit', 'pluie']);
  assert.equal(P.jour.asphalte, '#4a4e55');
  assert.equal(P.nuit.asphalte, '#2d3137');
  assert.equal(P.pluie.asphalte, '#33373c');
  assert.deepEqual([P.jour.opaciteTeinte, P.nuit.opaciteTeinte, P.pluie.opaciteTeinte], [0, 0.35, 0.18]);
  assert.deepEqual(Array.from(DecorCircuit.rgb('#c8202e')), [200, 32, 46]);
  assert.deepEqual(Array.from(DecorCircuit.rgb('#000000', 0.5)), [0, 0, 0, 128]);
  const T = DecorCircuit.TRAITS;
  // chaque calque est le même tracé : piste 100, ligne blanche 107, vibreurs 122, mur 249
  assert.equal(T.asphalte, circuit.largeur);
  assert.ok(T.asphalte < T.ligneBlanche && T.ligneBlanche < T.vibreur && T.vibreur < T.degagementGris && T.degagementGris < T.herbe && T.herbe < T.mur && T.mur < T.cloture);
  const reelles = /\b(shell|rolex|pirelli|heineken|dhl|aramco|emirates|petronas|red bull|ferrari|mercedes)\b/i;
  for (const mot of DecorCircuit.PUBLICITES) assert.doesNotMatch(mot, reelles);
  const d = new DecorCircuit(circuit);
  const demi = circuit.largeur / 2;
  // les tribunes sont derrière le mur de béton (120 px de l'axe)
  assert.ok(demi + DecorCircuit.TRIBUNE.pres > T.mur / 2);
  assert.ok(DecorCircuit.distanceSpectateur(0) >= DecorCircuit.TRIBUNE.pres && DecorCircuit.distanceSpectateur(1) <= DecorCircuit.TRIBUNE.loin);
  // dégagements : deux gros freinages (après les plus longues lignes droites), deux virages gris
  assert.equal(d.freinages.length, 2);
  assert.equal(d.degagementsGris.length, 2);
  assert.ok(d.degagementsGris.every(v => !d.freinages.includes(v)));
  // les arbres sont derrière les murs
  for (const a of d.arbres) {
    const i = circuit.projeter(a.x, a.y);
    assert.ok(Math.hypot(circuit.points[i].x - a.x, circuit.points[i].y - a.y) > demi + 75 + a.rayon - 1e-9);
    assert.ok(a.rayon >= 12 && a.rayon <= 24);
  }
  // un texte au sol n'est jamais tête en bas
  for (const a of [0, 1, 2, 3, -1, -2, -3]) assert.ok(Math.cos(DecorCircuit.lisible(a)) >= 0);
});

test('décor : les éléments en hauteur sont dessinés à part, après les voitures ; feux du portique', () => {
  const d = new DecorCircuit(circuit);
  d.preparer({ palette: 'jour' });
  const crees = scene.graphiques.crees.length;
  scene.calls.length = 0;
  d.showEnHauteur({ feux: 3 });
  assert.equal(scene.graphiques.crees.length, crees);            // rien de précalculé à refaire
  // 5 feux : 3 rouges allumés, 2 éteints
  const feux = appels('fill').filter(a => a.length === 4 && (a[1] === 255 && a[2] === 42 || a[1] === 58 && a[2] === 18));
  assert.deepEqual(feux.map(a => a[1]), [255, 255, 255, 58, 58]);
  assert.ok(appels('text').some(a => a[1] === 'VALMORA'));
  scene.calls.length = 0;
  d.showEnHauteur({ vert: true });
  assert.equal(appels('fill').filter(a => a[1] === 46 && a[2] === 204).length, 5);
});

test('livrées : les 10 écuries fictives du design, couleurs p1 / p2 / p3 et couleur d\'interface', () => {
  assert.deepEqual(Array.from(Course.ECURIES, e => e.nom), ['Halden', 'Corsa Nera', 'Velis GP', 'Kestrel', 'Ardent', 'Moravia', 'Aurel', 'Novaro', 'Sable', 'Tessa']);
  assert.deepEqual(Array.from(Course.ECURIES[1].couleurs[0]), [255, 138, 31]);  // Corsa Nera #ff8a1f
  assert.deepEqual(Array.from(Course.PILOTES.slice(0, 12), p => p[1]), ['KAR', 'MIR', 'TAV', 'LUN', 'SKO', 'BRE', 'ROW', 'FEN', 'ILM', 'YSA', 'ODE', 'ADE']);
  assert.equal(new Set(Course.PILOTES.map(p => p[1])).size, 20);
  for (const e of Course.ECURIES) {
    const l = Livrees.de(e);
    for (const cle of ['clair', 'fonce', 'numero', 'casque', 'ui']) assert.equal(l[cle].length, 3, `${e.nom} ${cle}`);
  }
  // Novaro : corps bleu nuit, interface plus claire (lisible sur fond sombre)
  const novaro = Course.ECURIES.find(e => e.nom === 'Novaro');
  assert.deepEqual(Array.from(Livrees.ui(novaro)), [143, 166, 255]);
  // une écurie inconnue reçoit une livrée tirée de ses couleurs
  const autre = Livrees.de({ nom: 'Inconnue', couleurs: [[100, 100, 100], [0, 0, 0], [255, 255, 255]] });
  assert.deepEqual(Array.from(autre.ui), [100, 100, 100]);
  // les numéros restent ceux d'origine : ils entrent dans la conduite (voitureF1.js)
  assert.deepEqual(Array.from(Course.NUMEROS.slice(0, 3)), [7, 12, 3]);
});

test('sprite : un graphique par voiture (en cache), dessiné une fois ; à l\'échelle de la voiture', () => {
  const c = course({ nombreVoitures: 4, ecuries: 4 });
  SpriteVoiture.cache.clear();
  const crees = scene.graphiques.crees.length;
  for (let k = 0; k < 30; k++) c.voitures.forEach(v => SpriteVoiture.montrer(v, 0, 0));
  // 4 voitures + l'ombre partagée (une seule)
  assert.equal(SpriteVoiture.cache.size, 4);
  assert.equal(scene.graphiques.crees.length - crees, 5);
  // le dessin du design (77,5 unités) tient dans la longueur de la voiture, sans la changer
  near(SpriteVoiture.K * SpriteVoiture.LONGUEUR_DESIGN, VoitureF1.LONGUEUR, 1e-9);
  assert.ok(SpriteVoiture.K * 33.2 <= VoitureF1.LARGEUR + 0.2);
  // nez cassé et abandon : leurs propres graphiques ; l'abandon est désaturé et assombri
  c.voitures[0].endommagee = true;
  SpriteVoiture.montrer(c.voitures[0], 0, 0);
  assert.equal(SpriteVoiture.cache.size, 5);
  const gris = SpriteVoiture.desaturer([255, 138, 31]);
  assert.ok(Math.max(...gris) - Math.min(...gris) < 0.15 * (255 - 31));
  assert.ok(Math.max(...gris) <= 0.7 * 255);
  // le dessin ne touche ni la position ni la vitesse
  const v = c.voitures[1];
  const avant = [v.pos.x, v.pos.y, v.vel.x, v.vel.y];
  SpriteVoiture.montrer(v, 1.2, 0.3, { theme: 'pluie' });
  assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], avant);
});

test('sprite : braquage des roues avant borné à ±22°, feu arrière allumé sous la pluie, volet DRS', () => {
  const c = course({ nombreVoitures: 2 });
  const v = c.voitures[0];
  scene.calls.length = 0;
  SpriteVoiture.dessinerRoues(v, 1.5, false);
  const rotations = appels('rotate').map(a => a[1]);
  assert.deepEqual(rotations, [SpriteVoiture.BRAQUAGE_MAX, SpriteVoiture.BRAQUAGE_MAX]);
  const feu = () => appels('fill').find(a => a[1] === 255 && a[2] === 42 || a[1] === 90 && a[2] === 21);
  scene.calls.length = 0;
  SpriteVoiture.dessinerParties(v, { pluie: false });
  assert.deepEqual(feu().slice(1, 4), Array.from(SpriteVoiture.FEU_ETEINT));
  scene.calls.length = 0;
  SpriteVoiture.dessinerParties(v, { pluie: true });
  assert.deepEqual(feu().slice(1, 4), Array.from(SpriteVoiture.FEU_ALLUME));
  // DRS ouvert : la fente noire (1,4 de large) remplace le volet fermé (2,6)
  const volets = () => appels('rect').filter(a => a[2] === -12 && a[4] === 24).map(a => a[3]);
  scene.calls.length = 0;
  SpriteVoiture.dessinerParties(v, {});
  assert.deepEqual(volets(), [2.6]);
  v.drs = true;
  scene.calls.length = 0;
  SpriteVoiture.dessinerParties(v, {});
  assert.deepEqual(volets(), [1.4, 1.2]);
});

test('cadrage : le circuit remplit la zone sans passer sous la mini-carte ni le HUD', () => {
  const zone = { x: 254, y: 64, largeur: 1654, hauteur: 956 };
  const libre = Camera.cadrerCircuit(zone, circuit);
  const carte = { x: 1628, y: 64, largeur: 280, hauteur: 200 };
  const hud = { x: 12, y: 856, largeur: 460, hauteur: 212 };
  const vue = Camera.cadrerCircuit(zone, circuit, { eviter: [carte, hud] });
  assert.ok(vue.echelle <= libre.echelle + 1e-12);
  assert.ok(vue.echelle >= 0.6 * libre.echelle);
  // aucun point de la piste (bord compris) dans un rectangle évité
  const marge = circuit.largeur / 2 + Camera.MARGE_BORD;
  const ecran = p => ({ x: zone.x + zone.largeur / 2 + (p.x - vue.x) * vue.echelle, y: zone.y + zone.hauteur / 2 + (p.y - vue.y) * vue.echelle });
  for (const p of circuit.points.filter((_, i) => i % 3 === 0)) {
    const e = ecran(p);
    for (const r of [carte, hud]) {
      const m = marge * vue.echelle;
      assert.ok(e.x < r.x - m || e.x > r.x + r.largeur + m || e.y < r.y - m || e.y > r.y + r.hauteur + m, `${e.x}, ${e.y}`);
    }
  }
  // sans obstacle : la plus grande dimension remplit REMPLISSAGE de la zone
  const xs = [...circuit.points, ...circuit.stands.points].map(p => p.x);
  const ys = [...circuit.points, ...circuit.stands.points].map(p => p.y);
  const largeur = (Math.max(...xs) - Math.min(...xs) + 2 * marge) * libre.echelle;
  const hauteur = (Math.max(...ys) - Math.min(...ys) + 2 * marge) * libre.echelle;
  assert.ok(Math.max(largeur / zone.largeur, hauteur / zone.hauteur) > 0.85);
  assert.ok(largeur <= zone.largeur && hauteur <= zone.hauteur);
  // la caméra utilise cette vue d'ensemble
  const cam = new Camera();
  cam.cadrer(vue);
  cam.suivre(zone, circuit.largeurMonde, circuit.hauteurMonde, null, 1 / 60);
  assert.deepEqual([cam.x, cam.y, cam.echelle], [vue.x, vue.y, vue.echelle]);
});

test('ambiance : valeurs du design (14 projecteurs de 190 px, mâts à 118 px ; lumière globale par thème)', () => {
  assert.deepEqual([Ambiance.PROJECTEURS, Ambiance.PORTEE_PROJECTEUR, Ambiance.MATS], [14, 190, 118]);
  assert.deepEqual({ ...Ambiance.LUMIERE.nuit }, { haut: 0, bas: 0.2, vignette: 0.65 });
  const a = new Ambiance();
  const crees = scene.graphiques.crees.length;
  a.lumiereDe(800, 600, 'jour');
  a.lumiereDe(800, 600, 'jour');
  a.lumiereDe(800, 600, 'nuit');
  assert.equal(scene.graphiques.crees.length - crees, 3);        // grain + 2 thèmes, une fois
  // pluie : motif de gouttes précalculé une fois, quelques dizaines de copies par image
  const m = new Meteo(Course.parametresParDefaut());
  m.intensite = 0.9;
  m.show(1920, 1080);
  scene.calls.length = 0;
  const avant = scene.graphiques.crees.length;
  m.show(1920, 1080);
  assert.equal(scene.graphiques.crees.length, avant);
  const copies = appels('image').length;
  assert.ok(copies > 10 && copies < 80, `${copies} copies`);
  assert.deepEqual(Array.from(Meteo.CELLULE_GOUTTES), [24, 48]);
});

test('intégration : 20 voitures, 3 tours, dans la page ; décor, sprites et particules bornés ; positions écrites par la locomotion seulement', () => {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  p.glisser('f1-nombre-voitures', 20);
  p.glisser('f1-nombre-tours', 3);
  p.glisser('f1-vitesse-simulation', 4);
  const maximums = { fumees: 0, etincelles: 0, billes: 0 };
  for (let i = 0; i < 9000 && !p.evaluate('formule1.course.terminee'); i++) {
    p.draw();
    if (i % 30 === 0) {
      const t = p.evaluate('({ fumees: formule1.course.fumees.length, etincelles: formule1.course.etincelles.length, billes: formule1.course.billes.length })');
      for (const k of Object.keys(maximums)) maximums[k] = Math.max(maximums[k], t[k]);
    }
  }
  assert.equal(p.evaluate('formule1.course.terminee'), true);
  assert.equal(p.evaluate('formule1.course.voitures.length'), 20);
  // une seule palette (jour, sec) : un graphique de décor par résolution (vue d'ensemble, suivi
  // zoomé : préparés au départ, la caméra peut changer sans redessin) ; une copie par image
  const graphiques = Array.from(p.evaluate('[...Course.decor(formule1.course.circuit).graphiques.keys()]'));
  assert.ok(graphiques.length >= 1 && graphiques.length <= 2, String(graphiques));
  assert.ok(graphiques.every(nom => nom.startsWith('jour|')), String(graphiques));
  // un sprite par voiture au plus (et ses variantes nez cassé / abandon)
  assert.ok(p.evaluate('SpriteVoiture.cache.size') <= 20 * 3);
  // particules sous leurs plafonds
  assert.ok(maximums.fumees <= p.evaluate('Course.FUMEES_MAX'));
  assert.ok(maximums.etincelles <= p.evaluate('Course.ETINCELLES_MAX'));
  assert.ok(maximums.billes <= p.evaluate('Course.BILLES_MAX'));
  // le cadrage évite la mini-carte : la caméra a sa vue d'ensemble
  assert.ok(p.evaluate('formule1.camera.ensemble !== null'));
});

test('architecture : le décor, le sprite, la caméra et les livrées ne sont pas des Vehicle', () => {
  for (const Classe of [DecorCircuit, SpriteVoiture, Camera, Ambiance]) assert.ok(!(Classe.prototype instanceof Vehicle), Classe.name);
  assert.equal(typeof Livrees.de, 'function');
});
