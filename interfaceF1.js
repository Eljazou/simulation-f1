// Interface HTML du circuit (design/ : Design system, écran principal) : crée et met à jour la
// barre du haut, la tour de classement, le HUD pilote, le bandeau d'événement, le panneau latéral
// à onglets et la fenêtre d'aide. Ce n'est pas un Vehicle : elle lit la course (via le scénario)
// et ne modifie que la page, jamais une position ni une vitesse. Seules actions sur la course :
// celles d'un bouton (pause, choix d'une voiture, caméra, mode des écarts...), comme avant.
//
// Fréquences du design system : textes à 10 Hz, HUD à 30 Hz ; le bandeau suit chaque image (il
// ne touche la page qu'au changement de message). Tailles « L » (≥ 1600 px) et « M » (en dessous).
class InterfaceF1 {
  // Mises à jour de la page par seconde : textes (barre, classement, onglets), HUD, mini-carte (ses
  // points bougent : plus souvent, sauf en qualité basse). Rien n'est écrit si la valeur ne change pas.
  static FREQUENCE_TEXTES = 10;
  static FREQUENCE_HUD = 10;
  static FREQUENCE_CARTE = { bas: 10, moyen: 30, eleve: 30 };
  static MARGE = 12;
  static BARRE = 40;
  static BANDEAU = 36;
  static TAILLES = {
    L: { tour: 230, panneau: 320, rail: 40, hud: [460, 212], carte: [280, 200] },
    M: { tour: 210, panneau: 300, rail: 36, hud: [400, 184], carte: [240, 172] },
  };

  static taille(largeur) {
    return largeur >= 1600 ? 'L' : 'M';
  }

  // --- Écrans et zones visibles (un seul endroit : appliquerEcran) ---------------------------
  // L'élément de chaque zone de l'interface.
  static ELEMENTS = { barre: 'f1-barre', tour: 'f1-tour', hud: 'f1-hud', carte: 'f1-carte', rail: 'f1-rail', panneau: 'f1-contenu',
    evenements: 'f1-evenement', neutralisation: 'f1-neutralisation', arret: 'f1-arret', consigne: 'f1-consigne', duel: 'f1-duel', feux: 'f1-feux' };
  // Les écrans plein écran (de fin) : aucune zone de course.
  static PLEIN_ECRAN = ['podium', 'rejouer', 'championnat', 'defi'];
  // Pour chaque écran, les zones permises (une zone permise reste soumise à ses propres conditions :
  // HUD seulement avec une voiture montrée, feux seulement avant le départ...). Un seul écran plein
  // écran à la fois : feux (départ), podium, REJOUER, podium du championnat (dessiné), défi.
  static ZONES = (() => {
    const tout = v => Object.fromEntries(Object.keys(InterfaceF1.ELEMENTS).map(k => [k, v]));
    return {
      depart: tout(true),
      course: tout(true),
      // menu (depuis un écran de fin) : la barre, le panneau (mode, pilote),
      // la consigne ; la scène montre la grille en attente
      menu: { ...tout(false), barre: true, rail: true, panneau: true, consigne: true },
      // écrans de fin : seul l'écran et ses boutons
      podium: tout(false),
      rejouer: tout(false),
      championnat: tout(false),
      defi: tout(false),
    };
  })();

  // L'écran courant : 'championnat' (podium dessiné), 'rejouer', 'podium', 'defi', 'menu',
  // 'depart' (présentation, feux) ou 'course'. tempsFin = secondes depuis la fin de la course.
  // (Un incident du joueur n'a pas d'écran : la course continue ; encart, compte à rebours,
  // confirmation et menu pause sont des surcouches de l'écran 'course'.)
  static ecran(formule1, course, tempsFin = 0) {
    const { PRESENTATION, FEUX, FIN } = Course.ETATS;
    if (formule1.podium !== null) return 'championnat';
    if (course.etat === FIN && formule1.ecranFin !== null) return 'rejouer';
    if (formule1.resultatDefi !== null) return 'defi';
    if (tempsFin >= PodiumFin.DELAI && formule1.ecranFin === null && !course.multijoueur) return 'podium';
    if (formule1.enMenu) return 'menu';
    if ([PRESENTATION, FEUX].includes(course.etat)) return 'depart';
    return 'course';
  }

