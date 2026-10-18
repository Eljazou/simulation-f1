import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';
import { page } from './page.mjs';

// Incidents de la voiture du joueur : la MÊME course continue. Accident (contact avec une
// voiture ou un mur) ou sortie de piste (au-delà de la ligne blanche plus de toleranceSortie s) :
// le joueur perd le contrôle, message radio (≈ 2 s), safety car (accident) ou VSC (sortie qui
// gêne), voiture remise en piste (point le plus proche, centre, sens de la course, ≈ 80 km/h ;
// place occupée : elle recule), compte à rebours 3-2-1, reprise du contrôle, 2 s d'invulnérabilité.
// Pénalité ajoutée au temps final (+5 s sortie, +10 s accident, réglables). Jamais ÉLIMINÉ ni ABD.
// Après la reprise, un encart non bloquant propose « Rejouer la course » (R) ; R, à tout moment,
// demande une confirmation (pause) : Entrée relance, Échap reprend. Les voitures de l'IA gardent
// leur comportement.

const scene = loadScene(F1, '({ Circuit, Course, VoitureF1, VoiturePilote, IncidentJoueur, EncartRejouer })');
const { Circuit, Course, VoitureF1, VoiturePilote, IncidentJoueur, EncartRejouer } = scene;
const PAS = Course.PAS_TEMPS;
const SEQUENCE = IncidentJoueur.DUREE_RADIO + IncidentJoueur.DUREE_NEUTRALISATION;

// --- dans la page (vrai sketch.js, interface HTML) -------------------------------------------
const jusqua = (p, condition, n = 3000) => { for (let i = 0; i < n && !p.evaluate(condition); i++) p.draw(); assert.ok(p.evaluate(condition), condition); };
function partie({ mode = 'course', rang = 3 } = {}) {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  // les tableaux venus du contexte vm sont recopiés (deepEqual compare les prototypes)
  const evaluer = p.evaluate;
  p.evaluate = code => { const r = evaluer(code); return Array.isArray(r) ? Array.from(r) : r; };
  // le substitut de p5 garde chaque appel de dessin : on les oublie à chaque image
  const dessiner = p.draw.bind(p);
  p.draw = (n = 1) => { for (let i = 0; i < n; i++) { dessiner(1); p.calls.length = 0; if (p.decor?.calls) p.decor.calls.length = 0; } };
  p.choisir('f1');
  p.draw();
  if (mode !== 'course') {
    p.element('f1-mode').value = mode;
    p.element('f1-mode').fire('change');
  }
  if (mode !== 'multijoueur') {
    const casier = p.element('f1-mode-pilote');
    if (!casier.checked) {
      casier.checked = true;
      casier.fire('change');
    }
    p.draw();
    p.evaluate(`formule1.choisirVoiture(formule1.course.voitures[${rang}])`);
  }
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.draw();
  assert.equal(p.evaluate('formule1.course.joueurs.every(j => j.incident === null)'), true);
  return p;
}
const sec = (p, s) => p.draw(Math.round(s * 60));
const temps = p => p.evaluate('formule1.course.chrono');
const J = 'formule1.course.joueur';
// règle de test : la voiture du joueur est posée à `ecart` px de la ligne centrale, arrêtée
const poser = (p, ecart, joueur = J) => p.evaluate(`(() => { const c = formule1.course, j = ${joueur}, i = j.indicePiste;
  const q = c.circuit.pointLateral(i, ${ecart}); j.pos.set(q.x, q.y); j.vel.set(0, 0); return 1; })()`);
// vers le mur de son côté, à `kmh` (depuis le 18 octobre 2026, un accident demande 40 km/h ou plus)
const versLeMur = (p, kmh = 60) => p.evaluate(`(() => { const c = formule1.course, j = ${J}, n = c.circuit.normales[j.indicePiste];
  const s = (j.ecartLateral >= 0 ? 1 : -1) * ${kmh} / VoiturePilote.KMH; j.vel.set(n.x * s, n.y * s); return 1; })()`);
