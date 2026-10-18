// Entraîneur : NEUROÉVOLUTION des réseaux qui dosent les steering behaviors des voitures (voir
// voitureNeuronale.js). Ce n'est pas un Vehicle et il ne bouge rien lui-même : il crée des
// VoitureNeuronale à la position de départ (règle de scène : une seule fois par génération, à
// leur naissance), leur donne ce qu'elles perçoivent, puis les fait décider, piloter et avancer
// (decide, applyBehaviors, update), comme Course. Il mesure leur conduite et fait évoluer leurs
// cerveaux.
//
// Une GÉNÉRATION : toute la population roule en parallèle, par pas fixes de PAS_TEMPS secondes,
// jusqu'à ce que toutes les voitures soient éliminées, que toutes aient fait TOURS_CIBLE tours, ou
// que DUREE_GENERATION secondes soient écoulées. Élimination : sortie de piste durable (plus de
// DUREE_SORTIE s d'affilée, centre au-delà du bord), immobilité (plus de DUREE_IMMOBILE s sous
// VITESSE_IMMOBILE, après GRACE_DEPART s), marche arrière (plus de DUREE_ARRIERE s à reculer le
// long de la piste). Une voiture éliminée n'est plus simulée (elle reste où elle est).
//
// FITNESS (pondérations réglables, POIDS_FITNESS) :
//   F = progression × 100 × distance / longueur du tour    (100 points par tour : dominant)
//     + tour × tours complets + secteur × secteurs franchis
//     + vitesse × vitesse moyenne (part de vitesseMax, 0 à 1)
//     + ligne × (1 − écart moyen à la ligne de course / demi-largeur) × min(1, distance / longueur)
//     − sortie × (secondes où le filet garderSurPiste agit + secondes avec une roue hors piste)
//                 (le filet est un FILET de sécurité : sans frottement, une voiture lancée qui ne
//                 ferait que s'appuyer dessus finirait le tour ; s'en servir coûte donc des points)
//     − contact × contacts − glisse × secondes de glisse excessive
//     − immobilite × secondes immobile − arriere × secondes de marche arrière.
//
// NOUVELLE GÉNÉRATION (même taille) : élitisme (les meilleurs, copiés tels quels), une part
// d'individus aléatoires (diversité), le reste par croisement de deux parents choisis par
// TOURNOI, puis mutation (taux et amplitude réglables ; ils baissent, jusqu'à MUTATION_MIN fois
// leur valeur, quand le meilleur fitness stagne pendant STAGNATION générations).
//
// ÉTAPE 1 (seul) : les voitures ne se voient pas (ni voisines ni collisions). CURRICULUM (NIVEAUX) :
// circuit école au sec, Classique au sec, Technique humide (0,3), Rapide mouillé (0,6), puis des
// variantes aléatoires (profil, graine et humidité de 0 à HUMIDITE_ALEATOIRE tirés à chaque
// génération) ; pneus medium (des slicks) : sous la pluie l'adhérence baisse, il faut freiner plus
// tôt. On passe au niveau suivant quand le meilleur fitness atteint SEUIL_CURRICULUM. Sans
// curriculum : variantes aléatoires dès le départ.
// ÉTAPE 2 (trafic) : quand le dernier niveau est atteint et que le meilleur fitness dépasse
// SEUIL_ETAPE2, la MÊME population (les cerveaux de l'étape 1) roule en manches de TAILLE_MANCHE
// voitures neuronales et CLASSIQUES_PAR_MANCHE VoitureF1 classiques, sur la grille : voisines,
// séparation et contacts comptent.
//
// NOTE DE QUALITÉ (sur 100), calculée sur des circuits JAMAIS vus à l'entraînement (graines
// réservées, CIRCUITS_TEST, au sec, humide et mouillé) par le meilleur réseau :
//   50 × tours propres / tours demandés      (seule, TOURS_TEST tours par circuit ; un tour est
//                                             propre sans roue hors piste et avec moins de
//                                             FILET_TOUR_PROPRE s de filet de sécurité)
//   + 30 × moyenne de borne((1,08 × réf − t) / (0,16 × réf), 0, 1)   (t = son meilleur tour, réf =
//                                             celui d'une VoitureF1 classique dans les mêmes
//                                             conditions : 15 points à temps égal, 30 à 8 % plus vite)
//   + 20 × max(0, 1 − contacts / CONTACTS_MAX)                      (4 IA et 4 classiques, un tour)
// « Prêt pour la course » au-dessus du seuil réglable (seuilPret).
//
// Temps : les durées sont en secondes de simulation. avancer(dt) reçoit le temps réel écoulé
// (deltaTime / 1000), multiplié par la vitesse d'entraînement (1 à 20) ; un BUDGET de millisecondes
// par image (mesuré avec l'horloge injectée) borne le nombre de pas joués : l'interface reste
// fluide, la vitesse effective peut être plus faible que la vitesse demandée.
// Aléatoire : un générateur à graine (ReseauNeuronal.mulberry32), sauf wander() de Vehicle, qui
// tire random() de p5 (graine fixe dans les tests et le script Node).
class Entraineur {
  static PAS_TEMPS = 1 / 60;
  static POPULATION = 40;
  static POPULATION_MIN = 20;
  static POPULATION_MAX = 100;
  static TAUX_MUTATION = 0.15;
  static AMPLITUDE_MUTATION = 0.4;
  static ELITISME = 0.05;
  static TOURNOI = 3;
  static PART_ALEATOIRE = 0.05;
  static STAGNATION = 4;
  static BAISSE_MUTATION = 0.8;
  static MUTATION_MIN = 0.25;
  static GRAINE = 2026;
  static DUREE_GENERATION = 35;
  static TOURS_CIBLE = 2;
  static VITESSE = 10;
  static VITESSE_MAX = 20;
  static BUDGET_MS = 12;
  // la réserve de temps à jouer ne dépasse jamais ceci (secondes) : pas de rattrapage sans fin
  static RESERVE_MAX = 0.5;
  // élimination
  static DUREE_SORTIE = 2;
  static DUREE_IMMOBILE = 3;
  static VITESSE_IMMOBILE = 0.3;
  static GRACE_DEPART = 1.5;
  static DUREE_ARRIERE = 1;
  // curriculum et étapes
  static NIVEAUX = [{ id: 'ecole', profil: 'ecole', humidite: 0 }, { id: 'classique', profil: 'classique', humidite: 0 },
    { id: 'technique', profil: 'technique', humidite: 0.3 }, { id: 'rapide', profil: 'rapide', humidite: 0.6 },
    { id: 'aleatoire', profil: null, humidite: null }];
  static HUMIDITE_ALEATOIRE = 0.8;
  static SEUIL_CURRICULUM = 250;
  static SEUIL_ETAPE2 = 240;
  static TAILLE_MANCHE = 8;
  static CLASSIQUES_PAR_MANCHE = 3;
  // note de qualité
  static SEUIL_PRET = 70;
  static TOURS_TEST = 2;
  static DUREE_TEST = 70;
  static FILET_TOUR_PROPRE = 1.5;
  static CONTACTS_MAX = 4;
  static EVALUER_TOUTES = 3;
  static PROFILS_ALEATOIRES = ['classique', 'technique', 'rapide'];
  static CIRCUITS_TEST = [{ profil: 'classique', graine: 424242, humidite: 0 }, { profil: 'technique', graine: 515151, humidite: 0.4 },
    { profil: 'rapide', graine: 636363, humidite: 0.7 }];
  // Circuit école : un ovale aux virages larges (données d'un profil de Circuit, voir circuitEcole).
  static PROFIL_ECOLE = {
    libelle: 'École',
    points: [[300, 860], [900, 865], [1500, 860], [1640, 760], [1660, 560], [1620, 330], [1480, 230], [900, 225],
      [320, 230], [180, 340], [160, 560], [180, 760]],
    arrivee: [900, 864],
    stands: { avant: 700, apres: 560 },
  };
  // Pondérations du fitness (voir l'en-tête) : valeurs de départ des curseurs.
  static POIDS_FITNESS = { progression: 1, tour: 20, secteur: 4, vitesse: 20, ligne: 10, sortie: 10, contact: 15, glisse: 2,
    immobilite: 2, arriere: 10 };