  // La zone de l'écran laissée à la scène (la caméra y fait tenir le circuit) : sous la barre du
  // haut, à droite de la tour de classement, à gauche du panneau ouvert, au-dessus du bandeau.
  static zoneScene(largeur, hauteur, { panneauOuvert = false, classement = true } = {}) {
    const t = InterfaceF1.TAILLES[InterfaceF1.taille(largeur)];
    const m = InterfaceF1.MARGE;
    const gauche = classement ? m + t.tour + m : m;
    const droite = panneauOuvert ? t.panneau + m : m;
    const haut = m * 2 + InterfaceF1.BARRE;
    const bas = m * 2 + InterfaceF1.BANDEAU;
    return { x: gauche, y: haut, largeur: Math.max(50, largeur - gauche - droite), hauteur: Math.max(50, hauteur - haut - bas) };
  }

  // Les rectangles de l'interface posés SUR la scène (mini-carte en haut à droite, HUD en bas à
  // gauche), que le cadrage du circuit évite (Camera.cadrerCircuit).
  static zonesOccupees(largeur, hauteur, { panneauOuvert = false, carte = true, hud = true } = {}) {
    const t = InterfaceF1.TAILLES[InterfaceF1.taille(largeur)];
    const m = InterfaceF1.MARGE;
    const zones = [];
    if (carte) zones.push({ x: largeur - m - t.carte[0] - (panneauOuvert ? t.panneau + m : 0), y: m * 2 + InterfaceF1.BARRE, largeur: t.carte[0], hauteur: t.carte[1] });
    if (hud) zones.push({ x: m, y: hauteur - m - t.hud[1], largeur: t.hud[0], hauteur: t.hud[1] });
    return zones;
  }

  // Plein écran (touche F, dans tous les états) : la page entière, ou retour à la fenêtre. Le
  // navigateur envoie ensuite « fullscreenchange » (sketch.js redimensionne alors le canvas et
  // l'interface). Renvoie vrai si le plein écran est demandé.
  static basculerPleinEcran(doc = typeof document === 'undefined' ? null : document) {
    if (!doc) return false;
    const silence = promesse => { if (promesse && typeof promesse.catch === 'function') promesse.catch(() => {}); };
    if (doc.fullscreenElement) {
      if (typeof doc.exitFullscreen === 'function') silence(doc.exitFullscreen());
      return false;
    }
    const racine = doc.documentElement;
    if (!racine || typeof racine.requestFullscreen !== 'function') return false;
    silence(racine.requestFullscreen());
    return true;
  }

