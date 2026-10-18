import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1 } from './support.mjs';
import { page } from './page.mjs';

// États du jeu et écrans : un seul écran plein écran à la fois ; sur un écran de fin, seules
// ses commandes sont visibles (classe is-hidden sur les autres zones, posée par InterfaceF1) ;
// relancer / rejouer / manche suivante / menu nettoient la course d'avant ; pas d'accident
// avant le départ ; caméra sans redessin du décor ; confettis à durée de vie ; Réinitialiser.

const scene = loadScene([...F1, 'diagnosticPerf.js'], '({ Circuit, Course, Podium, Confetti, Championnat, DiagnosticPerf })');
const { Circuit, Course, Podium, Confetti, Championnat, DiagnosticPerf } = scene;

const ZONES = ['f1-barre', 'f1-tour', 'f1-hud', 'f1-carte', 'f1-rail', 'f1-evenement', 'f1-contenu'];
const etat = p => p.evaluate('formule1.course.etat');
const jusqua = (p, condition, n = 2400) => { for (let i = 0; i < n && !p.evaluate(condition); i++) p.draw(); assert.ok(p.evaluate(condition), condition); };
// position à l'écran de la voiture de rang r
const ecran = (p, r) => p.evaluate(`(() => { const cam = formule1.camera; const v = formule1.course.voitures[${r}];
  const dx = (v.pos.x - cam.x) * cam.echelle, dy = (v.pos.y - cam.y) * cam.echelle; const c = Math.cos(cam.rotation), s = Math.sin(cam.rotation);
  return { x: cam.zone.x + cam.zone.largeur / 2 + cam.secousse.x + dx * c - dy * s, y: cam.zone.y + cam.zone.hauteur / 2 + cam.secousse.y + dx * s + dy * c }; })()`);

// Le circuit dans la page, mode de jeu et mode pilote choisis ; voiture du joueur choisie au clic.
function partie({ mode = 'course', pilote = true } = {}) {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  p.draw();
  if (mode !== 'course') {
    p.element('f1-mode').value = mode;
    p.element('f1-mode').fire('change');
  }
  if (pilote) {
    const casier = p.element('f1-mode-pilote');
    if (!casier.checked) {
      casier.checked = true;
      casier.fire('change');
    }
    p.draw();
    const { x, y } = ecran(p, 0);
    p.clic(x, y);
  }
  p.draw();
  return p;
}
// Le joueur part, puis la partie finit (tous arrivés : règle de test, finirLaPartie) ; on attend
// l'écran de fin (podium HTML 3 s après en course libre, REJOUER en défi, podium du championnat).
// (Avant le 17 octobre 2026, un accident finissait la partie ; il ne la finit plus : la voiture
// est remise en piste, voir incidentsJoueur.test.mjs.)
function finDePartie(p) {
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.draw(30);
  p.evaluate('formule1.course.finirLaPartie()');
  jusqua(p, 'formule1.course.etat === "FIN"');
  jusqua(p, '!["course", "depart"].includes(interfaceF1.ecran)', 60 * 5);
  p.draw(2);
  p.evaluate('interfaceF1.forcer()');
}
const cachee = (p, id) => p.element(id).classList.contains('is-hidden');
// le bandeau ne montre rien, ou un message de la course en cours (jamais un de la course d'avant)
const bandeauDeLaCourse = p => p.evaluate(`(() => { const m = interfaceF1.bandeau.courant; if (m === null) return true;
  return [...formule1.course.evenements.map(e => BandeauEvenements.message(e)), ...formule1.course.messagesRadio.map(r => BandeauEvenements.message(r, true))].some(x => x.texte === m.texte); })()`);

