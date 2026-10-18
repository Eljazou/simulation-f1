// Le choix de rejouer après un incident, sans arrêter la course (design system : verre sombre).
// Ce n'est pas un Vehicle : il lit le scénario (formule1.encarts, confirmationRejouer) et lui
// renvoie les clics.
//   encart        « Incident · +10 s  [Rejouer la course R]  [✕] », centré juste au-dessus du
//                 bandeau d'événements (en écran partagé : dans la moitié du joueur concerné) ;
//                 NON bloquant : la course continue, ses boutons ne prennent jamais le focus
//                 (tabindex −1, mousedown sans focus), les touches de conduite marchent toujours ;
//                 il part en fondu après DUREE s, au clic sur ✕ ou au tour suivant (le scénario) ;
//   confirmation  « Rejouer ? Entrée = oui · Échap = non », au centre, course en pause.
// (Le menu pause est l'overlay PAUSE du mode jeu : voir menuPause.js.)
class EncartRejouer {
  static DUREE = 10;

  // parent = le calque de l'interface (#f1-ui) ; actions : rejouer(joueur), fermer(joueur),
  // confirmer(), annuler().
  constructor(parent, actions = {}) {
    const { el } = DomF1;
    const agir = nom => (...args) => (actions[nom] ?? (() => {}))(...args);
    // un bouton qui ne vole pas le focus clavier
    const bouton = (classe, libelle, touche, action) => {
      const b = el('button', `cond ${classe}`);
      b.type = 'button';
      b.tabIndex = -1;
      const texte = el('span', 'libelle', libelle);
      b.appendChild(texte);
      if (touche) b.appendChild(el('kbd', '', touche));
      b.addEventListener('mousedown', evenement => { if (typeof evenement?.preventDefault === 'function') evenement.preventDefault(); });
      b.addEventListener('click', () => { b.blur(); action(); });
      return { b, texte };
    };
    this.boites = [0, 1].map(k => {
      const racine = el('div', 'encart-rejouer glass');
      racine.id = `f1-encart-${k}`;
      racine.hidden = true;
      const texte = el('span', 'cond encart-texte');
      texte.id = `f1-encart-${k}-texte`;
      const rejouer = bouton('bouton-principal', 'Rejouer la course', 'R', () => agir('rejouer')(k));
      const fermer = bouton('bouton-discret encart-fermer', '✕', null, () => agir('fermer')(k));
      fermer.b.setAttribute('aria-label', 'Fermer');
      for (const e of [texte, rejouer.b, fermer.b]) racine.appendChild(e);
      parent.appendChild(racine);
      return { racine, texte, libelle: rejouer.texte, boutons: { rejouer: rejouer.b, fermer: fermer.b } };
    });
    // confirmation
    this.confirmation = el('div', 'confirmation-rejouer glass');
    this.confirmation.id = 'f1-confirmation';
    this.confirmation.hidden = true;
    this.confirmationTexte = el('span', 'cond confirmation-titre', 'Rejouer ?');
    this.confirmationTexte.id = 'f1-confirmation-texte';
    this.confirmationLibelle = el('span', 'confirmation-detail', 'La course repart du départ.');
    const choix = el('div', 'confirmation-boutons');
    const oui = bouton('bouton-principal', 'Oui', 'Entrée', agir('confirmer'));
    const non = bouton('bouton-contour', 'Non', 'Échap', agir('annuler'));
    choix.appendChild(oui.b);
    choix.appendChild(non.b);
    for (const e of [this.confirmationTexte, this.confirmationLibelle, choix]) this.confirmation.appendChild(e);
    parent.appendChild(this.confirmation);
  }

  // Le libellé du bouton : la course, ou la manche en championnat.
  static libelle(formule1) {
    return formule1.mode === 'championnat' ? 'Rejouer la manche' : 'Rejouer la course';
  }

  // Le texte de l'encart : « Incident · +10 s » (sans pénalité : « Incident »).
  static texte(encart) {
    return encart.penalite > 0 ? `Incident · +${encart.penalite} s` : 'Incident';
  }

  // actif : l'écran courant est la course (pas un écran de fin, ni le menu).
  mettreAJour(formule1, course, { actif = true } = {}) {
    const { cacher, texte, classe } = DomF1;
    const libelle = EncartRejouer.libelle(formule1);
    const confirmation = actif && formule1.confirmationRejouer === true;
    const encarts = actif && !confirmation ? formule1.encarts ?? [] : [];
    const partage = course.joueurs.length === 2;
    this.boites.forEach((boite, k) => {
      const e = encarts.find(x => x.indice === k) ?? null;
      cacher(boite.racine, e === null);
      if (e === null) return;
      texte(boite.texte, EncartRejouer.texte(e));
      texte(boite.libelle, libelle);
      classe(boite.racine, 'gauche', partage && k === 0);
      classe(boite.racine, 'droite', partage && k === 1);
      // fondu sur la dernière demi-seconde
      classe(boite.racine, 'part', e.age > EncartRejouer.DUREE - 0.5);
    });
    cacher(this.confirmation, !confirmation);
    if (confirmation) texte(this.confirmationLibelle, formule1.mode === 'championnat' ? 'La manche repart du départ.' : 'La course repart du départ.');
  }
}
