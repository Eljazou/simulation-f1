import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, near } from './support.mjs';

// Affichage du circuit : décor précalculé (dessiné une fois, redessiné seulement si besoin),
// placements du décor, habillage du classement, caméra.

const scene = loadScene(F1, '({ Circuit, Course, VoitureF1, DecorCircuit, Classement, Camera })');
const { Circuit, Course, VoitureF1, DecorCircuit, Classement, Camera } = scene;
const circuit = Course.circuit('classique');
const decor = new DecorCircuit(circuit);
const appels = (liste, nom) => liste.filter(appel => appel[0] === nom).length;

test('décor : dessiné une fois dans un p5.Graphics, puis seulement recopié', () => {
  const d = new DecorCircuit(circuit);
  const { calls, crees } = scene.graphiques;
  const avant = crees.length;
  assert.equal(d.preparer({ facteur: 1 }), true);
  assert.equal(crees.length, avant + 1);
  assert.equal(d.generations, 1);
  // le graphique couvre le monde entier, à la résolution demandée
  assert.deepEqual([d.graphique.largeur, d.graphique.hauteur], [Circuit.LARGEUR_MONDE, Circuit.HAUTEUR_MONDE]);
  const dessins = calls.length;
  assert.ok(dessins > 10000, `${dessins} appels de dessin`);
  // mêmes options : rien n'est redessiné, quel que soit le nombre d'images
  for (let i = 0; i < 100; i++) assert.equal(d.preparer({ facteur: 1 }), false);
  assert.equal(calls.length, dessins);
  assert.equal(d.generations, 1);
  // à chaque image, une seule copie du graphique
  scene.calls.length = 0;
  d.show();
  assert.deepEqual(scene.calls.map(appel => appel[0]), ['image']);
  // une option de dessin ou la résolution change : il est redessiné, l'ancien est libéré
  const ancien = d.graphique;
  assert.equal(d.preparer({ facteur: 1, gomme: false }), true);
  assert.equal(ancien.retire, true);
  assert.equal(d.preparer({ facteur: 2, gomme: false }), true);
  assert.deepEqual([d.graphique.largeur, d.graphique.hauteur], [2 * Circuit.LARGEUR_MONDE, 2 * Circuit.HAUTEUR_MONDE]);
  assert.equal(d.generations, 3);
});

test('décor : reproductible (graine fixe), et le bruit reste entre 0 et 1', () => {
  const autre = new DecorCircuit(circuit);
  assert.equal(JSON.stringify(autre.arbres), JSON.stringify(decor.arbres));
  assert.equal(JSON.stringify(autre.tribunes.map(t => [t.cote, t.debut])), JSON.stringify(decor.tribunes.map(t => [t.cote, t.debut])));
  for (let k = 0; k < 500; k++) {
    const b = DecorCircuit.bruit(k * 0.37, k * 0.11);
    assert.ok(b >= 0 && b <= 1);
  }
  // lisse : deux points voisins ont des valeurs proches
  assert.ok(Math.abs(DecorCircuit.bruit(3.5, 2.5) - DecorCircuit.bruit(3.51, 2.5)) < 0.05);
  assert.equal(DecorCircuit.facteurPour(0.4), 1);
  assert.equal(DecorCircuit.facteurPour(1.2), 1.5);
  assert.equal(DecorCircuit.facteurPour(5), DecorCircuit.FACTEUR_MAX);
});