// (règles d'origine : le podium du championnat après un accident, puis REJOUER avec « Course
// suivante » ; depuis le 17 octobre 2026, un accident ne finit plus la manche)
test('bug 1 : championnat + accident du joueur : aucun écran de fin ; à la fin de la manche, le podium du championnat seul', () => {
  const p = partie({ mode: 'championnat' });
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.draw(30);
  p.evaluate('formule1.course.provoquerAccident(formule1.course.joueur.pos.x, formule1.course.joueur.pos.y, "test", formule1.course.joueur)');
  for (let i = 0; i < 60 * 8; i++) p.draw();
  p.evaluate('interfaceF1.forcer()');
  assert.notEqual(etat(p), 'FIN');
  assert.equal(p.evaluate('formule1.podium'), null);
  assert.equal(p.evaluate('formule1.ecranFin'), null);
  assert.equal(p.evaluate('interfaceF1.ecran'), 'course');
  finDePartie(p);
  assert.equal(p.evaluate('formule1.podium !== null'), true);
  assert.equal(p.evaluate('formule1.ecranFin'), null);
  assert.equal(p.evaluate('interfaceF1.rejouer.visible'), false);
  assert.equal(p.evaluate('interfaceF1.podium.visible'), false);
  assert.equal(p.evaluate('interfaceF1.ecran'), 'championnat');
});

test('bug 1 : relancer après la fin d\'une manche nettoie tout (podium, confettis, écran REJOUER, bandeau, piste libre) sans compter la manche deux fois', () => {
  const p = partie({ mode: 'championnat' });
  finDePartie(p);
  assert.equal(p.evaluate('formule1.championnat.resultats.length'), 1);
  p.evaluate('formule1.recommencer()');
  p.draw(3);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(etat(p), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.podium'), null);
  assert.equal(p.evaluate('formule1.ecranFin'), null);
  assert.equal(p.evaluate('formule1.course.pause'), false);
  // la manche n'est pas comptée deux fois : elle sera enregistrée à sa nouvelle arrivée
  assert.equal(p.evaluate('formule1.championnat.resultats.length'), 0);
  // l'interface repart de zéro : plus de message ni de « piste libre » de la course d'avant
  assert.equal(bandeauDeLaCourse(p), true);
  assert.equal(p.evaluate('interfaceF1.neutralisation.racine.hidden'), true);
  assert.equal(p.evaluate('interfaceF1.ecran'), 'depart');
  for (const id of ZONES) assert.equal(cachee(p, id), false, id);
});

test('bug 1 : Entrée sur le podium du championnat = manche suivante, nettoyée', () => {
  const p = partie({ mode: 'championnat' });
  finDePartie(p);
  p.touche('Enter');
  p.draw(3);
  assert.equal(p.evaluate('formule1.podium'), null);
  assert.equal(p.evaluate('formule1.championnat.indice'), 1);
  assert.equal(etat(p), 'PRESENTATION');
  assert.equal(bandeauDeLaCourse(p), true);
});

test('bug 1 : un accident ne peut pas terminer la course avant le départ (présentation, feux)', () => {
  const p = partie();
  assert.ok(['PRESENTATION', 'FEUX'].includes(etat(p)));
  // la voiture du joueur posée sur une autre (test seulement) : pas d'accident avant le départ
  p.evaluate('(() => { const c = formule1.course; const j = c.joueur; const a = c.voitures.find(v => v !== j); j.etat = "DEPART"; j.pos.x = a.pos.x; j.pos.y = a.pos.y; c.verifierLesContacts(j); })()');
  assert.equal(p.evaluate('formule1.course.joueur.incident'), null);
  p.evaluate('formule1.course.provoquerAccident(0, 0, "test", formule1.course.joueur)');
  assert.equal(p.evaluate('formule1.course.joueur.incident'), null);
  p.draw(10);
  assert.notEqual(etat(p), 'FIN');
});

test('bugs 5 et 7 : sur un écran de fin, seuls l\'écran et ses boutons sont visibles ; tout revient au départ suivant', () => {
  const p = partie();
  finDePartie(p);
  assert.equal(p.evaluate('interfaceF1.ecran'), 'podium');
  for (const id of ZONES) assert.equal(cachee(p, id), true, id);
  // le bandeau d'événements est vidé
  assert.equal(p.evaluate('interfaceF1.bandeau.courant'), null);
  p.touche('Enter');
  p.draw(2);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('interfaceF1.ecran'), 'depart');
  for (const id of ZONES) assert.equal(cachee(p, id), false, id);
});

