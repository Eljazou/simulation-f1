// Course : le directeur de course du scénario « Circuit Formule 1 ». Il ne bouge pas, ce n'est
// donc pas un Vehicle : il ne calcule aucune force. Il possède le circuit et les véhicules
// (voitures, safety car, drone, fumées), leur fournit ce qu'ils perçoivent (voisins trouvés par
// la grille spatiale, véhicule qui précède sur la piste), compte les tours, décide des arrêts au
// stand, des incidents, de la safety car et des drapeaux. Le temps de course, les écarts, le
// classement et l'arrivée sont confiés au Chronometrage (chronometrage.js), démarré à
// l'extinction des feux.
//
// États :
//   PRESENTATION  les voitures rejoignent leur place sur la grille (arrive) ;
//   FEUX          les 5 feux rouges s'allument un par un (INTERVALLE_FEUX), puis s'éteignent
//                 ensemble après une attente tirée au hasard (0,5 à 3 s) : départ ;
//   COURSE        tours, dépassements, arrêts au stand ;
//   SAFETY_CAR    incident ou bouton : la safety car sort, les voitures se rangent derrière
//                 elle ; après DUREE_SAFETY_CAR elle rentre, la course reprend quand elle entre
//                 dans la voie des stands ;
//   VSC           voiture de sécurité virtuelle (voir incidents.js) : même profil réduit pour
//                 tous, les écarts sont gardés ;
//   RELANCE       la safety car est rentrée : relance en accordéon (voir incidents.js) ;
//   ARRIVEE       le premier a bouclé le dernier tour (selon le chronométrage) : drapeau à
//                 damier ; chaque voiture le reçoit à son prochain passage de la ligne, fait un
//                 tour de décélération puis rentre au garage. Son résultat est alors figé.
// Une image : decide() (perception, transitions), applyBehaviors() (chaque véhicule calcule et
// applique ses forces), update(dt) (temps, locomotion, règles de scène). La physique avance par
// pas fixes de PAS_TEMPS secondes ; la vitesse de simulation change le nombre de pas par image.
class Course {
  static ETATS = { PRESENTATION: 'PRESENTATION', FEUX: 'FEUX', COURSE: 'COURSE', SAFETY_CAR: 'SAFETY_CAR',
    ARRIVEE: 'ARRIVEE', FIN: 'FIN', VSC: 'VSC', RELANCE: 'RELANCE' };

  // Valeurs de départ du panneau (voir reglagesF1.js).
  static NOMBRE_VOITURES = 12;
  static NOMBRE_TOURS = 5;
  static NOMBRE_ECURIES = 6;
  static PROFIL = 'classique';
  static VITESSE_SIMULATION = 1;

  // Durées, en secondes.
  static DUREE_PRESENTATION = 2.5;
  // Dessin : les feux du portique passent au vert pendant cette durée après le départ (secondes ;
  // la même que les feux de l'interface, FeuxDepart.DUREE_VERT).
  static DUREE_FEUX_VERTS = 1;
  static INTERVALLE_FEUX = 1;
  static ATTENTE_FEUX_MIN = 0.5;
  static ATTENTE_FEUX_MAX = 3;
  static DUREE_SAFETY_CAR = 20;
  static DUREE_EVENEMENT = 5;
  // Pas de la physique (secondes) et nombre maximal de pas par image (vitesse x4 à 30 images/s).
  static PAS_TEMPS = 1 / 60;
  static PAS_MAX = 8;
  // Probabilité, par voiture et par seconde de course, d'un incident léger.
  static PROBA_INCIDENT = 0.0008;
  // Les voitures naissent RECUL_PRESENTATION pixels derrière leur place, puis la rejoignent.
  static RECUL_PRESENTATION = 40;
  // Fumée : nombre maximal de nuages, vitesse minimale pour en produire, élan donné au nuage.
  static FUMEES_MAX = 160;
  static VITESSE_FUMEE = 2;
  static ELAN_FUMEE = 0.5;
  // Étincelles du fond plat : nombre maximal, part de la vitesse maximale au-delà de laquelle le
  // plancher frotte (au freinage ou sur un vibreur), élan.
  static ETINCELLES_MAX = 120;
  // Poussière (herbe, gravier) et billes de gomme (« marbles ») : nombres maximaux ; probabilité,
  // par voiture et par pas, de semer une bille quand ses pneus sont entamés.
  static POUSSIERE_MAX = 120;
  static BILLES_MAX = 220;
  static PROBA_BILLE = 0.012;
  // Plafonds des particules selon la qualité du rendu.
  static FACTEUR_QUALITE = { bas: 0.4, moyen: 1, eleve: 1.5 };
  // Modes de jeu du scénario (menu « Mode » du panneau).
  static MODES_JEU = ['course', 'manager', 'defi', 'championnat', 'multijoueur'];
  static VITESSE_ETINCELLES = 0.8;
  static ELAN_ETINCELLE = 3;
  static EVENEMENTS_MAX = 4;
  // Messages radio gardés (les plus récents), et leur durée d'affichage.
  static RADIO_MAX = 6;
  static DUREE_RADIO = 6;
  // Gerbes d'eau : humidité minimale, élan du jet.
  static HUMIDITE_GERBES = 0.2;
  static ELAN_GERBE = 1.2;
  // Un dépassement compte si les deux voitures sont à moins de cette distance le long de la piste.
  static PORTEE_DEPASSEMENT = 150;
  // Mode pilote (limites de piste : VoiturePilote ; accidents : IncidentJoueur) : distance du mur
  // au bord de la piste là où le décor n'en donne pas, nombre de débris.
  // Le mur le plus proche possible de l'axe, en px : le bord du vibreur dessiné (50 + 11), plus une
  // largeur de voiture (les quatre roues peuvent dépasser le vibreur sans toucher).
  static MUR_MINIMUM = Circuit.LARGEUR_PISTE / 2 + 11 + 11;
  // sans rail ni pneus : le mur dessiné (bord de l'herbe, 120,5 px de l'axe ; 40 avant le
  // 18 octobre 2026, un mur invisible à 90 px au milieu du dégagement)
  static MUR_DEFAUT = 71;
  static DEBRIS = 14;
  // Remise en piste après un incident : à au moins cette distance des autres voitures, en reculant
  // au plus de RECUL_REPRISE points du circuit.
  static ESPACE_REPRISE = 40;
  static RECUL_REPRISE = 60;
  // remise en piste : on cherche le point le plus proche à FENETRE_REPRISE points de l'indice suivi
  static FENETRE_REPRISE = 8;
  // Le podium est à cette distance (en points du circuit) après la ligne d'arrivée.
  static PODIUM_AVANCE = 10;
  static GRAINE = 1999;
  // Couleur d'accent du design (#e10600) et échelle de l'étiquette de la voiture suivie.
  static ACCENT = [225, 6, 0];
  static ACCENT_NUIT = [255, 42, 31];
  static ECHELLE_ETIQUETTE = 0.7;

  // Écuries et pilotes FICTIFS : aucun nom, logo ni couleur d'une équipe réelle n'est imité.
  // Les 10 livrées, codes et numéros du design (design/ : « Palette et fiche technique de la
  // scène ») : rangs 0 à 9 = premier pilote de chaque écurie, 10 et 11 = seconds pilotes de Halden
  // et Corsa Nera (avec 10 écuries). couleurs : [p1 corps, p2 bande, p3 liseré], en [r, v, b].
  static ECURIES = [
    { nom: 'Halden', couleurs: [[47, 123, 255], [255, 255, 255], [13, 27, 61]] },
    { nom: 'Corsa Nera', couleurs: [[255, 138, 31], [21, 23, 27], [255, 209, 102]] },
    { nom: 'Velis GP', couleurs: [[25, 195, 166], [11, 42, 51], [232, 255, 251]] },
    { nom: 'Kestrel', couleurs: [[242, 194, 0], [27, 27, 27], [255, 255, 255]] },
    { nom: 'Ardent', couleurs: [[217, 221, 227], [29, 31, 36], [0, 163, 199]] },
    { nom: 'Moravia', couleurs: [[192, 24, 107], [255, 209, 230], [42, 10, 26]] },
    { nom: 'Aurel', couleurs: [[31, 138, 76], [212, 175, 55], [13, 43, 26]] },
    { nom: 'Novaro', couleurs: [[27, 42, 92], [255, 90, 54], [255, 255, 255]] },
    { nom: 'Sable', couleurs: [[38, 39, 43], [201, 162, 74], [201, 162, 74]] },
    { nom: 'Tessa', couleurs: [[138, 75, 42], [243, 226, 199], [243, 226, 199]] },
  ];
  static PILOTES = [
    ['Elias Karsten', 'KAR'], ['Lina Mirov', 'MIR'], ['Hugo Tavel', 'TAV'], ['Mila Lunde', 'LUN'],
    ['Petr Skovan', 'SKO'], ['Clara Brenner', 'BRE'], ['Owen Rowan', 'ROW'], ['Nora Fenlow', 'FEN'],
    ['Aino Ilmarsson', 'ILM'], ['Théo Ysander', 'YSA'], ['Ida Odelind', 'ODE'], ['Rafael Adenor', 'ADE'],
    ['Léo Martel', 'MAR'], ['Inès Calder', 'CAL'], ['Tomás Reyna', 'REY'], ['Ada Okafor', 'OKA'],
    ['Nils Lindqvist', 'LIN'], ['Sofia Navarro', 'NAV'], ['Karim Haddad', 'HAD'], ['Jonas Brandt', 'BRA'],
  ];
  // Numéros : ceux d'origine, pas ceux du design (#4 KAR, #7 MIR...) : le numéro entre dans la
  // conduite (phase de la dispersion due à la fatigue, voitureF1.js), le changer changerait la course.
  static NUMEROS = [7, 12, 3, 21, 9, 44, 15, 28, 5, 61, 18, 33, 2, 70, 26, 11, 49, 8, 37, 19];

