// Tour de classement (HTML, design/ « Tour de classement — états et modes ») : colonnes alignées
// (position, flèche, bande d'écurie, code, écart en chasse fixe, pastille de pneu), bascule
// « Écart leader » / « Intervalle ». Elle lit le chronométrage réaliste (classement et écarts,
// figés à l'arrivée) ; elle ne bouge rien. Un clic sur une ligne choisit la voiture (la caméra
// peut la suivre).
//
// États d'une ligne (page de design) : sélectionnée (dégradé accent, filet rouge), meilleur tour
// (chrono violet, filet violet, une seule ligne), position gagnée ou perdue (flèche pendant un
// tour après le changement), au stand (badge plein « PIT »), sortie des stands (badge contour
// « OUT » pendant un secteur), abandon (opacité 55 %, renvoyée en bas, position « — »).
class TourClassement {
  // racine = l'élément #f1-tour ; choisir(voiture) = appelée au clic sur une ligne ;
  // ecarts(mode) = appelée par les deux boutons.
  constructor(racine, { choisir = () => {}, ecarts = () => {} } = {}) {
    this.racine = racine;
    this.choisir = choisir;
    this.lignesDom = new Map();
    this.ordreAffiche = [];
    // voiture -> { sens: 1 (gagnée) | −1 (perdue), jusquAu: tours bouclés à atteindre, position }
    this.fleches = new Map();
    this.course = null;
    const $ = id => document.getElementById(id);
    this.dom = {
      numero: $('f1-tour-numero'), total: $('f1-tour-total'), temps: $('f1-tour-temps'),
      colonne: $('f1-tour-colonne'), lignes: $('f1-tour-lignes'),
      leader: $('f1-ecart-leader'), intervalle: $('f1-ecart-intervalle'),
    };
    this.dom.leader.addEventListener('click', () => { ecarts('leader'); this.dom.leader.blur(); });
    this.dom.intervalle.addEventListener('click', () => { ecarts('intervalle'); this.dom.intervalle.blur(); });
  }

  // Le tour affiché pour une course : celui du leader (1 à N), 0 avant le départ.
  static tourEnCours(course) {
    const leader = course.leader;
    if (leader === null || !course.chronometrage.demarre) return 0;
    return Math.min(course.parametres.nombreTours, Math.max(1, leader.tour + 1));
  }

  // Ce qu'affiche chaque ligne, dans l'ordre du chronométrage (abandons en bas) : données pures,
  // calculées à partir de la course seule (testées).
  static lignes(course, mode = 'leader', suivie = null) {
    const chrono = course.chronometrage;
    const ordre = course.classement();
    const ecarts = course.ecarts(mode);
    const meilleur = chrono.meilleurTour?.voiture ?? null;
    const { SORTIE } = VoitureF1.PHASES_STAND;
    const tour = TourClassement.tourEnCours(course);
    let rang = 0;
    return ordre.map(voiture => {
      const etat = chrono.etats.get(voiture);
      const abandon = chrono.abandon(voiture) || voiture.horsCourse;
      if (!abandon) rang++;
      const e = ecarts.get(voiture) ?? { texte: '', valeur: null, tours: 0 };
      let ecart;
      let statut = 'normal';
      if (abandon) {
        statut = 'abandon';
        ecart = 'ABD';
      } else if (voiture.auStand && voiture.phaseStand !== SORTIE && !voiture.arrivee) {
        statut = 'stand';
        ecart = 'PIT';
      } else if (!voiture.arrivee && ((voiture.auStand && voiture.phaseStand === SORTIE) || (etat?.tour.sortie && etat.tour.secteurs.length === 0))) {
        statut = 'sortie';
        ecart = 'OUT';
      } else if (rang === 1) {
        ecart = chrono.arrivee(voiture) !== null ? e.texte : (tour > 0 ? `Tour ${tour}` : '');
      } else if (e.valeur !== null && e.tours === 0 && chrono.arrivee(voiture) === null) {
        ecart = `+${e.valeur.toFixed(3)}`;
      } else {
        ecart = e.texte;
      }
      return {
        voiture,
        position: abandon ? '—' : String(rang),
        code: voiture.pilote.code,
        couleur: Livrees.ui(voiture.ecurie),
        ecart,
        statut,
        leader: rang === 1 && !abandon,
        meilleur: voiture === meilleur && !abandon,
        pneu: DomF1.lettrePneu(voiture.typePneus),
        choisie: voiture === suivie,
        // pénalités du joueur (incidents) : ajoutées à son temps final, montrées à côté du code
        penalite: (voiture.penalites ?? 0) > 0 ? `+${voiture.penalites} s` : '',
        // adversaire piloté par un réseau entraîné : badge « IA » et nom du modèle
        ia: voiture instanceof VoitureNeuronale ? (voiture.modele?.nom ?? 'IA entraînée') : null,
      };
    });
  }