test('zones par écran : un seul écran plein écran à la fois ; aucune zone de course sur les écrans de fin', () => {
  const p = page().demarrer();
  const zones = p.evaluate('InterfaceF1.ZONES');
  for (const fin of ['podium', 'rejouer', 'championnat']) {
    for (const [nom, visible] of Object.entries(zones[fin])) assert.equal(visible, false, `${fin} : ${nom}`);
  }
  for (const nom of ['barre', 'tour', 'hud', 'carte', 'rail', 'panneau', 'evenements']) assert.equal(zones.course[nom], true, nom);
});

test('bug 6 : MENU (Échap, bouton) quitte l\'écran de fin, nettoie la course, ouvre le choix du mode et du pilote sans lancer de course', () => {
  const p = partie();
  finDePartie(p);
  p.touche('Escape');
  p.draw(3);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('formule1.ecranFin'), null);
  assert.equal(p.evaluate('interfaceF1.podium.visible'), false);
  assert.equal(etat(p), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.course.pause'), true);
  assert.equal(p.evaluate('formule1.enMenu'), true);
  assert.equal(p.evaluate('interfaceF1.ecran'), 'menu');
  // le panneau s'ouvre sur les réglages, section Mode ; la liste « Mode de jeu » a le focus
  assert.equal(p.evaluate('interfaceF1.panneau.ouvert && interfaceF1.panneau.onglet'), 'reglages');
  assert.equal(p.element('f1-section-mode').open, true);
  assert.equal(p.element('f1-mode').focusee, true);
  // quelques images : la course ne démarre pas
  p.draw(400);
  assert.equal(etat(p), 'PRESENTATION');
  // choisir une voiture (mode pilote) quitte le menu : la course peut partir
  const { x, y } = ecran(p, 3);
  p.clic(x, y);
  assert.equal(p.evaluate('formule1.enMenu'), false);
  assert.equal(p.evaluate('formule1.course.pause'), false);
});

test('bug 6 : le bouton MENU du podium et celui de l\'écran REJOUER font la même chose ; ils rendent le focus', () => {
  // l'écran REJOUER vient à la fin d'un défi (voiture imposée)
  const p = partie({ mode: 'defi' });
  finDePartie(p);
  assert.equal(p.evaluate('interfaceF1.ecran'), 'rejouer');
  const changer = p.evaluate('interfaceF1.rejouer.boutons.changer');
  const flous = changer.flous;
  changer.fire('click');
  assert.equal(p.evaluate('formule1.enMenu'), true);
  assert.ok(changer.flous > flous);
  // REJOUER (NOUVELLE COURSE) : même nettoyage, course relancée, même pilote
  p.evaluate('formule1.course.basculerPause()');
  finDePartie(p);
  const code = p.evaluate('formule1.course.joueur.pilote.code');
  const nouvelle = p.evaluate('interfaceF1.rejouer.boutons.nouvelle');
  nouvelle.fire('click');
  p.draw(2);
  assert.equal(p.evaluate('formule1.ecranFin'), null);
  assert.equal(p.evaluate('formule1.enMenu'), false);
  assert.equal(etat(p), 'PRESENTATION');
  assert.equal(p.evaluate('formule1.course.joueur.pilote.code'), code);
});

test('bug 4 : Réinitialiser remet curseurs, cases et listes à leurs valeurs par défaut et les applique à la course', () => {
  const p = page().demarrer();
  p.choisir('f1');
  p.draw();
  p.glisser('f1-poids-seek', 2.5);
  p.element('f1-moment').value = 'nuit';
  p.element('f1-moment').fire('change');
  p.element('f1-gerbes').checked = false;
  p.element('f1-gerbes').fire('change');
  p.element('f1-ombres').checked = false;
  p.element('f1-ombres').fire('change');
  assert.equal(p.evaluate('formule1.affichage.moment'), 'nuit');
  p.evaluate('interfaceF1.panneau.reinitialiser()');
  assert.equal(p.element('f1-poids-seek').value, '1');
  assert.equal(p.evaluate('formule1.course.parametres.poidsSeek'), 1);
  assert.equal(p.element('f1-moment').value, 'jour');
  assert.equal(p.evaluate('formule1.affichage.moment'), 'jour');
  assert.equal(p.element('f1-gerbes').checked, true);
  assert.equal(p.evaluate('formule1.course.parametres.gerbes'), true);
  assert.equal(p.element('f1-ombres').checked, true);
  assert.equal(p.evaluate('formule1.affichage.ombres'), true);
});

