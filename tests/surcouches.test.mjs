import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, F1, near } from './support.mjs';
import { page } from './page.mjs';

// Phase 4 du design (design/ : « Feux de départ », « Drapeau jaune · Safety car · VSC », « Pit
// stop », « Animations », « Podium de fin », « Écran REJOUER ») : surcouches HTML qui lisent la
// course sans la changer, avec les vraies valeurs (intervalle des feux, facteur du VSC, temps des
// roues de l'équipe de stand, barème du championnat).

const scene = loadScene(F1, '({ Course, VoitureF1, VoiturePilote, FeuxDepart, BandeauNeutralisation, PanneauStand, HudCourse, PodiumFin, EcranRejouer, EcranFin, PointRejouer, Particule, Vehicle, DecorCircuit, Circuit, Championnat })');
const { Course, VoitureF1, VoiturePilote, FeuxDepart, BandeauNeutralisation, PanneauStand, HudCourse, PodiumFin, EcranRejouer, EcranFin, PointRejouer, Particule, Vehicle, DecorCircuit, Circuit, Championnat } = scene;

function course(reglages = {}) {
  return new Course({ ...Course.parametresParDefaut(), incidents: false, ...reglages });
}
const etat = p => p.evaluate('formule1.course.etat');
// Tout le texte d'un élément et de ses enfants (le DOM de test ne compose pas textContent).
const textes = (p, expression) => p.evaluate(`(function t(e) { return [e.textContent || '', ...Array.from(e.children || [], t)].join(' '); })(${expression})`);
// Le substitut de p5 garde chaque appel de dessin : on vide ce journal à chaque image (les longues
// courses le feraient grossir sans fin).
function demarrerF1(options = {}) {
  const p = page(options).demarrer();
  p.choisir('f1');
  const draw = p.draw.bind(p);
  p.draw = (n = 1) => {
    for (let i = 0; i < n; i++) {
      p.calls.length = 0;
      p.decor.calls.length = 0;
      draw();
    }
  };
  return p;
}

// (règle d'origine, jusqu'au 17 octobre 2026 : à la fin de l'attente les feux s'éteignaient,
// étape 6 « Extinction » avec « GO ! », puis plus rien après 600 ms. Depuis, les 5 colonnes passent
// au VERT pendant 1 s, puis le portique s'efface en 250 ms ; voir modeJeu.test.mjs)
test('feux : prêt, 1 à 5 feux allumés, puis le vert (« GO ! ») au départ ; vraies valeurs de la séquence', () => {
  const c = course({ nombreVoitures: 4 });
  assert.equal(c.etat, Course.ETATS.PRESENTATION);
  assert.equal(FeuxDepart.etape(c), 0);
  const vus = new Set();
  for (let i = 0; i < 60 * 12 && c.etat !== Course.ETATS.COURSE; i++) {
    c.pas();
    if (c.etat === Course.ETATS.FEUX) vus.add(FeuxDepart.etape(c));
  }
  assert.ok([1, 2, 3, 4, 5].every(n => vus.has(n)), [...vus].join(','));
  assert.equal(FeuxDepart.etape(c), 6);                         // vert : GO
  for (let i = 0; i < 60 * (FeuxDepart.DUREE_VERT + FeuxDepart.DUREE_FONDU) + 1; i++) c.pas();
  assert.equal(FeuxDepart.etape(c), null);                      // plus rien après le vert et le fondu
  assert.deepEqual(Array.from(FeuxDepart.ETAPES), ['Prêt', '1', '2', '3', '4', '5', 'Vert']);
});

