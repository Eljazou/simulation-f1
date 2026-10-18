// Chronométrage de la course, comme en Formule 1. Il ne bouge pas : ce n'est pas un Vehicle. Course
// le possède, le démarre à l'extinction des feux et lui donne le temps écoulé à chaque pas.
//
// Temps de course : `horloge` part de 0 à l'extinction des feux et avance de dt (temps simulé :
// la vitesse de simulation multiplie le nombre de pas, la pause n'en fait aucun). `tempsCourse`,
// celui qu'on affiche, se fige au temps du vainqueur ; l'horloge, elle, continue pour chronométrer
// l'arrivée des autres.
//
// Points de chronométrage : le circuit en place N sur la ligne centrale (point 0 = ligne
// d'arrivée). Chaque voiture a une distance parcourue CONTINUE (abscisse « déroulée » d'un tour à
// l'autre) et un index cumulé k = tour × N + point : le dernier point franchi. Le passage d'un
// point est enregistré une seule fois, au temps interpolé entre les deux pas qui l'encadrent ; une
// voiture qui recule ne franchit rien, et ne refranchit pas un point déjà compté.
//
// Classement en direct : index cumulé décroissant, puis temps de passage à ce point croissant.
// Écart au leader (ou à la voiture devant) : différence des temps de passage au dernier point
// commun. Il ne change donc qu'au passage d'un point, comme sur les écrans TV.
//
// Arrivée : le premier à boucler les tours prévus reçoit le damier ; chaque autre voiture
// termine à son prochain passage de la ligne (doublées comprises, avec leurs tours faits). Le
// résultat est alors figé : plus rien n'est enregistré pour elle. Les pénalités s'ajoutent au
// temps final, après l'arrivée.
class Chronometrage {
  // circuit = le Circuit (points de chronométrage et secteurs) ; voitures = la grille, dans
  // l'ordre de départ (il départage les voitures qui n'ont encore franchi aucun point).
  constructor(circuit, voitures) {
    this.circuit = circuit;
    this.N = circuit.pointsChrono.length;
    this.voitures = voitures.slice();
    this.demarre = false;
    this.horloge = 0;
    this.vainqueur = null;
    this.tempsVainqueur = null;
    this.meilleurTour = null;
    this.meilleursSecteurs = [null, null, null];
    this.etats = new Map(this.voitures.map(voiture => [voiture, Chronometrage.etatInitial()]));
  }

  static etatInitial() {
    return {
      distance: 0,
      indice: -1,
      k: -1,
      passages: [],
      tours: [],
      tour: { debut: 0, secteurs: [], dernierSecteur: 0, entree: false, sortie: false, stand: 0 },
      meilleur: null,
      meilleursSecteurs: [null, null, null],
      auStand: false,
      debutStand: 0,
      arrivee: null,
      abandon: false,
    };
  }

  // Le temps affiché : figé au temps du vainqueur.
  get tempsCourse() {
    return this.tempsVainqueur ?? this.horloge;
  }

  // Distance de la ligne d'arrivée au point d'index cumulé k.
  distancePoint(k) {
    return Math.floor(k / this.N) * this.circuit.longueur + this.circuit.pointsChrono[k % this.N];
  }

  // Extinction des feux : l'horloge part de 0 ; la distance de chaque voiture part de sa place
  // (sur la grille, derrière la ligne : une distance négative).
  demarrer() {
    if (this.demarre) return;
    this.demarre = true;
    this.horloge = 0;
    const L = this.circuit.longueur;
    this.etats.forEach((etat, voiture) => {
      const a = this.circuit.abscisse(voiture.pos.x, voiture.pos.y);
      etat.distance = a > L / 2 ? a - L : a;
      etat.indice = Math.floor(a / this.circuit.pas);
      etat.auStand = Boolean(voiture.auStand);
    });
  }

