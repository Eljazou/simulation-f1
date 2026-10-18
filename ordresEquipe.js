// Ordres d'équipe (case du panneau) : un module de DÉCISION, sans état propre ni force. Course
// lui demande, à chaque pas, s'il faut dire à un pilote de laisser passer son coéquipier.
//
// Règle : deux voitures de la même écurie se suivent sur la piste (la voiture qui précède celle
// de derrière est sa coéquipière), à moins de ECART_MAX secondes ; celle de derrière
// est plus rapide (meilleur rythme : dernier tour plus rapide d'au moins AVANCE_RYTHME s, ou, avant
// le premier tour, une voiture plus rapide par nature). L'ordre est donné à celle de devant. Elle
// peut refuser selon son obéissance (profil du pilote). Une paire ne reçoit pas de nouvel ordre
// pendant ATTENTE secondes.
const OrdresEquipe = (() => {
  const ECART_MAX = 1.5;
  const AVANCE_RYTHME = 0.25;
  const AVANCE_NATURE = 0.02;
  const ATTENTE = 30;

  // Rythme d'une voiture : temps de son dernier tour (secondes), ou null avant le premier tour.
  function rythme(course, voiture) {
    const fiche = course.chronometrage.dernierTour(voiture);
    return fiche === null || fiche.stand !== null ? null : fiche.temps;
  }

  // La voiture de derrière est-elle plus rapide que celle de devant ?
  function plusRapide(course, derriere, devant) {
    const a = rythme(course, derriere);
    const b = rythme(course, devant);
    if (a !== null && b !== null) return a < b - AVANCE_RYTHME;
    return derriere.facteurVitesse > devant.facteurVitesse + AVANCE_NATURE;
  }

  // Les ordres à donner maintenant : [{ lent, rapide, refus }]. derniers = Map(clé de paire ->
  // instant du dernier ordre) ; maintenant = temps de course (secondes) ; alea = générateur.
  function decider(course, derniers, maintenant, alea) {
    const ordres = [];
    const { COURSE } = VoitureF1.ETATS;
    for (const rapide of course.voitures) {
      if (rapide.etat !== COURSE || rapide.horsCourse) continue;
      const contexte = course.perception === null ? null : course.perception.devant.get(rapide);
      if (!contexte) continue;
      const lent = contexte.vehicule;
      if (!(lent instanceof VoitureF1) || lent.ecurie !== rapide.ecurie || lent.etat !== COURSE || lent.laisserPasser !== null) continue;
      if (lent === course.joueur || VoitureF1.secondes(contexte) > ECART_MAX) continue;
      if (!plusRapide(course, rapide, lent)) continue;
      const cle = [lent.numero, rapide.numero].sort((x, y) => x - y).join('-');
      if (derniers.has(cle) && maintenant - derniers.get(cle) < ATTENTE) continue;
      derniers.set(cle, maintenant);
      ordres.push({ lent, rapide, refus: alea() > (lent.traits.obeissance ?? 1) });
    }
    return ordres;
  }

  // Côté où la voiture lente se range : l'extérieur du prochain virage (l'intérieur reste libre
  // pour son coéquipier).
  function cote(voiture) {
    const virage = voiture.circuit.prochainVirage(voiture.indicePiste, voiture.circuit.longueur);
    return virage === null ? 1 : -virage.sens;
  }

  return { ECART_MAX, AVANCE_RYTHME, ATTENTE, decider, cote, plusRapide };
})();