  // Fitness d'une conduite (fonction pure, voir l'en-tête). stats : distance (px), longueur (px
  // du tour), tours, secteurs, vitesseMoyenne (0 à 1), ecartMoyen (0 à 1), tempsHorsPiste,
  // tempsFilet (secondes où garderSurPiste agit), contacts, tempsGlisse, tempsImmobile, tempsArriere.
  static fitness(stats, poids = Entraineur.POIDS_FITNESS) {
    const w = { ...Entraineur.POIDS_FITNESS, ...poids };
    const parcours = Math.max(0, stats.distance) / Math.max(1, stats.longueur);
    return w.progression * 100 * parcours +
      w.tour * stats.tours + w.secteur * stats.secteurs +
      w.vitesse * stats.vitesseMoyenne +
      w.ligne * Math.max(0, 1 - stats.ecartMoyen) * Math.min(1, parcours) -
      w.sortie * ((stats.tempsFilet ?? 0) + stats.tempsHorsPiste) - w.contact * stats.contacts - w.glisse * stats.tempsGlisse -
      w.immobilite * stats.tempsImmobile - w.arriere * stats.tempsArriere;
  }

  // Les réglages de course pour l'entraînement : ceux du jeu, sans IA avancée ni incidents (pas
  // d'erreur tirée, pas de panne) : la conduite mesurée est celle du réseau.
  static parametresEntrainement() {
    return { ...Course.parametresParDefaut(), iaAvancee: false, incidents: false, pannes: false, fatigue: false, plongeon: false,
      ordresEquipe: false, modePilote: false, frequenceErreurs: 0 };
  }

  // Le circuit école. Circuit n'accepte que les profils de Circuit.PROFILS : le profil école y est
  // inscrit le temps de la construction, puis retiré (les trois circuits du jeu et la table des
  // profils restent inchangés ; le menu des circuits ne le voit jamais).
  static circuitEcole(graine = Circuit.GRAINE) {
    Circuit.PROFILS.ecole = Entraineur.PROFIL_ECOLE;
    try {
      return new Circuit('ecole', graine);
    } finally {
      delete Circuit.PROFILS.ecole;
    }
  }

