// Monoplace dont un petit réseau de neurones DOSE les steering behaviors. C'est une VoitureF1
// (donc un Vehicle) : même physique, mêmes états, même locomotion ; elle ne bouge que par des
// forces (applyForce, via appliquer), puis update() de VoitureF1 et de Vehicle.
//
// À chaque image de conduite en piste (conduire) :
//   1. capteurs   CapteursVoiture.mesurer : 8 entrées normalisées (bords, devant, courbure,
//                 vitesse, voisine, adhérence, écart à la ligne de course) ;
//   2. réseau     ReseauNeuronal.passeAvant : 4 poids entre 0 et 1 (seek, arrive, wander,
//                 séparation), multipliés par la variation propre à la voiture ;
//   3. forces     les 4 comportements, calculés comme ceux de VoitureF1 et chacun limité à
//                 maxForce :
//                   seek        vers le point d'anticipation de la ligne de course ;
//                   arrive      vers l'apex du prochain virage serré, dans la zone de freinage (d
//                               négatif, comme VoitureF1 : la vitesse désirée descend jusqu'à celle
//                               du virage) ; sans virage proche, vers un point au bord de la zone
//                               (la vitesse désirée y vaut maxSpeed) ;
//                   wander      celui de Vehicle (wanderTheta borné à ±π/2, comme VoitureF1) ;
//                   séparation  les voisines à moins de la distance de sécurité repoussent la
//                               voiture (même formule que VoitureF1.eviter) ;
//   4. somme      force = w1·seek + w2·arrive + w3·wander + w4·séparation, limitée à maxForce,
//                 appliquée par appliquer('neurone') (avec la glisse réaliste : une demande aux
//                 pneus, comme toute force de pilotage).
// Le réseau ne remplace pas les réflexes de VoitureF1.eviter : séparation de sécurité (le réflexe,
// à son poids du panneau), anticipation, urgence (2 px avant le contact), suivi de la voiture de
// devant et contournement restent actifs ; la séparation dosée par le réseau s'y AJOUTE (elle
// monte quand une voiture est collée). Sans ce réflexe, la séparation du réseau, au plus maxForce
// dans une somme elle-même limitée à maxForce, ne suffisait pas dans le peloton du premier tour (un
// contact par course mesuré sur Technique et Rapide ; aucun avec lui). garderSurPiste reste un
// FILET DE SÉCURITÉ, mais limité par l'adhérence (voir appliquer) ; une sortie de piste est
// pénalisée par le fitness de l'entraînement (voir entraineur.js).
//
// RÈGLE DE REPRISE DE CONTRÔLE : le réseau ne pilote qu'en COURSE (et au départ, après le temps de
// réaction). La logique de steering existante de VoitureF1 reprend la main, puis la rend dès que
// la situation est finie :
//   - stand (STAND : entrée, arrêt, sortie, garage ; la décision de rentrer reste à la stratégie) ;
//   - safety car (DRAPEAU) et relance en accordéon (Course.ETATS.RELANCE, perçue dans le contexte) ;
//   - VSC (this.vsc), zone de danger (this.danger), ordre d'équipe (this.laisserPasser) ;
//   - panne, erreur de pilotage de l'IA avancée, drapeau à damier (ARRIVEE), parc, grille.
class VoitureNeuronale extends VoitureF1 {
  static COMPORTEMENTS = ['seek', 'arrive', 'wander', 'separation'];
  // Variation des poids par voiture : de 0 (toutes identiques) à VARIATION_MAX.
  static VARIATION = 0.1;
  static VARIATION_MAX = 0.3;
  // Distance (px, le long du cap) sous laquelle une voiture devant remet le plafond de virage.
  static PORTEE_TRAFIC = 90;

  // options : celles de VoitureF1, plus reseau (un ReseauNeuronal : il est cloné, chaque voiture a
  // le sien), capteurs (CapteursVoiture), variation (0 à VARIATION_MAX), modele ({ id, nom }).
  constructor(x, y, options = {}) {
    super(x, y, options);
    const { reseau = null, capteurs = null, variation = 0, modele = null } = options;
    this.reseau = reseau === null ? new ReseauNeuronal() : reseau.cloner();
    this.capteurs = capteurs ?? new CapteursVoiture();
    this.modele = modele;
    // variation propre à la voiture : un facteur par comportement, tiré avec une graine propre à
    // son numéro (le hasard de la course n'est pas consommé)
    const v = Math.max(0, Math.min(VoitureNeuronale.VARIATION_MAX, Number(variation) || 0));
    const alea = ReseauNeuronal.mulberry32(9973 * (this.numero + 1));
    this.facteursPoids = VoitureNeuronale.COMPORTEMENTS.map(() => 1 + v * (alea() * 2 - 1));
    this.variation = v;
    // ce que le réseau a vu et décidé à la dernière image (debug, page d'entraînement)
    this.entreesNeuronales = new Array(ReseauNeuronal.ENTREES).fill(0);
    this.poidsNeuronaux = { seek: 0, arrive: 0, wander: 0, separation: 0 };
    this.forcesNeuronales = {};
    this.pilotageNeuronal = false;
    this.enRelance = false;
    this.voisinsPercus = [];
  }