  // formule1 = le jeu (Scenarios.formule1) ; actions : basculerDebug(), apresLancement() (le
  // panneau « Mode » et « Joueur » reprend l'état du jeu), entrainement() (bouton « Entraînement
  // IA »), listeModeles() (les modèles d'IA sauvegardés, pour le menu JOUER).
  constructor(formule1, actions = {}) {
    this.formule1 = formule1;
    this.actions = actions;
    const $ = id => document.getElementById(id);
    this.racine = $('f1-ui');
    this.panneauRacine = $('panneau-f1');
    this.aide = new FenetreAide();
    this.barre = new BarreHaut({
      pause: () => this.formule1.course.basculerPause(),
      camera: () => this.cameraSuivante(),
      panneau: () => this.panneau.basculer(),
      aide: () => this.aide.basculer(),
      entrainement: () => (actions.entrainement ?? (() => {}))(),
    });
    this.tour = new TourClassement($('f1-tour'), {
      // clic sur une ligne : le même choix qu'un clic sur la voiture (pilote, ou voiture suivie)
      choisir: voiture => { this.formule1.choisirVoiture(voiture); },
      ecarts: mode => this.formule1.afficher('ecarts', mode),
    });
    this.hud = new HudCourse($('f1-hud'));
    this.carte = new CarteCircuit({ choisir: voiture => this.formule1.choisirVoiture(voiture) });
    this.bandeau = new BandeauEvenements($('f1-evenement'));
    this.telemetrie = new OngletTelemetrie($('f1-tele-graphes'));
    this.prediction = new OngletPrediction($('f1-pred-lignes'));
    this.historique = new OngletHistorique($('f1-histo-svg'), $('f1-histo-faits'));
    // onglet IA : adversaires entraînés, modèle actif, note ; bouton vers la page d'entraînement
    this.ongletIA = new OngletIA({ entrainement: () => (actions.entrainement ?? (() => {}))() });
    this.panneau = new PanneauLateral({
      relancer: () => this.rejouerCourse(),
      curseurs: [...ReglagesF1.CURSEURS, ...ReglagesF1.CURSEURS_AFFICHAGE],
      plages: ReglagesF1.PLAGES,
      cases: ReglagesF1.CASES,
      menus: ReglagesF1.MENUS,
      menusAffichage: ReglagesF1.MENUS_AFFICHAGE,
      defauts: () => ({ reglages: Course.parametresParDefaut(), affichage: this.formule1.affichageParDefaut ?? {} }),
    });
    // phase 4 du design : feux, neutralisations, arrêt au stand, écrans de fin
    const finir = { rejouer: () => this.rejouerCourse(), menu: () => this.menu() };
    this.feux = new FeuxDepart(this.racine);
    this.neutralisation = new BandeauNeutralisation(this.racine);
    this.stand = new PanneauStand(this.racine);
    this.podium = new PodiumFin(this.racine, finir);
    this.rejouer = new EcranRejouer(this.racine, finir);
    this.duel = new HudDuel(this.racine);
    this.consigne = new ConsignePilote(this.racine);
    // incidents du joueur : compte à rebours de la remise en piste ; encart « Rejouer »,
    // confirmation et menu pause
    this.decompte = new DecompteReprise(this.racine);
    const surCourse = action => (...args) => { action(...args); this.forcer(); this.rendreLeFocus(); };
    this.encart = new EncartRejouer(this.racine, {
      rejouer: surCourse(() => this.formule1.demanderRejouer()),
      fermer: surCourse(k => { const j = this.formule1.course.joueurs[k]; if (j) this.formule1.fermerEncart(j); }),
      confirmer: surCourse(() => this.formule1.confirmerRejouer()),
      annuler: surCourse(() => this.formule1.annulerRejouer()),
    });
    // mode jeu : voile sombre derrière un overlay (HUD et classement restent visibles, assombris),
    // bouton JOUER et menu des modes, overlay PAUSE ; un seul overlay à la fois
    this.voile = DomF1.el('div', 'voile-jeu');
    this.voile.id = 'f1-voile';
    this.voile.hidden = true;
    this.racine.appendChild(this.voile);
    this.menuModes = new MenuModes(this.racine, {
      jouer: () => { this.ouvrirMenuModes(); this.rendreLeFocus(); },
      lancer: options => this.lancerPartie(options),
      annuler: surCourse(() => this.menuModes.fermer()),
    });
    this.menuPause = new MenuPause(this.racine, {
      reprendre: surCourse(() => { if (this.formule1.course.pause) this.formule1.course.basculerPause(); }),
      rejouer: surCourse(() => this.formule1.demanderRejouer()),
      reglages: surCourse(() => this.panneau.ouvrir('reglages')),
      menu: surCourse(() => this.ouvrirMenuModes()),
    });
    $('f1-tele-comparer').addEventListener('click', () => {
      const modes = Telemetrie.COMPARAISONS;
      const suivant = modes[(modes.indexOf(this.formule1.affichage.comparaison) + 1) % modes.length];
      this.formule1.afficher('comparaison', suivant);
      const menu = $('f1-comparaison');
      if (menu) menu.value = suivant;
    });
    // menu : la liste « Mode de jeu » a le focus (les touches ne vont pas à la scène) ; P y lance
    // la course quand même
    const liste = $('f1-mode');
    if (liste) {
      liste.addEventListener('keydown', evenement => {
        if (!this.formule1.enMenu || String(evenement.key).toLowerCase() !== 'p') return;
        if (typeof evenement.preventDefault === 'function') evenement.preventDefault();
        if (typeof liste.blur === 'function') liste.blur();
        this.formule1.course.basculerPause();
      });
    }
    this.tempsTextes = Infinity;
    this.tempsHud = Infinity;
    this.tempsCarte = Infinity;
    this.ecran = null;
    this.numeroCourse = null;
  }

