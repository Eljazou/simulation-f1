// Stratégie des arrêts au stand (IA de course avancée). Un module de décision, sans état et sans
// force : Course lui demande, pour une voiture, s'il faut rentrer maintenant et avec quels pneus.
// Raisons, dans l'ordre :
//   'meteo'        les pneus ne sont plus de la bonne famille (slick, inter, pluie) depuis plus
//                  longtemps que le délai de réaction du pilote ;
//   'usure'        pneus sous le seuil du panneau (corrigé par la gestion des pneus du pilote) ;
//   'safety car'   arrêt « gratuit » : la course est neutralisée et les pneus sont déjà entamés ;
//   'undercut'     pneus entamés, la voiture de devant est proche (moins de ECART_UNDERCUT s) et
//                  celle de derrière loin (plus de ECART_LIBRE s) : on rentre pour la doubler ;
// Arrêts décalés : si le coéquipier est déjà au stand (ou va y entrer), on attend, sauf pneus
// vraiment morts.
const Strategie = (() => {
  // Écarts en secondes, et marges de pneus pour les raisons opportunistes.
  const ECART_UNDERCUT = 1.5;
  const ECART_LIBRE = 3;
  const MARGE_UNDERCUT = 0.15;
  const MARGE_SAFETY_CAR = 0.3;
  // En dessous de cette part du seuil, on rentre même si le coéquipier est au stand.
  const PART_URGENCE = 0.5;
  // Pas d'arrêt pour l'usure dans les derniers tours.
  const TOURS_SANS_ARRET = 1;

  // contexte : { secondesDevant, secondesDerriere (écarts en secondes, Infinity si personne),
  //   safetyCar (vrai si neutralisée), coequipierAuStand, humidite, toursRestants, attenteMeteo
  //   (secondes passées avec des pneus inadaptés), seuil, gestionPneus (multiplicateur du pilote),
  //   reaction (délai de réaction du pilote, en secondes) }.
  // Renvoie { rentrer, raison, pneus }.
  function decider(voiture, contexte) {
    const { secondesDevant = Infinity, secondesDerriere = Infinity, safetyCar = false, coequipierAuStand = false,
      humidite = 0, toursRestants = 5, attenteMeteo = 0, seuil = 0.35, gestionPneus = 1, reaction = 0 } = contexte;
    const pneus = Pneus.adapte(humidite, toursRestants);
    const non = { rentrer: false, raison: null, pneus };
    if (voiture.arrivee || voiture.auStand || voiture.demandeStand || toursRestants < TOURS_SANS_ARRET) return non;

    if (!Pneus.memeCategorie(voiture.typePneus, pneus) && attenteMeteo >= reaction) {
      return { rentrer: true, raison: 'meteo', pneus };
    }
    // un pilote qui use ses pneus plus vite s'arrête un peu plus tôt
    const seuilPilote = seuil * Math.sqrt(gestionPneus);
    const urgence = voiture.pneus < seuilPilote * PART_URGENCE;
    if (coequipierAuStand && !urgence) return non;
    if (voiture.pneus < seuilPilote) return { rentrer: true, raison: 'usure', pneus };
    if (toursRestants <= TOURS_SANS_ARRET) return non;
    if (safetyCar && voiture.pneus < seuilPilote + MARGE_SAFETY_CAR) return { rentrer: true, raison: 'safety car', pneus };
    if (voiture.pneus < seuilPilote + MARGE_UNDERCUT && secondesDevant < ECART_UNDERCUT && secondesDerriere > ECART_LIBRE) {
      return { rentrer: true, raison: 'undercut', pneus };
    }
    return non;
  }

  return { ECART_UNDERCUT, ECART_LIBRE, MARGE_UNDERCUT, MARGE_SAFETY_CAR, decider };
})();
