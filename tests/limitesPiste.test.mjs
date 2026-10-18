import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScene, F1, chemin } from './support.mjs';
import { page } from './page.mjs';

// Limites de piste et accidents du joueur (17 octobre 2026). Trois zones :
//   a. sur la piste ou sur le VIBREUR : rien (le vibreur fait partie de la piste, même deux roues
//      au-delà de la ligne blanche ne sont pas une faute) ;
//   b. LIMITES DE PISTE : les QUATRE roues au-delà du bord extérieur du vibreur (ou de la ligne
//      blanche là où il n'y en a pas) plus de toleranceLimites ms (500), sans contact : pas de
//      remise en piste, ni safety car, ni VSC ; 1re et 2e fois : avertissement (« Limites de piste ·
//      avertissement 1/3 ») ; ensuite +5 s à chaque fois ; place gagnée en coupant : +5 s tout de
//      suite ; « Limites de piste strictes » (désactivé) : la ligne blanche même là où il y a un
//      vibreur ;
//   c. ACCIDENT : contact avec un mur, un rail, des pneus empilés ou une voiture (carrosseries qui se
//      touchent), au-delà de vitesseImpact km/h (40) ou enfoncé : la séquence d'incident (radio,
//      safety car, remise en piste, +10 s, encart « Rejouer »).

const scene = loadScene(F1, '({ Course, Circuit, VoitureF1, VoiturePilote, CarteSurfaces, DecorCircuit, IncidentJoueur, BandeauEvenements, PodiumFin })');
const { Course, Circuit, VoitureF1, VoiturePilote, CarteSurfaces, DecorCircuit, IncidentJoueur, BandeauEvenements, PodiumFin } = scene;
const PAS = Course.PAS_TEMPS;

// Une course partie (4 voitures, le joueur en tête de grille), sans incidents de l'IA.
function enCourse(reglages = {}) {
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, modePilote: true, nombreVoitures: 4, ...reglages }, Circuit.generateur(1999));
  c.murs = Course.decor(c.circuit).murs;
  c.choisirJoueur(0);
  for (let i = 0; i < 60 * 12 && c.etat !== Course.ETATS.COURSE; i++) c.pas();
  assert.equal(c.etat, Course.ETATS.COURSE);
  c.joueur.passerA(VoitureF1.ETATS.COURSE);
  return c;
}
// Règle de test : la voiture du joueur posée au point i, à `ecart` px de l'axe, lancée le long de
// la piste à `kmh`.
function poser(c, i, ecart, kmh = 150, j = c.joueur) {
  const q = c.circuit.pointLateral(i, ecart);
  const t = c.circuit.tangentes[i];
  const v = kmh / VoiturePilote.KMH;
  j.pos.set(q.x, q.y);
  j.vel.set(t.x * v, t.y * v);
  j.capCarrosserie = Math.atan2(t.y, t.x);
  j.indicePiste = i;
  j.ecartLateral = c.circuit.ecartLateral(q.x, q.y, i);
}
// Tenir la position `secondes` (un contrôle par pas de simulation).
function tenir(c, i, ecart, secondes, j = c.joueur) {
  const resultats = [];
  for (let t = 0; t < secondes - 1e-9; t += PAS) {
    poser(c, i, ecart, 150, j);
    resultats.push(c.surveillerLesLimites(j));
  }
  return resultats.filter(r => r !== null);
}
const textes = c => Array.from(c.evenements, e => e.texte);
const limites = c => textes(c).filter(t => /Limites de piste/.test(t));
// l'épingle : le virage le plus serré ; un point hors de tout vibreur (ligne droite)
const epingle = c => [...c.circuit.virages].sort((a, b) => b.courbure - a.courbure)[0];
const droite = c => {
  const s = Course.surfaces(c.circuit);
  return c.circuit.points.findIndex((_, i) => !s.bordures['1'][i] && !s.bordures['-1'][i] && c.circuit.virages.every(v => Math.abs(i - v.apex) > 40));
};
const DEMI = 50;
const RESTE = VoitureF1.LARGEUR / 2;