  // Réglages au départ : les valeurs de départ de chaque curseur du panneau (constantes des
  // entités). L'objet est partagé : les voitures le lisent à chaque image.
  static parametresParDefaut() {
    return {
      nombreVoitures: Course.NOMBRE_VOITURES,
      nombreTours: Course.NOMBRE_TOURS,
      ecuries: Course.NOMBRE_ECURIES,
      profil: Course.PROFIL,
      vitesseSimulation: Course.VITESSE_SIMULATION,
      incidents: true,
      poidsSeek: VoitureF1.POIDS_SEEK,
      anticipationSeek: VoitureF1.ANTICIPATION_SEEK,
      poidsArrive: VoitureF1.POIDS_ARRIVE,
      rayonFreinage: VoitureF1.RAYON_FREINAGE,
      distanceAGarder: VoitureF1.DISTANCE_A_GARDER,
      distanceArretStand: VoitureF1.DISTANCE_ARRET_STAND,
      poidsWander: VoitureF1.POIDS_WANDER,
      distanceCercle: VoitureF1.DISTANCE_CERCLE,
      wanderRadius: VoitureF1.WANDER_RAYON,
      displaceRange: VoitureF1.DISPLACE_RANGE,
      poidsSeparation: VoitureF1.POIDS_SEPARATION,
      distanceSecurite: VoitureF1.DISTANCE_SECURITE,
      porteeEvitement: VoitureF1.PORTEE_EVITEMENT,
      vitesseMax: VoitureF1.VITESSE_MAX,
      forceMax: VoitureF1.FORCE_MAX,
      usurePneus: VoitureF1.USURE_PNEUS,
      seuilStand: VoitureF1.SEUIL_STAND,
      vitesseSafetyCar: SafetyCar.VITESSE,
      // IA de course avancée
      iaAvancee: true,
      bonusAspiration: VoitureF1.BONUS_ASPIRATION,
      distanceAspiration: VoitureF1.DISTANCE_ASPIRATION,
      agressiviteDepassement: VoitureF1.AGRESSIVITE_DEPASSEMENT,
      frequenceErreurs: VoitureF1.FREQUENCE_ERREURS,
      personnalites: 'aleatoire',
      // météo
      modeMeteo: Meteo.MODE,
      intensitePluie: Meteo.INTENSITE,
      effetAdherence: Meteo.EFFET_ADHERENCE,
      gerbes: true,
      quantiteGerbes: GerbeEau.QUANTITE,
      pneusDepart: 'MEDIUM',
      // mode pilote
      modePilote: false,
      distancePointCible: VoiturePilote.DISTANCE_POINT_CIBLE,
      regimeCroisiere: VoiturePilote.REGIME_CROISIERE,
      bonusDRS: VoiturePilote.BONUS_DRS,
      toleranceCollision: VoiturePilote.TOLERANCE_COLLISION,
      penalites: true,
      // limites de piste du joueur (temps toléré en ms, avertissements avant pénalité, pénalité,
      // limites strictes : la ligne blanche même sur les vibreurs) ; accidents (vitesse d'impact
      // minimale, pénalité) ; mur là où le décor n'a ni rail ni pneus (distance au bord)
      toleranceLimites: VoiturePilote.TOLERANCE_LIMITES_MS,
      avertissementsLimites: VoiturePilote.AVERTISSEMENTS_LIMITES,
      penaliteLimites: VoiturePilote.PENALITE_LIMITES,
      limitesStrictes: false,
      vitesseImpact: VoiturePilote.VITESSE_IMPACT_KMH,
      penaliteAccident: IncidentJoueur.PENALITE_ACCIDENT,
      distanceMur: Course.MUR_DEFAUT,
      // glisse réaliste
      glisseRealiste: true,
      adherenceGlobale: VoitureF1.ADHERENCE_GLOBALE,
      seuilGlisse: VoitureF1.SEUIL_GLISSE,
      sousVirage: VoitureF1.SOUS_VIRAGE,
      survirage: VoitureF1.SURVIRAGE,
      frottementGlissement: VoitureF1.FROTTEMENT_GLISSEMENT,
      // incidents et comportements de course (phase 1)
      vsc: true,
      facteurVSC: VoitureF1.FACTEUR_VSC,
      relanceAccordeon: true,
      evitementDanger: true,
      depanneuse: true,
      plongeon: true,
      risquePlongeon: VoitureF1.RISQUE_PLONGEON,
      fatigue: true,
      tauxFatigue: VoitureF1.TAUX_FATIGUE,
      ordresEquipe: true,
      pannes: true,
      probaPanne: GestionIncidents.PROBA_PANNE,
      // voie des stands spectaculaire (phase 2)
      pitSpectaculaire: true,
      feuSortie: true,
      tailleEquipe: VoieDesStands.TAILLE_EQUIPE,
      dureeRoue: EquipeDeStand.DUREE_ROUE,
      // adversaires (voir voitureNeuronale.js) : 'classiques' (VoitureF1, poids fixes) ou 'ia' (le
      // modèle choisi dose leurs steering behaviors) ; modeleIA = { id, nom, note, reseau } ou null ;
      // variation des poids par voiture (0 = toutes identiques)
      adversaires: 'classiques',
      modeleIA: null,
      variationPoids: VoitureNeuronale.VARIATION,
      // nombre d'adversaires pilotés par le modèle (null : tous), répartis sur la grille ; pas de
      // curseur (tests, essais : « 20 voitures dont 11 IA »)
      nombreIA: null,
    };
  }

  // Les circuits sont longs à calculer : un seul par profil, gardé pour toutes les courses.
  static circuits = new Map();

  static circuit(profil) {
    if (!Course.circuits.has(profil)) Course.circuits.set(profil, new Circuit(profil));
    return Course.circuits.get(profil);
  }

  // Le décor d'un circuit (ses placements servent aussi à la physique : graviers, rails), et sa
  // carte des surfaces : un seul de chaque par circuit, partagés avec le scénario.
  static decors = new Map();
  static surfacesParCircuit = new Map();

  static decor(circuit) {
    if (!Course.decors.has(circuit)) Course.decors.set(circuit, new DecorCircuit(circuit));
    return Course.decors.get(circuit);
  }

  // Les traces de pneus d'un circuit (un calque par circuit, effacé à chaque nouvelle course).
  static tracesParCircuit = new Map();

  static traces(circuit) {
    if (!Course.tracesParCircuit.has(circuit)) Course.tracesParCircuit.set(circuit, new TracesPneus(circuit, Course.surfaces(circuit)));
    return Course.tracesParCircuit.get(circuit);
  }

  static surfaces(circuit) {
    if (!Course.surfacesParCircuit.has(circuit)) Course.surfacesParCircuit.set(circuit, new CarteSurfaces(circuit, Course.decor(circuit)));
    return Course.surfacesParCircuit.get(circuit);
  }

  // parametres = l'objet de réglages (voir parametresParDefaut) ; alea = générateur entre 0 et
  // 1 (caractéristiques des voitures, feux, incidents), à graine fixe par défaut.
  constructor(parametres = Course.parametresParDefaut(), alea = Circuit.generateur(Course.GRAINE)) {
    this.parametres = parametres;
    this.alea = alea;
    // hasard des effets visuels (fumée, étincelles...) : un générateur à part, pour qu'une option
    // d'affichage ne change jamais la simulation
    this.aleaEffets = Circuit.generateur(Course.GRAINE + 1);
    this.pause = false;
    // réserve de temps de simulation pas encore jouée, en secondes
    this.reserve = 0;
    // options d'affichage (cases du panneau) : elles ne changent jamais la simulation
    this.affichage = { decor: true, classement: true, gomme: true, fumee: true, ombres: true, drone: true, ecarts: 'leader', etincelles: true,
      qualite: Ambiance.QUALITE, traces: true, poussiere: true, billes: true, foule: true, lignesVitesse: true,
      moment: Ambiance.MOMENT, dureeCycle: Ambiance.DUREE_CYCLE, qualiteAuto: true, compteurFps: false };
    // la météo : non mobile, à graine fixe
    this.meteo = new Meteo(parametres);
    // mode pilote : rang de grille de la voiture du joueur (null tant qu'il n'a pas choisi) ;
    // multijoueur : rang du second joueur
    this.rangJoueur = null;
    this.rangJoueur2 = null;
    // mode pilote : nombre de joueurs attendus avant les feux (1 ; 2 quand deux joueurs choisissent
    // chacun leur voiture au curseur, voir Scenarios.formule1 lancerPartie)
    this.joueursAttendus = 1;
    // mode manager : l'écurie dirigée par le joueur (la stratégie automatique ne la touche pas)
    this.ecurieGeree = null;
    this.nouvelleCourse();
  }

  get leader() {
    return this.classement()[0] ?? null;
  }

  // Drapeau en cours : vert, jaune (incident), VSC, safety car (et relance), damier.
  get drapeau() {
    if (this.etat === Course.ETATS.ARRIVEE) return 'damier';
    if (this.etat === Course.ETATS.SAFETY_CAR || this.etat === Course.ETATS.RELANCE) return 'sc';
    if (this.etat === Course.ETATS.VSC) return 'vsc';
    if (this.voitures.some(voiture => voiture.incident) || (this.incidents && this.incidents.secteursJaunes.size > 0)) return 'jaune';
    return 'vert';
  }

  // Les voitures pilotées par des joueurs (aucune, une, ou deux en multijoueur).
  get joueurs() {
    return [this.joueur, this.joueur2].filter(j => j !== null && j !== undefined);
  }

  // Deux joueurs (écran partagé) ?
  get multijoueur() {
    return this.joueurs.length === 2;
  }

  // Un message radio d'équipe (texte, voiture concernée) : affiché en bulle (voir radio.js).
  // Options : prioritaire (passe en tête du bandeau), duree (secondes d'affichage dans le bandeau).
  radio(voiture, texte, { prioritaire = false, duree = null } = {}) {
    if (!texte) return;
    this.messagesRadio.push({ texte, voiture, age: 0, prioritaire, duree });
    if (this.messagesRadio.length > Course.RADIO_MAX) this.messagesRadio.shift();
  }

