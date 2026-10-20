// Le jeu « Circuit Formule 1 » : boucle p5 et câblage de la page (preload, setup, draw, touches,
// souris, fenêtre). Le jeu lui-même est le contrôleur Scenarios.formule1 (voir scenarios.js) ;
// l'interface HTML est InterfaceF1 (voir interfaceF1.js).

// Police chargée dans preload (écran de fin)
let font;
// Le jeu (le seul scénario de ce projet) ; `scenario` le désigne aussi (même interface)
let scenario;
// Mode debug, basculé par la touche d (ou la case Debug du panneau)
let debug = false;
// La souris n'a pas de position connue tant qu'elle n'a pas bougé dans la page
let sourisVue = false;
// Le circuit Formule 1 (voir scenarios.js) et ses réglages, partagés avec le panneau
let formule1;
let parametresF1;
// Interface HTML du circuit (voir interfaceF1.js), créée dans setup()
let interfaceF1 = null;
// Diagnostic de performance (voir diagnosticPerf.js) : ?debug=perf dans l'adresse, ou touche F9
let diagnostic = null;
// Qualité du rendu : détection automatique (voir qualiteRendu.js) et compteur FPS (compteurImages.js)
let qualiteRendu = null;
let compteurImages = null;
// L'élément <canvas> de la scène (son curseur devient une main au-dessus d'une voiture)
let canvasScene = null;
// IA entraînée : les modèles sauvegardés (voir modelesIA.js) et la page d'entraînement (voir
// pageEntrainement.js) ; la pause de la course avant d'ouvrir cette page
let gestionnaireModeles = null;
let pageEntrainement = null;
let pauseAvantEntrainement = false;

// Appelée avant de démarrer l'animation
function preload() {
  // en général on charge des images, des fontes de caractères etc.
  font = loadFont('./assets/inconsolata.otf');
}

// hauteur du canvas : toute la fenêtre (l'interface HTML est posée par-dessus la scène)
function hauteurScene() {
  return Math.max(1, windowHeight);
}

function setup() {
  const canvas = createCanvas(windowWidth, hauteurScene());
  canvasScene = canvas.elt;

  // modèles d'IA : ceux du navigateur, et celui fourni avec le jeu (models/piloteDefaut.js)
  gestionnaireModeles = new GestionnaireModeles({ stockage: stockageLocal(),
    integres: typeof MODELE_PILOTE_DEFAUT === 'undefined' ? [] : [{ id: 'pilote-defaut', document: MODELE_PILOTE_DEFAUT }] });
  // Le circuit : la course n'est créée qu'à la première image ; le modèle de départ des
  // adversaires « IA entraînée » est le premier de la liste
  parametresF1 = Course.parametresParDefaut();
  const premier = gestionnaireModeles.liste()[0];
  if (premier) parametresF1.modeleIA = modeleIA(premier.id);
  formule1 = Scenarios.formule1(parametresF1, {
    basculerPanneau: basculerPanneauF1,
    stockage: stockageLocal(),
    interfaceHtml: true,
    // la zone laissée à la scène : celle des ancrages de l'interface (design/ : Design system)
    zoneScene: () => InterfaceF1.zoneScene(width, height, {
      panneauOuvert: interfaceF1 !== null && interfaceF1.panneau.ouvert,
      // écran partagé : ni tour de classement ni mini-carte (design « Multijoueur local »)
      classement: formule1.affichage.classement && !(formule1.demarre && formule1.course.multijoueur),
    }),
    // ce que l'interface pose sur la scène : le cadrage du circuit l'évite
    zonesOccupees: () => InterfaceF1.zonesOccupees(width, height, {
      panneauOuvert: interfaceF1 !== null && interfaceF1.panneau.ouvert,
      carte: formule1.affichage.miniCarte,
      hud: interfaceF1 !== null && !interfaceF1.hud.racine.hidden,
    }),
  }, font);
  scenario = formule1;

  lierPanneauF1();
  lierModelesF1();
  const synchroniserModes = lierModesF1();
  // l'interface HTML du circuit
  interfaceF1 = new InterfaceF1(formule1, {
    // bouton « Entraînement IA » (barre du haut, onglet IA) ; modèles pour le menu JOUER
    entrainement: ouvrirEntrainement,
    listeModeles: () => gestionnaireModeles.liste(),
    // une partie lancée par le menu JOUER : les réglages « Mode » et « Joueur » du panneau
    // montrent l'état du jeu (une seule source de vérité : le scénario et la course)
    apresLancement: () => {
      document.getElementById('f1-mode').value = formule1.mode;
      document.getElementById('f1-mode-pilote').checked = Boolean(formule1.course.parametres.modePilote);
      synchroniserModes();
    },
  });
  // la page d'entraînement IA : son budget de temps par image se mesure ici (performance.now)
  pageEntrainement = new PageEntrainement({
    gestionnaire: gestionnaireModeles,
    horloge: () => (typeof performance === 'undefined' ? 0 : performance.now()),
    date: () => new Date().toISOString(),
    actions: { fermer: fermerEntrainement, modelesChanges: remplirModelesF1, exporter: telecharger },
  });
  diagnostic = new DiagnosticPerf(document.body);
  qualiteRendu = new QualiteRendu();
  compteurImages = new CompteurImages(document.body);
  if (DiagnosticPerf.demande(typeof location === 'undefined' ? '' : location.search)) diagnostic.activer(true);
  // la fenêtre perd le focus (changement d'onglet...) : aucune touche de conduite ne reste
  // enfoncée et, en mode jeu, la partie se met en pause
  const pauseAuto = () => {
    formule1.relacherTout();
    if (scenario === formule1) formule1.pauseAuto();
  };
  if (typeof window !== 'undefined') window.addEventListener('blur', pauseAuto);
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAuto(); });
    // plein écran (touche F) : le canvas et l'interface (classement, HUD, mini-carte, overlays
    // centrés) sont recalculés pour la nouvelle taille
    document.addEventListener('fullscreenchange', () => {
      windowResized();
      if (interfaceF1 !== null) interfaceF1.forcer();
    });
  }

  appliquerDebug();
  windowResized();
  interfaceF1.forcer();
}

