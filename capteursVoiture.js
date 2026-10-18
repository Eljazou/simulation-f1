// Capteurs d'une voiture pilotée par le réseau de neurones (voir voitureNeuronale.js). Ce n'est
// pas un Vehicle et il ne bouge rien : il MESURE ce qu'un pilote voit depuis sa voiture et rend
// 8 nombres normalisés, les entrées du réseau. Il lit seulement la voiture elle-même (position,
// vitesse, cap, indice sur la piste, écart latéral, adhérence de ses pneus), la géométrie du
// Circuit et la liste des voisines que la course donne à toute voiture (les mêmes que pour la
// séparation). Il ne lit jamais l'état de la course (classement, chronométrage, drapeaux) : pas
// de triche.
//
// Les 8 entrées, dans l'ordre :
//   0 bordGauche   distance au bord GAUCHE de la piste, par un rayon lancé à ANGLE_LATERAL à
//                  gauche du cap ; 0 = sur le bord (ou dehors), 1 = PORTEE_RAYON ou plus ;
//   1 bordDroit    la même chose à droite ;
//   2 devant       distance au bord de la piste droit devant (rayon dans l'axe du cap), sur
//                  PORTEE_RAYON : petite à l'approche d'un virage serré ;
//   3 courbure     la plus forte courbure de la ligne de course dans les PORTEE_COURBURE pixels qui
//                  suivent, rapportée à COURBURE_REF (une épingle) : 0 = ligne droite, 1 = épingle ;
//   4 vitesse      vitesse / vitesse maximale du réglage (parametres.vitesseMax), de 0 à 1 ;
//   5 voisine      distance (centre à centre) de la voiture la plus proche, sur PORTEE_VOISINE :
//                  0 = collée, 1 = personne à portée ;
//   6 adherence    adhérence courante des pneus (type, usure, piste mouillée), de 0 à 1 ;
//   7 ecartLigne   écart latéral à la ligne de course, sur la demi-largeur de la piste, de -1 à 1
//                  (positif : du côté de la normale du circuit).
//
// Lancer de rayon : on avance le long du rayon par pas de PAS_RAYON pixels ; chaque point est
// rattaché au point le plus proche de la ligne centrale, cherché autour de celui du point
// précédent (la recherche suit la piste, elle ne saute pas sur une autre partie du tracé) ; dès que
// l'écart latéral dépasse la demi-largeur de la piste, le bord est entre ce point et le précédent,
// et une dichotomie le situe à PAS_RAYON / 2^DICHOTOMIE près.
class CapteursVoiture {
  static NOMS = ['bordGauche', 'bordDroit', 'devant', 'courbure', 'vitesse', 'voisine', 'adherence', 'ecartLigne'];
  static LIBELLES = ['Bord gauche', 'Bord droit', 'Devant', 'Courbure', 'Vitesse', 'Voisine', 'Adhérence', 'Écart ligne'];
  static PORTEE_RAYON = 300;
  static ANGLE_LATERAL = 0.6;
  static PAS_RAYON = 10;
  static DICHOTOMIE = 4;
  static PORTEE_COURBURE = 260;
  // Courbure d'une épingle (rayon de 60 px) : la référence de l'entrée « courbure ».
  static COURBURE_REF = 1 / 60;
  static PORTEE_VOISINE = 100;
  // Courbure maximale devant chaque point, calculée une fois par circuit.
  static courburesDevant = new WeakMap();

  // Les angles des trois rayons, par rapport au cap : gauche, droite, devant. Dans le repère de
  // l'écran (y vers le bas), un angle négatif tourne à gauche du cap.
  static get ANGLES() {
    return [-CapteursVoiture.ANGLE_LATERAL, CapteursVoiture.ANGLE_LATERAL, 0];
  }

  static borner(x, min = 0, max = 1) {
    return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : min;
  }

  constructor() {
    // dernier relevé (dessin des rayons en debug, page d'entraînement) : extrémités des rayons
    this.rayons = [];
    this.valeurs = new Array(CapteursVoiture.NOMS.length).fill(0);
  }

