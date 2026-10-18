// Circuit : la piste du scénario « Circuit Formule 1 ». Il ne bouge pas, ce n'est donc pas un
// Vehicle. Tout est calculé une fois, à la construction, dans les coordonnées du MONDE
// (LARGEUR_MONDE × HAUTEUR_MONDE) : la caméra met ensuite ce monde à l'échelle de la fenêtre.
//
// Construction :
//   1. points de contrôle du profil choisi, légèrement déplacés par une graine fixe (le même
//      profil et la même graine donnent toujours la même piste) ;
//   2. spline de Catmull-Rom FERMÉE (centripète : pas de boucle parasite), puis rééchantillonnée
//      pour avoir des points espacés de PAS pixels : la ligne centrale ;
//   3. en chaque point : tangente, normale, courbure signée ;
//   4. ligne de course idéale, par relaxation : chaque point est tiré vers le milieu de ses
//      voisins (cela réduit la courbure) sans sortir du couloir de la piste. Les apex se
//      retrouvent à la corde, l'entrée et la sortie à l'extérieur ;
//   5. virages (zones de forte courbure de la ligne de course) et leur apex, secteurs, zones DRS,
//      voie des stands, boxes, grille de départ.
// Le profil de vitesse dépend de la voiture (vitesse et force) : profilVitesse() le calcule.
class Circuit {
  static LARGEUR_MONDE = 1800;
  static HAUTEUR_MONDE = 1100;
  // Largeur de la piste, et espacement des points de la ligne centrale, en pixels du monde.
  static LARGEUR_PISTE = 100;
  // Noms FICTIFS des circuits (affichés sur la mini-carte et la passerelle).
  static NOMS = { classique: 'Valmora', rapide: 'Orsana', technique: 'Castelbrune' };
  // Échelle des distances affichées (fiche technique du design : 4,82 km pour 4 330 px).
  static METRES_PAR_PX = 4820 / 4330;
  static PAS = 8;
  // Déplacement maximal des points de contrôle tiré avec la graine.
  static JITTER = 14;
  static GRAINE = 2026;
  // Ligne de course : nombre d'itérations de relaxation (dont les premières en « fil tendu »), et
  // marge gardée au bord de la piste.
  static ITERATIONS_LIGNE = 2500;
  static ITERATIONS_FIL_TENDU = 600;
  static MARGE_LIGNE = 18;
  // Un virage commence quand la courbure de la ligne de course dépasse ce seuil (1 / rayon).
  static COURBURE_VIRAGE = 1 / 450;
  // Une zone DRS : une ligne droite d'au moins cette longueur ; la zone commence et finit à
  // DRS_MARGE pixels de ses extrémités.
  static LONGUEUR_DRS = 500;
  static DRS_MARGE = 90;
  // Voie des stands : écart à la ligne centrale, longueur des bretelles, écart des boxes à la
  // voie, espacement des boxes (au moins deux rayons de voiture et une marge).
  static ECART_STANDS = 92;
  static RAMPE_STANDS = 160;
  static ECART_BOX = 38;
  static ESPACEMENT_BOX = 44;
  static ESPACEMENT_BOX_MIN = 32;
  // Grille : distance du premier emplacement à la ligne d'arrivée, recul entre deux places,
  // décalage latéral de chaque colonne.
  static DEBUT_GRILLE = 30;
  // Chronométrage : nombre de points régulièrement espacés sur la ligne centrale (le point 0 est
  // la ligne d'arrivée) ; les 3 secteurs commencent aux points 0, N/3 et 2N/3.
  static POINTS_CHRONO = 60;
  static ESPACEMENT_GRILLE = 26;
  static COLONNE_GRILLE = 22;

