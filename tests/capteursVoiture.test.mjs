import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, read, Vector } from './support.mjs';

// CapteursVoiture : 8 entrées normalisées, rayons lancés sur la géométrie du Circuit. Les voitures
// mesurées ici sont des objets simples (position, cap, indice, écart...) : on règle exactement la
// situation à mesurer.

const scene = loadScene(F1, '({ Vehicle, Circuit, CapteursVoiture, Course, VoitureF1 })');
const { CapteursVoiture, Course, Vehicle } = scene;
const circuits = ['classique', 'technique', 'rapide'].map(p => Course.circuit(p));
const c = circuits[0];
const P = Course.parametresParDefaut();

// Une « voiture » au point i de la ligne centrale, décalée de `ecart`, de cap `cap`, à la vitesse v.
function voiture(circuit, i, { ecart = 0, cap = null, vitesse = 3, adherence = 1 } = {}) {
  const p = circuit.pointLateral(i, ecart);
  const t = circuit.tangentes[i];
  const angle = cap ?? Math.atan2(t.y, t.x);
  return { circuit, pos: new Vector(p.x, p.y), cap: angle, vitesse, indicePiste: i, ecartLateral: ecart, adherence, parametres: P };
}
// Un indice au milieu de la portion la plus droite (la plus petite courbure maximale sur ±n points ;
// une spline n'est jamais tout à fait droite : on exige un rayon d'au moins 2 000 px).
function ligneDroite(circuit, n = 20) {
  let meilleur = -1;
  let min = Infinity;
  for (let i = 0; i < circuit.n; i++) {
    let max = 0;
    for (let k = -n; k <= n; k++) max = Math.max(max, Math.abs(circuit.courbures[circuit.indice(i + k)]));
    if (max < min) {
      min = max;
      meilleur = i;
    }
  }
  assert.ok(min < 5e-4, `pas de ligne droite (courbure ${min})`);
  return meilleur;
}

test('CapteursVoiture n\'est pas un Vehicle ; 8 entrées nommées et documentées', () => {
  assert.notEqual(Object.getPrototypeOf(CapteursVoiture), Vehicle);
  assert.ok(!(new CapteursVoiture() instanceof Vehicle));
  assert.equal(CapteursVoiture.NOMS.length, 8);
  assert.equal(CapteursVoiture.LIBELLES.length, 8);
  const source = read('capteursVoiture.js');
  CapteursVoiture.NOMS.forEach((nom, k) => assert.match(source, new RegExp(`//\\s+${k} ${nom}\\s`), nom));
});

test('rayon face à un mur : la distance attendue (bord à 50 px, à 50 / cos(angle) en biais)', () => {
  const i = ligneDroite(c);
  const n = c.normales[i];
  for (const sens of [1, -1]) {
    const cap = Math.atan2(n.y * sens, n.x * sens);
    const v = voiture(c, i, { cap });
    const capteurs = new CapteursVoiture();
    const e = capteurs.mesurer(v);
    const [gauche, droite, devant] = capteurs.rayons;
    assert.ok(Math.abs(devant.distance - c.largeur / 2) < 1, `devant ${devant.distance}`);
    assert.ok(Math.abs(e[2] - (c.largeur / 2) / CapteursVoiture.PORTEE_RAYON) < 0.01);
    for (const r of [gauche, droite]) {
      const attendu = (c.largeur / 2) / Math.cos(CapteursVoiture.ANGLE_LATERAL);
      assert.ok(Math.abs(r.distance - attendu) < 1.5, `${r.distance} au lieu de ${attendu}`);
    }
  }
  // décalé de 30 px vers le mur : il est à 20 px
  const cap = Math.atan2(n.y, n.x);
  const capteurs = new CapteursVoiture();
  capteurs.mesurer(voiture(c, i, { cap, ecart: 30 }));
  assert.ok(Math.abs(capteurs.rayons[2].distance - 20) < 1);
  // la garde peut échouer : un mur à 20 px n'est pas mesuré à 50
  assert.ok(Math.abs(capteurs.rayons[2].distance - 50) > 10);
});

