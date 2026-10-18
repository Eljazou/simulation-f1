import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';
import { page } from './page.mjs';

// Page d'entraînement IA dans la vraie page (index.html, sketch.js, substituts de p5 et du DOM) :
// bouton « Entraînement IA », curseurs, Démarrer / Pause / Réinitialiser, réseau et courbes en SVG,
// modèles (Sauvegarder, Charger, Exporter, Importer), test du modèle, retour à la course.

// un faux localStorage pour la page
const stockage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
function ouvrir(options = {}) {
  const p = page({ stockage: stockage(), ...options }).demarrer();
  p.draw(2);
  p.element('f1-bouton-entrainement').fire('click');
  p.draw();
  return p;
}

test('la page n\'est pas un Vehicle ; ses zones tiennent dans la fenêtre de 1280 × 720 à 1920 × 1080, sans se chevaucher', () => {
  const { PageEntrainement, Vehicle } = loadScene([...F1, 'reglages.js', 'ongletIA.js', 'pageEntrainement.js'], '({ PageEntrainement, Vehicle })');
  assert.notEqual(Object.getPrototypeOf(PageEntrainement), Vehicle);
  for (const [L, H] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    const z = PageEntrainement.zones(L, H);
    for (const [nom, r] of Object.entries(z)) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.largeur <= L && r.y + r.hauteur <= H, `${nom} à ${L}×${H}`);
    }
    assert.ok(z.gauche.x + z.gauche.largeur < z.centre.x && z.centre.x + z.centre.largeur < z.droite.x);
    assert.ok(z.centre.y + z.centre.hauteur < z.bas.y && z.barre.y + z.barre.hauteur < z.centre.y);
    assert.ok(z.centre.largeur >= 500 && z.centre.hauteur >= 400, `${z.centre.largeur} × ${z.centre.hauteur}`);
  }
  // les panneaux grandissent avec l'écran
  assert.ok(PageEntrainement.zones(1920, 1080).gauche.largeur > PageEntrainement.zones(1280, 720).gauche.largeur);
});

test('bouton « Entraînement IA » : la page s\'ouvre, la course se met en pause, l\'interface de course se cache ; Retour la rend telle quelle', () => {
  const p = ouvrir();
  assert.equal(p.evaluate('pageEntrainement.ouverte'), true);
  assert.equal(p.element('ia-page').hidden, false);
  assert.equal(p.element('f1-ui').hidden, true);
  assert.equal(p.element('panneau-f1').hidden, true);
  assert.equal(p.evaluate('formule1.course.pause'), true);
  // la course n'avance pas pendant l'entraînement
  const chrono = p.evaluate('formule1.course.chrono');
  p.draw(30);
  assert.equal(p.evaluate('formule1.course.chrono'), chrono);
  p.element('ia-retour').fire('click');
  assert.equal(p.evaluate('pageEntrainement.ouverte'), false);
  assert.equal(p.element('ia-page').hidden, true);
  assert.equal(p.element('f1-ui').hidden, false);
  assert.equal(p.evaluate('formule1.course.pause'), false);
  p.draw(10);
  assert.ok(p.evaluate('formule1.course.chrono') > chrono);
  // Échap ferme aussi ; une course en pause avant le reste
  p.evaluate('formule1.course.pause = true');
  p.element('f1-bouton-entrainement').fire('click');
  p.touche('Escape');
  assert.equal(p.evaluate('pageEntrainement.ouverte'), false);
  assert.equal(p.evaluate('formule1.course.pause'), true);
});

test('Démarrer, Pause (et Espace), Réinitialiser ; l\'étape, la génération et les voitures en vie s\'affichent', () => {
  const p = ouvrir();
  assert.equal(p.element('ia-statut').textContent, 'En pause');
  assert.equal(p.element('ia-etape').textContent, 'Étape 1 · seul');
  assert.equal(p.element('ia-en-vie').textContent, '40/40');
  p.element('ia-demarrer').fire('click');
  p.draw(20);
  assert.ok(p.evaluate('pageEntrainement.entraineur.tempsGeneration') > 0);
  assert.match(p.element('ia-statut').textContent, /En cours · 10x/);
  p.touche(' ');
  assert.equal(p.evaluate('pageEntrainement.entraineur.enCours'), false);
  p.touche(' ');
  assert.equal(p.evaluate('pageEntrainement.entraineur.enCours'), true);
  p.element('ia-pause').fire('click');
  const t = p.evaluate('pageEntrainement.entraineur.tempsGeneration');
  p.draw(10);
  assert.equal(p.evaluate('pageEntrainement.entraineur.tempsGeneration'), t);
  p.element('ia-reinitialiser').fire('click');
  assert.equal(p.evaluate('pageEntrainement.entraineur.tempsGeneration'), 0);
  assert.equal(p.evaluate('pageEntrainement.entraineur.generation'), 0);
});