// appelée 60 fois par seconde
function draw() {
  // durée de draw() pour le diagnostic de performance (seulement s'il est allumé)
  const mesure = diagnostic !== null && diagnostic.actif && typeof performance !== 'undefined';
  const debutDraw = mesure ? performance.now() : 0;
  // Temps écoulé depuis l'image précédente, en secondes (deltaTime de p5 est en millisecondes).
  // Plafonné : après une pause de l'onglet, une seule image ne doit pas compter pour plusieurs
  // secondes.
  const dt = Math.min(deltaTime / 1000, 0.1);
  const souris = sourisVue ? createVector(mouseX, mouseY) : null;

  // la fenêtre a changé de hauteur sans événement (plein écran...) : le canvas la remplit
  if (height !== hauteurScene()) windowResized();
  appliquerDensite();

  // page d'entraînement ouverte : elle seule avance et se dessine (la course attend, en pause)
  if (pageEntrainement !== null && pageEntrainement.ouverte) {
    pageEntrainement.update(dt);
    pageEntrainement.show();
    // l'entraînement prend volontairement son budget de temps : ce n'est pas une course lente
    if (qualiteRendu !== null) qualiteRendu.reinitialiser();
    if (mesure) mesurerPerf(dt, performance.now() - debutDraw);
    return;
  }

  scenario.update(dt, souris);
  scenario.show(debug);
  if (interfaceF1 !== null) interfaceF1.mettreAJour(dt);
  surveillerQualite(deltaTime / 1000);

  afficherEtat();
  if (mesure) mesurerPerf(dt, performance.now() - debutDraw);
}

// Qualité automatique (case du panneau) : sous 40 images/s pendant 3 s, la qualité inférieure est
// prise (moins d'effets, densité de pixels 1, pluie et traces réduites), le menu Qualité la montre
// et le changement est annoncé discrètement. dtReel : la durée réelle de l'image (non plafonnée).
function surveillerQualite(dtReel) {
  if (qualiteRendu === null) return;
  const affichage = formule1.affichage;
  const proposee = qualiteRendu.observer(dtReel, affichage.qualite);
  if (proposee !== null && affichage.qualiteAuto) {
    formule1.afficher('qualite', proposee);
    const menu = document.getElementById('f1-qualite');
    if (menu) menu.value = proposee;
    compteurImages.annoncer(`Qualité ${QualiteRendu.LIBELLES[proposee]} (automatique)`);
  }
  compteurImages.mettreAJour(dtReel, { actif: affichage.compteurFps, fps: qualiteRendu.fps });
}

