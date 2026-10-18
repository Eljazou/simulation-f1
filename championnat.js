// Championnat du scénario « Circuit Formule 1 » : trois manches sur les trois circuits, barème
// 25-18-15-12-10-8-6-4-2-1, plus un point pour le meilleur tour s'il est signé par un pilote classé
// dans les dix premiers. Classements des pilotes et des écuries (égalité : le plus de victoires,
// puis le meilleur résultat). Une aide de calcul, pas un Vehicle : elle lit le chronométrage.
class Championnat {
  static MANCHES = ['classique', 'rapide', 'technique'];
  static POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  static POINT_MEILLEUR_TOUR = 1;

  constructor(manches = Championnat.MANCHES) {
    for (const m of manches) if (!Object.hasOwn(Circuit.PROFILS, m)) throw new RangeError(`Circuit inconnu : ${m}.`);
    this.manches = [...manches];
    this.indice = 0;
    this.resultats = [];
  }

  get mancheCourante() {
    return this.manches[this.indice] ?? null;
  }

  // Les trois manches sont courues.
  get termine() {
    return this.resultats.length >= this.manches.length;
  }

  // La manche courante est-elle déjà enregistrée ?
  get mancheEnregistree() {
    return this.resultats.length > this.indice;
  }

  // Points d'une course terminée : [{ code, nom, ecurie, position, points, meilleurTour }], dans
  // l'ordre d'arrivée (abandons à la fin, sans point).
  static pointsDe(course) {
    const chrono = course.chronometrage;
    const meilleur = chrono.meilleurTour?.voiture ?? null;
    return course.classement().map((v, rang) => {
      const classe = !chrono.abandon(v) && !v.horsCourse;
      let points = classe ? Championnat.POINTS[rang] ?? 0 : 0;
      const meilleurTour = v === meilleur && classe && rang < 10;
      if (meilleurTour) points += Championnat.POINT_MEILLEUR_TOUR;
      return { code: v.pilote.code, nom: v.pilote.nom, ecurie: v.ecurie.nom, couleur: v.ecurie.couleurs[0], position: classe ? rang + 1 : null, points, meilleurTour };
    });
  }

  // Enregistre la manche courante (une seule fois).
  enregistrer(course) {
    if (this.mancheEnregistree) return false;
    this.resultats.push({ profil: this.mancheCourante, lignes: Championnat.pointsDe(course) });
    return true;
  }

  // La manche courante est recourue (relancer, rejouer) : son résultat déjà enregistré est retiré,
  // elle sera enregistrée à sa nouvelle arrivée. Renvoie vrai si un résultat a été retiré.
  annulerManche() {
    if (!this.mancheEnregistree) return false;
    this.resultats.length = this.indice;
    return true;
  }

  // Passe à la manche suivante (après l'enregistrement de la courante). Renvoie son profil ou null.
  suivante() {
    if (!this.mancheEnregistree || this.indice >= this.manches.length - 1) return null;
    this.indice++;
    return this.mancheCourante;
  }

  // Cumul par clé ('code' : pilotes, 'ecurie' : écuries) : [{ cle, nom, couleur, points, victoires, meilleur }].
  cumul(cle) {
    const table = new Map();
    for (const { lignes } of this.resultats) {
      for (const l of lignes) {
        const k = l[cle];
        const e = table.get(k) ?? { cle: k, nom: cle === 'code' ? l.nom : l.ecurie, ecurie: l.ecurie, couleur: l.couleur, points: 0, victoires: 0, meilleur: Infinity };
        e.points += l.points;
        if (l.position === 1) e.victoires++;
        if (l.position !== null) e.meilleur = Math.min(e.meilleur, l.position);
        table.set(k, e);
      }
    }
    return [...table.values()].sort((a, b) => (b.points - a.points) || (b.victoires - a.victoires) || (a.meilleur - b.meilleur));
  }

  classementPilotes() {
    return this.cumul('code');
  }

  classementEcuries() {
    return this.cumul('ecurie');
  }
}