  get terminee() {
    return this.etat === Course.ETATS.ARRIVEE &&
      this.voitures.every(voiture => voiture.arrivee || this.chronometrage.abandon(voiture));
  }

  // Temps de course : depuis l'extinction des feux, figé à l'arrivée du vainqueur.
  get tempsCourse() {
    return this.chronometrage.tempsCourse;
  }

  // Meilleur tour de la course : { voiture, numero, temps } ou null.
  get meilleurTour() {
    return this.chronometrage.meilleurTour;
  }

  // Les voitures arrivées, dans l'ordre de leur passage sous le damier.
  get ordreArrivee() {
    return this.voitures.filter(voiture => this.chronometrage.arrivee(voiture) !== null)
      .sort((a, b) => this.chronometrage.arrivee(a).temps - this.chronometrage.arrivee(b).temps);
  }

  // Une nouvelle course : circuit du profil choisi, voitures sur la grille, safety car garée.
  // Règle de scène : c'est la seule fois où les véhicules sont placés.
  nouvelleCourse() {
    const p = this.parametres;
    // numéro de la course (1, 2...) : l'interface y voit une nouvelle course et repart de zéro
    // (le même objet Course sert à toutes les courses)
    this.numeroCourse = (this.numeroCourse ?? 0) + 1;
    this.circuit = Course.circuit(p.profil);
    // un garage par voiture ; avec la voie des stands spectaculaire, les arrêts se font au box de
    // l'écurie (le garage de sa première voiture), partagé par ses voitures
    const equipes = Math.min(p.ecuries, p.nombreVoitures);
    this.circuit.placerBoxes(p.nombreVoitures);
    this.surfaces = Course.surfaces(this.circuit);
    this.surfaces.reinitialiser();
    this.traces = Course.traces(this.circuit);
    this.traces.effacer();
    this.etat = Course.ETATS.PRESENTATION;
    // temps écoulé depuis la création de la course (états, accident) ; le temps de COURSE est
    // celui du chronométrage
    this.chrono = 0;
    this.chronoEtat = 0;
    this.feux = 0;
    this.attenteFeux = Course.ATTENTE_FEUX_MIN + this.alea() * (Course.ATTENTE_FEUX_MAX - Course.ATTENTE_FEUX_MIN);
    this.departDonne = false;
    this.safetyCarDemandee = false;
    this.evenements = [];
    this.fumees = [];
    this.etincelles = [];
    this.poussieres = [];
    this.billes = [];
    this.gerbes = [];
    this.debris = [];
    this.perturbations = [];
    this.selection = null;
    this.perception = null;
    this.ordrePrecedent = null;
    this.meteo.reinitialiser();
    // mode pilote : la voiture du joueur, la fin de partie
    this.joueur = null;
    this.joueur2 = null;
    // reprises après un incident (joueur, type, pénalité) : l'interface en tire l'encart « Rejouer »
    this.reprises = [];
    this.chronoFin = 0;
    if (!p.modePilote || this.rangJoueur >= p.nombreVoitures) this.rangJoueur = null;
    if (this.rangJoueur === null || this.rangJoueur2 >= p.nombreVoitures || this.rangJoueur2 === this.rangJoueur) this.rangJoueur2 = null;

    this.voitures = [];
    // adversaires IA : tous, ou nombreIA d'entre eux répartis régulièrement sur la grille
    const adversaires = Array.from({ length: p.nombreVoitures }, (_, rang) => rang).filter(rang => rang !== this.rangJoueur && rang !== this.rangJoueur2);
    const nombreIA = p.nombreIA === null || p.nombreIA === undefined ? adversaires.length : Math.max(0, Math.min(adversaires.length, p.nombreIA));
    const rangsIA = new Set(adversaires.filter((_, k) => Math.floor((k + 1) * nombreIA / adversaires.length) > Math.floor(k * nombreIA / adversaires.length)));
    for (let rang = 0; rang < p.nombreVoitures; rang++) {
      const place = this.circuit.emplacementGrille(rang);
      const naissance = this.circuit.pointLateral(place.indice - Course.RECUL_PRESENTATION / this.circuit.pas,
        this.circuit.ecartLateral(place.x, place.y, place.indice));
      const [nom, code] = Course.PILOTES[rang];
      // la voiture du joueur est une VoiturePilote : même physique, commandes au lieu de l'IA ;
      // adversaires « IA entraînée » (avec un modèle) : des VoitureNeuronale, les autres des VoitureF1
      const joueur = rang === this.rangJoueur || rang === this.rangJoueur2;
      const ia = !joueur && rangsIA.has(rang) && p.adversaires === 'ia' && p.modeleIA && p.modeleIA.reseau;
      const Classe = joueur ? VoiturePilote : ia ? VoitureNeuronale : VoitureF1;
      this.voitures.push(new Classe(naissance.x, naissance.y, {
        ...(ia ? { reseau: p.modeleIA.reseau, variation: p.variationPoids, modele: { id: p.modeleIA.id, nom: p.modeleIA.nom } } : {}),
        circuit: this.circuit,
        parametres: p,
        numero: Course.NUMEROS[rang],
        ecurie: Course.ECURIES[rang % p.ecuries],
        pilote: { nom, code },
        place,
        box: p.pitSpectaculaire ? this.circuit.stands.boxes[rang % equipes] : this.circuit.stands.boxes[rang],
        garage: this.circuit.stands.boxes[rang],
        alea: this.alea,
        surfaces: this.surfaces,
      }));
    }
    this.voitures.forEach(voiture => {
      // secondes passées avec des pneus inadaptés à la météo (stratégie de pit)
      voiture.attenteMeteo = 0;
    });
    this.chronometrage = new Chronometrage(this.circuit, this.voitures);
    this.messagesRadio = [];
    if (this.rangJoueur !== null) this.joueur = this.voitures[this.rangJoueur];
    if (this.rangJoueur2 !== null) this.joueur2 = this.voitures[this.rangJoueur2];
    this.safetyCar = new SafetyCar(this.circuit, p);
    this.drone = new DroneCamera(this.circuit.largeurMonde * 0.3, this.circuit.hauteurMonde * 0.4,
      this.circuit.largeurMonde, this.circuit.hauteurMonde);
    this.grille = null;
    // incidents : dépanneuses à leurs postes, zones de danger, VSC, relance
    this.incidents = new GestionIncidents(this);
    // voie des stands spectaculaire : équipes de mécaniciens, file, limiteur, feu de sortie
    this.stands = p.pitSpectaculaire ? new VoieDesStands(this) : null;
    this.evenement(`Présentation — circuit ${this.circuit.libelle}, ${p.nombreTours} tours`);
  }

  passerA(etat) {
    this.etat = etat;
    this.chronoEtat = 0;
  }

  // Couleur de chaque garage (celle de l'écurie de sa voiture), pour le décor.
  couleursDesBoxes() {
    return this.circuit.stands.boxes.map(box => {
      const voiture = this.voitures.find(v => v.garage === box);
      return voiture ? voiture.ecurie.couleurs[0] : [90, 90, 90];
    });
  }

  // Pénalité de stand (5 ou 10 s), purgée au prochain arrêt (voie des stands spectaculaire).
  penaliserAuStand(voiture, secondes) {
    if (this.stands !== null) this.stands.penaliser(voiture, secondes);
    else voiture.penaliteStand = (voiture.penaliteStand ?? 0) + secondes;
  }

  // prioritaire : montré tout de suite par le bandeau (limites de piste du joueur).
  evenement(texte, { prioritaire = false } = {}) {
    this.evenements.push(prioritaire ? { texte, age: 0, prioritaire } : { texte, age: 0 });
    if (this.evenements.length > Course.EVENEMENTS_MAX) this.evenements.shift();
  }

  // --- Demandes de l'interface ---------------------------------------------------------------------

  // Bouton « Safety car » : elle sortira à la prochaine image (en course ou sous VSC).
  demanderSafetyCar() {
    if (this.etat !== Course.ETATS.COURSE && this.etat !== Course.ETATS.VSC) return false;
    this.safetyCarDemandee = true;
    return true;
  }

  basculerPause() {
    this.pause = !this.pause;
    return this.pause;
  }

  // Un curseur ou un menu du panneau a changé. Valeurs validées par ReglagesF1 avant d'arriver ici.
  // Nombre de voitures, écuries et profil changent la grille : une nouvelle course commence.
  regler(cle, valeur) {
    if (!Object.hasOwn(this.parametres, cle)) throw new RangeError(`Réglage inconnu : ${cle}.`);
    this.parametres[cle] = valeur;
    // personnalité imposée à tous : appliquée tout de suite ; « aléatoire » : à la prochaine course
    if (cle === 'personnalites' && valeur !== 'aleatoire') this.voitures.forEach(voiture => voiture.changerDePersonnalite(valeur));
    if (cle === 'modePilote' && !valeur) this.rangJoueur = null;
    if (['nombreVoitures', 'ecuries', 'profil', 'pneusDepart', 'modePilote', 'pitSpectaculaire', 'tailleEquipe', 'adversaires', 'modeleIA',
      'variationPoids'].includes(cle)) this.nouvelleCourse();
  }

  // La voiture la plus proche d'un point du monde (à moins de `rayon`), ou null : pour la choisir
  // d'un clic et la suivre avec la caméra.
  voitureEn(x, y, rayon = 40) {
    let choisie = null;
    let distanceMin = rayon;
    this.voitures.forEach(voiture => {
      const d = Math.hypot(voiture.pos.x - x, voiture.pos.y - y);
      if (d < distanceMin) {
        distanceMin = d;
        choisie = voiture;
      }
    });
    return choisie;
  }

  // --- Classement --------------------------------------------------------------------------------------

  // Classement (chronométrage) : en course, par point de chronométrage franchi puis par temps de
  // passage ; après l'arrivée, le classement final (pénalités comprises, abandons à la fin).
  classement() {
    return this.chronometrage.classement();
  }

