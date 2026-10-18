// Bouton « JOUER » et menu de sélection du mode (design system : verre sombre, centré). Ce n'est
// pas un Vehicle : il ne garde que le choix en cours dans le menu ; le jeu lui-même (mode, mode
// pilote, circuit, tours, ambiance) reste dans le scénario et la course, que les réglages
// « Mode » et « Joueur » du panneau lisent et écrivent aussi (une seule source de vérité). À
// l'ouverture, le menu reprend les valeurs du jeu ; Lancer les renvoie à l'interface
// (InterfaceF1.lancerPartie), qui passe par les mêmes chemins que le panneau.
//   bouton JOUER  rouge clair, en bas à droite (à gauche du panneau quand il est ouvert), visible
//                 quand aucune partie n'est en cours (spectateur, fin de course) ;
//   menu          quatre cartes (Solo, Deux joueurs, Championnat, Spectateur : icône, titre, une
//                 ligne d'explication), puis circuit, nombre de tours, ambiance (jour, nuit,
//                 pluie), adversaires (Classiques ou IA entraînée, et le modèle), puis [Lancer] et
//                 [Annuler]. Clavier (InterfaceF1.touche) : ← → (ou
//                 ↑ ↓) changent de carte, Entrée lance, Échap annule.
class MenuModes {
  static MODES = [
    { id: 'solo', titre: 'Solo', texte: 'Je pilote une voiture contre l\'IA',
      icone: 'M5 17h14l-1.5-6.5A2 2 0 0 0 15.6 9H8.4a2 2 0 0 0-1.9 1.5zM7 17v2M17 17v2M8 13h8' },
    { id: 'duo', titre: 'Deux joueurs', texte: 'Écran partagé, J1 WASD + Espace, J2 flèches + Entrée',
      icone: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M22 20a6 6 0 0 0-5-5.9' },
    { id: 'championnat', titre: 'Championnat', texte: '3 courses, points cumulés',
      icone: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8' },
    { id: 'spectateur', titre: 'Spectateur', texte: 'Je regarde la course sans piloter',
      icone: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  ];
  static AMBIANCES = ['jour', 'nuit', 'pluie'];
  static LIBELLES_AMBIANCES = { jour: 'Jour', nuit: 'Nuit', pluie: 'Pluie' };
  static TOURS_MAX = 20;
  static ADVERSAIRES = ['classiques', 'ia'];
  static LIBELLES_ADVERSAIRES = { classiques: 'Classiques', ia: 'IA entraînée' };

  // parent = le calque de l'interface (#f1-ui) ; actions : jouer() (bouton JOUER), lancer(options),
  // annuler().
  constructor(parent, actions = {}) {
    const { el, svg } = DomF1;
    this.actions = actions;
    const agir = (nom, ...args) => { if (actions[nom]) actions[nom](...args); };
    // un bouton qui ne vole pas le focus clavier
    const bouton = (classe, texte, action) => {
      const b = el('button', classe, texte);
      b.type = 'button';
      b.tabIndex = -1;
      b.addEventListener('mousedown', evenement => { if (typeof evenement?.preventDefault === 'function') evenement.preventDefault(); });
      b.addEventListener('click', () => { b.blur(); action(); });
      return b;
    };
    this.jouer = bouton('bouton-jouer', 'JOUER', () => agir('jouer'));
    this.jouer.id = 'f1-jouer';
    parent.appendChild(this.jouer);

    this.racine = el('div', 'menu-modes glass');
    this.racine.id = 'f1-menu-modes';
    this.racine.setAttribute('role', 'dialog');
    this.racine.setAttribute('aria-label', 'Choisir le mode de jeu');
    this.racine.hidden = true;
    this.racine.appendChild(el('div', 'cond menu-modes-titre', 'Choisis ton mode'));
    const grille = el('div', 'menu-modes-cartes');
    this.cartes = {};
    for (const m of MenuModes.MODES) {
      const carte = bouton('carte-mode', null, () => this.choisir(m.id));
      const icone = svg('svg', { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
      icone.appendChild(svg('path', { d: m.icone }));
      carte.appendChild(icone);
      carte.appendChild(el('span', 'cond carte-mode-titre', m.titre));
      carte.appendChild(el('span', 'carte-mode-texte', m.texte));
      grille.appendChild(carte);
      this.cartes[m.id] = carte;
    }
    this.racine.appendChild(grille);

    // circuit, tours, ambiance
    const options = el('div', 'menu-modes-options');
    const champ = (libelle, controle) => {
      const l = el('label', 'menu-modes-champ');
      l.appendChild(el('span', 'lbl', libelle));
      l.appendChild(controle);
      options.appendChild(l);
      return controle;
    };
    const menu = (valeurs) => {
      const s = el('select', 'menu-modes-liste');
      for (const [valeur, texte] of valeurs) {
        const o = el('option', '', texte);
        o.value = valeur;
        s.appendChild(o);
      }
      // le menu rend la main : Entrée lance, Échap annule
      s.addEventListener('change', () => s.blur());
      return s;
    };
    this.circuit = champ('Circuit', menu(Object.entries(Circuit.PROFILS).map(([id, p]) => [id, p.libelle ?? id])));
    this.tours = champ('Tours', menu(Array.from({ length: MenuModes.TOURS_MAX }, (_, i) => [String(i + 1), String(i + 1)])));
    const segments = el('div', 'menu-modes-segments');
    this.ambiances = {};
    for (const a of MenuModes.AMBIANCES) {
      const b = bouton('seg', MenuModes.LIBELLES_AMBIANCES[a], () => this.choisirAmbiance(a));
      segments.appendChild(b);
      this.ambiances[a] = b;
    }
    champ('Ambiance', segments);
    // adversaires : deux options seulement, et le modèle (liste des modèles sauvegardés)
    const adversaires = el('div', 'menu-modes-segments');
    this.boutonsAdversaires = {};
    for (const a of MenuModes.ADVERSAIRES) {
      const b = bouton('seg', MenuModes.LIBELLES_ADVERSAIRES[a], () => this.choisirAdversaires(a));
      adversaires.appendChild(b);
      this.boutonsAdversaires[a] = b;
    }
    champ('Adversaires', adversaires);
    this.modele = champ('Modèle IA', menu([]));
    this.racine.appendChild(options);

    const pied = el('div', 'menu-modes-boutons');
    this.boutonAnnuler = bouton('cond bouton-contour', 'Annuler', () => agir('annuler'));
    this.boutonLancer = bouton('cond bouton-principal', 'Lancer', () => agir('lancer', this.options()));
    pied.appendChild(this.boutonAnnuler);
    pied.appendChild(this.boutonLancer);
    this.racine.appendChild(pied);
    parent.appendChild(this.racine);

    this.mode = 'solo';
    this.ambiance = 'jour';
    this.adversaires = 'classiques';
  }

  get ouvert() {
    return !this.racine.hidden;
  }

  // Ouvre le menu sur les valeurs du jeu : { mode, profil, tours, ambiance, adversaires, modele,
  // modeles ([{ id, nom, note }] : la liste des modèles sauvegardés) }.
  ouvrir({ mode = 'solo', profil = null, tours = null, ambiance = 'jour', adversaires = 'classiques', modele = null, modeles = [] } = {}) {
    this.modele.replaceChildren(...modeles.map(m => {
      const o = DomF1.el('option', '', `${m.nom}${m.note === null || m.note === undefined ? '' : ` · ${m.note}/100`}`);
      o.value = m.id;
      return o;
    }));
    if (modele !== null && modeles.some(m => m.id === modele)) this.modele.value = modele;
    this.choisirAdversaires(MenuModes.ADVERSAIRES.includes(adversaires) ? adversaires : 'classiques');
    this.choisir(MenuModes.MODES.some(m => m.id === mode) ? mode : 'solo');
    if (profil !== null && Object.hasOwn(Circuit.PROFILS, profil)) this.circuit.value = profil;
    if (tours !== null) this.tours.value = String(Math.max(1, Math.min(MenuModes.TOURS_MAX, Math.round(tours))));
    this.choisirAmbiance(MenuModes.AMBIANCES.includes(ambiance) ? ambiance : 'jour');
    DomF1.cacher(this.racine, false);
  }

  fermer() {
    DomF1.cacher(this.racine, true);
  }

  // La carte choisie ; en championnat, le circuit vient de la manche (le menu est grisé).
  choisir(mode) {
    this.mode = mode;
    for (const [id, carte] of Object.entries(this.cartes)) {
      DomF1.classe(carte, 'choisie', id === mode);
      carte.setAttribute('aria-pressed', String(id === mode));
    }
    this.circuit.disabled = mode === 'championnat';
  }

  choisirAmbiance(ambiance) {
    this.ambiance = ambiance;
    for (const [id, b] of Object.entries(this.ambiances)) DomF1.classe(b, 'on', id === ambiance);
  }

  // Classiques ou IA entraînée ; la liste des modèles ne sert qu'avec l'IA.
  choisirAdversaires(adversaires) {
    this.adversaires = adversaires;
    for (const [id, b] of Object.entries(this.boutonsAdversaires)) DomF1.classe(b, 'on', id === adversaires);
    this.modele.disabled = adversaires !== 'ia';
  }

  // ← → : carte précédente ou suivante, en boucle.
  deplacer(sens) {
    const ids = MenuModes.MODES.map(m => m.id);
    this.choisir(ids[(ids.indexOf(this.mode) + sens + ids.length) % ids.length]);
  }

  // Ce que Lancer demande : { mode, profil, tours, ambiance, adversaires, modele }.
  options() {
    return { mode: this.mode, profil: this.circuit.value, tours: Number(this.tours.value), ambiance: this.ambiance,
      adversaires: this.adversaires, modele: this.modele.value || null };
  }

  // Une touche quand le menu est ouvert. Toutes sont prises (le menu est seul à l'écran).
  touche(k) {
    if (k === 'arrowleft' || k === 'arrowup') this.deplacer(-1);
    else if (k === 'arrowright' || k === 'arrowdown') this.deplacer(1);
    else if (k === 'enter' && this.actions.lancer) this.actions.lancer(this.options());
    else if (k === 'escape' && this.actions.annuler) this.actions.annuler();
    return true;
  }

  // jouerVisible : aucune partie en cours et le menu fermé ; panneauOuvert : le bouton et le menu
  // se décalent à gauche du panneau (qui passe au-dessus de l'interface).
  mettreAJour({ jouerVisible = false, panneauOuvert = false } = {}) {
    DomF1.cacher(this.jouer, !jouerVisible);
    DomF1.classe(this.jouer, 'panneau-ouvert', panneauOuvert);
    DomF1.classe(this.racine, 'panneau-ouvert', panneauOuvert);
  }
}