  // Applique l'écran : la classe is-hidden (fondu de 200 ms) sur chaque zone qu'il ne permet pas.
  // En entrant sur un écran de fin, le bandeau d'événements est vidé.
  appliquerEcran(ecran) {
    const zones = InterfaceF1.ZONES[ecran];
    for (const [zone, id] of Object.entries(InterfaceF1.ELEMENTS)) {
      const e = document.getElementById(id);
      if (e) DomF1.classe(e, 'is-hidden', !zones[zone]);
    }
    DomF1.classe(this.racine, 'ecran-fin', InterfaceF1.PLEIN_ECRAN.includes(ecran));
    if (ecran !== this.ecran && !zones.evenements) this.bandeau.vider();
    this.ecran = ecran;
  }

  // Une nouvelle course (relancer, rejouer, manche suivante, menu) : les composants qui gardent
  // un état d'une image à l'autre repartent de zéro (bandeau, « piste libre », feux, fin).
  nouvelleCourse() {
    this.bandeau.vider();
    this.neutralisation.reinitialiser();
    this.feux.etapeAffichee = undefined;
    this.tempsFin = 0;
  }

  // La voiture suivie : celle du joueur, sinon la voiture choisie.
  suivie(course) {
    return course.joueur ?? course.selection ?? null;
  }

