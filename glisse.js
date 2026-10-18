// Physique de glisse (case « glisse réaliste ») : un module de CALCUL, sans état ni dessin. La
// voiture (VoitureF1) l'appelle ; elle seule applique les forces qui en sortent (applyForce).
//
// Modèle (simplifié, documenté) :
//   - CERCLE D'ADHÉRENCE : la somme des forces de pilotage (seek, arrive, wander, suivi...) est
//     une DEMANDE faite aux pneus. Sa part latérale (perpendiculaire à la vitesse) est bornée par
//     la capacité latérale du train avant ; sa part longitudinale par la capacité de freinage ou
//     de motricité ; le tout par le cercle (capacité totale). Demande latérale trop forte :
//     SOUS-VIRAGE (la force est saturée, la voiture tourne moins et part large). Demande de
//     freinage trop forte : BLOCAGE des roues (on freine moins, plat de pneu).
//   - ANGLE DE DÉRIVE : écart entre le cap de la carrosserie (attribut de dessin) et la direction
//     de la vitesse. Quand l'arrière accroche moins que l'avant (pluie, pneus usés, vibreur,
//     accélération en sortie de virage), la carrosserie tourne plus vite que la vitesse :
//     SURVIRAGE. Le pneu ramène l'angle (rappel), le pilote contre-braque au-delà du seuil.
//   - Les réflexes d'évitement (séparation, anticipation, urgence) et le rappel sur la piste des
//     pilotes IA ne passent pas par le cercle : ce sont des corrections de sécurité ; les borner
//     ferait naître des contacts et des sorties. Le joueur n'a pas de rappel sur la piste : il
//     subit pleinement le sous-virage.
// Unités : forces en pixels par image², vitesses en pixels par image, angles en radians.
const Glisse = (() => {
  // Surfaces : adhérence (multiplicateur), traînée (part de la vitesse perdue par image), perte
  // d'adhérence arrière (survirage), enlisement (résistance à la motricité, en part de maxForce).
  const SURFACES = {
    asphalte: { adherence: 1, trainee: 0, arriere: 0, enlisement: 0 },
    vibreur: { adherence: 0.86, trainee: 0.002, arriere: 0.25, enlisement: 0 },
    herbe: { adherence: 0.42, trainee: 0.018, arriere: 0.35, enlisement: 0.1 },
    gravier: { adherence: 0.25, trainee: 0.06, arriere: 0.35, enlisement: 0.7 },
    mur: { adherence: 0.3, trainee: 0.08, arriere: 0.3, enlisement: 0.5 },
  };
  const NOMS_SURFACES = Object.keys(SURFACES);
  // Fenêtre de température idéale (°C) par catégorie de pneu ; hors de la fenêtre, l'adhérence
  // baisse de PERTE_TEMPERATURE par degré, jusqu'à ADHERENCE_FROIDE au plus bas.
  const FENETRES = { slick: [85, 110], inter: [55, 85], pluie: [40, 70] };
  const PERTE_TEMPERATURE = 0.004;
  const ADHERENCE_FROIDE = 0.82;
  // Appui aérodynamique : jusqu'à +AERO d'adhérence à la vitesse maximale (proportionnel au
  // carré de la vitesse) ; derrière une voiture (aspiration), l'air sale en retire jusqu'à
  // PERTE_ASPIRATION. Réservoir plein : -CARBURANT.
  const AERO = 0.18;
  const PERTE_ASPIRATION = 0.12;
  const CARBURANT = 0.03;
  // Arrière : pertes d'adhérence (avant multiplication par l'intensité de survirage). La perte
  // due à la pluie est d'autant plus forte que le pneu est inadapté : un pneu pluie sur piste
  // mouillée (adhérence de base proche de 1) n'en perd presque pas, un slick beaucoup.
  const ARRIERE_PLUIE = 0.32;
  const ARRIERE_USURE = 0.25;
  const ARRIERE_GAZ = 0.18;
  const ARRIERE_MAX = 0.65;

  // Facteur de température d'un pneu de catégorie `categorie` à `temperature` °C.
  function facteurTemperature(categorie, temperature) {
    const [bas, haut] = FENETRES[categorie] ?? FENETRES.slick;
    const ecart = temperature < bas ? bas - temperature : temperature > haut ? temperature - haut : 0;
    return Math.max(ADHERENCE_FROIDE, 1 - PERTE_TEMPERATURE * ecart);
  }

  // Adhérence de l'avant et de l'arrière. donnees : base (pneu sur la piste du moment, voir
  // Pneus.adherence), globale (réglage du panneau), surface, temperature (facteur), vitesse
  // relative (0 à 1), aspiration (0 à 1), carburant (0 à 1), gomme (bonus de la trajectoire
  // gommée), toucher (pilote), humidite, usure (1 - état des pneus), gaz (accélère en sortie de
  // virage, 0 ou 1), survirage (intensité du panneau). Renvoie { avant, arriere, perteArriere }.
  function adherences({ base = 1, globale = 1, surface = 'asphalte', temperature = 1, vitesse = 0, aspiration = 0,
    carburant = 0, gomme = 0, toucher = 1, humidite = 0, usure = 0, gaz = 0, survirage = 1 } = {}) {
    const s = SURFACES[surface] ?? SURFACES.asphalte;
    const aero = 1 + AERO * vitesse * vitesse - PERTE_ASPIRATION * aspiration;
    const avant = base * globale * s.adherence * temperature * aero * (1 - CARBURANT * carburant) * (1 + gomme) * toucher;
    const inadapte = Math.max(0, Math.min(1, (1 - base) / 0.5));
    const perte = Math.min(ARRIERE_MAX, Math.max(0, survirage) *
      (ARRIERE_PLUIE * humidite * inadapte + ARRIERE_USURE * usure + ARRIERE_GAZ * gaz + s.arriere));
    return { avant, arriere: avant * (1 - perte), perteArriere: perte };
  }

  // Cercle d'adhérence. demande = { x, y } (somme des forces de pilotage) ; direction = { x, y }
  // unitaire (sens de la vitesse) ; capacites = { laterale, freinage, motricite, totale }.
  // Renvoie { x, y } la force transmise, et ce qui s'est passé : sousVirage (part de la demande
  // latérale refusée, 0 si aucune), blocage (freinage demandé au-delà de la capacité), lat et
  // long (demande décomposée).
  function cercle(demande, direction, capacites, glissementBloque = 0.8) {
    const t = direction;
    const n = { x: -t.y, y: t.x };
    let long = demande.x * t.x + demande.y * t.y;
    let lat = demande.x * n.x + demande.y * n.y;
    const demandeLat = lat;
    const demandeLong = long;
    let sousVirage = 0;
    let blocage = false;
    if (Math.abs(lat) > capacites.laterale) {
      sousVirage = Math.abs(lat) / Math.max(1e-9, capacites.laterale) - 1;
      lat = Math.sign(lat) * capacites.laterale;
    }
    if (long < -capacites.freinage) {
      // roues bloquées : la gomme glisse, elle freine moins bien qu'au bord du blocage
      blocage = true;
      long = -capacites.freinage * glissementBloque;
    } else if (long > capacites.motricite) {
      long = capacites.motricite;
    }
    const total = Math.hypot(long, lat);
    if (total > capacites.totale) {
      const k = capacites.totale / total;
      long *= k;
      lat *= k;
      if (Math.abs(demandeLat) > 1e-9) sousVirage = Math.max(sousVirage, Math.abs(demandeLat) / Math.abs(lat) - 1);
    }
    return { x: t.x * long + n.x * lat, y: t.y * long + n.y * lat, sousVirage, blocage, lat: demandeLat, long: demandeLong };
  }

  // Une image de la dynamique de lacet. etat = { derive (angle de dérive, rad) } ; entrees :
  // lacetVitesse (rotation de la vitesse pendant l'image, rad), deficit (perte relative de
  // l'arrière, 0 à 1, déjà multipliée par l'intensité), charge (part de la capacité latérale
  // utilisée, 0 à 1), adherenceArriere (0 à 1+), seuil (au-delà, le pilote contre-braque),
  // contreBraquage (force de la correction du pilote, par image), gain, rappel.
  // Renvoie la nouvelle dérive, bornée à DERIVE_MAX (pas de tête-à-queue).
  const DERIVE_MAX = 1.1;
  function lacet(derive, { lacetVitesse = 0, deficit = 0, charge = 0, adherenceArriere = 1, seuil = 0.08,
    contreBraquage = 0.06, gain = 1.6, rappel = 0.09 } = {}) {
    // l'arrière qui décroche fait tourner la carrosserie plus vite que la vitesse
    let d = derive + lacetVitesse * gain * deficit * charge;
    // le pneu ramène la carrosserie dans l'axe (d'autant mieux qu'il accroche)
    d -= d * rappel * Math.min(1.2, Math.max(0, adherenceArriere));
    // le pilote contre-braque au-delà du seuil
    if (Math.abs(d) > seuil) d -= d * contreBraquage;
    return Math.max(-DERIVE_MAX, Math.min(DERIVE_MAX, d));
  }

  // Écart angulaire ramené dans ]-π, π].
  function angle(a) {
    let x = a % (2 * Math.PI);
    if (x > Math.PI) x -= 2 * Math.PI;
    if (x <= -Math.PI) x += 2 * Math.PI;
    return x;
  }

  return { SURFACES, NOMS_SURFACES, FENETRES, DERIVE_MAX, facteurTemperature, adherences, cercle, lacet, angle };
})();
