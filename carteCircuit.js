// Mini-carte HTML / SVG (design/ « Mini-carte — gros plan, états et modes ») : 280 × 200 en haut à
// droite. Tracé épais avec contour (#06080b, 9 px), trois secteurs colorés (6 px : S1 #5b8def,
// S2 #e0b84a, S3 #4fbf86), ligne d'arrivée en damier, voie des stands (2 px), zones DRS (2,5 px,
// décalées de 7 px vers l'extérieur), numéros de virages ; une voiture = un point de 8 px liseré
// de blanc ; le leader porte « 1 » ; la voiture suivie a un anneau pulsé (1,4 s) et son étiquette ;
// survol : infobulle « #16 TAV · P3 · +2.031 » ; deux points trop proches (moins de 9 px) sont
// écartés perpendiculairement au tracé, sans jamais se cacher ; au stand : clé orange ; abandon :
// gris barré ; drapeau jaune : le secteur clignote en jaune, avec un drapeau ; safety car : point
// « SC » et badge. Pied : tour, progression du tour par secteur. Modes : « Circuit complet » et
// « Zoom sur ma voiture » (fenêtre de 760 × 396 px du monde, centrée sur la voiture suivie, lissée
// à 0,15 par mise à jour) ; bouton d'agrandissement (largeur du panneau).
//
// Le tracé vient du Circuit généré (circuit.js), jamais du dessin de la maquette. Ce n'est pas un
// Vehicle : elle lit la course.
class CarteCircuit {
  static LARGEUR = 280;
  static HAUTEUR_SVG = 146;
  static ECART_MIN = 9;
  static ZOOM = [760, 396];
  static LISSAGE = 0.15;
  static MARGE = 60;
  static COULEURS_SECTEURS = ['#5b8def', '#e0b84a', '#4fbf86'];
  // Noms fictifs des circuits (par profil) ; longueur affichée : 4,82 km pour 4 330 px (fiche
  // technique du design : 1 px ≈ 1,11 m).
  static NOMS = Circuit.NOMS;
  static METRES_PAR_PX = Circuit.METRES_PAR_PX;

  // La boîte du monde à montrer en « circuit complet » : la piste et la voie des stands, avec une marge.
  static boite(circuit) {
    const tous = [...circuit.points, ...circuit.stands.points];
    const xs = tous.map(p => p.x);
    const ys = tous.map(p => p.y);
    const m = CarteCircuit.MARGE;
    return { x: Math.min(...xs) - m, y: Math.min(...ys) - m, largeur: Math.max(...xs) - Math.min(...xs) + 2 * m, hauteur: Math.max(...ys) - Math.min(...ys) + 2 * m };
  }

  // Échelle (pixels d'écran par unité du monde) d'une vue dans la zone de 280 × 146
  // (preserveAspectRatio « meet »).
  static echelle(vue, largeur = CarteCircuit.LARGEUR, hauteur = CarteCircuit.HAUTEUR_SVG) {
    return Math.min(largeur / vue.largeur, hauteur / vue.hauteur);
  }

  // Le tracé SVG d'une suite de points (fermé ou non).
  static chemin(points, ferme = false) {
    return points.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + (ferme ? ' Z' : '');
  }

  // Les points de i à j (inclus, en tournant) de la ligne centrale, un sur `pas`.
  static portion(circuit, i, j, pas = 2) {
    const out = [];
    const longueur = (j - i + circuit.n) % circuit.n;
    for (let k = 0; k <= longueur; k += pas) out.push(circuit.points[(i + k) % circuit.n]);
    out.push(circuit.points[j % circuit.n]);
    return out;
  }

  // Les trois secteurs : { debut, fin } en indices de piste.
  static secteurs(circuit) {
    const s = circuit.secteurs;
    return [0, 1, 2].map(k => ({ debut: s[k], fin: s[(k + 1) % 3] }));
  }