// --- géométrie -----------------------------------------------------------------------------

test('géométrie : ligne blanche 3,5 px et vibreur 11 px au-delà de l\'asphalte (ceux du décor dessiné), vibreurs des deux côtés dans chaque virage', () => {
  assert.equal(Circuit.LARGEUR_PISTE / 2, DEMI);
  const T = DecorCircuit.TRAITS;
  assert.equal(CarteSurfaces.LIGNE_BLANCHE, (T.ligneBlanche - T.asphalte) / 2);
  assert.equal(CarteSurfaces.VIBREUR_DESSINE, (T.vibreur - T.asphalte) / 2);
  const c = enCourse();
  const s = Course.surfaces(c.circuit);
  for (const v of c.circuit.virages) {
    for (const i of [v.debut, v.apex, v.fin]) for (const cote of [1, -1]) {
      assert.equal(s.bordures[String(cote)][i], true, `vibreur ${i} ${cote}`);
      assert.equal(s.limite(i, cote), DEMI + 11);
      assert.equal(s.limite(i, cote, { strictes: true }), DEMI + 3.5);
    }
  }
  const i = droite(c);
  assert.ok(i >= 0);
  assert.equal(s.limite(i, 1), DEMI + 3.5);
});

test('roues : quatre points aux coins de la voiture, tournés avec elle', () => {
  const c = enCourse();
  const j = c.joueur;
  poser(c, 30, 0);
  const roues = j.roues();
  assert.equal(roues.length, 4);
  const cx = roues.reduce((s, r) => s + r.x, 0) / 4;
  const cy = roues.reduce((s, r) => s + r.y, 0) / 4;
  assert.ok(Math.hypot(cx - j.pos.x, cy - j.pos.y) < 1e-6);
  const ecarts = roues.map(r => c.circuit.ecartLateral(r.x, r.y, 30)).sort((a, b) => a - b);
  assert.ok(Math.abs(ecarts[0] + RESTE) < 0.2 && Math.abs(ecarts[3] - RESTE) < 0.2, ecarts.join(','));
  assert.equal(VoitureF1.VOIE, VoitureF1.LARGEUR);
  assert.ok(VoitureF1.EMPATTEMENT > 0 && VoitureF1.EMPATTEMENT < VoitureF1.LONGUEUR);
});

// --- a. vibreur : rien -------------------------------------------------------------------------

test('a. le cas signalé : à l\'intérieur de l\'épingle, sur le vibreur (deux roues au-delà de la ligne blanche, même au bord du vibreur) : aucun message, aucune pénalité, aucun incident', () => {
  const c = enCourse();
  const v = epingle(c);
  for (const ecart of [DEMI + 3, DEMI + 8, DEMI + 11, DEMI + 11 + RESTE - 0.5]) {
    // (l'ancienne règle : centre au-delà de 55,5 px pendant 0,3 s = sortie de piste)
    assert.deepEqual(tenir(c, v.apex, v.sens * ecart, 3), [], `centre à ${ecart} px`);
  }
  assert.deepEqual(limites(c), []);
  assert.equal(c.joueur.limites, 0);
  assert.equal(c.joueur.penalites, 0);
  assert.equal(c.joueur.incident, null);
  assert.equal(c.joueur.sousControle, true);
  assert.equal(c.etat, Course.ETATS.COURSE);
  // même chose à l'extérieur, et dans les autres virages
  for (const w of c.circuit.virages) assert.deepEqual(tenir(c, w.apex, -w.sens * (DEMI + 9), 1), []);
  assert.equal(c.joueur.limites, 0);
});

test('a. ligne droite (pas de vibreur) : deux roues sur la ligne blanche ou au-delà ne comptent pas', () => {
  const c = enCourse();
  const i = droite(c);
  assert.deepEqual(tenir(c, i, DEMI + 3.5 + RESTE - 0.5, 3), []);           // une roue intérieure encore sur la ligne
  assert.deepEqual(tenir(c, i, -(DEMI + 3.5), 3), []);
  assert.equal(c.joueur.limites, 0);
});