  // Écarts affichés : Map voiture -> { texte, valeur, tours }. mode = 'leader' ou 'intervalle'.
  ecarts(mode = 'leader') {
    return this.chronometrage.ecarts(mode);
  }

  // --- Une image ----------------------------------------------------------------------------------

  // Avance la simulation de dt secondes réelles (deltaTime / 1000), multipliées par la vitesse
  // de simulation. Les pas fixes non joués restent en réserve pour l'image suivante.
  avancer(dt) {
    if (this.pause) return 0;
    this.reserve += dt * this.parametres.vitesseSimulation;
    const pas = Math.min(Course.PAS_MAX, Math.round(this.reserve / Course.PAS_TEMPS));
    this.reserve = pas === Course.PAS_MAX ? 0 : this.reserve - pas * Course.PAS_TEMPS;
    for (let i = 0; i < pas; i++) this.pas();
    return pas;
  }

  // Un pas de simulation.
  pas() {
    this.decide();
    this.applyBehaviors();
    this.update(Course.PAS_TEMPS);
  }

  // Les véhicules sur la piste (pas dans la voie des stands), safety car comprise si elle roule.
  surLaPiste() {
    const piste = this.voitures.filter(voiture => !voiture.auStand);
    if (this.safetyCar.enPiste) piste.push(this.safetyCar);
    return piste;
  }

  // Perception partagée d'un pas : la grille spatiale (voisins), et pour chaque véhicule en piste
  // celui qui le précède et celui qui le suit le long du tracé. Calculée une fois par pas, avant
  // les décisions, et réutilisée pour les forces.
  percevoir() {
    const p = this.parametres;
    const tous = [...this.voitures, this.safetyCar];
    // grille spatiale : cellules de la taille de la portée d'évitement, reconstruite à chaque pas
    const taille = Math.max(p.porteeEvitement, p.distanceSecurite * 1.6);
    if (this.grille === null || this.grille.taille !== taille) {
      this.grille = new GrilleSpatiale(this.circuit.largeurMonde, this.circuit.hauteurMonde, taille);
    }
    this.grille.reconstruire(tous);
    const { devant, derriere } = this.calculerQuiEstDevant();
    // les voisins de chaque véhicule, cherchés une fois par pas : decide() et applyBehaviors() les
    // demandent tous deux, sans que rien ne bouge entre les deux (ni positions, ni grille)
    this.voisinsDuPas ??= new Map();
    this.voisinsDuPas.clear();
    this.perception = { taille, devant, derriere };
  }

  // Ce que perçoit un véhicule : ses voisins, celui de devant, celui de derrière, la météo.
  contexteDe(vehicule) {
    const { taille, devant, derriere } = this.perception;
    let voisins = this.voisinsDuPas.get(vehicule);
    if (voisins === undefined) {
      voisins = this.grille.voisins(vehicule, taille);
      this.voisinsDuPas.set(vehicule, voisins);
    }
    return {
      voisins,
      devant: devant.get(vehicule) ?? null,
      derriere: derriere.get(vehicule) ?? null,
      meteo: this.meteo,
      // relance en accordéon après la safety car (une VoitureNeuronale y rend la main au steering existant)
      relance: this.etat === Course.ETATS.RELANCE,
      ...this.incidents.perception(),
    };
  }

  // ETAPE 1 : perception et transitions.
  decide() {
    const { PRESENTATION, FEUX, COURSE, SAFETY_CAR, ARRIVEE, FIN } = Course.ETATS;
    const p = this.parametres;

    this.percevoir();
    this.voitures.forEach(voiture => voiture.decide(this.contexteDe(voiture)));
    this.safetyCar.decide();
    this.incidents.decide();
    if (this.stands !== null) this.stands.decide();

    if (this.etat === FIN) return;
    this.joueurs.forEach(j => this.surveillerLesLimites(j));
    if (this.etat === PRESENTATION) {
      // mode pilote : on attend que le joueur (ou les deux joueurs) ait choisi sa voiture
      const attente = p.modePilote && (this.joueur === null || this.joueurs.length < this.joueursAttendus);
      if (attente) this.chronoEtat = 0;
      if (this.chronoEtat >= Course.DUREE_PRESENTATION) {
        this.passerA(FEUX);
        this.evenement('Les feux s\'allument');
      }
    } else if (this.etat === FEUX) {
      this.feux = Math.min(5, Math.floor(this.chronoEtat / Course.INTERVALLE_FEUX) + 1);
      if (this.chronoEtat >= 5 * Course.INTERVALLE_FEUX + this.attenteFeux) {
        this.feux = 0;
        this.departDonne = true;
        this.chronometrage.demarrer();
        this.voitures.forEach(voiture => voiture.demarrer());
        this.passerA(COURSE);
        this.evenement('Extinction des feux : départ !');
      }
    } else if ([COURSE, SAFETY_CAR, Course.ETATS.VSC, Course.ETATS.RELANCE].includes(this.etat)) {
      this.suivreLesTours();
      this.gererLesStands();
      if (this.etat === COURSE) this.tirerLesIncidents();
      const vainqueur = this.chronometrage.vainqueur;
      if (vainqueur !== null) {
        this.incidents.annulerVSC();
        this.incidents.relance = null;
        this.passerA(ARRIVEE);
        this.safetyCar.rappeler();
        this.voitures.forEach(voiture => voiture.relancer());
        this.evenement(`Drapeau à damier : victoire de ${vainqueur.pilote.nom} (#${vainqueur.numero}) en ${Chronometrage.formater(this.tempsCourse)}`);
        this.arriverAuDamier();
      } else if ((this.etat === COURSE || this.etat === Course.ETATS.VSC) && this.safetyCarDemandee) {
        this.safetyCarDemandee = false;
        this.deployerSafetyCar();
      } else if (this.etat === SAFETY_CAR) {
        // la safety car rentre après sa durée ; la course reprend quand elle entre dans la voie
        if (this.chronoEtat >= Course.DUREE_SAFETY_CAR) this.safetyCar.rappeler();
        if (this.safetyCar.auStand && this.safetyCar.phaseStand === VoitureF1.PHASES_STAND.ENTREE) {
          if (p.relanceAccordeon) {
            // relance en accordéon : le leader choisit son moment (voir incidents.js)
            this.incidents.demarrerRelance();
          } else {
            this.passerA(COURSE);
            this.voitures.forEach(voiture => voiture.relancer());
            this.evenement('La safety car rentre : reprise de la course');
          }
        }
      }
    } else if (this.etat === ARRIVEE) {
      this.suivreLesTours();
      this.gererLesStands();
      // chaque voiture reçoit le drapeau à damier à son prochain passage de la ligne
      this.arriverAuDamier();
      // mode pilote : quand tout le monde est arrivé, le podium
      if (this.joueur !== null && this.terminee) this.finirLaPartie();
    }
    // incidents des joueurs : leur séquence (radio, neutralisation, remise en piste, reprise)
    this.suivreLesIncidents();
  }

  // La safety car sort (en course ou sous VSC) ; les voitures, sauf `sauf`, se rangent derrière.
  deployerSafetyCar(sauf = null) {
    if (!(this.etat === Course.ETATS.COURSE || this.etat === Course.ETATS.VSC) || !this.safetyCar.deployer()) return false;
    this.incidents.annulerVSC();
    this.passerA(Course.ETATS.SAFETY_CAR);
    this.voitures.forEach(voiture => { if (voiture !== sauf) voiture.neutraliser(); });
    this.evenement('Safety car en piste');
    return true;
  }

  // --- Incidents des joueurs (voir incidentJoueur.js) ------------------------------------------
  // Accident d'un joueur : la MÊME course continue. Séquence (IncidentJoueur) : radio, safety car,
  // remise en piste, compte à rebours, reprise du contrôle, 2 s d'invulnérabilité ; pénalité
  // ajoutée au temps final. Jamais d'abandon ni de fin de partie. Deux joueurs : chacun sa
  // séquence, l'autre continue à piloter. Les limites de piste ne sont pas un incident
  // (surveillerLesLimites : avertissements, pénalités, la course continue).

  // L'incident en cours du joueur (le premier), ou null.
  get incidentJoueur() {
    return this.joueur?.incident ?? null;
  }

  // Un accident commence pour ce joueur : il ne contrôle plus sa voiture (elle freine) ; message
  // radio en tête du bandeau. Pendant un incident, un autre ne commence pas.
  declarerIncident(j, type, options = {}) {
    if (j.incident !== null) return j.incident;
    j.incident = new IncidentJoueur(j, type, options);
    j.excursion = null;
    j.sousControle = false;
    j.pilotageAuto = false;
    this.radio(j, j.incident.message, { prioritaire: true, duree: IncidentJoueur.DUREE_RADIO });
    return j.incident;
  }

  // --- Limites de piste du joueur ------------------------------------------------------------
  // Le vibreur fait partie de la piste. Les limites sont dépassées quand les QUATRE roues sont
  // au-delà du bord extérieur du vibreur (ou de la ligne blanche là où il n'y en a pas ; limites
  // strictes : la ligne blanche partout ; CarteSurfaces.limite), plus de toleranceLimites ms
  // d'affilée. Un contact est un accident (verifierLesContacts), pas une limite. La course
  // continue : ni remise en piste, ni safety car, ni VSC. Chaque sortie compte une fois : les
  // avertissementsLimites premières sont des avertissements, ensuite penaliteLimites s chaque
  // fois ; une place gagnée pendant la sortie coûte penaliteLimites s tout de suite (une seule
  // pénalité par sortie). Case « Pénalités » décochée : des avertissements seulement.

  // Le nombre de roues (0 à 4) du joueur au-delà de la limite, du côté où il est.
  rouesDehors(j) {
    const i = j.indicePiste;
    const cote = j.ecartLateral >= 0 ? 1 : -1;
    const limite = this.surfaces.limite(i, cote, { strictes: this.parametres.limitesStrictes });
    return j.roues().filter(r => cote * this.circuit.ecartLateral(r.x, r.y, i) > limite).length;
  }

