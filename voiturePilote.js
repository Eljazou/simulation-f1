// La voiture du joueur : une VoitureF1 (donc un Vehicle) dont l'IA est remplacée par les
// commandes du clavier. Sa physique est la même : maxSpeed, maxForce et adhérence modulés comme
// pour les autres, locomotion de Vehicle. Le pilotage reste fait de FORCES :
//   direction   les flèches gauche / droite (ou A / D) tournent un point-cible placé devant la
//               voiture, à la distance réglée dans le panneau ; la voiture fait seek vers ce point.
//               Sans touche, le point est dans l'axe de sa vitesse : elle continue tout droit ;
//   accélérateur flèche haut ou W : seek à pleine puissance (maxSpeed = vitesse de base) ;
//               relâché : maxSpeed = régime de croisière ;
//   frein       flèche bas ou S : force opposée à la vitesse, limitée à maxForce (seule la part
//               latérale du seek reste, pour garder la direction) ;
//   DRS         Espace : bonus de maxSpeed, seulement dans une zone DRS, à moins d'une seconde de
//               la voiture de devant ;
//   stand       P : arrêt demandé ; dans la voie, la conduite des stands de VoitureF1 (seek le long
//               de la voie, limiteur, arrive dans le box) ; pneus choisis avec 1 à 5.
// Les commandes sont données par le scénario (commander) : la voiture ne lit jamais le clavier.
// Pas de garderSurPiste ni d'évitement automatique : le joueur peut sortir de la piste et
// toucher une autre voiture (incident : voir Course et IncidentJoueur). Pendant la séquence d'un
// incident, le joueur ne contrôle plus : la voiture freine (force opposée à la vitesse), puis,
// remise en piste, roule seule (pilotageAuto : la conduite de VoitureF1, seek sur la ligne de
// course, évitement, garderSurPiste) à la vitesse de reprise pendant le compte à rebours ;
// pendant le compte à rebours et les 2 s d'invulnérabilité qui suivent, elle clignote.
class VoiturePilote extends VoitureF1 {
  static ACCIDENT = VoitureF1.ETATS.ACCIDENT;
  // Valeurs de départ des curseurs du panneau.
  static DISTANCE_POINT_CIBLE = 70;
  static REGIME_CROISIERE = 0.6;
  static BONUS_DRS = 0.08;
  static TOLERANCE_COLLISION = 1;
  // Angle du point-cible quand on tourne (radians), écart maximal pour le DRS (secondes).
  static ANGLE_BRAQUAGE = 0.7;
  static ECART_DRS = 1;
  // Rapports affichés, et conversion de la vitesse (pixels par image) en km/h fictifs.
  static RAPPORTS = 8;
  static KMH = 60;
  // Limites de piste (valeurs de départ des réglages « Joueur ») : temps toléré les quatre roues
  // au-delà de la limite (ms), avertissements avant la première pénalité, pénalité (s) ; et vitesse
  // d'impact (km/h) en dessous de laquelle un contact est un simple frôlement.
  static TOLERANCE_LIMITES_MS = 500;
  static AVERTISSEMENTS_LIMITES = 2;
  static PENALITE_LIMITES = 5;
  static VITESSE_IMPACT_KMH = 40;
  // Pneus choisis avec les touches 1 à 5.
  static TOUCHES_PNEUS = { 1: 'TENDRE', 2: 'MEDIUM', 3: 'DUR', 4: 'INTER', 5: 'PLUIE' };

  constructor(x, y, options) {
    super(x, y, options);
    // le joueur part à l'extinction des feux, sans temps de réaction tiré
    this.reaction = 0;
    this.commandes = { haut: false, bas: false, gauche: false, droite: false, drs: false };
    this.pointCible = null;
    this.drsDisponible = false;
    this.drsActif = false;
    this.pneuChoisi = null;
    this.penalites = 0;
    // limites de piste (Course.surveillerLesLimites) : infractions comptées, et la sortie en cours
    // ({ duree, rang, comptee, penalisee }) ou null
    this.limites = 0;
    this.excursion = null;
    // accidents (voir incidentJoueur.js) : l'incident en cours (ou null) ; sousControle faux
    // pendant la séquence (la voiture freine) ; pilotageAuto vrai pendant le compte à rebours
    this.incident = null;
    this.sousControle = true;
    this.pilotageAuto = false;
  }

  // La voiture du joueur ne s'enlise jamais dans le gravier (elle en ressort au volant). C'était la
  // cause du blocage : enlisée (BLOQUEE), puis remorquée et classée ABANDON, sans accident ni
  // suite, elle restait à 0 km/h en « ABD ».
  passerA(etat) {
    if (etat === VoitureF1.ETATS.BLOQUEE) return;
    super.passerA(etat);
  }