  // Un pas de temps : l'horloge avance de dt, puis les passages de points sont relevés.
  // nombreTours = tours de la course. Renvoie les événements du pas (meilleur tour, damier,
  // arrivée), dans l'ordre chronologique.
  update(dt, nombreTours) {
    if (!this.demarre) return [];
    const avant = this.horloge;
    this.horloge += dt;
    const L = this.circuit.longueur;
    const franchissements = [];
    this.etats.forEach((etat, voiture) => {
      if (etat.arrivee !== null || etat.abandon) return;
      // distance continue : l'abscisse, « déroulée » d'un tour à l'autre
      const fenetre = voiture.vel ? this.circuit.fenetrePour(voiture.vel.mag()) : 20;
      const a = this.circuit.abscisse(voiture.pos.x, voiture.pos.y, etat.indice, fenetre);
      etat.indice = Math.floor(a / this.circuit.pas);
      const base = ((etat.distance % L) + L) % L;
      let delta = a - base;
      if (delta > L / 2) delta -= L;
      if (delta < -L / 2) delta += L;
      const precedente = etat.distance;
      etat.distance += delta;
      // points franchis (en avant seulement : jamais deux fois le même), temps interpolé
      let k = etat.k;
      while (this.distancePoint(k + 1) <= etat.distance) {
        k++;
        const part = (this.distancePoint(k) - precedente) / (etat.distance - precedente);
        franchissements.push({ voiture, etat, k, temps: avant + Math.max(0, Math.min(1, part)) * dt });
      }
      // stand : temps passé dans la voie, tours d'entrée (IN) et de sortie (OUT)
      const auStand = Boolean(voiture.auStand);
      if (auStand && !etat.auStand) {
        etat.tour.entree = true;
        etat.debutStand = avant;
      } else if (!auStand && etat.auStand) {
        etat.tour.sortie = true;
        etat.tour.stand += this.horloge - etat.debutStand;
      }
      etat.auStand = auStand;
    });
    // dans l'ordre du temps : le damier passe avant les voitures qui franchissent la ligne juste après
    franchissements.sort((a, b) => a.temps - b.temps);
    const evenements = [];
    franchissements.forEach(f => this.franchir(f, nombreTours, evenements));
    return evenements;
  }

  // Un point franchi par une voiture.
  franchir({ voiture, etat, k, temps }, nombreTours, evenements) {
    if (etat.arrivee !== null) return;
    const point = k % this.N;
    // après le damier, le prochain passage de la ligne est l'arrivée de la voiture
    if (this.vainqueur !== null && point === 0 && temps >= this.tempsVainqueur) {
      this.enregistrer(etat, k, temps, evenements, voiture);
      this.arriver(voiture, etat, k, temps, evenements);
      return;
    }
    this.enregistrer(etat, k, temps, evenements, voiture);
    if (this.vainqueur === null && k >= nombreTours * this.N && point === 0) {
      this.vainqueur = voiture;
      this.tempsVainqueur = temps;
      evenements.push({ type: 'damier', voiture, temps });
      this.arriver(voiture, etat, k, temps, evenements);
    }
  }

  // Le passage est retenu ; aux limites de secteur et sur la ligne : temps de secteur et de tour.
  enregistrer(etat, k, temps, evenements, voiture) {
    etat.k = k;
    etat.passages[k] = temps;
    const point = k % this.N;
    const secteur = this.circuit.secteursChrono.indexOf(point);
    // le point 0 du premier passage (juste après le départ) n'ouvre rien : le tour 1 part de la grille
    if (secteur < 0 || k === 0) return;
    const tour = etat.tour;
    const fini = secteur === 0 ? 2 : secteur - 1;
    const tempsSecteur = temps - (fini === 0 ? tour.debut : tour.dernierSecteur);
    tour.secteurs[fini] = tempsSecteur;
    tour.dernierSecteur = temps;
    this.retenirSecteur(voiture, etat, fini, tempsSecteur);
    if (secteur !== 0) return;
    const numero = k / this.N;
    const fiche = {
      numero,
      temps: temps - tour.debut,
      secteurs: tour.secteurs.slice(),
      stand: tour.entree && tour.sortie ? 'IN/OUT' : tour.entree ? 'IN' : tour.sortie ? 'OUT' : null,
      tempsStand: tour.stand,
    };
    etat.tours.push(fiche);
    if (etat.meilleur === null || fiche.temps < etat.meilleur.temps) etat.meilleur = fiche;
    if (this.meilleurTour === null || fiche.temps < this.meilleurTour.temps) {
      this.meilleurTour = { voiture, numero, temps: fiche.temps, fiche };
      evenements.push({ type: 'meilleurTour', voiture, temps: fiche.temps });
    }
    etat.tour = { debut: temps, secteurs: [], dernierSecteur: temps, entree: false, sortie: false, stand: 0 };
  }