// --- b. limites de piste -----------------------------------------------------------------------

test('b. quatre roues au-delà du vibreur : moins de 500 ms rien ; au-delà, avertissement 1/3, sans remise en piste, safety car ni VSC ; une seule fois par sortie', () => {
  const c = enCourse();
  const v = epingle(c);
  const dehors = v.sens * (DEMI + 11 + RESTE + 1);
  assert.equal(c.rouesDehors(c.joueur), 0);
  assert.deepEqual(tenir(c, v.apex, dehors, 0.47), []);
  assert.equal(c.rouesDehors(c.joueur), 4);
  tenir(c, v.apex, 0, PAS);                                                  // retour : le compteur repart
  assert.deepEqual(tenir(c, v.apex, dehors, 0.47), []);
  const r = tenir(c, v.apex, dehors, 0.05);
  assert.deepEqual(r, ['avertissement']);
  assert.equal(c.joueur.limites, 1);
  assert.equal(c.joueur.penalites, 0);
  const j = c.joueur;
  assert.equal(limites(c).at(-1), `#${j.numero} ${j.pilote.code} : Limites de piste · avertissement 1/3`);
  assert.equal(c.evenements.at(-1).prioritaire, true);
  // la course continue : pas d'incident, pas de neutralisation, le joueur pilote
  assert.equal(j.incident === null, true);
  assert.equal(j.sousControle, true);
  assert.equal(c.etat, Course.ETATS.COURSE);
  assert.equal(c.incidents.vsc === null, true);
  assert.equal(c.safetyCar.enPiste, false);
  // rester dehors ne compte pas deux fois
  assert.deepEqual(tenir(c, v.apex, dehors, 3), []);
  assert.equal(j.limites, 1);
  // la course continue (voiture remise au centre, arrêtée : règle de test) : aucune séquence
  poser(c, v.apex, 0, 0);
  for (let k = 0; k < 120; k++) c.pas();
  assert.equal(j.incident === null, true);
  assert.equal(c.reprises.length, 0);
  assert.equal(c.etat, Course.ETATS.COURSE);
});

test('b. 1re et 2e fois : avertissement ; 3e : +5 s ; puis +5 s à chaque fois', () => {
  const c = enCourse();
  const v = epingle(c);
  const sortie = () => { tenir(c, v.apex, 0, PAS); return tenir(c, v.apex, -v.sens * (DEMI + 20), 0.6); };
  assert.deepEqual(sortie(), ['avertissement']);
  assert.deepEqual(sortie(), ['avertissement']);
  assert.equal(c.joueur.penalites, 0);
  assert.deepEqual(sortie(), ['penalite']);
  assert.equal(c.joueur.penalites, 5);
  assert.deepEqual(sortie(), ['penalite']);
  assert.equal(c.joueur.penalites, 10);
  assert.deepEqual(limites(c).map(t => t.split(' : ')[1]), ['Limites de piste · avertissement 1/3', 'Limites de piste · avertissement 2/3',
    'Limites de piste · +5 s', 'Limites de piste · +5 s']);
  assert.equal(c.joueur.limites, 4);
  assert.equal(c.joueur.incident, null);
});

test('b. ligne droite : la limite est la ligne blanche (quatre roues au-delà)', () => {
  const c = enCourse();
  const i = droite(c);
  assert.deepEqual(tenir(c, i, DEMI + 3.5 + RESTE + 1, 0.6), ['avertissement']);
});