const tenirDehors = (p, ecart, s, joueur = J) => { const t0 = temps(p); for (let i = 0; i < 600 && temps(p) - t0 < s - 1e-9; i++) { poser(p, ecart, joueur); p.draw(); } };
// règle de test : la voiture du joueur est posée contre une voiture de l'IA ; l'image suivante voit le contact
const accidentContre = (p, joueur = J) => {
  const numero = p.evaluate(`(() => { const c = formule1.course, j = ${joueur};
    const autre = c.voitures.find(v => !c.joueurs.includes(v) && !v.auStand); j.pos.set(autre.pos.x + 4, autre.pos.y); return autre.numero; })()`);
  p.draw();
  assert.equal(p.evaluate(`${joueur}.incident?.type`), 'accident', 'contact vu');
  return numero;
};
// loin de la piste : les quatre roues au-delà du vibreur (le plus large), sans toucher le mur
const loin = p => p.evaluate(`(() => { const c = formule1.course, demi = c.circuit.largeur / 2;
  const x = demi + CarteSurfaces.VIBREUR_DESSINE + VoitureF1.LARGEUR / 2 + 6; const mur = c.distanceDuMur(c.joueur) - VoitureF1.LONGUEUR / 2 - 2;
  if (x > mur) throw new Error('mur trop proche ici : ' + mur); return x; })()`);
// éléments de l'interface : ceux de index.html par leur id ; ceux créés en JavaScript par leur objet
// (le DOM de test ne retrouve pas un élément créé par son id)
const CREES = { 'f1-encart-0': 'interfaceF1.encart.boites[0].racine', 'f1-encart-1': 'interfaceF1.encart.boites[1].racine',
  'f1-encart-0-texte': 'interfaceF1.encart.boites[0].texte', 'f1-confirmation': 'interfaceF1.encart.confirmation',
  'f1-confirmation-texte': 'interfaceF1.encart.confirmationTexte', 'f1-pause': 'interfaceF1.menuPause.racine',
  'f1-pause-rejouer': 'interfaceF1.menuPause.boutons[1].libelle', 'f1-decompte-0': 'interfaceF1.decompte.elements[0]',
  'f1-decompte-1': 'interfaceF1.decompte.elements[1]' };
const elementDe = id => CREES[id] ?? `document.getElementById('${id}')`;
const visible = (p, id) => p.evaluate(`(() => { const e = ${elementDe(id)}; return !!e && !e.hidden && !e.classList.contains('is-hidden'); })()`);
const texteDe = (p, id) => p.evaluate(`${elementDe(id)}.textContent`);
const phase = (p, joueur = J) => p.evaluate(`${joueur}.incident?.phase ?? null`);

test('cause du blocage : en championnat, W tenu tout droit dans le gravier ; le joueur n\'est jamais bloqué en ABD et reprend la course', () => {
  const p = partie({ mode: 'championnat' });
  p.touche('w');
  const vus = new Set();
  let incident = false;
  for (let i = 0; i < 60 * 30; i++) {
    p.draw();
    vus.add(p.evaluate(`${J}.etat`));
    if (p.evaluate(`${J}.incident !== null`)) incident = true;
    if (incident && p.evaluate(`${J}.incident === null`)) break;
  }
  assert.ok(incident, 'un incident est déclaré');
  for (const e of ['BLOQUEE', 'REMORQUEE', 'ABANDON', 'ACCIDENT']) assert.ok(!vus.has(e), `jamais ${e}`);
  assert.equal(p.evaluate(`formule1.course.chronometrage.abandon(${J})`), false);
  assert.equal(p.evaluate(`${J}.sousControle`), true);
  assert.notEqual(p.evaluate('formule1.course.etat'), 'FIN');
});

