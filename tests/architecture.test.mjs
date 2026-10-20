import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { read, loadScene, RACINE, chemin, sha256, empreinteReference } from './support.mjs';

// Garde-fous : vehicle.js est intact ; les entités étendent Vehicle sans recopier son code ; aucun
// comportement n'écrit directement une position ou une vitesse ; le temps est reçu en paramètre ;
// les règles de style du projet sont respectées.

// Contenu sans retours chariot : le dépôt peut être extrait en CRLF (Windows) ou en LF.
const normalise = texte => texte.replace(/\r/g, '');
const sha256Texte = texte => createHash('sha256').update(texte, 'utf8').digest('hex');
// Retire les commentaires : seules les références de code comptent.
const code = name => normalise(read(name)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
// Entités de l'écran de fin et des accidents (venues du dossier d'origine) : des Vehicle.
const FICHIERS = { 'particule.js': 'Particule', 'perturbation.js': 'Perturbation' };
const ENTITES = Object.keys(FICHIERS);
// Circuit Formule 1 : ce qui bouge (véhicules) et ce qui ne bouge pas (calcul, décor, habillage,
// direction de course, caméra, réglages).
const F1_MOBILES = { 'voitureF1.js': ['VoitureF1', 'Vehicle'], 'safetyCar.js': ['SafetyCar', 'VoitureF1'],
  'fumee.js': ['Fumee', 'Vehicle'], 'drone.js': ['DroneCamera', 'Vehicle'],
  'voiturePilote.js': ['VoiturePilote', 'VoitureF1'], 'gerbeEau.js': ['GerbeEau', 'Fumee'], 'debris.js': ['Debris', 'Vehicle'],
  'etincelle.js': ['Etincelle', 'Fumee'], 'commissaire.js': ['Commissaire', 'Vehicle'],
  'mecanicien.js': ['Mecanicien', 'Vehicle'], 'gerbePoussiere.js': ['GerbePoussiere', 'Fumee'],
  'billeGomme.js': ['BilleGomme', 'Debris'], 'voitureNeuronale.js': ['VoitureNeuronale', 'VoitureF1'], 'confetti.js': ['Confetti', 'Vehicle'], 'pointRejouer.js': ['PointRejouer', 'Particule'] };
const F1_FIXES = { 'circuit.js': 'Circuit', 'decorCircuit.js': 'DecorCircuit', 'classement.js': 'Classement',
  'camera.js': 'Camera', 'course.js': 'Course', 'meteo.js': 'Meteo', 'ecranFin.js': 'EcranFin', 'hudPilote.js': 'HudPilote',
  'chronometrage.js': 'Chronometrage', 'surfaces.js': 'CarteSurfaces', 'incidents.js': 'GestionIncidents',
  'equipeDeStand.js': 'EquipeDeStand', 'voieDesStands.js': 'VoieDesStands', 'spriteVoiture.js': 'SpriteVoiture',
  'tracesPneus.js': 'TracesPneus', 'ambiance.js': 'Ambiance', 'foule.js': 'Foule', 'effetsVitesse.js': 'EffetsVitesse',
  'telemetrie.js': 'Telemetrie', 'carteChaleur.js': 'CarteChaleur', 'bullesRadio.js': 'BullesRadio', 'prediction.js': 'Prediction',
  'historiquePositions.js': 'HistoriquePositions', 'miniCarte.js': 'MiniCarte', 'manager.js': 'Manager',
  'championnat.js': 'Championnat', 'podium.js': 'Podium', 'ecranPartage.js': 'EcranPartage',
  'barreHaut.js': 'BarreHaut', 'tourClassement.js': 'TourClassement', 'hudCourse.js': 'HudCourse', 'bandeauEvenements.js': 'BandeauEvenements',
  'ongletTelemetrie.js': 'OngletTelemetrie', 'ongletPrediction.js': 'OngletPrediction', 'ongletHistorique.js': 'OngletHistorique',
  'panneauLateral.js': 'PanneauLateral', 'fenetreAide.js': 'FenetreAide', 'interfaceF1.js': 'InterfaceF1', 'carteCircuit.js': 'CarteCircuit',
  'feuxDepart.js': 'FeuxDepart', 'bandeauNeutralisation.js': 'BandeauNeutralisation', 'panneauStand.js': 'PanneauStand',
  'podiumFin.js': 'PodiumFin', 'ecranRejouer.js': 'EcranRejouer', 'hudDuel.js': 'HudDuel',
  'diagnosticPerf.js': 'DiagnosticPerf', 'consignePilote.js': 'ConsignePilote',
  'planchesSprites.js': 'PlancheSprites', 'qualiteRendu.js': 'QualiteRendu', 'compteurImages.js': 'CompteurImages',
  'incidentJoueur.js': 'IncidentJoueur', 'decompteReprise.js': 'DecompteReprise', 'encartRejouer.js': 'EncartRejouer',
  'menuPause.js': 'MenuPause', 'menuModes.js': 'MenuModes',
  // IA entraînée : réseau, capteurs, entraîneur, modèles, page et onglet ne bougent rien
  'reseauNeuronal.js': 'ReseauNeuronal', 'capteursVoiture.js': 'CapteursVoiture', 'entraineur.js': 'Entraineur',
  'modelesIA.js': 'GestionnaireModeles', 'pageEntrainement.js': 'PageEntrainement', 'ongletIA.js': 'OngletIA' };
// modules de données ou de calcul, sans classe : personnalités, pneus, stratégie de stands
const F1_MODULES = ['affectation.js', 'personnalites.js', 'pneus.js', 'strategie.js', 'glisse.js', 'ordresEquipe.js', 'livrees.js', 'defis.js', 'domF1.js', 'imageAlpha.js'];
const F1_FICHIERS = [...Object.keys(F1_MOBILES), ...Object.keys(F1_FIXES), ...F1_MODULES, 'reglagesF1.js'];
const NOUVEAUX = [...ENTITES, 'grilleSpatiale.js', 'reglages.js', 'scenarios.js', 'sketch.js', ...F1_FICHIERS];
// Définitions de classes d'un fichier : [nom, classe étendue ou undefined].
const classesDe = fichier => [...code(fichier).matchAll(/\bclass\s+(\w+)(?:\s+extends\s+(\w+))?/g)].map(m => [m[1], m[2]]);

// --- vehicle.js (fourni, protégé) ------------------------------------------------------------

test('vehicle.js est inchangé : son empreinte est celle de la copie d\'origine (tests/vehicle.sha256)', () => {
  const ici = read('vehicle.js');
  assert.match(empreinteReference(), /^[0-9a-f]{64}$/);
  assert.equal(sha256('vehicle.js'), empreinteReference());
  // ses défauts connus sont toujours là : ils sont contournés dans les sous-classes, pas corrigés ici
  assert.match(ici, /flee\(target\) \{\s*\/\/ recopier code de flee de l'exemple précédent\s*\}/);
  assert.match(ici, /force\.limit\(this\.maxForce\);\s*return vitesseDesiree;/);
  assert.match(ici, /circle\(target\.x, target\.y, this\.rayonZoneDeFreinage\);/);
});

test('l\'empreinte détecte une modification (le garde-fou peut échouer)', () => {
  const ici = read('vehicle.js');
  assert.notEqual(sha256Texte(ici.replace('this.maxSpeed = 4;', 'this.maxSpeed = 5;')), sha256Texte(ici));
  assert.equal(sha256Texte(ici), sha256('vehicle.js'));
});

// --- Hiérarchie ------------------------------------------------------------------------------

test('le retrait des commentaires fonctionne (sinon les gardes ci-dessous ne vérifient rien)', () => {
  assert.match(read('particule.js'), /\/\/ Particule d'encre/);
  assert.doesNotMatch(code('particule.js'), /Particule d'encre/);
  assert.match(code('particule.js'), /class Particule extends Vehicle/);
});

test('un fichier par classe ; Particule et Perturbation étendent directement Vehicle', () => {
  for (const [fichier, classe] of Object.entries(FICHIERS)) {
    assert.deepEqual(classesDe(fichier), [[classe, 'Vehicle']], fichier);
  }
  // la grille spatiale est un outil de calcul, pas une entité : ce n'est pas un Vehicle
  assert.deepEqual(classesDe('grilleSpatiale.js'), [['GrilleSpatiale', undefined]]);
  for (const fichier of ['affectation.js', 'reglages.js', 'scenarios.js', 'sketch.js']) assert.doesNotMatch(code(fichier), /\bclass\s/, fichier);
});

test('Particule et Perturbation sont de vrais véhicules', () => {
  const classes = loadScene(['vehicle.js', 'particule.js', 'perturbation.js'], '({ Vehicle, Particule, Perturbation })');
  const { Vehicle } = classes;
  for (const nom of ['Particule', 'Perturbation']) {
    const Classe = classes[nom];
    assert.equal(Object.getPrototypeOf(Classe), Vehicle, nom);
    const instance = new Classe(10, 10);
    assert.ok(instance instanceof Vehicle, nom);
    for (const propriete of ['pos', 'vel', 'acc', 'maxSpeed', 'maxForce', 'r']) assert.ok(propriete in instance, `${nom}.${propriete}`);
    assert.equal(instance.applyForce, Vehicle.prototype.applyForce, nom);
  }
});

test('le temps est reçu en paramètre (sketch.js : deltaTime / 1000) ; Vehicle.debug reste éteint', () => {
  for (const fichier of [...ENTITES, 'grilleSpatiale.js', 'affectation.js', 'reglages.js', 'scenarios.js']) {
    assert.doesNotMatch(code(fichier), /\b(setInterval|setTimeout|Date\.now|performance\.now|millis|frameCount|deltaTime)\b/, fichier);
  }
  assert.match(code('sketch.js'), /deltaTime \/ 1000/);
  assert.match(code('sketch.js'), /Vehicle\.debug = debug && scenario\.aidesDeVehicle;/);
});

// --- Style -----------------------------------------------------------------------------------

test('style : JavaScript classique (pas de modules), indentation de 2 espaces, pas de tabulation', () => {
  for (const fichier of NOUVEAUX) {
    const source = normalise(read(fichier));
    assert.doesNotMatch(code(fichier), /^\s*(import|export)\s/m, fichier);
    assert.doesNotMatch(source, /\t/, `${fichier} contient une tabulation`);
    source.split('\n').forEach((ligne, i) => {
      const retrait = ligne.match(/^ */)[0].length;
      assert.equal(retrait % 2, 0, `${fichier}:${i + 1} retrait de ${retrait} espaces`);
    });
  }
});

test('index.html : un <script> par fichier JavaScript du dossier, ni plus ni moins', () => {
  const html = read('index.html');
  const tous = [...html.matchAll(/<script src="([^"]+)">\s*<\/script>/g)].map(m => m[1]);
  // p5 et le modèle fourni (des données, dans models/) sont à part ; ils existent
  const charges = tous.filter(src => !src.startsWith('libraries/') && !src.startsWith('models/'));
  assert.deepEqual(tous.filter(src => src.startsWith('models/')), ['models/piloteDefaut.js']);
  assert.deepEqual(readdirSync(chemin('models')).sort(), ['pilote-defaut.json', 'piloteDefaut.js']);
  const presents = readdirSync(RACINE).filter(nom => nom.endsWith('.js'));
  assert.deepEqual([...charges].sort(), presents.sort());
});

test('tous les fichiers de tests sont des suites ou des outils connus', () => {
  const tests = readdirSync(chemin('tests')).filter(nom => nom.endsWith('.mjs'));
  const outils = tests.filter(nom => !nom.endsWith('.test.mjs'));
  assert.deepEqual(outils.sort(), ['page.mjs', 'support.mjs']);
});

// --- Circuit Formule 1 ---------------------------------------------------------------------------

test('F1 : un fichier par classe ; ce qui bouge étend Vehicle (SafetyCar via VoitureF1), le reste non', () => {
  for (const [fichier, [classe, parent]] of Object.entries(F1_MOBILES)) {
    assert.deepEqual(classesDe(fichier), [[classe, parent]], fichier);
  }
  for (const [fichier, classe] of Object.entries(F1_FIXES)) {
    assert.deepEqual(classesDe(fichier), [[classe, undefined]], fichier);
  }
  for (const fichier of [...F1_MODULES, 'reglagesF1.js']) assert.doesNotMatch(code(fichier), /\bclass\s/, fichier);
  // la garde de classe reconnaît bien un « extends »
  assert.deepEqual([...'class A extends B {}'.matchAll(/\bclass\s+(\w+)(?:\s+extends\s+(\w+))?/g)].map(m => [m[1], m[2]]), [['A', 'B']]);
});

test('F1 : aucun fichier n\'écrit pos, vel ou acc ; pas de souris, de minuteur ni de Vehicle.debug', () => {
  const ecriture = /\.(pos|vel|acc)(\.[xy])?\s*([-+*/]?=(?!=)|\.(set|add|sub|mult|div|setMag|limit|normalize|rotate|setHeading|lerp)\s*\()/;
  assert.match('this.vel.limit(2)', ecriture);
  assert.match('voiture.pos.x = 3', ecriture);
  assert.doesNotMatch('const v = this.vel.copy(); v.mult(2); this.pos.x === 3', ecriture);
  const temps = /\b(setInterval|setTimeout|Date\.now|performance\.now|millis|frameCount|deltaTime)\b/;
  assert.match('const t = millis();', temps);
  assert.doesNotMatch('const millisecondes = 3;', temps);
  // seule exception : la règle de scène « Continuer la course » (VoiturePilote.reapparaitre),
  // demandée explicitement ; elle n'écrit que dans son propre corps
  const sansReapparition = (fichier, texte) => {
    if (fichier !== 'voiturePilote.js') return texte;
    const debut = texte.indexOf('  reapparaitre(');
    const fin = texte.indexOf('\n  }\n', debut);
    assert.ok(debut > 0 && fin > debut, 'reapparaitre trouvée');
    return texte.slice(0, debut) + texte.slice(fin);
  };
  assert.match(code('voiturePilote.js'), ecriture);
  assert.doesNotMatch(sansReapparition('voiturePilote.js', code('voiturePilote.js')), ecriture);
  for (const fichier of F1_FICHIERS) {
    assert.doesNotMatch(sansReapparition(fichier, code(fichier)), ecriture, fichier);
    assert.doesNotMatch(code(fichier), /\bmouse[XY]\b/, fichier);
    assert.doesNotMatch(code(fichier), temps, fichier);
    assert.doesNotMatch(code(fichier), /Vehicle\.debug/, fichier);
    assert.doesNotMatch(code(fichier), /\.(pursue|evade)\(/, fichier);
  }
});

test('F1 : les véhicules réutilisent les comportements de Vehicle ; flee et garderDansFenetre sont empruntées à Particule', () => {
  const definit = (source, methode) => new RegExp(`^\\s*${methode}\\s*\\([^)]*\\)\\s*\\{`, 'm').test(source);
  assert.ok(definit(code('voitureF1.js'), 'flee'));                // la garde reconnaît une définition
  assert.ok(!definit('  this.flee(cible);', 'flee'));              // et pas un appel
  for (const fichier of Object.keys(F1_MOBILES)) {
    for (const methode of ['seek', 'arrive', 'wander', 'boundaries', 'pursue', 'evade', 'applyForce', 'edges']) {
      assert.ok(!definit(code(fichier), methode), `${fichier} redéfinit ${methode}`);
    }
    if (fichier !== 'voitureF1.js') assert.ok(!definit(code(fichier), 'flee'), `${fichier} redéfinit flee`);
    if (/^\s*update\s*\(/m.test(code(fichier))) assert.match(code(fichier), /super\.update\(/, fichier);
  }
  assert.match(code('voitureF1.js'), /flee\(cible\) \{\s*return Particule\.prototype\.flee\.call\(this, cible\);\s*\}/);
  assert.match(code('drone.js'), /return Particule\.prototype\.garderDansFenetre\.call\(this, largeur, hauteur, marge\);/);
  // la safety car ne recopie pas la conduite de VoitureF1 : elle en hérite
  for (const methode of ['conduireAuStand', 'garderSurPiste', 'eviter', 'conduire']) {
    assert.ok(!definit(code('safetyCar.js'), methode), methode);
  }
  // chaque comportement appelle ceux de Vehicle tels quels, et passe par applyForce
  for (const appel of ['this.seek(', 'this.arrive(', 'this.wander(', 'this.applyForce(']) {
    assert.ok(code('voitureF1.js').includes(appel), appel);
  }
});

test('F1 : la direction de course, le scénario, le décor, le classement et la caméra ne calculent aucune force', () => {
  const pilotage = /applyForce|\.seek\(|\.arrive\(|\.flee\(|\.wander\(|garderSurPiste\(|\.eviter\(/;
  assert.match('voiture.arrive(cible)', pilotage);
  for (const fichier of [...Object.keys(F1_FIXES), ...F1_MODULES, 'reglagesF1.js']) {
    assert.doesNotMatch(code(fichier), pilotage, fichier);
  }
  const scenario = code('scenarios.js').slice(code('scenarios.js').indexOf('function formule1'));
  assert.ok(scenario.length > 100);
  assert.doesNotMatch(scenario, pilotage);
});

test('F1 : l\'usage volontaire du map non borné d\'arrive (apex, file, voiture de devant) est documenté', () => {
  const source = read('voitureF1.js');
  assert.equal((source.match(/Usage VOLONTAIRE du map non borné/g) ?? []).length, 3);
  assert.match(source, /NÉGATIF/);
  assert.match(source, /RECULE/);
  assert.match(code('voitureF1.js'), /this\.arrive\(apex, d\)/);
  assert.match(code('voitureF1.js'), /this\.arrive\(cible, ecart\)/);
  assert.match(code('voitureF1.js'), /this\.arrive\(pointSuivi, aGarder\)/);
  assert.match(code('voitureF1.js'), /const aGarder = p\.distanceAGarder \* this\.prudenceAdherence\(\);/);
  // le debug dessine le cercle de freinage au bon rayon (circle attend un diamètre)
  assert.match(code('voitureF1.js'), /circle\(arrive\.x, arrive\.y, this\.rayonZoneDeFreinage \* 2\)/);
});