// (règle d'origine : texte « extinction aléatoire 0,5–3 s », portique masqué 1 s après le départ ;
// depuis le 17 octobre 2026 : vert 1 s puis fondu 250 ms)
test('feux dans la page : colonnes allumées une à une, GO au vert, séquence avec l\'intervalle réel ; le p5 ne les dessine plus', () => {
  const p = demarrerF1({ largeur: 1920, hauteur: 1080 });
  // espion : le dessin p5 des feux (Classement.showFeux) ne doit plus être appelé
  p.evaluate('globalThis.feuxP5 = 0; const ancien = Classement.prototype.showFeux; Classement.prototype.showFeux = function (...a) { feuxP5++; return ancien.apply(this, a); }');
  const allumes = () => p.evaluate('interfaceF1.feux.colonnes.filter(([a]) => a.classList.contains("allume")).length');
  const vus = new Set();
  for (let i = 0; i < 1200 && etat(p) !== 'COURSE'; i++) {
    p.draw();
    if (etat(p) === 'FEUX') vus.add(allumes());
    assert.equal(p.evaluate('interfaceF1.feux.racine.hidden'), false);
  }
  assert.ok([1, 2, 3, 4, 5].every(n => vus.has(n)), [...vus].join(','));
  assert.equal(p.evaluate('interfaceF1.feux.go.hidden'), false);
  assert.match(p.evaluate('interfaceF1.feux.sequence.children[0].children[0].textContent'), /1 feu toutes les 1 s, vert après une attente aléatoire de 0,5–3 s/);
  for (let i = 0; i < 60 * (FeuxDepart.DUREE_VERT + FeuxDepart.DUREE_FONDU) + 2; i++) p.draw();
  assert.equal(p.evaluate('interfaceF1.feux.racine.hidden'), true);
  // le dessin p5 des feux est coupé quand l'interface HTML est là
  assert.equal(p.evaluate('feuxP5'), 0);
});

test('neutralisations : contenu du bandeau (safety car, VSC et sa vraie réduction, drapeau jaune), virage le plus proche', () => {
  const c = course({ nombreVoitures: 6 });
  assert.equal(BandeauNeutralisation.contenu(c), null);
  const leurre = (drapeau, extra = {}) => Object.defineProperties(Object.create(c), {
    drapeau: { value: drapeau }, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])) });
  assert.deepEqual({ ...BandeauNeutralisation.contenu(leurre('sc')) }, { type: 'sc', titre: 'SAFETY CAR', detail: 'Pas de dépassement', icone: 'voiture' });
  const vsc = BandeauNeutralisation.contenu(leurre('vsc'));
  assert.equal(vsc.titre, 'VIRTUAL SAFETY CAR');
  assert.equal(vsc.detail, `Respectez la limite · −${Math.round((1 - c.parametres.facteurVSC) * 100)} %`);
  const v = c.circuit.virages[2];
  const jaune = BandeauNeutralisation.contenu(leurre('jaune', { incidents: { zones: [{ indice: v.apex }], secteursJaunes: new Set([1]) } }));
  assert.equal(jaune.detail, 'Secteur 2 · virage 3 · dépassement interdit');
  assert.equal(BandeauNeutralisation.virageDe(c.circuit, v.apex + 1), 3);
  // piste libre : seulement juste après une neutralisation
  assert.equal(BandeauNeutralisation.contenu(c, true).titre, 'PISTE LIBRE');
});

test('neutralisations dans la page : VSC (bandeau, tour en jaune, HUD limite et marge), puis piste libre 3 s', () => {
  const p = demarrerF1();
  p.glisser('f1-nombre-voitures', 8);
  for (let i = 0; i < 1200 && etat(p) !== 'COURSE'; i++) p.draw();
  for (let i = 0; i < 60 * 8; i++) p.draw();
  p.evaluate('formule1.course.selection = formule1.course.classement()[1]');
  assert.equal(p.evaluate('formule1.course.incidents.declencherVSC()'), true);
  for (let i = 0; i < 60 * 3; i++) p.draw();
  const b = () => JSON.parse(p.evaluate('JSON.stringify([interfaceF1.neutralisation.racine.hidden, interfaceF1.neutralisation.type, interfaceF1.neutralisation.titre.textContent])'));
  assert.deepEqual(b(), [false, 'vsc', 'VIRTUAL SAFETY CAR']);
  assert.equal(p.evaluate('interfaceF1.tour.racine.classList.contains("neutralise")'), true);
  assert.equal(p.evaluate('document.getElementById("f1-tour-neutralisation").textContent'), 'VSC');
  assert.equal(p.evaluate('interfaceF1.hud.dom.devantLibelle.textContent'), 'Limite VSC');
  assert.match(p.evaluate('interfaceF1.hud.dom.derriere.textContent'), /^[+−]\d+ km\/h$/);
  // fin du VSC : « piste libre » pendant 3 s, puis plus rien
  for (let i = 0; i < 60 * 60 && p.evaluate('formule1.course.drapeau') === 'vsc'; i++) p.draw();
  assert.notEqual(p.evaluate('formule1.course.drapeau'), 'vsc');
  if (p.evaluate('formule1.course.drapeau') === 'vert') {
    p.draw();
    assert.deepEqual(b().slice(0, 2), [false, 'libre']);
    for (let i = 0; i < 60 * 4; i++) p.draw();
    if (p.evaluate('formule1.course.drapeau') === 'vert') assert.equal(b()[0], true);
  }
  assert.equal(p.evaluate('interfaceF1.tour.racine.classList.contains("neutralise")'), false);
});