  // Indice du point de la ligne centrale le plus proche de (x, y), cherché à ±fenetre de i.
  static plusProche(circuit, x, y, i, fenetre) {
    const n = circuit.n;
    const points = circuit.points;
    let meilleur = i;
    let min = Infinity;
    for (let k = -fenetre; k <= fenetre; k++) {
      let j = i + k;
      if (j < 0) j += n;
      else if (j >= n) j -= n;
      const p = points[j];
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < min) {
        min = d;
        meilleur = j;
      }
    }
    return meilleur;
  }

  // Le point (x, y) est-il hors de la piste ? (écart à la ligne centrale au point j)
  static dehors(circuit, x, y, j) {
    const p = circuit.points[j];
    const normale = circuit.normales[j];
    return Math.abs((x - p.x) * normale.x + (y - p.y) * normale.y) > circuit.largeur / 2;
  }

  // Distance, le long du rayon parti de (x, y) dans la direction `angle`, jusqu'au bord de la
  // piste (au plus `portee`). indice = indice de la ligne centrale près du départ.
  static lancerRayon(circuit, x, y, angle, indice, portee = CapteursVoiture.PORTEE_RAYON) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const fenetre = Math.max(2, Math.ceil(CapteursVoiture.PAS_RAYON / circuit.pas) + 1);
    let i = CapteursVoiture.plusProche(circuit, x, y, indice, fenetre);
    if (CapteursVoiture.dehors(circuit, x, y, i)) return 0;
    let avant = 0;
    for (let d = CapteursVoiture.PAS_RAYON; d <= portee + 1e-9; d += CapteursVoiture.PAS_RAYON) {
      const j = CapteursVoiture.plusProche(circuit, x + dx * d, y + dy * d, i, fenetre);
      if (CapteursVoiture.dehors(circuit, x + dx * d, y + dy * d, j)) {
        // le bord est entre `avant` et `d` : dichotomie
        let a = avant;
        let b = d;
        for (let n = 0; n < CapteursVoiture.DICHOTOMIE; n++) {
          const m = (a + b) / 2;
          const k = CapteursVoiture.plusProche(circuit, x + dx * m, y + dy * m, i, fenetre);
          if (CapteursVoiture.dehors(circuit, x + dx * m, y + dy * m, k)) b = m;
          else a = m;
        }
        return (a + b) / 2;
      }
      i = j;
      avant = d;
    }
    return portee;
  }

  // La plus forte courbure (valeur absolue) de la ligne de course dans PORTEE_COURBURE pixels
  // devant le point d'indice `indice` (table calculée une fois par circuit).
  static courbureDevant(circuit, indice) {
    let table = CapteursVoiture.courburesDevant.get(circuit);
    if (!table) {
      const n = circuit.n;
      const fenetre = Math.ceil(CapteursVoiture.PORTEE_COURBURE / circuit.pas);
      table = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let max = 0;
        for (let k = 0; k <= fenetre; k++) max = Math.max(max, Math.abs(circuit.courburesLigne[(i + k) % n]));
        table[i] = max;
      }
      CapteursVoiture.courburesDevant.set(circuit, table);
    }
    return table[indice];
  }

  // Les 8 entrées pour `voiture` (une VoitureF1 : pos, vel, cap, indicePiste, ecartLateral,
  // adherence, parametres, circuit) ; voisins = les véhicules proches donnés par la course.
  mesurer(voiture, voisins = []) {
    const c = voiture.circuit;
    const borner = CapteursVoiture.borner;
    const cap = voiture.cap;
    const portee = CapteursVoiture.PORTEE_RAYON;
    this.rayons = CapteursVoiture.ANGLES.map(a => {
      const angle = cap + a;
      const d = CapteursVoiture.lancerRayon(c, voiture.pos.x, voiture.pos.y, angle, voiture.indicePiste, portee);
      return { angle, distance: d, x: voiture.pos.x + Math.cos(angle) * d, y: voiture.pos.y + Math.sin(angle) * d };
    });
    let proche = Infinity;
    for (const autre of voisins) {
      if (autre === voiture) continue;
      proche = Math.min(proche, Math.hypot(autre.pos.x - voiture.pos.x, autre.pos.y - voiture.pos.y));
    }
    const ecartLigne = voiture.ecartLateral - c.decalagesLigne[voiture.indicePiste];
    const v = this.valeurs;
    v[0] = borner(this.rayons[0].distance / portee);
    v[1] = borner(this.rayons[1].distance / portee);
    v[2] = borner(this.rayons[2].distance / portee);
    v[3] = borner(CapteursVoiture.courbureDevant(c, voiture.indicePiste) / CapteursVoiture.COURBURE_REF);
    v[4] = borner(voiture.vitesse / Math.max(0.1, voiture.parametres.vitesseMax));
    v[5] = proche === Infinity ? 1 : borner(proche / CapteursVoiture.PORTEE_VOISINE);
    v[6] = borner(voiture.adherence);
    v[7] = borner(ecartLigne / (c.largeur / 2), -1, 1);
    return v.slice();
  }
}
