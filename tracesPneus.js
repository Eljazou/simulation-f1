// Traces de pneus persistantes : un calque (p5.Graphics de la taille du monde) où chaque voiture
// dépose, à chaque pas, un trait léger de gomme sous ses roues arrière ; il s'assombrit au fil des
// tours, surtout sur la ligne de course et en sortie de virage (là où la voiture accélère), et des
// traînées noires marquent les glissades et les blocages. Ce n'est pas une entité : il ne bouge
// rien. Il dépose aussi la gomme dans la carte des surfaces (plus de gomme sur la trajectoire =
// un peu plus d'adhérence, voir CarteSurfaces.bonusGomme).
class TracesPneus {
  // Opacité d'un trait (sur 255) : roulage normal, sortie de virage (accélération), glissade.
  static OPACITE = 5;
  static OPACITE_SORTIE = 12;
  static OPACITE_GLISSE = 45;
  // Résolution du calque (pixels par pixel du monde).
  static FACTEUR = 1;

  // circuit = le Circuit ; surfaces = sa CarteSurfaces (gomme), ou null.
  constructor(circuit, surfaces = null) {
    this.circuit = circuit;
    this.surfaces = surfaces;
    this.calque = null;
    this.precedentes = new Map();
    this.traits = 0;
  }

  preparer() {
    if (this.calque !== null) return;
    const c = this.circuit;
    this.calque = createGraphics(Math.ceil(c.largeurMonde * TracesPneus.FACTEUR), Math.ceil(c.hauteurMonde * TracesPneus.FACTEUR));
    this.calque.pixelDensity(1);
    this.calque.scale(TracesPneus.FACTEUR);
  }

  // Nouvelle course : piste propre.
  effacer() {
    if (this.calque !== null && typeof this.calque.clear === 'function') this.calque.clear();
    this.precedentes.clear();
    this.traits = 0;
  }

  // Positions des deux roues arrière d'une voiture (selon le cap de la carrosserie).
  static rouesArriere(voiture) {
    const cap = voiture.glisseActive ? voiture.capCarrosserie : voiture.cap;
    const recul = VoitureF1.LONGUEUR * 0.36;
    const ecart = VoitureF1.LARGEUR * 0.45;
    const t = { x: Math.cos(cap), y: Math.sin(cap) };
    const n = { x: -t.y, y: t.x };
    return [-1, 1].map(s => ({ x: voiture.pos.x - t.x * recul + n.x * s * ecart, y: voiture.pos.y - t.y * recul + n.y * s * ecart }));
  }

  // Un pas : chaque voiture en piste laisse sa trace (et sa gomme). dessiner = false : seulement
  // la gomme (sans calque : tests, ou option d'affichage décochée).
  deposer(voitures, dessiner = true) {
    if (dessiner) this.preparer();
    for (const v of voitures) {
      if (v.auStand || v.horsCourse || v.vitesse < 0.8 || v.etat === VoitureF1.ETATS.GRILLE) {
        this.precedentes.delete(v);
        continue;
      }
      if (this.surfaces !== null && v.surface === 'asphalte') this.surfaces.deposer(v.indicePiste, v.ecartLateral);
      const roues = TracesPneus.rouesArriere(v);
      const avant = this.precedentes.get(v);
      this.precedentes.set(v, roues);
      if (!dessiner || avant === undefined) continue;
      const virage = v.virageCourant();
      const sortie = virage !== null && this.circuit.dansIntervalle(v.indicePiste, virage.apex, virage.fin) && v.etatPneus.demande.long > 0;
      const opacite = v.glisseVisible ? TracesPneus.OPACITE_GLISSE : sortie ? TracesPneus.OPACITE_SORTIE : TracesPneus.OPACITE;
      const g = this.calque;
      g.stroke(12, 12, 14, opacite);
      g.strokeWeight(v.glisseVisible ? 2.4 : 1.8);
      roues.forEach((r, k) => g.line(avant[k].x, avant[k].y, r.x, r.y));
      this.traits++;
    }
  }

  show() {
    if (this.calque !== null) image(this.calque, 0, 0, this.circuit.largeurMonde, this.circuit.hauteurMonde);
  }
}
