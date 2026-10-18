import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, read, generator } from './support.mjs';
import { page } from './page.mjs';

// Intégration de l'IA entraînée à la course : les vrais fichiers (Course, chronométrage, stands,
// safety car...) avec le modèle fourni (models/pilote-defaut.json). Une voiture IA fait un tour
// complet ; 20 voitures dont 11 IA sur 3 tours sans contact ni erreur ; la voiture pilotée n'a pas
// de réseau ; reprise de contrôle au stand et sous safety car ; chronométrage et classement.

const scene = loadScene(F1, '({ Course, VoitureF1, VoitureNeuronale, VoiturePilote, GestionnaireModeles })', { uniform: generator(3) });
const { Course, VoitureF1, VoitureNeuronale, VoiturePilote, GestionnaireModeles } = scene;
const { reseau, metadonnees } = GestionnaireModeles.lire(JSON.parse(read('models/pilote-defaut.json')));
const modele = { id: 'pilote-defaut', nom: metadonnees.nom, note: metadonnees.note, reseau };
function course(reglages = {}) {
  const p = Course.parametresParDefaut();
  Object.assign(p, { adversaires: 'ia', modeleIA: modele, ...reglages });
  return new Course(p);
}
// Les contacts de carrosserie (rectangles qui se chevauchent), comptés une fois par rencontre.
function compteurDeContacts() {
  let enCours = new Set();
  let total = 0;
  return {
    get total() { return total; },
    relever(c) {
      const maintenant = new Set();
      const vs = c.voitures.filter(v => !v.auStand);
      for (let a = 0; a < vs.length; a++) {
        for (let b = a + 1; b < vs.length; b++) {
          if (Math.hypot(vs[a].pos.x - vs[b].pos.x, vs[a].pos.y - vs[b].pos.y) > 30) continue;
          if (Course.chevauchement(vs[a].coins(), vs[b].coins()) <= 0) continue;
          const cle = `${vs[a].numero}|${vs[b].numero}`;
          maintenant.add(cle);
          if (!enCours.has(cle)) total++;
        }
      }
      enCours = maintenant;
    },
  };
}
const finis = c => c.voitures.every(v => [v.pos.x, v.pos.y, v.vel.x, v.vel.y].every(Number.isFinite));

test('« Classiques » par défaut : aucune VoitureNeuronale ; « IA entraînée » sans modèle : classiques aussi', () => {
  const p = Course.parametresParDefaut();
  assert.equal(p.adversaires, 'classiques');
  assert.ok(new Course(p).voitures.every(v => v.constructor === VoitureF1));
  assert.ok(course({ modeleIA: null }).voitures.every(v => v.constructor === VoitureF1));
  const c = course();
  assert.equal(c.voitures.length, 12);
  assert.ok(c.voitures.every(v => v instanceof VoitureNeuronale && v.modele.nom === 'Pilote par défaut'));
  // changer d'adversaires relance une course (nouvelle grille)
  const n = c.numeroCourse;
  c.regler('adversaires', 'classiques');
  assert.equal(c.numeroCourse, n + 1);
  assert.ok(c.voitures.every(v => v.constructor === VoitureF1));
});

test('une voiture IA fait un tour complet, chronométré, piloté par le réseau', () => {
  const c = course({ nombreVoitures: 2, nombreTours: 2, incidents: false });
  const v = c.voitures[0];
  let neuronal = 0;
  for (let k = 0; k < 60 * 60 && c.chronometrage.tours(v).length < 1; k++) {
    c.pas();
    if (v.pilotageNeuronal) neuronal++;
  }
  assert.ok(c.chronometrage.tours(v).length >= 1);
  const tour = c.chronometrage.tours(v)[0];
  assert.ok(tour.temps > 10 && tour.temps < 30, `${tour.temps}`);
  assert.ok(neuronal > 60 * 10);
  assert.ok(finis(c));
});

