// Compteur d'images par seconde (case « Compteur FPS » du panneau) et annonce discrète d'un
// changement automatique de qualité (voir qualiteRendu.js) : un petit cadre de la page, à droite
// de la tour de classement. Ce n'est pas un Vehicle et il ne change rien à la course. Le texte
// n'est réécrit que FREQUENCE fois par seconde, et seulement s'il change.
class CompteurImages {
  static FREQUENCE = 4;
  // Durée de l'annonce d'un changement de qualité (s).
  static DUREE_ANNONCE = 4;

  // parent : l'élément où poser le cadre (document.body) ; null : pas de cadre (calcul seul).
  constructor(parent = null) {
    this.racine = null;
    this.fps = null;
    this.message = null;
    this.annonce = null;
    this.resteAnnonce = 0;
    this.depuisEcriture = Infinity;
    if (parent !== null && typeof document !== 'undefined') {
      this.racine = document.createElement('div');
      this.racine.id = 'f1-compteur-images';
      this.racine.setAttribute('aria-live', 'polite');
      this.fps = document.createElement('span');
      this.fps.className = 'compteur-fps';
      this.message = document.createElement('span');
      this.message.className = 'compteur-annonce';
      this.racine.appendChild(this.fps);
      this.racine.appendChild(this.message);
      this.racine.hidden = true;
      parent.appendChild(this.racine);
    }
  }

  // Un changement de qualité à annoncer (pendant DUREE_ANNONCE secondes).
  annoncer(texte) {
    this.annonce = texte;
    this.resteAnnonce = CompteurImages.DUREE_ANNONCE;
    this.depuisEcriture = Infinity;
  }

  // Les textes du cadre : [images/s ou '', annonce ou ''].
  textes({ actif = false, fps = 0 } = {}) {
    return [actif ? `${Math.round(fps)} FPS` : '', this.resteAnnonce > 0 ? this.annonce : ''];
  }

  // Une image (dt en secondes) : actif = la case est cochée, fps = la mesure courante.
  mettreAJour(dt, etat = {}) {
    if (this.resteAnnonce > 0) this.resteAnnonce = Math.max(0, this.resteAnnonce - dt);
    this.depuisEcriture += dt;
    if (this.racine === null || this.depuisEcriture < 1 / CompteurImages.FREQUENCE) return;
    this.depuisEcriture = 0;
    const [fps, annonce] = this.textes(etat);
    if (this.fps.textContent !== fps) this.fps.textContent = fps;
    if (this.message.textContent !== annonce) this.message.textContent = annonce;
    const cache = fps === '' && annonce === '';
    if (this.racine.hidden !== cache) this.racine.hidden = cache;
  }
}
