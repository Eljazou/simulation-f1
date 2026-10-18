// Écran REJOUER en HTML (design/ : « Écran REJOUER ») : sous le mot en points (EcranFin, dans la
// scène), les boutons REJOUER et MENU, les touches (Entrée : rejouer, Échap : menu), et le bilan
// du joueur : dernier résultat, meilleur tour de la course, ses dépassements. Ce n'est pas un
// Vehicle : il lit la course et appelle les actions du scénario. Boutons, touches et bilan sont placés depuis la
// disposition de l'écran de fin (EcranFin.disposition) : le même centre que le mot en points.
class EcranRejouer {
  // Le bilan : { resultat, meilleurTour, depassements } (vraies valeurs de la course).
  static bilan(course) {
    const joueur = course.joueur ?? null;
    const ordre = course.classement();
    const rang = joueur === null ? -1 : ordre.indexOf(joueur);
    const abandon = joueur !== null && (course.chronometrage.abandon(joueur) || joueur.horsCourse);
    const meilleur = course.chronometrage.meilleurTour;
    const statut = abandon ? 'ABD' : `P${rang + 1}`;
    return {
      resultat: joueur === null ? '—' : `${statut} · ${joueur.pilote.code}`,
      meilleurTour: meilleur === null ? '—' : Chronometrage.formater(meilleur.temps),
      depassements: joueur === null ? '—' : String(joueur.depassements ?? 0),
    };
  }

  // parent = le calque de l'interface (#f1-ui) ; actions : rejouer(), menu().
  constructor(parent, actions = {}) {
    const { el } = DomF1;
    this.racine = el('div', 'rejouer');
    this.racine.id = 'f1-rejouer';
    this.racine.hidden = true;
    const boutons = el('div', 'rejouer-boutons');
    // chaque bouton rend le focus avant d'agir (les touches vont ensuite au jeu, ou au menu)
    const bouton = (classe, texte, action) => {
      const b = el('button', `cond ${classe}`, texte);
      b.type = 'button';
      b.addEventListener('click', () => { b.blur(); (actions[action] ?? (() => {}))(); });
      boutons.appendChild(b);
      return b;
    };
    const nouvelle = bouton('bouton-principal', 'REJOUER', 'rejouer');
    const changer = bouton('bouton-contour', 'MENU', 'menu');
    const touches = el('span', 'rejouer-touches');
    touches.appendChild(el('kbd', '', 'Entrée'));
    touches.appendChild(el('span', '', ' rejouer · '));
    touches.appendChild(el('kbd', '', 'Échap'));
    touches.appendChild(el('span', '', ' menu'));
    const actionsBloc = el('div', 'rejouer-actions');
    actionsBloc.appendChild(boutons);
    actionsBloc.appendChild(touches);
    const bilan = el('div', 'rejouer-bilan glass');
    const bloc = (titre, classe) => {
      const b = el('span', 'rejouer-bloc');
      b.appendChild(el('span', 'lbl', titre));
      const v = el('span', classe);
      b.appendChild(v);
      bilan.appendChild(b);
      return v;
    };
    this.dom = {
      resultat: bloc('Dernier résultat', 'cond rejouer-valeur'),
      meilleurTour: bloc('Meilleur tour', 'mono rejouer-meilleur'),
      depassements: bloc('Dépassements', 'cond rejouer-valeur'),
    };
    this.actions = actionsBloc;
    this.bilan = bilan;
    this.boutons = { nouvelle, changer };
    this.racine.appendChild(actionsBloc);
    this.racine.appendChild(bilan);
    parent.appendChild(this.racine);
  }

  get visible() {
    return !this.racine.hidden;
  }

  // disposition : celle de l'écran de fin (EcranFin), qui place le groupe (ou null : CSS par défaut).
  mettreAJour(course, { visible = false, disposition = null } = {}) {
    DomF1.cacher(this.racine, !visible);
    if (!visible) return;
    if (disposition !== null) {
      DomF1.style(this.actions, 'top', `${disposition.actionsHaut}px`);
      DomF1.style(this.bilan, 'top', `${disposition.bilanHaut}px`);
      DomF1.style(this.bilan, 'bottom', 'auto');
    }
    const b = EcranRejouer.bilan(course);
    DomF1.texte(this.dom.resultat, b.resultat);
    DomF1.texte(this.dom.meilleurTour, b.meilleurTour);
    DomF1.texte(this.dom.depassements, b.depassements);
  }
}
