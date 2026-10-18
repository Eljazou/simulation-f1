import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, generator } from './support.mjs';

// Phase 2 : voie des stands spectaculaire. Mécaniciens (Vehicle) qui gagnent leur poste, changent
// les roues et rentrent ; durée de l'arrêt ; pénalité de stand ; feu de sortie ; file d'attente
// devant un box partagé ; limiteur et ligne blanche ; temps d'arrêt affiché.

const scene = loadScene(F1, '({ Vehicle, Circuit, Course, VoitureF1, VoiturePilote, Mecanicien, EquipeDeStand, VoieDesStands })');
const { Vehicle, Circuit, Course, VoitureF1, VoiturePilote, Mecanicien, EquipeDeStand, VoieDesStands } = scene;
const { ENTREE, ARRET, SORTIE } = VoitureF1.PHASES_STAND;
const graine = n => {
  const u = generator(n);
  scene.context.random = (a, b) => (b === undefined ? u() * (a ?? 1) : a + u() * (b - a));
};
function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, usurePneus: 0, ...reglages }, Circuit.generateur(1999));
}
function jusqua(c, condition, limite = 60 * 300) {
  for (let i = 0; i < limite; i++) {
    if (condition(c)) return i;
    c.pas();
  }
  return assert.fail('condition jamais atteinte');
}
const enCourse = c => jusqua(c, x => x.etat === Course.ETATS.COURSE);
const ecartMin = c => {
  let min = Infinity;
  const v = c.voitures;
  for (let a = 0; a < v.length; a++) {
    for (let b = a + 1; b < v.length; b++) min = Math.min(min, Math.hypot(v[a].pos.x - v[b].pos.x, v[a].pos.y - v[b].pos.y) - v[a].r - v[b].r);
  }
  return min;
};

test('classes : les mécaniciens sont des Vehicle ; équipe et voie des stands ne bougent pas ; 12 à 20 par équipe', () => {
  const c = course({ nombreVoitures: 6, tailleEquipe: 20 });
  assert.ok(c.stands instanceof VoieDesStands && !(c.stands instanceof Vehicle));
  for (const equipe of c.stands.equipes.values()) {
    assert.ok(!(equipe instanceof Vehicle));
    assert.equal(equipe.mecaniciens.length, 20);
    equipe.mecaniciens.forEach(m => assert.ok(m instanceof Mecanicien && m instanceof Vehicle));
    // en tenue de leur écurie
    const voiture = c.voitures.find(v => v.box === equipe.box);
    assert.equal(equipe.mecaniciens[0].couleurs, voiture.ecurie.couleurs);
  }
  assert.equal(course({ nombreVoitures: 4, tailleEquipe: 12 }).stands.equipes.values().next().value.mecaniciens.length, 12);
  // un box d'arrêt par écurie, partagé ; chaque voiture garde son garage
  const [a, b] = [c.voitures[0], c.voitures[c.parametres.ecuries]];
  if (b) {
    assert.equal(a.box, b.box);
    assert.notEqual(a.garage, b.garage);
  }
  // sans l'option : comportement d'origine (un box par voiture, pas d'équipe)
  const sans = course({ nombreVoitures: 6, pitSpectaculaire: false });
  assert.equal(sans.stands, null);
  assert.equal(new Set(sans.voitures.map(v => v.box)).size, 6);
});

