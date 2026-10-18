// Monoplace de Formule 1 : un Vehicle piloté uniquement par des forces (applyForce, puis la
// locomotion de Vehicle). Trois niveaux, comme dans l'article de Reynolds :
//   decide()          perception (où suis-je sur la piste, tours) et transitions d'état ;
//   applyBehaviors()  pilotage : chaque comportement calcule une force, pondérée par son poids ;
//   update(dt)        temps (stand, réaction, usure des pneus), puis locomotion héritée.
//
// Comportements (forces) :
//   SEEK     vers un point d'anticipation sur la ligne de course, d'autant plus loin que la
//            voiture va vite ;
//   ARRIVE   vers l'apex d'un virage serré (freinage progressif), vers son emplacement de grille,
//            vers son box, et derrière la voiture de devant (écart à garder) ;
//   WANDER   celui de Vehicle : une petite variation continue qui écarte la voiture de la ligne
//            de course ; garderSurPiste la borne à la largeur de la piste ;
//   ÉVITEMENT séparation à courte portée, et anticipation : un cône devant la voiture ; une
//            voiture qui y entre est suivie (arrive) et contournée (flee latéral) ;
//   garderSurPiste()  ramène vers la piste (ou la voie des stands) une voiture qui s'en écarte.
//
// maxSpeed et maxForce sont des PARAMÈTRES du véhicule : ils sont modulés à chaque image (usure
// des pneus, carburant, DRS, vitesse plus faible en virage, limiteur des stands). Le mouvement,
// lui, ne vient que des forces.
//
// États : GRILLE (sur sa place), DEPART (temps de réaction puis lancement), COURSE, STAND (voie
// des stands : entrée, arrêt au box, sortie), DRAPEAU (safety car : en file, sans dépasser),
// ARRIVEE (drapeau à damier : tour de décélération, puis garage au box), PARC (fin de partie :
// arrive vers une place fixe, le podium ou l'endroit où elle s'arrête).
//
// IA de course avancée (case du panneau ; désactivée, la voiture roule comme ci-dessus) :
//   ASPIRATION  derrière une voiture, dans son sillage et assez près : seek vers le centre du
//               sillage et bonus de maxSpeed proportionnel à la proximité, plafonné ;
//   DÉPASSEMENT dans l'aspiration et assez près : déport du côté intérieur du prochain virage, ou
//               du côté libre, puis retour sur la ligne de course ;
//   DUEL        côte à côte : moins de wander, séparation plus forte, l'une à l'intérieur,
//               l'autre à l'extérieur, qui freine plus tôt (apex décalé) ;
//   DÉFENSE     une voiture dans son sillage : la voiture de devant se place à l'intérieur, une
//               seule fois par ligne droite ;
//   DRAPEAU BLEU prise d'un tour, elle s'écarte (flee latéral) de celle qui la double ;
//   ERREUR      en entrant dans un virage, avec une petite probabilité : un pic de wander, elle
//               part large, perd de la vitesse, puis seek la ramène ;
//   PERSONNALITÉ multiplicateurs propres au pilote (voir personnalites.js).
// Pluie (voir meteo.js et pneus.js) : l'adhérence du pneu sur la piste du moment multiplie
// maxForce et la vitesse de virage ; elle allonge le freinage et la distance de sécurité.
//
// Glisse réaliste (case du panneau ; voir glisse.js) : les forces de pilotage ne sont plus
// appliquées une à une ; leur somme est une DEMANDE faite aux pneus (appliquer). Une seule force
// en sort (transmettreAuxPneus), bornée par le cercle d'adhérence : sous-virage si la demande
// latérale dépasse ce que l'avant peut donner, blocage si le freinage dépasse ce que les pneus
// tiennent. S'y ajoutent des forces de contact : frottement de glissement (dérive au-delà du
// seuil), rappel latéral (le pneu tire la vitesse vers l'axe de la carrosserie), traînée et
// enlisement de la surface (herbe, gravier). L'angle de dérive (cap de la carrosserie moins cap
// de la vitesse) est un attribut d'état et de dessin : il ne déplace rien. Gravier : la voiture
// s'enlise et s'arrête (état BLOQUEE).
//
// Incidents et course (phase 1 ; perception donnée par Course dans le contexte) :
//   VSC         voiture de sécurité virtuelle : tout le monde roule au même profil de vitesse
//               réduit (arrive vers cette vitesse cible), sans dépasser : les écarts sont gardés ;
//   DANGER      une voiture arrêtée devant : point de contournement décalé (seek), flee latéral
//               par anticipation, ralentissement (arrive vers une vitesse cible) ;
//   JAUNE       drapeau jaune dans le secteur : on ralentit, on ne dépasse pas ;
//   PLONGEON    doublage au freinage : freinage plus tardif, apex retardé, à l'intérieur ; risque
//               de partir large (blocage, survirage), puis retour sur la piste ;
//   FATIGUE     au fil des tours, plus de wander et une ligne plus dispersée ;
//   ORDRE       ordre d'équipe : on laisse passer son coéquipier (ligne extérieure, arrive) ;
//   PANNE       moteur partiellement (maxSpeed réduit, puis stand et abandon) ou totalement en
//               panne (la voiture se range sur le bord avec seek, puis s'arrête avec arrive) ;
//   ACCIDENT    contact (mur) : la voiture freine jusqu'à l'arrêt ; REMORQUEE : elle suit la
//               dépanneuse (arrive) ; ABANDON : garée hors de la piste.
class VoitureF1 extends Vehicle {
  // Consignes du manager (mode manager) : allure (facteur de la vitesse de base) et usure des
  // pneus (facteur). Attaque : plus vite, les pneus s'usent bien plus ; économie : l'inverse.
  static CONSIGNES = { attaque: { vitesse: 1.03, usure: 1.6 }, normal: { vitesse: 1, usure: 1 }, economie: { vitesse: 0.96, usure: 0.55 } };
  static ETATS = { GRILLE: 'GRILLE', DEPART: 'DEPART', COURSE: 'COURSE', STAND: 'STAND', DRAPEAU: 'DRAPEAU',
    ARRIVEE: 'ARRIVEE', PARC: 'PARC', BLOQUEE: 'BLOQUEE', ACCIDENT: 'ACCIDENT', PANNE: 'PANNE',
    REMORQUEE: 'REMORQUEE', ABANDON: 'ABANDON' };
  // États où la voiture est immobilisée (ou presque) hors de la course : une zone de danger.
  static IMMOBILISEES = ['BLOQUEE', 'ACCIDENT', 'PANNE', 'REMORQUEE'];
  static PHASES_STAND = { ENTREE: 'ENTREE', ARRET: 'ARRET', SORTIE: 'SORTIE', GARAGE: 'GARAGE' };

  // Dimensions, en pixels du monde. Le rayon de collision est la demi-longueur : deux cercles
  // de ce rayon qui ne se chevauchent pas garantissent que les carrosseries ne se touchent pas.
  static RAYON = 13;
  static LONGUEUR = 26;
  static LARGEUR = 11;
  // Roues : empattement (distance entre essieux) et voie (entre les roues d'un essieu), en px.
  static EMPATTEMENT = 18;
  static VOIE = 11;

  // Valeurs de départ des curseurs du panneau (voir reglagesF1.js).
  static VITESSE_MAX = 5;
  static FORCE_MAX = 0.3;
  static POIDS_SEEK = 1;
  static ANTICIPATION_SEEK = 40;
  static POIDS_ARRIVE = 1.5;
  static RAYON_FREINAGE = 160;
  static DISTANCE_A_GARDER = 34;
  static DISTANCE_ARRET_STAND = 60;
  static POIDS_WANDER = 0.25;
  static DISTANCE_CERCLE = 60;
  static WANDER_RAYON = 20;
  static DISPLACE_RANGE = 0.15;
  static POIDS_SEPARATION = 2;
  static DISTANCE_SECURITE = 40;
  static PORTEE_EVITEMENT = 100;
  static USURE_PNEUS = 0.012;
  static SEUIL_STAND = 0.35;
  // IA de course avancée (valeurs de départ des curseurs).
  static BONUS_ASPIRATION = 0.06;
  static DISTANCE_ASPIRATION = 130;
  static AGRESSIVITE_DEPASSEMENT = 1;
  static FREQUENCE_ERREURS = 0.03;

  // Aspiration : le sillage est le couloir de la largeur d'une voiture derrière celle de devant ;
  // le déport commence à « écart à garder + SEUIL_DEPASSEMENT ».
  static SEUIL_DEPASSEMENT = 30;
  // Hors du sillage, le bonus d'aspiration s'éteint en DUREE_ELAN secondes.
  static DUREE_ELAN = 0.8;
  // Duel : côte à côte quand l'écart longitudinal est sous une longueur de voiture et l'écart
  // latéral sous LATERAL_DUEL ; wander réduit, séparation renforcée, freinage plus tôt dehors.
  static LATERAL_DUEL = 45;
  static WANDER_DUEL = 0.2;
  static SEPARATION_DUEL = 1.5;
  static FREINAGE_EXTERIEUR = 1.25;
  // En duel, un pilote peu combatif lève le pied : jusqu'à CEDER de sa vitesse (prudent : 0,8 ×).
  static CEDER = 0.06;
  // Défense : seul un pilote assez combatif (envie de dépasser d'au moins DEFENSE_MIN) ferme la
  // porte ; un prudent garde sa trajectoire et laisse passer.
  static DEFENSE_MIN = 0.5;
  // Défense : à l'intérieur, à cette distance du bord.
  static MARGE_DEFENSE = 8;
  // Drapeau bleu : portée, et poids du flee latéral.
  static PORTEE_DRAPEAU_BLEU = 150;
  static POIDS_DRAPEAU_BLEU = 1.2;
  // Erreur : durée (secondes), poids du wander, ce qui reste du seek, perte de vitesse.
  static DUREE_ERREUR = 1;
  static POIDS_ERREUR = 2;
  static SEEK_ERREUR = 0.3;
  static VITESSE_ERREUR = 0.85;
  // Pluie : la distance de sécurité grandit de cette part quand la piste est détrempée.
  static SECURITE_PLUIE = 0.5;

  // Glisse réaliste (valeurs de départ des curseurs).
  static ADHERENCE_GLOBALE = 1;
  static SEUIL_GLISSE = 0.08;
  static SOUS_VIRAGE = 1;
  static SURVIRAGE = 1;
  static FROTTEMENT_GLISSEMENT = 1;
  // Cercle d'adhérence, en part de la force de base (forceMax × caractéristique de la voiture),
  // multipliée par l'adhérence de l'avant (ou de l'arrière pour la motricité).
  static CERCLE_LATERAL = 1.5;
  static CERCLE_FREIN = 1.6;
  static CERCLE_MOTRICITE = 1.2;
  static CERCLE_TOTAL = 1.8;
  // Réflexes d'évitement et rappel sur la piste : appliqués directement, hors du cercle (voir glisse.js).
  static REFLEXES = ['separation', 'anticipation', 'urgence', 'piste'];
  // Frottement de glissement et raclement du sous-virage (part de la vitesse perdue par image, comme
  // une traînée), rappel latéral du pneu (part de la force de base), dynamique de lacet (voir
  // Glisse.lacet), contre-braquage du seek (le point visé s'éloigne : une trajectoire plus droite).
  static FROTTEMENT = 0.035;
  static RACLEMENT = 0.02;
  static RAPPEL_FORCE = 0.5;
  static GAIN_SURVIRAGE = 1.6;
  static RAPPEL_LACET = 0.09;
  static CONTRE_BRAQUAGE = 0.06;
  static CONTRE_SEEK = 0.6;
  // Marge supplémentaire (distance de sécurité, écart de suivi) par point d'adhérence perdu.
  static PRUDENCE_ADHERENCE = 0.8;

  // Phase 1 (valeurs de départ des curseurs, puis constantes du modèle).
  static FACTEUR_VSC = 0.55;
  static RISQUE_PLONGEON = 0.15;
  static TAUX_FATIGUE = 0.12;
  // VSC : entrée et sortie progressives (secondes pour passer de 1 au facteur, et retour).
  static DUREE_ENTREE_VSC = 2;
  static DUREE_SORTIE_VSC = 3;
  // Sous VSC, part de la zone de suivi gardée.
  static SUIVI_VSC = 0.3;
  // Sous VSC, à moins de cette distance de la voiture de devant, pas plus vite qu'elle.
  static COLLE_VSC = 60;
  // Drapeau jaune : part de la vitesse de base.
  static VITESSE_JAUNE = 0.85;
  // Danger : portée le long de la piste, marge de contournement, poids du flee, vitesse de passage.
  static PORTEE_DANGER = 280;
  static MARGE_CONTOURNEMENT = 16;
  static POIDS_DANGER = 1.5;
  static VITESSE_DANGER = 0.6;
  // Plongeon : distance maximale à la voiture de devant, freinage plus tardif (part du rayon
  // retirée), apex retardé (pixels), durée de la sortie large en cas d'échec.
  static PORTEE_PLONGEON = 70;
  static RETARD_PLONGEON = 0.35;
  static RETARD_APEX = 24;
  static DUREE_SORTIE_LARGE = 0.9;
  // Fatigue : poids de wander en plus et dispersion de la ligne (pixels) à fatigue maximale.
  static FATIGUE_WANDER = 1.5;
  static FATIGUE_LIGNE = 12;
  // Ordre d'équipe : part de la vitesse de base pour laisser passer, durée maximale (secondes).
  static VITESSE_ORDRE = 0.85;
  static DUREE_ORDRE = 10;
  // Panne : vitesse restante (part de la vitesse de base) d'une panne partielle ; durée de la
  // chute de régime ; écart au bord de la piste où la voiture se range.
  static PANNE_PARTIELLE = 0.65;
  static DUREE_PANNE = 4;
  static RANGEMENT = 12;
  // Température des pneus (°C) : au départ (couvertures chauffantes), de l'air ; chauffe par la
  // charge, la glisse et le blocage ; refroidissement (par seconde, en part de l'écart à l'air).
  static TEMPERATURE_DEPART = 70;
  static TEMPERATURE_AIR = 25;
  static CHAUFFE = 7.5;
  static CHAUFFE_GLISSE = 40;
  static CHAUFFE_BLOCAGE = 12;
  static REFROIDISSEMENT = 0.05;
  // Blocage : usure supplémentaire (par seconde) ; enlisement : sous cette vitesse, pendant
  // cette durée, dans le gravier, la voiture est bloquée.
  static USURE_BLOCAGE = 0.03;
  static VITESSE_ENLISEE = 0.15;
  static DUREE_ENLISEMENT = 0.7;

