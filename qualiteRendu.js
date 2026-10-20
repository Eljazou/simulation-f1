// Qualité du rendu (Basse, Moyenne, Haute) : ce qu'elle change ne touche que le dessin, jamais la
// course (mêmes voitures, mêmes tirages, mêmes résultats). Ce n'est pas un Vehicle.
//   densite(qualite, ratio, largeur, hauteur)  la densité de pixels du canvas : celle de l'écran
//     (devicePixelRatio), plafonnée par la qualité (DENSITE_MAX) et pour que le canvas ne dépasse
//     pas LARGEUR_MAX × HAUTEUR_MAX pixels réels. p5 1.7 prend sinon Math.ceil(devicePixelRatio) :
//     2 sur un écran réglé à 125 %, soit quatre fois plus de pixels à remplir à chaque image.
//   observer(dt, qualite)  détection automatique : si les images/s restent sous SEUIL_FPS pendant
//     DUREE_SOUS_SEUIL secondes, la qualité inférieure est proposée (jamais la supérieure : pas
//     d'aller-retour). dt = durée réelle de l'image en secondes.
//   fps  les images/s mesurées (moyenne sur la dernière tranche de TRANCHE secondes).
class QualiteRendu {
  // Du plus léger au plus beau (mêmes valeurs que Ambiance.QUALITES).
  static NIVEAUX = ['bas', 'moyen', 'eleve'];
  static LIBELLES = { bas: 'Basse', moyen: 'Moyenne', eleve: 'Haute' };
  static DENSITE_MAX = { bas: 1, moyen: 1, eleve: 1.5 };
  static DENSITE_MIN = 0.5;
  static LARGEUR_MAX = 1920;
  static HAUTEUR_MAX = 1080;
  // Détection automatique : seuil, durée sous le seuil, tranche de mesure (s).
  static SEUIL_FPS = 40;
  static DUREE_SOUS_SEUIL = 3;
  static TRANCHE = 0.5;
  // Au-delà, l'image n'est pas lente : l'onglet était caché ou la page en attente (la mesure repart).
  static INTERRUPTION = 0.5;
  // Secondes ignorées au démarrage et après un changement de qualité (premières images lentes :
  // shaders du GPU, décor préparé, canvas recréé).
  static DEMARRAGE = 5;

  // Densité de pixels du canvas pour cette qualité (au centième, vers le bas).
  static densite(qualite, ratio = 1, largeur = QualiteRendu.LARGEUR_MAX, hauteur = QualiteRendu.HAUTEUR_MAX) {
    const plafond = QualiteRendu.DENSITE_MAX[qualite] ?? 1;
    const ecran = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    const taille = Math.min(QualiteRendu.LARGEUR_MAX / Math.max(1, largeur), QualiteRendu.HAUTEUR_MAX / Math.max(1, hauteur));
    const d = Math.min(plafond, ecran, taille);
    return Math.max(QualiteRendu.DENSITE_MIN, Math.floor(d * 100 + 1e-9) / 100);
  }

  // La qualité juste en dessous (null : déjà la plus basse).
  static inferieure(qualite) {
    const k = QualiteRendu.NIVEAUX.indexOf(qualite);
    return k > 0 ? QualiteRendu.NIVEAUX[k - 1] : null;
  }

  constructor() {
    this.fps = 0;
    this.reinitialiser();
  }

  // La mesure repart de zéro (démarrage, changement de qualité, interruption).
  reinitialiser(attente = QualiteRendu.DEMARRAGE) {
    this.tranche = 0;
    this.images = 0;
    this.sousSeuil = 0;
    this.attente = Math.max(this.attente ?? 0, attente);
  }

  // Une image de durée dt (s). Renvoie la qualité à prendre, ou null.
  observer(dt, qualite) {
    if (!(dt > 0)) return null;
    if (dt > QualiteRendu.INTERRUPTION) {
      this.reinitialiser(0);
      return null;
    }
    this.tranche += dt;
    this.images++;
    if (this.attente > 0) {
      // les images/s sont affichées, mais ne décident encore de rien
      this.attente = Math.max(0, this.attente - dt);
      if (this.tranche >= QualiteRendu.TRANCHE) {
        this.fps = this.images / this.tranche;
        this.tranche = 0;
        this.images = 0;
      }
      return null;
    }
    if (this.tranche < QualiteRendu.TRANCHE) return null;
    this.fps = this.images / this.tranche;
    this.sousSeuil = this.fps < QualiteRendu.SEUIL_FPS ? this.sousSeuil + this.tranche : 0;
    this.tranche = 0;
    this.images = 0;
    if (this.sousSeuil < QualiteRendu.DUREE_SOUS_SEUIL - 1e-9) return null;
    const inferieure = QualiteRendu.inferieure(qualite);
    this.reinitialiser();
    return inferieure;
  }
}