// Diagnostic de performance : la durée de l'image et de draw(), les redessins du décor du circuit.
function mesurerPerf(dt, dureeDraw) {
  const course = formule1.demarre ? formule1.course : null;
  const redessins = course === null ? 0 : Course.decor(course.circuit).generations;
  diagnostic.enregistrer(deltaTime, dureeDraw, { redessins });
  diagnostic.afficher(dt, course, { densite: pixelDensity(), ratio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    entites: DiagnosticPerf.entites(formule1) });
}

// Le circuit dessine ses propres aides et laisse Vehicle.debug éteint : sinon vehicle.js tracerait,
// pour chaque véhicule, un cercle de freinage au demi-rayon.
function appliquerDebug() {
  Vehicle.debug = debug && scenario.aidesDeVehicle;
}

// localStorage, s'il est permis (navigation privée, fichier local, cookies bloqués : null). Les
// défis protègent aussi chaque lecture et écriture (voir defis.js).
function stockageLocal() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

// Mode de jeu (panneau « Mode ») : menu, contrôles du manager, défis, championnat. Les contrôles
// marqués data-mode ne sont visibles que dans leur mode.
function lierModesF1() {
  const menu = document.getElementById('f1-mode');
  const synchroniser = () => {
    document.querySelectorAll('[data-mode]').forEach(element => {
      element.hidden = element.dataset.mode !== formule1.mode;
    });
    afficherEtoilesDefis();
  };
  menu.value = formule1.mode;
  menu.addEventListener('change', () => {
    if (Course.MODES_JEU.includes(menu.value)) formule1.choisirMode(menu.value);
    else menu.value = formule1.mode;
    synchroniser();
    menu.blur();
  });
  const remplir = (id, options) => {
    const select = document.getElementById(id);
    options.forEach(([valeur, texte]) => {
      const option = document.createElement('option');
      option.value = valeur;
      option.textContent = texte;
      select.appendChild(option);
    });
    return select;
  };
  const ecurie = remplir('f1-manager-ecurie', Course.ECURIES.map((e, k) => [String(k), e.nom]));
  const pneus = remplir('f1-manager-pneus', Pneus.NOMS.map(nom => [nom, Pneus.type(nom).libelle]));
  const defi = remplir('f1-defi', Defis.LISTE.map(d => [d.id, d.titre]));
  const voiture = () => {
    const m = formule1.manager;
    return m === null ? null : m.voiture(formule1.course, Number(document.getElementById('f1-manager-voiture').value));
  };
  ecurie.addEventListener('change', () => {
    const e = Course.ECURIES[Number(ecurie.value)];
    if (formule1.manager !== null && e) formule1.manager.diriger(formule1.course, e);
    ecurie.blur();
  });
  const bouton = (id, action) => document.getElementById(id).addEventListener('click', () => {
    action();
    document.getElementById(id).blur();
  });
  bouton('f1-manager-box', () => formule1.manager?.rentrer(formule1.course, voiture(), pneus.value));
  document.getElementById('f1-manager-consigne').addEventListener('change', evenement => {
    if (Object.hasOwn(VoitureF1.CONSIGNES, evenement.target.value)) formule1.manager?.consigner(formule1.course, voiture(), evenement.target.value);
    evenement.target.blur();
  });
  bouton('f1-manager-inverser', () => formule1.manager?.inverser(formule1.course));
  bouton('f1-defi-lancer', () => {
    formule1.lancerDefi(defi.value);
    synchroniser();
  });
  bouton('f1-manche-suivante', () => formule1.mancheSuivante());
  synchroniser();
  return synchroniser;
}

// Meilleures étoiles de chaque défi (panneau).
function afficherEtoilesDefis() {
  const sortie = document.getElementById('f1-defi-etoiles');
  if (!sortie) return;
  const etoiles = formule1.etoilesDefis;
  sortie.textContent = Defis.LISTE.map(d => `${d.titre.split(' :')[0]} ${Defis.texteEtoiles(etoiles[d.id] ?? 0)}`).join(' · ');
}