  // options : population, caches, graine, tauxMutation, amplitudeMutation, curriculum, vitesse,
  // dureeGeneration, poidsFitness, seuilPret, arretAuto, budgetMs, horloge (millisecondes, pour le
  // budget par image), parametres (réglages des voitures), circuits (cache partagé de circuits),
  // circuitFixe ({ profil, graine, humidite } : toujours ce circuit, sans curriculum ; tests),
  // evaluationAuto (note de qualité toutes les EVALUER_TOUTES générations ; vrai par défaut).
  constructor(options = {}) {
    this.options = options;
    this.horloge = options.horloge ?? (() => 0);
    this.circuits = options.circuits ?? new Map();
    this.parametres = options.parametres ?? Entraineur.parametresEntrainement();
    this.reinitialiser(options);
  }

  // Un nouvel entraînement (génération 0, étape 1, premier niveau), avec ces options.
  reinitialiser(options = {}) {
    const o = { ...this.options, ...options };
    this.options = o;
    this.taillePopulation = Entraineur.borner(Math.round(o.population ?? Entraineur.POPULATION), Entraineur.POPULATION_MIN, Entraineur.POPULATION_MAX);
    this.caches = ReseauNeuronal.validerCaches(o.caches ?? ReseauNeuronal.CACHES);
    this.graine = Math.round(o.graine ?? Entraineur.GRAINE);
    this.tauxBase = o.tauxMutation ?? Entraineur.TAUX_MUTATION;
    this.amplitudeBase = o.amplitudeMutation ?? Entraineur.AMPLITUDE_MUTATION;
    this.curriculum = o.curriculum ?? true;
    this.vitesse = Entraineur.borner(o.vitesse ?? Entraineur.VITESSE, 1, Entraineur.VITESSE_MAX);
    this.dureeGeneration = o.dureeGeneration ?? Entraineur.DUREE_GENERATION;
    this.poidsFitness = { ...Entraineur.POIDS_FITNESS, ...(o.poidsFitness ?? {}) };
    this.seuilPret = o.seuilPret ?? Entraineur.SEUIL_PRET;
    this.arretAuto = o.arretAuto ?? false;
    this.evaluationAuto = o.evaluationAuto ?? true;
    this.budgetMs = o.budgetMs ?? Entraineur.BUDGET_MS;
    this.alea = ReseauNeuronal.mulberry32(this.graine);
    this.taux = this.tauxBase;
    this.amplitude = this.amplitudeBase;
    this.generation = 0;
    this.etape = 1;
    this.circuitFixe = o.circuitFixe ?? null;
    this.niveau = this.curriculum ? 0 : Entraineur.NIVEAUX.length - 1;
    this.historique = [];
    this.meilleur = null;
    this.meilleurFitness = -Infinity;
    this.stagnation = 0;
    this.note = null;
    this.detailNote = null;
    this.pret = false;
    this.evaluation = null;
    this.demo = null;
    this.enCours = false;
    this.reserve = 0;
    this.vitesseEffective = 0;
    this.circuitsEntrainement = new Set();
    this.reseaux = Array.from({ length: this.taillePopulation }, () => this.nouveauReseau());
    this.preparerGeneration();
  }

  static borner(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }

  nouveauReseau() {
    return new ReseauNeuronal(this.caches, ReseauNeuronal.mulberry32(Math.floor(this.alea() * 4294967296)));
  }

  // Un circuit (profil, graine), gardé en cache : le calculer prend un moment.
  circuit(profil, graine = Circuit.GRAINE) {
    const cle = `${profil}#${graine}`;
    if (!this.circuits.has(cle)) {
      if (this.circuits.size > 16) this.circuits.delete(this.circuits.keys().next().value);
      this.circuits.set(cle, profil === 'ecole' ? Entraineur.circuitEcole(graine) : new Circuit(profil, graine));
    }
    return this.circuits.get(cle);
  }

  static cleTest(c) {
    return `${c.profil}#${c.graine}`;
  }

  // Une graine d'entraînement qui n'est jamais celle d'un circuit de test.
  graineAleatoire() {
    const reservees = new Set(Entraineur.CIRCUITS_TEST.map(c => c.graine));
    let g;
    do g = 1 + Math.floor(this.alea() * 999983); while (reservees.has(g) || g === Circuit.GRAINE);
    return g;
  }

  // Le circuit de la génération : { profil, graine, humidite } du niveau du curriculum (ou une
  // variante aléatoire ; ou le circuit fixé dans les options).
  circuitDuNiveau() {
    if (this.circuitFixe !== null) return { graine: Circuit.GRAINE, humidite: 0, ...this.circuitFixe };
    const niveau = Entraineur.NIVEAUX[this.niveau];
    if (niveau.profil !== null) return { profil: niveau.profil, graine: Circuit.GRAINE, humidite: niveau.humidite };
    const profil = Entraineur.PROFILS_ALEATOIRES[Math.floor(this.alea() * Entraineur.PROFILS_ALEATOIRES.length)];
    const graine = this.graineAleatoire();
    return { profil, graine, humidite: Math.round(this.alea() * Entraineur.HUMIDITE_ALEATOIRE * 100) / 100 };
  }