test('bug 4 : Réinitialiser ne touche ni au mode de jeu, ni au mode pilote, ni au circuit ; il marche aussi sur un écran de fin', () => {
  const p = partie();
  p.element('f1-profil').value = 'rapide';
  p.element('f1-profil').fire('change');
  p.draw();
  const { x, y } = ecran(p, 0);
  p.clic(x, y);
  finDePartie(p);
  p.glisser('f1-vitesse-max', 8);
  p.evaluate('interfaceF1.panneau.reinitialiser()');
  assert.equal(p.evaluate('formule1.course.parametres.vitesseMax'), 5);
  assert.equal(p.evaluate('formule1.course.parametres.modePilote'), true);
  assert.equal(p.evaluate('formule1.course.parametres.profil'), 'rapide');
  assert.equal(p.evaluate('formule1.mode'), 'course');
});

test('bug 3 : changer de caméra ne redessine pas le décor (graphiques gardés par facteur, préparés au départ)', () => {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.draw(5);
  const avant = p.evaluate('Course.decor(formule1.course.circuit).generations');
  for (let k = 0; k < 10; k++) {
    p.touche('c');
    p.draw(3);
  }
  assert.equal(p.evaluate('Course.decor(formule1.course.circuit).generations'), avant);
});

test('confettis : durée de vie, retirés une fois éteints ou sortis de l\'écran, plafond global ; aucun sans podium', () => {
  const ch = new Championnat();
  const lignes = [{ code: 'AAA', nom: 'A', ecurie: 'E', couleur: [1, 2, 3], position: 1, points: 25 }];
  const podium = new Podium(lignes, ch, 1200, 800);
  assert.ok(podium.confettis.length > 0 && podium.confettis.length <= Podium.PLAFOND_CONFETTIS);
  assert.ok(Podium.PLAFOND_CONFETTIS <= 200);
  // un confetti sorti de l'écran est retiré à la mise à jour suivante
  podium.confettis[0].pos.x = -500;
  const n = podium.confettis.length;
  podium.update(1 / 60);
  assert.equal(podium.confettis.length, n - 1);
  // au bout de leur durée de vie, il n'en reste aucun
  for (let t = 0; t < Confetti.DUREE_VIE + 1; t += 0.1) podium.update(0.1);
  assert.equal(podium.confettis.length, 0);
});

test('diagnostic : compte les Vehicle vivants (voitures, particules, mécaniciens, dépanneuses, confettis, points REJOUER)', () => {
  // fin de manche sans accident : le podium du championnat et ses confettis
  const p = partie({ mode: 'championnat' });
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.evaluate('formule1.course.finirLaPartie()');
  p.draw(30);
  const e = p.evaluate('DiagnosticPerf.entites(formule1)');
  assert.ok(e.confettis > 0);
  assert.equal(e.confettis, p.evaluate('formule1.podium.confettis.length'));
  assert.ok(e.vehicules >= p.evaluate('formule1.course.voitures.length') + e.confettis);
  assert.equal(DiagnosticPerf.entites(null).vehicules, 0);
});

test('rien ne s\'accumule d\'une course à l\'autre : la mini-carte garde un marqueur par voiture après plusieurs relances', () => {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  p.draw(3);
  p.evaluate('interfaceF1.forcer()');
  const marqueurs = () => p.evaluate('interfaceF1.carte.coucheVoitures.children.length');
  const voitures = p.evaluate('formule1.course.voitures.length');
  assert.equal(marqueurs(), voitures);
  for (let k = 0; k < 4; k++) {
    p.evaluate('formule1.recommencer()');
    p.draw(2);
    p.evaluate('interfaceF1.forcer()');
  }
  assert.equal(marqueurs(), voitures);
  assert.equal(p.evaluate('interfaceF1.carte.points.size'), voitures);
});