  // Un pas : renvoie 'avertissement', 'penalite', 'place' (place gagnée en coupant) ou null.
  surveillerLesLimites(j = this.joueur) {
    const { DEPART, COURSE, DRAPEAU } = VoitureF1.ETATS;
    if (!this.departDonne || j.incident !== null || j.auStand || ![DEPART, COURSE, DRAPEAU].includes(j.etat)) {
      j.excursion = null;
      return null;
    }
    const p = this.parametres;
    const penaliser = p.penalites && p.penaliteLimites > 0;
    if (this.rouesDehors(j) === 4) {
      if (j.excursion === null) j.excursion = { duree: 0, rang: this.classement().indexOf(j), comptee: false, penalisee: false };
      const e = j.excursion;
      e.duree += Course.PAS_TEMPS;
      if (e.comptee || e.duree < p.toleranceLimites / 1000 - 1e-9) return null;
      e.comptee = true;
      j.limites++;
      const max = p.avertissementsLimites + 1;
      if (j.limites <= p.avertissementsLimites || !penaliser) {
        this.annoncerLimites(j, `avertissement ${Math.min(j.limites, max)}/${max}`);
        return 'avertissement';
      }
      j.penalites += p.penaliteLimites;
      e.penalisee = true;
      this.annoncerLimites(j, `+${p.penaliteLimites} s`);
      return 'penalite';
    }
    // retour dans les limites : une place gagnée en coupant ?
    const e = j.excursion;
    j.excursion = null;
    if (e === null || e.penalisee || !penaliser || this.classement().indexOf(j) >= e.rang) return null;
    j.penalites += p.penaliteLimites;
    this.annoncerLimites(j, `place gagnée · +${p.penaliteLimites} s`);
    return 'place';
  }

  // Le message du bandeau, tout de suite : « #7 KAR : Limites de piste · avertissement 1/3 ».
  annoncerLimites(j, suite) {
    this.evenement(`#${j.numero} ${j.pilote.code} : Limites de piste · ${suite}`, { prioritaire: true });
  }

  // Un pas de la séquence de chaque joueur : safety car, remise en piste, reprise du contrôle
  // (pénalité), fin de l'invulnérabilité.
  suivreLesIncidents() {
    this.joueurs.forEach(j => {
      const inc = j.incident;
      if (inc === null) return;
      const transition = inc.avancer(Course.PAS_TEMPS);
      if (transition === 'neutraliser') {
        this.deployerSafetyCar(j);
      } else if (transition === 'remettre') {
        this.remettreEnPiste(j);
      } else if (transition === 'reprendre') {
        this.rendreLaMain(j);
      } else if (transition === 'terminer') {
        j.incident = null;
      }
    });
  }

  // Remise en piste (règle de scène, comme une réapparition, écrite ici et dans
  // VoiturePilote.reapparaitre, hors des comportements) : au point de la piste le plus proche de
  // l'incident (place occupée : plus en arrière), au centre, dans le sens de la course, à
  // VITESSE_REPRISE_KMH ; la voiture roule seule (pilotageAuto) pendant le compte à rebours. Elle
  // garde ses tours ; sa trace de pneus repart de là (pas de trait depuis l'ancienne position).
  remettreEnPiste(j) {
    const inc = j.incident;
    const place = this.placeDeReprise(j, inc?.x ?? j.pos.x, inc?.y ?? j.pos.y);
    const t = this.circuit.tangentes[place.indice];
    const ancien = j.indicePiste;
    j.reapparaitre(place.x, place.y, Math.atan2(t.y, t.x), IncidentJoueur.VITESSE_REPRISE_KMH / VoiturePilote.KMH);
    // reculer au-delà de la ligne d'arrivée : le tour en cours n'est pas encore fait
    const n = this.circuit.n;
    if (ancien < n * 0.25 && place.indice > n * 0.75) j.tour--;
    else if (ancien > n * 0.75 && place.indice < n * 0.25) j.tour++;
    j.indicePiste = place.indice;
    j.ecartLateral = place.ecart;
    j.excursion = null;
    j.pilotageAuto = true;
    // sous safety car, elle se range derrière comme les autres (relancée avec elles)
    if (this.etat === Course.ETATS.SAFETY_CAR) j.neutraliser();
    this.traces.precedentes.delete(j);
    this.evenement(`#${j.numero} ${j.pilote.code} remis en piste`);
  }

  // Le compte à rebours est fini : le joueur reprend le contrôle (invulnérable 2 s) ; la pénalité
  // de l'incident (curseurs « Joueur », 0 = aucune) s'ajoutera à son temps final.
  rendreLaMain(j) {
    const inc = j.incident;
    j.sousControle = true;
    j.pilotageAuto = false;
    const penalite = this.parametres.penaliteAccident;
    if (penalite > 0) {
      j.penalites += penalite;
      this.evenement(`Pénalité : +${penalite} s pour #${j.numero} ${j.pilote.code} (accident)`);
    }
    this.reprises.push({ joueur: j, type: inc.type, penalite });
  }

  // Le point de reprise : le point de la piste le plus proche de (x, y), au centre ; occupé (une
  // voiture à moins de ESPACE_REPRISE px), on recule le long du tracé jusqu'à une place libre.
  placeDeReprise(j, x = j.pos.x, y = j.pos.y) {
    const c = this.circuit;
    const autres = [...this.voitures, this.safetyCar].filter(v => v !== j && !v.dansSonBox);
    // le long de SON tracé (autour de l'indice suivi) : une projection sur tout le circuit prenait
    // parfois une autre partie plus proche du dégagement (la ligne des stands, par exemple)
    const base = c.projeter(x, y, j.indicePiste, Course.FENETRE_REPRISE);
    for (let recul = 0; recul <= Course.RECUL_REPRISE; recul += 2) {
      const indice = (base - recul + c.n) % c.n;
      const q = c.pointLateral(indice, 0);
      if (autres.every(v => Math.hypot(v.pos.x - q.x, v.pos.y - q.y) >= Course.ESPACE_REPRISE)) return { indice, ecart: 0, x: q.x, y: q.y };
    }
    const q = c.pointLateral(base, 0);
    return { indice: base, ecart: 0, x: q.x, y: q.y };
  }

  // Les voitures dont le chronométrage a enregistré l'arrivée reçoivent le damier (une seule
  // fois) ; leurs pénalités sont ajoutées à leur temps final, ce qui peut les reclasser.
  arriverAuDamier() {
    this.voitures.forEach(voiture => {
      if (voiture.arrivee || this.chronometrage.arrivee(voiture) === null) return;
      voiture.terminer();
      const penalites = voiture.penalites ?? 0;
      if (penalites > 0 && this.chronometrage.penaliser(voiture, penalites)) {
        this.evenement(`#${voiture.numero} ${voiture.pilote.code} : +${penalites} s de pénalité ajoutées à son temps`);
      }
    });
  }

  // Carburant consommé à chaque passage de la ligne (les temps sont ceux du chronométrage).
  suivreLesTours() {
    this.voitures.forEach(voiture => {
      if (!voiture.ligneFranchie) return;
      voiture.consommer(1 - voiture.toursCompletes / Math.max(1, this.parametres.nombreTours));
    });
  }

  // Stratégie des arrêts (voir strategie.js) : pneus usés, pneus inadaptés à la météo, et avec
  // l'IA avancée, arrêt sous safety car, undercut et arrêts décalés entre coéquipiers. Le joueur
  // décide seul de ses arrêts (touche P).
  gererLesStands() {
    const p = this.parametres;
    const ia = p.iaAvancee;
    const auStand = ecurie => this.voitures.some(v => v.ecurie === ecurie && (v.auStand || v.demandeStand));
    this.voitures.forEach(voiture => {
      // les joueurs décident seuls ; l'écurie du manager attend ses ordres
      if (this.joueurs.includes(voiture) || voiture.ecurie === this.ecurieGeree) return;
      const contexte = this.perception === null ? {} : this.contexteDe(voiture);
      const decision = Strategie.decider(voiture, {
        secondesDevant: ia ? VoitureF1.secondes(contexte.devant ?? null) : Infinity,
        secondesDerriere: ia ? VoitureF1.secondes(contexte.derriere ?? null) : Infinity,
        safetyCar: ia && this.etat === Course.ETATS.SAFETY_CAR,
        coequipierAuStand: ia && auStand(voiture.ecurie),
        humidite: this.meteo.humidite * p.effetAdherence,
        toursRestants: p.nombreTours - voiture.toursCompletes,
        attenteMeteo: voiture.attenteMeteo,
        seuil: p.seuilStand,
        gestionPneus: voiture.traits.pneus,
        reaction: voiture.traits.reaction,
      });
      if (!decision.rentrer) return;
      voiture.demanderStand();
      voiture.pneuDemande = decision.pneus;
      voiture.raisonStand = decision.raison;
      const raisons = { meteo: 'changement de pneus', usure: 'pneus usés', 'safety car': 'arrêt sous safety car', undercut: 'undercut' };
      this.evenement(`#${voiture.numero} ${voiture.pilote.code} : ${raisons[decision.raison]}, il rentrera (${Pneus.type(decision.pneus).libelle})`);
    });
  }

  // Incident léger, tiré au hasard : la voiture ralentit et la safety car est demandée.
  tirerLesIncidents() {
    if (!this.parametres.incidents) return;
    for (const voiture of this.voitures) {
      if (voiture.etat !== VoitureF1.ETATS.COURSE || voiture.incident) continue;
      if (this.alea() < Course.PROBA_INCIDENT * Course.PAS_TEMPS) {
        this.provoquerIncident(voiture);
        return;
      }
    }
  }

  // Incident sur une voiture : elle perd de la vitesse jusqu'au stand ; drapeau jaune puis safety car.
  provoquerIncident(voiture) {
    voiture.subirIncident();
    this.safetyCarDemandee = this.etat === Course.ETATS.COURSE;
    this.evenement(`Drapeau jaune : #${voiture.numero} ${voiture.pilote.code} ralentit`);
  }

