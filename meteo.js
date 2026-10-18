// Météo du circuit : elle ne bouge pas, ce n'est donc pas un Vehicle. Elle fait évoluer une
// intensité de pluie (de 0 à 1), lentement, vers une valeur visée qui dépend du mode :
//   'sec'          pas de pluie (bloc pluie désactivé) ;
//   'manuel'       la valeur du curseur « intensité de pluie » ;
//   'automatique'  un programme fixe : sec, averse, orage, éclaircie (période PERIODE) ;
//   'aleatoire'    une nouvelle valeur tirée avec une graine fixe toutes les PERIODE_ALEATOIRE s.
// En découlent, en continu : l'humidité de la piste (qui suit la pluie avec retard : elle se
// mouille vite et sèche lentement), l'adhérence de la piste (de 0,5 à 1), la visibilité, et
// l'état SEC, BRUINE, PLUIE ou ORAGE (deux seuils pour entrer et sortir de chaque état, sinon il
// changerait à chaque image au voisinage d'un seuil). En ORAGE, des éclairs : un flash court,
// purement dessiné.
// Les durées sont en secondes, reçues en paramètre (update(dt)).
class Meteo {
  static ETATS = { SEC: 'SEC', BRUINE: 'BRUINE', PLUIE: 'PLUIE', ORAGE: 'ORAGE' };
  static MODES = ['sec', 'manuel', 'automatique', 'aleatoire'];
  // Valeurs de départ des réglages du panneau.
  static MODE = 'sec';
  static INTENSITE = 0.6;
  static EFFET_ADHERENCE = 1;
  // Seuils d'intensité entre SEC, BRUINE, PLUIE et ORAGE, et marge pour en sortir.
  static SEUILS = [0.12, 0.4, 0.75];
  static HYSTERESIS = 0.04;
  // Vitesse de l'intensité vers sa valeur visée, et de l'humidité vers l'intensité (par seconde).
  static VITESSE_TRANSITION = 0.08;
  static MOUILLAGE = 0.15;
  static SECHAGE = 0.025;
  // L'adhérence de la piste va de 1 (sèche) à ADHERENCE_MIN (détrempée, effet maximal).
  static ADHERENCE_MIN = 0.5;
  // Programme du mode automatique : [instant (s), intensité visée], répété toutes les PERIODE s.
  static PROGRAMME = [[0, 0], [20, 0], [35, 0.45], [70, 0.9], [100, 0.5], [125, 0], [150, 0]];
  static PERIODE = 150;
  static PERIODE_ALEATOIRE = 25;
  // Éclairs : durée du flash, intervalle tiré entre ces bornes.
  static DUREE_ECLAIR = 0.15;
  static INTERVALLE_ECLAIR_MIN = 2;
  static INTERVALLE_ECLAIR_MAX = 7;
  // Dessin : nombre de gouttes à pleine intensité.
  static GOUTTES_MAX = 260;
  // Motif des gouttes (design) : cellule de 24 × 48, défilement en 0,32 s.
  static CELLULE_GOUTTES = [24, 48];
  static PERIODE_GOUTTES = 0.32;
  static GRAINE = 77;

  // parametres = les réglages partagés (modeMeteo, intensitePluie, effetAdherence) ; alea =
  // générateur entre 0 et 1 (mode aléatoire, éclairs).
  constructor(parametres, alea = Circuit.generateur(Meteo.GRAINE)) {
    this.parametres = parametres;
    this.alea = alea;
    this.reinitialiser();
  }

  // Une nouvelle course commence : la météo repart de l'état visé par le mode, sans transition.
  reinitialiser() {
    this.chrono = 0;
    this.cibleAleatoire = 0;
    this.prochainTirage = 0;
    this.intensite = this.cibleDuMode();
    this.humidite = this.intensite;
    this.etat = Meteo.ETATS.SEC;
    this.mettreAJourEtat(true);
    this.flash = 0;
    this.prochainEclair = Meteo.INTERVALLE_ECLAIR_MIN;
  }

  get mode() {
    return this.parametres.modeMeteo ?? Meteo.MODE;
  }

  // Adhérence de la piste, entre ADHERENCE_MIN et 1 : l'humidité la fait baisser, d'autant plus
  // que l'effet réglé dans le panneau est fort.
  get adherence() {
    const effet = Math.max(0, Math.min(1, this.parametres.effetAdherence ?? 1));
    return 1 - (1 - Meteo.ADHERENCE_MIN) * Math.min(1, this.humidite * effet);
  }

  // Visibilité, entre 0,4 (orage) et 1.
  get visibilite() {
    return 1 - 0.6 * this.intensite;
  }

  // Intensité visée par le mode, à l'instant présent.
  cibleDuMode() {
    if (this.mode === 'manuel') return Math.max(0, Math.min(1, this.parametres.intensitePluie ?? Meteo.INTENSITE));
    if (this.mode === 'automatique') {
      const t = this.chrono % Meteo.PERIODE;
      const programme = Meteo.PROGRAMME;
      for (let k = 1; k < programme.length; k++) {
        const [t1, i1] = programme[k];
        const [t0, i0] = programme[k - 1];
        if (t <= t1) return i0 + (i1 - i0) * (t - t0) / (t1 - t0);
      }
      return programme.at(-1)[1];
    }
    if (this.mode === 'aleatoire') return this.cibleAleatoire;
    return 0;
  }

