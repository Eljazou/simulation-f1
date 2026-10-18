// Dépanneuse des commissaires : un Vehicle, piloté uniquement par des forces. Elle attend à son
// poste, au bord de la piste. Envoyée vers une voiture immobilisée (accident, panne, gravier), elle
// longe la piste par l'extérieur (seek vers des points de passage sur le bas-côté), s'approche
// (arrive), accroche la voiture, puis rentre à son poste en la remorquant (la voiture suit
// l'attelage avec arrive : voir VoitureF1.suivreLaDepanneuse). Elle ne roule jamais sur la piste.
//
// États : POSTE (arrive vers sa place), APPROCHE (seek de point en point, puis arrive près de la
// voiture), ACCROCHAGE (arrêtée à côté, DUREE_ACCROCHAGE secondes), REMORQUAGE (retour par le même
// chemin, la voiture derrière), puis POSTE.
class Commissaire extends Vehicle {
  static ETATS = { POSTE: 'POSTE', APPROCHE: 'APPROCHE', ACCROCHAGE: 'ACCROCHAGE', REMORQUAGE: 'REMORQUAGE' };
  static VITESSE_MAX = 2.6;
  static FORCE_MAX = 0.16;
  static RAYON = 9;
  // Bas-côté suivi : écart au bord de la piste (pixels) ; un point de passage tous les PAS_CHEMIN
  // points du circuit ; point atteint à moins de PASSAGE pixels.
  static DEPORT = 22;
  static PAS_CHEMIN = 3;
  static PASSAGE = 18;
  static DUREE_ACCROCHAGE = 1.5;

  // circuit = le Circuit ; poste = { indice, cote } (côté +1 / -1 de la ligne centrale).
  constructor(circuit, poste) {
    const place = circuit.pointLateral(poste.indice, poste.cote * (circuit.largeur / 2 + Commissaire.DEPORT));
    super(place.x, place.y);
    this.circuit = circuit;
    this.poste = { ...poste, x: place.x, y: place.y };
    this.r = Commissaire.RAYON;
    this.maxSpeed = Commissaire.VITESSE_MAX;
    this.maxForce = Commissaire.FORCE_MAX;
    this.etat = Commissaire.ETATS.POSTE;
    this.chrono = 0;
    this.voiture = null;
    this.chemin = [];
    this.etape = 0;
    this.cap = Math.atan2(circuit.tangentes[poste.indice].y, circuit.tangentes[poste.indice].x);
    this.cible = null;
  }

  get disponible() {
    return this.etat === Commissaire.ETATS.POSTE && this.voiture === null;
  }

  // Indices du circuit de `depart` à `arrivee`, par le plus court chemin le long de la piste.
  static cheminEntre(circuit, depart, arrivee) {
    const avant = circuit.distanceDevant(depart, arrivee) / circuit.pas;
    const arriere = circuit.distanceDevant(arrivee, depart) / circuit.pas;
    const sens = avant <= arriere ? 1 : -1;
    const longueur = Math.min(avant, arriere);
    const chemin = [];
    for (let k = Commissaire.PAS_CHEMIN; k < longueur; k += Commissaire.PAS_CHEMIN) chemin.push(circuit.indice(depart + sens * k));
    chemin.push(circuit.indice(arrivee));
    return chemin;
  }

  // Le directeur de course l'envoie vers une voiture immobilisée.
  envoyer(voiture) {
    if (!this.disponible) return false;
    this.voiture = voiture;
    this.chemin = Commissaire.cheminEntre(this.circuit, this.poste.indice, voiture.indicePiste);
    this.etape = 0;
    this.chrono = 0;
    this.etat = Commissaire.ETATS.APPROCHE;
    return true;
  }

  // Point de passage k du chemin, sur le bas-côté de son poste.
  pointDuChemin(k) {
    return this.circuit.pointLateral(this.chemin[k], this.poste.cote * (this.circuit.largeur / 2 + Commissaire.DEPORT));
  }

