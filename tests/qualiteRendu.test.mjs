import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';
import { page } from './page.mjs';

// Qualité du rendu : densité de pixels plafonnée (qualité, écran, canvas de 1920 × 1080 au plus),
// détection automatique (sous 40 images/s pendant 3 s : la qualité inférieure), compteur FPS.

const scene = loadScene([...F1, 'qualiteRendu.js', 'compteurImages.js'], '({ QualiteRendu, CompteurImages, Ambiance })');
const { QualiteRendu, CompteurImages, Ambiance } = scene;

test('qualité : mêmes niveaux que l\'ambiance, libellés Haute / Moyenne / Basse', () => {
  assert.deepEqual(Array.from(QualiteRendu.NIVEAUX), Array.from(Ambiance.QUALITES));
  assert.deepEqual({ ...QualiteRendu.LIBELLES }, { bas: 'Basse', moyen: 'Moyenne', eleve: 'Haute' });
  assert.equal(QualiteRendu.inferieure('eleve'), 'moyen');
  assert.equal(QualiteRendu.inferieure('moyen'), 'bas');
  assert.equal(QualiteRendu.inferieure('bas'), null);
});

test('densité : celle de l\'écran, plafonnée par la qualité et pour un canvas de 1920 × 1080 au plus', () => {
  // écran à 125 % (p5 seul prendrait 2) : fenêtre de 1536 × 750, Haute garde la netteté de l'écran
  assert.equal(QualiteRendu.densite('eleve', 1.25, 1536, 750), 1.25);
  assert.equal(QualiteRendu.densite('moyen', 1.25, 1536, 750), 1);
  assert.equal(QualiteRendu.densite('bas', 1.25, 1536, 750), 1);
  // fenêtre de 1920 × 1080 : jamais plus de 1920 × 1080 pixels réels
  assert.equal(QualiteRendu.densite('eleve', 1.25, 1920, 1080), 1);
  // écran à 200 % : Haute plafonnée à 1,5
  assert.equal(QualiteRendu.densite('eleve', 2, 1000, 600), 1.5);
  // grande fenêtre : moins d'un pixel réel par pixel CSS (canvas plafonné), jamais sous 0,5
  assert.equal(QualiteRendu.densite('moyen', 1, 2560, 1440), 0.75);
  assert.equal(QualiteRendu.densite('moyen', 1, 10000, 8000), QualiteRendu.DENSITE_MIN);
  // ratio inconnu : 1
  assert.equal(QualiteRendu.densite('eleve', undefined, 800, 600), 1);
  for (const q of QualiteRendu.NIVEAUX) {
    for (const [l, h] of [[800, 600], [1920, 1080], [3840, 2160]]) {
      const d = QualiteRendu.densite(q, 3, l, h);
      assert.ok(l * d <= 1920 + 1e-9 || d === QualiteRendu.DENSITE_MIN, `${q} ${l}`);
      assert.ok(h * d <= 1080 + 1e-9 || d === QualiteRendu.DENSITE_MIN, `${q} ${h}`);
    }
  }
});

// n secondes d'images à `fps` images/s ; renvoie les qualités proposées.
function jouer(q, secondes, fps, qualite = 'eleve') {
  const proposees = [];
  for (let t = 0; t < secondes * fps; t++) {
    const p = q.observer(1 / fps, qualite);
    if (p !== null) proposees.push([t / fps, p]);
  }
  return proposees;
}

test('qualité automatique : sous 40 images/s pendant 3 s (après le démarrage), la qualité inférieure', () => {
  const q = new QualiteRendu();
  // le démarrage est ignoré (premières images lentes : shaders, décor)
  assert.deepEqual(jouer(q, QualiteRendu.DEMARRAGE, 20), []);
  assert.ok(Math.abs(q.fps - 20) < 0.5);
  // 2,5 s sous le seuil : rien ; à 3 s : la qualité inférieure, une seule fois
  assert.deepEqual(jouer(q, 2.5, 30), []);
  const p = jouer(q, 1, 30);
  assert.equal(p.length, 1);
  assert.equal(p[0][1], 'moyen');
  // puis la mesure repart (nouvelle attente : le canvas vient d'être recréé)
  assert.deepEqual(jouer(q, QualiteRendu.DEMARRAGE - 0.1, 30, 'moyen'), []);
});