test('accident contre une voiture : radio ≈ 2 s, safety car, remise en piste, 3-2-1, reprise du contrôle ; +10 s ; jamais ÉLIMINÉ ni ABD', () => {
  const p = partie();
  const numero = accidentContre(p);
  assert.equal(p.evaluate(`${J}.incident.type`), 'accident');
  assert.ok(p.evaluate(`${J}.incident.cause`).includes(`#${numero}`));
  assert.equal(p.evaluate(`${J}.sousControle`), false);
  p.evaluate('interfaceF1.forcer()');
  assert.match(p.evaluate('interfaceF1.bandeau.courant?.texte ?? ""'), /Accident ! On te remet en piste\./);
  // HUD visible : « REMISE EN PISTE » à la place des écarts
  assert.ok(visible(p, 'f1-hud'));
  assert.equal(texteDe(p, 'f1-hud-devant'), 'REMISE EN PISTE');
  sec(p, IncidentJoueur.DUREE_RADIO - 0.3);
  assert.notEqual(p.evaluate('formule1.course.etat'), 'SAFETY_CAR');
  p.evaluate('interfaceF1.forcer()');
  assert.match(p.evaluate('interfaceF1.bandeau.courant?.texte ?? ""'), /Accident ! On te remet en piste\./);
  sec(p, 0.5);
  assert.equal(p.evaluate('formule1.course.etat'), 'SAFETY_CAR');
  // remise en piste après la neutralisation
  jusqua(p, `${J}.incident?.phase === 'DECOMPTE'`, 60 * 5);
  const r = p.evaluate(`(() => { const c = formule1.course, j = ${J}, t = c.circuit.tangentes[j.indicePiste];
    return [Math.abs(j.ecartLateral), (j.vel.x * t.x + j.vel.y * t.y) / Math.max(1e-9, j.vel.mag()), j.kmh]; })()`);
  assert.ok(r[0] < 6, `au centre (écart ${r[0]})`);
  assert.ok(r[1] > 0.95, 'dans le sens de la course');
  // (repartie à 80 km/h, voir le test de la remise en piste ; sous safety car, à l'allure de la file)
  assert.ok(r[2] > 30 && r[2] <= IncidentJoueur.VITESSE_REPRISE_KMH + 5, `elle roule (${r[2]} km/h)`);
  // compte à rebours au centre de l'écran
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, 'f1-decompte-0'));
  assert.equal(texteDe(p, 'f1-decompte-0'), '3');
  sec(p, 1.1);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(texteDe(p, 'f1-decompte-0'), '2');
  assert.equal(p.evaluate(`${J}.sousControle`), false);
  jusqua(p, `${J}.sousControle === true`, 60 * 3);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(visible(p, 'f1-decompte-0'), false);
  // pénalité : temps final, bandeau, classement
  assert.equal(p.evaluate(`${J}.penalites`), IncidentJoueur.PENALITE_ACCIDENT);
  assert.ok(p.evaluate('formule1.course.evenements.some(e => /\\+10 s/.test(e.texte))'));
  assert.equal(p.evaluate(`TourClassement.lignes(formule1.course).find(l => l.voiture === ${J}).penalite`), '+10 s');
  // jamais ÉLIMINÉ ni ABD
  assert.equal(p.evaluate(`formule1.course.chronometrage.abandon(${J})`), false);
  assert.ok(!['ABD', 'ÉLIMINÉ'].includes(p.evaluate(`TourClassement.lignes(formule1.course).find(l => l.voiture === ${J}).ecart`)));
  assert.notEqual(p.evaluate('formule1.course.etat'), 'FIN');
  assert.equal(p.evaluate('formule1.ecranFin'), null);
});