  // Constantes du modèle.
  // Le point d'anticipation s'éloigne de FACTEUR_ANTICIPATION pixels par unité de vitesse.
  static FACTEUR_ANTICIPATION = 8;
  static POIDS_PISTE = 3;
  static POIDS_URGENCE = 4;
  // Cône d'anticipation : demi-angle d'ouverture, en radians, au-delà d'une largeur de voiture.
  static ANGLE_CONE = 0.2;
  // IA avancée : la voiture de devant n'est suivie (freinage d'arrive) que si elle est dans le
  // couloir de celle-ci, mesuré sur la piste : écart latéral sous la somme des rayons + MARGE_COULOIR.
  static MARGE_COULOIR = 0;
  // Anticipation des collisions : horizon (en images) et marge ajoutée à la somme des rayons.
  static HORIZON = 30;
  static MARGE_ANTICIPATION = 4;
  // Suivi : le freinage commence à « distance à garder + ZONE_SUIVI » de la voiture de devant.
  static ZONE_SUIVI = 50;
  // Un apex n'est visé avec arrive que s'il est devant, à moins de cet angle de la direction.
  static ANGLE_APEX = 0.6;
  // À moins de cette distance, l'apex est atteint : la voiture le lâche (le profil suffit).
  static PASSAGE_APEX = 30;
  // Accélération latérale et décélération possibles, en part de maxForce (profil de vitesse).
  static PART_LATERALE = 0.55;
  static PART_FREINAGE = 0.45;
  // Effets sur la vitesse : pneus usés, réservoir plein, DRS, incident, tour de décélération.
  static PERTE_PNEUS = 0.12;
  static EFFET_CARBURANT = 0.04;
  static BONUS_DRS = 0.07;
  static ECART_DRS = 150;
  static RALENTISSEMENT_INCIDENT = 0.45;
  static RALENTISSEMENT_ARRIVEE = 0.55;
  // Plancher des pneus (une voiture ne s'arrête pas faute de pneus).
  static PNEUS_MIN = 0.05;
  // Stands : limiteur de vitesse, durée d'un arrêt (tirée entre les deux), distance de la voie
  // à laquelle la voiture quitte la voie pour son box.
  static VITESSE_STANDS = 2.2;
  static DUREE_ARRET_MIN = 2;
  static DUREE_ARRET_MAX = 3;
  static APPROCHE_BOX = 48;
  // Box atteint : à moins de cette distance, et presque à l'arrêt.
  static TOLERANCE_BOX = 4;
  static VITESSE_ARRETEE = 0.2;
  // Sous safety car : vitesse en file (par rapport à celle de la safety car), portée de la file,
  // et écart gardé (multiple de la distance à garder).
  static FACTEUR_NEUTRALISATION = 1.3;
  static PORTEE_FILE = 260;
  static FACTEUR_ECART_FILE = 1.5;
  // Départ : temps de réaction tiré entre ces deux valeurs, puis DUREE_DEPART s avant COURSE.
  static REACTION_MIN = 0.1;
  static REACTION_MAX = 0.35;
  static DUREE_DEPART = 3;
  // Grille : vitesse et zone de freinage pour rejoindre sa place.
  static VITESSE_GRILLE = 2;
  static RAYON_GRILLE = 80;
  // Dépassement : vitesse du déport latéral (pixels par image), et différence de vitesse
  // potentielle qui décide de tenter un dépassement.
  static DEPORT = 1.2;
  static ENVIE_DEPASSER = 0.25;
  // En virage (profil sous cette part de la vitesse de base), pas de nouveau déport.
  static PART_VIRAGE = 0.85;
  // La répulsion maximale commence à MARGE_URGENCE pixels avant le contact.
  static MARGE_URGENCE = 2;
  // Bord de la piste : garderSurPiste agit au-delà de « demi-largeur - MARGE_PISTE ».
  static MARGE_PISTE = 12;
  // garderSurPiste regarde où sera la voiture dans ce nombre d'images.
  static ANTICIPATION_BORD = 8;
  static DEMI_LARGEUR_VOIE = 8;
  // Plus de 12 voitures : dessin simplifié.
  static DETAIL_MAX = 12;

  // x, y = position de naissance (règle de scène) ; options :
  //   circuit      le Circuit ; parametres = l'objet de réglages partagé, modifié par le panneau ;
  //   numero, ecurie ({ nom, couleurs }), pilote ({ nom, code }) ;
  //   place        emplacement de grille { x, y } ; box = { x, y, indiceVoie } ;
  //   alea         générateur entre 0 et 1, pour les caractéristiques de la voiture.
  //   surfaces     la CarteSurfaces du circuit (glisse réaliste), ou null : asphalte partout ;
  //   garage       sa place de garage à la fin de la course (par défaut : son box ; avec un box
  //                partagé par écurie, chaque voiture a la sienne).
  constructor(x, y, { circuit, parametres, numero = 1, ecurie = null, pilote = null, place = null, box = null,
    alea = Math.random, surfaces = null, garage = null } = {}) {
    super(x, y);
    this.circuit = circuit;
    this.parametres = parametres;
    this.numero = numero;
    this.ecurie = ecurie ?? { nom: 'Écurie', couleurs: [[220, 40, 40], [250, 250, 250], [30, 30, 30]] };
    this.pilote = pilote ?? { nom: 'Pilote', code: 'PIL' };
    this.place = place ?? { x, y };
    this.box = box;
    this.garage = garage ?? box;
    this.r = VoitureF1.RAYON;

    // caractéristiques propres : une voiture un peu plus rapide, une autre plus agile...
    this.facteurVitesse = 0.96 + alea() * 0.08;
    this.facteurForce = 0.95 + alea() * 0.1;
    this.agressivite = alea();
    this.reaction = VoitureF1.REACTION_MIN + alea() * (VoitureF1.REACTION_MAX - VoitureF1.REACTION_MIN);
    this.dureeArret = VoitureF1.DUREE_ARRET_MIN + alea() * (VoitureF1.DUREE_ARRET_MAX - VoitureF1.DUREE_ARRET_MIN);
    // personnalité (IA avancée) et pneus de départ ; le générateur sert aussi aux erreurs
    this.alea = alea;
    this.personnalite = Personnalites.choisir(parametres.personnalites ?? 'aleatoire', alea);
    this.typePneus = parametres.pneusDepart ?? 'MEDIUM';
    this.pneuDemande = null;
    this.maxForce = parametres.forceMax * this.facteurForce;
    this.maxSpeed = VoitureF1.VITESSE_GRILLE;

    // état
    this.etat = VoitureF1.ETATS.GRILLE;
    this.chronoEtat = 0;
    this.phaseStand = null;
    this.etatApresStand = VoitureF1.ETATS.COURSE;
    this.arret = 0;
    this.pneus = 1;
    this.carburant = 1;
    this.incident = false;
    this.demandeStand = false;
    this.arrivee = false;
    this.arretsAuStand = 0;

    // perception
    this.indicePiste = circuit.projeter(x, y);
    // derrière la ligne d'arrivée (sur la grille) : le premier passage de la ligne ouvre le tour 1
    this.tour = this.indicePiste > circuit.n / 2 ? -1 : 0;
    this.ligneFranchie = false;
    this.indiceVoie = -1;
    this.ecartLateral = circuit.ecartLateral(x, y, this.indicePiste);
    this.capRepos = Math.atan2(circuit.tangentes[this.indicePiste].y, circuit.tangentes[this.indicePiste].x);
    this.decalageDepassement = 0;
    this.drs = false;

    // IA avancée : ce que la voiture perçoit et décide (voir decide)
    this.devant = null;
    this.derriere = null;
    this.aspiration = 0;
    this.duel = null;
    this.defense = { cle: null, utilisee: false, cote: 0 };
    // nombre de changements de ligne défensifs par ligne droite (clé : tour et virage qui la suit)
    this.changementsDefense = new Map();
    this.drapeauBleu = false;
    this.erreur = 0;
    this.erreurs = 0;
    this.dernierVirage = null;
    this.depassements = 0;
    // pluie : humidité vue par les pneus, adhérence qui en résulte
    this.humidite = 0;
    this.adherence = Pneus.adherence(this.typePneus, 0);

    // glisse réaliste : surface sous la voiture, demande faite aux pneus (null : forces appliquées
    // une à une), état des pneus, dérive (angle de la carrosserie par rapport à la vitesse) et cap
    // de la carrosserie (attributs d'état et de dessin, pas des positions)
    this.surfaces = surfaces;
    this.surface = 'asphalte';
    this.demande = null;
    this.etatPneus = { sousVirage: 0, blocage: false, charge: 0, deficit: 0, avant: 1, arriere: 1, demande: { lat: 0, long: 0 }, capacites: null };
    this.derive = 0;
    this.capVitesse = this.capRepos;
    this.capCarrosserie = this.capRepos;
    this.temperaturePneus = VoitureF1.TEMPERATURE_DEPART;
    this.platDePneu = 0;
    this.enlisement = 0;

    // phase 1 : ce que Course fait percevoir (VSC, zones de danger, drapeaux jaunes) et ce que la
    // voiture en décide ; panne, fatigue, plongeon, ordre d'équipe ; delta VSC (secondes)
    this.vsc = null;
    this.danger = null;
    this.jaune = false;
    this.plongeon = null;
    this.plongeons = { tentes: 0, rates: 0 };
    this.fatigue = 0;
    this.horlogeConduite = 0;
    this.laisserPasser = null;
    this.panne = null;
    this.facteurMoteur = 1;
    // consigne du manager (voir CONSIGNES) : un PARAMÈTRE de la vitesse visée, pas une force
    this.consigne = 'normal';
    this.deltaVSC = 0;
    this.remorqueur = null;

    // phase 2 (voie des stands spectaculaire, voir voieDesStands.js) : ordres reçus
    this.gereParEquipe = false;
    this.attenteBox = false;
    this.arretAutorise = false;
    this.penaliteStand = 0;
    this.feuSortie = 'vert';
    this.limiteurFranchi = false;
    this.dernierArretAuStand = null;

    // ce que le debug et le dessin montrent : dernières forces, cibles, cône
    this.forces = {};
    this.cibles = {};
    this.obstacle = null;
    this.chevauchement = false;
    this.freine = false;
    this.braquage = 0;
  }

  get vitesse() {
    return this.vel.mag();
  }

  // Direction de la voiture : celle de sa vitesse, ou celle de la piste à l'arrêt.
  get cap() {
    return this.vitesse > 0.2 ? this.vel.heading() : this.capRepos;
  }

