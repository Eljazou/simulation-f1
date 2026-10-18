// Prédiction de victoire du scénario « Circuit Formule 1 » : une probabilité par voiture, mise à
// jour en continu. Une aide de lecture (pas un Vehicle) : elle lit le chronométrage et les voitures.
//
// Formule (documentée et testée) :
//   L      = tours restants au leader ;
//   ecart  = écart au leader (s) ; une voiture doublée : tours de retard × tour de référence ;
//   rythme = (meilleur tour personnel − meilleur tour de la course) (s/tour), 0 tant qu'il manque ;
//   stand  = PERTE_STAND si la voiture devra encore s'arrêter (pneus sous le seuil + MARGE_PNEUS, et
//            plus d'un tour à faire), + la pénalité de stand qu'elle doit purger ;
//   place  = POIDS_PLACE × (rang en piste − 1)      (doubler coûte : la position en piste compte) ;
//   projeté = ecart + rythme × L + stand + place    (le retard qu'elle aura à l'arrivée) ;
//   T      = T_BASE + T_RACINE × √(L + 1)          (température du softmax : plus il reste de
//                                                     tours, plus c'est incertain) ;
//   score  = exp(−projeté / T)  ;  P = score / Σ scores  (softmax, sur les voitures en course).
// Avant le départ : projeté = rang sur la grille × (ECART_GRILLE + POIDS_PLACE), L = tours de la
// course. Après l'arrivée du vainqueur : 1 pour lui, 0 pour les autres. Abandon ou hors course : 0.
// Le terme de place et la température en racine évitent l'ancien défaut (σ croissait comme L : en
// début de course, toutes les voitures recevaient à peu près 1 / n, « 9 % partout »).
//
// Podium et top k (onglet Prédiction) : modèle de Plackett-Luce sur les mêmes scores, estimé par
// TIRAGES tirages à graine fixe (probabilitesTop) : reproductible, sans aléa de p5.
class Prediction {
  static PERTE_STAND = 6;
  static MARGE_PNEUS = 0.05;
  static T_BASE = 0.5;
  static T_RACINE = 0.5;
  static POIDS_PLACE = 0.3;
  static ECART_GRILLE = 0.4;
  static TIRAGES = 2000;
  static GRAINE = 77;
  static AFFICHES = 5;
  static LARGEUR = 190;

  // Température du softmax pour L tours restants.
  static temperature(restants) {
    return Prediction.T_BASE + Prediction.T_RACINE * Math.sqrt(Math.max(0, restants) + 1);
  }

  // Map voiture -> probabilité (somme 1 sur les voitures en course).
  static probabilites(course) {
    const chrono = course.chronometrage;
    const ordre = course.classement();
    const resultat = new Map(course.voitures.map(v => [v, 0]));
    const enLice = ordre.filter(v => !v.horsCourse && !chrono.abandon(v));
    if (enLice.length === 0) return resultat;
    if (chrono.vainqueur) {
      resultat.set(ordre[0], 1);
      return resultat;
    }
    const projetes = new Map();
    let sigma = Prediction.temperature(course.parametres.nombreTours);
    if (!chrono.demarre) {
      course.voitures.forEach((v, rang) => { if (enLice.includes(v)) projetes.set(v, rang * (Prediction.ECART_GRILLE + Prediction.POIDS_PLACE)); });
    } else {
      const leader = enLice[0];
      const restants = Math.max(0, course.parametres.nombreTours - Math.max(0, leader.tour));
      const meilleurs = enLice.map(v => chrono.meilleurPersonnel(v)?.temps).filter(t => t !== undefined);
      const reference = meilleurs.length > 0 ? Math.min(...meilleurs) : null;
      const ecarts = chrono.ecarts('leader');
      enLice.forEach((v, place) => {
        const e = ecarts.get(v) ?? { valeur: 0, tours: 0 };
        const ecart = e.valeur ?? (e.tours > 0 && reference !== null ? e.tours * reference : 0);
        const perso = chrono.meilleurPersonnel(v)?.temps;
        const rythme = reference !== null && perso !== undefined ? perso - reference : 0;
        let stand = v.penaliteStand ?? 0;
        if (restants > 1 && v.pneus < v.parametres.seuilStand + Prediction.MARGE_PNEUS && !v.auStand) stand += Prediction.PERTE_STAND;
        projetes.set(v, ecart + rythme * restants + stand + Prediction.POIDS_PLACE * place);
      });
      sigma = Prediction.temperature(restants);
    }
    const min = Math.min(...projetes.values());
    let somme = 0;
    projetes.forEach((p, v) => {
      const score = Math.exp(-(p - min) / sigma);
      resultat.set(v, score);
      somme += score;
    });
    resultat.forEach((s, v) => resultat.set(v, somme > 0 ? s / somme : 0));
    return resultat;
  }

  // Probabilité, pour chaque voiture, de finir dans les k premiers : tirages de Plackett-Luce (on
  // tire le 1er selon les probabilités, puis le 2e parmi les autres, etc.), graine fixe.
  static probabilitesTop(course, k, tirages = Prediction.TIRAGES, graine = Prediction.GRAINE) {
    const p = Prediction.probabilites(course);
    const resultat = new Map(course.voitures.map(v => [v, 0]));
    const candidats = [...p.entries()].filter(([, x]) => x > 0);
    if (candidats.length === 0) return resultat;
    if (k >= candidats.length) {
      candidats.forEach(([v]) => resultat.set(v, 1));
      return resultat;
    }
    if (k === 1) return p;
    const alea = Circuit.generateur(graine);
    for (let n = 0; n < tirages; n++) {
      const restants = candidats.slice();
      let somme = restants.reduce((s, [, x]) => s + x, 0);
      for (let place = 0; place < k; place++) {
        let r = alea() * somme;
        let i = 0;
        while (i < restants.length - 1 && r >= restants[i][1]) r -= restants[i++][1];
        const [v, x] = restants.splice(i, 1)[0];
        resultat.set(v, resultat.get(v) + 1);
        somme -= x;
      }
    }
    resultat.forEach((c, v) => resultat.set(v, c / tirages));
    return resultat;
  }

  // Les AFFICHES premiers, en barres, en haut à droite de la zone (sous la mini-carte).
  show(course, x, y) {
    const probas = [...Prediction.probabilites(course).entries()].filter(([, p]) => p > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, Prediction.AFFICHES);
    const ligne = 16;
    const hauteur = 24 + ligne * probas.length;
    push();
    noStroke();
    fill(10, 12, 18, 215);
    rect(x, y, Prediction.LARGEUR, hauteur, 6);
    fill(240);
    textSize(11);
    textAlign(LEFT, CENTER);
    text('PRÉDICTION DE VICTOIRE', x + 8, y + 11);
    probas.forEach(([v, p], k) => {
      const yy = y + 22 + k * ligne;
      fill(...v.ecurie.couleurs[0]);
      rect(x + 52, yy + 3, (Prediction.LARGEUR - 96) * p, ligne - 6, 2);
      fill(230);
      textSize(10);
      textAlign(LEFT, CENTER);
      text(`${v.pilote.code}`, x + 8, yy + ligne / 2);
      textAlign(RIGHT, CENTER);
      text(`${Math.round(p * 100)} %`, x + Prediction.LARGEUR - 8, yy + ligne / 2);
    });
    pop();
    return hauteur;
  }
}