  get nomNiveau() {
    return Entraineur.NIVEAUX[this.niveau].id;
  }

  // --- Simulation -----------------------------------------------------------------------------

  // Une voiture à son emplacement de grille (règle de scène : sa naissance), feux éteints.
  creerVoiture(Classe, circuit, rang, reseau = null) {
    const place = circuit.emplacementGrille(rang);
    const boxes = circuit.stands.boxes;
    const voiture = new Classe(place.x, place.y, {
      circuit, parametres: this.parametres, numero: rang + 1, place, box: boxes[rang % boxes.length],
      pilote: { nom: Classe === VoitureNeuronale ? 'Réseau' : 'Classique', code: Classe === VoitureNeuronale ? 'IA' : 'CLA' },
      alea: () => 0.5, surfaces: null, reseau,
    });
    voiture.demarrer();
    return voiture;
  }

  // Statistiques de conduite d'une voiture (fitness, élimination).
  static nouvellesStats(voiture) {
    return { depart: voiture.progression, distance: 0, longueur: voiture.circuit.longueur, tours: 0, secteurs: 0,
      temps: 0, sommeVitesse: 0, sommeEcart: 0, tempsFilet: 0, tempsHorsPiste: 0, horsPisteContinu: 0, contacts: 0, tempsGlisse: 0,
      tempsImmobile: 0, immobileContinu: 0, tempsArriere: 0, arriereContinu: 0, vitesseMoyenne: 0, ecartMoyen: 0,
      precedente: voiture.progression, tempsTours: [], debutTour: 0, horsPisteTour: false, filetTour: 0, toursPropres: 0 };
  }

  // Une manche : un circuit, des voitures (suivis : { voiture, individu, stats, eliminee }),
  // collisions ou non.
  creerManche(circuit, specs, { collisions = false, humidite = 0 } = {}) {
    const suivis = specs.map(({ Classe, rang, reseau = null, individu = null }) => {
      const voiture = this.creerVoiture(Classe, circuit, rang, reseau);
      return { voiture, individu, stats: Entraineur.nouvellesStats(voiture), eliminee: false };
    });
    // piste mouillée : une météo réduite à son humidité (VoitureF1.mettreAJourAdherence la lit)
    const meteo = humidite > 0 ? { humidite } : null;
    return { circuit, suivis, collisions, meteo, temps: 0, contactsEnCours: new Set() };
  }

  // Un pas d'une manche : perception, décisions, forces, locomotion, puis mesures.
  pasManche(manche, dt = Entraineur.PAS_TEMPS) {
    const actifs = manche.suivis.filter(s => !s.eliminee);
    const voitures = actifs.map(s => s.voiture);
    const circuit = manche.circuit;
    const contexte = voiture => {
      if (!manche.collisions) return { voisins: [], devant: null, meteo: manche.meteo };
      const portee = Math.max(this.parametres.porteeEvitement, this.parametres.distanceSecurite * 1.6);
      const voisins = voitures.filter(v => v !== voiture && Math.hypot(v.pos.x - voiture.pos.x, v.pos.y - voiture.pos.y) < portee);
      let devant = null;
      for (const v of voisins) {
        const d = circuit.distanceDevant(voiture.indicePiste, v.indicePiste);
        if (d > 0 && d < circuit.longueur / 2 && (devant === null || d < devant.distance)) devant = { vehicule: v, distance: d };
      }
      return { voisins, devant, meteo: manche.meteo };
    };
    const contextes = new Map(voitures.map(v => [v, contexte(v)]));
    voitures.forEach(v => v.decide(contextes.get(v)));
    voitures.forEach(v => v.applyBehaviors(contextes.get(v)));
    voitures.forEach(v => v.update(dt));
    manche.temps += dt;
    if (manche.collisions) this.compterContacts(manche, actifs);
    actifs.forEach(s => this.mesurer(s, dt, manche.temps));
  }

  // Contacts entre carrosseries (rectangles, Course.chevauchement) : un nouveau contact par paire.
  compterContacts(manche, actifs) {
    const enCours = new Set();
    for (let a = 0; a < actifs.length; a++) {
      for (let b = a + 1; b < actifs.length; b++) {
        const va = actifs[a].voiture;
        const vb = actifs[b].voiture;
        if (Math.hypot(va.pos.x - vb.pos.x, va.pos.y - vb.pos.y) > VoitureF1.LONGUEUR + 2) continue;
        if (Course.chevauchement(va.coins(), vb.coins()) <= 0) continue;
        const cle = `${va.numero}|${vb.numero}`;
        enCours.add(cle);
        if (!manche.contactsEnCours.has(cle)) {
          actifs[a].stats.contacts++;
          actifs[b].stats.contacts++;
        }
      }
    }
    manche.contactsEnCours = enCours;
  }

