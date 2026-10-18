// Feux de départ en HTML (design/ : « Feux de départ ») : cinq colonnes de feux sous la barre du
// haut et la séquence en bas (Prêt, 1 à 5, Vert). Les cinq colonnes rouges s'allument une par une
// (un feu toutes les INTERVALLE_FEUX secondes), puis, après une attente tirée entre
// ATTENTE_FEUX_MIN et ATTENTE_FEUX_MAX, passent TOUTES au vert (« GO ! ») pendant DUREE_VERT s :
// la course part exactement au passage au vert (Course : FEUX → COURSE). Le portique disparaît
// ensuite en fondu (DUREE_FONDU). Ce n'est pas un Vehicle : il lit l'état de la course
// (Course.ETATS, course.feux, chronoEtat) et ne change rien.
class FeuxDepart {
  static DUREE_VERT = 1;
  static DUREE_FONDU = 0.25;
  static ETAPES = ['Prêt', '1', '2', '3', '4', '5', 'Vert'];

  // L'étape de la séquence (0 : prêt, 1 à 5 : feux rouges allumés, 6 : vert, fondu compris), ou
  // null quand les feux ne sont pas affichés.
  static etape(course) {
    const { PRESENTATION, FEUX, COURSE } = Course.ETATS;
    const duree = FeuxDepart.DUREE_VERT + FeuxDepart.DUREE_FONDU;
    if (course.etat === PRESENTATION) return 0;
    if (course.etat === FEUX) return Math.max(0, Math.min(5, course.feux));
    if (course.etat === COURSE && course.chronoEtat < duree - 1e-9 && course.tempsCourse < duree + 0.5) return 6;
    return null;
  }

  // Le portique s'efface (après DUREE_VERT s de vert).
  static fondu(course) {
    return FeuxDepart.etape(course) === 6 && course.chronoEtat >= FeuxDepart.DUREE_VERT - 1e-9;
  }

  // parent = le calque de l'interface (#f1-ui).
  constructor(parent) {
    const { el } = DomF1;
    this.lampes = el('div', 'feux-lampes');
    this.lampes.setAttribute('role', 'img');
    this.colonnes = Array.from({ length: 5 }, () => {
      const colonne = el('div', 'feux-colonne');
      const haut = el('span', 'feu');
      const a = el('span', 'feu');
      const b = el('span', 'feu');
      for (const e of [haut, a, b]) colonne.appendChild(e);
      this.lampes.appendChild(colonne);
      return [a, b];
    });
    this.go = el('div', 'feux-go cond', 'GO !');
    this.sequence = el('div', 'feux-sequence glass');
    const entete = el('div', 'feux-entete');
    const intervalle = String(Course.INTERVALLE_FEUX).replace('.', ',');
    const attente = `${String(Course.ATTENTE_FEUX_MIN).replace('.', ',')}–${String(Course.ATTENTE_FEUX_MAX).replace('.', ',')}`;
    entete.appendChild(el('span', 'lbl', `Séquence · 1 feu toutes les ${intervalle} s, vert après une attente aléatoire de ${attente} s`));
    this.sequence.appendChild(entete);
    const etapes = el('div', 'feux-etapes');
    this.etapes = FeuxDepart.ETAPES.map(texte => {
      const etape = el('div', 'feux-etape');
      const points = el('span', 'feux-points');
      const pts = Array.from({ length: 5 }, () => {
        const p = el('span', 'feux-point');
        points.appendChild(p);
        return p;
      });
      etape.appendChild(points);
      etape.appendChild(el('span', 'cond feux-etape-texte', texte));
      etapes.appendChild(etape);
      return { etape, pts };
    });
    this.sequence.appendChild(etapes);
    this.racine = el('div', 'feux');
    this.racine.id = 'f1-feux';
    for (const e of [this.lampes, this.go, this.sequence]) this.racine.appendChild(e);
    this.racine.hidden = true;
    parent.appendChild(this.racine);
    this.etapeAffichee = undefined;
  }

  // Une mise à jour (chaque image : l'allumage est immédiat). Écrit seulement au changement.
  mettreAJour(course) {
    const k = FeuxDepart.etape(course);
    DomF1.cacher(this.racine, k === null);
    DomF1.classe(this.racine, 'fondu', FeuxDepart.fondu(course));
    if (k === this.etapeAffichee) return;
    this.etapeAffichee = k;
    if (k === null) return;
    const go = k === 6;
    this.colonnes.forEach(([a, b], i) => {
      for (const feu of [a, b]) {
        DomF1.classe(feu, 'allume', !go && i < k);
        DomF1.classe(feu, 'vert', go);
      }
    });
    DomF1.attribut(this.lampes, 'aria-label', go ? 'Feux verts : départ' : `${k} feux rouges allumés sur 5`);
    DomF1.cacher(this.go, !go);
    this.etapes.forEach(({ etape, pts }, n) => {
      DomF1.classe(etape, 'courante', n === k);
      pts.forEach((p, i) => {
        DomF1.classe(p, 'rouge', n < 6 && i < n);
        DomF1.classe(p, 'vert', n === 6);
      });
    });
  }
}
