// Ambiance du circuit : jour, crépuscule, nuit (ou cycle), et la qualité du rendu. Elle ne bouge
// rien (ce n'est pas un Vehicle) : c'est un calque de lumière. Tout ce qui coûte cher est
// PRÉCALCULÉ une fois dans des p5.Graphics, puis seulement copié à chaque image :
//   - les lumières fixes du circuit (cônes des projecteurs le long de la piste, éclairage des
//     stands et des tribunes), en dégradés radiaux, dessinées en mode additif (ADD) ;
//   - deux « tampons » : le cône des phares et le halo d'un feu, tournés pour chaque voiture ;
//   - le grain (bruit fixe), la lumière globale et le vignettage (un par thème).
// À chaque image : un voile sombre (bleu nuit, ou orangé au crépuscule) sur le monde, puis les
// lumières en ADD, leur reflet allongé sur la piste mouillée, les phares et les feux des voitures.
// Étoiles discrètes dans le ciel, autour du monde.
class Ambiance {
  static MOMENTS = ['jour', 'crepuscule', 'nuit', 'cycle'];
  static QUALITES = ['bas', 'moyen', 'eleve'];
  // Valeurs de départ du panneau : moment, durée d'un cycle complet (secondes), qualité.
  static MOMENT = 'jour';
  static DUREE_CYCLE = 120;
  static QUALITE = 'moyen';
  // Obscurité (0 : plein jour, 1 : nuit) de chaque moment fixe.
  static OBSCURITE = { jour: 0, crepuscule: 0.5, nuit: 0.88 };
  // Projecteurs (design : fiche technique, « Nuit ») : 14 halos de rayon 190 px sur l'axe de la
  // piste (#fff2d2 à 34 % -> 0), mâts de Ø 7 à ±118 px de l'axe.
  static PROJECTEURS = 14;
  static PORTEE_PROJECTEUR = 190;
  static MATS = 118;
  static ETOILES = 140;
  // Lumière globale par thème (design) : opacité du blanc en haut, du noir en bas, vignettage.
  static LUMIERE = { jour: { haut: 0.06, bas: 0.14, vignette: 0.5 }, nuit: { haut: 0, bas: 0.2, vignette: 0.65 }, pluie: { haut: 0.02, bas: 0.18, vignette: 0.55 } };
  static GRAINE = 61;

  constructor() {
    this.horloge = 0;
    this.lumieres = new Map();
    this.tampons = null;
    this.grain = null;
    this.vignette = null;
    const alea = Circuit.generateur(Ambiance.GRAINE);
    this.etoiles = Array.from({ length: Ambiance.ETOILES }, () => [alea(), alea(), 0.5 + alea() * 1.5, alea()]);
  }

  // Obscurité du moment (0 à 1). Le cycle passe par jour, crépuscule, nuit, aube.
  obscurite(moment) {
    if (moment !== 'cycle') return Ambiance.OBSCURITE[moment] ?? 0;
    const t = (this.horloge % Ambiance.DUREE_CYCLE) / Ambiance.DUREE_CYCLE;
    return Math.max(0, Math.min(1, 0.5 - 0.5 * Math.cos(2 * Math.PI * t))) * Ambiance.OBSCURITE.nuit;
  }

  // Teinte du voile : bleu nuit, orangée au crépuscule (obscurité moyenne).
  static voile(obscurite) {
    const crepuscule = Math.max(0, 1 - Math.abs(obscurite - 0.45) / 0.3);
    return [Math.round(10 + 60 * crepuscule), Math.round(14 + 10 * crepuscule), Math.round(40 - 10 * crepuscule)];
  }

  update(dt, dureeCycle = Ambiance.DUREE_CYCLE) {
    this.horloge += dt * Ambiance.DUREE_CYCLE / Math.max(10, dureeCycle);
  }

  // Dégradé radial (lumière qui s'éteint vers le bord) sur un graphique, s'il a un vrai contexte.
  // arrets : arrêts intermédiaires [position, [r, v, b], intensité].
  static halo(g, x, y, rayon, [r, v, b], intensite = 1, arrets = []) {
    const ctx = g.drawingContext;
    if (ctx && typeof ctx.createRadialGradient === 'function') {
      const d = ctx.createRadialGradient(x, y, 0, x, y, rayon);
      d.addColorStop(0, `rgba(${r},${v},${b},${intensite})`);
      arrets.forEach(([t, [r2, v2, b2], a]) => d.addColorStop(t, `rgba(${r2},${v2},${b2},${a})`));
      d.addColorStop(1, `rgba(${r},${v},${b},0)`);
      ctx.fillStyle = d;
      g.circle(x, y, rayon * 2);
    } else {
      g.fill(r, v, b, 120 * intensite);
      g.circle(x, y, rayon * 2);
    }
  }