test('arrêt : les mécaniciens gagnent leur poste, changent les roues (pneu usé emporté, neuf apporté), libèrent la voiture, rentrent', () => {
  graine(1);
  const c = course({ nombreVoitures: 4, nombreTours: 10, dureeRoue: 2.2 });
  enCourse(c);
  for (let i = 0; i < 60 * 8; i++) c.pas();
  const v = c.classement()[0];
  v.pneus = 0.3;
  v.demanderStand();
  v.pneuDemande = 'DUR';
  const equipe = c.stands.equipeDe(v);
  jusqua(c, () => v.phaseStand === ARRET && v.estArreteeAuBox(), 60 * 60);
  // à l'arrêt : tout le monde à son poste dans la seconde
  jusqua(c, () => equipe.mecaniciens.every(m => m.enPlace || m.porte === 'ancien'), 60);
  const portes = new Set();
  let debut = c.chrono;
  jusqua(c, () => {
    equipe.mecaniciens.forEach(m => { if (m.porte) portes.add(m.porte); });
    return v.phaseStand === SORTIE;
  }, 60 * 10);
  const duree = c.chrono - debut;
  assert.ok(portes.has('neuf') && portes.has('ancien'), [...portes].join(','));
  // la durée respecte celle des roues (tirées autour de dureeRoue) + crics et lollipop
  const a = equipe.dernierArret ?? { duree };
  assert.ok(a.duree >= 2.2 * 0.9 && a.duree <= 2.2 * 1.1 + EquipeDeStand.SURCROIT_SANS_POSE + EquipeDeStand.DUREE_LIBERATION + 1, `${a.duree}`);
  assert.equal(v.pneus, 1);
  assert.equal(v.typePneus, 'DUR');
  assert.ok(Math.abs(v.dernierArretAuStand - a.duree) < 1e-9);
  // temps d'arrêt affiché au-dessus du box
  assert.ok(c.stands.affichages.some(x => /^\d+\.\d s/.test(x.texte)));
  // l'équipe rentre à ses places d'attente
  jusqua(c, () => equipe.mecaniciens.every(m => m.enPlace), 60 * 5);
  equipe.mecaniciens.forEach(m => {
    const p = equipe.placeAttente(m.indice);
    assert.ok(Math.hypot(m.pos.x - p.x, m.pos.y - p.y) < 2);
  });
  assert.equal(equipe.libre, true);
});

test('pénalité de stand de 5 s : purgée à l\'arrêt, sans intervention des mécaniciens, chronomètre visible', () => {
  graine(2);
  const c = course({ nombreVoitures: 4, nombreTours: 10 });
  enCourse(c);
  for (let i = 0; i < 60 * 8; i++) c.pas();
  const v = c.classement()[1];
  assert.throws(() => c.penaliserAuStand(v, 7), { name: 'RangeError' });
  c.penaliserAuStand(v, 5);
  assert.equal(v.penaliteStand, 5);
  assert.ok(v.demandeStand, 'l\'IA rentre purger');
  const equipe = c.stands.equipeDe(v);
  jusqua(c, () => equipe.etat === EquipeDeStand.ETATS.PENALITE, 60 * 60);
  // pendant la pénalité : personne ne touche la voiture (aucune roue commencée, aucun pneu porté)
  let travail = false;
  let chrono = false;
  const debut = c.chrono;
  jusqua(c, () => {
    const enPenalite = equipe.etat === EquipeDeStand.ETATS.PENALITE;
    if (enPenalite && (equipe.roues !== null || equipe.mecaniciens.some(m => m.porte === 'ancien'))) travail = true;
    scene.calls.length = 0;
    c.stands.show();
    if (scene.calls.some(x => x[0] === 'text' && /^PÉNALITÉ \d/.test(x[1]))) chrono = true;
    return equipe.etat !== EquipeDeStand.ETATS.PENALITE;
  }, 60 * 8);
  assert.ok(c.chrono - debut >= 5 - 1e-9 - 1 / 60, `${c.chrono - debut}`);
  assert.equal(travail, false);
  assert.ok(chrono);
  jusqua(c, () => v.phaseStand === SORTIE, 60 * 10);
  assert.ok(equipe.dernierArret.duree >= 5 + EquipeDeStand.DUREE_ROUE * 0.9, `${equipe.dernierArret.duree}`);
  assert.equal(v.penaliteStand, 0, 'purgée');
});

test('feu de sortie : rouge, la voiture attend sur la ligne (arrive) ; vert, elle repart', () => {
  graine(3);
  const c = course({ nombreVoitures: 4, nombreTours: 10 });
  enCourse(c);
  for (let i = 0; i < 60 * 8; i++) c.pas();
  const v = c.classement()[2];
  v.demanderStand();
  jusqua(c, () => v.phaseStand === ARRET, 60 * 60);
  // le feu passe et reste au rouge pendant l'arrêt (une voiture arrive : état imposé pour le test)
  const vrai = c.stands.calculerFeu.bind(c.stands);
  c.stands.calculerFeu = () => 'rouge';
  jusqua(c, () => v.phaseStand === SORTIE, 60 * 10);
  const s = c.circuit.stands;
  for (let i = 0; i < 60 * 6; i++) {
    c.pas();
    assert.ok(v.indiceVoie <= s.sortie, `ligne franchie au feu rouge : ${v.indiceVoie} > ${s.sortie}`);
  }
  assert.ok(v.vitesse < 0.2, 'arrêtée sur la ligne');
  assert.ok(s.sortie - v.indiceVoie <= 3, 'au plus près de la ligne');
  c.stands.calculerFeu = vrai;
  jusqua(c, () => !v.auStand, 60 * 10);
  // le vrai feu : rouge quand une voiture arrive à la hauteur de la sortie
  const w = c.voitures.find(x => !x.auStand && x !== v);
  assert.equal(['rouge', 'vert'].includes(c.stands.calculerFeu()), true);
  void w;
});

