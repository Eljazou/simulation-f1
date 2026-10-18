// Télémétrie du scénario « Circuit Formule 1 » : un panneau repliable (clic sur son en-tête) qui
// compare deux pilotes en séries temporelles : vitesse, accélérateur et frein, température des
// pneus, angle de glisse. Ce n'est pas un Vehicle : il ne fait que LIRE les voitures, à intervalle
// régulier du temps de course (horloge du chronométrage : la pause et l'accéléré sont respectés).
//
// Pilote A : la voiture choisie (clic), sinon celle du joueur, sinon le leader. Pilote B, selon le
// mode de comparaison : la voiture devant A ('devant' ; derrière si A mène), derrière ('derriere'),
// le leader ('leader' ; le deuxième si A mène) ou son coéquipier ('coequipier').
class Telemetrie {
  static COMPARAISONS = ['devant', 'derriere', 'leader', 'coequipier'];
  static COMPARAISON = 'devant';
  // Une mesure toutes les PERIODE secondes de course ; fenêtre affichée : DUREE secondes.
  static PERIODE = 0.1;
  static DUREE = 30;
  static LARGEUR_MAX = 640;
  static HAUTEUR = 150;
  static HAUTEUR_ENTETE = 22;
  // Lissage (par seconde) des commandes gaz / frein : la demande longitudinale du steering change
  // à chaque image, la courbe montre sa tendance.
  static LISSAGE = 8;
  // Les courbes : clé de la mesure, titre, bornes de l'axe (null : la vitesse maximale).
  static COURBES = [
    { cles: ['vitesse'], titre: 'Vitesse', min: 0, max: null },
    { cles: ['accelerateur', 'frein'], titre: 'Gaz / frein', min: 0, max: 1 },
    { cles: ['temperature'], titre: 'Temp. pneus', min: 40, max: 130 },
    { cles: ['derive'], titre: 'Glisse (°)', min: -40, max: 40 },
  ];

  constructor() {
    this.series = new Map();
    this.lisses = new Map();
    this.chrono = null;
    this.prochaine = 0;
    this.replie = false;
    this.entete = null;
  }

  // Une mesure d'une voiture (lue, jamais écrite).
  static mesure(voiture, temps, commandes = Telemetrie.commandes(voiture)) {
    return {
      t: temps,
      vitesse: voiture.vitesse,
      accelerateur: commandes.accelerateur,
      frein: commandes.frein,
      temperature: voiture.temperaturePneus,
      derive: voiture.derive * 180 / Math.PI,
    };
  }

  // Gaz et frein instantanés (0 à 1), d'après la demande longitudinale et le frein.
  static commandes(voiture) {
    const long = voiture.etatPneus?.demande?.long ?? 0;
    const force = Math.max(1e-6, voiture.maxForce);
    return {
      accelerateur: Math.max(0, Math.min(1, long / force)),
      frein: voiture.freine ? Math.max(0.3, Math.min(1, -long / force)) : 0,
    };
  }

  // Une image : une mesure par voiture à chaque PERIODE de temps de course ; nouvelle course : on
  // repart de zéro.
  update(course) {
    const chrono = course.chronometrage;
    if (chrono !== this.chrono) {
      this.chrono = chrono;
      this.series.clear();
      this.lisses.clear();
      this.horloge = null;
      this.prochaine = 0;
    }
    const t = chrono.horloge;
    // lissage des commandes à chaque image de course (pas seulement aux mesures)
    const dt = Math.max(0, t - (this.horloge ?? t));
    this.horloge = t;
    const k = 1 - Math.exp(-Telemetrie.LISSAGE * dt);
    for (const voiture of course.voitures) {
      const brut = Telemetrie.commandes(voiture);
      const lisse = this.lisses.get(voiture) ?? brut;
      this.lisses.set(voiture, { accelerateur: lisse.accelerateur + (brut.accelerateur - lisse.accelerateur) * k, frein: lisse.frein + (brut.frein - lisse.frein) * k });
    }
    if (!chrono.demarre || t < this.prochaine) return;
    // échéances régulières (pas de dérive d'un pas de simulation à chaque mesure) ; après un trou
    // (pause longue, accéléré), on repart de maintenant
    this.prochaine = this.prochaine + Telemetrie.PERIODE > t ? this.prochaine + Telemetrie.PERIODE : t + Telemetrie.PERIODE;
    for (const voiture of course.voitures) {
      if (!this.series.has(voiture)) this.series.set(voiture, []);
      const serie = this.series.get(voiture);
      serie.push(Telemetrie.mesure(voiture, t, this.lisses.get(voiture)));
      while (serie.length > 0 && serie[0].t < t - Telemetrie.DUREE) serie.shift();
    }
  }