test('HUD sous VSC : limite en km/h (même conversion que la vitesse), marge positive sous la limite', () => {
  const c = course({ nombreVoitures: 4 });
  const v = c.voitures[0];
  const leurre = Object.defineProperty(Object.create(c), 'drapeau', { value: 'vsc' });
  v.vsc = { profil: Array(c.circuit.n).fill(3), facteur: 0.6 };
  v.vel.x = 1; v.vel.y = 0;
  const n = HudCourse.neutralisation(leurre, v);
  assert.equal(n.devant.valeur, `${Math.round(3 * 0.6 * VoiturePilote.KMH)} km/h`);
  assert.equal(n.derriere.ok, true);
  assert.equal(HudCourse.neutralisation(c, v), null);
  assert.equal(HudCourse.neutralisation(Object.defineProperty(Object.create(c), 'drapeau', { value: 'sc' }), v).derriere.valeur, 'Pas de dépassement');
});

test('arrêt au stand dans la page : limiteur, pneus avant -> après, roues de l\'équipe, chrono, puis disparition', () => {
  const p = demarrerF1({ largeur: 1920, hauteur: 1080 });
  p.glisser('f1-nombre-voitures', 6);
  for (let i = 0; i < 1200 && etat(p) !== 'COURSE'; i++) p.draw();
  for (let i = 0; i < 60 * 4; i++) p.draw();
  p.evaluate('formule1.course.selection = formule1.course.voitures[2]; formule1.course.voitures[2].pneuDemande = "DUR"; formule1.course.voitures[2].demanderStand()');
  const phase = () => p.evaluate('formule1.course.voitures[2].phaseStand');
  let vuArret = false;
  let rouesFinies = 0;
  let chrono = '—';
  let depuis = 0;
  for (let i = 0; i < 60 * 90 && !(vuArret && phase() === null); i++) {
    p.draw();
    depuis = phase() === null ? 0 : depuis + 1;
    // le panneau est mis à jour à 10 Hz : visible au plus 6 images après l'entrée dans la voie
    if (depuis > 7) assert.equal(p.evaluate('interfaceF1.stand.racine.hidden'), false);
    if (phase() === 'ARRET' && depuis > 7) {
      vuArret = true;
      rouesFinies = Math.max(rouesFinies, p.evaluate('interfaceF1.stand.roues.filter(r => r.case_.classList.contains("fini")).length'));
      const t = p.evaluate('interfaceF1.stand.chrono.textContent');
      if (t !== '—') chrono = t;
      assert.equal(p.evaluate('interfaceF1.stand.apres.textContent'), 'H');
    }
  }
  assert.ok(vuArret, 'la voiture s\'est arrêtée');
  assert.ok(rouesFinies >= 1, `${rouesFinies} roues finies vues`);
  assert.match(chrono, /^\d+\.\d\d$/);
  for (let i = 0; i < 10; i++) p.draw();
  assert.equal(p.evaluate('interfaceF1.stand.racine.hidden'), true);
  assert.match(textes(p, 'interfaceF1.stand.limiteur'), new RegExp(`${PanneauStand.limiteurKmh()}`));
  assert.equal(PanneauStand.limiteurKmh(), Math.round(VoitureF1.VITESSE_STANDS * VoiturePilote.KMH));
  assert.deepEqual({ ...PanneauStand.roue({ nom: 'ARD', duree: 1.987, temps: 2, fini: true }) }, { nom: 'AR D', texte: '✓ 1.99', etat: 'fini' });
  assert.equal(PanneauStand.roue({ nom: 'AVG', duree: 2, temps: 0.5, fini: false }).texte, 'en cours');
});