test('décor : rien n\'est posé sur la piste ; arbres, tribunes, graviers et rails à leur place', () => {
  const demi = circuit.largeur / 2;
  const distancePiste = (x, y) => {
    const i = circuit.projeter(x, y);
    return Math.hypot(circuit.points[i].x - x, circuit.points[i].y - y);
  };
  assert.ok(decor.arbres.length > 50);
  for (const arbre of decor.arbres) assert.ok(distancePiste(arbre.x, arbre.y) > demi + arbre.rayon, `${arbre.x}, ${arbre.y}`);
  assert.ok(decor.tribunes.length >= 1);
  for (const tribune of decor.tribunes) {
    for (let k = 0; k <= tribune.longueur; k++) {
      const p = circuit.pointLateral(tribune.debut + k, tribune.cote * (demi + 85));
      assert.ok(distancePiste(p.x, p.y) > demi + 30);
    }
  }
  assert.ok(decor.graviers.length >= 3);
  // le gravier est à l'extérieur de son virage (côté opposé à la corde), dans un virage serré
  for (const gravier of decor.graviers) {
    assert.equal(gravier.cote, -gravier.virage.sens);
    assert.ok(gravier.virage.courbure > 1 / DecorCircuit.RAYON_GRAVIER);
    assert.ok(gravier.tranche.every(t => t.profondeur > 12 && t.profondeur <= DecorCircuit.PROFONDEUR_GRAVIER));
  }
  // l'espace libre ne dépasse jamais la place réelle : un point pris dans l'espace libre, au-delà
  // du bord, n'est pas plus près d'une autre portion de la piste que de la sienne. (À la corde
  // d'une épingle très serrée, il n'y a aucune place au-delà du bord : l'espace libre vaut alors
  // la demi-largeur, et rien n'y est construit.)
  let verifies = 0;
  for (const cote of [1, -1]) {
    for (let i = 0; i < circuit.n; i += 5) {
      const d = decor.libre[cote][i];
      assert.ok(d >= demi);
      if (d === demi) continue;
      verifies++;
      const p = circuit.pointLateral(i, cote * d);
      assert.ok(distancePiste(p.x, p.y) >= d - 2, `${cote} ${i}`);
    }
  }
  assert.ok(verifies > circuit.n / 5);
  // pas de rail du côté des stands, le long de la voie
  assert.ok(decor.rails[circuit.exterieur].every((rail, i) => !decor.presDesStands(i) || rail === null));
  assert.ok(decor.panneaux.length > 0);
});

test('décor désactivé : fond uni et piste, dessinés directement, sans graphique', () => {
  scene.calls.length = 0;
  decor.showSimple();
  assert.ok(appels(scene.calls, 'vertex') >= circuit.n);
  assert.equal(appels(scene.calls, 'image'), 0);
});

test('classement : tour de classement, en-tête, feux pendant le départ, bandeau, pause', () => {
  const c = new Course({ ...Course.parametresParDefaut(), nombreVoitures: 6, incidents: false });
  const habillage = new Classement();
  const textes = () => scene.calls.filter(appel => appel[0] === 'text').map(appel => String(appel[1]));
  scene.calls.length = 0;
  habillage.show(c, 1280, 720, true);
  assert.ok(textes().includes('TOUR 1/5'));
  assert.ok(textes().includes('Leader'));
  for (const v of c.voitures) assert.ok(textes().includes(v.pilote.code));
  assert.ok(textes().some(t => t.startsWith('Présentation')));
  // pendant les feux : 5 cercles de feux, allumés un par un
  for (let i = 0; i < 60 * 4.2; i++) c.pas();
  assert.equal(c.etat, Course.ETATS.FEUX);
  scene.calls.length = 0;
  habillage.show(c, 1280, 720, true);
  const rouges = scene.calls.filter((appel, k) => appel[0] === 'circle' && scene.calls[k - 1][0] === 'fill' && scene.calls[k - 1][1] === 255
    && scene.calls[k - 1][2] === 30);
  assert.equal(rouges.length, c.feux);
  // sans la tour : ni codes de pilotes, mais l'en-tête reste
  scene.calls.length = 0;
  habillage.show(c, 1280, 720, false);
  assert.ok(!textes().includes(c.voitures[0].pilote.code));
  assert.ok(textes().some(t => t.startsWith('TOUR')));
  c.basculerPause();
  scene.calls.length = 0;
  habillage.show(c, 1280, 720, true);
  assert.ok(textes().includes('PAUSE'));
  // étiquettes et couleurs des pneus
  assert.deepEqual(Array.from(Classement.couleurPneus(1)), [70, 210, 90]);
  assert.deepEqual(Array.from(Classement.couleurPneus(0.1)), [240, 70, 60]);
  const v = c.voitures[0];
  v.etat = VoitureF1.ETATS.STAND;
  assert.equal(Classement.etiquette(v), 'PIT');
});