  // Transitions : point de passage atteint, voiture rejointe, accrochage fini, retour au poste.
  decide() {
    const { POSTE, APPROCHE, ACCROCHAGE, REMORQUAGE } = Commissaire.ETATS;
    if (this.etat === APPROCHE || this.etat === REMORQUAGE) {
      while (this.etape < this.chemin.length - 1 && p5.Vector.dist(this.pos, this.pointCourant()) < Commissaire.PASSAGE) this.etape++;
    }
    if (this.etat === APPROCHE && this.etape >= this.chemin.length - 1) {
      const d = p5.Vector.dist(this.pos, this.voiture.pos);
      if (d < this.r + this.voiture.r + 8 && this.vel.mag() < 0.4) {
        this.etat = ACCROCHAGE;
        this.chrono = 0;
      }
    } else if (this.etat === ACCROCHAGE && this.chrono >= Commissaire.DUREE_ACCROCHAGE) {
      this.voiture.remorquer(this);
      this.chemin = Commissaire.cheminEntre(this.circuit, this.voiture.indicePiste, this.poste.indice);
      this.etape = 0;
      this.etat = REMORQUAGE;
    } else if (this.etat === REMORQUAGE && this.etape >= this.chemin.length - 1 &&
      Math.hypot(this.pos.x - this.poste.x, this.pos.y - this.poste.y) < 6) {
      this.voiture.garerHorsPiste();
      this.voiture = null;
      this.etat = POSTE;
    }
  }

  pointCourant() {
    const p = this.pointDuChemin(Math.min(this.etape, this.chemin.length - 1));
    return createVector(p.x, p.y);
  }

  // Forces : arrive vers sa place (poste, accrochage), seek de point en point, arrive au bout.
  applyBehaviors() {
    const { POSTE, APPROCHE, ACCROCHAGE } = Commissaire.ETATS;
    if (this.etat === POSTE) {
      this.rayonZoneDeFreinage = 40;
      this.cible = createVector(this.poste.x, this.poste.y);
      this.applyForce(this.arrive(this.cible));
      return;
    }
    if (this.etat === ACCROCHAGE) {
      this.applyForce(this.arrive(this.pos.copy()));
      return;
    }
    const dernier = this.etape >= this.chemin.length - 1;
    if (this.etat === APPROCHE && dernier) {
      // à côté de la voiture : arrive, en gardant la place de l'attelage
      this.rayonZoneDeFreinage = 60;
      this.cible = this.voiture.pos.copy();
      this.applyForce(this.arrive(this.cible, this.r + this.voiture.r + 4));
      return;
    }
    this.cible = dernier ? createVector(this.poste.x, this.poste.y) : this.pointCourant();
    this.rayonZoneDeFreinage = dernier ? 60 : 1;
    this.applyForce(dernier ? this.arrive(this.cible) : this.seek(this.cible));
  }

  update(dt = 0) {
    this.chrono += dt;
    super.update();
    if (this.vel.mag() > 0.1) this.cap = this.vel.heading();
  }

  // Petit camion plateau orange vu de dessus, gyrophare qui clignote en intervention.
  show({ ombres = true } = {}) {
    push();
    if (ombres) {
      noStroke();
      fill(0, 0, 0, 50);
      push();
      translate(this.pos.x + 2, this.pos.y + 3);
      rotate(this.cap);
      rect(-10, -5, 20, 10, 2);
      pop();
    }
    translate(this.pos.x, this.pos.y);
    rotate(this.cap);
    noStroke();
    fill(240, 130, 20);
    rect(-10, -5, 20, 10, 2);
    fill(50, 55, 60);
    rect(-9, -4, 11, 8, 1);
    fill(220, 230, 240);
    rect(4, -4, 4, 8, 1);
    const actif = this.etat !== Commissaire.ETATS.POSTE && Math.floor(this.chrono * 4) % 2 === 0;
    fill(...(actif ? [255, 200, 0] : [120, 90, 20]));
    rect(2.5, -3, 1.5, 6);
    if (actif) {
      fill(255, 200, 0, 60);
      circle(3, 0, 18);
    }
    pop();
  }

  // Debug : son chemin et sa cible.
  showDebug() {
    if (this.etat === Commissaire.ETATS.POSTE) return;
    push();
    noFill();
    stroke(255, 160, 0, 160);
    strokeWeight(1);
    beginShape();
    for (let k = this.etape; k < this.chemin.length; k++) {
      const p = this.pointDuChemin(k);
      vertex(p.x, p.y);
    }
    endShape();
    if (this.cible) circle(this.cible.x, this.cible.y, 8);
    pop();
  }
}
