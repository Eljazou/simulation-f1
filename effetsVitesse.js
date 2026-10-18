// Effets de vitesse, quand la caméra suit une voiture (suivi, embarquée, réalisation TV) : un effet
// DESSINÉ à l'écran, qui ne bouge rien. Lignes de vitesse qui filent vers les bords (plus
// nombreuses et plus longues avec la vitesse), léger flou radial (des traînées claires près des
// bords, une approximation : un vrai flou serait trop coûteux à chaque image), vignettage qui
// s'assombrit avec la vitesse, et une secousse légère de la caméra (lue par Camera).
class EffetsVitesse {
  static LIGNES = 46;
  // Part de la vitesse maximale à partir de laquelle les effets apparaissent.
  static SEUIL = 0.45;
  // Amplitude de la secousse (pixels d'écran) à pleine vitesse.
  static SECOUSSE = 1.6;
  static GRAINE = 83;

  constructor() {
    const alea = Circuit.generateur(EffetsVitesse.GRAINE);
    this.lignes = Array.from({ length: EffetsVitesse.LIGNES }, () => ({ angle: alea() * 2 * Math.PI, phase: alea(), vitesse: 0.6 + alea() * 0.8 }));
    this.horloge = 0;
    this.intensite = 0;
  }

  // Intensité (0 à 1) selon la vitesse de la voiture suivie, lissée.
  update(dt, voiture, vitesseMax) {
    this.horloge += dt;
    const vise = voiture === null ? 0 : Math.max(0, (voiture.vitesse / Math.max(0.1, vitesseMax) - EffetsVitesse.SEUIL) / (1 - EffetsVitesse.SEUIL));
    this.intensite += (Math.min(1, vise) - this.intensite) * Math.min(1, dt * 4);
  }

  // Secousse de la caméra embarquée : un petit décalage (pixels d'écran).
  secousse() {
    const a = EffetsVitesse.SECOUSSE * this.intensite;
    return { x: Math.sin(this.horloge * 47) * a, y: Math.cos(this.horloge * 53) * a };
  }

  // Lignes de vitesse et traînées, à l'écran, autour de la zone de la caméra.
  show(zone) {
    const e = this.intensite;
    if (e <= 0.02) return;
    const cx = zone.x + zone.largeur / 2;
    const cy = zone.y + zone.hauteur / 2;
    const rayon = Math.hypot(zone.largeur, zone.hauteur) / 2;
    push();
    strokeCap(ROUND);
    this.lignes.forEach(l => {
      const t = (this.horloge * l.vitesse * (1 + 2 * e) + l.phase) % 1;
      const r0 = rayon * (0.45 + 0.55 * t);
      const r1 = r0 + rayon * 0.12 * e;
      const c = Math.cos(l.angle);
      const s = Math.sin(l.angle);
      stroke(255, 255, 255, 70 * e * t);
      strokeWeight(1 + 1.5 * e);
      line(cx + c * r0, cy + s * r0, cx + c * r1, cy + s * r1);
    });
    pop();
  }
}