test('rien ne s\'accumule d\'une course à l\'autre : onglet Prédiction (une ligne par voiture), tours menés du duel remis à zéro', () => {
  const p = page({ largeur: 1920, hauteur: 1080 }).demarrer();
  p.choisir('f1');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.draw(60);
  const lignes = () => p.evaluate('(interfaceF1.prediction.lignes.size)');
  p.evaluate('interfaceF1.prediction.mettreAJour(formule1.course, null)');
  const n = lignes();
  assert.ok(n > 0);
  for (let k = 0; k < 3; k++) {
    p.evaluate('formule1.recommencer()');
    jusqua(p, 'formule1.course.etat === "COURSE"');
    p.draw(60);
    p.evaluate('interfaceF1.prediction.mettreAJour(formule1.course, null)');
  }
  assert.ok(lignes() <= p.evaluate('formule1.course.voitures.length'), String(lignes()));
  assert.equal(p.evaluate('interfaceF1.prediction.conteneur.children.length'), lignes());
  // duel : les tours menés d'une course ne passent pas à la suivante
  p.element('f1-mode').value = 'multijoueur';
  p.element('f1-mode').fire('change');
  jusqua(p, 'formule1.course.etat === "COURSE"');
  p.evaluate('formule1.course.joueur.tour = 2');
  p.draw(5);
  assert.ok(p.evaluate('interfaceF1.duel.toursMenes[0] + interfaceF1.duel.toursMenes[1]') > 0);
  p.evaluate('formule1.recommencer()');
  p.draw(5);
  assert.equal(p.evaluate('interfaceF1.duel.toursMenes[0] + interfaceF1.duel.toursMenes[1]'), 0);
});

test('menu : P lance la course même quand la liste « Mode de jeu » a le focus ; la consigne dit quoi faire', () => {
  const p = partie({ pilote: false });
  p.glisser('f1-nombre-tours', 1);
  p.glisser('f1-vitesse-simulation', 4);
  jusqua(p, 'formule1.course.terminee', 20000);
  p.draw(60 * 4);
  p.evaluate('interfaceF1.forcer()');
  assert.equal(p.evaluate('interfaceF1.ecran'), 'podium');
  p.touche('Escape');
  p.draw(2);
  assert.equal(p.evaluate('interfaceF1.ecran'), 'menu');
  assert.equal(p.evaluate('interfaceF1.consigne.racine.textContent'), 'Menu · choisis le mode, puis P pour lancer');
  // la liste a le focus : la touche P lui arrive
  p.element('f1-mode').fire('keydown', { key: 'p' });
  assert.equal(p.evaluate('formule1.course.pause'), false);
  assert.equal(p.evaluate('formule1.enMenu'), false);
  // hors du menu, P dans la liste ne fait rien de spécial
  p.element('f1-mode').fire('keydown', { key: 'p' });
  assert.equal(p.evaluate('formule1.course.pause'), false);
});

test('menu en mode pilote : la consigne invite à cliquer sur une voiture', () => {
  const p = partie();
  finDePartie(p);
  p.touche('Escape');
  p.draw(2);
  assert.equal(p.evaluate('interfaceF1.consigne.racine.textContent'), 'Menu · choisis le mode, puis clique sur une voiture pour la piloter');
});

test('championnat : la liste « Circuit » du panneau suit le circuit de la manche', () => {
  const p = partie({ mode: 'championnat', pilote: false });
  assert.equal(p.element('f1-profil').value, 'classique');
  p.evaluate('formule1.championnat.enregistrer(formule1.course)');
  p.evaluate('formule1.mancheSuivante()');
  p.draw();
  assert.equal(p.evaluate('formule1.course.parametres.profil'), 'rapide');
  assert.equal(p.element('f1-profil').value, 'rapide');
});