  // Les deux pilotes comparés [A, B] (B peut être null : seul en piste, sans coéquipier).
  static paire(course, comparaison = Telemetrie.COMPARAISON) {
    const ordre = course.classement();
    const a = course.selection ?? course.joueur ?? ordre[0] ?? null;
    if (a === null) return [null, null];
    const rang = ordre.indexOf(a);
    let b = null;
    if (comparaison === 'devant') b = rang > 0 ? ordre[rang - 1] : ordre[1];
    else if (comparaison === 'derriere') b = ordre[rang + 1] ?? ordre[rang - 1];
    else if (comparaison === 'leader') b = rang > 0 ? ordre[0] : ordre[1];
    else if (comparaison === 'coequipier') b = course.voitures.find(v => v !== a && v.ecurie === a.ecurie);
    return [a, b ?? null];
  }

  // Clic : sur l'en-tête, le panneau se replie ou se déplie. Renvoie vrai si le clic est pris.
  clic(x, y) {
    const e = this.entete;
    if (e === null || x < e.x || x > e.x + e.largeur || y < e.y || y > e.y + e.hauteur) return false;
    this.replie = !this.replie;
    return true;
  }

  // Le panneau, en bas de la zone du circuit.
  show(course, zone, comparaison = Telemetrie.COMPARAISON) {
    const [a, b] = Telemetrie.paire(course, comparaison);
    const largeur = Math.min(Telemetrie.LARGEUR_MAX, zone.largeur - 16);
    const hauteur = this.replie ? Telemetrie.HAUTEUR_ENTETE : Telemetrie.HAUTEUR;
    const x = zone.x + 8;
    const y = zone.y + zone.hauteur - hauteur - 44;
    this.entete = { x, y, largeur, hauteur: Telemetrie.HAUTEUR_ENTETE };
    push();
    noStroke();
    fill(10, 12, 18, 215);
    rect(x, y, largeur, hauteur, 6);
    textSize(11);
    textAlign(LEFT, CENTER);
    fill(240);
    const nom = v => (v === null ? '—' : `#${v.numero} ${v.pilote.code}`);
    text(`TÉLÉMÉTRIE   ${nom(a)}  vs  ${nom(b)}`, x + 8, y + Telemetrie.HAUTEUR_ENTETE / 2);
    textAlign(RIGHT, CENTER);
    fill(170);
    text(this.replie ? '▸ déplier' : '▾ replier', x + largeur - 8, y + Telemetrie.HAUTEUR_ENTETE / 2);
    if (!this.replie && a !== null) {
      const n = Telemetrie.COURBES.length;
      const l = (largeur - 16) / n;
      Telemetrie.COURBES.forEach((courbe, k) => {
        this.showCourbe(courbe, [a, b], { x: x + 8 + k * l, y: y + Telemetrie.HAUTEUR_ENTETE + 4, largeur: l - 8, hauteur: hauteur - Telemetrie.HAUTEUR_ENTETE - 10 }, course);
      });
    }
    pop();
  }

  // Une courbe : la série de chaque pilote (A en couleur d'écurie, B en blanc, frein en rouge).
  showCourbe(courbe, voitures, cadre, course) {
    const max = courbe.max ?? course.parametres.vitesseMax * 1.1;
    noStroke();
    fill(255, 255, 255, 12);
    rect(cadre.x, cadre.y, cadre.largeur, cadre.hauteur, 3);
    fill(160);
    textSize(9);
    textAlign(LEFT, TOP);
    text(courbe.titre, cadre.x + 3, cadre.y + 2);
    const fin = this.chrono?.horloge ?? 0;
    const px = t => cadre.x + cadre.largeur * (1 - (fin - t) / Telemetrie.DUREE);
    const py = v => cadre.y + cadre.hauteur - cadre.hauteur * (Math.max(courbe.min, Math.min(max, v)) - courbe.min) / (max - courbe.min);
    noFill();
    voitures.forEach((voiture, rang) => {
      if (voiture === null) return;
      const serie = this.series.get(voiture) ?? [];
      courbe.cles.forEach(cle => {
        if (cle === 'frein') stroke(235, 60, 50, rang === 0 ? 230 : 120);
        else if (rang === 0) stroke(...voiture.ecurie.couleurs[0]);
        else stroke(235, 235, 235, 170);
        strokeWeight(rang === 0 ? 1.6 : 1);
        beginShape();
        serie.forEach(m => vertex(px(m.t), py(m[cle])));
        endShape();
      });
    });
  }
}
