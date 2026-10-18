// Affectation des points d'une forme aux particules (module sans état ni dessin). Venu de la
// scène « Encre vivante » du dossier d'origine, gardé ici pour l'écran REJOUER (ecranFin.js) :
// chaque particule reçoit le point libre le plus proche d'elle, et un point n'est jamais donné
// deux fois. C'est ce qui rend la formation du mot fluide.
const Affectation = (() => {
  // positions = [{ x, y }] des particules ; points = [{ x, y }] de la forme. Renvoie, pour chaque
  // position, l'indice du point choisi, ou -1 s'il n'y a plus de point libre.
  function auPlusProche(positions, points) {
    const libre = new Array(points.length).fill(true);
    let restants = points.length;

    return positions.map(position => {
      if (restants === 0) return -1;
      let choisi = -1;
      let plusPetitCarre = Infinity;
      for (let k = 0; k < points.length; k++) {
        if (!libre[k]) continue;
        const dx = points[k].x - position.x;
        const dy = points[k].y - position.y;
        const carre = dx * dx + dy * dy;
        if (carre < plusPetitCarre) {
          plusPetitCarre = carre;
          choisi = k;
        }
      }
      libre[choisi] = false;
      restants--;
      return choisi;
    });
  }

  return { auPlusProche };
})();