test('20 voitures dont 11 IA, 3 tours : arrivée de tous, aucun contact, aucune erreur ; classement et chronométrage cohérents', () => {
  const c = course({ nombreVoitures: 20, nombreTours: 3, nombreIA: 11, incidents: false });
  assert.equal(c.voitures.filter(v => v instanceof VoitureNeuronale).length, 11);
  assert.equal(c.voitures.filter(v => v.constructor === VoitureF1).length, 9);
  const contacts = compteurDeContacts();
  let pas = 0;
  while (!c.terminee && pas < 60 * 300) {
    c.pas();
    contacts.relever(c);
    pas++;
  }
  assert.equal(c.terminee, true);
  assert.equal(contacts.total, 0);
  assert.ok(finis(c));
  // classement final : 20 voitures, dans l'ordre des temps d'arrivée (même nombre de tours)
  const ordre = c.classement();
  assert.equal(ordre.length, 20);
  const arrivees = ordre.map(v => c.chronometrage.arrivee(v));
  assert.ok(arrivees.every(a => a !== null));
  for (let k = 1; k < arrivees.length; k++) {
    if (arrivees[k].tours === arrivees[k - 1].tours) assert.ok(arrivees[k].temps >= arrivees[k - 1].temps, `rang ${k}`);
  }
  // chaque voiture IA a des tours chronométrés, dans les mêmes eaux que les classiques
  const meilleur = v => Math.min(...c.chronometrage.tours(v).map(t => t.temps));
  const ia = c.voitures.filter(v => v instanceof VoitureNeuronale).map(meilleur);
  const classiques = c.voitures.filter(v => v.constructor === VoitureF1).map(meilleur);
  assert.ok(Math.min(...ia) < Math.max(...classiques) * 1.2 && Math.max(...ia) > Math.min(...classiques) * 0.8);
});

test('mode pilote : ta voiture est une VoiturePilote sans réseau, les 11 autres utilisent le modèle', () => {
  const c = course({ modePilote: true });
  c.choisirJoueur(4);
  assert.ok(c.joueur instanceof VoiturePilote);
  assert.ok(!(c.joueur instanceof VoitureNeuronale));
  assert.equal(c.joueur.reseau, undefined);
  const autres = c.voitures.filter(v => v !== c.joueur);
  assert.equal(autres.length, 11);
  assert.ok(autres.every(v => v instanceof VoitureNeuronale));
});

test('reprise de contrôle : au stand (décidé par la stratégie existante) puis en piste, le réseau rend et reprend la main', () => {
  const c = course({ nombreVoitures: 4, nombreTours: 4, incidents: false });
  const v = c.voitures[1];
  // la course démarre
  for (let k = 0; k < 60 * 12 && c.etat !== Course.ETATS.COURSE; k++) c.pas();
  for (let k = 0; k < 60 * 3; k++) c.pas();
  assert.equal(v.pilotageNeuronal, true);
  v.demanderStand();                          // comme la stratégie le fait (pneus usés)
  let auStand = false;
  let neuronalAuStand = false;
  let ressortie = false;
  for (let k = 0; k < 60 * 60 && !ressortie; k++) {
    c.pas();
    if (v.auStand) {
      auStand = true;
      neuronalAuStand ||= v.pilotageNeuronal;
    } else if (auStand && v.pilotageNeuronal) {
      ressortie = true;
    }
  }
  assert.ok(auStand, 'la voiture est entrée au stand');
  assert.equal(neuronalAuStand, false);
  assert.ok(ressortie, 'le réseau a repris la main à la sortie');
  assert.equal(v.arretsAuStand, 1);
});

test('reprise de contrôle sous safety car (et pendant la relance) ; puis le réseau reprend la course', () => {
  const c = course({ nombreVoitures: 6, nombreTours: 6, incidents: false });
  for (let k = 0; k < 60 * 12 && c.etat !== Course.ETATS.COURSE; k++) c.pas();
  for (let k = 0; k < 60 * 2; k++) c.pas();
  assert.ok(c.demanderSafetyCar());
  let sousSC = 0;
  let neuronalSousSC = 0;
  let relance = false;
  let neuronalEnRelance = 0;
  let reprise = false;
  for (let k = 0; k < 60 * 80 && !reprise; k++) {
    c.pas();
    if (c.etat === Course.ETATS.SAFETY_CAR) {
      sousSC++;
      neuronalSousSC += c.voitures.filter(v => v.pilotageNeuronal).length;
    }
    if (c.etat === Course.ETATS.RELANCE) {
      relance = true;
      neuronalEnRelance += c.voitures.filter(v => v.pilotageNeuronal).length;
    }
    if (relance && c.etat === Course.ETATS.COURSE && c.voitures.some(v => v.pilotageNeuronal)) reprise = true;
  }
  assert.ok(sousSC > 60 * 5);
  assert.equal(neuronalSousSC, 0);
  assert.ok(relance);
  assert.equal(neuronalEnRelance, 0);
  assert.ok(reprise);
  assert.ok(finis(c));
});