  // --- Mode pilote ------------------------------------------------------------------------------

  // Le joueur choisit sa voiture (clic ou Tab), avant le départ seulement. Règle de scène : la
  // grille est reformée (les voitures renaissent derrière leur place), avec une VoiturePilote
  // à ce rang.
  choisirJoueur(rang) {
    const { PRESENTATION, FEUX } = Course.ETATS;
    if (!this.parametres.modePilote || ![PRESENTATION, FEUX].includes(this.etat)) return false;
    if (!Number.isInteger(rang) || rang < 0 || rang >= this.parametres.nombreVoitures) throw new RangeError(`Rang inconnu : ${rang}.`);
    this.rangJoueur = rang;
    this.rangJoueur2 = null;
    this.nouvelleCourse();
    this.evenement(`Vous pilotez la #${this.joueur.numero} (${this.joueur.pilote.code})`);
    return true;
  }

  // Tab : la voiture suivante de la grille.
  joueurSuivant() {
    return this.choisirJoueur(this.rangJoueur === null ? 0 : (this.rangJoueur + 1) % this.parametres.nombreVoitures);
  }

  // Multijoueur : deux voitures pilotées (rangs de grille différents), grille reformée.
  choisirJoueurs(rang1, rang2) {
    if (rang1 === rang2) throw new RangeError('Les deux joueurs doivent avoir des voitures différentes.');
    for (const r of [rang1, rang2]) {
      if (!Number.isInteger(r) || r < 0 || r >= this.parametres.nombreVoitures) throw new RangeError(`Rang inconnu : ${r}.`);
    }
    if (!this.parametres.modePilote) this.parametres.modePilote = true;
    this.rangJoueur = rang1;
    this.rangJoueur2 = rang2;
    this.nouvelleCourse();
    this.evenement(`J1 : #${this.joueur.numero} ${this.joueur.pilote.code} · J2 : #${this.joueur2.numero} ${this.joueur2.pilote.code}`);
    return true;
  }

  // Bouton « Choisir une autre voiture » : retour au choix, sur une grille neuve.
  oublierJoueur() {
    this.rangJoueur2 = null;
    this.rangJoueur = null;
    this.nouvelleCourse();
  }

  // Le mur du côté où se trouve la voiture : le premier obstacle du décor s'il est connu
  // (course.murs, donné par le scénario : rail, pneus empilés), sinon distanceMur au-delà du bord.
  // Jamais plus près que MUR_MINIMUM : les rails ne sont pas dessinés, et le décor en place parfois
  // un à 1 px derrière le vibreur ; une voiture qui le mordait touchait un mur invisible.
  distanceDuMur(voiture) {
    const cote = voiture.ecartLateral >= 0 ? 1 : -1;
    const rail = this.murs?.[cote]?.[voiture.indicePiste];
    return Math.max(Course.MUR_MINIMUM, rail ?? this.circuit.largeur / 2 + (this.parametres.distanceMur ?? Course.MUR_DEFAUT));
  }

  // --- Contacts du joueur (accidents) ---------------------------------------------------------
  // Profondeur du chevauchement de deux rectangles (quatre coins chacun), par les axes séparateurs :
  // 0 s'ils ne se touchent pas.
  static chevauchement(a, b) {
    let profondeur = Infinity;
    for (const coins of [a, b]) {
      for (const [p, q] of [[coins[0], coins[1]], [coins[0], coins[2]]]) {
        const lx = q.x - p.x;
        const ly = q.y - p.y;
        const l = Math.hypot(lx, ly);
        if (l < 1e-9) continue;
        const projeter = pts => pts.map(r => (r.x * lx + r.y * ly) / l);
        const pa = projeter(a);
        const pb = projeter(b);
        const recouvrement = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
        if (recouvrement <= 0) return 0;
        profondeur = Math.min(profondeur, recouvrement);
      }
    }
    return profondeur;
  }

  // Contact entre les carrosseries du joueur et d'une autre voiture (rectangles LONGUEUR × LARGEUR
  // × tolérance de collision) : { vitesse (km/h, écart des vitesses), profondeur (px), enfonce },
  // ou null.
  contactAvec(j, autre) {
    const t = this.parametres.toleranceCollision;
    if (Math.hypot(autre.pos.x - j.pos.x, autre.pos.y - j.pos.y) > VoitureF1.LONGUEUR * t * 1.2) return null;
    const profondeur = Course.chevauchement(j.chassis(VoitureF1.LONGUEUR * t, VoitureF1.LARGEUR * t), autre.chassis(VoitureF1.LONGUEUR * t, VoitureF1.LARGEUR * t));
    if (profondeur <= 0) return null;
    const vitesse = Math.hypot(j.vel.x - autre.vel.x, j.vel.y - autre.vel.y) * VoiturePilote.KMH;
    return { vitesse, profondeur, enfonce: profondeur >= IncidentJoueur.ENFONCEMENT_ACCIDENT };
  }

  // Contact de la carrosserie du joueur avec le mur de son côté (rail, pneus empilés, ou mur par
  // défaut) : { vitesse (km/h vers le mur), enfoncement (px), enfonce }, ou null.
  contactMur(j) {
    if (j.auStand) return null;
    const i = j.indicePiste;
    const cote = j.ecartLateral >= 0 ? 1 : -1;
    const enfoncement = Math.max(...j.coins().map(q => cote * this.circuit.ecartLateral(q.x, q.y, i))) - this.distanceDuMur(j);
    if (enfoncement <= 0) return null;
    const n = this.circuit.normales[i];
    const vitesse = Math.max(0, cote * (j.vel.x * n.x + j.vel.y * n.y)) * VoiturePilote.KMH;
    return { vitesse, enfoncement, enfonce: enfoncement >= IncidentJoueur.ENFONCEMENT_ACCIDENT };
  }

  // Accident du joueur : contact avec une voiture ou un mur à vitesseImpact km/h ou plus (écart
  // des vitesses ; vers le mur), ou carrosserie enfoncée ; un frôlement plus lent ne compte pas.
  verifierLesContacts(j = this.joueur) {
    // avant le départ (présentation, feux), les voitures se rangent sur la grille : pas d'accident
    if (!this.departDonne) return;
    if ([VoitureF1.ETATS.GRILLE, VoitureF1.ETATS.PARC].includes(j.etat)) return;
    const seuil = this.parametres.vitesseImpact;
    // seulement la vitesse d'impact (avant le 18 octobre 2026 : ou carrosserie enfoncée de 3 px)
    const grave = contact => contact !== null && contact.vitesse >= seuil;
    for (const autre of [...this.voitures, this.safetyCar]) {
      if (autre === j || autre.dansSonBox) continue;
      if (grave(this.contactAvec(j, autre))) {
        this.provoquerAccident((j.pos.x + autre.pos.x) / 2, (j.pos.y + autre.pos.y) / 2, `contact avec la #${autre.numero}`, j);
        return;
      }
    }
    if (grave(this.contactMur(j))) this.provoquerAccident(j.pos.x, j.pos.y, 'contact avec le mur', j);
  }

  // ACCIDENT (seulement après le départ ; renvoie vrai s'il a lieu) : la voiture (celle du joueur
  // par défaut) freine jusqu'à l'arrêt ; des débris sont éjectés par une perturbation au point de
  // contact ; la safety car sort. Règles de scène : débris et perturbation naissent au point de
  // contact, ensuite seules des forces les déplacent.
  provoquerAccident(x, y, cause, voiture = this.joueur) {
    // avant le départ, rien ne peut finir la course (ni accident, ni fin de partie)
    if (!this.departDonne) return false;
    // un joueur : la séquence d'incident (radio, safety car, remise en piste) ; la course
    // continue, il n'abandonne pas. Une voiture de l'IA : accidentée, abandon, safety car.
    const joueur = this.joueurs.includes(voiture);
    if (joueur) {
      this.declarerIncident(voiture, 'accident', { cause, x, y });
    } else {
      voiture.accidenter();
      this.chronometrage.abandonner(voiture);
    }
    voiture.endommagee = true;
    this.perturbations.push(new Perturbation(x, y));
    for (let k = 0; k < Course.DEBRIS; k++) {
      const angle = this.aleaEffets() * 2 * Math.PI;
      this.debris.push(new Debris(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, voiture.ecurie.couleurs[k % 3]));
    }
    this.evenement(`ACCIDENT : #${voiture.numero} ${voiture.pilote.code}, ${cause}`);
    // la safety car sort tout de suite pour l'IA ; pour un joueur, après le message radio
    // (suivreLesIncidents)
    if (!joueur) this.deployerSafetyCar(voiture);
    return true;
  }

  // Places du podium : sur la ligne droite des stands, juste après la ligne d'arrivée ; le
  // premier au milieu, un peu devant.
  placesDuPodium() {
    const c = this.circuit;
    return [c.pointLateral(Course.PODIUM_AVANCE, 0), c.pointLateral(Course.PODIUM_AVANCE - 4, -32),
      c.pointLateral(Course.PODIUM_AVANCE - 4, 32)];
  }

  // Fin de partie (mode pilote) : tous arrivés. Les trois premiers rejoignent le podium avec
  // arrive ; les autres s'arrêtent là où ils sont.
  finirLaPartie() {
    if (this.etat === Course.ETATS.FIN) return;
    this.passerA(Course.ETATS.FIN);
    this.chronoFin = this.chrono;
    const classement = this.classement();
    const podium = this.placesDuPodium();
    this.podium = classement.slice(0, 3);
    classement.forEach((voiture, rang) => voiture.entrerAuParc(rang < 3 ? podium[rang] : voiture.pos));
    this.safetyCar.rappeler();
    this.evenement('Fin de course : podium');
  }

