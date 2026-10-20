// Le jeu « Circuit Formule 1 » (le seul scénario de ce projet) : un contrôleur. Il orchestre
// une image et dessine la scène ; il ne calcule aucune force. Interface :
//   id, libelle        l'identifiant et le nom affiché ;
//   aidesDeVehicle     faux : le jeu dessine ses propres aides de debug (pas celles de vehicle.js) ;
//   update(dt, souris) fait avancer la scène d'une image (dt en secondes, souris = vecteur ou null) ;
//   show(debug)        dessine la scène ;
//   touche(key)        reçoit les touches du clavier, sauf d (debug), gérée par sketch.js ;
//   clic(x, y)         reçoit les clics dans la scène ;
//   redimensionner(largeur, hauteur)  la fenêtre a changé de taille.
const Scenarios = (() => {
  // Scénario « Circuit Formule 1 » : la course (voir course.js), son décor, sa caméra, son
  // habillage, la pluie, et en mode pilote le HUD et l'écran de fin. Le scénario ne calcule
  // aucune force : il fait avancer la Course, transmet les touches du joueur à sa voiture, cadre
  // la caméra et dessine. La course n'est créée qu'à la première image (le calcul du circuit prend
  // un moment).
  //   parametres  l'objet de réglages partagé avec le panneau (Course.parametresParDefaut()) ;
  //   actions     basculerPanneau() (touche s) et largeurPanneau() (place prise à droite) ;
  //   police      la police p5, pour le mot « REJOUER » de l'écran de fin.
  // Décor, caméra, classement, HUD et météo sont des aides de dessin : ils ne bougent rien.
  //
  // Touches en mode pilote (clavier QWERTY), une fois la voiture choisie : flèches ou W A S D
  // pour conduire, Espace = DRS, B = arrêt au stand, 1 à 5 = pneus, P ou Échap = pause (overlay
  // PAUSE de l'interface), R = rejouer (après confirmation : Entrée = oui, Échap = non), Entrée =
  // recommencer à l'écran de fin. Ces touches passent avant d et s (voir pilotage()).
  //
  // Modes de partie (menu JOUER, lancerPartie) : solo (course libre, mode pilote), duo
  // (multijoueur), championnat (mode pilote), spectateur (course libre sans pilote). Ils sont
  // déduits du mode de jeu et du mode pilote (modeJeu) : les réglages « Mode » et « Joueur » du
  // panneau et le menu lisent et écrivent les mêmes valeurs.
  function formule1(parametres, actions = {}, police = null) {
    let course = null;
    let ecranFin = null;
    const camera = new Camera();
    const classement = new Classement();
    const hud = new HudPilote();
    // ambiance (jour, nuit), foule animée (une par décor), effets de vitesse : aides de dessin
    const ambiance = new Ambiance();
    const foules = new Map();
    const effets = new EffetsVitesse();
    // télémétrie et outils de lecture (phase 4) : ils lisent la course, sans rien y changer
    const telemetrie = new Telemetrie();
    const carteChaleur = new CarteChaleur();
    const bulles = new BullesRadio();
    const prediction = new Prediction();
    const historique = new HistoriquePositions();
    const miniCarte = new MiniCarte();
    // modes de jeu (phase 5) : course libre, manager, défi, championnat, multijoueur
    let mode = 'course';
    let manager = null;
    let defi = null;
    let resultatDefi = null;
    let etoilesDefis = Defis.charger(actions.stockage ?? null);
    let championnat = null;
    let podium = null;
    // le mode pilote du panneau avant un défi ou le multijoueur (qui l'imposent), rétabli ensuite
    let modePiloteAvant = null;
    // écran partagé : le prochain clic de choix de voiture va à J1 (0) ou à J2 (1)
    let prochainJoueur = 0;
    // le menu ouvert depuis un écran de fin (voir allerAuMenu)
    let menu = false;
    // « Rejouer ? » (touche R, encart, menu pause) : null, ou { pauseAvant } pendant la
    // confirmation (la course est en pause)
    let confirmation = null;
    // encarts « Rejouer » après la remise en piste d'un joueur (non bloquants) : joueur → { type,
    // penalite, age, tour } ; reprises de la course déjà vues
    const encarts = new Map();
    let reprisesVues = 0;
    let numeroVu = null;
    // la course (numéro) dont le départ a déjà remis la caméra sur la voiture du joueur
    let cameraDepart = null;
    const partage = new EcranPartage();
    const fouleDe = decor => {
      if (!foules.has(decor)) foules.set(decor, new Foule(decor));
      return foules.get(decor);
    };
    // options d'affichage (cases du panneau), partagées avec la course dès qu'elle existe
    const affichage = { decor: true, classement: true, gomme: true, fumee: true, ombres: true, drone: true, ecarts: 'leader', etincelles: true,
      qualite: Ambiance.QUALITE, traces: true, poussiere: true, billes: true, foule: true, lignesVitesse: true,
      moment: Ambiance.MOMENT, dureeCycle: Ambiance.DUREE_CYCLE,
      telemetrie: true, comparaison: Telemetrie.COMPARAISON, carteChaleur: false, radio: true, prediction: true, historique: false,
      miniCarte: true, qualiteAuto: true, compteurFps: false };
    // l'affichage de départ (bouton Réinitialiser)
    const AFFICHAGE_DEFAUT = Object.freeze({ ...affichage });
    // un décor par circuit, partagé avec la course (ses placements servent à la physique) :
    // changer de profil puis revenir ne le redessine pas
    // touches de conduite enfoncées (en minuscules ; les flèches gardent leur nom)
    const enfoncees = new Set();
    const COMMANDES = {
      haut: ['arrowup', 'w'], bas: ['arrowdown', 's'], gauche: ['arrowleft', 'a'], droite: ['arrowright', 'd'], drs: [' '],
    };

    const preparer = () => {
      if (course === null) {
        course = new Course(parametres);
        course.affichage = affichage;
      }
      return course;
    };
    const decorDe = circuit => Course.decor(circuit);
    // la partie de l'écran où l'on voit le circuit : sans la tour de classement ni le panneau
    // avec l'interface HTML (actions.zoneScene), la zone vient de ses ancrages (InterfaceF1.zoneScene)
    const zone = () => {
      if (actions.zoneScene) return actions.zoneScene();
      const gauche = affichage.classement ? Classement.LARGEUR : 0;
      const droite = actions.largeurPanneau ? actions.largeurPanneau() : 0;
      return { x: gauche + 10, y: 56, largeur: Math.max(50, width - gauche - droite - 20), hauteur: Math.max(50, height - 100) };
    };
    // Interface HTML : vue d'ensemble cadrée sur le circuit, hors de la mini-carte et du HUD
    // (recalculée seulement quand la zone, l'interface posée sur la scène ou le circuit change).
    let cleCadrage = null;
    const cadrer = c => {
      if (!actions.zoneScene) return;
      const z = zone();
      const eviter = actions.zonesOccupees ? actions.zonesOccupees() : [];
      const cle = JSON.stringify([z, eviter, c.circuit.profil, c.circuit.graine]);
      if (cle === cleCadrage) return;
      cleCadrage = cle;
      camera.cadrer(Camera.cadrerCircuit(z, c.circuit, { eviter }));
    };
    // Ce qui reste d'une course finie : écran REJOUER, podium du championnat et ses confettis,
    // note du défi, touches tenues, menu. Nettoyé avant toute nouvelle course (relancer, rejouer,
    // manche suivante, menu) ; la course elle-même (voitures, particules) est refaite par
    // nouvelleCourse(), l'interface repart de zéro en voyant son numéro changer.
    const nettoyer = () => {
      ecranFin = null;
      podium = null;
      resultatDefi = null;
      menu = false;
      confirmation = null;
      encarts.clear();
      enfoncees.clear();
    };
    // Relancer / rejouer / nouvelle course : la même course, de zéro, sans pause. En championnat,
    // une manche déjà enregistrée est recourue : son résultat est retiré (pas compté deux fois).
    const recommencer = () => {
      const c = preparer();
      nettoyer();
      if (championnat !== null) championnat.annulerManche();
      c.nouvelleCourse();
      c.pause = false;
    };
    // Menu (écran de fin) : la course est nettoyée et remise sur une grille neuve, en pause, sans
    // départ ; en mode pilote, le pilote est à choisir de nouveau (au clic). Le menu se ferme dès
    // que la course repart (pause levée) ou qu'un pilote est choisi.
    const allerAuMenu = () => {
      const c = preparer();
      nettoyer();
      if (championnat !== null) championnat.annulerManche();
      if (c.parametres.modePilote && mode !== 'defi' && mode !== 'multijoueur') c.oublierJoueur();
      else c.nouvelleCourse();
      c.pause = true;
      menu = true;
    };
    // Défi : ses réglages, sa place de grille (pilote) ou l'écurie dirigée (manager).
    const lancerDefi = id => {
      const d = Defis.defi(id);
      const c = preparer();
      mode = 'defi';
      defi = d;
      resultatDefi = null;
      ecranFin = null;
      podium = null;
      championnat = null;
      enfoncees.clear();
      if (modePiloteAvant === null) modePiloteAvant = c.parametres.modePilote;
      Object.assign(c.parametres, d.reglages);
      c.ecurieGeree = null;
      manager = null;
      if (d.mode === 'pilote') {
        c.parametres.modePilote = true;
        c.rangJoueur2 = null;
        c.nouvelleCourse();
        c.choisirJoueur(Defis.rangDeGrille(d, c.parametres.nombreVoitures));
      } else {
        c.parametres.modePilote = false;
        c.rangJoueur = null;
        manager = new Manager(c, Course.ECURIES[0]);
        c.nouvelleCourse();
      }
    };
    // Changement de mode : chaque mode repart d'une course neuve.
    const choisirMode = nouveau => {
      if (!Course.MODES_JEU.includes(nouveau)) throw new RangeError(`Mode de jeu inconnu : ${nouveau}.`);
      const c = preparer();
      mode = nouveau;
      prochainJoueur = 0;
      manager = null;
      defi = null;
      resultatDefi = null;
      championnat = null;
      podium = null;
      ecranFin = null;
      enfoncees.clear();
      c.ecurieGeree = null;
      c.rangJoueur2 = null;
      c.rangJoueur = null;
      c.joueursAttendus = 1;
      if (modePiloteAvant !== null) {
        c.parametres.modePilote = modePiloteAvant;
        modePiloteAvant = null;
      }
      if (nouveau === 'manager') {
        c.parametres.modePilote = false;
        c.rangJoueur = null;
        manager = new Manager(c);
        c.nouvelleCourse();
      } else if (nouveau === 'championnat') {
        championnat = new Championnat();
        c.regler('profil', championnat.mancheCourante);
      } else if (nouveau === 'multijoueur') {
        modePiloteAvant = c.parametres.modePilote;
        const n = c.parametres.nombreVoitures;
        c.choisirJoueurs(n - 2, n - 1);
      } else if (nouveau === 'defi') {
        lancerDefi(Defis.LISTE[0].id);
      } else {
        c.nouvelleCourse();
      }
    };
    // Le mode de partie (menu JOUER) déduit du mode de jeu et du mode pilote : 'solo', 'duo',
    // 'championnat', 'spectateur' ; 'manager' et 'defi' (panneau seulement) gardent leur nom.
    const modeJeu = () => {
      if (mode === 'multijoueur') return 'duo';
      if (mode === 'manager' || mode === 'defi') return mode;
      if (mode === 'championnat') return 'championnat';
      const pilote = Boolean(course !== null ? course.parametres.modePilote : parametres.modePilote);
      return pilote ? 'solo' : 'spectateur';
    };
    // Lancer une partie (bouton Lancer du menu JOUER ; circuit, tours et ambiance sont réglés avant
    // par l'interface, par les mêmes chemins que le panneau). Une course neuve, sans pause ; en
    // pilote, elle attend le choix de la voiture au curseur (deux joueurs : J1 puis J2), vue du
    // circuit ; puis les feux.
    const MODES_PARTIE = { solo: 'course', duo: 'multijoueur', championnat: 'championnat', spectateur: 'course' };
    const lancerPartie = ({ mode: m } = {}) => {
      if (!Object.hasOwn(MODES_PARTIE, m)) throw new RangeError(`Mode de partie inconnu : ${m}.`);
      const c = preparer();
      nettoyer();
      choisirMode(MODES_PARTIE[m]);
      if (m === 'duo') {
        // les deux joueurs choisissent leur voiture : aucune n'est donnée d'avance
        c.oublierJoueur();
        c.joueursAttendus = 2;
      } else {
        c.parametres.modePilote = m !== 'spectateur';
        c.rangJoueur = null;
        c.nouvelleCourse();
      }
      prochainJoueur = 0;
      cameraDepart = null;
      camera.choisirMode('circuit');
      c.pause = false;
      return true;
    };
    // Une partie se joue : un pilote (ou le choix de sa voiture) et la course pas finie. Sinon le
    // bouton JOUER est proposé (spectateur, fin de course, manager).
    const partieEnCours = () => course !== null && course.parametres.modePilote && mode !== 'manager' &&
      course.etat !== Course.ETATS.FIN && podium === null && resultatDefi === null && !menu;

    // Championnat : la manche suivante (ou un nouveau championnat après la dernière).
    const mancheSuivante = () => {
      if (championnat === null || !championnat.mancheEnregistree) return false;
      if (championnat.termine) championnat = new Championnat();
      else championnat.suivante();
      nettoyer();
      const c = preparer();
      c.regler('profil', championnat.mancheCourante);
      c.pause = false;
      return true;
    };
    // Rejouer (touche R, bouton de l'encart, menu pause) : une confirmation d'abord, la course en
    // pause pendant ce temps ; Entrée relance la même course (ou la même manche) depuis le départ,
    // nettoyée (recommencer) ; Échap rend la course telle qu'elle était (en pause ou non).
    const demanderRejouer = () => {
      const c = preparer();
      if (c.joueur === null || c.etat === Course.ETATS.FIN || confirmation !== null || menu) return false;
      confirmation = { pauseAvant: c.pause };
      c.pause = true;
      enfoncees.clear();
      return true;
    };
    const confirmerRejouer = () => {
      if (confirmation === null) return false;
      confirmation = null;
      recommencer();
      return true;
    };
    const annulerRejouer = () => {
      if (confirmation === null) return false;
      preparer().pause = confirmation.pauseAvant;
      confirmation = null;
      return true;
    };
    // Les encarts « Rejouer » : un par reprise de contrôle après un incident ; ils partent après
    // EncartRejouer.DUREE s de course (pas en pause), au tour suivant du joueur, ou fermés (✕).
    const suivreLesEncarts = (c, dt) => {
      if (c.numeroCourse !== numeroVu) {
        numeroVu = c.numeroCourse;
        reprisesVues = 0;
        encarts.clear();
      }
      while (reprisesVues < c.reprises.length) {
        const r = c.reprises[reprisesVues++];
        encarts.set(r.joueur, { type: r.type, penalite: r.penalite, age: 0, tour: r.joueur.tour });
      }
      for (const [j, e] of encarts) {
        if (!c.pause) e.age += dt;
        if (e.age >= EncartRejouer.DUREE || j.tour !== e.tour || !c.joueurs.includes(j)) encarts.delete(j);
      }
    };
    // Mélange des palettes de la scène : nuit (selon l'obscurité du moment) et pluie (selon
    // l'humidité de la piste), de 0 à 1 ; theme = la palette dominante (voitures, interface).
    const melangeTheme = c => {
      const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const nuit = lisse(0.35, 0.65, ambiance.obscurite(affichage.moment));
      const pluie = lisse(0.15, 0.5, c.meteo.humidite);
      return { nuit, pluie, theme: nuit >= 0.5 ? 'nuit' : pluie >= 0.5 ? 'pluie' : 'jour' };
    };
    // Palettes du décor déjà préparées aux deux résolutions, par course (« numéro|palette »).
    const prechauffes = new Set();
    // Le monde, vu par une caméra (une fois, ou une fois par joueur en écran partagé).
    const dessinerMonde = (c, cam, debug) => {
      const fouleAnimee = affichage.foule && affichage.qualite !== 'bas';
      const decor = decorDe(c.circuit);
      const ensemble = camera.ensemble ?? Camera.vueEnsemble(zone(), c.circuit.largeurMonde, c.circuit.hauteurMonde);
      const facteur = DecorCircuit.facteurPour(ensemble.echelle * (cam.mode === 'suivi' ? Camera.ZOOM_SUIVI : 1));
      // palettes de la scène (jour, nuit, pluie) : fondu pendant les transitions, une seule copie
      // du décor le reste du temps
      const m = melangeTheme(c);
      const options = {
        facteur,
        gomme: affichage.gomme,
        ombres: affichage.ombres,
        couleurs: c.couleursDesBoxes(),
        foule: !fouleAnimee,
        textesSol: Math.min(width / 1920, height / 1080) >= 0.75,
      };
      if (affichage.decor) {
        const couches = [];
        if (m.nuit < 1) {
          couches.push(['jour', 1]);
          if (m.pluie > 0) couches.push(['pluie', m.pluie]);
        }
        if (m.nuit > 0) couches.push(['nuit', m.nuit]);
        // la couche du dessus reste la palette courante (foule, éléments en hauteur)
        const visibles = couches[couches.length - 1][1] >= 1 ? couches.slice(-1) : couches;
        // au lancement de chaque course : chaque palette visible est préparée aux deux résolutions
        // (vue d'ensemble, suivi zoomé) ; changer de caméra ensuite ne redessine rien
        const facteurs = new Set([DecorCircuit.facteurPour(ensemble.echelle), DecorCircuit.facteurPour(ensemble.echelle * Camera.ZOOM_SUIVI)]);
        visibles.forEach(([palette]) => {
          const cle = `${c.numeroCourse}|${palette}`;
          if (prechauffes.has(cle)) return;
          prechauffes.add(cle);
          facteurs.forEach(f => decor.preparer({ ...options, facteur: f, palette }));
        });
        visibles.forEach(([palette, opacite], k) => {
          decor.preparer({ ...options, palette });
          // vue d'ensemble : l'herbe continue au-delà du bord du monde
          if (k === 0 && cam.modeEffectif === 'circuit') decor.showAbords();
          decor.show(opacite);
        });
      } else {
        decor.showSimple();
      }
      if (affichage.carteChaleur) carteChaleur.show();
      // drapeau jaune : le secteur clignote sur la piste
      if (c.incidents) decor.showSecteursJaunes(c.incidents.secteursJaunes, ambiance.horloge);
      c.show(debug, { theme: m.theme });
      if (fouleAnimee) fouleDe(decor).show();
      // éléments en hauteur (portique des feux, passerelle) : au-dessus des voitures
      if (affichage.decor) {
        const feux = c.etat === Course.ETATS.FEUX ? c.feux : 0;
        const vert = c.etat === Course.ETATS.COURSE && c.chronoEtat < Course.DUREE_FEUX_VERTS;
        decor.showEnHauteur({ ombres: affichage.ombres, feux, vert });
      }
      // la nuit : voile (sous la palette de nuit, seulement le crépuscule), projecteurs, phares
      // et feux (lumières précalculées)
      ambiance.showMonde(c, decor, affichage.moment, affichage.qualite, { voile: 1 - m.nuit });
      if (affichage.radio) bulles.show(c, cam.echelle);
    };
    // Choix d'une voiture (clic sur la piste, sur sa ligne du classement ou sur la mini-carte).
    // Mode pilote, avant le départ (présentation ou feux, même en pause) : elle devient la voiture
    // du joueur (la grille est reformée, l'ancienne voiture du joueur retourne à l'IA). Deux
    // joueurs : les clics vont à J1 puis à J2, à tour de rôle ; une voiture déjà prise par l'autre
    // est refusée. Défi : la voiture est imposée par le défi. Sinon (spectateur, ou course
    // partie) : la voiture est seulement choisie et suivie. Renvoie 'pilote', 'refus' ou 'suivie'.
    const choisirVoiture = voiture => {
      const c = preparer();
      const { PRESENTATION, FEUX } = Course.ETATS;
      const avantDepart = [PRESENTATION, FEUX].includes(c.etat);
      if (voiture !== null && avantDepart && c.parametres.modePilote && mode !== 'defi') {
        const rang = c.voitures.indexOf(voiture);
        if (mode === 'multijoueur' && !c.multijoueur) {
          // deux joueurs, choix au curseur : J1 d'abord (sa voiture seule), puis J2
          if (c.joueur !== null && prochainJoueur === 1) {
            if (rang === c.rangJoueur) {
              c.evenement(`${voiture.pilote.code} est déjà pris par J1`);
              return 'refus';
            }
            c.choisirJoueurs(c.rangJoueur, rang);
            prochainJoueur = 0;
          } else {
            c.choisirJoueur(rang);
            prochainJoueur = 1;
          }
        } else if (c.multijoueur) {
          const autre = prochainJoueur === 0 ? c.rangJoueur2 : c.rangJoueur;
          if (rang === autre) {
            c.evenement(`${voiture.pilote.code} est déjà pris par J${2 - prochainJoueur}`);
            return 'refus';
          }
          if (prochainJoueur === 0) c.choisirJoueurs(rang, c.rangJoueur2);
          else c.choisirJoueurs(c.rangJoueur, rang);
          prochainJoueur = 1 - prochainJoueur;
        } else {
          c.choisirJoueur(rang);
        }
        enfoncees.clear();
        // depuis le menu : le pilote est choisi, la course peut partir
        if (menu) {
          menu = false;
          c.pause = false;
        }
        return 'pilote';
      }
      c.selection = voiture;
      return 'suivie';
    };
    // La voiture sous un point de l'écran (rayon de 40 px à l'écran), ou null.
    const voitureSous = (x, y) => {
      const point = camera.versMonde(x, y);
      return preparer().voitureEn(point.x, point.y, 40 / Math.max(0.2, camera.echelle));
    };
    const commandes = () => Object.fromEntries(Object.entries(COMMANDES)
      .map(([nom, touches]) => [nom, touches.some(t => enfoncees.has(t))]));
    // le joueur pilote : sa voiture est choisie et la partie n'est pas finie (pendant la séquence
    // d'un incident, ses touches sont prises mais la voiture ne lui obéit plus ; pas pendant la
    // confirmation « Rejouer ? »)
    const pilotage = () => course !== null && course.joueur !== null && course.etat !== Course.ETATS.FIN && confirmation === null;
    // La fenêtre perd le focus (changement d'onglet...) pendant qu'on joue : pause automatique.
    const pauseAuto = () => {
      enfoncees.clear();
      if (!pilotage() || course.pause) return false;
      course.pause = true;
      return true;
    };

    return {
      id: 'f1',
      libelle: 'Circuit Formule 1',
      aidesDeVehicle: false,
      camera,
      affichage,
      get affichageParDefaut() {
        return AFFICHAGE_DEFAUT;
      },
      get course() {
        return preparer();
      },
      // la course existe-t-elle déjà ? (sans la créer)
      get demarre() {
        return course !== null;
      },
      get ecranFin() {
        return ecranFin;
      },
      // vrai quand les touches de conduite passent avant les raccourcis (d, s) de sketch.js
      pilotage,
      pauseAuto,
      // modes de partie (menu JOUER) : 'solo', 'duo', 'championnat', 'spectateur' (ou 'manager', 'defi')
      get modeJeu() {
        return modeJeu();
      },
      get partieEnCours() {
        return partieEnCours();
      },
      lancerPartie,
      // horloges des effets dessinés (figées en pause) : ambiance, effets de vitesse, foule, plan TV
      get horloges() {
        return { ambiance: ambiance.horloge, effets: effets.horloge, foules: [...foules.values()].map(f => f.horloge), plan: camera.plan.temps };
      },
      // modes de jeu
      get mode() {
        return mode;
      },
      get manager() {
        return manager;
      },
      get defi() {
        return defi;
      },
      get resultatDefi() {
        return resultatDefi;
      },
      get etoilesDefis() {
        return etoilesDefis;
      },
      get championnat() {
        return championnat;
      },
      get podium() {
        return podium;
      },
      // pour l'interface HTML : les mesures de télémétrie, l'obscurité de l'ambiance (0 à 1)
      get telemetrie() {
        return telemetrie;
      },
      get obscurite() {
        return ambiance.obscurite(affichage.moment);
      },
      partage,
      choisirVoiture,
      allerAuMenu,
      // le menu (depuis un écran de fin) est ouvert : grille neuve, en pause, avant le départ
      get enMenu() {
        return menu && course !== null && course.pause && course.etat === Course.ETATS.PRESENTATION;
      },
      // le prochain clic de choix en écran partagé : 0 = J1, 1 = J2
      get prochainJoueur() {
        return prochainJoueur;
      },
      // survol : une voiture sous le curseur (la scène montre alors une main)
      survol(x, y) {
        return course !== null && voitureSous(x, y) !== null;
      },
      choisirMode,
      lancerDefi,
      mancheSuivante,
      // rejouer avec confirmation (touche R, encart, menu pause)
      demanderRejouer,
      confirmerRejouer,
      annulerRejouer,
      get confirmationRejouer() {
        return confirmation !== null;
      },
      // encarts « Rejouer » affichés : [{ joueur, indice (0 : J1, 1 : J2), type, penalite, age }]
      get encarts() {
        return [...encarts].map(([joueur, e]) => ({ joueur, indice: course === null ? 0 : course.joueurs.indexOf(joueur), ...e }));
      },
      fermerEncart(joueur) {
        return encarts.delete(joueur);
      },

      update(dt) {
        const c = preparer();
        // en pause, tout ce qui dépend du temps est figé (la course ne joue aucun pas ; les effets,
        // l'ambiance, la foule, le podium, la réalisation TV reçoivent 0) ; seule la caméra peut
        // encore glisser vers une autre vue
        const dtJeu = c.pause ? 0 : dt;
        // les murs du décor servent à détecter les accidents du joueur
        c.murs = decorDe(c.circuit).murs;
        if (c.multijoueur) c.joueurs.forEach((j, k) => j.commander(EcranPartage.commandes(k, enfoncees)));
        else if (c.joueur !== null) c.joueur.commander(commandes());
        c.avancer(dt);
        // écran de fin : le mot REJOUER se forme à l'arrivée en défi et en multijoueur, depuis la ligne
        // (en championnat, l'écran de fin est le podium du championnat : un seul écran à la fois)
        // (un incident ne finit jamais la course : la voiture est remise en piste)
        suivreLesEncarts(c, dt);
        const finAvecRejouer = mode === 'defi' || mode === 'multijoueur';
        if (c.etat === Course.ETATS.FIN && finAvecRejouer && ecranFin === null) {
          // repère de l'écran : les points naissent sur la ligne d'arrivée (au centre en écran partagé)
          const lieu = c.circuit.pointLateral(0, 0);
          const origine = c.multijoueur ? { x: width / 2, y: height / 2 } : camera.versEcran(lieu.x, lieu.y);
          ecranFin = new EcranFin(width, height, origine, c.alea);
        }
        // défi : noté à la fin (pilote : fin de partie ; manager : tout le monde arrivé)
        if (mode === 'defi' && defi !== null && resultatDefi === null &&
          ((defi.mode === 'pilote' && c.etat === Course.ETATS.FIN) || (defi.mode === 'manager' && c.terminee))) {
          const etoiles = defi.etoiles(Defis.bilan(c));
          etoilesDefis = Defis.enregistrer(actions.stockage ?? null, etoilesDefis, defi.id, etoiles);
          resultatDefi = { id: defi.id, titre: defi.titre, etoiles };
        }
        // championnat : la manche est enregistrée à l'arrivée de tous, puis le podium
        if (mode === 'championnat' && championnat !== null && !championnat.mancheEnregistree && (c.terminee || c.etat === Course.ETATS.FIN)) {
          championnat.enregistrer(c);
          podium = new Podium(championnat.resultats.at(-1).lignes, championnat, width, height);
        }
        if (podium !== null) podium.update(dtJeu);
        if (c.etat !== Course.ETATS.FIN) ecranFin = null;
        if (ecranFin !== null && !c.pause) {
          // la taille de l'écran a changé : nouvelles cases, les points repartent vers elles
          ecranFin.adapter(width, height);
          ecranFin.applyBehaviors();
          ecranFin.update();
        }
        // Solo et championnat : au départ de chaque course (les feux), la caméra suit la voiture du
        // joueur ; C et le bouton changent ensuite de vue librement
        const jeuSuivi = (mode === 'course' || mode === 'championnat') && c.joueur !== null && !c.multijoueur;
        if (jeuSuivi && c.etat === Course.ETATS.FEUX && cameraDepart !== c.numeroCourse) {
          cameraDepart = c.numeroCourse;
          camera.choisirMode('suivi');
        }
        const suivie = c.selection ?? c.joueur ?? c.leader;
        const vitesseMax = c.parametres.vitesseMax;
        const surVoiture = ['suivi', 'embarquee'].includes(camera.modeEffectif);
        effets.update(dtJeu, surVoiture && !c.multijoueur ? suivie : null, vitesseMax);
        if (c.multijoueur) partage.update(dt, c, zone());
        cadrer(c);
        const vitesseRelative = suivie === null ? 0 : Math.min(1, suivie.vitesse / Math.max(0.1, vitesseMax));
        camera.suivre(zone(), c.circuit.largeurMonde, c.circuit.hauteurMonde, suivie, dt, {
          drone: c.drone,
          vitesseRelative,
          secousse: effets.secousse(),
          // mode jeu : le centre passe devant la voiture du joueur (le virage suivant est en vue) ;
          // le lissage de la caméra la laisse traîner de v / LISSAGE derrière une cible qui roule
          // (v en px par seconde : vitesse par pas / PAS_TEMPS) : ce retard est rattrapé
          avance: jeuSuivi && suivie === c.joueur
            ? Camera.AVANCE_JEU * vitesseRelative + suivie.vitesse * c.parametres.vitesseSimulation / (Course.PAS_TEMPS * Camera.LISSAGE) : 0,
          dtPlan: dtJeu,
        });
        ambiance.update(dtJeu, affichage.dureeCycle);
        if (affichage.foule && affichage.qualite !== 'bas') fouleDe(decorDe(c.circuit)).update(dtJeu, c);
        // les mesures continuent même panneau masqué : le recocher montre tout l'historique
        telemetrie.update(c);
        historique.update(c);
        if (!c.pause) carteChaleur.update(dt, c);
      },

      show(debug) {
        const c = preparer();
        // fond : l'herbe de la palette (le circuit cadré peut laisser voir le bord du monde)
        const m = melangeTheme(c);
        background(...DecorCircuit.rgb(DecorCircuit.PALETTES[m.theme].herbeA));
        // la nuit : un ciel plus sombre et des étoiles autour du monde
        const obscurite = ambiance.obscurite(affichage.moment);
        if (obscurite > 0.01) {
          push();
          noStroke();
          fill(6, 10, 26, 230 * obscurite);
          rect(0, 0, width, height);
          pop();
        }
        ambiance.showCiel(width, height, affichage.moment);
        if (c.multijoueur) {
          partage.show(c, zone(), cam => dessinerMonde(c, cam, debug), { hud: !actions.interfaceHtml });
        } else {
          push();
          camera.appliquer();
          dessinerMonde(c, camera, debug);
          pop();
        }
        if (affichage.lignesVitesse && !c.multijoueur) effets.show(zone());
        ambiance.showEcran(width, height, affichage.qualite, 0.2 + 0.5 * effets.intensite, m.theme);
        c.meteo.show(width, height, affichage.qualite);
        // interface HTML (actions.interfaceHtml) : tour, en-tête, bandeau, HUD, prédiction,
        // historique et télémétrie sont des éléments de la page ; restent ici les feux et la pause
        const html = Boolean(actions.interfaceHtml);
        classement.show(c, width, height, affichage.classement && !html, { entete: !html, bandeau: !html, feux: !html });
        // outils de lecture : à droite de la zone, l'un sous l'autre ; la télémétrie en bas
        const z = zone();
        let y = z.y + 4;
        const droite = z.x + z.largeur;
        if (affichage.miniCarte && !html) {
          miniCarte.show(c, droite - MiniCarte.TAILLE - 4, y);
          y += MiniCarte.TAILLE + 6;
        }
        // écran partagé : la mini-carte seulement (le reste couvrirait la vue de J2)
        if (affichage.prediction && !c.multijoueur && !html) y += prediction.show(c, droite - Prediction.LARGEUR - 4, y) + 6;
        if (affichage.historique && !c.multijoueur && !html) historique.show(c, droite - HistoriquePositions.LARGEUR - 4, y);
        if (affichage.telemetrie && !c.multijoueur && !html) telemetrie.show(c, z, affichage.comparaison);
        if (manager !== null) manager.show(c, z.x + 8, z.y + 4);
        if (!c.multijoueur && !html) hud.show(c, width, height);
        Defis.show(resultatDefi, width, height);
        // écran REJOUER : dans le repère de l'écran, hors de la caméra (centré sur l'écran)
        if (ecranFin !== null) ecranFin.show();
        if (podium !== null) podium.show();
      },

      // Touches. Renvoie false pour empêcher l'action du navigateur (Tab, Espace, flèches).
      touche(key) {
        const c = preparer();
        const k = String(key).toLowerCase();
        const { PRESENTATION, FEUX, FIN } = Course.ETATS;
        // « Rejouer ? » : Entrée = oui, Échap = non ; rien d'autre
        if (confirmation !== null) {
          if (k === 'enter') confirmerRejouer();
          if (k === 'escape') annulerRejouer();
          return false;
        }
        if (k === 'enter' && podium !== null) {
          mancheSuivante();
          return false;
        }
        if (k === 'enter' && c.etat === FIN) {
          recommencer();
          return false;
        }
        // multijoueur : chaque touche appartient à un joueur (voir EcranPartage.TOUCHES)
        if (c.multijoueur && pilotage()) {
          if (k === 'r') {
            demanderRejouer();
            return false;
          }
          const a = EcranPartage.action(k);
          if (a !== null) {
            const j = c.joueurs[a.joueur];
            if (a.action === 'stand') j.demanderArret();
            else if (a.action === 'pneus') j.choisirPneus(EcranPartage.pneusSuivants(j));
            else enfoncees.add(k);
          }
          if (k === 'p' || k === 'escape') c.basculerPause();
          return false;
        }
        if (k === 'tab' && c.parametres.modePilote && [PRESENTATION, FEUX].includes(c.etat)) {
          c.joueurSuivant();
          return false;
        }
        if (pilotage()) {
          if (Object.values(COMMANDES).some(touches => touches.includes(k))) {
            enfoncees.add(k);
            return false;
          }
          if (k === 'r') {
            demanderRejouer();
            return false;
          }
          // B : arrêt au stand (P est la pause, comme en spectateur)
          if (k === 'b') c.joueur.demanderArret();
          if (VoiturePilote.TOUCHES_PNEUS[k]) c.joueur.choisirPneus(VoiturePilote.TOUCHES_PNEUS[k]);
          if (k === 'p' || k === 'escape') c.basculerPause();
          return false;
        }
        if (k === 'p' || k === 'escape') c.basculerPause();
        if (k === 's' && actions.basculerPanneau) actions.basculerPanneau();
        return true;
      },

      // Une touche relâchée : la commande s'arrête.
      relacher(key) {
        enfoncees.delete(String(key).toLowerCase());
      },

      // La fenêtre perd le focus : plus aucune touche n'est tenue enfoncée.
      relacherTout() {
        enfoncees.clear();
      },

      // clic : sur le mot REJOUER formé, une nouvelle partie ; avant le départ en mode pilote, le
      // choix de la voiture ; sinon la voiture sous la souris est choisie (la caméra peut la
      // suivre), ou désélectionnée
      clic(x, y) {
        const c = preparer();
        if (affichage.telemetrie && telemetrie.clic(x, y)) return;
        // le mot REJOUER est dans le repère de l'écran
        if (ecranFin !== null && ecranFin.clicRejoue(x, y)) {
          recommencer();
          return;
        }
        choisirVoiture(voitureSous(x, y));
      },

      // boutons du panneau
      recommencer,
      choisirUneAutreVoiture() {
        preparer().oublierJoueur();
        ecranFin = null;
        enfoncees.clear();
      },

      // un réglage du panneau : appliqué à la course si elle existe, sinon gardé pour elle
      regler(cle, valeur) {
        if (course !== null) course.regler(cle, valeur);
        else parametres[cle] = valeur;
      },

      afficher(cle, valeur) {
        if (!Object.hasOwn(affichage, cle)) throw new RangeError(`Option d'affichage inconnue : ${cle}.`);
        affichage[cle] = valeur;
      },

      // le monde du circuit ne dépend pas de la fenêtre : la caméra recadre à l'image suivante ;
      // l'écran REJOUER (repère de l'écran) recalcule ses cases
      redimensionner(largeur, hauteur) {
        if (ecranFin !== null) ecranFin.adapter(largeur, hauteur);
      },
    };
  }

  return { formule1 };
})();