  // Invulnérable : les 2 s qui suivent la reprise du contrôle (aucun contact ne compte ; Course
  // ne vérifie aucun contact pendant tout l'incident).
  get invulnerable() {
    return this.incident !== null && this.incident.phase === IncidentJoueur.PHASES.REPRISE;
  }

  // Clignotement (dessin) : pendant le compte à rebours et l'invulnérabilité, la voiture n'est
  // dessinée qu'une image sur deux par huitième de seconde de course.
  get visibleCetteImage() {
    if (this.incident === null || this.incident.avantRemise) return true;
    return Math.floor(this.incident.chrono * 8) % 2 === 0;
  }

  // Règle de scène (comme une réapparition, demandée pour la remise en piste après un incident ;
  // appelée par Course.remettreEnPiste, jamais par un comportement) : la voiture est posée sur
  // la piste, au point (x, y), immobile et orientée selon `cap` ; puis une impulsion (une force,
  // par applyForce) la relance à `vitesse` dans ce sens. C'est la seule écriture de position du
  // circuit (garde de architecture.test.mjs).
  reapparaitre(x, y, cap, vitesse) {
    this.pos.set(x, y);
    this.vel.set(0, 0);
    this.acc.set(0, 0);
    this.capRepos = cap;
    this.capVitesse = cap;
    this.capCarrosserie = cap;
    this.derive = 0;
    this.enlisement = 0;
    // la locomotion de Vehicle plafonne la vitesse à maxSpeed (un paramètre) : au moins `vitesse`
    this.maxSpeed = Math.max(this.maxSpeed, vitesse);
    this.applyForce(createVector(Math.cos(cap) * vitesse, Math.sin(cap) * vitesse));
    this.update();
  }

  get accidentee() {
    return this.etat === VoiturePilote.ACCIDENT;
  }

  // Rapport engagé (1 à RAPPORTS), selon la vitesse : pour le HUD seulement.
  get rapport() {
    const allure = Math.min(0.999, this.vitesse / Math.max(0.1, this.parametres.vitesseMax * 1.1));
    return 1 + Math.floor(allure * VoiturePilote.RAPPORTS);
  }

  get kmh() {
    return Math.round(this.vitesse * VoiturePilote.KMH);
  }

  // Le scénario transmet l'état des touches : { haut, bas, gauche, droite, drs }.
  commander(commandes) {
    Object.assign(this.commandes, commandes);
  }

  // Touche P : arrêt au prochain passage devant la voie des stands.
  demanderArret() {
    if (this.auStand || this.accidentee) return false;
    this.demanderStand();
    this.pneuDemande = this.pneuChoisi ?? this.typePneus;
    return true;
  }

  // Touches 1 à 5 : les pneus du prochain arrêt.
  choisirPneus(nom) {
    Pneus.type(nom);
    this.pneuChoisi = nom;
    if (this.demandeStand) this.pneuDemande = nom;
  }

  // Contact : la voiture est accidentée, elle freine jusqu'à l'arrêt.
  accidenter() {
    super.accidenter();
  }

  // Le joueur décide seul : il perçoit les voitures autour (DRS, HUD), sans les décisions de l'IA
  // (aspiration, duel, défense, erreurs).
  percevoirLesAutres({ devant = null, derriere = null, meteo = null } = {}) {
    this.devant = devant;
    this.derriere = derriere;
    this.meteo = meteo;
    this.aspiration = 0;
    this.duel = null;
    this.drapeauBleu = false;
  }

  decide(contexte = {}) {
    super.decide(contexte);
    // DRS : dans une zone DRS, à moins d'une seconde de la voiture de devant
    const devant = contexte.devant ?? null;
    this.drsDisponible = this.etat === VoitureF1.ETATS.COURSE && this.circuit.dansZoneDRS(this.indicePiste) &&
      VoitureF1.secondes(devant) < VoiturePilote.ECART_DRS;
    this.drsActif = this.drsDisponible && this.commandes.drs;
  }

  // Vitesse visée : pleine puissance ou régime de croisière, bonus DRS ; pas de profil de virage
  // (c'est le joueur qui freine). Au stand, en grille ou sous safety car : comme les autres.
  moduler(devant, meteo = null) {
    super.moduler(devant, meteo);
    // remise en piste : elle roule seule, pas plus vite que la vitesse de reprise
    if (this.pilotageAuto) {
      this.maxSpeed = Math.min(this.maxSpeed, IncidentJoueur.VITESSE_REPRISE_KMH / VoiturePilote.KMH);
      return;
    }
    const { COURSE, DEPART, ARRIVEE } = VoitureF1.ETATS;
    if (![COURSE, DEPART, ARRIVEE].includes(this.etat)) return;
    const p = this.parametres;
    let vitesse = this.vitesseDeBase() * (this.commandes.haut ? 1 : p.regimeCroisiere);
    if (this.drsActif) vitesse *= 1 + p.bonusDRS;
    this.drs = this.drsActif;
    this.maxSpeed = vitesse;
  }