  // Pour chaque véhicule sur la piste : celui qui le précède et celui qui le suit (les plus
  // proches le long du tracé), avec la distance : { vehicule, distance } ou null.
  calculerQuiEstDevant() {
    const piste = this.surLaPiste().filter(vehicule => !(vehicule instanceof VoitureF1) ||
      (vehicule.etat !== VoitureF1.ETATS.PARC && !vehicule.horsCourse));
    const devant = new Map();
    const derriere = new Map();
    piste.forEach(vehicule => {
      let avant = null;
      let apres = null;
      let distanceAvant = Infinity;
      let distanceApres = Infinity;
      piste.forEach(autre => {
        if (autre === vehicule) return;
        const d = this.circuit.distanceDevant(vehicule.indicePiste, autre.indicePiste);
        if (d > 0 && d < distanceAvant) {
          distanceAvant = d;
          avant = autre;
        }
        const r = this.circuit.distanceDevant(autre.indicePiste, vehicule.indicePiste);
        if (r > 0 && r < distanceApres) {
          distanceApres = r;
          apres = autre;
        }
      });
      devant.set(vehicule, avant === null ? null : { vehicule: avant, distance: distanceAvant });
      derriere.set(vehicule, apres === null ? null : { vehicule: apres, distance: distanceApres });
    });
    return { devant, derriere };
  }

  // ETAPE 2 : pilotage. Chaque véhicule reçoit ce qu'il perçoit et applique ses forces.
  applyBehaviors() {
    if (this.perception === null) this.percevoir();
    this.voitures.forEach(voiture => voiture.applyBehaviors(this.contexteDe(voiture)));
    // la safety car mène : personne devant elle
    this.safetyCar.applyBehaviors({ ...this.contexteDe(this.safetyCar), devant: null });
    this.drone.applyBehaviors({ groupe: this.groupeDeTete() });
    this.poussieres.forEach(nuage => nuage.applyBehaviors());
    this.billes.forEach(bille => bille.applyBehaviors({ voitures: this.voitures, perturbations: this.perturbations }));
    this.fumees.forEach(fumee => fumee.applyBehaviors());
    this.etincelles.forEach(etincelle => etincelle.applyBehaviors());
    this.gerbes.forEach(gerbe => gerbe.applyBehaviors());
    this.debris.forEach(morceau => morceau.applyBehaviors({ perturbations: this.perturbations }));
    this.incidents.applyBehaviors();
    if (this.stands !== null) this.stands.applyBehaviors();
  }

  // ETAPE 3 : temps, locomotion, règles de scène.
  update(dt) {
    const p = this.parametres;
    this.chrono += dt;
    this.chronoEtat += dt;
    this.meteo.update(dt);
    this.voitures.forEach(voiture => voiture.update(dt));
    // chronométrage : temps de course, passages des points (temps interpolés), tours, arrivées
    this.chronometrage.update(dt, p.nombreTours).forEach(evenement => {
      if (evenement.type === 'meilleurTour' && evenement.temps > 0 && this.chronometrage.meilleurTour.numero >= 2) {
        this.evenement(`Meilleur tour : #${evenement.voiture.numero} ${evenement.voiture.pilote.code} ${Chronometrage.formater(evenement.temps)}`);
      }
    });
    this.safetyCar.update(dt);
    this.drone.update(dt);
    this.fumees.forEach(fumee => fumee.update(dt));
    this.etincelles.forEach(etincelle => etincelle.update(dt));
    this.poussieres.forEach(nuage => nuage.update(dt));
    this.billes.forEach(bille => bille.update(dt));
    // traces de pneus : la gomme est toujours déposée (elle change l'adhérence) ; le trait n'est
    // dessiné que si l'option d'affichage est cochée
    // qualité basse : pas de calque des traces (la gomme de la piste, qui compte pour l'adhérence,
    // est toujours déposée)
    this.traces.deposer(this.voitures, this.affichage.traces && this.affichage.qualite !== 'bas');
    this.gerbes.forEach(gerbe => gerbe.update(dt));
    this.surfaces.update(dt, this.meteo.humidite);
    this.debris.forEach(morceau => morceau.update(dt));
    this.perturbations.forEach(perturbation => perturbation.update(dt));
    this.incidents.update(dt);
    if (this.stands !== null) this.stands.update(dt);
    this.messagesRadio.forEach(message => { message.age += dt; });
    this.messagesRadio = this.messagesRadio.filter(message => message.age < Course.DUREE_RADIO);

    // temps passé avec des pneus inadaptés à la météo (la stratégie attend le délai du pilote)
    const pneusAdaptes = Pneus.adapte(this.meteo.humidite * p.effetAdherence);
    this.voitures.forEach(voiture => {
      voiture.attenteMeteo = Pneus.memeCategorie(voiture.typePneus, pneusAdaptes) ? 0 : voiture.attenteMeteo + dt;
    });
    this.compterLesDepassements();
    // pendant un incident (et ses 2 s d'invulnérabilité), aucun contact ne compte
    this.joueurs.forEach(j => {
      if (j.incident === null) this.verifierLesContacts(j);
    });

    // règle de scène : des gouttelettes jaillissent derrière les voitures sur piste mouillée
    // (effet visuel, nombre plafonné par le panneau)
    const humidite = this.meteo.humidite;
    if (p.gerbes && humidite > Course.HUMIDITE_GERBES) {
      this.voitures.forEach(voiture => {
        if (voiture.auStand || voiture.vitesse < Course.VITESSE_FUMEE || this.gerbes.length >= p.quantiteGerbes * Math.min(1, this.facteurQualite)) return;
        if (this.aleaEffets() > humidite) return;
        const cap = voiture.cap;
        const recul = VoitureF1.LONGUEUR / 2;
        const lateral = (this.aleaEffets() - 0.5) * 1.2;
        this.gerbes.push(new GerbeEau(voiture.pos.x - Math.cos(cap) * recul, voiture.pos.y - Math.sin(cap) * recul, {
          x: -Math.cos(cap) * Course.ELAN_GERBE - Math.sin(cap) * lateral,
          y: -Math.sin(cap) * Course.ELAN_GERBE + Math.cos(cap) * lateral,
        }));
      });
    }
    Course.garder(this.gerbes, Course.EN_COURS);
    Course.garder(this.debris, Course.PAS_FINI);
    Course.garder(this.perturbations, Course.EN_COURS);

    // règle de scène : un nuage de fumée naît derrière une voiture qui freine fort ou qui glisse
    // (effet visuel)
    if (this.affichage.fumee) {
      this.voitures.forEach(voiture => {
        if (!(voiture.freine || voiture.glisseVisible) || voiture.vitesse < Course.VITESSE_FUMEE || this.fumees.length >= Course.FUMEES_MAX * this.facteurQualite) return;
        const cap = voiture.cap;
        const recul = VoitureF1.LONGUEUR / 2;
        const lateral = (this.aleaEffets() - 0.5) * 0.4;
        this.fumees.push(new Fumee(voiture.pos.x - Math.cos(cap) * recul, voiture.pos.y - Math.sin(cap) * recul, {
          x: -Math.cos(cap) * Course.ELAN_FUMEE - Math.sin(cap) * lateral,
          y: -Math.sin(cap) * Course.ELAN_FUMEE + Math.cos(cap) * lateral,
        }));
      });
    }
    // règle de scène : des étincelles jaillissent sous le fond plat d'une voiture rapide qui
    // freine fort ou passe sur un vibreur (effet visuel, nombre plafonné)
    if (this.affichage.etincelles) {
      this.voitures.forEach(voiture => {
        const rapide = voiture.vitesse > Course.VITESSE_ETINCELLES * p.vitesseMax;
        if (!rapide || !(voiture.freine || voiture.surface === 'vibreur') || this.etincelles.length >= Course.ETINCELLES_MAX) return;
        if (this.aleaEffets() > 0.5) return;
        const cap = voiture.cap;
        const angle = cap + Math.PI + (this.aleaEffets() - 0.5) * 0.8;
        this.etincelles.push(new Etincelle(voiture.pos.x - Math.cos(cap) * 3, voiture.pos.y - Math.sin(cap) * 3, {
          x: voiture.vel.x * 0.4 + Math.cos(angle) * Course.ELAN_ETINCELLE,
          y: voiture.vel.y * 0.4 + Math.sin(angle) * Course.ELAN_ETINCELLE,
        }));
      });
    }
    Course.garder(this.etincelles, Course.EN_COURS);
    this.emettreLesPoussieres();
    Course.garder(this.poussieres, Course.EN_COURS);
    Course.garder(this.billes, Course.PAS_FINI);
    // règle de scène : les nuages éteints et les vieux messages disparaissent
    Course.garder(this.fumees, Course.EN_COURS);
    this.evenements.forEach(evenement => { evenement.age += dt; });
    this.evenements = this.evenements.filter(evenement => evenement.age < Course.DUREE_EVENEMENT);
  }

  // Les particules encore vivantes restent, dans le même ordre, dans le MÊME tableau (pas un
  // nouveau tableau par groupe et par pas, comme filter()) ; garder(x) = vrai pour celles qui restent.
  static garder(liste, garder) {
    let n = 0;
    for (let k = 0; k < liste.length; k++) {
      if (garder(liste[k])) liste[n++] = liste[k];
    }
    liste.length = n;
    return liste;
  }

  static EN_COURS = particule => !particule.terminee;
  static PAS_FINI = particule => !particule.termine;

  // Plafond des particules selon la qualité du rendu.
  get facteurQualite() {
    return Course.FACTEUR_QUALITE[this.affichage.qualite] ?? 1;
  }

  // Le centre du groupe de tête (les trois premiers en piste), que le drone survole ; null avant le
  // départ.
  groupeDeTete() {
    if (![Course.ETATS.COURSE, Course.ETATS.SAFETY_CAR, Course.ETATS.VSC, Course.ETATS.RELANCE].includes(this.etat)) return null;
    const tete = this.classement().filter(v => !v.horsCourse && !v.auStand).slice(0, 3);
    if (tete.length === 0) return null;
    return { x: tete.reduce((s, v) => s + v.pos.x, 0) / tete.length, y: tete.reduce((s, v) => s + v.pos.y, 0) / tete.length };
  }