// Panneau du circuit : curseurs, cases à cocher, menus et boutons. Chaque réglage passe par le
// scénario, qui le donne à la course (ou le garde pour elle si elle n'existe pas encore).
function lierPanneauF1() {
  ReglagesF1.CURSEURS.forEach(([cle, id]) => {
    ReglagesF1.lierCurseur(document.getElementById(id), document.getElementById(`${id}-valeur`),
      cle, valeur => formule1.regler(cle, valeur));
  });
  // curseurs et menus d'affichage (ambiance, qualité) : ils ne changent que le dessin
  ReglagesF1.CURSEURS_AFFICHAGE.forEach(([cle, id]) => {
    ReglagesF1.lierCurseur(document.getElementById(id), document.getElementById(`${id}-valeur`),
      cle, valeur => formule1.afficher(cle, valeur));
  });
  ReglagesF1.MENUS_AFFICHAGE.forEach(([cle, id, valeurs]) => {
    const menu = document.getElementById(id);
    menu.value = formule1.affichage[cle];
    menu.addEventListener('change', () => {
      if (valeurs.includes(menu.value)) formule1.afficher(cle, menu.value);
      else menu.value = formule1.affichage[cle];
      menu.blur();
    });
  });
  // cases : un réglage de course (il change la simulation) ou une option d'affichage
  ReglagesF1.CASES.forEach(([cle, id, type]) => {
    const casier = document.getElementById(id);
    casier.checked = type === 'reglage' ? Boolean(parametresF1[cle]) : formule1.affichage[cle];
    casier.addEventListener('change', () => {
      if (type === 'reglage') formule1.regler(cle, casier.checked);
      else formule1.afficher(cle, casier.checked);
      // la case rend le focus : Espace (DRS) ne la décoche pas, les touches vont au jeu
      casier.blur();
    });
  });
  // menus : personnalités, mode météo, pneus de départ (une valeur inconnue est refusée)
  ReglagesF1.MENUS.forEach(([cle, id, valeurs]) => {
    const menu = document.getElementById(id);
    menu.value = parametresF1[cle];
    menu.addEventListener('change', () => {
      if (valeurs.includes(menu.value)) formule1.regler(cle, menu.value);
      else menu.value = parametresF1[cle];
      menu.blur();
    });
  });
  // profil de la voiture choisie (clic sur une voiture, ou celle du joueur)
  const profilVoiture = document.getElementById('f1-profil-voiture');
  profilVoiture.addEventListener('change', () => {
    const course = formule1.course;
    const voiture = course.selection ?? course.joueur;
    if (voiture !== null && Personnalites.NOMS.includes(profilVoiture.value)) voiture.changerDePersonnalite(profilVoiture.value);
    profilVoiture.blur();
  });
  // case Debug : la même chose que la touche d
  const caseDebug = document.getElementById('f1-debug');
  caseDebug.checked = debug;
  caseDebug.addEventListener('change', () => {
    debug = caseDebug.checked;
    appliquerDebug();
  });

  // profil du circuit : une nouvelle course sur ce tracé
  const profil = document.getElementById('f1-profil');
  profil.value = parametresF1.profil;
  profil.addEventListener('change', () => {
    if (Object.hasOwn(Circuit.PROFILS, profil.value)) formule1.regler('profil', profil.value);
    profil.blur();
  });
  // caméra : vue d'ensemble, suivi de la voiture choisie (du leader si aucune), drone, embarquée,
  // réalisation TV
  const camera = document.getElementById('f1-camera');
  camera.value = formule1.camera.mode;
  camera.addEventListener('change', () => {
    formule1.camera.choisirMode(camera.value);
    camera.blur();
  });

  const bouton = (id, action) => document.getElementById(id).addEventListener('click', () => {
    action();
    document.getElementById(id).blur();
  });
  bouton('f1-nouvelle-course', () => formule1.recommencer());
  bouton('f1-safety-car', () => formule1.course.demanderSafetyCar());
  bouton('f1-pause', () => formule1.course.basculerPause());
  // incidents : VSC déclaré, panne sur la voiture choisie (ou la première en course)
  bouton('f1-vsc-bouton', () => formule1.course.incidents.declencherVSC());
  // pénalité de stand pour la voiture choisie (ou celle du joueur)
  for (const secondes of [5, 10]) {
    bouton(`f1-penalite-${secondes}`, () => {
      const course = formule1.course;
      const voiture = course.selection ?? course.joueur;
      if (voiture) course.penaliserAuStand(voiture, secondes);
    });
  }
  bouton('f1-panne-bouton', () => {
    const course = formule1.course;
    const voiture = course.selection ?? course.voitures.find(v => v.etat === VoitureF1.ETATS.COURSE);
    if (voiture) course.incidents.provoquerPanne(voiture, 'totale');
  });
  // écarts de la tour : au leader, ou intervalle avec la voiture devant (affichage seulement)
  document.getElementById('f1-ecarts').textContent = `Écarts : ${formule1.affichage.ecarts}`;
  bouton('f1-ecarts', () => {
    const mode = formule1.affichage.ecarts === 'leader' ? 'intervalle' : 'leader';
    formule1.afficher('ecarts', mode);
    document.getElementById('f1-ecarts').textContent = `Écarts : ${mode}`;
  });
  bouton('f1-replier', basculerPanneauF1);
  bouton('f1-choisir-voiture', () => formule1.choisirUneAutreVoiture());
  bouton('f1-nouvelle-course-joueur', () => formule1.recommencer());
}

