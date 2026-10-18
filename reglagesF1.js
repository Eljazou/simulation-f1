// Réglages du jeu « Circuit Formule 1 » : les curseurs du panneau. Outillage commun des curseurs
// (validation, affichage, liaison à la page), fabriqué par Reglages.fabrique. Chaque
// valeur de départ est la constante de l'entité concernée.
//
// CURSEURS : [clé du réglage, id du curseur dans index.html], dans l'ordre du panneau. La valeur
// courante s'affiche dans l'élément dont l'id se termine par « -valeur ».
const ReglagesF1 = (() => {
  const PLAGES = {
    // 1. course
    nombreVoitures: { min: 2, max: 20, pas: 1, initial: Course.NOMBRE_VOITURES, decimales: 0, unite: '', entier: true },
    nombreTours: { min: 1, max: 20, pas: 1, initial: Course.NOMBRE_TOURS, decimales: 0, unite: '', entier: true },
    ecuries: { min: 1, max: Course.ECURIES.length, pas: 1, initial: Course.NOMBRE_ECURIES, decimales: 0, unite: '', entier: true },
    // 2. seek
    poidsSeek: { min: 0, max: 3, pas: 0.1, initial: VoitureF1.POIDS_SEEK, decimales: 1, unite: '' },
    anticipationSeek: { min: 10, max: 150, pas: 5, initial: VoitureF1.ANTICIPATION_SEEK, decimales: 0, unite: ' px' },
    // 3. arrive
    poidsArrive: { min: 0, max: 4, pas: 0.1, initial: VoitureF1.POIDS_ARRIVE, decimales: 1, unite: '' },
    rayonFreinage: { min: 40, max: 400, pas: 10, initial: VoitureF1.RAYON_FREINAGE, decimales: 0, unite: ' px' },
    distanceAGarder: { min: 28, max: 120, pas: 2, initial: VoitureF1.DISTANCE_A_GARDER, decimales: 0, unite: ' px' },
    distanceArretStand: { min: 20, max: 150, pas: 5, initial: VoitureF1.DISTANCE_ARRET_STAND, decimales: 0, unite: ' px' },
    // 4. wander
    poidsWander: { min: 0, max: 2, pas: 0.05, initial: VoitureF1.POIDS_WANDER, decimales: 2, unite: '' },
    distanceCercle: { min: 10, max: 200, pas: 5, initial: VoitureF1.DISTANCE_CERCLE, decimales: 0, unite: ' px' },
    wanderRadius: { min: 0, max: 80, pas: 1, initial: VoitureF1.WANDER_RAYON, decimales: 0, unite: ' px' },
    displaceRange: { min: 0, max: 1, pas: 0.01, initial: VoitureF1.DISPLACE_RANGE, decimales: 2, unite: '' },
    // 5. évitement
    poidsSeparation: { min: 0, max: 5, pas: 0.1, initial: VoitureF1.POIDS_SEPARATION, decimales: 1, unite: '' },
    distanceSecurite: { min: 26, max: 80, pas: 1, initial: VoitureF1.DISTANCE_SECURITE, decimales: 0, unite: ' px' },
    porteeEvitement: { min: 40, max: 200, pas: 5, initial: VoitureF1.PORTEE_EVITEMENT, decimales: 0, unite: ' px' },
    // 6. voitures
    vitesseMax: { min: 1, max: 10, pas: 0.1, initial: VoitureF1.VITESSE_MAX, decimales: 1, unite: '' },
    forceMax: { min: 0.05, max: 1, pas: 0.01, initial: VoitureF1.FORCE_MAX, decimales: 2, unite: '' },
    usurePneus: { min: 0, max: 0.1, pas: 0.002, initial: VoitureF1.USURE_PNEUS, decimales: 3, unite: ' /s' },
    seuilStand: { min: 0, max: 0.8, pas: 0.05, initial: VoitureF1.SEUIL_STAND, decimales: 2, unite: '' },
    // 8. simulation
    vitesseSimulation: { min: 0.25, max: 4, pas: 0.25, initial: Course.VITESSE_SIMULATION, decimales: 2, unite: 'x' },
    // 9. course avancée (IA)
    bonusAspiration: { min: 0, max: 0.15, pas: 0.01, initial: VoitureF1.BONUS_ASPIRATION, decimales: 2, unite: '' },
    distanceAspiration: { min: 40, max: 250, pas: 5, initial: VoitureF1.DISTANCE_ASPIRATION, decimales: 0, unite: ' px' },
    agressiviteDepassement: { min: 0, max: 2, pas: 0.1, initial: VoitureF1.AGRESSIVITE_DEPASSEMENT, decimales: 1, unite: '' },
    frequenceErreurs: { min: 0, max: 1, pas: 0.01, initial: VoitureF1.FREQUENCE_ERREURS, decimales: 2, unite: '' },
    // 10. météo
    intensitePluie: { min: 0, max: 1, pas: 0.05, initial: Meteo.INTENSITE, decimales: 2, unite: '' },
    effetAdherence: { min: 0, max: 1, pas: 0.05, initial: Meteo.EFFET_ADHERENCE, decimales: 2, unite: '' },
    quantiteGerbes: { min: 0, max: 500, pas: 10, initial: GerbeEau.QUANTITE, decimales: 0, unite: '', entier: true },
    // 11. joueur
    distancePointCible: { min: 20, max: 150, pas: 5, initial: VoiturePilote.DISTANCE_POINT_CIBLE, decimales: 0, unite: ' px' },
    regimeCroisiere: { min: 0.3, max: 1, pas: 0.05, initial: VoiturePilote.REGIME_CROISIERE, decimales: 2, unite: '' },
    bonusDRS: { min: 0, max: 0.2, pas: 0.01, initial: VoiturePilote.BONUS_DRS, decimales: 2, unite: '' },
    toleranceCollision: { min: 0.5, max: 1.2, pas: 0.05, initial: VoiturePilote.TOLERANCE_COLLISION, decimales: 2, unite: '' },
    // limites de piste du joueur (Course.surveillerLesLimites) et accidents (incidentJoueur.js)
    toleranceLimites: { min: 100, max: 2000, pas: 50, initial: VoiturePilote.TOLERANCE_LIMITES_MS, decimales: 0, unite: ' ms', entier: true },
    avertissementsLimites: { min: 0, max: 5, pas: 1, initial: VoiturePilote.AVERTISSEMENTS_LIMITES, decimales: 0, unite: '', entier: true },
    penaliteLimites: { min: 0, max: 30, pas: 1, initial: VoiturePilote.PENALITE_LIMITES, decimales: 0, unite: ' s' },
    vitesseImpact: { min: 0, max: 150, pas: 5, initial: VoiturePilote.VITESSE_IMPACT_KMH, decimales: 0, unite: ' km/h' },
    penaliteAccident: { min: 0, max: 30, pas: 1, initial: IncidentJoueur.PENALITE_ACCIDENT, decimales: 0, unite: ' s' },
    distanceMur: { min: 20, max: 80, pas: 1, initial: Course.MUR_DEFAUT, decimales: 0, unite: ' px' },
    // 12. glisse réaliste
    adherenceGlobale: { min: 0.3, max: 1.5, pas: 0.05, initial: VoitureF1.ADHERENCE_GLOBALE, decimales: 2, unite: '' },
    seuilGlisse: { min: 0.02, max: 0.3, pas: 0.01, initial: VoitureF1.SEUIL_GLISSE, decimales: 2, unite: ' rad' },
    sousVirage: { min: 0, max: 2, pas: 0.1, initial: VoitureF1.SOUS_VIRAGE, decimales: 1, unite: '' },
    survirage: { min: 0, max: 2, pas: 0.1, initial: VoitureF1.SURVIRAGE, decimales: 1, unite: '' },
    frottementGlissement: { min: 0, max: 2, pas: 0.1, initial: VoitureF1.FROTTEMENT_GLISSEMENT, decimales: 1, unite: '' },
    // 13. VSC et incidents
    facteurVSC: { min: 0.3, max: 0.9, pas: 0.05, initial: VoitureF1.FACTEUR_VSC, decimales: 2, unite: '' },
    risquePlongeon: { min: 0, max: 1, pas: 0.05, initial: VoitureF1.RISQUE_PLONGEON, decimales: 2, unite: '' },
    tauxFatigue: { min: 0, max: 0.5, pas: 0.01, initial: VoitureF1.TAUX_FATIGUE, decimales: 2, unite: '' },
    probaPanne: { min: 0, max: 0.005, pas: 0.0001, initial: GestionIncidents.PROBA_PANNE, decimales: 4, unite: ' /s' },
    // 14. pit stop
    tailleEquipe: { min: EquipeDeStand.TAILLE_MIN, max: EquipeDeStand.TAILLE_MAX, pas: 1, initial: VoieDesStands.TAILLE_EQUIPE, decimales: 0, unite: '', entier: true },
    dureeRoue: { min: 1.5, max: 4, pas: 0.1, initial: EquipeDeStand.DUREE_ROUE, decimales: 1, unite: ' s' },
    // 16. adversaires : variation des poids du réseau par voiture (0 = toutes identiques)
    variationPoids: { min: 0, max: VoitureNeuronale.VARIATION_MAX, pas: 0.01, initial: VoitureNeuronale.VARIATION, decimales: 2, unite: '' },
    // 15. ambiance (affichage seulement)
    dureeCycle: { min: 20, max: 600, pas: 10, initial: Ambiance.DUREE_CYCLE, decimales: 0, unite: ' s' },
  };

  // Curseurs d'affichage : ils ne changent que le dessin (formule1.afficher), jamais la course.
  const AFFICHAGE = ['dureeCycle'];
  const id = cle => `f1-${cle.replace(/[A-Z]/g, lettre => `-${lettre.toLowerCase()}`)}`;
  const CURSEURS = Object.keys(PLAGES).filter(cle => !AFFICHAGE.includes(cle)).map(cle => [cle, id(cle)]);
  const CURSEURS_AFFICHAGE = AFFICHAGE.map(cle => [cle, id(cle)]);

  // Cases à cocher : [clé, id, type]. Type 'reglage' : un réglage de la course (il change la
  // simulation) ; type 'affichage' : une option de dessin, qui ne change jamais la simulation.
  const CASES = [['incidents', 'f1-incidents', 'reglage'], ['iaAvancee', 'f1-ia-avancee', 'reglage'],
    ['gerbes', 'f1-gerbes', 'reglage'], ['modePilote', 'f1-mode-pilote', 'reglage'], ['penalites', 'f1-penalites', 'reglage'],
    ['limitesStrictes', 'f1-limites-strictes', 'reglage'],
    ['decor', 'f1-decor', 'affichage'], ['classement', 'f1-classement', 'affichage'], ['gomme', 'f1-gomme', 'affichage'],
    ['fumee', 'f1-fumee', 'affichage'], ['ombres', 'f1-ombres', 'affichage'], ['drone', 'f1-drone', 'affichage'],
    ['glisseRealiste', 'f1-glisse-realiste', 'reglage'], ['etincelles', 'f1-etincelles', 'affichage'],
    ['vsc', 'f1-vsc', 'reglage'], ['relanceAccordeon', 'f1-relance-accordeon', 'reglage'],
    ['evitementDanger', 'f1-evitement-danger', 'reglage'], ['depanneuse', 'f1-depanneuse', 'reglage'],
    ['plongeon', 'f1-plongeon', 'reglage'], ['fatigue', 'f1-fatigue', 'reglage'], ['ordresEquipe', 'f1-ordres-equipe', 'reglage'],
    ['pannes', 'f1-pannes', 'reglage'], ['pitSpectaculaire', 'f1-pit-spectaculaire', 'reglage'],
    ['feuSortie', 'f1-feu-sortie', 'reglage'],
    ['traces', 'f1-traces', 'affichage'], ['poussiere', 'f1-poussiere', 'affichage'], ['billes', 'f1-billes', 'affichage'],
    ['foule', 'f1-foule', 'affichage'], ['lignesVitesse', 'f1-lignes-vitesse', 'affichage'],
    ['telemetrie', 'f1-telemetrie', 'affichage'], ['carteChaleur', 'f1-carte-chaleur', 'affichage'], ['radio', 'f1-radio', 'affichage'],
    ['prediction', 'f1-prediction', 'affichage'], ['historique', 'f1-historique', 'affichage'], ['miniCarte', 'f1-mini-carte', 'affichage']];

  // Menus : [clé du réglage, id, valeurs permises].
  const MENUS = [['personnalites', 'f1-personnalites', ['aleatoire', ...Personnalites.NOMS]],
    ['modeMeteo', 'f1-mode-meteo', Meteo.MODES], ['pneusDepart', 'f1-pneus-depart', Pneus.NOMS],
    // adversaires : VoitureF1 classiques, ou VoitureNeuronale pilotées par le modèle choisi
    ['adversaires', 'f1-adversaires', ['classiques', 'ia']]];

  // Menus d'affichage : moment de la journée, qualité du rendu, pilote comparé en télémétrie.
  const MENUS_AFFICHAGE = [['moment', 'f1-moment', Ambiance.MOMENTS], ['qualite', 'f1-qualite', Ambiance.QUALITES],
    ['comparaison', 'f1-comparaison', Telemetrie.COMPARAISONS]];

  return { ...Reglages.fabrique(PLAGES), CURSEURS, CURSEURS_AFFICHAGE, CASES, MENUS, MENUS_AFFICHAGE };
})();
