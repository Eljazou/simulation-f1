// Défis du scénario « Circuit Formule 1 » : un module de DONNÉES et de calcul (sans classe). Chaque
// défi fixe des réglages et une place sur la grille, puis note la course de 0 à 3 étoiles. Les
// meilleures étoiles de chaque défi sont gardées dans un stockage (localStorage dans la page) : la
// lecture et l'écriture sont protégées (try/catch) — stockage absent, plein ou interdit (navigation
// privée) : les étoiles restent en mémoire pour la séance, sans erreur.
const Defis = (() => {
  const CLE = 'f1-defis-etoiles';

  // grille : 'dernier' (dernière place), 'milieu', ou un rang. mode : 'pilote' ou 'manager'.
  // etoiles(bilan) : bilan = { fini, position, penalites, ecartMeilleurTour, positionsEcurie }.
  const LISTE = [
    { id: 'remontee', titre: 'Remontée : partir dernier', mode: 'pilote', grille: 'dernier',
      reglages: { nombreVoitures: 12, nombreTours: 3 },
      objectif: '★ top 10 · ★★ top 5 · ★★★ victoire',
      etoiles: b => (!b.fini ? 0 : b.position <= 1 ? 3 : b.position <= 5 ? 2 : b.position <= 10 ? 1 : 0) },
    { id: 'sansFaute', titre: 'Sans faute : aucune pénalité', mode: 'pilote', grille: 'milieu',
      reglages: { nombreVoitures: 10, nombreTours: 3 },
      objectif: '★ finir · ★★ sans pénalité · ★★★ sans pénalité et top 3',
      etoiles: b => (!b.fini ? 0 : b.penalites > 0 ? 1 : b.position <= 3 ? 3 : 2) },
    { id: 'tourRapide', titre: 'Tour rapide : battre les IA', mode: 'pilote', grille: 'milieu',
      reglages: { nombreVoitures: 8, nombreTours: 3 },
      objectif: '★ à 1 s du meilleur tour IA · ★★ à 0,5 s · ★★★ plus rapide',
      etoiles: b => (b.ecartMeilleurTour === null ? 0 : b.ecartMeilleurTour <= 0 ? 3 : b.ecartMeilleurTour <= 0.5 ? 2 : b.ecartMeilleurTour <= 1 ? 1 : 0) },
    { id: 'manager', titre: 'Manager : les deux voitures dans les points', mode: 'manager', grille: null,
      reglages: { nombreVoitures: 12, nombreTours: 4, ecuries: 6 },
      objectif: '★ une voiture top 10 · ★★ les deux · ★★★ une victoire',
      etoiles: b => {
        const p = b.positionsEcurie.filter(x => x !== null);
        if (p.some(x => x === 1)) return 3;
        const points = p.filter(x => x <= 10).length;
        return points >= 2 ? 2 : points;
      } },
  ];

  function defi(id) {
    const d = LISTE.find(x => x.id === id);
    if (!d) throw new RangeError(`Défi inconnu : ${id}.`);
    return d;
  }

  // Le rang de grille du joueur pour ce défi.
  function rangDeGrille(d, nombreVoitures) {
    if (d.grille === 'dernier') return nombreVoitures - 1;
    if (d.grille === 'milieu') return Math.floor(nombreVoitures / 2);
    return d.grille ?? 0;
  }

  // Le bilan d'une course terminée (ou finie par un accident) pour le défi.
  function bilan(course) {
    const chrono = course.chronometrage;
    const ordre = course.classement();
    const j = course.joueur;
    const position = v => (chrono.abandon(v) || v.horsCourse ? null : ordre.indexOf(v) + 1);
    const meilleur = v => chrono.meilleurPersonnel(v)?.temps ?? null;
    const ia = course.voitures.filter(v => !course.joueurs.includes(v)).map(meilleur).filter(t => t !== null);
    const monMeilleur = j === null ? null : meilleur(j);
    return {
      fini: j !== null && position(j) !== null,
      position: j === null ? null : position(j),
      penalites: j?.penalites ?? 0,
      ecartMeilleurTour: monMeilleur === null || ia.length === 0 ? null : monMeilleur - Math.min(...ia),
      positionsEcurie: course.ecurieGeree === null ? [] : course.voitures.filter(v => v.ecurie === course.ecurieGeree).map(position),
    };
  }

  // Étoiles enregistrées : { id: étoiles } ; {} si le stockage est absent ou illisible.
  function charger(stockage) {
    try {
      const brut = stockage?.getItem(CLE);
      const lu = brut ? JSON.parse(brut) : {};
      return lu && typeof lu === 'object' ? lu : {};
    } catch {
      return {};
    }
  }

  // Garde le meilleur résultat du défi ; renvoie les étoiles à jour (même si l'écriture échoue).
  function enregistrer(stockage, memoire, id, etoiles) {
    defi(id);
    if (!Number.isInteger(etoiles) || etoiles < 0 || etoiles > 3) throw new RangeError(`Étoiles invalides : ${etoiles}.`);
    const etat = { ...charger(stockage), ...memoire };
    etat[id] = Math.max(etat[id] ?? 0, etoiles);
    try {
      stockage?.setItem(CLE, JSON.stringify(etat));
    } catch {
      // stockage plein ou interdit : on garde en mémoire
    }
    return etat;
  }

  const texteEtoiles = n => '★'.repeat(n) + '☆'.repeat(3 - n);

  // Bandeau de résultat (écran).
  function show(resultat, largeur, hauteur) {
    if (resultat === null) return;
    push();
    noStroke();
    fill(10, 12, 18, 225);
    const w = 380;
    rectMode(CENTER);
    rect(largeur / 2, hauteur * 0.2, w, 76, 8);
    textAlign(CENTER, CENTER);
    fill(240);
    textSize(14);
    text(`DÉFI : ${resultat.titre}`, largeur / 2, hauteur * 0.2 - 20);
    fill(250, 210, 40);
    textSize(30);
    text(texteEtoiles(resultat.etoiles), largeur / 2, hauteur * 0.2 + 12);
    pop();
  }

  return { CLE, LISTE, defi, rangDeGrille, bilan, charger, enregistrer, texteEtoiles, show };
})();