test('b. place gagnée en coupant : +5 s tout de suite (même sous 500 ms) ; pas deux fois pour la même sortie', () => {
  const c = enCourse();
  const j = c.joueur;
  const v = epingle(c);
  const [a, b] = c.voitures.filter(x => x !== j);
  // règle de test : le classement est imposé (le joueur 3e en sortant, 2e en revenant)
  c.classement = () => [a, b, j, ...c.voitures.filter(x => ![a, b, j].includes(x))];
  assert.deepEqual(tenir(c, v.apex, v.sens * (DEMI + 30), 0.2), []);
  c.classement = () => [a, j, b, ...c.voitures.filter(x => ![a, b, j].includes(x))];
  assert.deepEqual(tenir(c, v.apex, 0, PAS), ['place']);
  assert.equal(j.penalites, 5);
  assert.equal(limites(c).at(-1), `#${j.numero} ${j.pilote.code} : Limites de piste · place gagnée · +5 s`);
  // sans place gagnée : rien au retour
  assert.deepEqual(tenir(c, v.apex, v.sens * (DEMI + 30), 0.2), []);
  assert.deepEqual(tenir(c, v.apex, 0, PAS), []);
  // déjà pénalisée (3e fois) et place gagnée : une seule pénalité pour cette sortie
  c.parametres.avertissementsLimites = 0;
  c.classement = () => [a, b, j, ...c.voitures.filter(x => ![a, b, j].includes(x))];
  assert.deepEqual(tenir(c, v.apex, v.sens * (DEMI + 30), 0.6), ['penalite']);
  c.classement = () => [j, a, b, ...c.voitures.filter(x => ![a, b, j].includes(x))];
  assert.deepEqual(tenir(c, v.apex, 0, PAS), []);
  assert.equal(j.penalites, 10);
});

test('b. réglages : tolérance (ms), nombre d\'avertissements, limites strictes (la ligne blanche même sur le vibreur), case Pénalités', () => {
  const c = enCourse({ toleranceLimites: 1000 });
  const v = epingle(c);
  const dehors = v.sens * (DEMI + 20);
  assert.deepEqual(tenir(c, v.apex, dehors, 0.9), []);
  assert.deepEqual(tenir(c, v.apex, dehors, 0.15), ['avertissement']);
  // aucun avertissement : la première fois coûte déjà 5 s
  const d = enCourse({ avertissementsLimites: 0 });
  assert.deepEqual(tenir(d, epingle(d).apex, dehors, 0.6), ['penalite']);
  assert.equal(limites(d).at(-1).split(' : ')[1], 'Limites de piste · +5 s');
  // strictes : sur le vibreur, quatre roues au-delà de la ligne blanche = limites dépassées
  const surVibreur = v.sens * (DEMI + 3.5 + RESTE + 1);
  const n = enCourse();
  assert.deepEqual(tenir(n, v.apex, surVibreur, 1), []);
  const s = enCourse({ limitesStrictes: true });
  assert.deepEqual(tenir(s, v.apex, surVibreur, 0.6), ['avertissement']);
  // case Pénalités décochée : les avertissements restent comptés, aucune pénalité
  const p = enCourse({ penalites: false, avertissementsLimites: 0 });
  assert.deepEqual(tenir(p, v.apex, dehors, 0.6), ['avertissement']);
  assert.equal(p.joueur.penalites, 0);
  // valeurs de départ = constantes de la voiture du joueur
  const d0 = Course.parametresParDefaut();
  assert.equal(d0.toleranceLimites, VoiturePilote.TOLERANCE_LIMITES_MS);
  assert.equal(VoiturePilote.TOLERANCE_LIMITES_MS, 500);
  assert.equal(d0.avertissementsLimites, VoiturePilote.AVERTISSEMENTS_LIMITES);
  assert.equal(VoiturePilote.AVERTISSEMENTS_LIMITES, 2);
  assert.equal(d0.vitesseImpact, VoiturePilote.VITESSE_IMPACT_KMH);
  assert.equal(VoiturePilote.VITESSE_IMPACT_KMH, 40);
  assert.equal(d0.limitesStrictes, false);
  assert.equal(d0.penaliteLimites, VoiturePilote.PENALITE_LIMITES);
  assert.equal(VoiturePilote.PENALITE_LIMITES, 5);
  for (const ancienne of ['toleranceSortie', 'margeSortie', 'penaliteSortie']) assert.equal(Object.hasOwn(d0, ancienne), false, ancienne);
});