  // Le pilotage du joueur (remplace la conduite de l'IA).
  piloter(devant) {
    // remise en piste, compte à rebours : la conduite de l'IA (seek sur la ligne de course...)
    if (this.pilotageAuto) {
      super.piloter(devant);
      return;
    }
    // accidentée, ou pendant la séquence d'un incident : le joueur ne contrôle plus, elle freine
    if (this.accidentee || !this.sousControle) {
      this.freiner('freinage');
      return;
    }
    const p = this.parametres;
    const virage = (this.commandes.droite ? 1 : 0) - (this.commandes.gauche ? 1 : 0);
    const angle = this.cap + virage * VoiturePilote.ANGLE_BRAQUAGE;
    const cible = createVector(this.pos.x + Math.cos(angle) * p.distancePointCible, this.pos.y + Math.sin(angle) * p.distancePointCible);
    this.pointCible = cible;
    this.cibles.seek = cible;
    const direction = this.seek(cible);
    if (this.commandes.bas) {
      // frein : on garde la part latérale du seek (la direction), et une force opposée à la vitesse
      const gauche = { x: -Math.sin(this.cap), y: Math.cos(this.cap) };
      const laterale = direction.x * gauche.x + direction.y * gauche.y;
      this.appliquer('seek', createVector(gauche.x * laterale, gauche.y * laterale), p.poidsSeek);
      this.freiner('frein');
    } else {
      this.appliquer('seek', direction, p.poidsSeek);
    }
  }

  // Freinage : force opposée à la vitesse, limitée à maxForce (nulle à l'arrêt).
  freiner(nom) {
    if (this.vitesse < 1e-6) return;
    const force = this.vel.copy().mult(-1);
    force.limit(this.maxForce);
    this.appliquer(nom, force, 1);
  }

  // Avant la ligne blanche, c'est le joueur qui freine : pas de plafond automatique.
  vitesseAvantLimiteur() {
    return Infinity;
  }

  // Voie des stands (spectaculaire) : avant la ligne blanche du limiteur, la direction reste
  // automatique mais c'est le joueur qui freine (touche bas) ; trop vite à la ligne : pénalité.
  conduireAuStand() {
    const s = this.circuit.stands;
    const avantLaLigne = this.gereParEquipe && this.phaseStand === VoitureF1.PHASES_STAND.ENTREE && this.indiceVoie < s.limiteur;
    if (!avantLaLigne) {
      super.conduireAuStand();
      return;
    }
    const k = Math.min(s.points.length - 1, Math.round(this.indiceVoie + (20 + 6 * this.vitesse) / this.circuit.pas));
    const cible = createVector(s.points[k].x, s.points[k].y);
    this.cibles.seek = cible;
    const direction = this.seek(cible);
    if (this.commandes.bas) {
      this.freiner('frein');
      const gauche = { x: -Math.sin(this.cap), y: Math.cos(this.cap) };
      const laterale = direction.x * gauche.x + direction.y * gauche.y;
      this.appliquer('seek', createVector(gauche.x * laterale, gauche.y * laterale), this.parametres.poidsSeek);
    } else {
      this.appliquer('seek', direction, this.parametres.poidsSeek);
    }
  }

  // Le joueur n'a ni évitement automatique ni rappel sur la piste (sauf dans la voie des stands,
  // où la conduite est celle de VoitureF1).
  eviter(voisins) {
    if (this.pilotageAuto) {
      super.eviter(voisins);
      return;
    }
    this.obstacle = null;
    this.chevauchement = false;
  }

  garderSurPiste() {
    return this.auStand || this.pilotageAuto ? super.garderSurPiste() : createVector(0, 0);
  }

  update(dt = 0) {
    super.update(dt);
    // feux de freinage : la touche de frein, ou l'accident
    if (this.forces.frein || this.forces.freinage) this.freine = true;
  }

  // Aides du mode debug : le point-cible du joueur et la force de pilotage, en plus de celles
  // d'une voiture.
  // Clignotement pendant le compte à rebours et l'invulnérabilité (voir visibleCetteImage).
  show(options) {
    if (!this.visibleCetteImage) return;
    super.show(options);
  }

  showDebug() {
    super.showDebug();
    if (this.pointCible === null) return;
    push();
    stroke(255, 255, 0);
    noFill();
    line(this.pos.x, this.pos.y, this.pointCible.x, this.pointCible.y);
    circle(this.pointCible.x, this.pointCible.y, 10);
    const force = this.forces.seek;
    if (force) {
      stroke(255, 60, 200);
      strokeWeight(2);
      line(this.pos.x, this.pos.y, this.pos.x + force.x * 120, this.pos.y + force.y * 120);
    }
    pop();
  }
}
