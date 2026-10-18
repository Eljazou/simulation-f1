// Personnalités des pilotes (IA de course avancée). Un module de données, pas une entité : chaque
// profil donne des multiplicateurs appliqués aux réglages du panneau.
//   wander      poids du wander (une conduite plus ou moins « vivante ») ;
//   depassement envie de dépasser (plus grand : il tente avec une moindre différence de vitesse) ;
//   securite    distance de sécurité (plus grand : il laisse plus de place) ;
//   freinage    rayon de la zone de freinage d'arrive (plus grand : il freine plus tôt) ;
//   pneus       usure des pneus (plus grand : il les use plus vite) ;
//   erreurs     probabilité d'erreur en virage ;
//   reaction    secondes avant de réagir à un changement de météo (pneus inadaptés) ;
//   toucher     finesse de pilotage : multiplie l'adhérence que le pilote tire de ses pneus
//               (glisse réaliste) ;
//   fatigue     vitesse à laquelle le pilote fatigue au fil des tours (wander et dispersion de
//               la ligne) ; le régulier fatigue le moins ;
//   obeissance  probabilité d'obéir à un ordre d'équipe (laisser passer son coéquipier).
const Personnalites = (() => {
  const PROFILS = {
    agressif: { libelle: 'Agressif', wander: 1, depassement: 2.4, securite: 0.9, freinage: 0.88, pneus: 1.25, erreurs: 1.3, reaction: 1.5,
      toucher: 0.98, fatigue: 1.1, obeissance: 0.5 },
    prudent: { libelle: 'Prudent', wander: 0.8, depassement: 0.2, securite: 1.25, freinage: 1.15, pneus: 0.85, erreurs: 0.6, reaction: 5,
      toucher: 1, fatigue: 1, obeissance: 1 },
    regulier: { libelle: 'Régulier', wander: 0.5, depassement: 1, securite: 1, freinage: 1, pneus: 0.9, erreurs: 0.4, reaction: 3,
      toucher: 1.02, fatigue: 0.4, obeissance: 0.95 },
    imprevisible: { libelle: 'Imprévisible', wander: 1.8, depassement: 1.3, securite: 1, freinage: 1, pneus: 1.1, erreurs: 3, reaction: 2,
      toucher: 0.96, fatigue: 1.5, obeissance: 0.7 },
  };
  const NOMS = Object.keys(PROFILS);
  // Profil neutre : tous les multiplicateurs à 1 (IA avancée désactivée).
  const NEUTRE = { libelle: 'Neutre', wander: 1, depassement: 1, securite: 1, freinage: 1, pneus: 1, erreurs: 1, reaction: 0,
    toucher: 1, fatigue: 1, obeissance: 1 };

  // Profil d'une nouvelle voiture : celui du panneau, ou tiré au hasard ('aleatoire').
  function choisir(reglage, alea) {
    if (reglage !== 'aleatoire') {
      if (!Object.hasOwn(PROFILS, reglage)) throw new RangeError(`Personnalité inconnue : ${reglage}.`);
      return reglage;
    }
    return NOMS[Math.min(NOMS.length - 1, Math.floor(alea() * NOMS.length))];
  }

  return { PROFILS, NOMS, NEUTRE, choisir };
})();