  // Une image (dt en secondes réelles).
  mettreAJour(dt = 0) {
    const f = this.formule1;
    if (!f.demarre) return;
    const c = f.course;
    if (c.numeroCourse !== this.numeroCourse) {
      this.numeroCourse = c.numeroCourse;
      this.nouvelleCourse();
    }
    this.tempsTextes += dt;
    this.tempsHud += dt;
    this.tempsCarte = (this.tempsCarte ?? Infinity) + dt;
    // en pause, les minuteries de l'interface (bandeau, « piste libre », podium) sont figées
    const dtJeu = c.pause ? 0 : dt;
    // course finie (tous arrivés, ou fin du mode pilote) : le podium HTML vient après PodiumFin.DELAI
    const finie = c.terminee || (c.etat === Course.ETATS.FIN && f.ecranFin === null);
    this.tempsFin = finie ? (this.tempsFin ?? 0) + dtJeu : 0;
    // l'écran courant décide des zones visibles (chaque image : seules les classes qui changent)
    const ecran = InterfaceF1.ecran(f, c, this.tempsFin);
    this.appliquerEcran(ecran);
    const nuit = (f.obscurite ?? 0) > 0.5;
    for (const e of [this.racine, this.panneauRacine]) {
      DomF1.classe(e, 'theme-nuit', nuit);
      DomF1.classe(e, 'theme-pluie', c.meteo.humidite > 0.3);
    }
    if (this.tempsHud >= 1 / InterfaceF1.FREQUENCE_HUD) {
      this.tempsHud = 0;
      const v = HudCourse.voitureMontree(c);
      this.hud.mettreAJour(c, { commandes: v === null ? null : f.telemetrie?.lisses.get(v) ?? null, visible: !c.multijoueur });
      this.duel.mettreAJour(c, { telemetrie: f.telemetrie });
      DomF1.classe(this.racine, 'duel-actif', c.multijoueur === true);
    }
    if (this.tempsCarte >= 1 / (InterfaceF1.FREQUENCE_CARTE[f.affichage.qualite] ?? InterfaceF1.FREQUENCE_CARTE.moyen)) {
      this.tempsCarte = 0;
      this.carte.mettreAJour(c, { suivie: this.suivie(c), panneauOuvert: this.panneau.ouvert, visible: f.affichage.miniCarte && !c.multijoueur });
    }
    if (this.tempsTextes >= 1 / InterfaceF1.FREQUENCE_TEXTES) {
      this.tempsTextes = 0;
      this.barre.mettreAJour(f, c, nuit);
      const suivie = this.suivie(c);
      this.tour.mettreAJour(c, { mode: f.affichage.ecarts, suivie, visible: f.affichage.classement && !c.multijoueur });
      DomF1.classe(this.tour.racine, 'sans-hud', this.hud.racine.hidden);
      this.panneau.mettreAJour(onglet => {
        if (onglet === 'telemetrie') this.telemetrie.mettreAJour(c, f.telemetrie, f.affichage.comparaison);
        else if (onglet === 'prediction') this.prediction.mettreAJour(c, suivie);
        else if (onglet === 'historique') this.historique.mettreAJour(c, suivie);
        else if (onglet === 'ia') this.ongletIA.mettreAJour(c, suivie ?? c.leader);
      });
      this.stand.mettreAJour(c, suivie, { panneauOuvert: this.panneau.ouvert, hud: !this.hud.racine.hidden });
      this.rejouer.mettreAJour(c, { visible: ecran === 'rejouer', disposition: f.ecranFin?.disposition ?? null });
      this.podium.mettreAJour(c, { visible: ecran === 'podium' });
      // le menu Caméra du panneau suit la caméra (changée au départ d'une course en mode jeu)
      const menuCamera = document.getElementById('f1-camera');
      if (menuCamera && menuCamera.value !== f.camera.mode && document.activeElement !== menuCamera) menuCamera.value = f.camera.mode;
    }
    // le bandeau ne reçoit plus rien sur un écran qui le masque (il a été vidé)
    if (InterfaceF1.ZONES[ecran].evenements) {
      this.bandeau.mettreAJour(c, dtJeu, { decale: this.panneau.ouvert });
      // incident d'un joueur, phase radio : son message reste à l'écran (≈ 2 s), quoi qu'il arrive
      const inc = c.joueurs.map(j => j.incident).find(i => i && i.phase === IncidentJoueur.PHASES.RADIO) ?? null;
      if (inc !== null) {
        this.bandeau.imposer(BandeauEvenements.message({ texte: inc.message, voiture: inc.joueur, prioritaire: true, duree: IncidentJoueur.DUREE_RADIO }, true));
      }
    }
    // chaque image : l'allumage des feux est immédiat, le bandeau de neutralisation glisse
    this.feux.mettreAJour(c);
    this.neutralisation.mettreAJour(c, dtJeu);
    // la consigne du mode pilote suit chaque image (un clic choisit tout de suite le pilote)
    this.consigne.mettreAJour(this.formule1, c);
    // incidents : compte à rebours, encart « Rejouer », confirmation, menu pause (chaque image)
    const enCourse = ecran === 'course' || ecran === 'depart';
    this.decompte.mettreAJour(c, { visible: enCourse });
    this.encart.mettreAJour(f, c, { actif: enCourse });
    // mode jeu : menu des modes, overlay PAUSE (en pause, sans confirmation ni menu), voile, JOUER
    const pause = enCourse && c.pause && f.pilotage() && !this.menuModes.ouvert;
    this.menuPause.mettreAJour(f, { visible: pause });
    DomF1.cacher(this.voile, !(pause || this.menuModes.ouvert));
    this.menuModes.mettreAJour({ jouerVisible: !f.partieEnCours && !this.menuModes.ouvert, panneauOuvert: this.panneau.ouvert });
  }

  // Le menu des modes (bouton JOUER, Entrée, bouton Menu de la pause), ouvert sur les valeurs du jeu.
  ouvrirMenuModes() {
    const f = this.formule1;
    const p = f.course.parametres;
    const ambiance = p.modeMeteo !== 'sec' ? 'pluie' : f.affichage.moment === 'nuit' ? 'nuit' : 'jour';
    // depuis le spectateur, on vient pour jouer : Solo est proposé
    const mode = ['solo', 'duo', 'championnat'].includes(f.modeJeu) ? f.modeJeu : 'solo';
    const modeles = this.actions.listeModeles ? this.actions.listeModeles() : [];
    this.menuModes.ouvrir({ mode, profil: p.profil, tours: p.nombreTours, ambiance, adversaires: p.adversaires,
      modele: p.modeleIA ? p.modeleIA.id : null, modeles });
    this.forcer();
  }