  // Mesures d'une voiture après un pas, et règles d'élimination.
  mesurer(suivi, dt, temps) {
    const v = suivi.voiture;
    const s = suivi.stats;
    const c = v.circuit;
    s.temps += dt;
    const progression = v.progression;
    const recul = progression < s.precedente - 0.5;
    s.precedente = progression;
    s.distance = Math.max(s.distance, progression - s.depart);
    // tours complets et secteurs, depuis la ligne de départ (la grille est juste derrière)
    const toursAvant = s.tours;
    s.tours = Math.max(s.tours, v.tour);
    s.secteurs = Math.max(s.secteurs, Math.floor((progression - s.depart) / (c.longueur / 3)));
    if (s.tours > toursAvant && v.tour >= 1) {
      s.tempsTours.push(s.temps - s.debutTour);
      if (!s.horsPisteTour && s.filetTour < Entraineur.FILET_TOUR_PROPRE) s.toursPropres++;
      s.horsPisteTour = false;
      s.filetTour = 0;
      s.debutTour = s.temps;
    } else if (s.tours > toursAvant) {
      s.debutTour = s.temps;
      s.horsPisteTour = false;
      s.filetTour = 0;
    }
    s.sommeVitesse += v.vitesse * dt;
    s.sommeEcart += Math.min(1, Math.abs(v.ecartLateral - c.decalagesLigne[v.indicePiste]) / (c.largeur / 2)) * dt;
    s.vitesseMoyenne = Math.min(1, s.sommeVitesse / Math.max(1e-9, s.temps) / Math.max(0.1, this.parametres.vitesseMax));
    s.ecartMoyen = s.sommeEcart / Math.max(1e-9, s.temps);
    // sortie de piste (malus) : le filet de sécurité garderSurPiste doit agir (la voiture a quitté
    // le couloir sûr), et chaque roue au-delà du bord compte en plus ; sortie durable
    // (élimination) : le centre au-delà du bord
    const ecart = Math.abs(v.ecartLateral);
    const filet = [v.forces.piste, v.forces.filet].some(f => f !== undefined && f.mag() > 1e-9);
    if (filet) {
      s.tempsFilet += dt;
      s.filetTour += dt;
    }
    if (ecart + VoitureF1.LARGEUR / 2 > c.largeur / 2) {
      s.tempsHorsPiste += dt;
      s.horsPisteTour = true;
    }
    s.horsPisteContinu = ecart > c.largeur / 2 ? s.horsPisteContinu + dt : 0;
    // glisse excessive : dérive au-delà de deux fois le seuil, ou fort sous-virage
    if (Math.abs(v.derive) > 2 * (this.parametres.seuilGlisse ?? VoitureF1.SEUIL_GLISSE) || v.etatPneus.sousVirage > 0.3) s.tempsGlisse += dt;
    if (temps > Entraineur.GRACE_DEPART && v.vitesse < Entraineur.VITESSE_IMMOBILE) {
      s.tempsImmobile += dt;
      s.immobileContinu += dt;
    } else {
      s.immobileContinu = 0;
    }
    if (recul) {
      s.tempsArriere += dt;
      s.arriereContinu += dt;
    } else {
      s.arriereContinu = 0;
    }
    if (s.horsPisteContinu > Entraineur.DUREE_SORTIE || s.immobileContinu > Entraineur.DUREE_IMMOBILE ||
      s.arriereContinu > Entraineur.DUREE_ARRIERE) {
      suivi.eliminee = true;
    }
  }

  // --- Générations ----------------------------------------------------------------------------

  // Les voitures de la génération, à la position de départ : étape 1, toutes ensemble (elles ne
  // se voient pas) ; étape 2, par manches de TAILLE_MANCHE neuronales et CLASSIQUES_PAR_MANCHE
  // classiques, sur la grille.
  preparerGeneration() {
    const { profil, graine, humidite } = this.circuitDuNiveau();
    this.circuitCourant = { profil, graine, humidite };
    this.circuitsEntrainement.add(Entraineur.cleTest({ profil, graine }));
    const circuit = this.circuit(profil, graine);
    this.individus = this.reseaux.map((reseau, k) => ({ reseau, fitness: 0, numero: k }));
    this.manches = [];
    if (this.etape === 1) {
      this.manches.push(this.creerManche(circuit, this.individus.map(individu => ({ Classe: VoitureNeuronale, rang: 0, reseau: individu.reseau, individu })),
        { humidite }));
    } else {
      const taille = Entraineur.TAILLE_MANCHE;
      const total = taille + Entraineur.CLASSIQUES_PAR_MANCHE;
      // les classiques sont réparties sur la grille, entre les neuronales
      const rangsClassiques = Array.from({ length: Entraineur.CLASSIQUES_PAR_MANCHE }, (_, k) => Math.round((k + 0.5) * total / Entraineur.CLASSIQUES_PAR_MANCHE));
      for (let debut = 0; debut < this.individus.length; debut += taille) {
        const groupe = this.individus.slice(debut, debut + taille);
        const specs = [];
        let rang = 0;
        let k = 0;
        while (k < groupe.length) {
          if (rangsClassiques.includes(rang)) specs.push({ Classe: VoitureF1, rang });
          else specs.push({ Classe: VoitureNeuronale, rang, reseau: groupe[k].reseau, individu: groupe[k++] });
          rang++;
        }
        this.manches.push(this.creerManche(circuit, specs, { collisions: true, humidite }));
      }
    }
    this.individus.forEach(individu => {
      individu.suivi = this.manches.flatMap(m => m.suivis).find(s => s.individu === individu);
    });
    this.tempsGeneration = 0;
    this.suiviMeilleur = { tour: null, poids: [], dernierTour: this.suiviMeilleur?.dernierTour ?? null };
  }

