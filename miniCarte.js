// Mini-carte du scénario « Circuit Formule 1 » : le tracé en petit (précalculé une fois par
// circuit dans un p5.Graphics), les voitures en points aux couleurs de leur écurie, le leader
// cerclé de jaune, la voiture choisie de blanc, la voiture de sécurité en orange, les secteurs sous
// drapeau jaune en jaune. Une aide de lecture, pas un Vehicle.
class MiniCarte {
  static TAILLE = 190;
  static MARGE = 10;

  constructor() {
    this.traces = new Map();
  }

  // Échelle et décalage pour faire tenir le monde dans un carré de TAILLE pixels.
  static cadre(circuit) {
    const utile = MiniCarte.TAILLE - 2 * MiniCarte.MARGE;
    const echelle = utile / Math.max(circuit.largeurMonde, circuit.hauteurMonde);
    return {
      echelle,
      dx: MiniCarte.MARGE + (utile - circuit.largeurMonde * echelle) / 2,
      dy: MiniCarte.MARGE + (utile - circuit.hauteurMonde * echelle) / 2,
    };
  }

  // Un point du monde -> un point de la mini-carte (relatif à son coin).
  static versCarte(circuit, x, y) {
    const { echelle, dx, dy } = MiniCarte.cadre(circuit);
    return { x: dx + x * echelle, y: dy + y * echelle };
  }

  traceDe(circuit) {
    if (this.traces.has(circuit)) return this.traces.get(circuit);
    const g = createGraphics(MiniCarte.TAILLE, MiniCarte.TAILLE);
    g.noFill();
    g.strokeJoin(ROUND);
    const point = p => MiniCarte.versCarte(circuit, p.x, p.y);
    for (const [couleur, epaisseur] of [[[20, 20, 24], 6], [[150, 155, 165], 3]]) {
      g.stroke(...couleur);
      g.strokeWeight(epaisseur);
      g.beginShape();
      circuit.points.forEach(p => { const q = point(p); g.vertex(q.x, q.y); });
      g.endShape(CLOSE);
    }
    // ligne de départ
    const depart = point(circuit.points[0]);
    g.noStroke();
    g.fill(250);
    g.circle(depart.x, depart.y, 5);
    this.traces.set(circuit, g);
    return g;
  }

  show(course, x, y) {
    const c = course.circuit;
    const t = MiniCarte.TAILLE;
    push();
    noStroke();
    fill(10, 12, 18, 200);
    rect(x, y, t, t, 8);
    image(this.traceDe(c), x, y, t, t);
    // secteurs sous drapeau jaune
    const jaunes = course.incidents?.secteursJaunes ?? new Set();
    stroke(250, 210, 40);
    strokeWeight(3);
    jaunes.forEach(s => {
      const debut = c.secteurs[s];
      const longueur = (c.secteurs[(s + 1) % c.secteurs.length] - debut + c.n) % c.n || c.n;
      for (let k = 0; k < longueur; k += 2) {
        const p = c.points[(debut + k) % c.n];
        const q = c.points[(debut + Math.min(longueur, k + 2)) % c.n];
        const a = MiniCarte.versCarte(c, p.x, p.y);
        const b = MiniCarte.versCarte(c, q.x, q.y);
        line(x + a.x, y + a.y, x + b.x, y + b.y);
      }
    });
    noStroke();
    const leader = course.leader;
    const choisie = course.selection ?? course.joueur;
    const point = v => MiniCarte.versCarte(c, v.pos.x, v.pos.y);
    for (const v of course.voitures) {
      if (v.etat === VoitureF1.ETATS.ABANDON) continue;
      const p = point(v);
      fill(...v.ecurie.couleurs[0]);
      circle(x + p.x, y + p.y, 6);
    }
    noFill();
    strokeWeight(1.5);
    if (leader) {
      const p = point(leader);
      stroke(250, 210, 40);
      circle(x + p.x, y + p.y, 11);
    }
    if (choisie) {
      const p = point(choisie);
      stroke(255);
      circle(x + p.x, y + p.y, 14);
    }
    if (course.safetyCar?.enPiste) {
      const p = point(course.safetyCar);
      noStroke();
      fill(250, 150, 20);
      rect(x + p.x - 3, y + p.y - 3, 6, 6);
    }
    pop();
  }
}