test('caméra : la vue d\'ensemble fait tenir le monde ; versMonde inverse le dessin ; le suivi est lissé', () => {
  const camera = new Camera();
  const zone = { x: 240, y: 56, largeur: 700, hauteur: 500 };
  camera.suivre(zone, 1800, 1100, null, 1 / 60);
  near(camera.echelle, Math.min(700 / 1800, 500 / 1100));
  assert.deepEqual([camera.x, camera.y], [900, 550]);
  // le centre du monde tombe au centre de la zone
  const centre = camera.versMonde(zone.x + zone.largeur / 2, zone.y + zone.hauteur / 2);
  near(centre.x, 900);
  near(centre.y, 550);
  // un coin de la zone est dans le monde (le monde tient dans la zone)
  const coin = camera.versMonde(zone.x, zone.y + zone.hauteur / 2);
  assert.ok(coin.x <= 0 + 1e-9);
  // suivi : la caméra glisse vers la voiture et grossit, sans sauter
  camera.choisirMode('suivi');
  const cible = { pos: { x: 300, y: 200 } };
  camera.suivre(zone, 1800, 1100, cible, 1 / 60);
  assert.ok(camera.x < 900 && camera.x > 300);
  for (let i = 0; i < 600; i++) camera.suivre(zone, 1800, 1100, cible, 1 / 60);
  near(camera.x, 300, 1e-6);
  near(camera.echelle, Math.min(700 / 1800, 500 / 1100) * Camera.ZOOM_SUIVI, 1e-6);
  assert.throws(() => camera.choisirMode('helicoptere'), { name: 'RangeError' });
  scene.calls.length = 0;
  camera.appliquer();
  assert.deepEqual(scene.calls.map(appel => appel[0]), ['translate', 'scale', 'translate']);
});

test('dessin des voitures : détaillé jusqu\'à 12, simplifié au-delà ; feux de freinage ; debug au vrai rayon', () => {
  // sans les mécaniciens (voie des stands spectaculaire) : on ne compte que le dessin des voitures
  const petite = new Course({ ...Course.parametresParDefaut(), nombreVoitures: 12, incidents: false, pitSpectaculaire: false });
  const grande = new Course({ ...Course.parametresParDefaut(), nombreVoitures: 13, incidents: false, pitSpectaculaire: false });
  // le dessin vectoriel (qualité « bas ») : détaillé jusqu'à 12 voitures, simplifié au-delà
  petite.affichage.qualite = 'bas';
  grande.affichage.qualite = 'bas';
  const dessinsParVoiture = c => {
    scene.calls.length = 0;
    c.show(false);
    return scene.calls.length / c.voitures.length;
  };
  assert.ok(dessinsParVoiture(petite) > dessinsParVoiture(grande) * 1.3);
  const v = petite.voitures[0];
  scene.calls.length = 0;
  v.freine = true;
  v.show();
  assert.ok(scene.calls.some(appel => appel[0] === 'fill' && appel[1] === 255 && appel[2] === 40 && appel[3] === 30));
  // debug : le cercle de freinage a pour RAYON rayonZoneDeFreinage (circle attend un diamètre)
  // en course, jusqu'à ce qu'une voiture vise un apex ou une place (au plus 30 s)
  for (let i = 0; i < 60 * 12; i++) petite.pas();
  for (let i = 0; i < 60 * 30 && !petite.voitures.some(x => x.cibles.apex || x.cibles.arrive); i++) petite.pas();
  const temoin = petite.voitures.find(x => x.cibles.apex || x.cibles.arrive);
  assert.ok(temoin);
  scene.calls.length = 0;
  temoin.showDebug();
  const diametres = scene.calls.filter(appel => appel[0] === 'circle').map(appel => appel[3]);
  assert.ok(diametres.includes(temoin.rayonZoneDeFreinage * 2));
  assert.ok(!diametres.includes(temoin.rayonZoneDeFreinage));
  assert.ok(diametres.includes(temoin.r * 2));                  // rayon de collision
  scene.calls.length = 0;
  petite.show(true);
  // debug : ligne centrale, ligne de course, secteurs, apex
  assert.ok(scene.calls.some(appel => appel[0] === 'text' && appel[1] === 'S1'));
});