  // Où dessiner chaque voiture (données pures, testées). Sur la piste, la voiture est PROJETÉE sur
  // la ligne centrale du tracé (son point de piste) : le point est toujours sur le trait. Au
  // stand, ou à l'arrêt hors piste (abandon), sa vraie position. Renvoie
  // [{ voiture, x, y, nx, ny, angle, surTrace, statut }] ; statut : 'course', 'stand', 'abandon'.
  static positions(course) {
    const c = course.circuit;
    const chrono = course.chronometrage;
    return course.voitures.map(v => {
      const abandon = chrono.abandon(v) || v.horsCourse;
      const stand = !abandon && v.auStand;
      const i = v.indicePiste;
      const t = c.tangentes[i];
      if (abandon || stand) {
        return { voiture: v, x: v.pos.x, y: v.pos.y, nx: -t.y, ny: t.x, angle: Math.atan2(t.y, t.x), surTrace: false, statut: abandon ? 'abandon' : 'stand' };
      }
      const p = c.points[i];
      return { voiture: v, x: p.x, y: p.y, nx: -t.y, ny: t.x, angle: Math.atan2(t.y, t.x), surTrace: true, statut: 'course' };
    });
  }

  // Écartement : deux points du tracé plus proches que `ecartMin` pixels d'écran sont poussés
  // chacun de la moitié du manque (plus 1,5 px), perpendiculairement au tracé, en sens opposés ;
  // répété jusqu'à ce que plus aucun ne se recouvre (au plus `passes` fois). `echelle` = pixels
  // d'écran par unité du monde. Modifie les objets reçus (des positions de dessin, pas les voitures).
  static ecarter(points, echelle, ecartMin = CarteCircuit.ECART_MIN, passes = 12) {
    const k = 1 / echelle;
    for (let passe = 0; passe < passes; passe++) {
      let bouge = false;
      for (let a = 0; a < points.length; a++) {
        for (let b = a + 1; b < points.length; b++) {
          const A = points[a];
          const B = points[b];
          if (!A.surTrace || !B.surTrace) continue;
          const d = Math.hypot(A.x - B.x, A.y - B.y) * echelle;
          if (d >= ecartMin - 1e-6) continue;
          // sens : A du côté où il est déjà (ou au hasard fixe : son rang), B de l'autre
          const cote = (A.x - B.x) * A.nx + (A.y - B.y) * A.ny;
          const s = cote > 0 || (cote === 0 && a < b) ? 1 : -1;
          const pousse = ((ecartMin - d) / 2 + 1.5) * k;
          A.x += A.nx * pousse * s;
          A.y += A.ny * pousse * s;
          B.x -= B.nx * pousse * s;
          B.y -= B.ny * pousse * s;
          bouge = true;
        }
      }
      if (!bouge) break;
    }
    return points;
  }

  // Progression du tour d'une voiture : secteur (0 à 2), part de chaque secteur faite (0 à 1),
  // part du tour.
  static progression(voiture) {
    const c = voiture.circuit;
    const i = voiture.indicePiste;
    const secteur = c.secteur(i);
    const parts = CarteCircuit.secteurs(c).map(({ debut, fin }, k) => {
      if (k < secteur) return 1;
      if (k > secteur) return 0;
      const longueur = (fin - debut + c.n) % c.n || c.n;
      return Math.max(0, Math.min(1, ((i - debut + c.n) % c.n) / longueur));
    });
    return { secteur, parts, tour: i / c.n };
  }