test('b. pendant un incident (accident) ou au stand, les limites ne sont pas surveillées', () => {
  const c = enCourse();
  const v = epingle(c);
  // (règle de test : la voiture est déclarée au stand)
  const etat = c.joueur.etat;
  c.joueur.etat = VoitureF1.ETATS.STAND;
  assert.equal(c.joueur.auStand, true);
  assert.deepEqual(tenir(c, v.apex, v.sens * (DEMI + 20), 1), []);
  c.joueur.etat = etat;
  c.declarerIncident(c.joueur, 'accident', { cause: 'test' });
  assert.deepEqual(tenir(c, v.apex, v.sens * (DEMI + 20), 1), []);
  assert.equal(c.joueur.limites, 0);
});

// --- c. accidents ------------------------------------------------------------------------------

test('c. voitures : carrosseries qui se touchent ; frôlement lent (< 40 km/h d\'écart) ignoré, plus vite = accident (enfoncées sans écart de vitesse : rien) ; côte à côte sans se toucher : rien', () => {
  const c = enCourse();
  const j = c.joueur;
  const autre = c.voitures.find(v => v !== j);
  const i = droite(c);
  const placer = (ecartJ, ecartA, decalage, kmhJ, kmhA) => {
    poser(c, i, ecartJ, kmhJ);
    poser(c, (i + decalage + c.circuit.n) % c.circuit.n, ecartA, kmhA, autre);
    return c.contactAvec(j, autre);
  };
  // côte à côte, 18 px d'axe à axe : 7 px entre les carrosseries (l'ancien cercle de 13 px : accident)
  assert.equal(placer(-9, 9, 0, 200, 200), null);
  // pare-chocs contre pare-chocs (26 px de long, 8 px par point de piste) à vitesses voisines : frôlement
  const frole = placer(0, 1, 3, 200, 185);
  assert.ok(frole !== null && frole.vitesse < 40 && !frole.enfonce, JSON.stringify(frole));
  c.verifierLesContacts(j);
  assert.equal(j.incident, null);
  // 60 km/h d'écart : accident
  placer(0, 1, 3, 230, 170);
  c.verifierLesContacts(j);
  assert.equal(j.incident?.type, 'accident');
  assert.match(j.incident.cause, new RegExp(`#${autre.numero}`));
  // enfoncées (centres à 4 px) sans écart de vitesse : rien (jusqu'au 18 octobre 2026 : accident ;
  // depuis, seule la vitesse d'impact compte)
  const d = enCourse();
  const a2 = d.voitures.find(v => v !== d.joueur);
  poser(d, 40, 0, 150);
  poser(d, 40, 4, 150, a2);
  assert.equal(d.contactAvec(d.joueur, a2).enfonce, true);
  d.verifierLesContacts(d.joueur);
  assert.equal(d.joueur.incident, null);
});