  retenirSecteur(voiture, etat, secteur, temps) {
    if (etat.meilleursSecteurs[secteur] === null || temps < etat.meilleursSecteurs[secteur]) etat.meilleursSecteurs[secteur] = temps;
    const meilleur = this.meilleursSecteurs[secteur];
    if (meilleur === null || temps < meilleur.temps) this.meilleursSecteurs[secteur] = { voiture, temps };
  }

  // Arrivée : enregistrée une seule fois, figée ; l'écart au vainqueur est calculé ici, une fois.
  arriver(voiture, etat, k, temps, evenements) {
    etat.arrivee = { temps, tours: Math.floor(k / this.N), ecart: temps - this.tempsVainqueur, penalite: 0 };
    evenements.push({ type: 'arrivee', voiture, temps });
  }

  // Abandon (DNF) : classé à la fin, avec les tours faits.
  abandonner(voiture) {
    const etat = this.etats.get(voiture);
    if (etat && etat.arrivee === null) etat.abandon = true;
  }

  // Pénalité de temps, ajoutée au temps final après l'arrivée (refusée avant).
  penaliser(voiture, secondes) {
    const etat = this.etats.get(voiture);
    if (!etat || etat.arrivee === null || !(secondes > 0)) return false;
    etat.arrivee.penalite += secondes;
    return true;
  }

  // --- Lecture ------------------------------------------------------------------------------------

  etat(voiture) {
    return this.etats.get(voiture);
  }

  arrivee(voiture) {
    return this.etats.get(voiture)?.arrivee ?? null;
  }

  abandon(voiture) {
    return this.etats.get(voiture)?.abandon ?? false;
  }

  // Temps final : temps d'arrivée + pénalités.
  tempsFinal(voiture) {
    const a = this.arrivee(voiture);
    return a === null ? null : a.temps + a.penalite;
  }

  // Ordre : abandons à la fin ; sinon index cumulé décroissant, puis temps de passage à ce point
  // croissant (pénalités comprises pour une voiture arrivée) ; sans passage : ordre de la grille.
  // Le même ordre donne le classement final : sur le tour du leader par temps d'arrivée, puis
  // les doublées par tours faits puis temps, puis les abandons.
  classement() {
    const cle = voiture => {
      const etat = this.etats.get(voiture);
      const temps = etat.arrivee !== null ? this.tempsFinal(voiture) : etat.passages[etat.k] ?? 0;
      return { abandon: etat.abandon, k: etat.k, temps, grille: this.voitures.indexOf(voiture) };
    };
    return this.voitures.map(voiture => [voiture, cle(voiture)])
      .sort(([, a], [, b]) => (a.abandon - b.abandon) || (b.k - a.k) || (a.temps - b.temps) || (a.grille - b.grille))
      .map(([voiture]) => voiture);
  }

  // Écarts de chaque voiture : Map voiture -> { texte, valeur (s, ou null), tours (de retard) }.
  // mode = 'leader' (écart au leader) ou 'intervalle' (à la voiture devant).
  // En course, au dernier point commun ; les écarts au leader ne décroissent jamais d'un rang au
  // suivant (hors doublés). Après l'arrivée : temps final du vainqueur, puis écarts figés.
  ecarts(mode = 'leader') {
    const ordre = this.classement();
    const resultat = new Map();
    const leader = ordre[0];
    const etatLeader = this.etats.get(leader);
    let plancher = 0;
    ordre.forEach((voiture, rang) => {
      const etat = this.etats.get(voiture);
      const devant = rang > 0 ? ordre[rang - 1] : null;
      if (etat.abandon) {
        resultat.set(voiture, { texte: 'DNF', valeur: null, tours: 0 });
      } else if (etat.arrivee !== null && this.vainqueur !== null) {
        const final = this.ecartFinal(voiture, ordre, mode);
        // les voitures encore en piste derrière ne peuvent pas être plus proches du vainqueur
        if (mode === 'leader' && final.tours === 0) plancher = Math.max(plancher, final.valeur);
        resultat.set(voiture, final);
      } else if (rang === 0) {
        resultat.set(voiture, { texte: 'Leader', valeur: 0, tours: 0 });
      } else {
        const etatReference = mode === 'intervalle' ? this.etats.get(devant) : etatLeader;
        const retardLeader = Math.floor((etatLeader.k - etat.k) / this.N);
        const retard = Math.floor((etatReference.k - etat.k) / this.N);
        if (etat.k < 0) {
          resultat.set(voiture, { texte: '', valeur: null, tours: 0 });
        } else if (retard >= 1) {
          resultat.set(voiture, { texte: Chronometrage.texteTours(retard), valeur: null, tours: retard });
        } else {
          const tReference = etatReference.passages[etat.k];
          let valeur = tReference === undefined ? 0 : Math.max(0, etat.passages[etat.k] - tReference);
          // écart au leader : jamais plus petit que celui de la voiture devant (hors doublés)
          if (mode === 'leader' && retardLeader < 1) {
            valeur = Math.max(valeur, plancher);
            plancher = valeur;
          }
          resultat.set(voiture, { texte: `+${valeur.toFixed(1)}`, valeur, tours: 0 });
        }
      }
    });
    return resultat;
  }