  // Toutes les voitures neuronales de la génération (pour le dessin).
  get suivis() {
    return this.manches.flatMap(m => m.suivis);
  }

  get enVie() {
    return this.individus.filter(i => !i.suivi.eliminee).length;
  }

  // La meilleure voiture du moment (plus grand fitness provisoire, en vie de préférence).
  get meilleureVoiture() {
    let meilleur = null;
    for (const i of this.individus) {
      const f = Entraineur.fitness(i.suivi.stats, this.poidsFitness) - (i.suivi.eliminee ? 1e6 : 0);
      if (meilleur === null || f > meilleur.f) meilleur = { f, individu: i };
    }
    return meilleur === null ? null : meilleur.individu.suivi.voiture;
  }

  // Un pas de toute la génération ; la génération finit quand il le faut.
  pas() {
    this.manches.forEach(m => this.pasManche(m));
    this.tempsGeneration += Entraineur.PAS_TEMPS;
    // les 4 poids de la meilleure voiture pendant son tour (graphique de la page)
    const meilleure = this.meilleureVoiture;
    if (meilleure !== null && meilleure.pilotageNeuronal) {
      // un nouveau tour (ou une autre meilleure voiture) : la série repart ; un tour fini est gardé
      // (dernierTour) pour que le graphique montre toujours un tour complet
      if (this.suiviMeilleur.tour !== meilleure.tour || this.suiviMeilleur.voiture !== meilleure) {
        const fini = this.suiviMeilleur.voiture === meilleure && this.suiviMeilleur.poids.length > 60;
        const dernierTour = fini ? this.suiviMeilleur.poids : this.suiviMeilleur.dernierTour ?? null;
        this.suiviMeilleur = { tour: meilleure.tour, voiture: meilleure, poids: [], dernierTour };
      }
      const p = meilleure.poidsNeuronaux;
      this.suiviMeilleur.poids.push([meilleure.indicePiste / meilleure.circuit.n, p.seek, p.arrive, p.wander, p.separation]);
      if (this.suiviMeilleur.poids.length > 4000) this.suiviMeilleur.poids.shift();
    }
    const finie = this.enVie === 0 || this.tempsGeneration >= this.dureeGeneration ||
      this.individus.every(i => i.suivi.eliminee || i.suivi.stats.tours >= Entraineur.TOURS_CIBLE);
    if (finie) this.finirGeneration();
  }

  // Fin de génération : fitness, historique, curriculum et étapes, puis la génération suivante.
  finirGeneration() {
    this.individus.forEach(i => { i.fitness = Entraineur.fitness(i.suivi.stats, this.poidsFitness); });
    const tries = [...this.individus].sort((a, b) => b.fitness - a.fitness);
    const meilleur = tries[0];
    const moyenne = tries.reduce((s, i) => s + i.fitness, 0) / tries.length;
    this.historique.push({ generation: this.generation, meilleur: meilleur.fitness, moyenne, niveau: this.nomNiveau, etape: this.etape,
      circuit: { ...this.circuitCourant } });
    // stagnation : le meilleur fitness ne progresse plus (de 1 %) ; la mutation baisse
    if (meilleur.fitness > this.meilleurFitness * 1.01 + 1e-9 || this.meilleur === null) {
      this.stagnation = 0;
    } else {
      this.stagnation++;
    }
    if (this.meilleur === null || meilleur.fitness >= this.meilleurFitness) {
      this.meilleurFitness = meilleur.fitness;
      this.meilleur = { reseau: meilleur.reseau.cloner(), fitness: meilleur.fitness, generation: this.generation, etape: this.etape };
    }
    if (this.stagnation >= Entraineur.STAGNATION) {
      this.taux = Math.max(this.tauxBase * Entraineur.MUTATION_MIN, this.taux * Entraineur.BAISSE_MUTATION);
      this.amplitude = Math.max(this.amplitudeBase * Entraineur.MUTATION_MIN, this.amplitude * Entraineur.BAISSE_MUTATION);
      this.stagnation = 0;
    }
    // curriculum : niveau suivant quand le meilleur atteint le seuil ; étape 2 au dernier niveau
    const dernier = Entraineur.NIVEAUX.length - 1;
    if (this.etape === 1 && meilleur.fitness >= Entraineur.SEUIL_CURRICULUM && this.niveau < dernier) {
      this.niveau++;
      this.meilleurFitness = -Infinity;
    } else if (this.etape === 1 && this.niveau === dernier && meilleur.fitness >= Entraineur.SEUIL_ETAPE2) {
      this.passerEtape2();
    }
    // note de qualité : régulièrement, sur les circuits jamais vus
    if (this.evaluationAuto && this.evaluation === null && (this.generation % Entraineur.EVALUER_TOUTES === Entraineur.EVALUER_TOUTES - 1)) {
      this.lancerEvaluation(this.meilleur.reseau);
    }
    this.reseaux = this.nouvelleGeneration(tries);
    this.generation++;
    this.preparerGeneration();
  }