test('c. mur, rail et pneus empilés : frôlement ignoré, choc à plus de 40 km/h (vers le mur) = accident, enfoncée lentement : rien', () => {
  const c = enCourse();
  const j = c.joueur;
  const i = droite(c);
  const mur = c.distanceDuMur({ ecartLateral: 1, indicePiste: i });
  // carrosserie 1 px dans le mur, en glissant le long (5 km/h vers le mur)
  const contre = (enfoncement, kmhVersMur) => {
    poser(c, i, mur - RESTE + enfoncement, 200);
    const n = c.circuit.normales[i];
    const v = kmhVersMur / VoiturePilote.KMH;
    j.vel.add(scene.context.createVector(n.x * v, n.y * v));
    return c.contactMur(j);
  };
  const leger = contre(1, 5);
  assert.ok(leger !== null && leger.vitesse < 40 && !leger.enfonce, JSON.stringify(leger));
  c.verifierLesContacts(j);
  assert.equal(j.incident, null);
  assert.equal(contre(-1, 80), null);                                       // pas de contact
  contre(1, 60);
  c.verifierLesContacts(j);
  assert.equal(j.incident?.cause, 'contact avec le mur');
  const d = enCourse();
  poser(d, i, mur - RESTE + IncidentJoueur.ENFONCEMENT_ACCIDENT + 0.5, 150);
  assert.equal(d.contactMur(d.joueur).enfonce, true);
  d.verifierLesContacts(d.joueur);
  assert.equal(d.joueur.incident, null);                                   // (accident jusqu'au 18 octobre 2026)
  // pneus empilés (Ø 8,8 à 103 et 112 px de l'axe) : un mur pour la détection
  const decor = Course.decor(c.circuit);
  const piles = decor.pilesDePneus();
  assert.ok(piles.length > 0);
  for (const { k, cote, d: dist } of piles.slice(0, 20)) {
    assert.ok(decor.murs[String(cote)][k] <= dist - DecorCircuit.RAYON_PILE + 1e-9, `${k} ${cote}`);
  }
});

test('c. vitesse d\'impact réglable ; un accident garde sa séquence (radio, safety car, remise en piste, +10 s)', () => {
  const c = enCourse({ vitesseImpact: 100 });
  const j = c.joueur;
  const autre = c.voitures.find(v => v !== j);
  const i = droite(c);
  poser(c, i, 0, 230);
  poser(c, (i + 3) % c.circuit.n, 1, 170, autre);
  c.verifierLesContacts(j);
  assert.equal(j.incident, null);
  c.parametres.vitesseImpact = 40;
  c.verifierLesContacts(j);
  assert.equal(j.incident.type, 'accident');
  assert.equal(j.incident.message, 'Accident ! On te remet en piste.');
  for (let k = 0; k < 60 * (IncidentJoueur.DUREE_RADIO + 0.1); k++) c.pas();
  assert.equal(c.etat, Course.ETATS.SAFETY_CAR);
  for (let k = 0; k < 60 * (IncidentJoueur.DUREE_NEUTRALISATION + IncidentJoueur.DUREE_DECOMPTE + 0.2); k++) c.pas();
  assert.equal(j.sousControle, true);
  assert.equal(j.penalites, 10);
  assert.equal(c.reprises.at(-1).type, 'accident');
});

test('IncidentJoueur : un seul type, l\'accident (une sortie n\'est plus un incident)', () => {
  assert.deepEqual(Array.from(IncidentJoueur.TYPES), ['accident']);
  assert.throws(() => new IncidentJoueur({}, 'sortie'), /Incident inconnu : sortie/);
  assert.equal(IncidentJoueur.ENFONCEMENT_ACCIDENT, 3);
});

test('bandeau : un message des limites de piste est une pénalité, montré tout de suite', () => {
  assert.equal(BandeauEvenements.typeDe('#7 KAR : Limites de piste · avertissement 1/3'), 'penalite');
  const m = BandeauEvenements.message({ texte: '#7 KAR : Limites de piste · +5 s', prioritaire: true });
  assert.deepEqual({ ...m }, { type: 'penalite', qui: 'KAR', texte: 'Limites de piste · +5 s', prioritaire: true });
});

// --- dans la page : réglages, HUD, classement final ---------------------------------------------

function partie() {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  const dessiner = p.draw.bind(p);
  p.draw = (n = 1) => { for (let i = 0; i < n; i++) { dessiner(1); p.calls.length = 0; if (p.decor?.calls) p.decor.calls.length = 0; } };
  p.choisir('f1');
  p.draw();
  const casier = p.element('f1-mode-pilote');
  casier.checked = true;
  casier.fire('change');
  p.draw();
  p.evaluate('formule1.choisirVoiture(formule1.course.voitures[3])');
  for (let i = 0; i < 3000 && p.evaluate('formule1.course.etat') !== 'COURSE'; i++) p.draw();
  return p;
}

