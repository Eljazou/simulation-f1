// Incident de la voiture d'un joueur (mode pilote) : une petite machine à états de décision. Ce
// n'est pas un Vehicle : elle ne bouge ni ne dessine rien. Course la crée au moment d'un ACCIDENT
// (une par joueur, `joueur.incident`), lui passe le temps de course écoulé (avancer(dt)) et
// applique ce que chaque transition demande. La MÊME course continue : pas d'élimination, pas de
// fin de partie, pas de pause.
//
//   RADIO           le joueur ne contrôle plus (la voiture freine) ; message radio (DUREE_RADIO s)
//   NEUTRALISATION  safety car (DUREE_NEUTRALISATION s)
//   DECOMPTE        la voiture est remise en piste (Course.remettreEnPiste), roule seule à ≈ 80 km/h
//                   pendant le compte à rebours 3-2-1 (DUREE_DECOMPTE s)
//   REPRISE         le joueur reprend le contrôle ; invulnérable DUREE_INVULNERABLE s (pas de contact)
//   FINI            plus d'incident (Course remet joueur.incident à null)
//
// Transitions renvoyées par avancer : 'neutraliser', 'remettre', 'reprendre', 'terminer'.
// Une sortie de piste n'est plus un incident (17 octobre 2026) : ce sont les limites de piste
// (Course.surveillerLesLimites : avertissements, pénalités, la course continue).
class IncidentJoueur {
  static TYPES = ['accident'];
  static PHASES = { RADIO: 'RADIO', NEUTRALISATION: 'NEUTRALISATION', DECOMPTE: 'DECOMPTE', REPRISE: 'REPRISE', FINI: 'FINI' };
  // Durées de la séquence (secondes de course).
  static DUREE_RADIO = 2;
  static DUREE_NEUTRALISATION = 3;
  static DUREE_DECOMPTE = 3;
  static DUREE_INVULNERABLE = 2;
  // Remise en piste : vitesse de départ (km/h affichés, voir VoiturePilote.KMH).
  static VITESSE_REPRISE_KMH = 80;
  // Pénalité ajoutée au temps final (secondes ; curseur « Joueur », 0 = aucune).
  static PENALITE_ACCIDENT = 10;
  // Un contact plus lent que la vitesse d'impact réglable (frôlement) n'est un accident que si une
  // carrosserie s'enfonce d'au moins ENFONCEMENT_ACCIDENT px dans l'autre ou dans le mur.
  static ENFONCEMENT_ACCIDENT = 3;
  static MESSAGES = {
    accident: 'Accident ! On te remet en piste.',
  };

  constructor(joueur, type, { cause = '', x = 0, y = 0 } = {}) {
    if (!IncidentJoueur.TYPES.includes(type)) throw new RangeError(`Incident inconnu : ${type}.`);
    this.joueur = joueur;
    this.type = type;
    this.cause = cause;
    this.x = x;
    this.y = y;
    this.phase = IncidentJoueur.PHASES.RADIO;
    this.chrono = 0;
  }

  get message() {
    return IncidentJoueur.MESSAGES[this.type];
  }

  // Avant la remise en piste (radio, neutralisation) : la voiture est là où l'incident l'a laissée.
  get avantRemise() {
    return this.phase === IncidentJoueur.PHASES.RADIO || this.phase === IncidentJoueur.PHASES.NEUTRALISATION;
  }

  // Le compte à rebours affiché (3, 2, 1), ou null hors de la phase DECOMPTE.
  get decompte() {
    if (this.phase !== IncidentJoueur.PHASES.DECOMPTE) return null;
    return Math.max(1, Math.ceil(IncidentJoueur.DUREE_DECOMPTE - this.chrono - 1e-9));
  }

  // Le temps passe (secondes de course). Renvoie la transition faite, ou null.
  avancer(dt) {
    const { RADIO, NEUTRALISATION, DECOMPTE, REPRISE } = IncidentJoueur.PHASES;
    this.chrono += dt;
    const fini = duree => this.chrono >= duree - 1e-9;
    if (this.phase === RADIO && fini(IncidentJoueur.DUREE_RADIO)) return this.passerA(NEUTRALISATION, 'neutraliser');
    if (this.phase === NEUTRALISATION && fini(IncidentJoueur.DUREE_NEUTRALISATION)) return this.passerA(DECOMPTE, 'remettre');
    if (this.phase === DECOMPTE && fini(IncidentJoueur.DUREE_DECOMPTE)) return this.passerA(REPRISE, 'reprendre');
    if (this.phase === REPRISE && fini(IncidentJoueur.DUREE_INVULNERABLE)) return this.passerA(IncidentJoueur.PHASES.FINI, 'terminer');
    return null;
  }

  passerA(phase, transition) {
    this.phase = phase;
    this.chrono = 0;
    return transition;
  }
}
