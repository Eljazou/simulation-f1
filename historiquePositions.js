// Historique des positions du scénario « Circuit Formule 1 » : la position de chaque voiture au
// fil de la course (une mesure toutes les PERIODE secondes de course), en courbes aux couleurs des
// écuries ; la voiture choisie est épaissie. Une aide de lecture, pas un Vehicle.
class HistoriquePositions {
  static PERIODE = 1;
  static MESURES_MAX = 900;
  static LARGEUR = 260;
  static HAUTEUR = 150;

  constructor() {
    this.chrono = null;
    this.mesures = [];
    this.prochaine = 0;
  }

  update(course) {
    const chrono = course.chronometrage;
    if (chrono !== this.chrono) {
      this.chrono = chrono;
      this.mesures = [];
      this.prochaine = 0;
    }
    const t = chrono.horloge;
    if (!chrono.demarre || t < this.prochaine || chrono.vainqueur) return;
    // échéances régulières (pas de dérive d'un pas de simulation à chaque mesure) ; après un trou
    // (pause longue, accéléré), on repart de maintenant
    this.prochaine = this.prochaine + HistoriquePositions.PERIODE > t ? this.prochaine + HistoriquePositions.PERIODE : t + HistoriquePositions.PERIODE;
    const ordre = course.classement();
    this.mesures.push({ t, positions: new Map(ordre.map((v, k) => [v, k + 1])) });
    if (this.mesures.length > HistoriquePositions.MESURES_MAX) this.mesures.shift();
  }

  // Positions PAR TOUR, d'après les temps de passage du chronométrage (exactes) : la grille, puis
  // le classement de chaque tour bouclé (rang de la voiture parmi celles qui ont passé la ligne
  // de ce tour, par temps de passage). Renvoie { tours, positions: Map voiture -> [grille, T1, ...],
  // abandons: Map voiture -> tour de l'abandon }. Une voiture qui n'a pas bouclé un tour n'a pas de
  // valeur pour ce tour (sa ligne s'arrête).
  static parTour(course) {
    const chrono = course.chronometrage;
    const N = chrono.N;
    const positions = new Map(course.voitures.map((v, rang) => [v, [rang + 1]]));
    const abandons = new Map();
    let tours = 0;
    for (let tour = 1; tour <= course.parametres.nombreTours; tour++) {
      const passes = course.voitures
        .map(v => [v, chrono.etats.get(v).passages[tour * N]])
        .filter(([, t]) => t !== undefined)
        .sort((a, b) => a[1] - b[1]);
      if (passes.length === 0) break;
      tours = tour;
      passes.forEach(([v], k) => { positions.get(v)[tour] = k + 1; });
    }
    course.voitures.forEach(v => {
      if (chrono.abandon(v)) abandons.set(v, chrono.tours(v).length + 1);
    });
    return { tours, positions, abandons };
  }

  // Faits marquants, du plus récent au plus ancien : prise de la tête, gains d'au moins deux
  // places en un tour, dépassements de la voiture suivie, abandons. [{ tour, code, texte }]
  static faitsMarquants(course, donnees = HistoriquePositions.parTour(course), suivie = null) {
    const faits = [];
    const { tours, positions, abandons } = donnees;
    const code = v => v.pilote.code;
    for (let t = 1; t <= tours; t++) {
      const premier = t => [...positions].find(([, p]) => p[t] === 1)?.[0] ?? null;
      const tete = premier(t);
      if (tete !== null && tete !== premier(t - 1)) faits.push({ tour: t, code: code(tete), texte: 'prend la tête' });
      positions.forEach((p, v) => {
        if (p[t] === undefined || p[t - 1] === undefined) return;
        const gain = p[t - 1] - p[t];
        if (v === suivie && gain > 0) {
          const double = [...positions].find(([, q]) => q[t - 1] === p[t])?.[0];
          faits.push({ tour: t, code: code(v), texte: `${gain === 1 && double ? `dépasse ${code(double)} · ` : ''}P${p[t - 1]} → P${p[t]}` });
        } else if (gain >= 2 && v !== tete) {
          faits.push({ tour: t, code: code(v), texte: `gagne ${gain} places` });
        }
      });
    }
    abandons.forEach((t, v) => faits.push({ tour: t, code: code(v), texte: 'abandonne' }));
    return faits.sort((a, b) => b.tour - a.tour);
  }

  // Les positions d'une voiture, dans l'ordre du temps.
  positions(voiture) {
    return this.mesures.map(m => m.positions.get(voiture));
  }

  show(course, x, y) {
    const l = HistoriquePositions.LARGEUR;
    const h = HistoriquePositions.HAUTEUR;
    const n = course.voitures.length;
    push();
    noStroke();
    fill(10, 12, 18, 215);
    rect(x, y, l, h, 6);
    fill(240);
    textSize(11);
    textAlign(LEFT, CENTER);
    text('POSITIONS', x + 8, y + 11);
    const cadre = { x: x + 10, y: y + 24, largeur: l - 20, hauteur: h - 32 };
    const m = this.mesures.length;
    if (m >= 2) {
      const px = k => cadre.x + cadre.largeur * k / (m - 1);
      const py = p => cadre.y + cadre.hauteur * (p - 1) / Math.max(1, n - 1);
      noFill();
      const choisie = course.selection ?? course.joueur;
      for (const v of course.voitures) {
        if (v === choisie) continue;
        stroke(...v.ecurie.couleurs[0], 150);
        strokeWeight(1);
        this.trace(v, px, py);
      }
      if (choisie) {
        stroke(255);
        strokeWeight(2.4);
        this.trace(choisie, px, py);
      }
    }
    pop();
  }

  trace(voiture, px, py) {
    beginShape();
    this.mesures.forEach((m, k) => {
      const p = m.positions.get(voiture);
      if (p !== undefined) vertex(px(k), py(p));
    });
    endShape();
  }
}