test('Réglages › Joueur : tolérance (ms), avertissements, vitesse d\'impact, limites strictes, pénalité limites ; les anciens curseurs de sortie sont partis', () => {
  const html = readFileSync(chemin('index.html'), 'utf8');
  for (const id of ['f1-tolerance-sortie', 'f1-marge-sortie', 'f1-penalite-sortie']) assert.doesNotMatch(html, new RegExp(`id="${id}"`), id);
  const p = partie();
  const curseurs = { 'f1-tolerance-limites': ['toleranceLimites', '500', '500 ms', 800], 'f1-avertissements-limites': ['avertissementsLimites', '2', '2', 4],
    'f1-vitesse-impact': ['vitesseImpact', '40', '40 km/h', 60], 'f1-penalite-limites': ['penaliteLimites', '5', '5 s', 10] };
  for (const [id, [cle, valeur, sortie, nouvelle]] of Object.entries(curseurs)) {
    assert.equal(p.element(id).value, valeur, id);
    assert.equal(p.element(`${id}-valeur`).textContent, sortie, id);
    p.glisser(id, nouvelle);
    assert.equal(p.evaluate(`formule1.course.parametres.${cle}`), nouvelle, id);
  }
  assert.equal(p.element('f1-limites-strictes').checked, false);
  p.element('f1-limites-strictes').checked = true;
  p.element('f1-limites-strictes').fire('change');
  assert.equal(p.evaluate('formule1.course.parametres.limitesStrictes'), true);
  assert.equal(p.evaluate("ReglagesF1.CASES.some(([cle, id]) => cle === 'limitesStrictes' && id === 'f1-limites-strictes')"), true);
});

test('HUD : « Limites 1/3 » après un avertissement (rien avant) ; classement final : les pénalités reçues', () => {
  const p = partie();
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-hud-limites').hidden, true);
  p.evaluate('formule1.course.joueur.limites = 1');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-hud-limites').hidden, false);
  assert.equal(p.element('f1-hud-limites').textContent, 'Limites 1/3');
  p.evaluate('formule1.course.joueur.limites = 3; formule1.course.parametres.avertissementsLimites = 2');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.element('f1-hud-limites').textContent, 'Limites 3/3');
  // classement final : « +5 s » à côté du temps du joueur
  p.evaluate('formule1.course.joueur.penalites = 5');
  const lignes = p.evaluate('JSON.stringify(PodiumFin.donnees(formule1.course).lignes.map(l => [l.code, l.penalite]))');
  const code = p.evaluate('formule1.course.joueur.pilote.code');
  const parCode = Object.fromEntries(JSON.parse(lignes));
  assert.equal(parCode[code], '+5 s');
  assert.ok(Object.entries(parCode).filter(([k]) => k !== code).every(([, v]) => v === null));
  const css = readFileSync(chemin('interfaceF1.css'), 'utf8');
  assert.match(css, /\.hud-limites\s*\{/);
});

test('mur invisible : les rails (non dessinés) ne sont jamais à moins d\'une largeur de voiture du bord du vibreur ; sur le vibreur, aucun contact avec un mur, sur les trois circuits', () => {
  // (le décor place parfois son rail à 62 px de l'axe, 1 px derrière le vibreur dessiné : une
  // voiture qui mordait le vibreur touchait un mur qu'on ne voit pas)
  assert.equal(Course.MUR_MINIMUM, DEMI + CarteSurfaces.VIBREUR_DESSINE + VoitureF1.LARGEUR);
  for (const profil of Object.keys(Circuit.PROFILS)) {
    const c = enCourse({ profil });
    const rails = Course.decor(c.circuit).rails;
    assert.ok(['1', '-1'].some(cote => rails[cote].some(r => r !== null && r < Course.MUR_MINIMUM)), `${profil} : un rail plus près existe dans le décor`);
    const j = c.joueur;
    for (let i = 0; i < c.circuit.n; i++) {
      for (const cote of [1, -1]) {
        j.ecartLateral = cote;
        j.indicePiste = i;
        assert.ok(c.distanceDuMur(j) >= Course.MUR_MINIMUM - 1e-9, `${profil} ${i} ${cote}`);
        // centre au bord du vibreur (deux roues au-delà), parallèle à la piste
        poser(c, i, cote * (DEMI + 11), 150);
        const contact = c.contactMur(j);
        assert.ok(contact === null || (!contact.enfonce && contact.vitesse < 40), `${profil} ${i} ${cote} ${JSON.stringify(contact)}`);
      }
    }
  }
});

