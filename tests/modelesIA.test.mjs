import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadScene, F1, read } from './support.mjs';

// GestionnaireModeles : sauvegarde, liste, renommage, suppression, export, import ; localStorage
// indisponible = repli sans erreur ; version incompatible refusée ; modèle fourni (models/).

const scene = loadScene(F1, '({ Vehicle, GestionnaireModeles, ReseauNeuronal })');
const { Vehicle, GestionnaireModeles, ReseauNeuronal } = scene;
// un faux localStorage (Map) ; `casse` : chaque accès lève une erreur (navigation privée, quota)
function stockage({ casse = false } = {}) {
  const m = new Map();
  const garde = f => (...a) => { if (casse) throw new Error('SecurityError'); return f(...a); };
  return { m, getItem: garde(k => (m.has(k) ? m.get(k) : null)), setItem: garde((k, v) => m.set(k, String(v))), removeItem: garde(k => m.delete(k)) };
}
const reseau = g => new ReseauNeuronal(12, ReseauNeuronal.mulberry32(g));
const entree = [0.2, 0.4, 0.9, 0.1, 0.6, 1, 0.8, -0.3];
const meta = { nom: 'Rapide', date: '2026-10-18T10:00:00.000Z', generations: 12, meilleurFitness: 287.5, note: 81 };

test('le gestionnaire n\'est pas un Vehicle', () => {
  assert.notEqual(Object.getPrototypeOf(GestionnaireModeles), Vehicle);
});

test('sauvegarder puis charger : le même réseau (mêmes sorties), avec ses métadonnées ; liste, renommer, supprimer', () => {
  const s = stockage();
  const g = new GestionnaireModeles({ stockage: s });
  assert.equal(g.disponible, true);
  const r = reseau(3);
  const sauve = g.sauvegarder(r, meta);
  assert.equal(sauve.ok, true);
  assert.equal(sauve.message, '');
  const { reseau: relu, metadonnees } = g.charger(sauve.id);
  assert.deepEqual(relu.passeAvant(entree), r.passeAvant(entree));
  assert.deepEqual({ ...metadonnees }, meta);
  // écrit dans le stockage : un nouveau gestionnaire le retrouve
  const g2 = new GestionnaireModeles({ stockage: s });
  assert.deepEqual(Array.from(g2.liste()).map(m => m.nom), ['Rapide']);
  assert.deepEqual(g2.charger(sauve.id).reseau.passeAvant(entree), r.passeAvant(entree));
  // liste, renommer, supprimer
  const autre = g.sauvegarder(reseau(4), { ...meta, nom: 'Prudent' });
  assert.notEqual(autre.id, sauve.id);
  assert.deepEqual(Array.from(g.liste()).map(m => m.nom), ['Rapide', 'Prudent']);
  assert.equal(g.renommer(sauve.id, '  Très rapide '), true);
  assert.equal(g.charger(sauve.id).metadonnees.nom, 'Très rapide');
  assert.equal(g.renommer(sauve.id, '   '), false);
  assert.equal(g.supprimer(autre.id), true);
  assert.equal(g.supprimer(autre.id), false);
  assert.deepEqual(Array.from(g.liste()).map(m => m.nom), ['Très rapide']);
  assert.throws(() => g.charger('inconnu'), { name: 'RangeError' });
  assert.deepEqual(Array.from(new GestionnaireModeles({ stockage: s }).liste()).map(m => m.nom), ['Très rapide']);
});

test('exporter puis importer : un document JSON complet (architecture, poids, version, métadonnées)', () => {
  const g = new GestionnaireModeles({ stockage: stockage() });
  const r = reseau(5);
  const { id } = g.sauvegarder(r, meta);
  const texte = g.exporter(id);
  const doc = JSON.parse(texte);
  assert.equal(doc.format, 'f1-modele-ia');
  assert.equal(doc.version, ReseauNeuronal.VERSION);
  assert.deepEqual(doc.architecture, { entrees: 8, caches: 12, sorties: 4, activationCachee: 'tanh', activationSortie: 'sigmoide' });
  assert.equal(doc.poids.caches.length, 96);
  assert.deepEqual(doc.metadonnees, meta);
  // import dans un autre navigateur
  const ailleurs = new GestionnaireModeles({ stockage: stockage() });
  const importe = ailleurs.importer(texte);
  assert.equal(importe.ok, true);
  assert.deepEqual(ailleurs.charger(importe.id).reseau.passeAvant(entree), r.passeAvant(entree));
  assert.equal(ailleurs.charger(importe.id).metadonnees.note, 81);
});