test('podium de fin dans la page : victoire, marches, classement final avec les points du barème ; Entrée rejoue', () => {
  const p = demarrerF1({ largeur: 1920, hauteur: 1080 });
  p.glisser('f1-nombre-voitures', 6);
  p.glisser('f1-nombre-tours', 1);
  p.glisser('f1-vitesse-simulation', 4);
  for (let i = 0; i < 6000 && !p.evaluate('formule1.course.terminee'); i++) p.draw();
  assert.equal(p.evaluate('formule1.course.terminee'), true);
  // l'arrivée reste visible PodiumFin.DELAI secondes, puis le podium
  p.draw();
  assert.equal(p.evaluate('interfaceF1.podium.visible'), false);
  for (let i = 0; i < 60 * (PodiumFin.DELAI + 0.5); i++) p.draw();
  assert.equal(p.evaluate('interfaceF1.podium.visible'), true);
  const d = JSON.parse(p.evaluate('JSON.stringify((() => { const d = PodiumFin.donnees(formule1.course); return { titre: d.titre, code: d.vainqueur.pilote.code, points: d.lignes.map(l => l.points), lignes: d.lignes.length, sous: d.sousTitre }; })())'));
  assert.equal(d.titre, 'Arrivée · Grand Prix de Valmora · 1 tour');
  assert.equal(d.code, p.evaluate('formule1.course.classement()[0].pilote.code'));
  assert.equal(d.lignes, 6);
  // le barème réel (25, 18, 15...) plus 1 point pour le meilleur tour
  assert.deepEqual(d.points.slice(0, 3).map(x => x - (x === 26 || x === 19 || x === 16 ? 1 : 0)), [25, 18, 15]);
  assert.match(d.sous, /parti \d+(ᵉʳ|ᵉ) · \d+ dépassements? · \d+ arrêts?$/);
  assert.match(textes(p, 'interfaceF1.podium.racine'), /VICTOIRE DE/);
  assert.match(textes(p, 'interfaceF1.podium.racine'), /CLASSEMENT FINAL/);
  assert.doesNotMatch(textes(p, 'interfaceF1.podium.racine'), /REVOIR/);
  p.touche('Enter');
  assert.equal(etat(p), 'PRESENTATION');
  for (let i = 0; i < 10; i++) p.draw();
  assert.equal(p.evaluate('interfaceF1.podium.visible'), false);
});

test('REJOUER : matrice de points (des Vehicle) dans la scène ; boutons, touches et bilan du joueur en HTML', () => {
  assert.ok(PointRejouer.prototype instanceof Particule && PointRejouer.prototype instanceof Vehicle);
  const cases = EcranFin.matrice(EcranFin.disposition(1800, 1100));
  assert.equal(cases.length, 7 * 35);
  near(cases[5 * 7].x - cases[4].x, 5 * EcranFin.POINT + 4 * EcranFin.ESPACE + EcranFin.ENTRE_LETTRES - 4 * (EcranFin.POINT + EcranFin.ESPACE), 1e-9);
  // l'écran REJOUER vient à la fin d'un défi (un accident ne finit plus la course)
  const p = demarrerF1();
  p.draw();
  p.evaluate("formule1.choisirMode('defi')");
  for (let i = 0; i < 1200 && etat(p) !== 'COURSE'; i++) p.draw();
  p.evaluate('formule1.course.finirLaPartie()');
  for (let i = 0; i < 30; i++) p.draw();
  assert.equal(etat(p), 'FIN');
  assert.equal(p.evaluate('interfaceF1.rejouer.visible'), true);
  assert.equal(p.evaluate('interfaceF1.podium.visible'), false);
  assert.match(p.evaluate('interfaceF1.rejouer.dom.resultat.textContent'), /^P\d+ · [A-Z]{3}$/);
  assert.equal(p.evaluate('interfaceF1.rejouer.dom.depassements.textContent'), String(p.evaluate('formule1.course.joueur.depassements')));
  // les points sont des PointRejouer ; le premier R est rouge
  assert.equal(p.evaluate('formule1.ecranFin.particules.every(x => x instanceof PointRejouer)'), true);
  assert.equal(p.evaluate('formule1.ecranFin.particules.filter(x => x.premiere).length'), 18);
  // bouton REJOUER (anciennement NOUVELLE COURSE)
  p.evaluate('interfaceF1.rejouer.boutons.nouvelle.fire("click")');
  assert.equal(etat(p), 'PRESENTATION');
});