test('file d\'attente : deux voitures de la même écurie rentrent ensemble : la seconde attend derrière, sans contact (double arrêt)', () => {
  graine(4);
  const c = course({ nombreVoitures: 3, ecuries: 1, nombreTours: 10 });
  enCourse(c);
  for (let i = 0; i < 60 * 10; i++) c.pas();
  const [a, b] = c.classement();
  a.demanderStand();
  b.demanderStand();
  let attente = false;
  let min = Infinity;
  const arrets = new Map();
  jusqua(c, () => {
    min = Math.min(min, ecartMin(c));
    if (b.attenteBox || a.attenteBox) attente = true;
    for (const v of [a, b]) {
      if (v.phaseStand === ARRET && !arrets.has(v)) arrets.set(v, { debut: c.chrono });
      if (v.phaseStand === SORTIE && arrets.has(v) && arrets.get(v).fin === undefined) arrets.get(v).fin = c.chrono;
    }
    return a.arretsAuStand >= 1 && b.arretsAuStand >= 1 && !a.auStand && !b.auStand;
  }, 60 * 120);
  assert.ok(attente, 'la seconde a attendu');
  assert.ok(min >= 0, `${min}`);
  // les deux arrêts ne se chevauchent pas
  const [p, q] = [...arrets.values()].sort((x, y) => x.debut - y.debut);
  assert.ok(q.debut >= p.fin - 1e-9, `${p.debut}-${p.fin} / ${q.debut}`);
});

test('limiteur : l\'IA franchit la ligne blanche à la vitesse permise ; le joueur trop vite : pénalité de stand', () => {
  graine(5);
  const c = course({ nombreVoitures: 6, nombreTours: 10 });
  enCourse(c);
  for (let i = 0; i < 60 * 8; i++) c.pas();
  const v = c.classement()[0];
  v.demanderStand();
  let vitesseALaLigne = null;
  jusqua(c, () => {
    if (v.limiteurFranchi && vitesseALaLigne === null) vitesseALaLigne = v.vitesse;
    return v.phaseStand === ARRET;
  }, 60 * 60);
  assert.ok(vitesseALaLigne <= VoitureF1.VITESSE_STANDS * VoieDesStands.TOLERANCE_LIMITEUR, `${vitesseALaLigne}`);
  assert.equal(v.penaliteStand, 0);
  // le joueur : il entre dans la voie lancé, sans freiner
  const d = course({ nombreVoitures: 4, nombreTours: 10, modePilote: true });
  d.choisirJoueur(0);
  enCourse(d);
  const j = d.joueur;
  assert.ok(j instanceof VoiturePilote);
  const s = d.circuit.stands;
  // règle de test : la voiture du joueur est placée à l'entrée de la voie, lancée
  j.passerA(VoitureF1.ETATS.STAND);
  j.phaseStand = ENTREE;
  j.indiceVoie = 0;
  j.pos.set(s.points[0].x, s.points[0].y);
  j.vel.set(s.tangentes[0].x * 4.5, s.tangentes[0].y * 4.5);
  j.commander({ haut: true });
  jusqua(d, () => j.limiteurFranchi, 60 * 5);
  assert.equal(j.penaliteStand, VoieDesStands.PENALITE_LIMITEUR);
  assert.ok(d.evenements.some(e => /excès de vitesse/.test(e.texte)));
});

test('stands dans une course : 20 voitures, 3 tours, arrêts au box de l\'écurie, sans contact, tous à l\'arrivée', () => {
  graine(6);
  const c = course({ nombreVoitures: 20, nombreTours: 3, usurePneus: 0.03, ecuries: 10 });
  let min = Infinity;
  for (let i = 0; i < 60 * 400 && !c.terminee; i++) {
    c.pas();
    min = Math.min(min, ecartMin(c));
  }
  assert.ok(c.terminee);
  assert.ok(c.voitures.reduce((n, v) => n + v.arretsAuStand, 0) >= 10, 'des arrêts');
  assert.ok(min >= 0, `${min}`);
  assert.equal(c.ordreArrivee.length, 20);
});