  // Charger un modèle : la population repart de ce réseau (lui-même, puis des copies mutées).
  chargerReseau(reseau) {
    this.caches = reseau.caches;
    this.reseaux = Array.from({ length: this.taillePopulation }, (_, k) => {
      const copie = reseau.cloner();
      if (k > 0) copie.muter(this.taux, this.amplitude, this.alea);
      return copie;
    });
    this.meilleur = null;
    this.meilleurFitness = -Infinity;
    this.preparerGeneration();
  }

  // Étape 2 (trafic) : la même population, avec collisions.
  passerEtape2() {
    this.etape = 2;
    this.meilleurFitness = -Infinity;
  }

  // Sélection par tournoi : le meilleur de TOURNOI individus tirés au hasard.
  tournoi(individus) {
    let gagnant = null;
    for (let k = 0; k < Entraineur.TOURNOI; k++) {
      const candidat = individus[Math.floor(this.alea() * individus.length)];
      if (gagnant === null || candidat.fitness > gagnant.fitness) gagnant = candidat;
    }
    return gagnant;
  }

  // La génération suivante (même taille) : élites, aléatoires, enfants (croisement + mutation).
  nouvelleGeneration(tries) {
    const n = this.taillePopulation;
    const elites = Math.max(1, Math.round(Entraineur.ELITISME * n));
    const aleatoires = Math.round(Entraineur.PART_ALEATOIRE * n);
    const suivants = tries.slice(0, elites).map(i => i.reseau.cloner());
    for (let k = 0; k < aleatoires && suivants.length < n; k++) suivants.push(this.nouveauReseau());
    while (suivants.length < n) {
      const a = this.tournoi(tries);
      const b = this.tournoi(tries);
      const enfant = a.reseau.croiser(b.reseau, this.alea);
      enfant.muter(this.taux, this.amplitude, this.alea);
      suivants.push(enfant);
    }
    return suivants;
  }

  // --- Note de qualité (circuits jamais vus) --------------------------------------------------

  // Lance l'évaluation (elle avance pas à pas dans avancer, sous le même budget de temps).
  lancerEvaluation(reseau) {
    this.evaluation = this.evaluer(reseau.cloner());
  }

  // Évaluation pas à pas (un générateur : un yield par pas de simulation). À la fin : this.note,
  // this.detailNote, this.pret.
  * evaluer(reseau) {
    const tests = Entraineur.CIRCUITS_TEST;
    let toursPropres = 0;
    const ratios = [];
    const temps = [];
    const references = [];
    for (const test of tests) {
      const circuit = this.circuit(test.profil, test.graine);
      const reference = yield* this.tempsReference(circuit, test.humidite);
      references.push(reference);
      const manche = this.creerManche(circuit, [{ Classe: VoitureNeuronale, rang: 0, reseau }], { humidite: test.humidite });
      const suivi = manche.suivis[0];
      while (!suivi.eliminee && suivi.stats.tours < Entraineur.TOURS_TEST && manche.temps < Entraineur.DUREE_TEST) {
        this.pasManche(manche);
        yield;
      }
      toursPropres += Math.min(Entraineur.TOURS_TEST, suivi.stats.toursPropres);
      const meilleurTour = suivi.stats.tempsTours.length > 0 ? Math.min(...suivi.stats.tempsTours) : null;
      temps.push(meilleurTour);
      ratios.push(meilleurTour === null || reference === null ? 0 : Entraineur.borner((1.08 * reference - meilleurTour) / (0.16 * reference), 0, 1));
    }
    // trafic : 4 IA et 4 classiques, un tour, sur le premier circuit de test
    const circuit = this.circuit(tests[0].profil, tests[0].graine);
    const specs = Array.from({ length: 8 }, (_, rang) => (rang % 2 === 0 ? { Classe: VoitureNeuronale, rang, reseau } : { Classe: VoitureF1, rang }));
    const manche = this.creerManche(circuit, specs, { collisions: true, humidite: tests[0].humidite });
    while (manche.temps < Entraineur.DUREE_TEST && manche.suivis.some(s => !s.eliminee && s.stats.tours < 1)) {
      this.pasManche(manche);
      yield;
    }
    const contacts = manche.suivis.filter(s => s.voiture instanceof VoitureNeuronale).reduce((somme, s) => somme + s.stats.contacts, 0);
    const parts = {
      tours: 50 * toursPropres / (tests.length * Entraineur.TOURS_TEST),
      temps: 30 * ratios.reduce((s, r) => s + r, 0) / ratios.length,
      contacts: 20 * Math.max(0, 1 - contacts / Entraineur.CONTACTS_MAX),
    };
    this.note = Math.round(parts.tours + parts.temps + parts.contacts);
    this.detailNote = { ...parts, toursPropres, toursDemandes: tests.length * Entraineur.TOURS_TEST, tempsAuTour: temps, references, nombreContacts: contacts };
    this.pret = this.note >= this.seuilPret;
    if (this.pret && this.arretAuto) this.enCours = false;
    this.evaluation = null;
    return this.note;
  }