  // choisir(voiture) : appelée au clic sur une voiture (par défaut : la voiture est suivie).
  constructor({ choisir = null } = {}) {
    const $ = id => document.getElementById(id);
    this.choisir = choisir;
    this.racine = $('f1-carte');
    this.svg = $('f1-carte-svg');
    this.dom = {
      nom: $('f1-carte-nom'), longueur: $('f1-carte-longueur'), complet: $('f1-carte-complet'), zoom: $('f1-carte-zoom'),
      agrandir: $('f1-carte-agrandir'), infobulle: $('f1-carte-infobulle'), badge: $('f1-carte-badge'),
      tour: $('f1-carte-tour-n'), total: $('f1-carte-tour-total'), barres: [0, 1, 2].map(k => $(`f1-carte-barre-${k}`)),
      secteur: $('f1-carte-secteur'), pct: $('f1-carte-pct'),
    };
    this.mode = 'complet';
    this.agrandie = false;
    this.circuit = null;
    this.course = null;
    this.centre = null;
    this.survolee = null;
    this.dom.complet.addEventListener('click', () => { this.choisirMode('complet'); this.dom.complet.blur(); });
    this.dom.zoom.addEventListener('click', () => { this.choisirMode('zoom'); this.dom.zoom.blur(); });
    this.dom.agrandir.addEventListener('click', () => { this.basculerAgrandie(); this.dom.agrandir.blur(); });
  }

  choisirMode(mode) {
    if (mode !== 'complet' && mode !== 'zoom') throw new RangeError(`Mode de carte inconnu : ${mode}.`);
    this.mode = mode;
    this.centre = null;
    this.dessinerTrace();
  }

  basculerAgrandie() {
    this.agrandie = !this.agrandie;
    DomF1.classe(this.racine, 'agrandie', this.agrandie);
    this.dom.agrandir.setAttribute('aria-pressed', String(this.agrandie));
  }

  // La vue (boîte du monde) du mode courant ; en zoom, centrée sur la voiture suivie (lissée).
  vue(suivie) {
    if (this.mode === 'complet' || suivie === null) return CarteCircuit.boite(this.circuit);
    const [l, h] = CarteCircuit.ZOOM;
    const cible = { x: suivie.pos.x, y: suivie.pos.y };
    if (this.centre === null) this.centre = { ...cible };
    this.centre.x += (cible.x - this.centre.x) * CarteCircuit.LISSAGE;
    this.centre.y += (cible.y - this.centre.y) * CarteCircuit.LISSAGE;
    return { x: this.centre.x - l / 2, y: this.centre.y - h / 2, largeur: l, hauteur: h };
  }