test('curseurs : actifs pendant le glissement, validés ; vitesse, mutation et pondérations tout de suite, population et neurones à la réinitialisation', () => {
  const p = ouvrir();
  p.glisser('ia-vitesse', 20);
  assert.equal(p.evaluate('pageEntrainement.entraineur.vitesse'), 20);
  assert.equal(p.element('ia-vitesse-valeur').textContent, '20x');
  p.glisser('ia-vitesse', 25);                         // hors bornes : refusé, rien ne change
  assert.equal(p.evaluate('pageEntrainement.entraineur.vitesse'), 20);
  assert.equal(p.element('ia-vitesse').value, '20');
  p.glisser('ia-taux-mutation', 0.3);
  p.glisser('ia-amplitude-mutation', 0.8);
  assert.deepEqual([p.evaluate('pageEntrainement.entraineur.taux'), p.evaluate('pageEntrainement.entraineur.amplitude')], [0.3, 0.8]);
  p.glisser('ia-poids-contact', 40);
  assert.equal(p.evaluate('pageEntrainement.entraineur.poidsFitness.contact'), 40);
  p.glisser('ia-seuil-pret', 55);
  assert.equal(p.evaluate('pageEntrainement.entraineur.seuilPret'), 55);
  p.glisser('ia-population', 25);
  p.glisser('ia-neurones', 14);
  p.glisser('ia-graine', 77);
  assert.equal(p.evaluate('pageEntrainement.entraineur.taillePopulation'), 40);
  p.element('ia-curriculum').checked = false;
  p.element('ia-curriculum').fire('change');
  p.element('ia-reinitialiser').fire('click');
  assert.equal(p.evaluate('pageEntrainement.entraineur.taillePopulation'), 25);
  assert.equal(p.evaluate('pageEntrainement.entraineur.caches'), 14);
  assert.equal(p.evaluate('pageEntrainement.entraineur.graine'), 77);
  assert.equal(p.evaluate('pageEntrainement.entraineur.nomNiveau'), 'aleatoire');
  p.draw();
  assert.equal(p.element('ia-architecture').textContent, '8 · 14 · 4');
  // chaque curseur part de la constante de l'entité
  assert.equal(p.evaluate('PageEntrainement.PLAGES.vitesse.initial'), p.evaluate('Entraineur.VITESSE'));
  assert.equal(p.evaluate('PageEntrainement.PLAGES.neurones.initial'), p.evaluate('ReseauNeuronal.CACHES'));
});

test('le réseau en SVG : entrées et sorties nommées, toutes les connexions, couleurs d\'activation ; courbes du fitness et des poids', () => {
  const p = ouvrir();
  const svg = p.element('ia-reseau-svg');
  const lignes = svg.children.filter(e => e.tagName === 'line');
  const neurones = svg.children.filter(e => e.tagName === 'circle');
  const textes = svg.children.filter(e => e.tagName === 'text').map(e => e.textContent);
  assert.equal(lignes.length, 8 * 12 + 12 * 4);
  assert.equal(neurones.length, 8 + 12 + 4);
  for (const nom of ['Bord gauche', 'Vitesse', 'Adhérence', 'Écart ligne', 'Seek', 'Arrive', 'Wander', 'Sépar.']) assert.ok(textes.includes(nom), nom);
  for (const l of lignes) {
    assert.match(l.getAttribute('stroke'), /^rgba\((225, 6, 0|47, 128, 255), \.75\)$/);
    assert.ok(Number(l.getAttribute('stroke-width')) > 0);
  }
  for (const n of neurones) assert.match(n.getAttribute('fill'), /^rgb\(\d+, \d+, \d+\)$/);
  // une génération plus tard : la courbe du fitness a ses points et ses axes
  p.evaluate('pageEntrainement.entraineur.dureeGeneration = 1');
  p.element('ia-demarrer').fire('click');
  for (let k = 0; k < 400 && p.evaluate('pageEntrainement.entraineur.generation') < 2; k++) p.draw();
  p.evaluate('pageEntrainement.forcer()');
  const courbes = p.element('ia-fitness-svg').children.filter(e => e.tagName === 'polyline');
  assert.equal(courbes.length, 2);
  for (const c of courbes) assert.equal(c.getAttribute('points').split(' ').length, 2);
  assert.notEqual(p.element('ia-meilleur').textContent, '—');
  assert.equal(p.element('ia-poids-svg').children.filter(e => e.tagName === 'polyline').length, 4);
});

test('courbes : fonctions pures (points dans le cadre, axe qui contient toutes les valeurs)', () => {
  const { PageEntrainement } = loadScene([...F1, 'reglages.js', 'ongletIA.js', 'pageEntrainement.js'], '({ PageEntrainement })');
  const c = PageEntrainement.courbeFitness([{ meilleur: 100, moyenne: 50 }, { meilleur: 300, moyenne: 200 }, { meilleur: -20, moyenne: -40 }]);
  assert.ok(c.min <= -40 && c.max >= 300);
  for (const points of [c.meilleur, c.moyenne]) {
    for (const xy of points.split(' ')) {
      const [x, y] = xy.split(',').map(Number);
      assert.ok(x >= 36 && x <= 352 && y >= 8 && y <= 150, xy);
    }
  }
  assert.deepEqual({ ...PageEntrainement.courbeFitness([]) }, { meilleur: '', moyenne: '', min: 0, max: 1 });
  const poids = PageEntrainement.courbesPoids([[0, 1, 0, 0.5, 0.25], [1, 0, 1, 0.5, 0.75]]);
  assert.equal(poids.seek, '28.0,6.0 354.0,132.0');
  assert.equal(poids.arrive, '28.0,132.0 354.0,6.0');
});