  // Temps au tour de référence d'une VoitureF1 classique seule sur ce circuit, à cette humidité :
  // le meilleur de ses TOURS_TEST premiers tours, comme pour le réseau (gardé en cache).
  * tempsReference(circuit, humidite = 0) {
    this.references ??= new Map();
    const cle = `${circuit.profil}#${circuit.graine}#${humidite}`;
    if (this.references.has(cle)) return this.references.get(cle);
    const manche = this.creerManche(circuit, [{ Classe: VoitureF1, rang: 0 }], { humidite });
    const suivi = manche.suivis[0];
    while (suivi.stats.tempsTours.length < Entraineur.TOURS_TEST && manche.temps < Entraineur.DUREE_TEST) {
      this.pasManche(manche);
      yield;
    }
    const reference = suivi.stats.tempsTours.length > 0 ? Math.min(...suivi.stats.tempsTours) : null;
    this.references.set(cle, reference);
    return reference;
  }

  // Évaluation complète, d'un coup (script Node, tests).
  evaluerTout(reseau = this.meilleur?.reseau) {
    const iterateur = this.evaluer(reseau.cloner());
    let r = iterateur.next();
    while (!r.done) r = iterateur.next();
    return r.value;
  }

  // --- Test du modèle (démonstration, sans évolution) -----------------------------------------

  // mode 'seul' : le meilleur réseau seul sur un circuit de test ; 'trafic' : 5 IA et 6 classiques.
  lancerTest(mode = 'seul', reseau = this.meilleur?.reseau ?? this.reseaux[0]) {
    const test = Entraineur.CIRCUITS_TEST[this.generation % Entraineur.CIRCUITS_TEST.length];
    const circuit = this.circuit(test.profil, test.graine);
    const specs = mode === 'seul' ? [{ Classe: VoitureNeuronale, rang: 0, reseau }]
      : Array.from({ length: 11 }, (_, rang) => (rang % 2 === 0 ? { Classe: VoitureNeuronale, rang, reseau } : { Classe: VoitureF1, rang }));
    this.demo = { mode, manche: this.creerManche(circuit, specs, { collisions: mode !== 'seul', humidite: test.humidite }), circuit: test };
    this.enCours = true;
    return this.demo;
  }

  arreterTest() {
    this.demo = null;
  }

  // --- Temps réel -----------------------------------------------------------------------------

  demarrer() {
    this.enCours = true;
  }

  pause() {
    this.enCours = false;
  }

  // Avance de dt secondes réelles × vitesse, en pas fixes, sans dépasser le budget de temps de
  // l'image (horloge injectée). Renvoie le nombre de pas joués.
  avancer(dt) {
    if (!this.enCours) return 0;
    this.reserve = Math.min(Entraineur.RESERVE_MAX, this.reserve + dt * this.vitesse);
    const debut = this.horloge();
    let pas = 0;
    while (this.reserve >= Entraineur.PAS_TEMPS - 1e-12 && this.enCours) {
      if (this.horloge() - debut >= this.budgetMs) {
        // budget dépassé : le reste est abandonné (l'interface passe avant la vitesse)
        this.reserve = 0;
        break;
      }
      if (this.demo !== null) {
        this.pasManche(this.demo.manche);
      } else if (this.evaluation !== null && pas % 2 === 1) {
        // la note avance en même temps que l'entraînement (un pas sur deux)
        this.evaluation.next();
      } else {
        this.pas();
      }
      this.reserve -= Entraineur.PAS_TEMPS;
      pas++;
    }
    this.vitesseEffective = dt > 0 ? pas * Entraineur.PAS_TEMPS / dt : 0;
    return pas;
  }

  // Les générations d'un coup, sans affichage (script Node, tests) : jusqu'à `generations` de plus.
  entrainer(generations, { surGeneration = () => {} } = {}) {
    const fin = this.generation + generations;
    while (this.generation < fin) {
      const avant = this.generation;
      this.pas();
      if (this.generation !== avant) surGeneration(this.historique.at(-1));
      if (this.evaluation !== null) {
        let r = this.evaluation.next();
        while (!r.done) r = this.evaluation.next();
      }
    }
    return this.historique;
  }

  // Ce que l'interface affiche (données pures).
  resume() {
    return {
      generation: this.generation, etape: this.etape, niveau: this.nomNiveau, circuit: this.circuitCourant,
      enVie: this.enVie, population: this.taillePopulation, meilleur: this.meilleur === null ? null : this.meilleur.fitness,
      note: this.note, pret: this.pret, taux: this.taux, amplitude: this.amplitude, vitesse: this.vitesse,
      vitesseEffective: this.vitesseEffective, temps: this.tempsGeneration, enCours: this.enCours, evaluation: this.evaluation !== null,
    };
  }
}