  // Le tracé fixe (redessiné au changement de circuit ou de mode) : contour, stands, secteurs,
  // DRS, damier, numéros de virages ; puis les couches mobiles (jaune, voitures, SC).
  dessinerTrace() {
    const c = this.circuit;
    if (c === null) return;
    const { svg } = DomF1;
    const zoom = this.mode === 'zoom';
    const vue = zoom ? { largeur: CarteCircuit.ZOOM[0], hauteur: CarteCircuit.ZOOM[1] } : CarteCircuit.boite(c);
    const k = 1 / CarteCircuit.echelle(vue);
    this.k = k;
    const enfants = [];
    const centre = CarteCircuit.chemin(c.points.filter((_, i) => i % 2 === 0), true);
    const stands = CarteCircuit.chemin(c.stands.points.filter((_, i) => i % 2 === 0));
    if (zoom) {
      enfants.push(svg('path', { d: centre, fill: 'none', stroke: '#7d848d', 'stroke-width': c.largeur * 1.1, 'stroke-linejoin': 'round', opacity: 0.6 }));
      enfants.push(svg('path', { d: centre, fill: 'none', stroke: '#2c3036', 'stroke-width': c.largeur, 'stroke-linejoin': 'round' }));
      enfants.push(svg('path', { d: stands, fill: 'none', stroke: '#25282d', 'stroke-width': c.largeur * 0.34 }));
    } else {
      enfants.push(svg('path', { d: centre, fill: 'none', stroke: '#06080b', 'stroke-width': 9 * k, 'stroke-linejoin': 'round' }));
      enfants.push(svg('path', { d: stands, fill: 'none', stroke: '#7d848d', 'stroke-width': 2 * k }));
    }
    CarteCircuit.secteurs(c).forEach(({ debut, fin }, s) => {
      enfants.push(svg('path', { d: CarteCircuit.chemin(CarteCircuit.portion(c, debut, fin)), fill: 'none', stroke: CarteCircuit.COULEURS_SECTEURS[s],
        'stroke-width': (zoom ? 3 : 6) * k, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: zoom ? 0.9 : 1 }));
    });
    this.coucheJaune = svg('g');
    enfants.push(this.coucheJaune);
    const decalage = zoom ? c.largeur * 0.62 : 7 * k;
    // zones DRS : décalées vers l'EXTÉRIEUR du circuit (côté opposé à son centre)
    const centreX = c.points.reduce((s, p) => s + p.x, 0) / c.n;
    const centreY = c.points.reduce((s, p) => s + p.y, 0) / c.n;
    c.zonesDRS.forEach(z => {
      const pts = [];
      const longueur = (z.fin - z.debut + c.n) % c.n;
      const milieu = (z.debut + Math.floor(longueur / 2)) % c.n;
      const essai = c.pointLateral(milieu, decalage);
      const dehors = Math.hypot(essai.x - centreX, essai.y - centreY) > Math.hypot(c.points[milieu].x - centreX, c.points[milieu].y - centreY) ? 1 : -1;
      for (let i = 0; i <= longueur; i += 2) pts.push(c.pointLateral((z.debut + i) % c.n, dehors * decalage));
      enfants.push(svg('path', { d: CarteCircuit.chemin(pts), fill: 'none', stroke: '#2ecc71', 'stroke-width': 2.5 * k, 'stroke-linecap': 'round' }));
    });
    // ligne d'arrivée : damier 2 × 4 cases de 2,5 px, dans l'axe de la piste
    const t0 = c.tangentes[0];
    const damier = svg('g', { transform: `translate(${c.points[0].x.toFixed(1)} ${c.points[0].y.toFixed(1)}) rotate(${(Math.atan2(t0.y, t0.x) * 180 / Math.PI).toFixed(1)}) scale(${k.toFixed(3)})` });
    for (let col = 0; col < 2; col++) {
      for (let r = 0; r < 4; r++) damier.appendChild(svg('rect', { x: col * 2.5 - 2.5, y: r * 2.5 - 5, width: 2.5, height: 2.5, fill: (r + col) % 2 ? '#111' : '#fff' }));
    }
    enfants.push(damier);
    if (!zoom) {
      c.virages.forEach((v, n) => {
        const p = c.pointLateral(v.apex, v.sens * 15 * k);
        const g = svg('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(3)})` });
        const t = svg('text', { 'text-anchor': 'middle', y: 3, 'font-size': 8, 'font-weight': 700, fill: '#8b949e', 'letter-spacing': 0.5, 'font-family': 'Barlow Condensed' });
        t.textContent = `T${n + 1}`;
        g.appendChild(t);
        enfants.push(g);
      });
    }
    this.coucheVoitures = svg('g');
    enfants.push(this.coucheVoitures);
    this.svg.replaceChildren(...enfants);
    this.points = new Map();
    this.drapeau = null;
    this.sc = null;
    this.suivieDom = null;
  }

  // Le groupe SVG d'une voiture (créé une fois).
  pointDe(voiture) {
    if (this.points.has(voiture)) return this.points.get(voiture);
    const { svg, rgb } = DomF1;
    const g = svg('g', { class: 'voiture-carte' });
    const carre = svg('g');
    const forme = svg('rect', { x: -15, y: -6, width: 30, height: 12, rx: 4, fill: rgb(Livrees.ui(voiture.ecurie)), stroke: '#fff', 'stroke-width': 1 });
    const cockpit = svg('rect', { x: 4, y: -2, width: 5, height: 4, rx: 1, fill: '#0b0c0f' });
    carre.appendChild(forme);
    carre.appendChild(cockpit);
    const disque = svg('circle', { r: 4, fill: rgb(Livrees.ui(voiture.ecurie)), stroke: '#fff', 'stroke-width': 1 });
    const croix = svg('path', { d: 'M-4 -4L4 4M4 -4L-4 4', stroke: '#e6edf3', 'stroke-width': 1.4 });
    const cle = svg('g', { transform: 'translate(8 -8)' });
    cle.appendChild(svg('circle', { r: 5.5, fill: '#ff8a1f' }));
    cle.appendChild(svg('path', { d: 'M1.6 -2.4a1.9 1.9 0 0 0-2.4 2.4L-2.6 1.8l.8.8 1.8-1.8a1.9 1.9 0 0 0 2.4-2.4l-.9.9-.8-.2-.2-.8z', fill: '#0f1115' }));
    const un = svg('g', { transform: 'translate(0 -10)' });
    un.appendChild(svg('rect', { x: -4.5, y: -5, width: 9, height: 9, rx: 2, fill: '#e6edf3' }));
    const texteUn = svg('text', { y: 2.6, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700, fill: '#0f1115', 'font-family': 'Barlow Condensed' });
    texteUn.textContent = '1';
    un.appendChild(texteUn);
    const code = svg('text', { x: 18, y: 3, 'font-size': 9, 'font-weight': 700, fill: '#e6edf3', 'letter-spacing': 0.5, 'font-family': 'Barlow Condensed' });
    code.textContent = voiture.pilote.code;
    for (const e of [carre, disque, croix, cle, un, code]) g.appendChild(e);
    g.addEventListener('mouseenter', () => { this.survolee = voiture; });
    g.addEventListener('mouseleave', () => { if (this.survolee === voiture) this.survolee = null; });
    g.addEventListener('click', () => {
      if (this.choisir !== null) this.choisir(voiture);
      else if (this.course) this.course.selection = voiture;
    });
    this.coucheVoitures.appendChild(g);
    const d = { g, carre, disque, croix, cle, un, code };
    this.points.set(voiture, d);
    return d;
  }

  // La voiture suivie : anneau pulsé et étiquette rouge (au-dessus des autres).
  dessinerSuivie() {
    if (this.suivieDom) return this.suivieDom;
    const { svg } = DomF1;
    const g = svg('g', { 'pointer-events': 'none' });
    g.appendChild(svg('circle', { class: 'anneau-suivie', r: 6, fill: 'none', stroke: '#e10600', 'stroke-width': 1.6 }));
    const disque = svg('circle', { r: 5, fill: '#ff8a1f', stroke: '#fff', 'stroke-width': 1.4 });
    g.appendChild(disque);
    const etiquette = svg('g', { transform: 'translate(0 -15)' });
    etiquette.appendChild(svg('rect', { x: -15, y: -7, width: 30, height: 13, rx: 2.5, fill: '#e10600' }));
    const code = svg('text', { y: 3, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: '#fff', 'letter-spacing': 0.5, 'font-family': 'Barlow Condensed' });
    etiquette.appendChild(code);
    g.appendChild(etiquette);
    this.coucheVoitures.appendChild(g);
    this.suivieDom = { g, disque, code };
    return this.suivieDom;
  }

  // Une mise à jour (30 Hz).
  mettreAJour(course, { suivie = null, panneauOuvert = false, visible = true } = {}) {
    DomF1.cacher(this.racine, !visible);
    if (!visible) return;
    DomF1.classe(this.racine, 'panneau-ouvert', panneauOuvert);
    // nouveau circuit, nouvelle course (relancer, manche suivante : mêmes objets Course et
    // Circuit, nouvelles voitures) : tout est redessiné, les marqueurs des anciennes voitures partent
    if (course.circuit !== this.circuit || course !== this.course || course.numeroCourse !== this.numeroCourse) {
      this.circuit = course.circuit;
      this.course = course;
      this.numeroCourse = course.numeroCourse;
      this.centre = null;
      DomF1.texte(this.dom.nom, (CarteCircuit.NOMS[this.circuit.profil] ?? this.circuit.profil).toUpperCase());
      DomF1.texte(this.dom.longueur, `${(this.circuit.longueur * CarteCircuit.METRES_PAR_PX / 1000).toFixed(2).replace('.', ',')} KM`);
      this.dessinerTrace();
    }
    const { attribut, classe, texte, cacher, style } = DomF1;
    classe(this.dom.complet, 'on', this.mode === 'complet');
    classe(this.dom.zoom, 'on', this.mode === 'zoom');
    attribut(this.dom.complet, 'aria-pressed', this.mode === 'complet');
    attribut(this.dom.zoom, 'aria-pressed', this.mode === 'zoom');
    const vue = this.vue(suivie);
    attribut(this.svg, 'viewBox', `${vue.x.toFixed(1)} ${vue.y.toFixed(1)} ${vue.largeur.toFixed(1)} ${vue.hauteur.toFixed(1)}`);
    const echelle = CarteCircuit.echelle(vue);
    const k = 1 / echelle;
    const zoom = this.mode === 'zoom';
    // drapeau jaune : les secteurs concernés clignotent ; safety car : badge
    const jaunes = [...(course.incidents?.secteursJaunes ?? [])].sort();
    const cleJaune = jaunes.join(',');
    if (cleJaune !== this.cleJaune) {
      this.cleJaune = cleJaune;
      const c = this.circuit;
      const enfants = [];
      for (const s of jaunes) {
        const { debut, fin } = CarteCircuit.secteurs(c)[s];
        enfants.push(DomF1.svg('path', { class: 'jaune-clignote', d: CarteCircuit.chemin(CarteCircuit.portion(c, debut, fin)), fill: 'none', stroke: '#f5c518', 'stroke-width': (zoom ? 8 : 10) * k, 'stroke-linecap': 'round', opacity: 0.9 }));
        const milieu = (debut + Math.floor(((fin - debut + c.n) % c.n) / 2)) % c.n;
        const p = c.pointLateral(milieu, -16 * k);
        const drapeau = DomF1.svg('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(3)})` });
        drapeau.appendChild(DomF1.svg('circle', { r: 8, fill: '#0f1115', stroke: '#f5c518', 'stroke-width': 1.2 }));
        drapeau.appendChild(DomF1.svg('path', { d: 'M-3 4.5V-4.5M-3 -4.5H4L2.4 -2 4 .5H-3', fill: '#f5c518', stroke: '#f5c518', 'stroke-width': 1, 'stroke-linejoin': 'round' }));
        enfants.push(drapeau);
      }
      this.coucheJaune.replaceChildren(...enfants);
    }
    const sc = course.safetyCar?.enPiste === true;
    const badge = sc ? 'SAFETY CAR' : jaunes.length > 0 ? `JAUNE · S${jaunes[0] + 1}` : null;
    cacher(this.dom.badge, badge === null);
    if (badge !== null) {
      texte(this.dom.badge, badge);
      classe(this.dom.badge, 'sc', sc);
      classe(this.dom.badge, 'jaune', !sc);
    }
    // voitures : projetées sur le tracé, écartées, puis dessinées
    const positions = CarteCircuit.positions(course);
    if (!zoom) CarteCircuit.ecarter(positions, echelle);
    const leader = course.classement().find(v => !course.chronometrage.abandon(v) && !v.horsCourse) ?? null;
    for (const p of positions) {
      const d = this.pointDe(p.voiture);
      const moi = p.voiture === suivie;
      attribut(d.g, 'transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(3)})`);
      attribut(d.carre, 'transform', `rotate(${(p.angle * 180 / Math.PI).toFixed(0)})`);
      const voitureZoom = zoom && p.surTrace && !moi;
      cacher(d.carre, !voitureZoom);
      cacher(d.disque, moi || voitureZoom);
      attribut(d.disque, 'fill', p.statut === 'abandon' ? '#6e7781' : DomF1.rgb(Livrees.ui(p.voiture.ecurie)));
      attribut(d.disque, 'opacity', p.statut === 'abandon' ? 0.8 : 1);
      cacher(d.croix, p.statut !== 'abandon');
      cacher(d.cle, p.statut !== 'stand');
      cacher(d.un, p.voiture !== leader || moi);
      cacher(d.code, !(zoom && !moi));
    }
    // safety car : point orange « SC » (position projetée sur le tracé)
    if (sc) {
      if (this.sc === null) {
        this.sc = DomF1.svg('g', { 'pointer-events': 'none' });
        this.sc.appendChild(DomF1.svg('circle', { r: 7, fill: '#ff8a1f', stroke: '#fff', 'stroke-width': 1 }));
        const t = DomF1.svg('text', { y: 2.6, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 700, fill: '#0f1115', 'font-family': 'Barlow Condensed' });
        t.textContent = 'SC';
        this.sc.appendChild(t);
        this.coucheVoitures.appendChild(this.sc);
      }
      const p = this.circuit.points[course.safetyCar.indicePiste];
      attribut(this.sc, 'transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(3)})`);
    }
    if (this.sc) cacher(this.sc, !sc);
    // voiture suivie, au-dessus de tout
    if (suivie !== null) {
      const s = this.dessinerSuivie();
      const p = positions.find(q => q.voiture === suivie);
      attribut(s.g, 'transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(3)})`);
      attribut(s.disque, 'fill', DomF1.rgb(Livrees.ui(suivie.ecurie)));
      texte(s.code, suivie.pilote.code);
      if (s.g.parentNode === this.coucheVoitures && this.coucheVoitures.children[this.coucheVoitures.children.length - 1] !== s.g) this.coucheVoitures.appendChild(s.g);
    }
    if (this.suivieDom) cacher(this.suivieDom.g, suivie === null);
    this.infobulle(course, positions, vue, echelle);
    // pied : tour et progression de la voiture suivie (sinon du leader)
    const reference = suivie ?? leader;
    texte(this.dom.tour, TourClassement.tourEnCours(course));
    texte(this.dom.total, course.parametres.nombreTours);
    if (reference !== null) {
      const pr = CarteCircuit.progression(reference);
      pr.parts.forEach((part, s) => {
        style(this.dom.barres[s], 'width', `${Math.round(part * 100)}%`);
        style(this.dom.barres[s], 'background', CarteCircuit.COULEURS_SECTEURS[s]);
      });
      texte(this.dom.secteur, pr.secteur + 1);
      texte(this.dom.pct, `${Math.round(pr.tour * 100)} %`);
    }
  }

  // Infobulle de la voiture survolée : « #16 TAV · P3 · +2.031 ».
  infobulle(course, positions, vue, echelle) {
    const v = this.survolee;
    DomF1.cacher(this.dom.infobulle, v === null);
    if (v === null) return;
    const p = positions.find(q => q.voiture === v);
    const lignes = TourClassement.lignes(course, 'leader');
    const l = lignes.find(x => x.voiture === v);
    const largeurSvg = CarteCircuit.LARGEUR;
    const decalX = (largeurSvg - vue.largeur * echelle) / 2;
    const decalY = (CarteCircuit.HAUTEUR_SVG - vue.hauteur * echelle) / 2;
    const sx = decalX + (p.x - vue.x) * echelle;
    const sy = 28 + decalY + (p.y - vue.y) * echelle;
    const { el } = DomF1;
    const ecart = l.leader ? 'Leader' : l.ecart;
    this.dom.infobulle.replaceChildren(
      el('span', 'mono', `#${v.numero}`), el('span', '', ' '), el('b', '', v.pilote.code), el('span', 'point', ' · '),
      el('span', '', l.position === '—' ? '—' : `P${l.position}`), el('span', 'point', ' · '), el('span', 'mono', ecart));
    DomF1.style(this.dom.infobulle, 'left', `${Math.max(4, Math.min(largeurSvg - 150, sx - 64)).toFixed(0)}px`);
    DomF1.style(this.dom.infobulle, 'top', `${(sy < 64 ? sy + 12 : sy - 34).toFixed(0)}px`);
    this.texteInfobulle = `#${v.numero} ${v.pilote.code} · ${l.position === '—' ? '—' : `P${l.position}`} · ${ecart}`;
  }
}