  // Les lumières fixes d'un circuit (précalculées une fois par circuit et par résolution).
  lumieresDe(circuit, decor, facteur = 0.5) {
    const cle = `${circuit.profil}|${facteur}`;
    if (this.lumieres.has(cle)) return this.lumieres.get(cle);
    const g = createGraphics(Math.ceil(circuit.largeurMonde * facteur), Math.ceil(circuit.hauteurMonde * facteur));
    g.pixelDensity(1);
    g.scale(facteur);
    g.noStroke();
    const demi = circuit.largeur / 2;
    // projecteurs : un halo sur l'axe tous les 1/14 de tour, le mât alterné d'un côté à l'autre
    for (let k = 0; k < Ambiance.PROJECTEURS; k++) {
      const i = Math.round(k * circuit.n / Ambiance.PROJECTEURS + 60 / circuit.pas);
      const centre = circuit.points[circuit.indice(i)];
      const pied = circuit.pointLateral(circuit.indice(i), (k % 2 ? 1 : -1) * Ambiance.MATS);
      Ambiance.halo(g, centre.x, centre.y, Ambiance.PORTEE_PROJECTEUR, [255, 242, 210], 0.34, [[0.6, [255, 233, 184], 0.12]]);
      Ambiance.halo(g, pied.x, pied.y, 9, [255, 243, 214], 0.35);
      g.fill(255, 250, 240);
      g.circle(pied.x, pied.y, 7);
    }
    // stands : une rangée de lumière blanche le long de la voie
    circuit.stands.points.forEach((p, k) => {
      if (k % 4 === 0) Ambiance.halo(g, p.x, p.y, 40, [235, 240, 255], 0.35);
    });
    // tribunes : éclairées
    (decor ? decor.tribunes : []).forEach(t => {
      const p = circuit.pointLateral(t.debut + t.longueur / 2, t.cote * (demi + DecorCircuit.distanceSpectateur(0.5)));
      Ambiance.halo(g, p.x, p.y, 90, [255, 220, 170], 0.45);
    });
    this.lumieres.set(cle, g);
    return g;
  }

  // Le reflet des lumières sur la piste mouillée : le calque des lumières teinté en bleu
  // (200, 210, 255), une fois par calque ; seule son opacité change ensuite. largeur, hauteur :
  // la taille en pixels du calque des lumières.
  refletDe(lumieres, largeur, hauteur) {
    this.reflets ??= new Map();
    if (this.reflets.has(lumieres)) return this.reflets.get(lumieres);
    const g = createGraphics(largeur, hauteur);
    g.pixelDensity(1);
    g.tint(200, 210, 255);
    g.image(lumieres, 0, 0, largeur, hauteur);
    g.noTint();
    this.reflets.set(lumieres, g);
    return g;
  }

  // Tampons de lumière tournés pour chaque voiture (design : « Phares : cône 134 × 96 px devant le
  // nez, #fff8e6 55 % -> 0 » ; « Freinage : halo rouge r 26 flou 9 à 55 % ») ; en unités design.
  preparerTampons() {
    if (this.tampons !== null) return;
    const phares = createGraphics(134, 96);
    phares.pixelDensity(1);
    phares.noStroke();
    const ctx = phares.drawingContext;
    if (ctx && typeof ctx.createLinearGradient === 'function') {
      const d = ctx.createLinearGradient(0, 0, 134, 0);
      d.addColorStop(0, 'rgba(255,248,230,0.55)');
      d.addColorStop(1, 'rgba(255,248,230,0)');
      ctx.fillStyle = d;
    } else {
      phares.fill(255, 248, 230, 70);
    }
    phares.quad(0, 42, 134, 0, 134, 96, 0, 54);
    const feu = createGraphics(80, 80);
    feu.pixelDensity(1);
    feu.noStroke();
    Ambiance.halo(feu, 40, 40, 40, [255, 42, 31], 0.55);
    this.tampons = { phares, feu };
  }

  // Grain fixe et vignette (écran), précalculés à la taille de l'écran.
  preparerEcran(largeur, hauteur) {
    const cle = `${largeur}x${hauteur}`;
    if (this.cleEcran === cle) return;
    this.cleEcran = cle;
    const alea = Circuit.generateur(Ambiance.GRAINE + 1);
    this.grain = createGraphics(256, 256);
    this.grain.pixelDensity(1);
    this.grain.noStroke();
    for (let k = 0; k < 2200; k++) {
      this.grain.fill(alea() < 0.5 ? 255 : 0, 40);
      this.grain.rect(alea() * 256, alea() * 256, 1, 1);
    }
    for (const g of (this.lumiereEcran ?? new Map()).values()) if (g.remove) g.remove();
    this.lumiereEcran = new Map();
  }

