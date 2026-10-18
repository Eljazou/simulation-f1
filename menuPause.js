// Overlay « PAUSE » du mode jeu (design system : verre sombre, centré à l'écran). Ce n'est pas un
// Vehicle : il lit le scénario et la course, et renvoie les choix à l'interface. Quatre boutons,
// l'un sous l'autre : Reprendre (choisi par défaut), Rejouer la course (« la manche » en
// championnat ; avec confirmation), Réglages (ouvre le panneau latéral), Menu (menu des modes).
// Clavier (InterfaceF1.touche) : ↑/↓ pour choisir, Entrée pour valider, P ou Échap = Reprendre.
// Visible quand la partie est en pause et qu'aucun autre overlay n'est ouvert (confirmation
// « Rejouer ? », menu des modes) : un seul overlay à la fois.
class MenuPause {
  // [action, libellé, touche affichée]
  static ACTIONS = [['reprendre', 'Reprendre', 'P'], ['rejouer', 'Rejouer la course', 'R'], ['reglages', 'Réglages', ''], ['menu', 'Menu', '']];

  // parent = le calque de l'interface (#f1-ui) ; actions : reprendre(), rejouer(), reglages(), menu().
  constructor(parent, actions = {}) {
    const { el } = DomF1;
    this.actions = actions;
    this.racine = el('div', 'menu-pause glass');
    this.racine.id = 'f1-menu-pause';
    this.racine.setAttribute('role', 'dialog');
    this.racine.setAttribute('aria-label', 'Pause');
    this.racine.hidden = true;
    this.titre = el('div', 'cond menu-pause-titre', 'PAUSE');
    this.racine.appendChild(this.titre);
    const liste = el('div', 'menu-pause-boutons');
    this.boutons = MenuPause.ACTIONS.map(([id, libelle, touche], k) => {
      const b = el('button', `cond ${k === 0 ? 'bouton-principal' : 'bouton-contour'}`);
      b.type = 'button';
      // la souris ne vole pas le focus clavier (les touches vont toujours au jeu)
      b.tabIndex = -1;
      const texte = el('span', 'libelle', libelle);
      b.appendChild(texte);
      if (touche) b.appendChild(el('kbd', '', touche));
      b.addEventListener('mousedown', evenement => { if (typeof evenement?.preventDefault === 'function') evenement.preventDefault(); });
      b.addEventListener('mouseenter', () => this.choisir(k));
      b.addEventListener('click', () => { b.blur(); this.choisir(k); this.valider(); });
      liste.appendChild(b);
      return { id, b, libelle: texte };
    });
    this.racine.appendChild(liste);
    parent.appendChild(this.racine);
    this.choix = 0;
  }

  get visible() {
    return !this.racine.hidden;
  }

  // Le bouton choisi (0 à 3) ; la classe « choisi » le montre.
  choisir(k) {
    this.choix = ((k % this.boutons.length) + this.boutons.length) % this.boutons.length;
    this.boutons.forEach((bouton, i) => DomF1.classe(bouton.b, 'choisi', i === this.choix));
  }

  // ↑ (-1) ou ↓ (+1), en boucle.
  deplacer(sens) {
    this.choisir(this.choix + sens);
  }

  // Entrée (ou clic) : l'action du bouton choisi.
  valider() {
    const action = this.actions[this.boutons[this.choix].id];
    if (action) action();
  }

  // Une touche quand l'overlay est visible. Renvoie vrai si elle est prise (toutes le sont : la
  // course est en pause, rien ne doit partir aux commandes de conduite).
  touche(k) {
    if (k === 'arrowup') this.deplacer(-1);
    else if (k === 'arrowdown') this.deplacer(1);
    else if (k === 'enter') this.valider();
    else if (k === 'p' || k === 'escape') {
      this.choisir(0);
      this.valider();
    } else if (k === 'r' && this.actions.rejouer) this.actions.rejouer();
    return true;
  }

  // visible : la partie est en pause, sans autre overlay (décidé par l'interface). À chaque
  // ouverture, Reprendre est choisi.
  mettreAJour(formule1, { visible = false } = {}) {
    if (visible && !this.visible) this.choisir(0);
    DomF1.cacher(this.racine, !visible);
    if (visible) DomF1.texte(this.boutons[1].libelle, EncartRejouer.libelle(formule1));
  }
}