test('qualité automatique : 40 images/s ou plus, une image lente isolée ou un onglet caché ne baissent rien', () => {
  const q = new QualiteRendu();
  jouer(q, QualiteRendu.DEMARRAGE, 60);
  assert.deepEqual(jouer(q, 20, 45), []);
  assert.ok(q.fps >= 40);
  // une image de 300 ms toutes les secondes : les tranches restent au-dessus du seuil
  for (let s = 0; s < 10; s++) {
    assert.equal(q.observer(0.3, 'eleve'), null);
    assert.deepEqual(jouer(q, 1, 60), []);
  }
  // onglet caché (une image de plusieurs secondes) : interruption, la mesure repart
  jouer(q, 2.5, 20);
  assert.equal(q.observer(4, 'eleve'), null);
  assert.deepEqual(jouer(q, 2.5, 20), []);
  // déjà en qualité basse : rien de plus bas
  assert.deepEqual(jouer(q, 10, 20, 'bas'), []);
});

test('compteur FPS : texte réécrit 4 fois par seconde au plus, seulement s\'il change ; annonce de quelques secondes', () => {
  const c = new CompteurImages(null);
  assert.deepEqual(Array.from(c.textes({ actif: true, fps: 59.6 })), ['60 FPS', '']);
  assert.deepEqual(Array.from(c.textes({ actif: false, fps: 59.6 })), ['', '']);
  c.annoncer('Qualité Moyenne (automatique)');
  assert.deepEqual(Array.from(c.textes({ actif: false })), ['', 'Qualité Moyenne (automatique)']);
  c.mettreAJour(CompteurImages.DUREE_ANNONCE + 0.1, {});
  assert.deepEqual(Array.from(c.textes({ actif: false })), ['', '']);
});

test('dans la page : cases Qualité automatique et Compteur FPS ; sous 40 images/s, qualité inférieure annoncée et menu à jour', () => {
  const p = page({ largeur: 1280, hauteur: 720 }).demarrer();
  assert.equal(p.element('f1-qualite-auto').checked, true);
  assert.equal(p.element('f1-compteur-fps').checked, false);
  p.draw(2);
  assert.equal(p.evaluate('formule1.affichage.qualite'), 'moyen');
  // compteur FPS coché : le cadre s'affiche
  const fps = p.element('f1-compteur-fps');
  fps.checked = true;
  fps.fire('change');
  p.draw(30);
  assert.equal(p.evaluate('compteurImages.racine.hidden'), false);
  assert.match(p.evaluate('compteurImages.fps.textContent'), /^\d+ FPS$/);
  // 25 images/s (deltaTime de 40 ms), démarrage passé puis 3 s : qualité basse
  p.context.deltaTime = 40;
  p.draw(Math.ceil((QualiteRendu.DEMARRAGE + QualiteRendu.DUREE_SOUS_SEUIL + 1) * 25));
  assert.equal(p.evaluate('formule1.affichage.qualite'), 'bas');
  assert.equal(p.element('f1-qualite').value, 'bas');
  assert.match(p.evaluate('compteurImages.message.textContent'), /Basse/);
  // case décochée : plus de changement automatique
  const auto = p.element('f1-qualite-auto');
  auto.checked = false;
  auto.fire('change');
  const menu = p.element('f1-qualite');
  menu.value = 'eleve';
  menu.fire('change');
  p.draw(Math.ceil((QualiteRendu.DEMARRAGE + QualiteRendu.DUREE_SOUS_SEUIL + 1) * 25));
  assert.equal(p.evaluate('formule1.affichage.qualite'), 'eleve');
});

test('dans la page : la densité du canvas suit la qualité (écran à 125 %, fenêtre de 1536 × 750)', () => {
  const p = page({ largeur: 1536, hauteur: 750 });
  let densite = 2;
  const appels = [];
  p.context.pixelDensity = d => {
    if (d === undefined) return densite;
    appels.push(d);
    densite = d;
    return undefined;
  };
  p.context.devicePixelRatio = 1.25;
  p.demarrer();
  p.draw(2);
  assert.equal(densite, 1);
  const menu = p.element('f1-qualite');
  menu.value = 'eleve';
  menu.fire('change');
  p.draw(1);
  assert.equal(densite, 1.25);
  // appliquée seulement quand elle change
  const n = appels.length;
  p.draw(5);
  assert.equal(appels.length, n);
});

test('fidélité : changer de qualité en pleine course (comme la détection automatique) ne change pas la course', () => {
  const etat = changer => {
    const p = page({ largeur: 1280, hauteur: 720 }).demarrer();
    p.draw(1);
    p.evaluate("parametresF1.modeMeteo = 'manuel'; parametresF1.intensitePluie = 0.8; formule1.recommencer();");
    p.draw(600);
    if (changer) {
      const menu = p.element('f1-qualite');
      for (const q of ['eleve', 'bas']) {
        menu.value = q;
        menu.fire('change');
        p.draw(300);
      }
    } else {
      p.draw(600);
    }
    return { voitures: p.evaluate('JSON.stringify(formule1.course.voitures.map(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y, v.etat, v.tour]))'), tirages: p.tirages.nombre };
  };
  assert.deepEqual(etat(true), etat(false));
});
