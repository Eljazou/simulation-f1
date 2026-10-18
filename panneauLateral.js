// Panneau latéral à onglets (design/ « Onglet Télémétrie », « Onglets Prédiction · Historique ·
// Réglages ») : Télémétrie, Prédiction, Historique, Réglages (les sections existantes du
// circuit, repliables, avec recherche) et IA (adversaires entraînés, voir ongletIA.js). Ouvert : à droite (top 64 · right 12 · bottom 12) ; fermé :
// le rail d'onglets le remplace. Bouton de fermeture (#f1-replier), touche s, boutons du rail.
//
// Écart avec le design : le design le veut fermé par défaut ; il reste ouvert au démarrage (sur
// l'onglet Réglages) comme avant, parce que les tests existants, qui doivent rester inchangés,
// supposent un panneau ouvert au départ.
class PanneauLateral {
  static ONGLETS = ['telemetrie', 'prediction', 'historique', 'reglages', 'ia'];

  // Une requête trouve-t-elle ce texte ? Sans tenir compte de la casse ni des accents.
  static correspond(texte, requete) {
    const simple = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const q = simple(requete);
    return q === '' || simple(texte).includes(q);
  }

  // Envoie un événement à un élément de la page (vrai navigateur ou substitut des tests).
  static declencher(element, type) {
    if (typeof element.dispatchEvent === 'function' && typeof Event === 'function') element.dispatchEvent(new Event(type));
    else if (typeof element.fire === 'function') element.fire(type);
  }

  // Réglages que Réinitialiser ne touche pas : ils choisissent le jeu (mode pilote), pas un réglage.
  static HORS_REINITIALISATION = ['modePilote'];

  // actions : relancer() (nouvelle course) ; curseurs = [[clé, id]] des curseurs du panneau ;
  // cases = [[clé, id, 'reglage' | 'affichage']] ; menus, menusAffichage = [[clé, id, valeurs]] ;
  // defauts() = { reglages, affichage } : les valeurs de départ (Course.parametresParDefaut et
  // l'affichage de départ du scénario).
  constructor({ relancer = () => {}, curseurs = [], plages = {}, cases = [], menus = [], menusAffichage = [], defauts = () => ({ reglages: {}, affichage: {} }) } = {}) {
    const $ = id => document.getElementById(id);
    this.contenu = $('f1-contenu');
    this.replier = $('f1-replier');
    this.rail = $('f1-rail');
    this.reglages = $('f1-reglages');
    this.recherche = $('f1-recherche');
    this.curseurs = curseurs;
    this.plages = plages;
    this.cases = cases;
    this.menus = menus;
    this.menusAffichage = menusAffichage;
    this.defauts = defauts;
    this.onglet = 'reglages';
    this.boutons = Object.fromEntries(PanneauLateral.ONGLETS.map(o => [o, $(`f1-onglet-${o}`)]));
    this.pages = Object.fromEntries(PanneauLateral.ONGLETS.map(o => [o, $(`f1-page-${o}`)]));
    this.boutonsRail = Object.fromEntries(PanneauLateral.ONGLETS.map(o => [o, $(`f1-rail-${o}`)]));
    PanneauLateral.ONGLETS.forEach(o => {
      this.boutons[o].addEventListener('click', () => { this.choisirOnglet(o); this.boutons[o].blur(); });
      this.boutonsRail[o].addEventListener('click', () => { this.ouvrir(o); this.boutonsRail[o].blur(); });
    });
    this.recherche.addEventListener('input', () => this.filtrer(this.recherche.value));
    this.recherche.addEventListener('keydown', evenement => {
      if (evenement.key === 'Escape') {
        this.recherche.value = '';
        this.filtrer('');
        this.recherche.blur();
      }
    });
    $('f1-reinitialiser').addEventListener('click', () => { this.reinitialiser(); $('f1-reinitialiser').blur(); });
    $('f1-relancer').addEventListener('click', () => { relancer(); $('f1-relancer').blur(); });
    // remplissage rouge des curseurs (variable --v, comme la classe .rng du design)
    this.curseurs.forEach(([, id]) => {
      const c = $(id);
      c.addEventListener('input', () => PanneauLateral.remplir(c));
      PanneauLateral.remplir(c);
    });
    this.synchroniser();
  }