test('bug du 18 octobre 2026 : ligne blanche, vibreur, dégagement bleu/rouge = rien (ni accident ni surface qui freine) ; accident seulement à 40 km/h ou plus ; remise sur la piste au point le plus proche', () => {
  const c = enCourse();
  const j = c.joueur;
  const n = c.circuit.n;
  const s = Course.surfaces(c.circuit);
  const decor = Course.decor(c.circuit);
  // dégagements bleu/rouge (asphalte coloré dessiné jusqu'à 113 px de l'axe ; pneus empilés dès 98,6) :
  // ligne blanche, vibreur, dégagement roulés à 150 km/h, parallèles à la piste
  assert.ok(decor.freinages.length > 0);
  for (const v of decor.freinages) {
    for (let k = v.debut; k !== c.circuit.indice(v.fin + 1); k = (k + 1) % n) {
      for (const cote of [1, -1]) {
        for (const e of [DEMI + 3, DEMI + 9, 75, 90]) {
          poser(c, k, cote * e, 150);
          assert.ok(['asphalte', 'vibreur'].includes(s.surface(k, cote * e, RESTE)), `${k} ${cote * e} : ${s.surface(k, cote * e, RESTE)}`);
          c.verifierLesContacts(j);
          assert.equal(j.incident, null, `${k} ${cote * e} : ${j.incident?.cause}`);
        }
      }
    }
  }
  // vibreur dessiné (50 à 61 px), dans chaque virage, des deux côtés : la surface d'un vibreur
  for (const v of c.circuit.virages) for (const cote of [1, -1]) assert.equal(s.surface(v.apex, cote * (DEMI + 9), RESTE), 'vibreur');
  // mur : enfoncé à 30 km/h vers lui = rien ; 60 km/h = accident
  const i = droite(c);
  const mur = c.distanceDuMur({ ecartLateral: 1, indicePiste: i });
  const contre = kmh => {
    poser(c, i, mur - RESTE + 4, 150);
    const nm = c.circuit.normales[i];
    j.vel.add(scene.context.createVector(nm.x * kmh / VoiturePilote.KMH, nm.y * kmh / VoiturePilote.KMH));
    c.verifierLesContacts(j);
    return j.incident;
  };
  assert.equal(contre(30), null);
  assert.equal(contre(60)?.cause, 'contact avec le mur');
  // remise en piste depuis un dégagement plus proche d'une autre partie du tracé : au point de la
  // piste le plus proche le long de SON tracé (pas sur l'autre partie, ni au stand), au centre
  const d = enCourse();
  let cas = null;
  for (let k = 0; k < n && cas === null; k++) {
    for (const cote of [1, -1]) {
      const q = d.circuit.pointLateral(k, cote * 110);
      const b = d.circuit.projeter(q.x, q.y);
      if (Math.min((b - k + n) % n, (k - b + n) % n) > 30) { cas = { k, cote }; break; }
    }
  }
  assert.ok(cas !== null);
  poser(d, cas.k, cas.cote * 110, 60);
  const place = d.placeDeReprise(d.joueur);
  assert.ok((cas.k - place.indice + n) % n <= Course.RECUL_REPRISE + 2, `${cas.k} → ${place.indice}`);
  assert.equal(place.ecart, 0);
  assert.equal(d.joueur.auStand, false);
});
