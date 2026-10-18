// Particule d'encre : un Vehicle qui se range sur un point du contour d'une lettre.
//
// Forces (une par comportement, toutes appliquées par applyForce) :
//   - arrive vers son point cible : elle freine dans la zone de freinage et s'arrête dessus ;
//   - flee du curseur de souris quand il est à moins de son rayon de répulsion ;
//   - répulsion de chaque perturbation voisine (clic) ;
//   - sans point cible, ou détachée (effacement du mot) : wander + garderDansFenetre.
//
// États : 'fraiche' (encre pas encore fixée, terne), 'fixee' (allumée par la plume) et 'mangee'
// (retirée de la scène par un mangeur). Une particule fixée reste pilotée par les mêmes forces.
//
// Murmuration : une particule a aussi un état de vol, AU_REPOS ou EN_VOL. Libérée, elle passe
// EN_VOL : elle reste à sa place, immobile et invisible, pendant qu'un Oiseau (voir oiseau.js)
// vole à sa place. Quand l'oiseau est revenu sur son point, elle repasse AU_REPOS. C'est
// l'option la plus simple : aucune particule n'est créée ni détruite, elle garde son point, son
// rang et son encre, et toute la logique du vol reste dans Oiseau.
class Particule extends Vehicle {
  static VOLS = { AU_REPOS: 'AU_REPOS', EN_VOL: 'EN_VOL' };
  static RAYON = 4;
  // Valeurs de départ des curseurs de l'interface (voir reglages.js).
  static VITESSE_MAX = 6;
  static FORCE_MAX = 0.4;
  static RAYON_FREINAGE = 100;
  // Poids des comportements dans la somme des forces.
  static POIDS_ARRIVEE = 1;
  static POIDS_FUITE = 2;
  static POIDS_ERRANCE = 0.5;
  // Errance d'une particule détachée de son point pendant l'effacement du mot : bien plus douce,
  // pour qu'elle reste près de sa place et que le passage au mot suivant soit fluide.
  static POIDS_DETACHEMENT = 0.15;
  static POIDS_FENETRE = 2;
  // Distance aux bords de la fenêtre en dessous de laquelle une particule libre fait demi-tour.
  static MARGE_FENETRE = 40;
  // A moins de cette distance de son point, la particule est considérée comme arrivée.
  static TOLERANCE_ARRIVEE = 8;
  // Couleur selon la vitesse : froide à l'arrêt, chaude à maxSpeed (rouge, vert, bleu).
  static COULEUR_FROIDE = [70, 150, 255];
  static COULEUR_CHAUDE = [255, 110, 40];
  static OPACITE_FRAICHE = 110;

  constructor(x, y) {
    super(x, y);
    this.r = Particule.RAYON;
    this.maxSpeed = Particule.VITESSE_MAX;
    this.maxForce = Particule.FORCE_MAX;
    this.rayonZoneDeFreinage = Particule.RAYON_FREINAGE;

    // point du mot à rejoindre (un vecteur), ou null si la particule est libre
    this.cible = null;
    // rang de ce point dans le tracé de la plume, -1 si la particule est libre
    this.rang = -1;
    this.etat = 'fraiche';
    this.vol = Particule.VOLS.AU_REPOS;

    // ce que la particule perçoit, mis à jour par applyBehaviors (sert au mode debug)
    this.fuit = false;
    this.freine = false;
  }

  get fixee() {
    return this.etat === 'fixee';
  }

  get mangee() {
    return this.etat === 'mangee';
  }

  get enVol() {
    return this.vol === Particule.VOLS.EN_VOL;
  }

  // Un oiseau va voler à sa place. Renvoie false si elle ne peut pas s'envoler : mangée, sans
  // point où revenir, ou déjà en vol.
  envoler() {
    if (this.mangee || this.cible === null || this.enVol) return false;
    this.vol = Particule.VOLS.EN_VOL;
    return true;
  }

  // Son oiseau est revenu : elle reprend sa place.
  poser() {
    this.vol = Particule.VOLS.AU_REPOS;
  }

  // La particule reçoit un point du mot : elle va s'y ranger.
  viser(point, rang) {
    this.cible = createVector(point.x, point.y);
    this.rang = rang;
  }

  // La particule n'a plus de point : elle erre dans la fenêtre.
  liberer() {
    this.cible = null;
    this.rang = -1;
  }

  // La plume passe : l'encre fraîche se fixe. Renvoie true si l'état vient de changer. Une
  // particule sans point n'a nulle part où se fixer : elle reste fraîche.
  fixer() {
    if (this.etat !== 'fraiche' || this.cible === null) return false;
    this.etat = 'fixee';
    return true;
  }

  // Un mangeur la touche : elle est retirée de la scène.
  manger() {
    this.etat = 'mangee';
  }

  // Retour à l'encre fraîche (nouveau mot) : une particule mangée revient aussi.
  rafraichir() {
    this.etat = 'fraiche';
  }

  // Distance au point cible, Infinity si la particule est libre.
  distanceCible() {
    return this.cible ? p5.Vector.dist(this.pos, this.cible) : Infinity;
  }

  estArrivee(tolerance = Particule.TOLERANCE_ARRIVEE) {
    return this.distanceCible() <= tolerance;
  }