  // Profils : des tracés INVENTÉS (aucun circuit réel) avec ce qui fait un circuit : longue ligne
  // droite des stands, épingle, enchaînements, chicane. Les points sont dans le sens de la course.
  // arrivee = point le plus proche de la ligne d'arrivée ; stands = début et fin de la voie des
  // stands, en pixels avant et après la ligne d'arrivée.
  static PROFILS = {
    classique: {
      libelle: 'Classique',
      points: [[260, 880], [700, 885], [1150, 880], [1480, 870], [1620, 800], [1640, 680], [1560, 590],
        [1420, 560], [1300, 500], [1300, 410], [1400, 330], [1560, 280], [1600, 190], [1520, 135],
        [1400, 170], [1150, 210], [880, 220], [760, 190], [690, 250], [600, 240], [440, 230],
        [300, 280], [210, 400], [200, 560], [270, 650], [250, 760], [180, 840]],
      arrivee: [900, 884],
      stands: { avant: 700, apres: 560 },
    },
    rapide: {
      libelle: 'Rapide',
      points: [[300, 900], [800, 905], [1300, 900], [1560, 870], [1660, 760], [1650, 560], [1610, 380],
        [1520, 230], [1360, 160], [1150, 170], [1010, 240], [940, 330], [860, 300], [800, 220],
        [650, 160], [430, 160], [270, 220], [200, 360], [240, 480], [180, 600], [170, 760], [200, 860]],
      arrivee: [950, 904],
      stands: { avant: 720, apres: 560 },
    },
    technique: {
      libelle: 'Technique',
      points: [[300, 890], [720, 895], [1140, 890], [1400, 880], [1530, 820], [1530, 720], [1420, 690],
        [1300, 720], [1200, 660], [1240, 560], [1400, 520], [1560, 470], [1610, 340], [1540, 230],
        [1400, 220], [1330, 320], [1220, 360], [1100, 300], [1060, 190], [930, 150], [800, 210],
        [800, 330], [700, 400], [560, 360], [500, 250], [380, 180], [250, 230], [220, 380],
        [330, 470], [330, 580], [220, 650], [190, 780], [230, 870]],
      arrivee: [880, 894],
      stands: { avant: 680, apres: 540 },
    },
  };

  // Générateur pseudo-aléatoire reproductible (congruentiel), valeurs dans [0, 1[.
  static generateur(graine) {
    let etat = graine >>> 0;
    return () => {
      etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
      return etat / 4294967296;
    };
  }

