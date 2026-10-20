// Mécanicien d'une équipe de stand : un Vehicle, piloté uniquement par des forces (arrive vers le
// point que son équipe lui donne). Il ne décide rien seul : EquipeDeStand lui dit où aller et ce
// qu'il porte. Rôles : 'pistolet' (visse et dévisse une roue), 'retire' (emporte le pneu usé),
// 'pose' (apporte le pneu neuf), 'cric' (avant ou arrière), 'sucette' (le « lollipop » qui
// libère la voiture), 'extincteur'.
class Mecanicien extends Vehicle {
  static VITESSE_MAX = 1.8;
  static FORCE_MAX = 0.3;
  static RAYON = 2.6;
  // Zone de freinage d'arrive : il ralentit en approchant de son point.
  static FREINAGE = 18;
  // À moins de cette distance de son point, il y est.
  static EN_PLACE = 1.5;
  // Planche de sprites de leur dessin (voir planche())
  static PLANCHE = null;

  // x, y = sa place d'attente (naissance) ; role ; couleurs = celles de l'écurie (combinaison).
  constructor(x, y, role, couleurs) {
    super(x, y);
    this.r = Mecanicien.RAYON;
    this.maxSpeed = Mecanicien.VITESSE_MAX;
    this.maxForce = Mecanicien.FORCE_MAX;
    this.rayonZoneDeFreinage = Mecanicien.FREINAGE;
    this.role = role;
    this.couleurs = couleurs;
    this.cible = { x, y };
    // ce qu'il porte : null, 'neuf' ou 'ancien' (un pneu), et son orientation de dessin
    this.porte = null;
    this.cap = 0;
    this.horloge = 0;
  }

  // Son équipe lui donne un point à rejoindre.
  aller(x, y) {
    this.cible = { x, y };
  }

  get enPlace() {
    return Math.hypot(this.pos.x - this.cible.x, this.pos.y - this.cible.y) < Mecanicien.EN_PLACE;
  }

  // ARRIVE vers son point : il s'y arrête sans le dépasser.
  applyBehaviors() {
    this.applyForce(this.arrive(createVector(this.cible.x, this.cible.y)));
  }

  update(dt = 0) {
    this.horloge += dt;
    super.update();
    if (this.vel.mag() > 0.15) this.cap = this.vel.heading();
  }

  // La planche de sprites des mécaniciens (une case par apparence) : la boîte de leur dessin.
  static planche() {
    Mecanicien.PLANCHE ??= new PlancheSprites([-2.2, -3.2, 6.2, 3.2]);
    return Mecanicien.PLANCHE;
  }

  // Ce qui se voit d'un mécanicien : la clé de sa case dans la planche.
  get apparence() {
    return `${this.couleurs[0]}|${this.couleurs[1]}|${this.porte}|${this.role}`;
  }

  // Vu de dessus : épaules à la couleur de l'écurie, casque, et ce qu'il tient (dans son repère,
  // sur `d` : un graphique de la planche, ou l'écran).
  dessiner(d) {
    const [principale, secondaire] = this.couleurs;
    d.noStroke();
    d.fill(...principale);
    d.ellipse(0, 0, 3.6, 5.6);
    d.fill(...secondaire);
    d.circle(0.3, 0, 2.6);
    if (this.porte !== null) {
      // un pneu tenu devant lui (le neuf a une bande de couleur)
      d.fill(20);
      d.circle(2.8, 0, 3.4);
      if (this.porte === 'neuf') {
        d.fill(250, 210, 40);
        d.circle(2.8, 0, 1.4);
      }
    }
    if (this.role === 'sucette') {
      d.stroke(80);
      d.strokeWeight(0.5);
      d.line(0, 0, 4, 0);
      d.noStroke();
      d.fill(230, 30, 30);
      d.circle(4.6, 0, 2.6);
    }
    if (this.role === 'extincteur') {
      d.fill(220, 30, 30);
      d.rect(1.2, -0.8, 2.2, 1.6, 0.5);
    }
  }

  // À sa position, tourné selon son cap : une copie de sa case de la planche (tracée une fois par
  // apparence) ; sans vrai contexte (tests), ou planche pleine, le dessin p5.
  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.cap);
    const ctx = PlancheSprites.contexte();
    if (ctx === null || !Mecanicien.planche().copier(this.apparence, g => this.dessiner(g), 0, 0, 1, null, ctx)) this.dessiner(globalThis);
    pop();
  }
}