test('dans l\'axe d\'une longue ligne droite : rien devant à portée (entrée « devant » = 1) ; les côtés voient le bord', () => {
  const i = ligneDroite(c, 45);
  const capteurs = new CapteursVoiture();
  const e = capteurs.mesurer(voiture(c, i));
  assert.equal(e[2], 1);
  const attendu = (c.largeur / 2) / Math.sin(CapteursVoiture.ANGLE_LATERAL);
  assert.ok(Math.abs(capteurs.rayons[0].distance - attendu) < 2, `${capteurs.rayons[0].distance}`);
  assert.ok(Math.abs(capteurs.rayons[1].distance - attendu) < 2);
  // décalée vers la gauche (écart négatif : côté opposé à la normale), le bord gauche est plus près
  const g = new CapteursVoiture();
  const eg = g.mesurer(voiture(c, i, { ecart: -25 }));
  assert.ok(eg[0] < eg[1], `${eg[0]} / ${eg[1]}`);
});

test('hors de la piste : les trois rayons valent 0', () => {
  const i = ligneDroite(c);
  const capteurs = new CapteursVoiture();
  const e = capteurs.mesurer(voiture(c, i, { ecart: c.largeur / 2 + 15 }));
  assert.deepEqual(Array.from(e.slice(0, 3)), [0, 0, 0]);
});

test('valeurs bornées et jamais NaN, partout sur les trois circuits, à toutes les vitesses et tous les caps', () => {
  const capteurs = new CapteursVoiture();
  let mesures = 0;
  for (const circuit of circuits) {
    for (let i = 0; i < circuit.n; i += 17) {
      for (const ecart of [-48, -20, 0, 33, 60]) {
        for (const tour of [0, 1, 2.5, 4]) {
          const t = circuit.tangentes[i];
          const v = voiture(circuit, i, { ecart, cap: Math.atan2(t.y, t.x) + tour, vitesse: tour * 2, adherence: tour / 3 });
          const voisins = [{ pos: new Vector(v.pos.x + 30, v.pos.y) }, v];
          const e = capteurs.mesurer(v, voisins);
          assert.equal(e.length, 8);
          e.forEach((x, k) => {
            assert.ok(Number.isFinite(x), `${CapteursVoiture.NOMS[k]} = ${x}`);
            const [min, max] = k === 7 ? [-1, 1] : [0, 1];
            assert.ok(x >= min && x <= max, `${CapteursVoiture.NOMS[k]} = ${x}`);
          });
          mesures++;
        }
      }
    }
  }
  assert.ok(mesures > 500);
});

test('courbure à venir, vitesse, voisine, adhérence, écart à la ligne : les bonnes valeurs', () => {
  const i = ligneDroite(c, 45);
  const capteurs = new CapteursVoiture();
  // pas de voisine : 1 ; une voisine à 50 px : 0,5 ; la voiture elle-même ne compte pas
  const v = voiture(c, i, { vitesse: P.vitesseMax / 2, adherence: 0.7 });
  assert.equal(capteurs.mesurer(v, [])[5], 1);
  assert.equal(capteurs.mesurer(v, [v])[5], 1);
  assert.ok(Math.abs(capteurs.mesurer(v, [{ pos: new Vector(v.pos.x + 30, v.pos.y + 40) }])[5] - 0.5) < 1e-9);
  const e = capteurs.mesurer(v);
  assert.ok(Math.abs(e[4] - 0.5) < 1e-9);
  assert.ok(Math.abs(e[6] - 0.7) < 1e-9);
  // écart à la ligne de course, sur la demi-largeur : sur la ligne, 0
  const surLigne = voiture(c, i, { ecart: c.decalagesLigne[i] });
  assert.ok(Math.abs(capteurs.mesurer(surLigne)[7]) < 1e-9);
  const decale = voiture(c, i, { ecart: c.decalagesLigne[i] + 25 });
  assert.ok(Math.abs(capteurs.mesurer(decale)[7] - 0.5) < 1e-9);
  // courbure : au plus fort d'un virage serré, elle est plus grande qu'au milieu d'une ligne droite
  const virage = [...c.virages].sort((a, b) => b.courbure - a.courbure)[0];
  const avant = c.indice(virage.apex - 10);
  assert.ok(capteurs.mesurer(voiture(c, avant))[3] > capteurs.mesurer(voiture(c, ligneDroite(c, 45)))[3]);
});

test('pas de triche : les capteurs ne lisent ni la course, ni le chronométrage, ni le classement', () => {
  const code = read('capteursVoiture.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bCourse\b|chronometrage|classement|Chronometrage|\.tour\b|progression|\.etat\b/);
  // la garde reconnaît un accès interdit
  assert.match('const x = course.chronometrage;', /chronometrage/);
});