  // Lancer (menu des modes) : circuit, tours et ambiance passent par les réglages du panneau (le
  // même chemin qu'un geste : événements input / change), puis le scénario lance la partie ; le
  // panneau « Mode » et « Joueur » reprend l'état du jeu. Une seule source de vérité.
  lancerPartie({ mode, profil, tours, ambiance, adversaires = null, modele = null }) {
    const $ = id => document.getElementById(id);
    const geste = (id, valeur, type) => {
      const e = $(id);
      if (!e || String(e.value) === String(valeur)) return;
      e.value = String(valeur);
      PanneauLateral.declencher(e, type);
    };
    const p = this.formule1.course.parametres;
    geste('f1-nombre-tours', tours, 'input');
    geste('f1-moment', ambiance === 'nuit' ? 'nuit' : 'jour', 'change');
    geste('f1-mode-meteo', ambiance === 'pluie' ? 'manuel' : 'sec', 'change');
    if (ambiance === 'pluie' && p.intensitePluie < Meteo.SEUILS[1]) geste('f1-intensite-pluie', Meteo.INTENSITE, 'input');
    if (mode !== 'championnat') geste('f1-profil', profil, 'change');
    // adversaires (et modèle) : par les menus du panneau, section Adversaires
    if (modele !== null) geste('f1-modele-ia', modele, 'change');
    if (adversaires !== null) geste('f1-adversaires', adversaires, 'change');
    this.formule1.lancerPartie({ mode });
    if (this.actions.apresLancement) this.actions.apresLancement();
    this.menuModes.fermer();
    this.forcer();
    this.rendreLeFocus();
  }

  rendreLeFocus() {
    const actif = typeof document === 'undefined' ? null : document.activeElement;
    if (actif && actif !== document.body && typeof actif.blur === 'function') actif.blur();
  }

  // MENU (bouton d'un écran de fin, Échap) : l'écran de fin se ferme, la course est nettoyée et
  // attend sur une grille neuve, en pause (formule1.allerAuMenu) ; le panneau s'ouvre sur les
  // réglages, section Mode (mode de jeu, mode pilote) ; la liste « Mode de jeu » prend le focus et
  // s'ouvre si le navigateur le permet (showPicker). Le pilote se choisit au clic.
  menu() {
    this.formule1.allerAuMenu();
    this.panneau.ouvrir('reglages');
    const section = document.getElementById('f1-section-mode');
    if (section) section.open = true;
    this.forcer();
    const liste = document.getElementById('f1-mode');
    if (liste && typeof liste.focus === 'function') liste.focus();
    if (liste && typeof liste.showPicker === 'function') {
      try {
        liste.showPicker();
      } catch {
        // sans geste de l'utilisateur, le navigateur refuse : la liste garde seulement le focus
      }
    }
    return liste;
  }

  // REJOUER (bouton d'un écran de fin, Entrée) : la même course, nettoyée, relancée ; le focus
  // revient au jeu (les touches de conduite ne vont pas au bouton).
  rejouerCourse() {
    this.formule1.recommencer();
    this.forcer();
    this.rendreLeFocus();
  }

  // Tout tout de suite (démarrage, tests).
  forcer() {
    this.tempsTextes = Infinity;
    this.tempsHud = Infinity;
    this.tempsCarte = Infinity;
    this.mettreAJour(0);
  }

  // Caméra suivante (bouton de la barre, touche c) ; le menu du panneau suit.
  cameraSuivante() {
    const camera = this.formule1.camera;
    const modes = Camera.MODES;
    const mode = modes[(modes.indexOf(camera.mode) + 1) % modes.length];
    camera.choisirMode(mode);
    const menu = document.getElementById('f1-camera');
    if (menu) menu.value = mode;
    return mode;
  }

  // Voiture précédente / suivante dans l'ordre du classement (touches [ et ]).
  voisine(sens) {
    const c = this.formule1.course;
    const ordre = c.classement();
    const i = ordre.indexOf(c.selection ?? c.joueur ?? ordre[0]);
    c.selection = ordre[(i + sens + ordre.length) % ordre.length];
    return c.selection;
  }