  // Spline de Catmull-Rom centripète FERMÉE passant par `controles` ([[x, y]...]) ; renvoie une
  // polyligne fine (`parSegment` points par segment), sans répéter le premier point à la fin.
  static catmullRomFermee(controles, parSegment = 40) {
    const n = controles.length;
    const sortie = [];
    const tSuivant = (t, a, b) => t + Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || t + 1e-6;
    for (let i = 0; i < n; i++) {
      const p0 = controles[(i - 1 + n) % n];
      const p1 = controles[i];
      const p2 = controles[(i + 1) % n];
      const p3 = controles[(i + 2) % n];
      const t0 = 0;
      const t1 = tSuivant(t0, p0, p1);
      const t2 = tSuivant(t1, p1, p2);
      const t3 = tSuivant(t2, p2, p3);
      for (let k = 0; k < parSegment; k++) {
        const t = t1 + (t2 - t1) * k / parSegment;
        const point = [0, 1].map(c => {
          const a1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
          const a2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
          const a3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
          const b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
          const b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
          return (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
        });
        sortie.push({ x: point[0], y: point[1] });
      }
    }
    return sortie;
  }

  // Rééchantillonne une polyligne fermée en points espacés de `pas` le long de la courbe.
  static reechantillonnerFermee(points, pas) {
    const n = points.length;
    let longueur = 0;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      longueur += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const nombre = Math.max(8, Math.round(longueur / pas));
    const ecart = longueur / nombre;
    const sortie = [];
    let segment = 0;
    let debutSegment = 0;
    let longueurSegment = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    for (let k = 0; k < nombre; k++) {
      const s = k * ecart;
      while (s > debutSegment + longueurSegment && segment < n - 1) {
        debutSegment += longueurSegment;
        segment++;
        const a = points[segment];
        const b = points[(segment + 1) % n];
        longueurSegment = Math.hypot(b.x - a.x, b.y - a.y);
      }
      const a = points[segment];
      const b = points[(segment + 1) % n];
      const t = longueurSegment > 0 ? (s - debutSegment) / longueurSegment : 0;
      sortie.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return { points: sortie, pas: ecart };
  }

  // Tangentes (unitaires), normales (tangente tournée d'un quart de tour) et courbure signée
  // d'une polyligne fermée. La courbure est mesurée sur des points distants de `portee` indices,
  // pour ne pas amplifier les petites irrégularités.
  static geometrie(points, pas, portee = 3) {
    const n = points.length;
    const tangentes = [];
    const normales = [];
    const courbures = [];
    for (let i = 0; i < n; i++) {
      const a = points[(i - 1 + n) % n];
      const b = points[(i + 1) % n];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      tangentes.push({ x: (b.x - a.x) / l, y: (b.y - a.y) / l });
      normales.push({ x: -(b.y - a.y) / l, y: (b.x - a.x) / l });
    }
    for (let i = 0; i < n; i++) {
      const avant = tangentes[(i - portee + n) % n];
      const apres = tangentes[(i + portee) % n];
      const angle = Math.atan2(avant.x * apres.y - avant.y * apres.x, avant.x * apres.x + avant.y * apres.y);
      courbures.push(angle / (2 * portee * pas));
    }
    return { tangentes, normales, courbures };
  }

  // profil = clé de PROFILS ; graine = déplacement reproductible des points de contrôle.
  constructor(profil = 'classique', graine = Circuit.GRAINE) {
    if (!Object.hasOwn(Circuit.PROFILS, profil)) throw new RangeError(`Profil de circuit inconnu : ${profil}.`);
    this.profil = profil;
    this.graine = graine;
    this.largeurMonde = Circuit.LARGEUR_MONDE;
    this.hauteurMonde = Circuit.HAUTEUR_MONDE;
    this.largeur = Circuit.LARGEUR_PISTE;
    const description = Circuit.PROFILS[profil];
    this.libelle = description.libelle;

    // 1-2. points de contrôle déplacés par la graine, spline fermée, points réguliers
    const alea = Circuit.generateur(graine);
    this.controles = description.points.map(([x, y]) => [
      x + (alea() * 2 - 1) * Circuit.JITTER,
      y + (alea() * 2 - 1) * Circuit.JITTER,
    ]);
    const fine = Circuit.catmullRomFermee(this.controles);
    const { points, pas } = Circuit.reechantillonnerFermee(fine, Circuit.PAS);
    // la ligne d'arrivée est le point 0 : on fait tourner le tableau
    const depart = Circuit.plusProche(points, description.arrivee[0], description.arrivee[1]);
    this.points = points.slice(depart).concat(points.slice(0, depart));
    this.pas = pas;
    this.n = this.points.length;
    this.longueur = this.n * this.pas;

    // 3. géométrie de la ligne centrale
    const { tangentes, normales, courbures } = Circuit.geometrie(this.points, this.pas);
    this.tangentes = tangentes;
    this.normales = normales;
    this.courbures = courbures;
    // côté extérieur du circuit (signe de la normale qui s'éloigne du centre), au départ
    const centre = this.points.reduce((somme, p) => ({ x: somme.x + p.x / this.n, y: somme.y + p.y / this.n }), { x: 0, y: 0 });
    this.exterieur = Math.sign((this.points[0].x - centre.x) * normales[0].x + (this.points[0].y - centre.y) * normales[0].y) || 1;

    // 4-5. ligne de course, virages, secteurs, DRS, stands, grille
    this.calculerLigneDeCourse();
    this.calculerVirages();
    // points de chronométrage (abscisses le long de la ligne centrale) et secteurs : les limites
    // des secteurs sont des points de chronométrage fixes ; this.secteurs en donne les indices
    const N = Circuit.POINTS_CHRONO;
    this.pointsChrono = Array.from({ length: N }, (_, k) => k * this.longueur / N);
    this.secteursChrono = [0, Math.round(N / 3), Math.round(2 * N / 3)];
    this.secteurs = this.secteursChrono.map(k => this.indice(k * this.n / N));
    this.calculerZonesDRS();
    this.calculerStands(description.stands);
    this.profils = new Map();
  }

  static plusProche(points, x, y) {
    let meilleur = 0;
    let distanceMin = Infinity;
    points.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < distanceMin) {
        distanceMin = d;
        meilleur = i;
      }
    });
    return meilleur;
  }

  // Indice ramené dans [0, n[.
  indice(i) {
    return ((Math.round(i) % this.n) + this.n) % this.n;
  }

  // Point de la ligne centrale décalé latéralement (le long de la normale) de `decalage` pixels.
  pointLateral(i, decalage) {
    const k = this.indice(i);
    return { x: this.points[k].x + this.normales[k].x * decalage, y: this.points[k].y + this.normales[k].y * decalage };
  }

  // Ligne de course par relaxation (voir l'en-tête), en deux temps. decalages[i] = écart signé à
  // la ligne centrale ; il reste dans le couloir ±(largeur / 2 - MARGE_LIGNE).
  //   1. « fil tendu » : chaque point vise le milieu de ses deux voisins. La ligne se raccourcit
  //      et vient toucher la corde des virages, mais ses apex sont en pointe ;
  //   2. lissage : chaque point vise (-p[i-2] + 4 p[i-1] + 4 p[i+1] - p[i+2]) / 6, qui aligne sa
  //      courbure sur celle de ses voisins : la courbure s'étale et les apex s'arrondissent.
  calculerLigneDeCourse() {
    const limite = this.largeur / 2 - Circuit.MARGE_LIGNE;
    const decalages = new Float64Array(this.n);
    const ligne = this.points.map(p => ({ x: p.x, y: p.y }));
    const n = this.n;
    const viseFilTendu = i => {
      const a = ligne[(i - 1 + n) % n];
      const b = ligne[(i + 1) % n];
      return [(a.x + b.x) / 2, (a.y + b.y) / 2];
    };
    const viseLisse = i => {
      const a2 = ligne[(i - 2 + n) % n];
      const a = ligne[(i - 1 + n) % n];
      const b = ligne[(i + 1) % n];
      const b2 = ligne[(i + 2) % n];
      return [(4 * (a.x + b.x) - a2.x - b2.x) / 6, (4 * (a.y + b.y) - a2.y - b2.y) / 6];
    };
    for (let iteration = 0; iteration < Circuit.ITERATIONS_LIGNE; iteration++) {
      const vise = iteration < Circuit.ITERATIONS_FIL_TENDU ? viseFilTendu : viseLisse;
      for (let i = 0; i < n; i++) {
        const [x, y] = vise(i);
        const p = this.points[i];
        const normale = this.normales[i];
        decalages[i] = Math.max(-limite, Math.min(limite, (x - p.x) * normale.x + (y - p.y) * normale.y));
        ligne[i].x = p.x + normale.x * decalages[i];
        ligne[i].y = p.y + normale.y * decalages[i];
      }
    }
    this.decalagesLigne = Array.from(decalages);
    this.ligne = ligne;
    this.courburesLigne = Circuit.geometrie(ligne, this.pas, 4).courbures;
  }

  // Virages : zones où la courbure de la ligne de course dépasse COURBURE_VIRAGE. Leur apex est le
  // point de plus forte courbure ; c'est lui que les voitures visent avec arrive.
  calculerVirages() {
    const dans = this.courburesLigne.map(k => Math.abs(k) > Circuit.COURBURE_VIRAGE);
    // on part d'un point hors virage pour ne pas couper une zone en deux
    const debut = dans.findIndex(v => !v);
    this.virages = [];
    if (debut < 0) return;
    let courant = null;
    for (let k = 1; k <= this.n; k++) {
      const i = (debut + k) % this.n;
      if (dans[i]) {
        if (courant === null) courant = { debut: i, fin: i, apex: i };
        courant.fin = i;
        if (Math.abs(this.courburesLigne[i]) > Math.abs(this.courburesLigne[courant.apex])) courant.apex = i;
      } else if (courant !== null) {
        courant.courbure = Math.abs(this.courburesLigne[courant.apex]);
        courant.sens = Math.sign(this.courburesLigne[courant.apex]);
        this.virages.push(courant);
        courant = null;
      }
    }
    this.virages.sort((a, b) => a.apex - b.apex);
  }

  // Zones DRS : les lignes droites assez longues (hors des virages).
  calculerZonesDRS() {
    this.zonesDRS = [];
    const nombre = this.virages.length;
    for (let v = 0; v < nombre; v++) {
      const fin = this.virages[v].fin;
      const debutSuivant = this.virages[(v + 1) % nombre].debut;
      const longueur = ((debutSuivant - fin + this.n) % this.n) * this.pas;
      if (longueur >= Circuit.LONGUEUR_DRS) {
        const marge = Math.round(Circuit.DRS_MARGE / this.pas);
        this.zonesDRS.push({ debut: this.indice(fin + marge), fin: this.indice(debutSuivant - marge) });
      }
    }
  }

  // Vrai si l'indice i est dans l'intervalle circulaire [debut, fin].
  dansIntervalle(i, debut, fin) {
    return debut <= fin ? i >= debut && i <= fin : i >= debut || i <= fin;
  }

  dansZoneDRS(i) {
    return this.zonesDRS.some(zone => this.dansIntervalle(i, zone.debut, zone.fin));
  }

  // Secteur (0, 1 ou 2) du point d'indice i.
  secteur(i) {
    return i < this.secteurs[1] ? 0 : i < this.secteurs[2] ? 1 : 2;
  }

  // Voie des stands, du côté extérieur : elle quitte la piste `avant` pixels avant la ligne
  // d'arrivée et la rejoint `apres` pixels après. Elle suit la ligne centrale avec un écart qui
  // monte en douceur (bretelle d'entrée), reste à ECART_STANDS, puis redescend (bretelle de
  // sortie). Les boxes sont à côté de la voie, encore plus à l'extérieur.
  calculerStands({ avant, apres }) {
    const debut = this.indice(-avant / this.pas);
    const longueurIndices = Math.round((avant + apres) / this.pas);
    const rampe = Circuit.RAMPE_STANDS / this.pas;
    const lisse = t => t * t * (3 - 2 * t);
    const voie = [];
    const indicesPiste = [];
    const ecarts = [];
    for (let k = 0; k <= longueurIndices; k++) {
      const i = this.indice(debut + k);
      const montee = Math.min(1, k / rampe);
      const descente = Math.min(1, (longueurIndices - k) / rampe);
      const ecart = this.exterieur * Circuit.ECART_STANDS * lisse(Math.min(montee, descente));
      voie.push(this.pointLateral(i, ecart));
      indicesPiste.push(i);
      ecarts.push(ecart);
    }
    const { tangentes } = Circuit.geometrie(voie, this.pas);
    // une polyligne ouverte : tangentes des extrémités recalculées sans boucler
    const bout = (a, b) => {
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    };
    tangentes[0] = bout(voie[0], voie[1]);
    tangentes[voie.length - 1] = bout(voie[voie.length - 2], voie[voie.length - 1]);

    // boxes : sur la partie droite de la voie, centrés, espacés régulièrement
    const premier = Math.ceil(rampe) + 2;
    const dernier = longueurIndices - Math.ceil(rampe) - 2;
    // limiteur : la ligne blanche où la voie devient droite (au bout de la bretelle d'entrée) ;
    // sortie : la ligne du feu, au début de la bretelle de sortie
    this.stands = { debut, fin: this.indice(debut + longueurIndices), points: voie, tangentes, indicesPiste, ecarts,
      premierBox: premier, dernierBox: dernier, boxes: [], parking: null,
      limiteur: Math.ceil(rampe), sortie: longueurIndices - Math.ceil(rampe) };
    this.placerBoxes(20);
  }

  // Place `nombre` boxes (un par voiture) et la place de parking de la safety car, juste après
  // le dernier box. Les positions sont mesurées le long de la voie (abscisse curviligne), pour
  // un espacement régulier : ESPACEMENT_BOX, réduit si la partie droite de la voie est trop courte.
  placerBoxes(nombre) {
    const stands = this.stands;
    const voie = stands.points;
    const abscisses = [0];
    for (let k = 1; k < voie.length; k++) abscisses.push(abscisses[k - 1] + Math.hypot(voie[k].x - voie[k - 1].x, voie[k].y - voie[k - 1].y));
    const debut = abscisses[stands.premierBox];
    const fin = abscisses[stands.dernierBox];
    const espacement = Math.max(Circuit.ESPACEMENT_BOX_MIN, Math.min(Circuit.ESPACEMENT_BOX, (fin - debut) / nombre));
    const centre = (debut + fin) / 2;
    const place = rang => {
      const s = centre + (rang - nombre / 2) * espacement;
      let k = 0;
      while (k < voie.length - 2 && abscisses[k + 1] < s) k++;
      const t = Math.max(0, Math.min(1, (s - abscisses[k]) / (abscisses[k + 1] - abscisses[k])));
      const i = stands.indicesPiste[t < 0.5 ? k : k + 1];
      const normale = this.normales[i];
      return {
        x: voie[k].x + (voie[k + 1].x - voie[k].x) * t + normale.x * this.exterieur * Circuit.ECART_BOX,
        y: voie[k].y + (voie[k + 1].y - voie[k].y) * t + normale.y * this.exterieur * Circuit.ECART_BOX,
        indiceVoie: t < 0.5 ? k : k + 1,
        indicePiste: i,
      };
    };
    stands.boxes = Array.from({ length: nombre }, (_, rang) => place(rang));
    stands.parking = place(nombre);
  }

  // Emplacement de grille du rang `rang` (0 = pole position) : derrière la ligne d'arrivée, en
  // deux colonnes décalées. Renvoie { x, y, indice }.
  emplacementGrille(rang) {
    const recul = Circuit.DEBUT_GRILLE + rang * Circuit.ESPACEMENT_GRILLE;
    const i = this.indice(-recul / this.pas);
    const cote = rang % 2 === 0 ? -1 : 1;
    return { ...this.pointLateral(i, cote * Circuit.COLONNE_GRILLE), indice: i };
  }

  // Fenêtre de recherche autour du point précédent pour un véhicule qui roule à `vitesse` pixels par
  // image : il ne peut pas avancer de plus de quelques points. (Dans une épingle, côté intérieur, un
  // point plus loin sur la ligne centrale peut être plus proche : une fenêtre trop large ferait
  // « sauter » la voiture en avant.)
  fenetrePour(vitesse) {
    return Math.min(20, 2 + Math.ceil(2 * vitesse / this.pas));
  }

  // Indice du point de la ligne centrale le plus proche de (x, y). Avec un indice de départ
  // (celui de l'image précédente), on ne cherche qu'autour de lui : c'est bien plus rapide, et
  // une partie éloignée du tracé ne peut pas être prise pour la bonne.
  projeter(x, y, depart = -1, fenetre = 20) {
    let meilleur = 0;
    let distanceMin = Infinity;
    const essayer = i => {
      const p = this.points[i];
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < distanceMin) {
        distanceMin = d;
        meilleur = i;
      }
    };
    if (depart < 0) {
      for (let i = 0; i < this.n; i++) essayer(i);
    } else {
      for (let k = -fenetre; k <= fenetre; k++) essayer(this.indice(depart + k));
    }
    return meilleur;
  }

  // Abscisse curviligne de (x, y) le long de la ligne centrale, dans [0, longueur[ : projection
  // exacte sur les deux segments qui entourent le point le plus proche (pas sur le point lui-même),
  // pour que le chronométrage puisse interpoler un passage entre deux images.
  abscisse(x, y, depart = -1, fenetre = 20) {
    const i = this.projeter(x, y, depart, fenetre);
    let abscisse = i * this.pas;
    let distanceMin = Infinity;
    for (const debut of [this.indice(i - 1), i]) {
      const a = this.points[debut];
      const b = this.points[this.indice(debut + 1)];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)));
      const d = (a.x + vx * t - x) ** 2 + (a.y + vy * t - y) ** 2;
      if (d < distanceMin) {
        distanceMin = d;
        abscisse = (debut + t) * this.pas;
      }
    }
    return ((abscisse % this.longueur) + this.longueur) % this.longueur;
  }

  // Écart latéral signé de (x, y) à la ligne centrale, au point d'indice i.
  ecartLateral(x, y, i) {
    const p = this.points[i];
    const normale = this.normales[i];
    return (x - p.x) * normale.x + (y - p.y) * normale.y;
  }

  // Distance le long de la piste pour aller de l'indice i à l'indice j (vers l'avant), en pixels.
  distanceDevant(i, j) {
    return ((j - i + this.n) % this.n) * this.pas;
  }

  // Indice de la voie des stands le plus proche de (x, y), autour de `depart` si on le connaît.
  projeterStands(x, y, depart = -1, fenetre = 20) {
    const voie = this.stands.points;
    let meilleur = 0;
    let distanceMin = Infinity;
    const debut = depart < 0 ? 0 : Math.max(0, depart - fenetre);
    const fin = depart < 0 ? voie.length - 1 : Math.min(voie.length - 1, depart + fenetre);
    for (let k = debut; k <= fin; k++) {
      const d = (voie[k].x - x) ** 2 + (voie[k].y - y) ** 2;
      if (d < distanceMin) {
        distanceMin = d;
        meilleur = k;
      }
    }
    return meilleur;
  }

  // Vitesse cible en chaque point de la ligne de course, pour une voiture de vitesse maximale
  // vmax (pixels par image), d'accélération latérale aLat et de décélération aFrein (pixels par
  // image²). En virage : v = racine(aLat / courbure). Puis une passe arrière (deux tours, la
  // piste est fermée) borne la vitesse pour qu'on puisse toujours freiner à temps :
  // v[i]² <= v[i+1]² + 2 · aFrein · pas. Mémorisé par jeu de paramètres.
  profilVitesse(vmax, aLat, aFrein) {
    const cle = `${vmax}|${aLat}|${aFrein}`;
    if (this.profils.has(cle)) return this.profils.get(cle);
    const v = this.courburesLigne.map(k => Math.min(vmax, Math.sqrt(aLat / Math.max(Math.abs(k), 1e-9))));
    for (let tour = 0; tour < 2; tour++) {
      for (let i = this.n - 1; i >= 0; i--) {
        const suivant = v[(i + 1) % this.n];
        v[i] = Math.min(v[i], Math.sqrt(suivant * suivant + 2 * aFrein * this.pas));
      }
    }
    if (this.profils.size > 64) this.profils.clear();
    this.profils.set(cle, v);
    return v;
  }

  // Le prochain virage dont l'apex est devant l'indice i (à moins de `portee` pixels), ou null.
  prochainVirage(i, portee) {
    let meilleur = null;
    let distanceMin = Infinity;
    for (const virage of this.virages) {
      const d = this.distanceDevant(i, virage.apex);
      if (d < distanceMin && d <= portee) {
        distanceMin = d;
        meilleur = virage;
      }
    }
    return meilleur;
  }
}