test('drapeau jaune dans la scène : aplat jaune à 12 % sur le secteur, qui clignote à 1 Hz', () => {
  const circuit = new Circuit('classique');
  const d = new DecorCircuit(circuit);
  scene.calls.length = 0;
  d.showSecteursJaunes(new Set(), 0);
  assert.equal(scene.calls.length, 0);
  d.showSecteursJaunes(new Set([1]), 0);
  const traits = () => scene.calls.filter(a => a[0] === 'stroke' && a[1] === 245);
  const fort = traits().at(-1)[4];
  near(fort, 255 * 0.12, 1e-9);
  assert.ok(scene.calls.some(a => a[0] === 'strokeWeight' && a[1] === 120));
  d.showSecteursJaunes(new Set([1]), 0.6);
  near(traits().at(-1)[4], 255 * 0.12 * 0.45 / 0.9, 1e-9);
});

test('écran partagé : étiquettes J1 / J2 et HUD par joueur en HTML, duel (positions, écart, tours menés) ; tour et mini-carte masquées', () => {
  const p = demarrerF1({ largeur: 1920, hauteur: 1080 });
  p.draw();
  const mode = p.element('f1-mode');
  mode.value = 'multijoueur';
  mode.fire('change');
  for (let i = 0; i < 1200 && etat(p) !== 'COURSE'; i++) p.draw();
  for (let i = 0; i < 30; i++) p.draw();
  assert.equal(p.evaluate('interfaceF1.duel.visible'), true);
  assert.equal(p.evaluate('interfaceF1.racine.classList.contains("duel-actif")'), true);
  assert.equal(p.evaluate('interfaceF1.hud.racine.hidden'), true);            // le HUD principal laisse la place
  const codes = JSON.parse(p.evaluate('JSON.stringify(interfaceF1.duel.joueurs.map(j => j.code.textContent))'));
  const attendus = JSON.parse(p.evaluate('JSON.stringify(formule1.course.joueurs.map(j => j.pilote.code + " · " + j.ecurie.nom))'));
  assert.deepEqual(codes, attendus);
  const positions = JSON.parse(p.evaluate('JSON.stringify(interfaceF1.duel.cotes.map(c => c.pos.textContent))'));
  const vraies = JSON.parse(p.evaluate('JSON.stringify(formule1.course.joueurs.map(j => "P" + (formule1.course.classement().indexOf(j) + 1)))'));
  assert.deepEqual(positions, vraies);
  // le HUD p5 de l'écran partagé n'est plus dessiné
  p.evaluate('globalThis.hudP5 = 0; const h = EcranPartage.prototype.showHud; EcranPartage.prototype.showHud = function (...a) { hudP5++; return h.apply(this, a); }');
  p.draw();
  assert.equal(p.evaluate('hudP5'), 0);
  // tours menés : un tour bouclé est compté pour celui qui est devant
  // les joueurs ne conduisent pas sans touches : J1 « boucle » son premier tour (la grille est
  // derrière la ligne : tour vaut -1 au départ) ; il le mène s'il est devant J2 au classement
  const tour = () => p.evaluate('Math.max(...formule1.course.joueurs.map(j => j.tour))');
  p.evaluate('formule1.course.joueur.tour = 1');
  p.draw(3);
  assert.match(p.evaluate('interfaceF1.duel.menes.textContent'), /^Tours menés · J1 \d+ – J2 \d+$/);
  assert.equal(p.evaluate('interfaceF1.duel.toursMenes[0] + interfaceF1.duel.toursMenes[1]'), tour());
});