  // Raccourcis de l'interface. Renvoie vrai si la touche est prise. F (plein écran) marche dans
  // tous les états ; 1 à 5 : les onglets du panneau. En pilotage, seules l'aide (? et h, Échap pour la fermer), la caméra (c) et
  // l'overlay PAUSE passent : les autres touches conduisent.
  touche(key, pilotage = false) {
    const k = String(key).toLowerCase();
    // F avant tout le reste : avant, en pilotage, la touche partait aux commandes de conduite (qui
    // l'ignoraient) et le plein écran ne marchait pas
    if (k === 'f') {
      InterfaceF1.basculerPleinEcran();
      return true;
    }
    if (this.aide.ouverte) {
      if (k === 'escape' || k === '?' || k === 'h') {
        this.aide.fermer();
        return true;
      }
      return false;
    }
    if (k === '?' || k === 'h') {
      this.aide.ouvrir();
      return true;
    }
    // menu des modes ouvert : il prend toutes les touches (← →, Entrée, Échap)
    if (this.menuModes.ouvert) {
      this.menuModes.touche(k);
      this.forcer();
      return true;
    }
    // « Rejouer ? » : Entrée (oui) et Échap (non) vont au scénario ; les autres touches ne font
    // rien (la course est en pause)
    if (this.formule1.confirmationRejouer) {
      if (k === 'enter' || k === 'escape') {
        this.formule1.touche(key);
        this.forcer();
      }
      return true;
    }
    // écrans de fin : Entrée rejoue (podium du championnat : manche suivante, gérée par le
    // scénario), Échap ouvre le menu
    if (['podium', 'rejouer', 'championnat'].includes(this.ecran)) {
      if (k === 'enter' && this.ecran !== 'championnat') {
        this.rejouerCourse();
        return true;
      }
      if (k === 'escape') {
        this.menu();
        return true;
      }
    }
    // overlay PAUSE : ↑/↓, Entrée, P/Échap = Reprendre, R = rejouer
    if (this.menuPause.visible) {
      this.menuPause.touche(k);
      this.forcer();
      return true;
    }
    // C : la vue suivante, même en pilotage (ce n'est pas une commande de conduite)
    if (k === 'c') {
      this.cameraSuivante();
      return true;
    }
    // Entrée, bouton JOUER visible (aucune partie en cours) : le menu des modes ; pas à la fin
    // d'une partie, où Entrée rejoue (écran de fin, ou les secondes qui le précèdent)
    const fin = this.formule1.course.etat === Course.ETATS.FIN;
    if (k === 'enter' && !pilotage && !fin && !this.menuModes.jouer.hidden && ['course', 'depart', 'menu'].includes(this.ecran)) {
      this.ouvrirMenuModes();
      return true;
    }
    if (pilotage) return false;
    const c = this.formule1.course;
    const choixDeVoiture = c.parametres.modePilote && [Course.ETATS.PRESENTATION, Course.ETATS.FEUX].includes(c.etat);
    if (k === 'tab' && !choixDeVoiture) {
      this.panneau.basculer();
      return true;
    }
    if (['1', '2', '3', '4', '5'].includes(k)) {
      this.panneau.ouvrir(PanneauLateral.ONGLETS[Number(k) - 1]);
      return true;
    }
    if (k === 'g') {
      this.formule1.afficher('ecarts', this.formule1.affichage.ecarts === 'leader' ? 'intervalle' : 'leader');
      return true;
    }
    if (k === '[' || k === ']') {
      this.voisine(k === ']' ? 1 : -1);
      return true;
    }
    if (k === '+' || k === '=' || k === '-' || k === '−') {
      this.carte.choisirMode(k === '-' || k === '−' ? 'complet' : 'zoom');
      return true;
    }
    // R : avec un joueur en course, rejouer après confirmation ; sinon, relancer tout de suite
    if (k === 'r') {
      if (!this.formule1.demanderRejouer()) this.formule1.recommencer();
      this.forcer();
      return true;
    }
    if (k === '/') {
      this.panneau.ouvrir('reglages');
      if (typeof this.panneau.recherche.focus === 'function') this.panneau.recherche.focus();
      return true;
    }
    return false;
  }
}