// Un modèle d'IA pour les adversaires : { id, nom, note, reseau }, ou null s'il est illisible.
function modeleIA(id) {
  try {
    const { reseau, metadonnees } = gestionnaireModeles.charger(id);
    return { id, nom: metadonnees.nom, note: metadonnees.note, reseau };
  } catch {
    return null;
  }
}

// Menu « Modèle » de la section Adversaires : la liste des modèles ; le choix est appliqué à la
// course (une nouvelle course si les adversaires sont des IA).
function lierModelesF1() {
  const menu = document.getElementById('f1-modele-ia');
  remplirModelesF1();
  menu.addEventListener('change', () => {
    const modele = modeleIA(menu.value);
    if (modele !== null) formule1.regler('modeleIA', modele);
    menu.blur();
  });
}

function remplirModelesF1() {
  const menu = document.getElementById('f1-modele-ia');
  const modeles = gestionnaireModeles.liste();
  menu.replaceChildren(...modeles.map(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.nom}${m.note === null ? '' : ` · ${m.note}/100`}`;
    return option;
  }));
  const actif = formule1 && formule1.demarre ? formule1.course.parametres.modeleIA : parametresF1.modeleIA;
  if (actif && modeles.some(m => m.id === actif.id)) menu.value = actif.id;
}

// Bouton « Entraînement IA » : la course se met en pause, la page d'entraînement s'ouvre.
function ouvrirEntrainement() {
  const course = formule1.course;
  pauseAvantEntrainement = course.pause;
  course.pause = true;
  formule1.relacherTout();
  pageEntrainement.ouvrir();
}

// Retour à la course : elle reprend comme elle était ; la liste des modèles est à jour.
function fermerEntrainement() {
  formule1.course.pause = pauseAvantEntrainement;
  remplirModelesF1();
  if (interfaceF1 !== null) interfaceF1.forcer();
}

// Exporter un modèle : un fichier JSON téléchargé (navigateur seulement).
function telecharger(nom, texte) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
}

// Debug : touche d, ou case du panneau du circuit (les deux restent d'accord).
function basculerDebug() {
  debug = !debug;
  document.getElementById('f1-debug').checked = debug;
  appliquerDebug();
}

// Touche s ou bouton du panneau : le panneau latéral se ferme ou s'ouvre (voir panneauLateral.js).
function basculerPanneauF1() {
  interfaceF1.panneau.basculer();
}

// État de la course (texte lu par les lecteurs d'écran, #etat-f1), une fois la course créée
function afficherEtat() {
  if (formule1.demarre) {
    const etatF1 = document.getElementById('etat-f1');
    const resume = formule1.course.resume();
    const meteo = formule1.course.meteo.etat;
    const texteF1 = `${resume.etat} · tour ${resume.tour}/${resume.tours} · ${resume.voitures} voitures · ${meteo}${resume.pause ? ' · PAUSE' : ''}`;
    if (etatF1.textContent !== texteF1) etatF1.textContent = texteF1;
    // la liste « Circuit » suit le circuit couru (le championnat le change à chaque manche)
    const profil = document.getElementById('f1-profil');
    if (profil.value !== formule1.course.parametres.profil && document.activeElement !== profil) profil.value = formule1.course.parametres.profil;
    // comme les autres textes : on n'écrit dans la page que si le texte change
    const boutonPause = document.getElementById('f1-pause');
    const textePause = resume.pause ? 'Reprendre' : 'Pause';
    if (boutonPause.textContent !== textePause) boutonPause.textContent = textePause;
    // championnat : manche et meneur ; défis : étoiles (à la fin d'un défi)
    const ch = formule1.championnat;
    const texteCh = ch === null ? '' : `Manche ${Math.min(ch.manches.length, ch.indice + 1)}/${ch.manches.length} (${Circuit.PROFILS[ch.mancheCourante].libelle})` +
      (ch.resultats.length > 0 ? ` · meneur : ${ch.classementPilotes()[0].nom}` : '');
    const sortieCh = document.getElementById('f1-championnat-etat');
    if (sortieCh.textContent !== texteCh) sortieCh.textContent = texteCh;
    if (formule1.resultatDefi !== null) afficherEtoilesDefis();
  }
}

function keyPressed(evenement) {
  // On tape dans un champ de texte, ou on parcourt un menu au clavier : ce n'est pas un raccourci.
  const origine = evenement && evenement.target ? evenement.target : null;
  const champTexte = origine && origine.tagName === 'INPUT' && origine.type === 'text';
  // F : plein écran du circuit dans tous les états, même quand un menu déroulant a le focus (pas
  // dans un champ de texte, où F s'écrit)
  if ((key === 'f' || key === 'F') && interfaceF1 !== null && !champTexte) {
    InterfaceF1.basculerPleinEcran();
    return false;
  }
  if (origine && (origine.tagName === 'SELECT' || champTexte)) {
    return;
  }
  // page d'entraînement : ses touches (Échap = retour, Espace = démarrer / pause), rien pour la course
  if (pageEntrainement !== null && pageEntrainement.ouverte) {
    if (key === 'F9') diagnostic.basculer();
    return pageEntrainement.touche(key) ? false : undefined;
  }
  // F9 : diagnostic de performance (même en pilotage)
  if (key === 'F9') {
    diagnostic.basculer();
    return false;
  }

  // circuit : les raccourcis de l'interface (plein écran, aide, panneau, onglets, caméra...) ; en
  // pilotage, seuls F, l'aide, la caméra et l'overlay PAUSE passent (voir InterfaceF1.touche)
  const pilotage = Boolean(scenario.pilotage && scenario.pilotage());
  if (interfaceF1 !== null && interfaceF1.touche(key, pilotage)) return false;

  // mode pilote : les touches de conduite (W A S D, P, Échap...) passent avant les raccourcis ;
  // le debug se règle alors par la case du panneau
  if (pilotage) return scenario.touche(key);

  if (key === 'd' || key === 'D') {
    basculerDebug();
  } else if (scenario.touche(key) === false) {
    // le scénario garde la touche pour lui (Tab, par exemple) : pas d'action du navigateur
    return false;
  }
}

// Une touche relâchée : la commande de conduite correspondante s'arrête.
function keyReleased() {
  if (scenario.relacher) scenario.relacher(key);
}

// La souris a une position connue dès qu'elle bouge dans la page
function mouseMoved() {
  sourisVue = true;
  if (pageEntrainement !== null && pageEntrainement.ouverte) return;
  // une voiture sous le curseur : la main (clic = choisir ce pilote, ou le suivre)
  const main = Boolean(scenario.survol && scenario.survol(mouseX, mouseY));
  const style = canvasScene ? canvasScene.style : null;
  if (style && (style.cursor === 'pointer') !== main) style.cursor = main ? 'pointer' : '';
}

function mouseDragged() {
  sourisVue = true;
}

function mousePressed(evenement) {
  // un clic sur l'interface (boutons, curseurs) n'est pas un clic dans la scène
  if (evenement && evenement.target && evenement.target.tagName !== 'CANVAS') return;
  sourisVue = true;
  if (mouseButton === RIGHT || (pageEntrainement !== null && pageEntrainement.ouverte)) return;
  scenario.clic(mouseX, mouseY);
}

function windowResized() {
  resizeCanvas(windowWidth, hauteurScene());
  appliquerDensite();
  formule1.redimensionner(width, height);
}

// Densité de pixels du canvas : celle de l'écran, plafonnée selon la qualité et pour que le canvas
// ne dépasse pas 1920 × 1080 pixels réels (voir qualiteRendu.js). Vérifiée à chaque image (la
// qualité, la fenêtre ou l'écran peuvent changer), appliquée seulement si elle change.
function appliquerDensite() {
  if (typeof pixelDensity !== 'function') return;
  const ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const voulue = QualiteRendu.densite(formule1 ? formule1.affichage.qualite : Ambiance.QUALITE, ratio, width, height);
  if (pixelDensity() !== voulue) pixelDensity(voulue);
}