  // État avec hystérésis : on entre dans un état au-dessus de son seuil, on n'en sort qu'à
  // HYSTERESIS en dessous. direct = sans hystérésis (au démarrage).
  mettreAJourEtat(direct = false) {
    const noms = [Meteo.ETATS.SEC, Meteo.ETATS.BRUINE, Meteo.ETATS.PLUIE, Meteo.ETATS.ORAGE];
    const niveauPour = intensite => Meteo.SEUILS.filter(seuil => intensite >= seuil).length;
    let niveau = noms.indexOf(this.etat);
    if (direct) {
      niveau = niveauPour(this.intensite);
    } else {
      while (niveau < 3 && this.intensite >= Meteo.SEUILS[niveau]) niveau++;
      while (niveau > 0 && this.intensite < Meteo.SEUILS[niveau - 1] - Meteo.HYSTERESIS) niveau--;
    }
    this.etat = noms[niveau];
  }

  // Le temps passe : dt en secondes.
  update(dt) {
    this.chrono += dt;
    if (this.mode === 'aleatoire' && this.chrono >= this.prochainTirage) {
      this.cibleAleatoire = this.alea() < 0.4 ? 0 : this.alea();
      this.prochainTirage = this.chrono + Meteo.PERIODE_ALEATOIRE;
    }
    const cible = this.cibleDuMode();
    const pas = Meteo.VITESSE_TRANSITION * dt;
    this.intensite += Math.max(-pas, Math.min(pas, cible - this.intensite));
    const vitesse = this.intensite > this.humidite ? Meteo.MOUILLAGE : Meteo.SECHAGE;
    this.humidite += Math.max(-vitesse * dt, Math.min(vitesse * dt, this.intensite - this.humidite));
    this.mettreAJourEtat();

    // éclairs en ORAGE : un flash court, dessiné seulement
    this.flash = Math.max(0, this.flash - dt);
    if (this.etat === Meteo.ETATS.ORAGE) {
      this.prochainEclair -= dt;
      if (this.prochainEclair <= 0) {
        this.flash = Meteo.DUREE_ECLAIR;
        this.prochainEclair = Meteo.INTERVALLE_ECLAIR_MIN + this.alea() * (Meteo.INTERVALLE_ECLAIR_MAX - Meteo.INTERVALLE_ECLAIR_MIN);
      }
    }
  }

  // Ce que la barre et le HUD affichent.
  resume() {
    return { etat: this.etat, intensite: this.intensite, humidite: this.humidite, adherence: this.adherence };
  }

  // Dessin dans le repère de l'écran : ciel assombri, gouttes de pluie, éclair. Les gouttes sont
  // un dessin pur (aucun objet ne bouge) : leur position est une fonction du temps.
  // Pluie (design : fiche technique, « Gouttes » et calque 14) : teinte #162434 à 10 %, motif de
  // 24 × 48 de deux traits de 1 px (#dbe8f5, 35 % et 25 %), qui défile de (-24, +48) en 320 ms.
  // Le motif est précalculé une fois dans un p5.Graphics de 10 × 5 cellules, puis seulement
  // recopié (une quarantaine de copies par image en 1920 × 1080).
  // Le motif des gouttes : 10 × 5 cellules (créé une fois).
  motifPluie() {
    if (this.motif) return this.motif;
    const [l, h] = Meteo.CELLULE_GOUTTES;
    const g = createGraphics(l * 10, h * 5);
    g.pixelDensity(1);
    g.strokeWeight(1);
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 5; j++) {
        g.stroke(219, 232, 245, 0.35 * 255);
        g.line(i * l + 20, j * h, i * l + 12, j * h + 18);
        g.stroke(219, 232, 245, 0.25 * 255);
        g.line(i * l + 8, j * h + 26, i * l + 2, j * h + 40);
      }
    }
    this.motif = { g, largeur: l * 10, hauteur: h * 5 };
    return this.motif;
  }

  show(largeur, hauteur) {
    if (this.intensite <= 0.01 && this.flash <= 0) return;
    push();
    noStroke();
    fill(22, 36, 52, 0.1 * 255 * Math.min(1, this.intensite / 0.6));
    rect(0, 0, largeur, hauteur);
    if (this.intensite > 0.01) {
      const motif = this.motifPluie();
      const phase = (this.chrono % Meteo.PERIODE_GOUTTES) / Meteo.PERIODE_GOUTTES;
      const dx = -24 * phase;
      const dy = 48 * phase;
      // une seule opacité pour toutes les copies (sans la copie intermédiaire de tint())
      ImageAlpha.tuiles(motif.g, Math.min(1, this.intensite / 0.6), poser => {
        for (let x = -motif.largeur; x < largeur + motif.largeur; x += motif.largeur) {
          for (let y = -motif.hauteur; y < hauteur; y += motif.hauteur) poser(x + dx, y + dy, motif.largeur, motif.hauteur);
        }
      });
    }
    if (this.flash > 0) {
      noStroke();
      fill(255, 255, 255, 200 * this.flash / Meteo.DUREE_ECLAIR);
      rect(0, 0, largeur, hauteur);
    }
    pop();
  }
}