  // Lumière globale et vignettage (design : calque 20), par thème : dégradé en diagonale (blanc
  // haut -> noir bas), puis vignettage radial de 62 % à 100 %. Précalculé au quart de l'écran.
  lumiereDe(largeur, hauteur, theme) {
    this.preparerEcran(largeur, hauteur);
    if (this.lumiereEcran.has(theme)) return this.lumiereEcran.get(theme);
    const { haut, bas, vignette } = Ambiance.LUMIERE[theme] ?? Ambiance.LUMIERE.jour;
    const w = Math.max(1, Math.round(largeur / 4));
    const h = Math.max(1, Math.round(hauteur / 4));
    const g = createGraphics(w, h);
    g.pixelDensity(1);
    g.noStroke();
    const ctx = g.drawingContext;
    if (ctx && typeof ctx.createRadialGradient === 'function') {
      const d = ctx.createLinearGradient(0, 0, w, h);
      d.addColorStop(0, `rgba(255,255,255,${haut})`);
      d.addColorStop(1, `rgba(0,0,0,${bas})`);
      ctx.fillStyle = d;
      ctx.fillRect(0, 0, w, h);
      // vignettage elliptique (rayon 72 % de chaque dimension)
      ctx.save();
      ctx.scale(1, h / w);
      const r = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, 0.72 * w);
      r.addColorStop(0.62, 'rgba(0,0,0,0)');
      r.addColorStop(1, `rgba(0,0,0,${vignette})`);
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, w, w);
      ctx.restore();
    }
    this.lumiereEcran.set(theme, g);
    return g;
  }

  // Ciel : étoiles discrètes (écran), sous le monde, la nuit.
  showCiel(largeur, hauteur, moment) {
    const o = this.obscurite(moment);
    if (o < 0.4) return;
    push();
    noStroke();
    this.etoiles.forEach(([x, y, r, scintille]) => {
      fill(230, 235, 255, 200 * (o - 0.4) * (0.6 + 0.4 * Math.sin(this.horloge * 2 + scintille * 9)));
      circle(x * largeur, y * hauteur, r);
    });
    pop();
  }

  // Dans le repère du monde (caméra appliquée) : voile, lumières fixes et leur reflet sur la piste
  // mouillée, phares et feux des voitures. course = la Course ; decor = son décor.
  // voile : part du voile sombre (1 sans palette de nuit ; 0 quand le décor est dessiné avec sa
  // palette de nuit, déjà teintée).
  showMonde(course, decor, moment, qualite, { voile = 1 } = {}) {
    const o = this.obscurite(moment);
    if (o <= 0.01) return;
    const c = course.circuit;
    push();
    noStroke();
    if (voile > 0) {
      fill(...Ambiance.voile(o), 215 * o * voile);
      rect(0, 0, c.largeurMonde, c.hauteurMonde);
    }
    blendMode(SCREEN);
    const facteur = qualite === 'eleve' ? 0.75 : 0.5;
    const lumieres = this.lumieresDe(c, decor, facteur);
    // les opacités passent par ImageAlpha : tint() recopierait chaque fois le calque entier
    ImageAlpha.dessiner(lumieres, o, 0, 0, c.largeurMonde, c.hauteurMonde);
    // bloom discret (qualité élevée) : les lumières une seconde fois, plus larges et plus douces
    if (qualite === 'eleve') ImageAlpha.dessiner(lumieres, 70 * o / 255, -12, -12, c.largeurMonde + 24, c.hauteurMonde + 24);
    // reflet sur la piste mouillée : les lumières bleutées (teinte précalculée), étirées vers le
    // bas, plus faibles
    const humidite = course.meteo.humidite;
    if (humidite > 0.15) ImageAlpha.dessiner(this.refletDe(lumieres, Math.ceil(c.largeurMonde * facteur), Math.ceil(c.hauteurMonde * facteur)), 110 * o * humidite / 255, 0, 10, c.largeurMonde, c.hauteurMonde + 30);
    this.preparerTampons();
    // les tampons sont en unités design (voiture de 77,5) : à l'échelle de la voiture
    const k = VoitureF1.LONGUEUR / 77.5;
    for (const v of course.voitures) {
      if (v.horsCourse && v.etat !== VoitureF1.ETATS.ACCIDENT) continue;
      const cap = v.glisseActive ? v.capCarrosserie : v.cap;
      push();
      translate(v.pos.x, v.pos.y);
      rotate(cap);
      scale(k);
      ImageAlpha.dessiner(this.tampons.phares, o, 36, -48, 134, 96);
      if (v.freine) ImageAlpha.dessiner(this.tampons.feu, o, -46 - 40, -40, 80, 80);
      pop();
    }
    blendMode(BLEND);
    pop();
  }

  // Écran (après le monde) : grain léger, lumière globale et vignettage du thème (qualité moyenne
  // et élevée). intensiteVignette (0 à 1) : le vignettage se renforce avec la vitesse.
  showEcran(largeur, hauteur, qualite, intensiteVignette = 0.25, theme = 'jour') {
    if (qualite === 'bas') return;
    this.preparerEcran(largeur, hauteur);
    push();
    ImageAlpha.tuiles(this.grain, (qualite === 'eleve' ? 28 : 16) / 255, poser => {
      for (let x = 0; x < largeur; x += 256) {
        for (let y = 0; y < hauteur; y += 256) poser(x, y, 256, 256);
      }
    });
    ImageAlpha.dessiner(this.lumiereDe(largeur, hauteur, theme), Math.max(0.6, Math.min(1, 0.7 + intensiteVignette * 0.5)), 0, 0, largeur, hauteur);
    pop();
  }
}