test('invulnérabilité : 2 s après la reprise, un contact ne compte pas (voiture clignotante) ; ensuite si', () => {
  const p = partie();
  accidentContre(p);
  jusqua(p, `${J}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  assert.equal(p.evaluate(`${J}.invulnerable`), true);
  assert.equal(p.evaluate(`${J}.incident.phase`), 'REPRISE');
  // pendant l'invulnérabilité, pas de nouvel incident (règle de test : la voiture posée contre une autre)
  p.evaluate(`(() => { const c = formule1.course, j = ${J}; const a = c.voitures.find(v => !c.joueurs.includes(v) && !v.auStand); j.pos.set(a.pos.x + 4, a.pos.y); })()`);
  p.draw();
  assert.equal(p.evaluate(`${J}.incident.phase`), 'REPRISE');
  assert.equal(p.evaluate(`${J}.penalites`), IncidentJoueur.PENALITE_ACCIDENT);
  // clignote : certaines images ne dessinent pas la voiture
  const visibles = [];
  for (let i = 0; i < 16; i++) { p.draw(); visibles.push(p.evaluate(`${J}.visibleCetteImage`)); }
  assert.ok(visibles.includes(true) && visibles.includes(false), 'clignotement');
  // passé l'invulnérabilité, un contact compte de nouveau (la voiture posée contre l'autre peut
  // déjà l'avoir touchée : nouvel incident, en phase radio)
  jusqua(p, `${J}.incident === null || ${J}.incident.phase === 'RADIO'`, 60 * 3);
  if (p.evaluate(`${J}.incident === null`)) accidentContre(p);
  assert.equal(p.evaluate(`${J}.incident.type`), 'accident');
  assert.equal(p.evaluate(`${J}.invulnerable`), false);
});

test('accident contre le mur : même séquence, cause « contact avec le mur »', () => {
  const p = partie();
  const mur = p.evaluate(`formule1.course.distanceDuMur(${J})`);
  poser(p, mur + 2);
  versLeMur(p);
  p.draw();
  assert.equal(p.evaluate(`${J}.incident?.type`), 'accident');
  assert.equal(p.evaluate(`${J}.incident.cause`), 'contact avec le mur');
  jusqua(p, `${J}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  assert.ok(p.evaluate(`Math.abs(${J}.ecartLateral)`) < formule1Demi(p));
});
const formule1Demi = p => p.evaluate('formule1.course.circuit.largeur / 2');

// (règles d'origine, jusqu'au 17 octobre 2026 : le CENTRE de la voiture au-delà de 55,5 px de
// l'axe pendant 0,3 s était une « sortie de piste », un incident : radio « Limites de piste
// dépassées. », VSC si la voiture gênait, remise en piste, +5 s ; et une sortie qui touchait quelque
// chose devenait un accident. Une voiture sur le vibreur était ainsi sortie. Depuis, ce sont les
// limites de piste, sans séquence ni remise en piste : voir limitesPiste.test.mjs.)
test('sortie de piste (quatre roues au-delà du vibreur, plus de 500 ms) : avertissement dans le bandeau, sans radio, VSC, remise en piste ni pénalité', () => {
  const p = partie();
  const x = loin(p);
  poser(p, 0);
  p.draw();
  tenirDehors(p, x, 0.45);
  poser(p, 0);
  p.draw();
  assert.equal(p.evaluate(`${J}.limites`), 0);
  tenirDehors(p, x, 0.7);
  assert.equal(p.evaluate(`${J}.incident === null`), true);
  assert.equal(p.evaluate(`${J}.limites`), 1);
  assert.equal(p.evaluate(`${J}.sousControle`), true);
  p.evaluate('interfaceF1.forcer()');
  assert.match(p.evaluate('interfaceF1.bandeau.courant?.texte ?? ""'), /^Limites de piste · avertissement 1\/3$/);
  sec(p, IncidentJoueur.DUREE_RADIO + 1);
  assert.equal(p.evaluate('formule1.course.etat'), 'COURSE');     // ni VSC ni safety car
  assert.equal(p.evaluate(`${J}.penalites`), 0);
  assert.equal(p.evaluate('formule1.course.reprises.length'), 0);
});

test('sur le vibreur, même au bord : rien (le vibreur fait partie de la piste)', () => {
  const p = partie();
  poser(p, 0);
  p.draw();
  const i = p.evaluate(`formule1.course.circuit.virages[0].apex`);
  p.evaluate(`(() => { const c = formule1.course, j = ${J}; const q = c.circuit.pointLateral(${i}, c.circuit.largeur / 2 + 9); j.pos.set(q.x, q.y); return 1; })()`);
  for (let k = 0; k < 120; k++) {
    p.evaluate(`(() => { const c = formule1.course, j = ${J}; const q = c.circuit.pointLateral(${i}, c.circuit.largeur / 2 + 9); j.pos.set(q.x, q.y); j.vel.set(0, 0); return 1; })()`);
    p.draw();
  }
  assert.equal(p.evaluate(`${J}.incident === null`), true);
  assert.equal(p.evaluate(`${J}.limites`), 0);
});

test('hors de la piste, toucher le mur reste un accident', () => {
  const p = partie();
  poser(p, 0);
  p.draw();
  tenirDehors(p, loin(p), 0.7);
  assert.equal(p.evaluate(`${J}.limites`), 1);
  assert.equal(p.evaluate(`${J}.incident === null`), true);
  poser(p, p.evaluate(`formule1.course.distanceDuMur(${J})`) + 2);
  versLeMur(p);
  p.draw();
  assert.equal(p.evaluate(`${J}.incident.type`), 'accident');
});

test('remise en piste : place occupée → la voiture recule le long du tracé jusqu\'à une zone libre ; tours gardés ; pas de trace parasite', () => {
  const c = new Course({ ...Course.parametresParDefaut(), incidents: false, modePilote: true, nombreVoitures: 6 }, Circuit.generateur(1999));
  c.choisirJoueur(0);
  for (let i = 0; i < 60 * 15 && c.etat !== Course.ETATS.COURSE; i++) c.pas();
  for (let i = 0; i < 60 * 4; i++) c.pas();
  const j = c.joueur;
  const tour = j.tour;
  const indice = c.circuit.projeter(j.pos.x, j.pos.y);
  // une autre voiture occupe le point le plus proche (règle de test)
  const q = c.circuit.pointLateral(indice, 0);
  c.voitures[3].pos.set(q.x, q.y);
  c.traces.precedentes.set(j, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  const place = c.placeDeReprise(j, j.pos.x, j.pos.y);
  assert.equal(place.ecart, 0);
  assert.ok(c.circuit.distanceDevant(place.indice, indice) > 0, 'derrière le point occupé');
  assert.ok(c.voitures.filter(v => v !== j).every(v => Math.hypot(v.pos.x - place.x, v.pos.y - place.y) >= Course.ESPACE_REPRISE));
  // (avant le 17 octobre 2026 : un incident « sortie », qui n'existe plus ; la remise en piste est
  // la même pour un accident)
  c.declarerIncident(j, 'accident', { x: j.pos.x, y: j.pos.y });
  c.remettreEnPiste(j);
  assert.equal(j.tour, tour);
  // repartie au centre, dans le sens de la course, à ≈ 80 km/h
  const t = c.circuit.tangentes[j.indicePiste];
  assert.ok(Math.abs(j.ecartLateral) < 1e-6);
  assert.ok((j.vel.x * t.x + j.vel.y * t.y) / j.vel.mag() > 0.99);
  assert.ok(Math.abs(j.kmh - IncidentJoueur.VITESSE_REPRISE_KMH) <= 1, `${j.kmh} km/h`);
  assert.equal(j.pilotageAuto, true);
  assert.equal(c.traces.precedentes.has(j), false, 'la trace repart de la nouvelle position');
});

test('encart Rejouer : non bloquant, juste au-dessus du bandeau ; la conduite marche ; disparaît après 10 s, au clic sur ✕ ou au tour suivant', () => {
  const p = partie();
  accidentContre(p);
  jusqua(p, `${J}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  p.draw();
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, 'f1-encart-0'));
  assert.match(texteDe(p, 'f1-encart-0-texte'), /Incident · \+10 s/);
  assert.equal(p.evaluate('interfaceF1.encart.boites[0].libelle.textContent'), 'Rejouer la course');
  // non bloquant : la course continue, les touches de conduite marchent, les boutons ne prennent pas le focus
  assert.equal(p.evaluate('formule1.course.pause'), false);
  const t0 = temps(p);
  p.touche('w');
  p.draw(10);
  assert.ok(temps(p) > t0);
  assert.equal(p.evaluate(`${J}.commandes.haut`), true);
  assert.equal(p.evaluate('interfaceF1.encart.boites[0].boutons.rejouer.tabIndex'), -1);
  // la voiture freine et s'arrête sur la piste (pas de nouvel incident) : 10 s plus tard, l'encart part
  p.evaluate('formule1.relacher("w")');
  p.touche('s');
  sec(p, EncartRejouer.DUREE - 1);
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, 'f1-encart-0'), 'encore là avant 10 s');
  assert.equal(p.evaluate('formule1.course.reprises.length'), 1);
  sec(p, 1.5);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(visible(p, 'f1-encart-0'), false);
  // ✕
  const q = partie();
  accidentContre(q);
  jusqua(q, `${J}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  q.draw();
  q.evaluate('interfaceF1.encart.boites[0].boutons.fermer.fire("click")');
  q.evaluate('interfaceF1.forcer()');
  assert.equal(visible(q, 'f1-encart-0'), false);
  // tour suivant (règle de test : le compteur de tours avance)
  const r = partie();
  accidentContre(r);
  jusqua(r, `${J}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  r.draw();
  assert.equal(r.evaluate('formule1.encarts.length'), 1);
  r.evaluate(`${J}.tour += 1`);
  r.draw();
  assert.equal(r.evaluate('formule1.encarts.length'), 0);
});

test('R → confirmation (pause) → Entrée : la même course relancée depuis le départ, nettoyée ; R → Échap : la course continue', () => {
  const p = partie();
  accidentContre(p);
  jusqua(p, `${J}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  p.draw();
  const numero = p.evaluate('formule1.course.numeroCourse');
  // R → Échap : rien ne change, la course reprend
  p.touche('r');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.confirmationRejouer'), true);
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.ok(visible(p, 'f1-confirmation'));
  assert.match(texteDe(p, 'f1-confirmation-texte'), /Rejouer \?/);
  p.touche('Escape');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.confirmationRejouer'), false);
  assert.equal(p.evaluate('formule1.course.pause'), false);
  assert.equal(visible(p, 'f1-confirmation'), false);
  assert.equal(p.evaluate('formule1.course.numeroCourse'), numero);
  // le bouton de l'encart → confirmation → Entrée
  p.evaluate('interfaceF1.encart.boites[0].boutons.rejouer.fire("click")');
  assert.equal(p.evaluate('formule1.confirmationRejouer'), true);
  p.touche('Enter');
  p.draw();
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.numeroCourse'), numero + 1);
  assert.equal(p.evaluate('formule1.course.etat'), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  assert.equal(p.evaluate(`${J}.penalites`), 0);
  assert.equal(p.evaluate('formule1.encarts.length'), 0);
  assert.equal(p.evaluate('formule1.course.debris.length'), 0);
  assert.equal(visible(p, 'f1-encart-0'), false);
});

// (règle d'origine, jusqu'au 17 octobre 2026 : un petit menu pause « En pause · Rejouer la course ·
// Reprendre » propre à l'encart. Depuis, c'est l'overlay PAUSE du mode jeu (menuPause.js : Reprendre,
// Rejouer la course, Réglages, Menu) ; la règle testée ici reste la même)
test("Échap (pause) : l'overlay PAUSE propose Rejouer ; R → Échap revient à la pause ; R sans incident demande aussi confirmation", () => {
  const p = partie();
  p.touche('Escape');
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.ok(visible(p, 'f1-pause'));
  assert.match(texteDe(p, 'f1-pause-rejouer'), /Rejouer la course/);
  p.touche('r');
  assert.equal(p.evaluate('formule1.confirmationRejouer'), true);
  p.touche('Escape');
  assert.equal(p.evaluate('formule1.confirmationRejouer'), false);
  assert.equal(p.evaluate('formule1.course.pause'), true);              // retour à la pause
  p.touche('Escape');
  assert.equal(p.evaluate('formule1.course.pause'), false);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(visible(p, 'f1-pause'), false);
});

test('championnat : « Rejouer la manche » ; Entrée relance la même manche sans la compter', () => {
  const p = partie({ mode: 'championnat' });
  accidentContre(p);
  jusqua(p, `${J}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  p.draw();
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('interfaceF1.encart.boites[0].libelle.textContent'), 'Rejouer la manche');
  p.touche('r');
  p.touche('Enter');
  p.draw();
  assert.equal(p.evaluate('formule1.championnat.indice'), 0);
  assert.equal(p.evaluate('formule1.championnat.resultats.length'), 0);
  assert.equal(p.evaluate('formule1.course.etat'), 'PRESENTATION');
});

test('deux joueurs : l\'incident de J1 ne met pas J2 en pause ; encart dans la moitié de J1 ; Rejouer relance pour les deux', () => {
  const p = partie({ mode: 'multijoueur' });
  const [j1, j2] = ['formule1.course.joueurs[0]', 'formule1.course.joueurs[1]'];
  accidentContre(p, j1);
  assert.equal(p.evaluate(`${j2}.incident`), null);
  assert.equal(p.evaluate(`${j2}.sousControle`), true);
  assert.equal(p.evaluate('formule1.course.pause'), false);
  jusqua(p, `${j1}.sousControle === true`, 60 * (SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 1));
  p.draw();
  p.evaluate('interfaceF1.forcer()');
  assert.ok(visible(p, 'f1-encart-0'));
  assert.equal(visible(p, 'f1-encart-1'), false);
  assert.ok(p.evaluate('interfaceF1.encart.boites[0].racine.classList.contains("gauche")'));
  p.touche('r');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  p.touche('Enter');
  p.draw();
  assert.equal(p.evaluate('formule1.course.etat'), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.course.joueurs.length'), 2);
});

test('fin de course seulement : après l\'incident, la course n\'est pas finie ; pas d\'écran REJOUER', () => {
  const p = partie();
  accidentContre(p);
  for (let i = 0; i < 60 * (SEQUENCE + 6); i++) {
    p.draw();
    assert.notEqual(p.evaluate('formule1.course.etat'), 'FIN');
  }
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('interfaceF1.ecran'), 'course');
  assert.equal(p.evaluate('formule1.ecranFin'), null);
});

test('aide : la touche R (rejouer, avec confirmation) y figure', () => {
  const p = partie();
  assert.ok(p.evaluate('FenetreAide.GROUPES.some(([, lignes]) => lignes.some(([texte, touches]) => /Rejouer/.test(texte) && touches.includes("R")))'));
});

// --- Course seule ---------------------------------------------------------------------------
function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, modePilote: true, nombreVoitures: 6, ...reglages }, Circuit.generateur(1999));
}
const lancer = c => { for (let i = 0; i < 60 * 15 && c.etat !== Course.ETATS.COURSE; i++) c.pas(); for (let i = 0; i < 30; i++) c.pas(); };

// (« sortie » jusqu'au 17 octobre 2026 : la pénalité de 5 s est maintenant celle des limites de piste)
test('pénalités réglables (Réglages › Joueur) : limites de piste 5 s, accident 10 s par défaut ; 0 = pas de pénalité ; curseurs aux constantes', () => {
  const d = Course.parametresParDefaut();
  assert.equal(d.penaliteLimites, VoiturePilote.PENALITE_LIMITES);
  assert.equal(d.penaliteAccident, IncidentJoueur.PENALITE_ACCIDENT);
  assert.deepEqual([VoiturePilote.PENALITE_LIMITES, IncidentJoueur.PENALITE_ACCIDENT], [5, 10]);
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  p.draw();
  assert.equal(Number(p.element('f1-penalite-limites').value), 5);
  assert.equal(Number(p.element('f1-penalite-accident').value), 10);
  p.glisser('f1-penalite-accident', 0);
  assert.equal(p.evaluate('formule1.course.parametres.penaliteAccident'), 0);
  const c = course({ penaliteAccident: 0 });
  c.choisirJoueur(0);
  lancer(c);
  c.provoquerAccident(c.joueur.pos.x, c.joueur.pos.y, 'test', c.joueur);
  for (let t = 0; t < SEQUENCE + IncidentJoueur.DUREE_DECOMPTE + 0.5; t += PAS) c.pas();
  assert.equal(c.joueur.penalites, 0);
  assert.equal(c.joueur.sousControle, true);
});

// (jusqu'au 17 octobre 2026, aussi : une « sortie » non gênante sautait la neutralisation, et une
// sortie aggravée devenait un accident ; la sortie n'est plus un incident)
test('séquence seule (IncidentJoueur) : radio, neutralisation, remise, décompte, reprise, fin ; « sortie » n\'est plus un incident', () => {
  const a = new IncidentJoueur(null, 'accident', { cause: 'x' });
  const etapes = [];
  for (let t = 0; t < 12; t += PAS) { const e = a.avancer(PAS); if (e) etapes.push([e, Math.round(t * 10) / 10]); }
  assert.deepEqual(etapes.map(e => e[0]), ['neutraliser', 'remettre', 'reprendre', 'terminer']);
  assert.deepEqual(etapes.map(e => e[1]), [2, 5, 8, 10]);
  const g = new IncidentJoueur(null, 'accident', { cause: 'contact avec la #3' });
  for (let t = 0; t < IncidentJoueur.DUREE_RADIO + IncidentJoueur.DUREE_NEUTRALISATION + 0.1; t += PAS) g.avancer(PAS);
  assert.equal(g.phase, 'DECOMPTE');
  assert.equal(g.decompte, 3);
  assert.throws(() => new IncidentJoueur(null, 'sortie'), /Incident inconnu/);
  assert.throws(() => new IncidentJoueur(null, 'panne'), /Incident inconnu/);
});

test('IA inchangée : l\'accident d\'une voiture de l\'IA la met en ACCIDENT et sort la safety car tout de suite', () => {
  const c = course();
  c.choisirJoueur(0);
  lancer(c);
  const ia = c.voitures[3];
  c.provoquerAccident(ia.pos.x, ia.pos.y, 'contact avec le mur', ia);
  assert.equal(c.etat, Course.ETATS.SAFETY_CAR);
  assert.equal(ia.etat, VoitureF1.ETATS.ACCIDENT);
  assert.equal(c.chronometrage.abandon(ia), true);
  assert.equal(c.joueur.incident, null);
});