  // Le réseau a-t-il la main ? (voir la règle de reprise de contrôle, en tête du fichier)
  get neuroneActif() {
    const { COURSE, DEPART } = VoitureF1.ETATS;
    return (this.etat === COURSE || this.etat === DEPART) && !this.enRelance && this.vsc === null &&
      this.danger === null && this.laisserPasser === null && this.panne === null && this.erreur <= 0;
  }

  // Perception : en plus de celle de VoitureF1, la relance après la safety car (contexte.relance).
  decide(contexte = {}) {
    this.enRelance = contexte.relance === true;
    super.decide(contexte);
  }

  applyBehaviors(contexte = {}) {
    this.pilotageNeuronal = false;
    this.voisinsPercus = contexte.voisins ?? [];
    super.applyBehaviors(contexte);
  }

  // maxSpeed (un PARAMÈTRE, modulé à chaque image par VoitureF1.moduler) : en pilotage neuronal, la
  // voiture n'a pas le plafond de vitesse du profil de virage. C'est au réseau de freiner avant
  // les virages, en dosant arrive (sinon il n'aurait rien à apprendre : le plafond freinerait à sa
  // place). Restent : vitesse de base (pneus, carburant, moteur), DRS, aspiration, drapeau jaune.
  // Dans le trafic (une voiture dans le cône d'anticipation à moins de PORTEE_TRAFIC, vue à l'image
  // précédente par eviter, ou une voisine à moins de la distance de sécurité, côte à côte), le
  // plafond du profil revient : l'évitement de VoitureF1 (suivi, anticipation, urgence) suppose
  // des vitesses de virage raisonnables, et on ne surconduit pas à côté d'une autre voiture.
  moduler(devant, meteo = null) {
    super.moduler(devant, meteo);
    if (!this.neuroneActif || this.etat === VoitureF1.ETATS.DEPART || this.dansLeTrafic()) return;
    const base = this.vitesseDeBase();
    let vitesse = base * (1 + Math.max(this.drs ? VoitureF1.BONUS_DRS : 0, this.elan ?? 0));
    if (this.jaune) vitesse = Math.min(vitesse, base * VoitureF1.VITESSE_JAUNE);
    this.maxSpeed = vitesse;
  }

  // Une voiture devant, proche dans le cône, ou une voisine trop près (voir moduler).
  dansLeTrafic() {
    if (this.obstacle !== null && this.obstacle.long < VoitureNeuronale.PORTEE_TRAFIC) return true;
    const securite = this.distanceDeSecurite();
    return this.voisinsPercus.some(v => v !== this && Math.hypot(v.pos.x - this.pos.x, v.pos.y - this.pos.y) < securite);
  }

  // Pendant le pilotage neuronal, le filet de sécurité garderSurPiste passe par les pneus (nom
  // « filet » : ce n'est plus un réflexe de VoitureF1.REFLEXES, avec la glisse réaliste il s'ajoute
  // à la demande faite aux pneus). Il reste un filet, mais limité par l'adhérence : une voiture qui
  // arrive trop vite dans un virage ne peut plus compter sur lui pour tourner, le réseau doit
  // freiner avant (arrive). Les autres forces passent comme dans VoitureF1.
  appliquer(nom, force, poids) {
    super.appliquer(this.pilotageNeuronal && nom === 'piste' ? 'filet' : nom, force, poids);
  }

  // Les 4 poids pour ces entrées : sorties du réseau × variation de la voiture, bornés à [0, 1].
  poidsPour(entrees) {
    const sorties = this.reseau.passeAvant(entrees);
    const poids = {};
    VoitureNeuronale.COMPORTEMENTS.forEach((nom, k) => {
      poids[nom] = Math.max(0, Math.min(1, sorties[k] * this.facteursPoids[k]));
    });
    return poids;
  }