  static remplir(curseur) {
    const min = Number(curseur.min);
    const max = Number(curseur.max);
    const v = Number(curseur.value);
    const part = max > min && Number.isFinite(v) ? (v - min) / (max - min) : 0;
    DomF1.style(curseur, '--v', `${(Math.max(0, Math.min(1, part)) * 100).toFixed(1)}%`);
  }

  get ouvert() {
    return !this.contenu.hidden;
  }

  synchroniser() {
    const ouvert = this.ouvert;
    this.replier.textContent = ouvert ? 'Replier ▸' : 'Panneau ◂';
    DomF1.cacher(this.rail, ouvert);
    PanneauLateral.ONGLETS.forEach(o => {
      DomF1.classe(this.boutons[o], 'on', o === this.onglet);
      this.boutons[o].setAttribute('aria-selected', String(o === this.onglet));
      DomF1.cacher(this.pages[o], o !== this.onglet);
      DomF1.classe(this.boutonsRail[o], 'actif', o === this.onglet);
    });
  }

  basculer() {
    this.contenu.hidden = !this.contenu.hidden;
    this.synchroniser();
  }

  ouvrir(onglet = this.onglet) {
    this.choisirOnglet(onglet);
    this.contenu.hidden = false;
    this.synchroniser();
  }

  choisirOnglet(onglet) {
    if (!PanneauLateral.ONGLETS.includes(onglet)) throw new RangeError(`Onglet inconnu : ${onglet}.`);
    this.onglet = onglet;
    this.synchroniser();
  }

  // Recherche : seules les lignes dont le texte correspond restent ; une section sans ligne
  // trouvée disparaît, une section avec une ligne trouvée s'ouvre.
  filtrer(requete) {
    if (typeof this.reglages.querySelectorAll !== 'function') return;
    for (const section of this.reglages.querySelectorAll('details')) {
      const titre = section.querySelector ? section.querySelector('summary')?.textContent ?? '' : '';
      const lignes = [...section.querySelectorAll('.ligne, .boutons')];
      const titreTrouve = PanneauLateral.correspond(titre, requete);
      let trouvees = 0;
      for (const ligne of lignes) {
        const ok = titreTrouve || PanneauLateral.correspond(ligne.textContent, requete);
        ligne.classList.toggle('cache-recherche', !ok);
        if (ok) trouvees++;
      }
      section.classList.toggle('cache-recherche', requete.trim() !== '' && trouvees === 0);
      if (requete.trim() !== '' && trouvees > 0) section.open = true;
    }
  }

  // Réinitialiser : chaque curseur, case et liste reprend sa valeur de départ (la constante de
  // l'entité, le réglage ou l'affichage de départ), en passant par le même chemin qu'un geste de
  // l'utilisateur (validation, affichage, réglage de la course ou de l'affichage). La course n'est
  // pas relancée, sauf pour un réglage qui change la grille (voitures, écuries, pneus de départ,
  // stands spectaculaires, taille d'équipe : Course.regler). Marche dans tous les états.
  reinitialiser() {
    const $ = id => document.getElementById(id);
    this.curseurs.forEach(([cle, id]) => {
      const c = $(id);
      const initial = this.plages[cle]?.initial;
      if (!c || initial === undefined || String(c.value) === String(initial)) return;
      c.value = String(initial);
      PanneauLateral.declencher(c, 'input');
    });
    const { reglages = {}, affichage = {} } = this.defauts() ?? {};
    this.cases.forEach(([cle, id, type]) => {
      const c = $(id);
      const source = type === 'reglage' ? reglages : affichage;
      if (!c || PanneauLateral.HORS_REINITIALISATION.includes(cle) || !Object.hasOwn(source, cle)) return;
      const valeur = Boolean(source[cle]);
      if (c.checked === valeur) return;
      c.checked = valeur;
      PanneauLateral.declencher(c, 'change');
    });
    for (const [liste, source] of [[this.menus, reglages], [this.menusAffichage, affichage]]) {
      liste.forEach(([cle, id]) => {
        const m = $(id);
        if (!m || !Object.hasOwn(source, cle) || String(m.value) === String(source[cle])) return;
        m.value = String(source[cle]);
        PanneauLateral.declencher(m, 'change');
      });
    }
  }

  // Une mise à jour : seulement l'onglet visible, panneau ouvert.
  mettreAJour(miseAJourOnglet) {
    if (!this.ouvert || this.onglet === 'reglages') return;
    miseAJourOnglet(this.onglet);
  }
}