test('version incompatible, autre format, JSON illisible, poids manquants : refusés avec un message clair, rien ne change', () => {
  const g = new GestionnaireModeles({ stockage: stockage() });
  const doc = JSON.parse(JSON.stringify(GestionnaireModeles.documentDe(reseau(6), meta)));
  const cas = [
    [{ ...doc, version: 2 }, /Version de modèle incompatible/],
    [{ ...doc, format: 'autre' }, /pas un modèle/],
    ['{ pas du json', /illisible/],
    [{ ...doc, poids: { ...doc.poids, sorties: [1, 2] } }, /incompatible/i],
    [{ ...doc, architecture: { ...doc.architecture, caches: 40 } }, /neurones cachés/],
  ];
  for (const [entreeDoc, message] of cas) {
    const r = g.importer(typeof entreeDoc === 'string' ? entreeDoc : JSON.stringify(entreeDoc));
    assert.equal(r.ok, false);
    assert.match(r.message, message);
  }
  assert.equal(g.liste().length, 0);
  assert.throws(() => GestionnaireModeles.lire({ ...doc, version: 0 }), { name: 'RangeError', message: /incompatible/ });
});

test('localStorage indisponible (absent ou qui lève) : repli sans erreur, modèle gardé pour la session, message clair', () => {
  for (const s of [null, stockage({ casse: true })]) {
    const g = new GestionnaireModeles({ stockage: s });
    assert.equal(g.disponible, false);
    const r = g.sauvegarder(reseau(7), meta);
    assert.equal(r.ok, false);
    assert.match(r.message, /indisponible.*Exporter/s);
    assert.deepEqual(Array.from(g.liste()).map(m => m.nom), ['Rapide']);
    assert.ok(g.exporter(r.id).includes('"f1-modele-ia"'));
    assert.equal(g.importer(g.exporter(r.id)).ok, true);
    assert.equal(g.liste().length, 2);
  }
  // un stockage abîmé (texte illisible) : ignoré, pas d'erreur
  const s = stockage();
  s.setItem(GestionnaireModeles.CLE, '{ cassé');
  assert.equal(new GestionnaireModeles({ stockage: s }).liste().length, 0);
});

test('modèles fournis : listés en premier, chargeables, ni renommés ni supprimés ; un fourni illisible est ignoré', () => {
  const doc = GestionnaireModeles.documentDe(reseau(8), { ...meta, nom: 'Fourni' });
  const g = new GestionnaireModeles({ stockage: stockage(), integres: [{ id: 'fourni', document: doc }, { id: 'abime', document: { format: 'x' } }] });
  g.sauvegarder(reseau(9), meta);
  assert.deepEqual(Array.from(g.liste()).map(m => [m.nom, m.integre]), [['Fourni', true], ['Rapide', false]]);
  assert.equal(g.renommer('fourni', 'X'), false);
  assert.equal(g.supprimer('fourni'), false);
  assert.ok(g.charger('fourni').reseau instanceof ReseauNeuronal);
});

test('le modèle fourni avec le jeu (models/) est valide, le même dans le JSON et dans le script', () => {
  const json = JSON.parse(read('models/pilote-defaut.json'));
  const { reseau: r, metadonnees } = GestionnaireModeles.lire(json);
  assert.ok(r instanceof ReseauNeuronal);
  assert.equal(metadonnees.nom, 'Pilote par défaut');
  assert.ok(Number.isInteger(metadonnees.generations) && metadonnees.generations > 0);
  assert.ok(metadonnees.note >= 0 && metadonnees.note <= 100);
  const contexte = vm.createContext({});
  vm.runInContext(read('models/piloteDefaut.js'), contexte);
  assert.equal(vm.runInContext('JSON.stringify(MODELE_PILOTE_DEFAUT)', contexte), JSON.stringify(json));
});
