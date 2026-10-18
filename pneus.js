// Types de pneus (bloc pluie). Un module de données, pas une entité. Pour chaque type : la
// couleur du flanc dessinée sur la voiture, l'adhérence sur piste sèche et sur piste détrempée,
// et l'usure (multiplicateur de l'usure réglée dans le panneau), au sec et au mouillé.
// MEDIUM au sec vaut exactement 1 partout : c'est la référence des réglages du panneau.
const Pneus = (() => {
  const TYPES = {
    TENDRE: { libelle: 'Tendre', couleur: [230, 40, 40], sec: 1.05, mouille: 0.5, usureSec: 1.6, usureMouille: 1.2, categorie: 'slick' },
    MEDIUM: { libelle: 'Medium', couleur: [250, 210, 40], sec: 1, mouille: 0.5, usureSec: 1, usureMouille: 0.8, categorie: 'slick' },
    DUR: { libelle: 'Dur', couleur: [240, 240, 240], sec: 0.96, mouille: 0.48, usureSec: 0.6, usureMouille: 0.5, categorie: 'slick' },
    INTER: { libelle: 'Intermédiaire', couleur: [60, 190, 80], sec: 0.86, mouille: 0.8, usureSec: 2.2, usureMouille: 0.8, categorie: 'inter' },
    PLUIE: { libelle: 'Pluie', couleur: [50, 120, 240], sec: 0.78, mouille: 0.92, usureSec: 3, usureMouille: 0.7, categorie: 'pluie' },
  };
  const NOMS = Object.keys(TYPES);
  // Bornes de l'adhérence d'une voiture.
  const ADHERENCE_MIN = 0.45;
  const ADHERENCE_MAX = 1.05;
  // Seuils d'humidité de la piste pour choisir les pneus : au-dessus de INTER, des
  // intermédiaires ; au-dessus de PLUIE, des pneus pluie.
  const SEUIL_INTER = 0.25;
  const SEUIL_PLUIE = 0.6;

  function type(nom) {
    if (!Object.hasOwn(TYPES, nom)) throw new RangeError(`Type de pneus inconnu : ${nom}.`);
    return TYPES[nom];
  }

  // Adhérence d'un pneu selon l'humidité de la piste (0 = sèche, 1 = détrempée). Les
  // intermédiaires sont à leur meilleur sur piste humide, pas détrempée.
  function adherence(nom, humidite = 0) {
    const t = type(nom);
    const h = Math.max(0, Math.min(1, humidite));
    let a = t.sec + (t.mouille - t.sec) * h;
    if (nom === 'INTER') a += 0.12 * (1 - Math.abs(2 * h - 1));
    return Math.max(ADHERENCE_MIN, Math.min(ADHERENCE_MAX, a));
  }

  // Multiplicateur d'usure selon l'humidité : un pneu pluie sur piste sèche fond.
  function usure(nom, humidite = 0) {
    const t = type(nom);
    const h = Math.max(0, Math.min(1, humidite));
    return t.usureSec + (t.usureMouille - t.usureSec) * h;
  }

  // Le pneu adapté à la piste : pluie, intermédiaire, ou slick (plus dur s'il reste beaucoup de tours).
  function adapte(humidite, toursRestants = 5) {
    if (humidite >= SEUIL_PLUIE) return 'PLUIE';
    if (humidite >= SEUIL_INTER) return 'INTER';
    if (toursRestants > 8) return 'DUR';
    return toursRestants <= 3 ? 'TENDRE' : 'MEDIUM';
  }

  // Deux pneus de la même famille (slick / inter / pluie) : pas besoin de changer pour la météo.
  function memeCategorie(a, b) {
    return type(a).categorie === type(b).categorie;
  }

  return { TYPES, NOMS, ADHERENCE_MIN, ADHERENCE_MAX, SEUIL_INTER, SEUIL_PLUIE, type, adherence, usure, adapte, memeCategorie };
})();