  // Flèches : une position gagnée ou perdue reste signalée pendant un tour (jusqu'à ce que la
  // voiture boucle le tour suivant).
  suivreLesFleches(course, lignes) {
    const chrono = course.chronometrage;
    lignes.forEach(l => {
      if (l.statut === 'abandon') {
        this.fleches.delete(l.voiture);
        return;
      }
      const position = Number(l.position);
      const tours = chrono.tours(l.voiture).length;
      const memo = this.fleches.get(l.voiture);
      if (memo === undefined) {
        this.fleches.set(l.voiture, { sens: 0, jusquAu: 0, position });
        return;
      }
      if (position !== memo.position && chrono.demarre) {
        memo.sens = position < memo.position ? 1 : -1;
        memo.jusquAu = tours + 1;
        memo.position = position;
      }
      if (memo.sens !== 0 && tours >= memo.jusquAu) memo.sens = 0;
    });
  }

  // Une nouvelle course : nouvelles lignes.
  reinitialiser(course) {
    this.course = course;
    this.fleches.clear();
    this.lignesDom.clear();
    this.ordreAffiche = [];
    this.dom.lignes.replaceChildren();
    course.voitures.forEach(voiture => this.lignesDom.set(voiture, this.creerLigne(voiture)));
  }

  creerLigne(voiture) {
    const { el, svg } = DomF1;
    const ligne = el('div', 'ligne-tour pilote');
    ligne.setAttribute('role', 'button');
    ligne.setAttribute('tabindex', '0');
    const pos = el('span', 'pos');
    const fleche = el('span', 'fleche');
    const haut = svg('svg', { class: 'haut', width: 8, height: 6, viewBox: '0 0 8 6', role: 'img', 'aria-label': 'position gagnée' });
    haut.appendChild(svg('path', { d: 'M4 0 8 6H0z', fill: '#2ecc71' }));
    const bas = svg('svg', { class: 'bas', width: 8, height: 6, viewBox: '0 0 8 6', role: 'img', 'aria-label': 'position perdue' });
    bas.appendChild(svg('path', { d: 'M4 6 0 0h8z', fill: '#e74c3c' }));
    fleche.appendChild(haut);
    fleche.appendChild(bas);
    const bande = el('span', 'bande');
    bande.style.background = DomF1.rgb(Livrees.ui(voiture.ecurie));
    const nom = el('span', 'pilote-nom');
    const code = el('span', 'code', voiture.pilote.code);
    const chrono = svg('svg', { class: 'chrono-best', width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: '#9b59ff', 'stroke-width': 2.6, 'stroke-linecap': 'round', role: 'img', 'aria-label': 'meilleur tour' });
    chrono.appendChild(svg('circle', { cx: 12, cy: 13, r: 8 }));
    chrono.appendChild(svg('path', { d: 'M12 13V9M10 2h4' }));
    nom.appendChild(code);
    // adversaire « IA entraînée » : un badge IA, le nom du modèle en infobulle (fixe pour la course)
    if (voiture instanceof VoitureNeuronale) {
      const ia = el('span', 'ia-badge-ligne', 'IA');
      const modele = voiture.modele?.nom ?? 'IA entraînée';
      ia.setAttribute('title', `Piloté par le modèle « ${modele} »`);
      ia.setAttribute('aria-label', `IA, modèle ${modele}`);
      nom.appendChild(ia);
    }
    const penalite = el('span', 'penalite-badge');
    penalite.hidden = true;
    nom.appendChild(penalite);
    nom.appendChild(chrono);
    const cellule = el('span', 'ecart-cellule');
    const ecart = el('span', 'ecart');
    cellule.appendChild(ecart);
    const pneu = el('span', 'pneu M', 'M');
    for (const enfant of [pos, fleche, bande, nom, cellule, pneu]) ligne.appendChild(enfant);
    // la ligne rend ensuite le focus : les touches de conduite (Espace, Entrée...) vont au jeu
    const choisir = () => {
      this.choisir(voiture);
      if (typeof ligne.blur === 'function') ligne.blur();
    };
    ligne.addEventListener('click', choisir);
    ligne.addEventListener('keydown', evenement => { if (evenement.key === 'Enter' || evenement.key === ' ') choisir(); });
    return { ligne, pos, ecart, pneu, penalite, lettre: 'M' };
  }