  // Après l'arrivée : P1 = son temps final ; les autres = écart figé (+ pénalités) ; les doublées
  // en tours.
  ecartFinal(voiture, ordre, mode) {
    const arrives = ordre.filter(v => this.arrivee(v) !== null);
    const premier = arrives[0];
    const a = this.arrivee(voiture);
    const penalite = a.penalite > 0 ? ` (+${a.penalite} s)` : '';
    if (voiture === premier) return { texte: Chronometrage.formater(this.tempsFinal(voiture)) + penalite, valeur: 0, tours: 0 };
    const index = arrives.indexOf(voiture);
    const reference = mode === 'intervalle' ? arrives[index - 1] : premier;
    const r = this.arrivee(reference);
    const retard = r.tours - a.tours;
    if (retard >= 1) return { texte: Chronometrage.texteTours(retard) + penalite, valeur: null, tours: retard };
    // écarts figés à l'arrivée (temps - temps du vainqueur), corrigés des pénalités
    const valeur = (a.ecart + a.penalite) - (r.ecart + r.penalite);
    return { texte: `+${valeur.toFixed(3)}${penalite}`, valeur, tours: 0 };
  }

  static texteTours(n) {
    return `+${n} ${n > 1 ? 'TOURS' : 'TOUR'}`;
  }

  // Tours bouclés par une voiture (fiches : numero, temps, secteurs, stand, tempsStand).
  tours(voiture) {
    return this.etats.get(voiture)?.tours ?? [];
  }

  dernierTour(voiture) {
    return this.tours(voiture).at(-1) ?? null;
  }

  meilleurPersonnel(voiture) {
    return this.etats.get(voiture)?.meilleur ?? null;
  }

  // Temps du tour en cours (0 avant le départ).
  tempsTourEnCours(voiture) {
    const etat = this.etats.get(voiture);
    if (!this.demarre || !etat) return 0;
    const fin = etat.arrivee !== null ? etat.arrivee.temps : this.horloge;
    return etat.arrivee !== null ? 0 : fin - etat.tour.debut;
  }

  // Couleur d'un tour : 'violet' (meilleur tour de la course), 'vert' (meilleur personnel), 'jaune'.
  couleurTour(voiture, fiche) {
    if (fiche === null) return null;
    if (this.meilleurTour !== null && this.meilleurTour.fiche === fiche) return 'violet';
    if (this.meilleurPersonnel(voiture) === fiche) return 'vert';
    return 'jaune';
  }

  // Même règle pour un temps de secteur (0, 1, 2).
  couleurSecteur(voiture, secteur, temps) {
    if (temps === undefined || temps === null) return null;
    const meilleur = this.meilleursSecteurs[secteur];
    if (meilleur !== null && meilleur.voiture === voiture && meilleur.temps === temps) return 'violet';
    if (this.etats.get(voiture)?.meilleursSecteurs[secteur] === temps) return 'vert';
    return 'jaune';
  }

  // « m:ss.mmm », ou « h:mm:ss.mmm » au-delà d'une heure (millièmes arrondis).
  static formater(secondes) {
    const milliemes = Math.round(Math.max(0, secondes) * 1000);
    const heures = Math.floor(milliemes / 3600000);
    const minutes = Math.floor(milliemes / 60000) % 60;
    const s = Math.floor(milliemes / 1000) % 60;
    const ms = String(milliemes % 1000).padStart(3, '0');
    const ss = String(s).padStart(2, '0');
    return heures > 0 ? `${heures}:${String(minutes).padStart(2, '0')}:${ss}.${ms}` : `${minutes}:${ss}.${ms}`;
  }
}