  // flee est vide dans Vehicle : on la redéfinit ici. C'est seek inversé : la vitesse désirée
  // s'éloigne de la cible à maxSpeed, et la force vaut vitesse désirée - vitesse actuelle,
  // limitée à maxForce. Pour ne pas recopier seek, on lui donne le point symétrique de la cible
  // par rapport à la particule : aller vers ce point, c'est s'éloigner de la cible.
  flee(cible) {
    const pointOppose = p5.Vector.sub(this.pos, cible).add(this.pos);
    return this.seek(pointOppose);
  }

  // Remplace boundaries() de Vehicle, qui a deux défauts : elle renvoie la vitesse désirée et
  // non la force, et dans un coin elle ne traite qu'un des deux bords (le véhicule sort par
  // l'autre). Ici : à moins de `marge` pixels d'un bord, la vitesse désirée repart vers
  // l'intérieur à maxSpeed sur cet axe (les deux axes dans un coin), et on renvoie la vraie force
  // de pilotage : vitesse désirée - vitesse actuelle, limitée à maxForce. Loin des bords : force
  // nulle.
  garderDansFenetre(largeur, hauteur, marge = Particule.MARGE_FENETRE) {
    const vitesseDesiree = this.vel.copy();
    let presDUnBord = false;

    if (this.pos.x < marge) {
      vitesseDesiree.x = this.maxSpeed;
      presDUnBord = true;
    } else if (this.pos.x > largeur - marge) {
      vitesseDesiree.x = -this.maxSpeed;
      presDUnBord = true;
    }

    if (this.pos.y < marge) {
      vitesseDesiree.y = this.maxSpeed;
      presDUnBord = true;
    } else if (this.pos.y > hauteur - marge) {
      vitesseDesiree.y = -this.maxSpeed;
      presDUnBord = true;
    }

    if (!presDUnBord) return createVector(0, 0);

    vitesseDesiree.setMag(this.maxSpeed);
    const force = p5.Vector.sub(vitesseDesiree, this.vel);
    force.limit(this.maxForce);
    return force;
  }

  // ETAPE 2 : pilotage. contexte = ce que la particule peut percevoir :
  //   curseur        le CurseurSouris à fuir (ou null) ;
  //   perturbations  les Perturbation en cours ;
  //   largeur, hauteur  la taille de la fenêtre ;
  //   detachee       vrai pendant l'effacement du mot : la particule lâche son point.
  applyBehaviors({ curseur = null, perturbations = [], largeur, hauteur, detachee = false }) {
    this.fuit = false;
    this.freine = false;
    // mangée, elle n'est plus là ; en vol, c'est son oiseau qui est piloté
    if (this.mangee || this.enVol) return;

    if (this.cible && !detachee) {
      // arrive avec d = 0 : la vitesse désirée va de maxSpeed (bord de la zone de freinage) à 0
      // (sur le point), jamais en dessous. La particule ne recule donc pas.
      this.freine = this.distanceCible() < this.rayonZoneDeFreinage;
      this.applyForce(this.arrive(this.cible).mult(Particule.POIDS_ARRIVEE));
    } else {
      const poidsErrance = this.cible ? Particule.POIDS_DETACHEMENT : Particule.POIDS_ERRANCE;
      this.applyForce(this.wander().mult(poidsErrance));
      this.applyForce(this.garderDansFenetre(largeur, hauteur).mult(Particule.POIDS_FENETRE));
    }

    // la particule ne perçoit le curseur que dans son rayon de répulsion
    if (curseur && p5.Vector.dist(this.pos, curseur.pos) < curseur.rayonRepulsion) {
      this.fuit = true;
      this.applyForce(this.flee(curseur.pos).mult(Particule.POIDS_FUITE));
    }

    perturbations.forEach(perturbation => {
      this.applyForce(perturbation.repousser(this));
    });
  }

  // ETAPE 3 : locomotion, celle de Vehicle. Une particule mangée ou en vol ne bouge plus.
  update() {
    if (this.mangee || this.enVol) return;
    super.update();
  }

  // Couleur selon la vitesse : [rouge, vert, bleu], de froide (à l'arrêt) à chaude (à maxSpeed).
  couleur() {
    const allure = this.maxSpeed > 0 ? Math.min(1, this.vel.mag() / this.maxSpeed) : 0;
    return Particule.COULEUR_FROIDE.map((froid, i) => {
      return froid + (Particule.COULEUR_CHAUDE[i] - froid) * allure;
    });
  }

  // Un petit disque : terne et plus petit tant que l'encre est fraîche, plein une fois fixée.
  show() {
    if (this.mangee || this.enVol) return;
    const [rouge, vert, bleu] = this.couleur();

    push();
    noStroke();
    fill(rouge, vert, bleu, this.fixee ? 255 : Particule.OPACITE_FRAICHE);
    circle(this.pos.x, this.pos.y, this.r * 2 * (this.fixee ? 1 : 0.7));
    pop();
  }

  // Aides du mode debug : le vecteur vers la cible, et pour la particule témoin sa zone de
  // freinage. Le cercle a bien pour RAYON rayonZoneDeFreinage (circle attend un diamètre) ; il
  // est jaune, et rouge quand la particule est dedans, donc en train de freiner.
  showDebug(temoin = false) {
    if (this.mangee || this.enVol || !this.cible) return;

    push();
    stroke(255, 255, 0, temoin ? 255 : 70);
    strokeWeight(temoin ? 2 : 1);
    line(this.pos.x, this.pos.y, this.cible.x, this.cible.y);
    if (temoin) {
      noFill();
      stroke(this.freine ? 'red' : 'yellow');
      circle(this.cible.x, this.cible.y, this.rayonZoneDeFreinage * 2);
    }
    pop();
  }
}