  // Les 4 forces de base (chacune limitée à maxForce). Calcule aussi les cibles du debug.
  forcesDeBase() {
    const p = this.parametres;
    const circuit = this.circuit;
    // SEEK : le point d'anticipation de la ligne de course (avec le déport de dépassement)
    const anticipation = p.anticipationSeek + VoitureF1.FACTEUR_ANTICIPATION * this.vitesse;
    const cibleSeek = this.pointDevant(anticipation, this.etat === VoitureF1.ETATS.COURSE ? this.decalageDepassement : 0);
    this.cibles.seek = cibleSeek;
    const seek = this.seek(cibleSeek);

    // ARRIVE : l'apex du prochain virage serré dans la zone de freinage, sinon le bord de la zone
    const rayon = this.rayonDeFreinage();
    this.rayonZoneDeFreinage = rayon;
    let arrive = null;
    const virage = circuit.prochainVirage(this.indicePiste, rayon);
    if (virage !== null) {
      const vApex = this.profil()[virage.apex];
      const point = circuit.pointLateral(virage.apex, circuit.decalagesLigne[virage.apex]);
      const apex = createVector(point.x, point.y);
      if (vApex < this.maxSpeed - 0.1 && p5.Vector.dist(apex, this.pos) >= VoitureF1.PASSAGE_APEX) {
        // usage VOLONTAIRE du map non borné de seek, comme VoitureF1.freinerPourLeVirage : d NÉGATIF
        const d = -vApex * rayon / (this.maxSpeed - vApex);
        this.cibles.apex = apex;
        arrive = this.arrive(apex, d);
      }
    }
    if (arrive === null) {
      const loin = this.pointDevant(Math.max(anticipation, rayon + VoitureF1.PASSAGE_APEX));
      this.cibles.arrive = loin;
      arrive = this.arrive(loin);
    }

    // WANDER : celui de Vehicle, avec les réglages du panneau
    this.distanceCercle = p.distanceCercle;
    this.wanderRadius = p.wanderRadius;
    this.displaceRange = p.displaceRange;
    const wander = this.wander();
    this.wanderTheta = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.wanderTheta));

    // SÉPARATION : les voisines à moins de la distance de sécurité repoussent la voiture
    const separation = createVector(0, 0);
    const securite = this.distanceDeSecurite();
    for (const autre of this.voisinsPercus) {
      if (autre === this) continue;
      const rel = p5.Vector.sub(autre.pos, this.pos);
      const d = rel.mag();
      if (d === 0 || d >= securite) continue;
      const somme = this.r + (autre.r ?? this.r);
      const proximite = Math.min(1, (securite - d) / Math.max(1, securite - somme));
      separation.add(createVector(-rel.x / d * proximite, -rel.y / d * proximite));
    }
    if (separation.mag() > 0) separation.setMag(this.maxForce * Math.min(1, separation.mag()));
    return { seek, arrive, wander, separation };
  }

  // Conduite en piste : le réseau dose les 4 comportements ; hors de son domaine (voir la règle de
  // reprise de contrôle), la conduite de VoitureF1.
  conduire(devant) {
    if (!this.neuroneActif) {
      super.conduire(devant);
      return;
    }
    this.pilotageNeuronal = true;
    this.entreesNeuronales = this.capteurs.mesurer(this, this.voisinsPercus);
    const poids = this.poidsPour(this.entreesNeuronales);
    this.poidsNeuronaux = poids;
    const forces = this.forcesDeBase();
    const somme = createVector(0, 0);
    this.forcesNeuronales = {};
    for (const nom of VoitureNeuronale.COMPORTEMENTS) {
      const f = forces[nom].copy().mult(poids[nom]);
      this.forcesNeuronales[nom] = f;
      somme.add(f);
    }
    somme.limit(this.maxForce);
    this.appliquer('neurone', somme, 1);
    // pour le dessin (feux de freinage, fumée) : la part d'arrive, gardée sans être appliquée
    this.forces.arrive = this.forcesNeuronales.arrive;
  }

  // Debug (touche d) : en plus des aides de VoitureF1, les rayons des capteurs (jaunes, rouges
  // quand le bord est à moins du tiers de la portée) et les 4 poids en barres au-dessus de la voiture.
  showDebug() {
    super.showDebug();
    if (!this.pilotageNeuronal) return;
    push();
    strokeWeight(1);
    for (const rayon of this.capteurs.rayons) {
      stroke(rayon.distance < CapteursVoiture.PORTEE_RAYON / 3 ? 'red' : 'yellow');
      line(this.pos.x, this.pos.y, rayon.x, rayon.y);
    }
    noStroke();
    const couleurs = { seek: [0, 220, 255], arrive: [255, 90, 80], wander: [120, 255, 120], separation: [255, 0, 255] };
    VoitureNeuronale.COMPORTEMENTS.forEach((nom, k) => {
      fill(...couleurs[nom]);
      rect(this.pos.x - 12 + k * 6, this.pos.y - 18 - 16 * this.poidsNeuronaux[nom], 5, 16 * this.poidsNeuronaux[nom]);
    });
    pop();
  }
}