test('pluie : la course se court avec des IA sans contact (2 tours, piste mouillée)', () => {
  const c = course({ nombreVoitures: 12, nombreTours: 2, incidents: false, modeMeteo: 'manuel', intensitePluie: 0.8, profil: 'technique' });
  const contacts = compteurDeContacts();
  let pas = 0;
  while (!c.terminee && pas < 60 * 240) {
    c.pas();
    contacts.relever(c);
    pas++;
  }
  assert.ok(c.terminee);
  assert.ok(c.meteo.humidite > 0.3);
  assert.equal(contacts.total, 0);
});

test('dans la page : menu Adversaires, menu Modèle, curseur Variation, onglet IA (touche 5), badge IA du classement, menu JOUER', () => {
  const p = page({ largeur: 1600, hauteur: 900 }).demarrer();
  p.draw(2);
  assert.equal(p.element('f1-adversaires').value, 'classiques');
  assert.ok(p.element('f1-modele-ia').children.some(o => o.textContent.startsWith('Pilote par défaut')));
  p.element('f1-adversaires').value = 'ia';
  p.element('f1-adversaires').fire('change');
  p.draw(2);
  assert.equal(p.evaluate('formule1.course.voitures.every(v => v instanceof VoitureNeuronale)'), true);
  // une valeur inconnue est refusée
  p.element('f1-adversaires').value = 'robots';
  p.element('f1-adversaires').fire('change');
  assert.equal(p.element('f1-adversaires').value, 'ia');
  // variation des poids : un curseur, la course la reçoit (nouvelle grille)
  p.glisser('f1-variation-poids', 0.25);
  assert.equal(p.evaluate('formule1.course.parametres.variationPoids'), 0.25);
  assert.equal(p.evaluate('formule1.course.voitures[3].variation'), 0.25);
  p.glisser('f1-variation-poids', 0.5);                // hors plage : refusé
  assert.equal(p.evaluate('formule1.course.parametres.variationPoids'), 0.25);
  // onglet IA
  p.touche('5');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-page-ia').hidden, false);
  assert.equal(p.element('f1-ia-adversaires').textContent, 'IA entraînée');
  assert.equal(p.element('f1-ia-modele').textContent, 'Pilote par défaut');
  assert.equal(p.element('f1-ia-nombre').textContent, '12');
  assert.match(p.element('f1-ia-note').textContent, /^\d+\/100$/);
  // badge IA dans le classement, avec le nom du modèle
  const badges = p.element('f1-tour-lignes').children.flatMap(l => l.children[3].children).filter(e => e.className === 'ia-badge-ligne');
  assert.equal(badges.length, 12);
  assert.match(badges[0].getAttribute('title'), /Pilote par défaut/);
  // le bouton de l'onglet ouvre la page d'entraînement
  p.element('f1-ia-entrainement').fire('click');
  assert.equal(p.evaluate('pageEntrainement.ouverte'), true);
  p.touche('Escape');
  // menu JOUER : Adversaires « Classiques » relance une course classique
  p.evaluate('interfaceF1.ouvrirMenuModes()');
  assert.equal(p.evaluate('interfaceF1.menuModes.adversaires'), 'ia');
  p.evaluate('interfaceF1.menuModes.choisir("spectateur"); interfaceF1.menuModes.choisirAdversaires("classiques")');
  p.evaluate('interfaceF1.lancerPartie(interfaceF1.menuModes.options())');
  assert.equal(p.element('f1-adversaires').value, 'classiques');
  assert.equal(p.evaluate('formule1.course.voitures.some(v => v instanceof VoitureNeuronale)'), false);
});

test('debug (case Debug) avec des IA : les aides se dessinent sans erreur', () => {
  const p = page().demarrer();
  p.element('f1-adversaires').value = 'ia';
  p.element('f1-adversaires').fire('change');
  for (let k = 0; k < 700 && p.evaluate('formule1.course.etat') !== 'COURSE'; k++) p.draw();
  p.draw(120);
  p.element('f1-debug').checked = true;
  p.element('f1-debug').fire('change');
  p.calls.length = 0;
  assert.doesNotThrow(() => p.draw(3));
  assert.ok(p.calls.length > 0);
});