  // Règles de scène (effets visuels, hasard à part) : de la poussière derrière une voiture dans
  // l'herbe ou le gravier ; des billes de gomme semées hors de la trajectoire par les pneus entamés.
  emettreLesPoussieres() {
    const f = this.facteurQualite;
    this.voitures.forEach(voiture => {
      if (this.affichage.poussiere && (voiture.surface === 'herbe' || voiture.surface === 'gravier') && voiture.vitesse > 1 &&
        this.poussieres.length < Course.POUSSIERE_MAX * f && this.aleaEffets() < 0.6) {
        const cap = voiture.cap;
        this.poussieres.push(new GerbePoussiere(voiture.pos.x - Math.cos(cap) * 8, voiture.pos.y - Math.sin(cap) * 8, {
          x: -Math.cos(cap) * 0.8 + (this.aleaEffets() - 0.5), y: -Math.sin(cap) * 0.8 + (this.aleaEffets() - 0.5),
        }));
      }
      if (this.affichage.billes && !voiture.auStand && !voiture.horsCourse && voiture.vitesse > 1 && voiture.pneus < 0.85 &&
        this.billes.length < Course.BILLES_MAX * f && this.aleaEffets() < Course.PROBA_BILLE) {
        const n = this.circuit.normales[voiture.indicePiste];
        const cote = this.aleaEffets() < 0.5 ? -1 : 1;
        const recul = voiture.r + 8 + this.aleaEffets() * 10;
        this.billes.push(new BilleGomme(voiture.pos.x + n.x * cote * recul, voiture.pos.y + n.y * cote * recul));
      }
    });
  }

  // Dépassements : une voiture en course qui passe devant une autre, proche d'elle (sur la piste,
  // hors des stands), en compte un. Sert au classement des pilotes et aux tests des profils.
  compterLesDepassements() {
    const enCourse = this.voitures.filter(v => v.etat === VoitureF1.ETATS.COURSE && !v.arrivee);
    const progressions = new Map(enCourse.map(v => [v, v.progression]));
    if (this.ordrePrecedent !== null) {
      for (const a of enCourse) {
        for (const b of enCourse) {
          if (a === b || !this.ordrePrecedent.has(a) || !this.ordrePrecedent.has(b)) continue;
          const avant = this.ordrePrecedent.get(a) - this.ordrePrecedent.get(b);
          const apres = progressions.get(a) - progressions.get(b);
          if (avant < 0 && apres > 0 && apres < Course.PORTEE_DEPASSEMENT) a.depassements++;
        }
      }
    }
    this.ordrePrecedent = progressions;
  }

  // « 1:02.345 », « 0:58.210 », « 1:02:03.004 » : le format du chronométrage.
  static formaterTemps(secondes) {
    return Chronometrage.formater(secondes);
  }

  // Ce que la barre de contrôle affiche.
  resume() {
    const leader = this.leader;
    return {
      etat: this.etat,
      tour: leader === null ? 0 : Math.min(this.parametres.nombreTours, Math.max(1, leader.tour + 1)),
      tours: this.parametres.nombreTours,
      voitures: this.voitures.length,
      pause: this.pause,
    };
  }

  // --- Dessin (dans le repère du monde, la caméra est déjà appliquée) --------------------------------

  // theme : 'jour', 'nuit' ou 'pluie' (palette de la scène, voir DecorCircuit.PALETTES).
  show(debug = false, { theme = 'jour' } = {}) {
    const detail = this.voitures.length <= VoitureF1.DETAIL_MAX;
    const { ombres } = this.affichage;
    if (debug) this.showDebug();
    if (this.affichage.traces && this.affichage.qualite !== 'bas') this.traces.show();
    if (this.affichage.billes) this.billes.forEach(bille => bille.show());
    if (this.affichage.poussiere) this.poussieres.forEach(nuage => nuage.show());
    if (this.affichage.fumee) this.fumees.forEach(fumee => fumee.show());
    if (this.affichage.etincelles) this.etincelles.forEach(etincelle => etincelle.show());
    this.gerbes.forEach(gerbe => gerbe.show());
    this.perturbations.forEach(perturbation => perturbation.show(debug));
    this.debris.forEach(morceau => morceau.show());
    if (this.stands !== null) this.stands.show();
    this.safetyCar.show({ ombres });
    this.incidents.show({ ombres });
    // halo discret sous la voiture de chaque joueur (J2 : bleuté)
    this.joueurs.forEach((j, k) => {
      push();
      noStroke();
      fill(...(k === 0 ? [255, 255, 160] : [150, 200, 255]), 45);
      circle(j.pos.x, j.pos.y, VoitureF1.LONGUEUR * 2.2);
      pop();
    });
    const qualite = this.affichage.qualite ?? 'moyen';
    this.voitures.forEach(voiture => voiture.show({ ombres, detail, qualite, theme }));
    // la voiture du joueur (seul), sinon la voiture choisie : halo et étiquette « code + position »
    // (la même que le HUD et la tour de classement)
    const suivie = (this.multijoueur ? null : this.joueur) ?? this.selection;
    if (suivie !== null && suivie !== undefined) this.showSuivie(suivie, theme);
    if (debug) {
      this.incidents.showDebug();
      if (this.stands !== null) this.stands.showDebug();
      this.voitures.forEach(voiture => voiture.showDebug());
      if (this.safetyCar.enPiste) this.safetyCar.showDebug();
    }
    if (this.affichage.drone) this.drone.show({ ombres });
  }

  // Voiture suivie (design : calque 13) : halo pulsé à la couleur d'accent (rayon 44 -> 76 en
  // 1,4 s, à l'échelle de la voiture) et étiquette « code + position » au-dessus. La nuit,
  // l'accent est plus lumineux (#ff2a1f).
  showSuivie(voiture, theme = 'jour') {
    const k = VoitureF1.LONGUEUR / 77.5;
    const accent = theme === 'nuit' ? Course.ACCENT_NUIT : Course.ACCENT;
    const t = (this.chronoEtat / 1.4) % 1;
    const { x, y } = voiture.pos;
    push();
    noFill();
    stroke(...accent, 255 * 0.9 * (1 - t));
    strokeWeight(2.5 * k);
    circle(x, y, 2 * (44 + 32 * t) * k);
    stroke(...accent);
    strokeWeight(2 * k);
    fill(...accent, 0.08 * 255);
    circle(x, y, 88 * k);
    // étiquette : taille fixe dans le monde (lisible à l'échelle de la vue d'ensemble)
    const e = Course.ECHELLE_ETIQUETTE;
    translate(x, y - 62 * k - 14 * e);
    scale(e);
    noStroke();
    fill(...accent);
    beginShape();
    [[-34, -14], [34, -14], [34, 8], [6, 8], [0, 14], [-6, 8], [-34, 8]].forEach(([a, b]) => vertex(a, b));
    endShape(CLOSE);
    fill(255);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(16);
    text(voiture.pilote.code, -8, -3);
    const rang = this.classement().indexOf(voiture);
    fill(255, 255, 255, 0.8 * 255);
    textSize(12);
    text(rang < 0 ? '—' : `P${rang + 1}`, 20, -3);
    pop();
  }

  // Aides du mode debug : cellules de la grille, ligne centrale (blanche), ligne de course
  // (verte), secteurs, zones DRS, apex des virages.
  showDebug() {
    const c = this.circuit;
    push();
    noFill();
    strokeWeight(1);
    if (this.grille !== null) {
      stroke(255, 255, 255, 30);
      for (let k = 0; k <= this.grille.colonnes; k++) line(k * this.grille.taille, 0, k * this.grille.taille, c.hauteurMonde);
      for (let k = 0; k <= this.grille.lignes; k++) line(0, k * this.grille.taille, c.largeurMonde, k * this.grille.taille);
    }
    stroke(255, 255, 255, 150);
    beginShape();
    c.points.forEach(point => vertex(point.x, point.y));
    endShape(CLOSE);
    stroke(0, 255, 120);
    strokeWeight(2);
    beginShape();
    c.ligne.forEach(point => vertex(point.x, point.y));
    endShape(CLOSE);
    // secteurs : un trait en travers de la piste et leur numéro
    strokeWeight(3);
    c.secteurs.forEach((i, rang) => {
      const a = c.pointLateral(i, -c.largeur / 2);
      const b = c.pointLateral(i, c.largeur / 2);
      stroke(...[[255, 60, 60], [60, 160, 255], [255, 220, 60]][rang]);
      line(a.x, a.y, b.x, b.y);
      noStroke();
      fill(255);
      textSize(14);
      text(`S${rang + 1}`, b.x + 4, b.y);
      noFill();
    });
    // zones DRS
    stroke(180, 80, 255);
    strokeWeight(5);
    c.zonesDRS.forEach(zone => {
      for (let i = zone.debut; i !== zone.fin; i = (i + 1) % c.n) {
        const a = c.pointLateral(i, -c.largeur / 2 - 4);
        const b = c.pointLateral(i + 1, -c.largeur / 2 - 4);
        line(a.x, a.y, b.x, b.y);
      }
    });
    // apex des virages
    noStroke();
    fill(255, 120, 0);
    c.virages.forEach(virage => circle(c.ligne[virage.apex].x, c.ligne[virage.apex].y, 7));
    // adhérence en chaque point du circuit (pneus medium) : vert = sèche, rouge = détrempée
    const humidite = this.meteo.humidite * this.parametres.effetAdherence;
    for (let i = 0; i < c.n; i += 6) {
      const a = Pneus.adherence('MEDIUM', humidite);
      const t = Math.max(0, Math.min(1, (1 - a) / 0.5));
      fill(255 * t, 255 * (1 - t), 60, 160);
      const point = c.pointLateral(i, -c.largeur / 2 + 4);
      circle(point.x, point.y, 4);
    }
    pop();
  }
}