  // Une mise à jour (10 Hz) : en-tête, colonnes, lignes (réordonnées si besoin).
  mettreAJour(course, { mode = 'leader', suivie = null, visible = true } = {}) {
    DomF1.cacher(this.racine, !visible);
    if (course !== this.course || course.voitures.some(v => !this.lignesDom.has(v))) this.reinitialiser(course);
    if (!visible) return;
    const { texte, classe } = DomF1;
    texte(this.dom.numero, TourClassement.tourEnCours(course));
    texte(this.dom.total, course.parametres.nombreTours);
    texte(this.dom.temps, Chronometrage.formater(course.chronometrage.tempsCourse));
    // safety car / VSC : bande du tour en jaune, badge, écarts figés en gris clair
    const neutralise = ['sc', 'vsc'].includes(course.drapeau);
    classe(this.racine, 'neutralise', neutralise);
    const badge = document.getElementById('f1-tour-neutralisation');
    if (badge) {
      DomF1.cacher(badge, !neutralise);
      if (neutralise) texte(badge, course.drapeau === 'sc' ? 'SC' : 'VSC');
    }
    texte(this.dom.colonne, mode === 'intervalle' ? 'Interv.' : 'Leader');
    classe(this.dom.leader, 'on', mode !== 'intervalle');
    classe(this.dom.intervalle, 'on', mode === 'intervalle');
    const lignes = TourClassement.lignes(course, mode, suivie);
    this.suivreLesFleches(course, lignes);
    const ordre = lignes.map(l => l.voiture);
    if (ordre.length !== this.ordreAffiche.length || ordre.some((v, k) => v !== this.ordreAffiche[k])) {
      // seules les lignes qui ne sont pas à leur place bougent (un dépassement : une ligne)
      ordre.forEach((v, k) => {
        const ligne = this.lignesDom.get(v).ligne;
        const ici = this.dom.lignes.children[k] ?? null;
        if (ici !== ligne) this.dom.lignes.insertBefore(ligne, ici);
      });
      this.ordreAffiche = ordre;
    }
    lignes.forEach(l => {
      const d = this.lignesDom.get(l.voiture);
      texte(d.pos, l.position);
      texte(d.ecart, l.ecart);
      DomF1.cacher(d.penalite, l.penalite === '');
      if (l.penalite !== '') texte(d.penalite, l.penalite);
      if (d.lettre !== l.pneu) {
        d.pneu.className = `pneu ${l.pneu}`;
        d.lettre = l.pneu;
      }
      texte(d.pneu, l.pneu);
      const fleche = this.fleches.get(l.voiture)?.sens ?? 0;
      classe(d.ligne, 'monte', fleche > 0);
      classe(d.ligne, 'descend', fleche < 0);
      classe(d.ligne, 'choisie', l.choisie);
      classe(d.ligne, 'meilleur', l.meilleur);
      classe(d.ligne, 'leader', l.leader);
      classe(d.ligne, 'stand', l.statut === 'stand');
      classe(d.ligne, 'sortie', l.statut === 'sortie');
      classe(d.ligne, 'abandon', l.statut === 'abandon');
    });
  }
}