  // Les quatre coins d'un rectangle longueur × largeur centré sur la voiture et tourné comme sa
  // carrosserie (en glisse, le cap de la carrosserie) : { x, y } dans le monde.
  chassis(longueur, largeur) {
    const a = this.glisseActive ? this.capCarrosserie : this.cap;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([u, v]) => {
      const lx = u * longueur / 2;
      const ly = v * largeur / 2;
      return { x: this.pos.x + lx * c - ly * s, y: this.pos.y + lx * s + ly * c };
    });
  }

  // Les quatre roues (limites de piste) et les quatre coins de la carrosserie (contacts).
  roues() {
    return this.chassis(VoitureF1.EMPATTEMENT, VoitureF1.VOIE);
  }

  coins() {
    return this.chassis(VoitureF1.LONGUEUR, VoitureF1.LARGEUR);
  }

  // Distance parcourue depuis le départ (tours entiers + position sur le tour) : sert au classement.
  get progression() {
    return this.tour * this.circuit.longueur + this.indicePiste * this.circuit.pas;
  }

  get toursCompletes() {
    return Math.max(0, this.tour);
  }

  get auStand() {
    return this.etat === VoitureF1.ETATS.STAND;
  }

  // Arrêtée dans son box (arrêt au stand ou garage) : elle ne compte plus dans la file sur la piste.
  get dansSonBox() {
    const { ARRET, GARAGE } = VoitureF1.PHASES_STAND;
    return this.auStand && (this.phaseStand === ARRET || this.phaseStand === GARAGE);
  }

  passerA(etat) {
    this.etat = etat;
    this.chronoEtat = 0;
  }

  // Glisse réaliste activée dans le panneau ? (Pas pour la safety car : sansGlisse.)
  get glisseActive() {
    return Boolean(this.parametres.glisseRealiste) && !this.sansGlisse;
  }

  // La glisse joue-t-elle en ce moment ? En piste seulement : pas sur la grille, ni au stand, ni
  // au parc (manœuvres lentes), ni remorquée.
  get glisseEnJeu() {
    const { DEPART, COURSE, DRAPEAU, ARRIVEE, BLOQUEE, ACCIDENT, PANNE } = VoitureF1.ETATS;
    return this.glisseActive && [DEPART, COURSE, DRAPEAU, ARRIVEE, BLOQUEE, ACCIDENT, PANNE].includes(this.etat);
  }

  // Immobilisée hors de la course (bloquée, accidentée, en panne, remorquée) : une zone de danger.
  get immobilisee() {
    return VoitureF1.IMMOBILISEES.includes(this.etat);
  }

  // Hors course : abandon (garée), immobilisée, ou garée au stand après une panne.
  get horsCourse() {
    return this.immobilisee || this.etat === VoitureF1.ETATS.ABANDON;
  }

  // Accident (contact avec le mur, ou avec une autre voiture pour le joueur) : elle freine
  // jusqu'à l'arrêt.
  accidenter() {
    this.demandeStand = false;
    this.phaseStand = null;
    this.plongeon = null;
    this.laisserPasser = null;
    this.passerA(VoitureF1.ETATS.ACCIDENT);
  }

  // Panne moteur (Course) : 'partielle' (maxSpeed réduit, puis stand et abandon) ou 'totale' (la
  // voiture se range sur le bord et s'arrête).
  subirPanne(type) {
    if (!['partielle', 'totale'].includes(type)) throw new RangeError(`Panne inconnue : ${type}.`);
    if (this.panne !== null || this.horsCourse) return false;
    this.panne = { type, age: 0, cote: this.ecartLateral >= 0 ? 1 : -1 };
    if (type === 'partielle') this.demanderStand();
    return true;
  }

  // La dépanneuse est arrivée : la voiture la suit (arrive vers l'attelage).
  remorquer(commissaire) {
    this.remorqueur = commissaire;
    this.passerA(VoitureF1.ETATS.REMORQUEE);
  }

  // Remorquée jusqu'au poste des commissaires : elle y reste garée, hors course.
  garerHorsPiste() {
    this.remorqueur = null;
    this.place = { x: this.pos.x, y: this.pos.y };
    this.passerA(VoitureF1.ETATS.ABANDON);
  }

  // Ordre d'équipe (Course) : laisser passer son coéquipier, du côté `cote` (+1 / -1).
  laisserPasserCoequipier(coequipier, cote) {
    this.laisserPasser = { coequipier, cote, age: 0 };
  }

  // La voiture glisse visiblement : dérive au-delà du seuil, roues bloquées, ou fort sous-virage.
  get glisseVisible() {
    if (!this.glisseActive || this.vitesse < 1) return false;
    return Math.abs(this.derive) > this.parametres.seuilGlisse || this.etatPneus.blocage || this.etatPneus.sousVirage > 0.3;
  }

  // IA de course avancée activée dans le panneau ?
  get iaAvancee() {
    return Boolean(this.parametres.iaAvancee);
  }

  // Multiplicateurs de la personnalité (neutres si l'IA avancée est désactivée).
  get traits() {
    return this.iaAvancee ? Personnalites.PROFILS[this.personnalite] : Personnalites.NEUTRE;
  }

  // La personnalité change (menu du panneau, pour la voiture choisie).
  changerDePersonnalite(nom) {
    if (!Object.hasOwn(Personnalites.PROFILS, nom)) throw new RangeError(`Personnalité inconnue : ${nom}.`);
    this.personnalite = nom;
  }

  // Écart de vitesse ou de distance en secondes jusqu'à une voiture (distance le long de la
  // piste, divisée par la vitesse de la plus lente des deux ; Infinity si personne).
  static secondes(suivi) {
    if (suivi === null) return Infinity;
    return suivi.distance / Math.max(0.5, suivi.vehicule.vel.mag()) / 60;
  }

  // --- Ordres du directeur de course (Course) ---------------------------------------------------

  // Les feux s'éteignent : la voiture part après son temps de réaction.
  demarrer() {
    if (this.etat === VoitureF1.ETATS.GRILLE) this.passerA(VoitureF1.ETATS.DEPART);
  }

  // Safety car : en file, sans dépasser. Une voiture au stand le saura en sortant.
  neutraliser() {
    const { COURSE, DEPART, DRAPEAU } = VoitureF1.ETATS;
    if (this.etat === COURSE || this.etat === DEPART) this.passerA(DRAPEAU);
    else if (this.auStand && this.etatApresStand === COURSE) this.etatApresStand = DRAPEAU;
  }

  // Fin de la safety car : la course reprend.
  relancer() {
    const { COURSE, DRAPEAU } = VoitureF1.ETATS;
    if (this.etat === DRAPEAU) this.passerA(COURSE);
    else if (this.auStand && this.etatApresStand === DRAPEAU) this.etatApresStand = COURSE;
  }

  // Drapeau à damier pour cette voiture : tour de décélération, puis garage.
  terminer() {
    this.arrivee = true;
    if (this.auStand) {
      this.etatApresStand = VoitureF1.ETATS.ARRIVEE;
    } else {
      this.passerA(VoitureF1.ETATS.ARRIVEE);
    }
  }

  // Pneus usés ou incident : elle rentrera au stand au prochain passage devant la voie.
  demanderStand() {
    this.demandeStand = true;
  }

  // Incident léger : la voiture perd de la vitesse jusqu'à son passage au stand.
  subirIncident() {
    this.incident = true;
    this.demanderStand();
  }

  // Fin de partie : la voiture rejoint une place fixe avec arrive (podium, ou là où elle est) et
  // s'y arrête. Rien d'autre ne la pilote.
  entrerAuParc(place) {
    this.place = { x: place.x, y: place.y };
    this.phaseStand = null;
    this.passerA(VoitureF1.ETATS.PARC);
  }

  // --- ETAPE 1 : perception et transitions -------------------------------------------------------

  // contexte (fourni par Course, facultatif) : devant / derriere ({ vehicule, distance } le long
  // de la piste, ou null), voisins (grille spatiale), meteo.
  decide(contexte = {}) {
    const circuit = this.circuit;
    const { DEPART, COURSE, STAND, DRAPEAU, ARRIVEE } = VoitureF1.ETATS;
    const { ENTREE, ARRET, SORTIE, GARAGE } = VoitureF1.PHASES_STAND;

    // où suis-je sur la piste ? La ligne d'arrivée est le point 0 : la franchir change de tour.
    const precedent = this.indicePiste;
    this.indicePiste = circuit.projeter(this.pos.x, this.pos.y, precedent, circuit.fenetrePour(this.vitesse));
    this.ligneFranchie = false;
    if (precedent > circuit.n * 0.75 && this.indicePiste < circuit.n * 0.25) {
      this.tour++;
      this.ligneFranchie = true;
    } else if (precedent < circuit.n * 0.25 && this.indicePiste > circuit.n * 0.75) {
      this.tour--;
    }
    this.ecartLateral = circuit.ecartLateral(this.pos.x, this.pos.y, this.indicePiste);
    if (this.vitesse > 0.2) this.capRepos = this.vel.heading();
    // sur quoi roule-t-elle ? (asphalte partout sans carte des surfaces)
    this.surface = this.surfaces === null ? 'asphalte' : this.surfaces.surface(this.indicePiste, this.ecartLateral, VoitureF1.LARGEUR / 2);
    // glisse réaliste : dans le gravier, presque à l'arrêt depuis un moment, elle est enlisée
    if (this.glisseActive && [DEPART, COURSE, DRAPEAU].includes(this.etat) && this.enlisement >= VoitureF1.DUREE_ENLISEMENT) {
      this.passerA(VoitureF1.ETATS.BLOQUEE);
    }

    if (this.etat === DEPART && this.chronoEtat >= VoitureF1.DUREE_DEPART) this.passerA(COURSE);
    this.percevoirLesAutres(contexte);
    this.percevoirLesIncidents(contexte);

    // entrée de la voie des stands : demandée (pneus, incident) ou course finie (garage)
    const veutRentrer = this.demandeStand || this.etat === ARRIVEE;
    if (veutRentrer && [COURSE, DRAPEAU, ARRIVEE].includes(this.etat) && this.box !== null &&
      circuit.distanceDevant(this.indicePiste, circuit.stands.debut) < 3 * circuit.pas) {
      this.etatApresStand = this.etat === ARRIVEE ? ARRIVEE : this.etat;
      this.passerA(STAND);
      this.phaseStand = ENTREE;
      this.indiceVoie = 0;
    }

    if (this.etat !== STAND) return;
    this.indiceVoie = circuit.projeterStands(this.pos.x, this.pos.y, this.indiceVoie);
    // (avec une équipe de stand : pas tant que la coéquipière occupe le box)
    if (this.phaseStand === ENTREE && !this.attenteBox && this.indiceVoie >= this.box.indiceVoie - VoitureF1.APPROCHE_BOX / circuit.pas) {
      this.phaseStand = this.etatApresStand === ARRIVEE ? GARAGE : ARRET;
      this.arret = 0;
    } else if (this.phaseStand === ARRET && this.panne !== null) {
      // panne partielle : la voiture abandonne dans son box (elle y reste, par arrive)
      this.place = { x: this.box.x, y: this.box.y };
      this.phaseStand = null;
      this.indiceVoie = -1;
      this.passerA(VoitureF1.ETATS.ABANDON);
    } else if (this.phaseStand === ARRET && (this.gereParEquipe ? this.arretAutorise : this.arret >= this.dureeArret + this.penaliteStand)) {
      // arrêt terminé : libérée par son équipe (lollipop), ou au bout de sa durée (et d'une pénalité)
      this.arretAutorise = false;
      this.penaliteStand = 0;
      // arrêt terminé : pneus neufs (du type demandé), réparation, et on repart
      this.pneus = 1;
      this.temperaturePneus = VoitureF1.TEMPERATURE_DEPART;
      this.platDePneu = 0;
      if (this.pneuDemande !== null) this.typePneus = this.pneuDemande;
      this.pneuDemande = null;
      this.incident = false;
      this.demandeStand = false;
      this.arretsAuStand++;
      this.phaseStand = SORTIE;
    } else if (this.phaseStand === SORTIE && this.indiceVoie >= circuit.stands.points.length - 3) {
      this.phaseStand = null;
      this.indiceVoie = -1;
      this.passerA(this.etatApresStand);
    }
  }

  // Dans le sillage d'une autre voiture : sur la même trajectoire, à moins d'un rayon de côté.
  dansLeSillageDe(autre) {
    return Math.abs(this.ecartLateral - autre.ecartLateral) < this.r;
  }

  // Le virage dans lequel se trouve la voiture, ou null.
  virageCourant() {
    return this.circuit.virages.find(v => this.circuit.dansIntervalle(this.indicePiste, v.debut, v.fin)) ?? null;
  }

  // IA avancée : perception des autres voitures et choix des comportements de l'image. Ne calcule
  // aucune force : applyBehaviors lit ces décisions.
  percevoirLesAutres({ devant = null, derriere = null, voisins = [], meteo = null } = {}) {
    const p = this.parametres;
    const circuit = this.circuit;
    this.devant = devant;
    this.derriere = derriere;
    this.meteo = meteo;
    this.aspiration = 0;
    this.duel = null;
    this.drapeauBleu = false;
    if (!this.iaAvancee || this.etat !== VoitureF1.ETATS.COURSE) {
      this.defense.cote = 0;
      return;
    }

    // ASPIRATION : dans le sillage de la voiture de devant, assez près
    if (devant !== null && devant.distance < p.distanceAspiration && this.dansLeSillageDe(devant.vehicule)) {
      this.aspiration = 1 - devant.distance / p.distanceAspiration;
    }

    // DUEL : une voiture côte à côte (moins d'une longueur d'écart, sur le côté). Les écarts sont
    // mesurés dans le repère de la PISTE (le long de la piste, et par l'écart à la ligne
    // centrale), pas dans celui du cap : une voiture qui rejoint sa trajectoire en biais ferait
    // tourner le repère, et sa voisine paraîtrait devant ou derrière alors qu'elle est à côté.
    let plusProche = Infinity;
    for (const autre of voisins) {
      const indiceAutre = autre.indicePiste ?? circuit.projeter(autre.pos.x, autre.pos.y);
      let long = circuit.distanceDevant(this.indicePiste, indiceAutre);
      if (long > circuit.longueur / 2) long -= circuit.longueur;
      const lat = circuit.ecartLateral(autre.pos.x, autre.pos.y, circuit.indice(indiceAutre)) - this.ecartLateral;
      if (Math.abs(long) < VoitureF1.LONGUEUR && Math.abs(lat) < VoitureF1.LATERAL_DUEL && Math.abs(lat) < plusProche) {
        plusProche = Math.abs(lat);
        this.duel = { vehicule: autre, lat };
      }
    }

    const virage = circuit.prochainVirage(this.indicePiste, circuit.longueur);
    const courant = this.virageCourant();

    // DÉFENSE : une nouvelle ligne droite commence quand le virage qui la termine change. La clé
    // est ce virage et le tour où la voiture l'atteindra : elle ne change pas quand la voiture
    // passe la ligne d'arrivée au milieu de la ligne droite des stands.
    const tourDuVirage = virage === null ? this.tour : this.tour + (virage.apex < this.indicePiste ? 1 : 0);
    const cle = virage === null ? null : `${tourDuVirage}:${virage.apex}`;
    if (cle !== this.defense.cle) this.defense = { cle, utilisee: false, cote: 0 };
    const attaque = derriere !== null && derriere.distance < p.distanceAspiration &&
      derriere.vehicule.dansLeSillageDe && derriere.vehicule.dansLeSillageDe(this);
    const doublee = derriere !== null && derriere.vehicule.progression - this.progression > circuit.longueur / 2;
    const combatif = this.traits.depassement >= VoitureF1.DEFENSE_MIN;
    if (courant === null && attaque && !doublee && combatif && !this.defense.utilisee && virage !== null && this.laisserPasser === null) {
      // un seul changement de ligne défensif par ligne droite : vers l'intérieur du virage
      this.defense.utilisee = true;
      this.defense.cote = virage.sens;
      this.changementsDefense.set(cle, (this.changementsDefense.get(cle) ?? 0) + 1);
    }

    // DRAPEAU BLEU : celle qui arrive derrière a un tour d'avance
    this.drapeauBleu = doublee && derriere.distance < VoitureF1.PORTEE_DRAPEAU_BLEU;
    if (this.drapeauBleu) this.defense.cote = 0;

    // ERREUR : tirée en entrant dans un virage (plus probable sous la pluie, sans adhérence)
    if (courant !== null && courant !== this.dernierVirage) {
      this.dernierVirage = courant;
      const pluie = 1 + 2 * this.humidite * (1 - Math.min(1, this.adherence));
      const probabilite = Math.min(1, p.frequenceErreurs * this.traits.erreurs * pluie);
      if (this.erreur <= 0 && probabilite > 0 && this.alea() < probabilite) {
        this.erreur = VoitureF1.DUREE_ERREUR;
        this.erreurs++;
        // le point de wander part vers l'extérieur du virage (un paramètre du comportement)
        this.wanderTheta = -courant.sens * 1.2;
      }
    }
  }

  // Phase 1 : ce que Course fait percevoir (contexte : vsc, zonesDanger, secteursJaunes) et ce
  // que la voiture en décide. Ne calcule aucune force.
  percevoirLesIncidents({ vsc = null, zonesDanger = [], secteursJaunes = null } = {}) {
    const p = this.parametres;
    const circuit = this.circuit;
    const { COURSE, DRAPEAU, PANNE } = VoitureF1.ETATS;
    const enPiste = this.etat === COURSE || this.etat === DRAPEAU;
    this.vsc = enPiste ? vsc : null;
    this.jaune = enPiste && secteursJaunes !== null && secteursJaunes.has(circuit.secteur(this.indicePiste));
    // DANGER : la zone la plus proche devant, à moins de PORTEE_DANGER le long de la piste
    this.danger = null;
    if (enPiste) {
      let plusProche = VoitureF1.PORTEE_DANGER;
      for (const zone of zonesDanger) {
        if (zone.vehicule === this) continue;
        const d = circuit.distanceDevant(this.indicePiste, zone.indice);
        if (d < plusProche) {
          plusProche = d;
          this.danger = { ...zone, distance: d };
        }
      }
    }
    // FATIGUE : grandit avec les tours faits (selon le pilote), si l'option est active
    this.fatigue = p.fatigue ? Math.min(1, this.toursCompletes * (p.tauxFatigue ?? VoitureF1.TAUX_FATIGUE) * (this.traits.fatigue ?? 1)) : 0;
    // ORDRE D'ÉQUIPE : il se termine quand le coéquipier est passé (ou trop tard)
    if (this.laisserPasser !== null) {
      const l = this.laisserPasser;
      const passe = l.coequipier.progression > this.progression + VoitureF1.LONGUEUR * 1.5;
      if (passe || l.age > VoitureF1.DUREE_ORDRE || this.etat !== COURSE) this.laisserPasser = null;
    }
    // PANNE TOTALE : rangée sur le bord (presque arrêtée), elle s'immobilise
    if (this.panne !== null && this.panne.type === 'totale' && enPiste && this.facteurMoteur < 0.05 && this.vitesse < 0.3) {
      this.passerA(PANNE);
    }
    this.deciderPlongeon();
  }

  // DOUBLAGE AU FREINAGE : collée à la voiture de devant (ou côte à côte), à l'approche d'un
  // virage dont l'intérieur est libre, la voiture plonge : elle freinera plus tard et visera un
  // apex retardé, à l'intérieur. Le risque de partir large est tiré une fois, au départ du plongeon.
  deciderPlongeon() {
    const p = this.parametres;
    const circuit = this.circuit;
    if (this.plongeon !== null) {
      // le plongeon finit une fois l'apex passé
      const d = circuit.distanceDevant(this.indicePiste, this.plongeon.virage.apex);
      if (d > circuit.longueur / 2 || this.etat !== VoitureF1.ETATS.COURSE) this.plongeon = null;
      return;
    }
    if (!p.plongeon || !this.iaAvancee || this.etat !== VoitureF1.ETATS.COURSE || this.vsc !== null || this.jaune) return;
    const devant = this.devant;
    const colle = devant !== null && devant.distance < VoitureF1.PORTEE_PLONGEON && devant.vehicule instanceof VoitureF1 &&
      !devant.vehicule.horsCourse;
    if (!colle) return;
    const virage = circuit.prochainVirage(this.indicePiste, this.rayonDeFreinage() * 1.3);
    if (virage === null || this.virageCourant() !== null) return;
    // l'intérieur est libre : la voiture de devant n'y est pas
    const ecartAutre = devant.vehicule.ecartLateral;
    if (virage.sens * ecartAutre > this.r) return;
    // sur piste mouillée, le pilote plonge bien moins souvent
    if (this.alea() > Math.min(1, 0.5 * this.envieDeDepasser()) * (1 - 0.7 * this.humidite)) return;
    const rate = this.alea() < (p.risquePlongeon ?? VoitureF1.RISQUE_PLONGEON) * (this.traits.erreurs ?? 1);
    this.plongeon = { virage, cible: devant.vehicule, rate, declenche: false };
    this.plongeons.tentes++;
  }

  // Dans son box et presque à l'arrêt.
  estArreteeAuBox() {
    return this.box !== null && p5.Vector.dist(this.pos, createVector(this.box.x, this.box.y)) < VoitureF1.TOLERANCE_BOX &&
      this.vitesse < VoitureF1.VITESSE_ARRETEE;
  }

  // --- ETAPE 2 : pilotage ------------------------------------------------------------------------

  // Vitesse de base de la voiture : réglage global, caractéristique propre, pneus, carburant,
  // incident. (Ce sont des paramètres ; aucune vitesse n'est écrite.)
  // Mode manager : la consigne d'allure (attaque, normal, economie). Une consigne inconnue est refusée.
  consigner(nom) {
    if (!Object.hasOwn(VoitureF1.CONSIGNES, nom)) throw new RangeError(`Consigne inconnue : ${nom}.`);
    this.consigne = nom;
  }

  vitesseDeBase() {
    let v = this.parametres.vitesseMax * this.facteurVitesse;
    v *= 1 - VoitureF1.PERTE_PNEUS * (1 - this.pneus);
    v *= 1 - VoitureF1.EFFET_CARBURANT * this.carburant;
    if (this.incident) v *= VoitureF1.RALENTISSEMENT_INCIDENT;
    v *= VoitureF1.CONSIGNES[this.consigne].vitesse;
    return v * this.facteurMoteur;
  }

  // Profil de vitesse de CETTE voiture sur la ligne de course (mémorisé par le circuit). maxForce
  // contient déjà l'adhérence ; l'accélération latérale la reprend une fois de plus, pour que la
  // vitesse de virage (racine de aLat / courbure) soit multipliée par l'adhérence.
  profil() {
    const arrondi = (x, n) => Math.round(x * n) / n;
    return this.circuit.profilVitesse(arrondi(this.vitesseDeBase(), 50),
      arrondi(this.maxForce * VoitureF1.PART_LATERALE * this.adherence, 1000),
      arrondi(this.maxForce * VoitureF1.PART_FREINAGE, 1000));
  }

  // Adhérence du moment : celle du pneu monté sur la piste du moment (l'humidité vue par les
  // pneus est celle de la météo, multipliée par l'effet réglé dans le panneau).
  mettreAJourAdherence(meteo) {
    this.humidite = meteo ? meteo.humidite * (this.parametres.effetAdherence ?? 1) : 0;
    this.adherence = Pneus.adherence(this.typePneus, this.humidite);
  }

  // Modulation de maxSpeed et maxForce pour cette image, selon l'état et la position.
  moduler(devant, meteo = null) {
    const { GRILLE, STAND, DRAPEAU, ARRIVEE, COURSE, PARC } = VoitureF1.ETATS;
    this.mettreAJourAdherence(meteo);
    this.maxForce = this.parametres.forceMax * this.facteurForce * this.adherence;
    const base = this.vitesseDeBase();
    // vitesse plus faible en virage : le profil anticipe le freinage
    const profil = this.profil();
    let vitesse = Math.min(base, profil[this.indicePiste]);
    // glisse réaliste : la vitesse de virage du profil ne peut pas freiner la voiture plus que ses
    // pneus (sinon une voiture sans adhérence ralentirait quand même avant le virage) : elle baisse
    // au plus de la capacité de freinage de l'image précédente ; ce sont les forces qui freinent.
    // (Les plafonds imposés plus bas, stand, safety car, restent des limites de règlement.)
    const capacites = this.etatPneus.capacites;
    if (this.glisseEnJeu && capacites !== null) vitesse = Math.max(vitesse, Math.min(base, this.vitesse - capacites.freinage));
    // ASPIRATION : bonus proportionnel à la proximité, plafonné, en ligne droite seulement. Hors
    // du sillage, il disparaît en DUREE_ELAN secondes au lieu de tomber d'un coup : la vitesse
    // gagnée ne s'évanouit pas à l'instant où la voiture déboîte (vel.limit(maxSpeed), dans la
    // locomotion de Vehicle, la couperait net et aucun dépassement n'aboutirait).
    this.elan = Math.max(this.bonusAspiration, this.elan ?? 0);
    if (profil[this.indicePiste] < base * 0.97) this.elan = 0;
    if (this.elan > 0) vitesse = base * (1 + this.elan);
    if (this.erreur > 0) vitesse *= VoitureF1.VITESSE_ERREUR;
    // DUEL : un pilote peu combatif (envie de dépasser < 1) cède, il lève un peu le pied
    if (this.duel !== null) vitesse *= 1 - VoitureF1.CEDER * Math.max(0, 1 - this.traits.depassement);
    // DRS : sur une ligne droite, à moins de ECART_DRS de la voiture de devant, mais derrière
    // elle (au moins une longueur) : côte à côte, celle qui est doublée ne l'a pas
    this.drs = this.etat === COURSE && devant !== null && devant.distance < VoitureF1.ECART_DRS &&
      devant.distance >= VoitureF1.LONGUEUR && this.circuit.dansZoneDRS(this.indicePiste);
    if (this.drs) vitesse = Math.max(vitesse, base * (1 + VoitureF1.BONUS_DRS));
    // VSC : le même profil réduit pour toutes (les écarts sont gardés), ni DRS ni aspiration
    if (this.vsc !== null) {
      this.drs = false;
      this.elan = 0;
      vitesse = Math.min(vitesse, this.limiteVSC());
      // on ne double pas sous VSC : collée à la voiture de devant (le long de la piste), pas
      // plus vite qu'elle, même décalée sur le côté
      if (devant !== null && devant.distance < VoitureF1.COLLE_VSC) vitesse = Math.min(vitesse, devant.vehicule.vel.mag());
    }
    if (this.jaune) vitesse = Math.min(vitesse, base * VoitureF1.VITESSE_JAUNE);
    if (this.laisserPasser !== null) vitesse = Math.min(vitesse, base * VoitureF1.VITESSE_ORDRE);
    if (this.etat === GRILLE) vitesse = VoitureF1.VITESSE_GRILLE;
    // limiteur : avec la voie des stands spectaculaire, seulement après la ligne blanche (avant,
    // la voiture doit freiner elle-même ; la franchir trop vite est pénalisé)
    const avantLaLigne = this.gereParEquipe && this.phaseStand === VoitureF1.PHASES_STAND.ENTREE &&
      this.indiceVoie < this.circuit.stands.limiteur;
    if (this.etat === STAND && !avantLaLigne) vitesse = Math.min(vitesse, VoitureF1.VITESSE_STANDS);
    if (this.etat === STAND && avantLaLigne) vitesse = Math.min(vitesse, this.vitesseAvantLimiteur());
    if (this.etat === DRAPEAU) vitesse = Math.min(vitesse, this.parametres.vitesseSafetyCar * VoitureF1.FACTEUR_NEUTRALISATION);
    if (this.etat === ARRIVEE) vitesse *= VoitureF1.RALENTISSEMENT_ARRIVEE;
    if (this.etat === PARC) vitesse = VoitureF1.VITESSE_STANDS;
    if (this.etat === VoitureF1.ETATS.BLOQUEE || this.etat === VoitureF1.ETATS.ACCIDENT || this.etat === VoitureF1.ETATS.PANNE) {
      vitesse = Math.min(vitesse, Math.max(VoitureF1.VITESSE_ARRETEE, this.vitesse));
    }
    if (this.etat === VoitureF1.ETATS.REMORQUEE) vitesse = this.remorqueur ? this.remorqueur.maxSpeed * 1.2 : VoitureF1.VITESSE_ARRETEE;
    if (this.etat === VoitureF1.ETATS.ABANDON) vitesse = VoitureF1.VITESSE_STANDS;
    this.maxSpeed = vitesse;
  }

  // VSC : la vitesse permise ici (profil de référence × facteur courant, donné par Course).
  limiteVSC() {
    return this.vsc.profil[this.indicePiste] * this.vsc.facteur;
  }

  // Bonus de vitesse dû à l'aspiration, en part de la vitesse de base (0 hors du sillage).
  get bonusAspiration() {
    return this.aspiration > 0 ? this.parametres.bonusAspiration * Math.min(1, this.aspiration) : 0;
  }

  // Debug de l'IA avancée : cône d'aspiration (un couloir étroit devant, de la distance
  // d'aspiration), le sillage suivi, le point de dépassement visé, le duel.
  showDebugCourse() {
    const p = this.parametres;
    const cap = this.cap;
    const cx = Math.cos(cap);
    const cy = Math.sin(cap);
    push();
    noFill();
    strokeWeight(1);
    stroke(this.aspiration > 0 ? 'red' : 'yellow');
    const r = this.r;
    for (const cote of [-1, 1]) {
      line(this.pos.x - cy * r * cote, this.pos.y + cx * r * cote,
        this.pos.x + cx * p.distanceAspiration - cy * r * cote, this.pos.y + cy * p.distanceAspiration + cx * r * cote);
    }
    if (this.aspiration > 0 && this.devant !== null) {
      stroke(255, 80, 80);
      line(this.pos.x, this.pos.y, this.devant.vehicule.pos.x, this.devant.vehicule.pos.y);
    }
    if (Math.abs(this.decalageDepassement) > 1 && this.cibles.seek) {
      noStroke();
      fill(255, 0, 255);
      circle(this.cibles.seek.x, this.cibles.seek.y, 8);
    }
    if (this.duel !== null) {
      stroke(255, 160, 0);
      strokeWeight(2);
      line(this.pos.x, this.pos.y, this.duel.vehicule.pos.x, this.duel.vehicule.pos.y);
    }
    if (this.erreur > 0) {
      noStroke();
      fill(255, 0, 0, 120);
      circle(this.pos.x, this.pos.y, this.r * 3);
    }
    pop();
  }

  // flee est vide dans Vehicle : on emprunte celle de Particule (seek vers le point symétrique de
  // la cible : vitesse désirée opposée, force limitée à maxForce, valeur retournée).
  flee(cible) {
    return Particule.prototype.flee.call(this, cible);
  }

  // Force qui garde la voiture sur la piste (ou sur la voie des stands). Remplace boundaries()
  // de Vehicle, qui renvoie une vitesse et non une force. On regarde l'écart latéral ACTUEL et
  // celui qu'aura la voiture dans ANTICIPATION_BORD images à la même vitesse (elle réagit avant
  // d'atteindre le bord). Dans le couloir : force nulle. Au-delà, la vitesse désirée garde la
  // direction de la piste et revient vers l'intérieur d'autant plus que l'écart est grand ;
  // force = vitesse désirée - vitesse, limitée à maxForce.
  garderSurPiste() {
    const circuit = this.circuit;
    let ecart;
    let limite;
    let tangente;
    let normale;
    if (this.auStand) {
      const { ARRET, GARAGE } = VoitureF1.PHASES_STAND;
      // dans son box, elle a quitté la voie exprès
      if (this.phaseStand === ARRET || this.phaseStand === GARAGE) return createVector(0, 0);
      const k = this.indiceVoie;
      const voie = circuit.stands.points;
      tangente = circuit.stands.tangentes[k];
      normale = { x: -tangente.y, y: tangente.x };
      ecart = (this.pos.x - voie[k].x) * normale.x + (this.pos.y - voie[k].y) * normale.y;
      limite = VoitureF1.DEMI_LARGEUR_VOIE;
    } else {
      tangente = circuit.tangentes[this.indicePiste];
      normale = circuit.normales[this.indicePiste];
      ecart = this.ecartLateral;
      limite = circuit.largeur / 2 - this.r / 2 - VoitureF1.MARGE_PISTE;
    }
    const vitesseLaterale = this.vel.x * normale.x + this.vel.y * normale.y;
    const futur = ecart + vitesseLaterale * VoitureF1.ANTICIPATION_BORD;
    // le pire des deux écarts, du côté où la voiture va
    if (Math.abs(futur) > Math.abs(ecart)) ecart = futur;
    if (Math.abs(ecart) <= limite) return createVector(0, 0);

    const retour = Math.min(1, (Math.abs(ecart) - limite) / VoitureF1.MARGE_PISTE);
    const desiree = createVector(tangente.x - normale.x * Math.sign(ecart) * retour,
      tangente.y - normale.y * Math.sign(ecart) * retour);
    desiree.setMag(this.maxSpeed);
    const force = p5.Vector.sub(desiree, this.vel);
    force.limit(this.maxForce);
    return force;
  }

  // Applique une force pondérée et la garde pour le debug. Glisse réaliste : les forces de pilotage
  // s'ajoutent à la demande faite aux pneus (transmise en une seule force par transmettreAuxPneus) ;
  // les réflexes (évitement, rappel sur la piste) sont appliqués directement, mais seulement sur
  // l'asphalte et les vibreurs : dans l'herbe ou le gravier, tout passe par les pneus (et
  // l'enlisement), sinon le rappel sur la piste sortirait la voiture du gravier.
  appliquer(nom, force, poids) {
    force.mult(poids);
    this.forces[nom] = force;
    const reflexe = VoitureF1.REFLEXES.includes(nom) && (this.surface === 'asphalte' || this.surface === 'vibreur');
    if (this.demande !== null && !reflexe) this.demande.add(force);
    else this.applyForce(force);
  }

  // contexte : voisins (véhicules proches, trouvés par la grille spatiale), devant ({ vehicule,
  // distance } : le premier véhicule devant sur la piste, ou null), meteo (ou null).
  applyBehaviors({ voisins = [], devant = null, meteo = null } = {}) {
    const { GRILLE, DEPART, STAND, PARC, BLOQUEE } = VoitureF1.ETATS;
    this.forces = {};
    this.cibles = {};
    this.demande = this.glisseEnJeu ? createVector(0, 0) : null;
    this.moduler(devant, meteo);

    const enReaction = this.etat === DEPART && this.chronoEtat < this.reaction;
    const { ACCIDENT, PANNE, REMORQUEE, ABANDON } = VoitureF1.ETATS;
    if (this.etat === BLOQUEE || this.etat === ACCIDENT || this.etat === PANNE) {
      // enlisée, accidentée ou en panne : plus de pilotage, seulement le frein (arrive vers sa
      // propre position : vitesse désirée nulle)
      this.appliquer('arrive', this.arrive(this.pos.copy()), 1);
    } else if (this.etat === REMORQUEE) {
      this.suivreLaDepanneuse();
    } else if (this.etat === ABANDON) {
      this.rayonZoneDeFreinage = VoitureF1.RAYON_GRILLE;
      this.appliquer('arrive', this.arrive(createVector(this.place.x, this.place.y)), 1);
    } else if (this.etat === GRILLE || this.etat === PARC || enReaction) {
      this.allerSurSaPlace();
    } else if (this.etat === STAND) {
      this.conduireAuStand();
    } else {
      this.piloter(devant);
    }
    this.eviter(voisins);
    // au parc, la voiture rejoint sa place à travers le terrain : elle n'est plus tenue par la piste
    const tenue = ![PARC, BLOQUEE, ACCIDENT, PANNE, REMORQUEE, ABANDON].includes(this.etat) && !this.seRange();
    if (tenue) this.appliquer('piste', this.garderSurPiste(), VoitureF1.POIDS_PISTE);
    if (this.demande !== null) this.transmettreAuxPneus();
  }

  // Direction de la vitesse (unitaire), ou du cap à l'arrêt.
  direction() {
    const v = this.vitesse;
    return v > 0.2 ? { x: this.vel.x / v, y: this.vel.y / v } : { x: Math.cos(this.cap), y: Math.sin(this.cap) };
  }

  // Force de base des pneus : réglage du panneau × caractéristique de la voiture (sans adhérence).
  forceDeBase() {
    return this.parametres.forceMax * this.facteurForce;
  }

  // Adhérence de l'avant et de l'arrière en ce moment (voir Glisse.adherences). longitudinale =
  // la demande le long de la vitesse (pour savoir si la voiture accélère en sortie de virage).
  adherencesDuMoment(longitudinale = 0) {
    const p = this.parametres;
    const virage = this.virageCourant();
    const enSortie = virage !== null && this.circuit.dansIntervalle(this.indicePiste, virage.apex, virage.fin);
    return Glisse.adherences({
      base: this.adherence,
      globale: p.adherenceGlobale ?? 1,
      surface: this.surface,
      temperature: Glisse.facteurTemperature(Pneus.type(this.typePneus).categorie, this.temperaturePneus),
      vitesse: Math.min(1, this.vitesse / Math.max(0.1, p.vitesseMax)),
      aspiration: Math.min(1, this.aspiration),
      carburant: this.carburant,
      gomme: this.surfaces === null ? 0 : this.surfaces.bonusGomme(this.indicePiste, this.ecartLateral),
      toucher: this.traits.toucher ?? 1,
      humidite: this.humidite,
      usure: 1 - this.pneus,
      gaz: enSortie && longitudinale > 0.3 * this.maxForce ? 1 : 0,
      survirage: p.survirage ?? 1,
    });
  }

  // Glisse réaliste : la demande des comportements passe par le cercle d'adhérence (une seule
  // force appliquée), puis les forces de contact : frottement de glissement, raclement du
  // sous-virage, rappel latéral du pneu, traînée et enlisement de la surface.
  transmettreAuxPneus() {
    const p = this.parametres;
    const v = this.vitesse;
    const t = this.direction();
    const n = { x: -t.y, y: t.x };
    const base = this.forceDeBase();
    const longitudinale = this.demande.x * t.x + this.demande.y * t.y;
    const adh = this.adherencesDuMoment(longitudinale);
    const capacites = {
      laterale: base * VoitureF1.CERCLE_LATERAL * adh.avant / Math.max(0.05, p.sousVirage ?? 1),
      freinage: base * VoitureF1.CERCLE_FREIN * adh.avant,
      motricite: base * VoitureF1.CERCLE_MOTRICITE * adh.arriere,
      totale: base * VoitureF1.CERCLE_TOTAL * adh.avant,
    };
    const r = Glisse.cercle(this.demande, t, capacites);
    const pneus = createVector(r.x, r.y);
    this.forces.pneus = pneus;
    this.applyForce(pneus);
    this.etatPneus = {
      sousVirage: r.sousVirage,
      blocage: r.blocage,
      charge: Math.min(1, Math.abs(r.lat) / Math.max(1e-9, capacites.laterale)),
      deficit: adh.perteArriere,
      avant: adh.avant,
      arriere: adh.arriere,
      demande: { lat: r.lat, long: r.long },
      capacites,
    };
    // surface : l'enlisement retient la motricité à toute vitesse (même à l'arrêt : la voiture
    // ne peut plus repartir), la traînée freine (herbe, gravier)
    const surface = Glisse.SURFACES[this.surface];
    if (surface.enlisement > 0 && pneus.mag() > 0) {
      const enlisement = pneus.copy().setMag(-Math.min(pneus.mag(), surface.enlisement * base));
      this.forces.enlisement = enlisement;
      this.applyForce(enlisement);
    }
    if (surface.trainee > 0) {
      const trainee = this.vel.copy().mult(-surface.trainee);
      this.forces.surface = trainee;
      this.applyForce(trainee);
    }
    if (v < 0.2) return;

    // frottement de glissement (dérive au-delà du seuil) et raclement du sous-virage : contre la
    // vitesse, une part de celle-ci par image
    const seuil = p.seuilGlisse ?? VoitureF1.SEUIL_GLISSE;
    let perte = VoitureF1.RACLEMENT * Math.min(1, r.sousVirage);
    if (Math.abs(this.derive) > seuil) perte += VoitureF1.FROTTEMENT * Math.min(2, (Math.abs(this.derive) - seuil) / seuil);
    perte *= p.frottementGlissement ?? 1;
    if (perte > 0) {
      const frottement = createVector(-t.x, -t.y).mult(v * Math.min(0.5, perte));
      this.forces.frottement = frottement;
      this.applyForce(frottement);
    }
    // rappel latéral : le pneu tire la vitesse vers l'axe de la carrosserie
    if (Math.abs(this.derive) > 1e-3 && v > 0.5) {
      const rappel = createVector(n.x, n.y).mult(Math.sin(this.derive) * adh.arriere * base * VoitureF1.RAPPEL_FORCE);
      this.forces.rappel = rappel;
      this.applyForce(rappel);
    }
  }

  // La conduite en piste. VoiturePilote la remplace par les commandes du joueur.
  piloter(devant) {
    this.conduire(devant);
    this.reagirAuxIncidents();
  }

  // Panne totale : la voiture se range sur le bord (pas de rappel sur la piste).
  seRange() {
    return this.panne !== null && this.panne.type === 'totale';
  }

  // ARRIVE vers une vitesse cible : la cible est un point droit devant, à `d` pixels ; avec un
  // rayon de freinage R = d × maxSpeed / vCible, la vitesse désirée de arrive (maxSpeed × d / R)
  // vaut exactement vCible. Plus rapide que vCible, la voiture freine ; plus lente, rien.
  ralentirVers(vCible, nom = 'ralentir') {
    if (this.vitesse <= vCible + 0.05) return;
    const d = 40;
    const t = this.direction();
    const cible = createVector(this.pos.x + t.x * d, this.pos.y + t.y * d);
    this.rayonZoneDeFreinage = d * this.maxSpeed / Math.max(0.1, vCible);
    this.cibles.ralentir = cible;
    this.appliquer(nom, this.arrive(cible), this.parametres.poidsArrive);
  }

  // Forces de la phase 1 : VSC (arrive vers la vitesse du profil réduit), danger (flee latéral
  // par anticipation, ralentissement), panne totale (seek vers le bord, puis arrive jusqu'à
  // l'arrêt), plongeon raté (sortie large).
  reagirAuxIncidents() {
    const base = this.vitesseDeBase();
    if (this.vsc !== null) this.ralentirVers(this.limiteVSC(), 'vsc');
    if (this.danger !== null) {
      const zone = this.danger;
      // FLEE latéral du point de danger, d'autant plus fort qu'il est proche
      const n = this.circuit.normales[this.indicePiste];
      const fuite = this.flee(createVector(zone.x, zone.y));
      const laterale = fuite.x * n.x + fuite.y * n.y;
      const proximite = 1 - zone.distance / VoitureF1.PORTEE_DANGER;
      this.appliquer('danger', createVector(n.x * laterale, n.y * laterale), VoitureF1.POIDS_DANGER * proximite);
      if (zone.distance < zone.rayon + VoitureF1.PORTEE_DANGER / 2) this.ralentirVers(base * VoitureF1.VITESSE_DANGER, 'prudence');
    }
    if (this.seRange()) {
      // panne totale : arrive vers un point du bord, devant (la vitesse s'éteint avec le moteur)
      const bord = this.circuit.largeur / 2 + VoitureF1.RANGEMENT;
      const point = this.pointDevant(60, 0, this.panne.cote * bord, false);
      this.rayonZoneDeFreinage = 120;
      this.cibles.rangement = point;
      this.appliquer('rangement', this.arrive(point), this.parametres.poidsArrive);
    }
    if (this.plongeon !== null && this.plongeon.rate && !this.plongeon.declenche) {
      // le plongeon tourne mal à l'entrée du virage : blocage et survirage, la voiture part large
      const d = this.circuit.distanceDevant(this.indicePiste, this.plongeon.virage.apex);
      if (d < this.rayonDeFreinage() * 0.6) {
        this.plongeon.declenche = true;
        this.plongeons.rates++;
        this.erreur = VoitureF1.DUREE_SORTIE_LARGE;
        this.erreurs++;
        this.wanderTheta = -this.plongeon.virage.sens * 1.2;
        this.derive += -this.plongeon.virage.sens * 0.25;
      }
    }
  }

  // Avant la ligne blanche du limiteur : la vitesse qui permet de freiner jusqu'à la vitesse des
  // stands sur la distance qui reste (v² = vStands² + 2 · décélération · distance, avec une marge).
  vitesseAvantLimiteur() {
    const s = this.circuit.stands;
    const distance = Math.max(0, (s.limiteur - this.indiceVoie) * this.circuit.pas - 12);
    return Math.sqrt(VoitureF1.VITESSE_STANDS ** 2 + 2 * this.maxForce * VoitureF1.PART_FREINAGE * distance);
  }

  // REMORQUÉE : arrive vers l'attelage, derrière la dépanneuse (d = longueur de câble).
  suivreLaDepanneuse() {
    const d = this.remorqueur;
    if (!d) return;
    const recul = d.vel.mag() > 0.1 ? d.vel.copy().setMag(-(d.r + this.r)) : createVector(0, 0);
    const attelage = createVector(d.pos.x + recul.x, d.pos.y + recul.y);
    this.rayonZoneDeFreinage = 60;
    this.cibles.arrive = attelage;
    this.appliquer('remorquage', this.arrive(attelage, 4), 2);
  }

  // ARRIVE vers son emplacement de grille (ou sa place au parc ; d = 0 : pas de recul, elle
  // s'arrête dessus).
  allerSurSaPlace() {
    this.rayonZoneDeFreinage = VoitureF1.RAYON_GRILLE;
    const place = createVector(this.place.x, this.place.y);
    this.cibles.arrive = place;
    this.appliquer('arrive', this.arrive(place), this.parametres.poidsArrive);
  }

  // Le point de la ligne de course situé `distance` pixels devant, décalé de `decalage`. Avec
  // `lateral` (un écart à la ligne centrale), le point est placé à cet écart au lieu de la ligne.
  pointDevant(distance, decalage = 0, lateral = null, borne = true) {
    const circuit = this.circuit;
    const i = circuit.indice(this.indicePiste + distance / circuit.pas);
    const limite = borne ? circuit.largeur / 2 - this.r - 4 : Infinity;
    const ecart = Math.max(-limite, Math.min(limite, (lateral ?? circuit.decalagesLigne[i]) + decalage));
    const point = circuit.pointLateral(i, ecart);
    return createVector(point.x, point.y);
  }

  // Écart latéral visé par l'IA avancée, ou null pour la ligne de course : intérieur en défense,
  // un côté chacun en duel, le centre du sillage dans l'aspiration (sans déport en cours).
  ligneVisee() {
    const circuit = this.circuit;
    const bord = circuit.largeur / 2 - this.r - VoitureF1.MARGE_DEFENSE;
    // DANGER : point de contournement, du côté opposé à la voiture arrêtée
    if (this.danger !== null) {
      const cote = this.danger.ecart >= 0 ? -1 : 1;
      const voulu = this.danger.ecart + cote * (this.danger.rayon + this.r + VoitureF1.MARGE_CONTOURNEMENT);
      return Math.max(-bord, Math.min(bord, voulu));
    }
    // ORDRE D'ÉQUIPE : sur la ligne extérieure, pour laisser passer
    if (this.laisserPasser !== null) return this.laisserPasser.cote * bord;
    // PLONGEON : à l'intérieur du virage
    if (this.plongeon !== null && !this.plongeon.declenche) return this.plongeon.virage.sens * bord;
    if (this.duel !== null) {
      const virage = circuit.prochainVirage(this.indicePiste, circuit.longueur);
      // l'autre est à gauche (lat > 0) : je prends la droite, et inversement
      const cote = -Math.sign(this.duel.lat) || (virage === null ? 1 : virage.sens);
      return cote * bord * 0.7;
    }
    if (this.defense.cote !== 0) return this.defense.cote * bord;
    if (this.aspiration > 0 && Math.abs(this.decalageDepassement) < 2 && this.devant !== null) {
      return this.devant.vehicule.ecartLateral;
    }
    return null;
  }

  // Conduite sur la piste : seek, arrive (apex, ou file derrière la safety car), wander, et les
  // comportements de l'IA avancée.
  conduire(devant) {
    const p = this.parametres;
    const { DRAPEAU, COURSE } = VoitureF1.ETATS;
    const ia = this.iaAvancee && this.etat === COURSE;

    // SEEK : point d'anticipation sur la ligne de course (ou sur la ligne visée par l'IA). Glisse :
    // au-delà du seuil de dérive, le pilote contre-braque en visant plus loin (plus droit).
    const seuil = p.seuilGlisse ?? VoitureF1.SEUIL_GLISSE;
    const contre = this.glisseActive ? 1 + VoitureF1.CONTRE_SEEK * Math.max(0, Math.abs(this.derive) - seuil) / seuil : 1;
    const anticipation = (p.anticipationSeek + VoitureF1.FACTEUR_ANTICIPATION * this.vitesse) * contre;
    const incident = this.danger !== null || this.laisserPasser !== null;
    let lateral = ia || incident ? this.ligneVisee() : null;
    // panne totale : la voiture vise le bas-côté (hors de la piste), pas la ligne de course
    if (this.seRange()) lateral = this.panne.cote * (this.circuit.largeur / 2 + VoitureF1.RANGEMENT);
    // FATIGUE : la ligne se disperse (une variation lente, propre au pilote)
    let dispersion = 0;
    if (this.fatigue > 0) dispersion = VoitureF1.FATIGUE_LIGNE * this.fatigue * Math.sin(this.horlogeConduite * 0.7 + this.numero);
    if (lateral !== null) lateral += dispersion;
    const decalage = (this.etat === COURSE ? this.decalageDepassement : 0) + (lateral === null ? dispersion : 0);
    const cible = this.pointDevant(anticipation, decalage, lateral, !this.seRange());
    if (ia && this.aspiration > 0) this.cibles.sillage = cible;
    this.cibles.seek = cible;
    this.appliquer('seek', this.seek(cible), p.poidsSeek * (this.erreur > 0 ? VoitureF1.SEEK_ERREUR : 1));

    if (this.etat === DRAPEAU) {
      this.suivreLaFile(devant);
      return;
    }

    // ARRIVE : freinage progressif vers l'apex d'un virage serré (pas pendant une erreur)
    if (this.erreur <= 0) this.freinerPourLeVirage();

    // WANDER : variation douce autour de la ligne de course ; plus faible en duel, en pic
    // pendant une erreur
    this.distanceCercle = p.distanceCercle;
    this.wanderRadius = p.wanderRadius;
    this.displaceRange = p.displaceRange;
    let poidsWander = p.poidsWander * this.traits.wander * (1 + VoitureF1.FATIGUE_WANDER * this.fatigue);
    if (ia && this.duel !== null) poidsWander *= VoitureF1.WANDER_DUEL;
    if (this.erreur > 0) poidsWander = VoitureF1.POIDS_ERREUR;
    this.appliquer('wander', this.wander(), poidsWander);
    // le point de wander ne passe jamais derrière la voiture : la variation reste latérale
    // (wanderTheta est un paramètre du comportement, pas une position)
    this.wanderTheta = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.wanderTheta));

    // DRAPEAU BLEU : flee latéral de la voiture qui la double
    if (ia && this.drapeauBleu) {
      const doubleuse = this.derriere.vehicule;
      const n = this.circuit.normales[this.indicePiste];
      // on fuit un point un peu décalé vers la ligne de course : la voiture s'en écarte, même
      // quand celle qui double est pile derrière
      const versLigne = Math.sign(this.circuit.decalagesLigne[this.indicePiste] - this.ecartLateral) || 1;
      const fuite = this.flee(createVector(doubleuse.pos.x + n.x * versLigne * 6, doubleuse.pos.y + n.y * versLigne * 6));
      const laterale = fuite.x * n.x + fuite.y * n.y;
      this.appliquer('drapeauBleu', createVector(n.x * laterale, n.y * laterale), VoitureF1.POIDS_DRAPEAU_BLEU);
    }
  }

  // Rayon de la zone de freinage : celui du panneau, plus grand sous la pluie (divisé par
  // l'adhérence), selon la personnalité, et pour la voiture à l'extérieur d'un duel.
  // À l'extérieur d'un duel, le surcroît de freinage dépend de la combativité : un pilote agressif
  // freine à peine plus tôt (il tente de passer dehors), un prudent bien plus tôt (il cède).
  rayonDeFreinage() {
    const exterieur = this.duelExterieur();
    const surcroit = (VoitureF1.FREINAGE_EXTERIEUR - 1) / Math.max(0.1, this.traits.depassement);
    const plongeon = this.plongeon !== null && !this.plongeon.declenche ? 1 - VoitureF1.RETARD_PLONGEON : 1;
    return this.parametres.rayonFreinage * this.traits.freinage / Math.max(0.5, this.adherence) *
      (exterieur ? 1 + surcroit : 1) * plongeon;
  }

  // En duel, du côté extérieur du prochain virage ? (L'autre voiture est du côté intérieur.)
  duelExterieur() {
    if (this.duel === null) return false;
    const virage = this.circuit.prochainVirage(this.indicePiste, this.circuit.longueur);
    return virage !== null && Math.sign(this.duel.lat) === virage.sens;
  }

  // ARRIVE vers l'apex du prochain virage serré, s'il est dans la zone de freinage et devant.
  //
  // Usage VOLONTAIRE du map non borné de seek : la vitesse désirée de arrive vaut
  // maxSpeed × (distance - d) / (rayon - d). Avec d = 0, elle tomberait à 0 sur l'apex (la voiture
  // s'arrêterait dans le virage). Avec d NÉGATIF, d = -vApex × rayon / (maxSpeed - vApex), elle
  // décroît de maxSpeed (début de la zone de freinage) jusqu'à vApex (sur l'apex) : un freinage
  // progressif jusqu'à la vitesse du virage, jamais jusqu'à l'arrêt. En duel, la voiture de
  // l'extérieur freine plus tôt, et chacune vise l'apex de son côté.
  freinerPourLeVirage() {
    const circuit = this.circuit;
    const rayon = this.rayonDeFreinage();
    const virage = circuit.prochainVirage(this.indicePiste, rayon);
    if (virage === null) return;
    const vApex = this.profil()[virage.apex];
    if (vApex >= this.maxSpeed - 0.1) return;
    // en duel, chacune vise l'apex sur son côté (sa ligne de duel) : elles passent le virage
    // côte à côte au lieu de se rabattre l'une sur l'autre
    const plonge = this.plongeon !== null && !this.plongeon.declenche && this.plongeon.virage === virage;
    const ecart = (this.iaAvancee && this.duel !== null) || plonge ? this.ligneVisee() : circuit.decalagesLigne[virage.apex];
    // plongeon : apex retardé (plus loin dans le virage)
    const point = circuit.pointLateral(virage.apex + (plonge ? VoitureF1.RETARD_APEX / circuit.pas : 0), ecart);
    const apex = createVector(point.x, point.y);
    const versApex = p5.Vector.sub(apex, this.pos);
    // apex derrière, sur le côté ou atteint : la voiture est dans le virage, le profil suffit
    let angle = Math.abs(versApex.heading() - this.cap);
    if (angle > Math.PI) angle = 2 * Math.PI - angle;
    if (angle > VoitureF1.ANGLE_APEX || versApex.mag() < VoitureF1.PASSAGE_APEX) return;

    this.rayonZoneDeFreinage = rayon;
    const d = -vApex * rayon / (this.maxSpeed - vApex);
    this.cibles.apex = apex;
    this.appliquer('arrive', this.arrive(apex, d), this.parametres.poidsArrive);
  }

  // Safety car : la voiture se range derrière le véhicule qui la précède (voiture ou safety car).
  //
  // Usage VOLONTAIRE du map non borné de seek : arrive(position de devant, écart) donne une
  // vitesse désirée NÉGATIVE quand la distance est inférieure à l'écart. La voiture RECULE alors
  // par rapport à sa direction (elle freine fort) : c'est ce qui garde l'écart dans la file.
  suivreLaFile(devant) {
    const p = this.parametres;
    if (devant === null || devant.distance > VoitureF1.PORTEE_FILE) return;
    const ecart = p.distanceAGarder * VoitureF1.FACTEUR_ECART_FILE;
    this.rayonZoneDeFreinage = ecart + 2 * VoitureF1.ZONE_SUIVI;
    const cible = devant.vehicule.pos.copy();
    this.cibles.file = cible;
    this.appliquer('arrive', this.arrive(cible, ecart), p.poidsArrive);
  }

  // Voie des stands : seek le long de la voie (limiteur de vitesse), arrive dans le box.
  conduireAuStand() {
    const p = this.parametres;
    const circuit = this.circuit;
    const voie = circuit.stands.points;
    const { ARRET, GARAGE } = VoitureF1.PHASES_STAND;
    if (this.phaseStand === ARRET || this.phaseStand === GARAGE) {
      // ARRIVE dans le box (ou à sa place de garage), d = 0 : elle s'y arrête sans dépasser
      const place = this.phaseStand === GARAGE ? this.garage : this.box;
      this.rayonZoneDeFreinage = p.distanceArretStand;
      const box = createVector(place.x, place.y);
      this.cibles.arrive = box;
      this.appliquer('arrive', this.arrive(box), p.poidsArrive);
      return;
    }
    const s = circuit.stands;
    const pointDeLaVoie = k => createVector(voie[k].x, voie[k].y);
    // FILE D'ATTENTE : le box est pris par la coéquipière ; ARRIVE vers sa place d'attente, dans la
    // voie de travail (entre la voie rapide et les box), derrière le box : les autres passent à côté
    if (this.phaseStand === VoitureF1.PHASES_STAND.ENTREE && this.attenteBox) {
      const attente = VoieDesStands.pointAttente(circuit, this.box, this.rangFile ?? 0);
      if (this.indiceVoie >= attente.indiceVoie - 15) {
        this.rayonZoneDeFreinage = p.distanceArretStand;
        this.cibles.arrive = createVector(attente.x, attente.y);
        this.appliquer('arrive', this.arrive(this.cibles.arrive), p.poidsArrive);
        return;
      }
    }
    // FEU DE SORTIE rouge : ARRIVE sur la ligne, on attend
    if (this.phaseStand === VoitureF1.PHASES_STAND.SORTIE && this.feuSortie === 'rouge' &&
      this.indiceVoie <= s.sortie - 1 && this.indiceVoie > s.sortie - 20) {
      this.rayonZoneDeFreinage = p.distanceArretStand;
      this.cibles.arrive = pointDeLaVoie(s.sortie - 1);
      this.appliquer('arrive', this.arrive(this.cibles.arrive), p.poidsArrive);
      return;
    }
    // LIMITEUR : avant la ligne blanche, la voiture freine (arrive vers une vitesse cible) pour la
    // franchir à la vitesse permise
    if (this.gereParEquipe && this.phaseStand === VoitureF1.PHASES_STAND.ENTREE && this.indiceVoie < s.limiteur) {
      this.ralentirVers(this.vitesseAvantLimiteur(), 'limiteur');
    }
    const k = Math.min(voie.length - 1, Math.round(this.indiceVoie + (20 + 6 * this.vitesse) / circuit.pas));
    const cible = createVector(voie[k].x, voie[k].y);
    this.cibles.seek = cible;
    this.appliquer('seek', this.seek(cible), p.poidsSeek);
  }

  // ÉVITEMENT. Voisins à moins de la portée, trouvés par la grille spatiale.
  //   séparation : chaque voisin à moins de la distance de sécurité repousse la voiture,
  //     d'autant plus qu'il est proche (direction opposée à lui, force limitée à maxForce) ;
  //     chevauchement (cas extrême) : répulsion maximale, jamais un déplacement direct ;
  //   anticipation : si, à vitesses constantes, deux voitures vont se toucher dans moins de
  //     HORIZON images, chacune s'écarte de la position future de l'autre ;
  //   cône d'anticipation : le voisin le plus proche devant, dans le cône, est suivi avec
  //     ARRIVE (écart à garder) et contourné avec FLEE (seulement la part latérale de la force) ;
  //     en course, si la voiture est plus rapide, elle se déporte pour dépasser.
  eviter(voisins) {
    const p = this.parametres;
    const { GRILLE, COURSE, STAND } = VoitureF1.ETATS;
    const cap = this.cap;
    const avant = { x: Math.cos(cap), y: Math.sin(cap) };
    const gauche = { x: -avant.y, y: avant.x };
    const separation = createVector(0, 0);
    const urgence = createVector(0, 0);
    const anticipation = createVector(0, 0);
    this.obstacle = null;
    this.chevauchement = false;
    let obstacleAvant = Infinity;
    // distance de sécurité : celle du panneau, selon le pilote, plus grande sur piste mouillée
    const securite = this.distanceDeSecurite();

    for (const autre of voisins) {
      const rel = p5.Vector.sub(autre.pos, this.pos);
      const d = rel.mag();
      if (d === 0) continue;
      const somme = this.r + autre.r;
      const loin = createVector(-rel.x / d, -rel.y / d);
      if (d < somme) this.chevauchement = true;
      // répulsion maximale juste avant le contact (et pendant, dans le cas extrême)
      if (d < somme + VoitureF1.MARGE_URGENCE) urgence.add(loin);
      if (d < securite) {
        const proximite = Math.min(1, (securite - d) / Math.max(1, securite - somme));
        separation.add(loin.mult(proximite));
      }
      // anticipation (évitement de collision « non alignée », Reynolds) : à vitesses constantes,
      // quand les deux voitures seront-elles le plus proches, et à quelle distance ? Si elles
      // se toucheraient, on s'écarte de la position future de l'autre, d'autant plus fort que
      // la rencontre est proche dans le temps
      const dvx = autre.vel.x - this.vel.x;
      const dvy = autre.vel.y - this.vel.y;
      const dv2 = dvx * dvx + dvy * dvy;
      if (dv2 > 1e-6) {
        const t = Math.max(0, Math.min(VoitureF1.HORIZON, -(rel.x * dvx + rel.y * dvy) / dv2));
        const fx = rel.x + dvx * t;
        const fy = rel.y + dvy * t;
        const futur = Math.hypot(fx, fy);
        if (futur < somme + VoitureF1.MARGE_ANTICIPATION && t > 0) {
          const urgenceFuture = 1 - t / VoitureF1.HORIZON;
          const sens = futur > 1e-6 ? createVector(-fx / futur, -fy / futur) : loin.copy();
          anticipation.add(sens.mult(urgenceFuture));
        }
      }
      const long = rel.x * avant.x + rel.y * avant.y;
      const lat = rel.x * gauche.x + rel.y * gauche.y;
      const demiLargeurCone = somme + 4 + long * Math.tan(VoitureF1.ANGLE_CONE);
      if (long > 0 && long < p.porteeEvitement && Math.abs(lat) < demiLargeurCone && long < obstacleAvant) {
        obstacleAvant = long;
        this.obstacle = { vehicule: autre, long, lat };
      }
    }

    if (separation.mag() > 0) {
      separation.setMag(this.maxForce * Math.min(1, separation.mag()));
      // en duel, roue contre roue : séparation fine renforcée
      const duel = this.iaAvancee && this.duel !== null ? VoitureF1.SEPARATION_DUEL : 1;
      this.appliquer('separation', separation, p.poidsSeparation * duel);
    }
    if (anticipation.mag() > 0) {
      anticipation.setMag(this.maxForce * Math.min(1, anticipation.mag()));
      this.appliquer('anticipation', anticipation, p.poidsSeparation);
    }
    if (urgence.mag() > 0) {
      urgence.setMag(this.maxForce);
      this.appliquer('urgence', urgence, VoitureF1.POIDS_URGENCE);
    }

    if (this.obstacle === null || this.etat === GRILLE) {
      this.decalageDepassement = this.rapprocher(this.decalageDepassement, 0, VoitureF1.DEPORT / 2);
      return;
    }
    const { vehicule, long, lat } = this.obstacle;

    // ARRIVE derrière la voiture de devant. La cible est le point droit devant, à la même
    // distance qu'elle : la voiture freine sans se diriger vers celle qu'elle suit.
    // Usage VOLONTAIRE du map non borné : plus près que l'écart à garder, la vitesse désirée
    // devient négative et la voiture freine fort (elle recule par rapport à sa direction).
    // IA avancée : une voiture déboîtée ne freine plus derrière celle qu'elle double. Le cône,
    // qui s'ouvre avec la distance (pour les virages), la garderait sinon « derrière » à 30 px sur
    // le côté ; le couloir est mesuré sur la piste, où un virage ne décale pas la voiture de devant.
    // sous VSC, chacun suit le temps de référence, pas la voiture de devant : la zone de suivi est
    // réduite (sinon une voiture un peu proche reculerait et toute la file se regrouperait)
    const aGarder = p.distanceAGarder * this.prudenceAdherence();
    this.rayonZoneDeFreinage = aGarder + VoitureF1.ZONE_SUIVI * this.prudenceAdherence() * (this.vsc !== null ? VoitureF1.SUIVI_VSC : 1);
    const pointSuivi = createVector(this.pos.x + avant.x * long, this.pos.y + avant.y * long);
    this.cibles.suivi = pointSuivi;
    const contournee = vehicule.immobilisee && !this.dansLeCouloirStrict(vehicule);
    // sous VSC, on ne double pas : toute voiture du cône est suivie, quel que soit le couloir
    const suivie = this.dansMonCouloir(vehicule) || this.vsc !== null;
    if (long < this.rayonZoneDeFreinage && suivie && !contournee) {
      this.appliquer('suivi', this.arrive(pointSuivi, aGarder), p.poidsArrive);
    }

    if (this.etat === STAND) return;
    // FLEE latéral : on fuit un point légèrement décalé vers l'autre côté, pour qu'il y ait
    // toujours une composante latérale, même pile derrière
    const cote = this.choisirCote(vehicule, lat);
    const fui = createVector(vehicule.pos.x - gauche.x * cote * 3, vehicule.pos.y - gauche.y * cote * 3);
    const fuite = this.flee(fui);
    const laterale = fuite.x * gauche.x + fuite.y * gauche.y;
    const proximite = 1 - long / p.porteeEvitement;
    this.appliquer('contournement', createVector(gauche.x * laterale, gauche.y * laterale), p.poidsSeparation * proximite);

    // dépassement : plus rapide qu'elle, on se déporte du côté choisi
    if (this.etat === COURSE) {
      // pas de nouveau déport en plein virage : on dépasse en ligne droite ou au freinage
      const profil = this.profil();
      const enVirage = profil[this.indicePiste] < this.vitesseDeBase() * VoitureF1.PART_VIRAGE;
      const envie = VoitureF1.ENVIE_DEPASSER * (1 - this.agressivite) / this.envieDeDepasser();
      let tente = profil[this.indicePiste] > vehicule.vel.mag() + envie;
      // pas de dépassement sous VSC ou drapeau jaune, ni en laissant passer un coéquipier
      const interdit = this.vsc !== null || this.jaune || this.laisserPasser !== null;
      // IA avancée : dans l'aspiration, on déboîte dès que l'écart passe sous le seuil
      if (this.iaAvancee && this.aspiration > 0) {
        tente = tente || long < p.distanceAGarder + VoitureF1.SEUIL_DEPASSEMENT * this.envieDeDepasser();
      }
      const vise = tente && !enVirage && !interdit ? cote * (this.r + vehicule.r + 8) : 0;
      this.decalageDepassement = this.rapprocher(this.decalageDepassement, vise, VoitureF1.DEPORT);
    }
  }

  // La voiture `vehicule` est-elle dans le couloir de celle-ci (toujours vrai sans IA avancée) ?
  dansMonCouloir(vehicule) {
    if (!this.iaAvancee) return true;
    const indice = vehicule.indicePiste ?? this.indicePiste;
    const ecart = this.circuit.ecartLateral(vehicule.pos.x, vehicule.pos.y, this.circuit.indice(indice));
    return Math.abs(ecart - this.ecartLateral) < this.r + vehicule.r + VoitureF1.MARGE_COULOIR;
  }

  // Couloir strict (mesuré sur la piste, sans IA avancée aussi) : pour une voiture immobilisée,
  // on ne freine derrière elle que si on est vraiment dans son axe.
  dansLeCouloirStrict(vehicule) {
    const indice = vehicule.indicePiste ?? this.indicePiste;
    const ecart = this.circuit.ecartLateral(vehicule.pos.x, vehicule.pos.y, this.circuit.indice(indice));
    return Math.abs(ecart - this.ecartLateral) < this.r + vehicule.r;
  }

  // Distance de sécurité : celle du panneau, multipliée par la prudence du pilote, et plus
  // grande sur piste mouillée.
  distanceDeSecurite() {
    return this.parametres.distanceSecurite * this.traits.securite * (1 + VoitureF1.SECURITE_PLUIE * this.humidite) *
      this.prudenceAdherence();
  }

  // Glisse réaliste : le pilote sent que ses pneus accrochent moins (adhérence de l'avant sous 1 :
  // pluie, pneus froids ou inadaptés) et laisse plus de place devant lui, puisqu'il freinera moins
  // fort. 1 sans glisse.
  prudenceAdherence() {
    if (!this.glisseEnJeu) return 1;
    return 1 + VoitureF1.PRUDENCE_ADHERENCE * Math.max(0, 1 - Math.min(1, this.etatPneus.avant));
  }

  // Envie de dépasser : agressivité du panneau × celle du pilote (1 sans IA avancée).
  envieDeDepasser() {
    if (!this.iaAvancee) return 1;
    return Math.max(0.05, (this.parametres.agressiviteDepassement ?? 1) * this.traits.depassement);
  }

  // Côté du dépassement : +1 à gauche, -1 à droite. On passe du côté opposé à la voiture de
  // devant, ou du côté où la piste laisse le plus de place. Avec l'IA avancée, on préfère
  // l'intérieur du prochain virage, s'il est libre (la voiture de devant n'y est pas déjà).
  choisirCote(vehicule, lat) {
    if (this.iaAvancee) {
      const virage = this.circuit.prochainVirage(this.indicePiste, this.circuit.longueur);
      const ecartAutre = this.circuit.ecartLateral(vehicule.pos.x, vehicule.pos.y, this.indicePiste);
      const libre = cote => cote * ecartAutre < this.r;
      if (virage !== null && libre(virage.sens)) return virage.sens;
      if (virage !== null) return -virage.sens;
    }
    if (Math.abs(lat) > 3) return -Math.sign(lat);
    const ecartAutre = this.circuit.ecartLateral(vehicule.pos.x, vehicule.pos.y, this.indicePiste);
    return ecartAutre > 0 ? -1 : 1;
  }

  rapprocher(valeur, cible, pas) {
    return valeur + Math.max(-pas, Math.min(pas, cible - valeur));
  }

  // --- ETAPE 3 : temps, puis locomotion de Vehicle ------------------------------------------------

  update(dt = 0) {
    this.chronoEtat += dt;
    this.horlogeConduite += dt;
    if (this.laisserPasser !== null) this.laisserPasser.age += dt;
    // panne : le régime s'effondre progressivement (partielle : jusqu'à PANNE_PARTIELLE)
    if (this.panne !== null) {
      this.panne.age += dt;
      const plancher = this.panne.type === 'partielle' ? VoitureF1.PANNE_PARTIELLE : 0;
      this.facteurMoteur = Math.max(plancher, 1 - (1 - plancher) * this.panne.age / VoitureF1.DUREE_PANNE);
    }
    // delta VSC : temps réel moins temps de référence pour la distance parcourue (positif : plus
    // lent que le profil, comme il se doit)
    if (this.vsc !== null) {
      const limite = Math.max(0.1, this.limiteVSC());
      this.deltaVSC += dt * (1 - this.vitesse / limite);
    } else {
      this.deltaVSC = 0;
    }
    if (this.phaseStand === VoitureF1.PHASES_STAND.ARRET && this.estArreteeAuBox()) this.arret += dt;
    if (this.erreur > 0) this.erreur = Math.max(0, this.erreur - dt);
    // l'élan de l'aspiration s'éteint en DUREE_ELAN secondes hors du sillage
    if (this.elan > 0 && this.aspiration === 0) {
      this.elan = Math.max(0, this.elan - dt * this.parametres.bonusAspiration / VoitureF1.DUREE_ELAN);
    }
    if (this.etat !== VoitureF1.ETATS.GRILLE) {
      // usure : réglage du panneau × type de pneus sur la piste du moment × gestion du pilote
      const allure = this.vitesse / Math.max(0.1, this.parametres.vitesseMax);
      const usure = this.parametres.usurePneus * Pneus.usure(this.typePneus, this.humidite) * this.traits.pneus *
        VoitureF1.CONSIGNES[this.consigne].usure;
      this.pneus = Math.max(VoitureF1.PNEUS_MIN, this.pneus - usure * dt * allure);
    }

    // pour le dessin : braquage des roues avant (part latérale de la force appliquée) et feux
    // de freinage (force d'arrive opposée à la vitesse). On lit acc, on ne l'écrit pas.
    const cap = this.cap;
    const laterale = -this.acc.x * Math.sin(cap) + this.acc.y * Math.cos(cap);
    const braquage = Math.max(-1, Math.min(1, laterale / Math.max(0.01, this.maxForce))) * 0.45;
    this.braquage += (braquage - this.braquage) * 0.3;
    const freinage = [this.forces.arrive, this.forces.suivi, this.forces.frein].filter(Boolean)
      .reduce((somme, force) => somme + force.x * this.vel.x + force.y * this.vel.y, 0);
    this.freine = freinage < -0.01;

    if (this.demande !== null) this.chaufferLesPneus(dt);
    super.update();
    this.mettreAJourDerive();
  }

  // Glisse : température des pneus (charge, glisse, blocage ; refroidissement vers l'air, plus
  // froid sous la pluie), plat de pneu et usure au blocage, temps passé enlisé dans le gravier.
  chaufferLesPneus(dt) {
    const p = this.parametres;
    const e = this.etatPneus;
    const charge = Math.min(2, Math.hypot(e.demande.lat, e.demande.long) / Math.max(1e-6, this.forceDeBase()));
    const allure = Math.min(1, this.vitesse / Math.max(0.1, p.vitesseMax));
    const air = VoitureF1.TEMPERATURE_AIR - 15 * this.humidite;
    const chauffe = VoitureF1.CHAUFFE * charge * (0.4 + allure) + VoitureF1.CHAUFFE_GLISSE * Math.abs(this.derive) +
      (e.blocage ? VoitureF1.CHAUFFE_BLOCAGE : 0);
    this.temperaturePneus += dt * (chauffe - VoitureF1.REFROIDISSEMENT * (1 + this.humidite) * (this.temperaturePneus - air));
    if (e.blocage && this.vitesse > 0.5) {
      this.pneus = Math.max(VoitureF1.PNEUS_MIN, this.pneus - VoitureF1.USURE_BLOCAGE * dt);
      this.platDePneu = Math.min(1, this.platDePneu + 2 * dt);
    }
    this.enlisement = this.surface === 'gravier' && this.vitesse < VoitureF1.VITESSE_ENLISEE ? this.enlisement + dt : 0;
  }

  // Après la locomotion : rotation de la vitesse pendant l'image, puis angle de dérive (voir
  // Glisse.lacet) et cap de la carrosserie. Sans glisse, la carrosserie suit la vitesse.
  mettreAJourDerive() {
    const p = this.parametres;
    const v = this.vitesse;
    const capVitesse = v > 0.2 ? this.vel.heading() : this.capVitesse;
    const lacetVitesse = Glisse.angle(capVitesse - this.capVitesse);
    this.capVitesse = capVitesse;
    if (this.demande === null || v < 0.3) {
      this.derive *= 0.8;
    } else {
      const e = this.etatPneus;
      this.derive = Glisse.lacet(this.derive, {
        lacetVitesse, deficit: e.deficit, charge: e.charge, adherenceArriere: e.arriere,
        seuil: p.seuilGlisse ?? VoitureF1.SEUIL_GLISSE, contreBraquage: VoitureF1.CONTRE_BRAQUAGE,
        gain: VoitureF1.GAIN_SURVIRAGE, rappel: VoitureF1.RAPPEL_LACET,
      });
    }
    this.capCarrosserie = (v > 0.2 ? capVitesse : this.cap) + this.derive;
  }

  // Carburant : le réservoir se vide au fil des tours (réglé par Course à chaque tour).
  consommer(part) {
    this.carburant = Math.max(0, Math.min(1, part));
  }

  // --- Dessin --------------------------------------------------------------------------------------

  // Monoplace vue de dessus, orientée selon sa direction. options : ombres, detail (false =
  // dessin simplifié, quand il y a beaucoup de voitures), qualite ('bas' : le dessin vectoriel
  // ci-dessous ; 'moyen' ou 'eleve' : le sprite détaillé, voir spriteVoiture.js) ; theme : 'jour',
  // 'nuit' ou 'pluie' (ombre et reflet du sprite).
  show({ ombres = true, detail = true, qualite = 'bas', theme = 'jour' } = {}) {
    const [principale, secondaire, accent] = this.ecurie.couleurs;
    const L = VoitureF1.LONGUEUR / 2;
    const l = VoitureF1.LARGEUR / 2;
    // glisse : la carrosserie a son propre cap (dérive) ; sur un vibreur, elle vibre ; à haute
    // vitesse, une vibration légère
    const cap = this.glisseActive ? this.capCarrosserie : this.cap;
    const rapide = this.vitesse > 0.8 * (this.parametres.vitesseMax ?? 5) ? Math.sin(this.chronoEtat * 140) * 0.12 : 0;
    const vibre = (this.surface === 'vibreur' && this.vitesse > 1 ? Math.sin(this.chronoEtat * 95) * 0.5 : 0) + rapide;
    if (qualite !== 'bas') {
      SpriteVoiture.montrer(this, cap, this.braquage - (this.glisseActive ? this.derive * 0.9 : 0), { ombres, vibration: vibre, theme });
      return;
    }
    push();
    if (ombres) {
      // ombre portée douce, décalée vers le bas à droite (soleil en haut à gauche)
      push();
      translate(this.pos.x + 3, this.pos.y + 4);
      rotate(cap);
      noStroke();
      fill(0, 0, 0, 45);
      rect(-L - 1, -l - 2, 2 * L + 2, 2 * l + 4, 4);
      fill(0, 0, 0, 35);
      rect(-L + 2, -l, 2 * L - 4, 2 * l, 3);
      pop();
    }
    translate(this.pos.x, this.pos.y + vibre);
    rotate(cap);
    noStroke();

    // roues : arrière fixes, avant braquées selon la force de pilotage ; en dérive, le pilote
    // contre-braque (roues tournées vers l'extérieur de la glissade)
    const braquage = this.braquage - (this.glisseActive ? this.derive * 0.9 : 0);
    fill(18);
    rect(-L + 2, -l - 2.5, 6, 3.4, 1);
    rect(-L + 2, l - 0.9, 6, 3.4, 1);
    for (const cote of [-1, 1]) {
      push();
      translate(L - 6, cote * (l + 0.8));
      rotate(braquage);
      rect(-2.7, -1.6, 5.4, 3.2, 1);
      // plat de pneu après un blocage : une tache claire sur la bande de roulement
      if (this.platDePneu > 0.2) {
        fill(120, 120, 120, 200 * this.platDePneu);
        rect(-1, -1.6, 1.6, 3.2);
        fill(18);
      }
      pop();
    }
    // flancs des pneus à la couleur du type monté (tendre rouge, medium jaune, dur blanc,
    // intermédiaire vert, pluie bleu), sur le côté extérieur de chaque roue
    fill(...Pneus.type(this.typePneus).couleur);
    rect(-L + 2.5, -l - 2.5, 5, 0.9);
    rect(-L + 2.5, l + 1.6, 5, 0.9);
    rect(L - 8.2, -l - 2.4, 4.4, 0.8);
    rect(L - 8.2, l + 1.6, 4.4, 0.8);

    // aileron arrière à deux plans
    fill(...accent);
    rect(-L - 1, -l - 1.5, 2.2, 2 * l + 3, 0.8);
    fill(...principale);
    rect(-L + 1.4, -l - 1, 1.6, 2 * l + 2, 0.6);

    // châssis effilé : du capot moteur au museau
    fill(...principale);
    beginShape();
    vertex(-L + 2, -2.4);
    vertex(-3, -l + 0.5);
    vertex(3, -l + 0.8);
    vertex(6, -2);
    vertex(L - 1, -1.1);
    vertex(L + 1, 0);
    vertex(L - 1, 1.1);
    vertex(6, 2);
    vertex(3, l - 0.8);
    vertex(-3, l - 0.5);
    vertex(-L + 2, 2.4);
    endShape(CLOSE);

    // aileron avant
    fill(...accent);
    rect(L - 2.5, -l - 1, 2, 2 * l + 2, 0.6);

    if (detail) {
      // pontons latéraux
      fill(...secondaire);
      rect(-4, -l + 0.3, 7, 1.8, 0.8);
      rect(-4, l - 2.1, 7, 1.8, 0.8);
      // bande de livrée et numéro
      fill(...secondaire);
      rect(-L + 3, -0.7, 2 * L - 6, 1.4);
      push();
      translate(-6, 0);
      rotate(Math.PI / 2);
      fill(...accent);
      textAlign(CENTER, CENTER);
      textSize(4);
      text(String(this.numero), 0, 0);
      pop();
      // prise d'air, cockpit, halo, casque
      fill(25);
      rect(-1.5, -1, 2.5, 2, 0.6);
      fill(15);
      ellipse(2.5, 0, 5, 3.6);
      noFill();
      stroke(40);
      strokeWeight(0.8);
      arc(2.5, 0, 6, 4.4, -Math.PI / 2, Math.PI / 2);
      noStroke();
      fill(...accent);
      circle(2.2, 0, 2.4);
      // reflet sur le capot
      fill(255, 255, 255, 60);
      ellipse(-4, -1.2, 6, 1.2);
    } else {
      fill(...accent);
      circle(2.2, 0, 2.6);
    }

    // feux de freinage, et leur reflet allongé sur la piste mouillée
    if (this.freine) {
      fill(255, 40, 30);
      rect(-L - 2, -1, 1.4, 2);
      fill(255, 60, 40, 90);
      circle(-L - 2, 0, 5);
      if (this.humidite > 0.1) {
        fill(255, 50, 40, 110 * Math.min(1, this.humidite));
        ellipse(-L - 9, 0, 14, 3);
      }
    }
    // feu arrière de pluie : clignote quand la piste est mouillée
    if (this.humidite > 0.25 && Math.floor(this.chronoEtat * 4) % 2 === 0) {
      fill(255, 30, 30, 200);
      circle(-L - 1.5, 0, 1.6);
    }
    pop();
  }

  // Aides du mode debug : point d'anticipation (seek), apex et VRAI rayon de freinage (arrive),
  // cercle de wander et décalage latéral, rayon de collision, cône d'anticipation ; IA avancée :
  // cône d'aspiration (rouge quand la voiture est dans un sillage), point de dépassement visé,
  // duel. Jaune par défaut, rouge quand la condition est déclenchée.
  showDebug() {
    const p = this.parametres;
    const cap = this.cap;
    if (this.iaAvancee) this.showDebugCourse();
    push();
    noFill();
    strokeWeight(1);
    // rayon de collision
    stroke(this.chevauchement ? 'red' : 'yellow');
    circle(this.pos.x, this.pos.y, this.r * 2);
    // cône d'anticipation
    stroke(this.obstacle !== null ? 'red' : 'yellow');
    const ouverture = Math.atan2(this.r * 2 + 4, p.porteeEvitement) + VoitureF1.ANGLE_CONE;
    const bord = signe => [this.pos.x + Math.cos(cap + signe * ouverture) * p.porteeEvitement,
      this.pos.y + Math.sin(cap + signe * ouverture) * p.porteeEvitement];
    line(this.pos.x, this.pos.y, ...bord(1));
    line(this.pos.x, this.pos.y, ...bord(-1));
    // seek : point d'anticipation
    if (this.cibles.seek) {
      stroke(0, 220, 255);
      line(this.pos.x, this.pos.y, this.cibles.seek.x, this.cibles.seek.y);
      circle(this.cibles.seek.x, this.cibles.seek.y, 6);
    }
    // arrive : apex et zone de freinage, au bon rayon (circle attend un diamètre)
    const arrive = this.cibles.apex ?? this.cibles.arrive ?? this.cibles.file;
    if (arrive) {
      const dedans = p5.Vector.dist(this.pos, arrive) < this.rayonZoneDeFreinage;
      stroke(dedans ? 'red' : 'yellow');
      circle(arrive.x, arrive.y, this.rayonZoneDeFreinage * 2);
      fill(255, 120, 0);
      noStroke();
      circle(arrive.x, arrive.y, 6);
      noFill();
    }
    // wander : cercle devant la voiture et point visé
    if (this.forces.wander) {
      const cx = this.pos.x + Math.cos(cap) * this.distanceCercle;
      const cy = this.pos.y + Math.sin(cap) * this.distanceCercle;
      stroke(255, 255, 255, 120);
      circle(cx, cy, this.wanderRadius * 2);
      fill(0, 255, 0);
      noStroke();
      circle(cx + Math.cos(cap + this.wanderTheta) * this.wanderRadius, cy + Math.sin(cap + this.wanderTheta) * this.wanderRadius, 4);
      noFill();
    }
    // décalage latéral par rapport à la ligne de course
    const point = this.circuit.pointLateral(this.indicePiste, this.circuit.decalagesLigne[this.indicePiste]);
    stroke(255, 0, 255);
    line(this.pos.x, this.pos.y, point.x, point.y);
    pop();
    if (this.glisseActive) this.showDebugGlisse();
  }

  // Debug de la glisse : angle de dérive (axe de la carrosserie contre direction de la vitesse,
  // rouge au-delà du seuil) et cercle d'adhérence (capacité totale) avec la demande des
  // comportements (jaune, rouge quand elle est saturée : sous-virage ou blocage).
  showDebugGlisse() {
    const e = this.etatPneus;
    const echelle = 60;
    push();
    noFill();
    strokeWeight(1);
    const seuil = this.parametres.seuilGlisse ?? VoitureF1.SEUIL_GLISSE;
    stroke(Math.abs(this.derive) > seuil ? 'red' : 'yellow');
    line(this.pos.x, this.pos.y, this.pos.x + Math.cos(this.capCarrosserie) * 22, this.pos.y + Math.sin(this.capCarrosserie) * 22);
    stroke(0, 220, 255);
    line(this.pos.x, this.pos.y, this.pos.x + Math.cos(this.capVitesse) * 22, this.pos.y + Math.sin(this.capVitesse) * 22);
    if (e.capacites !== null) {
      const sature = e.sousVirage > 0 || e.blocage;
      stroke(sature ? 'red' : 'yellow');
      circle(this.pos.x, this.pos.y, 2 * e.capacites.totale * echelle);
      const t = this.direction();
      const dx = (t.x * e.demande.long - t.y * e.demande.lat) * echelle;
      const dy = (t.y * e.demande.long + t.x * e.demande.lat) * echelle;
      strokeWeight(2);
      line(this.pos.x, this.pos.y, this.pos.x + dx, this.pos.y + dy);
    }
    noStroke();
    fill(255);
    textSize(7);
    text(`${(this.derive * 180 / Math.PI).toFixed(0)}°`, this.pos.x + 14, this.pos.y - 10);
    pop();
  }
}