test('modèles : Sauvegarder (dans la liste de la page et de la course), Charger, Renommer, Exporter, Importer, Supprimer', () => {
  const p = ouvrir();
  p.element('ia-nom-modele').value = 'Mon essai';
  p.element('ia-sauvegarder').fire('click');
  assert.match(p.element('ia-message').textContent, /sauvegardé/);
  const options = () => p.element('ia-liste-modeles').children.map(o => o.textContent);
  assert.ok(options().some(t => t.startsWith('Mon essai')));
  assert.ok(options().some(t => t.startsWith('Pilote par défaut')));
  // la liste « Modèle » des réglages de la course suit
  assert.ok(p.element('f1-modele-ia').children.some(o => o.textContent.startsWith('Mon essai')));
  const id = p.element('ia-liste-modeles').value;
  assert.equal(p.evaluate(`pageEntrainement.charger(${JSON.stringify(id)})`), true);
  assert.equal(p.evaluate(`pageEntrainement.renommer(${JSON.stringify(id)}, 'Renommé')`), true);
  assert.ok(options().some(t => t.startsWith('Renommé')));
  const texte = p.evaluate(`pageEntrainement.exporter(${JSON.stringify(id)})`);
  assert.equal(JSON.parse(texte).metadonnees.nom, 'Renommé');
  assert.equal(p.evaluate(`pageEntrainement.importer(${JSON.stringify(texte)}).ok`), true);
  assert.equal(options().filter(t => t.startsWith('Renommé')).length, 2);
  assert.equal(p.evaluate(`pageEntrainement.importer('{"format":"f1-modele-ia","version":7}').ok`), false);
  assert.match(p.element('ia-message').textContent, /incompatible/);
  assert.equal(p.evaluate(`pageEntrainement.supprimer(${JSON.stringify(id)})`), true);
  assert.equal(p.evaluate('pageEntrainement.supprimer("pilote-defaut")'), false);
});

test('sans localStorage : la sauvegarde marche pour la session, avec un message invitant à exporter', () => {
  const p = page().demarrer();
  p.draw();
  p.element('f1-bouton-entrainement').fire('click');
  p.element('ia-sauvegarder').fire('click');
  assert.match(p.element('ia-message').textContent, /indisponible.*Exporter/s);
  assert.ok(p.element('ia-liste-modeles').children.some(o => o.textContent.startsWith('Mon pilote')));
});

test('Tester le modèle : seul, puis contre les classiques ; Démarrer reprend l\'entraînement', () => {
  const p = ouvrir();
  p.element('ia-tester-seul').fire('click');
  assert.match(p.element('ia-etape').textContent, /Test · seul/);
  p.draw(20);
  assert.ok(p.evaluate('pageEntrainement.entraineur.demo.manche.temps') > 0);
  p.element('ia-tester-trafic').fire('click');
  assert.match(p.element('ia-etape').textContent, /Test · trafic/);
  p.draw(5);
  p.element('ia-demarrer').fire('click');
  assert.equal(p.evaluate('pageEntrainement.entraineur.demo'), null);
});

test('dessin p5 : la piste, les voitures et les rayons de la meilleure, sans erreur, à chaque image', () => {
  const p = ouvrir({ largeur: 1920, hauteur: 1080 });
  p.element('ia-demarrer').fire('click');
  p.calls.length = 0;
  p.draw(3);
  const noms = new Set(p.calls.map(c => c[0]));
  for (const n of ['background', 'vertex', 'rect', 'line', 'rotate']) assert.ok(noms.has(n), n);
  // 40 voitures dessinées (un rectangle chacune) par image
  assert.ok(p.calls.filter(c => c[0] === 'rect').length >= 40 * 3);
});

test('budget par image : à 20x avec une horloge lente, la page reste fluide (pas plus de pas que le budget)', () => {
  const p = ouvrir();
  p.glisser('ia-vitesse', 20);
  let t = 0;
  p.context.__horloge = () => (t += 2);
  p.evaluate('pageEntrainement.entraineur.horloge = __horloge');
  p.element('ia-demarrer').fire('click');
  const avant = p.evaluate('pageEntrainement.entraineur.tempsGeneration');
  p.draw();
  const pas = Math.round((p.evaluate('pageEntrainement.entraineur.tempsGeneration') - avant) * 60);
  assert.ok(pas >= 1 && pas <= p.evaluate('Entraineur.BUDGET_MS') / 2 + 1, `${pas} pas`);
});
