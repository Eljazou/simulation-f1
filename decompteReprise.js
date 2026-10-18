// Compte à rebours de la remise en piste (3, 2, 1) : un grand chiffre au centre de l'écran (en
// écran partagé, au centre de la moitié du joueur). Ce n'est pas un Vehicle : il lit l'incident
// de chaque joueur (IncidentJoueur.decompte), dans le repère de l'écran (HTML), sans la caméra.
class DecompteReprise {
  // parent = le calque de l'interface (#f1-ui).
  constructor(parent) {
    const { el } = DomF1;
    this.elements = [0, 1].map(k => {
      const e = el('div', 'decompte-reprise cond');
      e.id = `f1-decompte-${k}`;
      e.hidden = true;
      parent.appendChild(e);
      return e;
    });
  }

  // visible : l'écran courant permet la course (pas un écran de fin).
  mettreAJour(course, { visible = true } = {}) {
    const joueurs = course.joueurs;
    this.elements.forEach((e, k) => {
      const valeur = visible ? joueurs[k]?.incident?.decompte ?? null : null;
      DomF1.cacher(e, valeur === null);
      if (valeur === null) return;
      DomF1.texte(e, String(valeur));
      DomF1.classe(e, 'gauche', joueurs.length === 2 && k === 0);
      DomF1.classe(e, 'droite', joueurs.length === 2 && k === 1);
    });
  }
}
