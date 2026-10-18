// Onglet Télémétrie du panneau latéral (design/ « Onglet Télémétrie — données vide ») : deux pilotes
// comparés (A en trait plein à sa couleur d'écurie, B en tirets), fenêtre glissante de 30 s, quatre
// graphes avec axes, unités, min / max : vitesse, gaz / frein, température des pneus (fenêtre
// optimale du type monté en bande verte), angle de glisse. Avant le départ : « En attente de
// données ». Les données sont celles de Telemetrie (mesures réelles des voitures) ; rien d'inventé.
class OngletTelemetrie {
  // Géométrie des graphes du design : viewBox 280 × 170, tracé de x 36 à 276, de y 11 à 141.
  static X0 = 36;
  static L = 240;
  static Y0 = 11;
  static H = 130;
  // Les quatre graphes : nom, unité, bornes (fonction du pilote A pour la température), valeur.
  static GRAPHES = [
    { cle: 'vitesse', nom: 'Vitesse', unite: 'km/h', bornes: () => [80, 340], zero: null,
      valeur: m => m.vitesse * VoiturePilote.KMH, texte: v => String(Math.round(v)) },
    { cle: 'commandes', nom: 'Gaz / Frein', unite: '% · ↑ gaz ↓ frein', bornes: () => [-100, 100], zero: 0, etiquettes: ['100', '0', '100'],
      valeur: m => (m.frein > 0.05 ? -100 * m.frein : 100 * m.accelerateur), texte: v => (v < 0 ? `F ${Math.round(-v)}` : `G ${Math.round(v)}`) },
    { cle: 'temperature', nom: 'Temp. pneus', unite: '°C · train de pneus', bornes: v => (OngletTelemetrie.categorie(v) === 'slick' ? [80, 130] : [30, 90]), zero: null, bande: true,
      valeur: m => m.temperature, texte: v => `${Math.round(v)}°` },
    { cle: 'glisse', nom: 'Angle de glisse', unite: '° · arrière', bornes: () => [-10, 10], zero: 0, etiquettes: ['+10', '0', '−10'],
      valeur: m => m.derive, texte: v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°` },
  ];

  static categorie(voiture) {
    return voiture === null ? 'slick' : Pneus.type(voiture.typePneus).categorie;
  }

  // Abscisse d'une mesure (temps t) dans la fenêtre qui finit à `fin`.
  static x(t, fin) {
    return OngletTelemetrie.X0 + OngletTelemetrie.L * (1 - (fin - t) / Telemetrie.DUREE);
  }

  static y(v, lo, hi) {
    const borne = Math.max(lo, Math.min(hi, v));
    return OngletTelemetrie.Y0 + (1 - (borne - lo) / (hi - lo)) * OngletTelemetrie.H;
  }

  // Le tracé SVG d'une série (chaîne « M x y L x y ... »), ou '' sans mesure.
  static chemin(serie, graphe, lo, hi, fin) {
    return serie.map((m, k) => `${k ? 'L' : 'M'}${OngletTelemetrie.x(m.t, fin).toFixed(1)} ${OngletTelemetrie.y(graphe.valeur(m), lo, hi).toFixed(1)}`).join('');
  }

  constructor(conteneur) {
    const { el, svg } = DomF1;
    this.graphes = OngletTelemetrie.GRAPHES.map(g => {
      const section = el('section', 'tele-graphe');
      const titre = el('div', 'titre');
      const gauche = el('span');
      gauche.style.display = 'flex';
      gauche.style.gap = '6px';
      gauche.style.alignItems = 'baseline';
      gauche.appendChild(el('span', 'nom cond', g.nom));
      gauche.appendChild(el('span', 'lbl', g.unite));
      const valeurs = el('span', 'valeurs mono');
      const vA = el('span', '', '—');
      const vB = el('span', '', '—');
      valeurs.appendChild(vA);
      valeurs.appendChild(vB);
      titre.appendChild(gauche);
      titre.appendChild(valeurs);
      const dessin = svg('svg', { role: 'img', 'aria-label': `${g.nom} sur 30 s`, width: 280, height: 170, viewBox: '0 0 280 170' });
      const textes = svg('g', { 'font-family': 'JetBrains Mono', 'font-size': 9, fill: '#8b949e' });
      const max = svg('text', { x: 30, y: 14, 'text-anchor': 'end' });
      const mil = svg('text', { x: 30, y: 79, 'text-anchor': 'end' });
      const min = svg('text', { x: 30, y: 144, 'text-anchor': 'end' });
      for (const t of [max, mil, min]) textes.appendChild(t);
      for (const [x, ancre, mot] of [[36, 'start', '−30 s'], [153, 'middle', '−15 s'], [276, 'end', '0']]) {
        const t = svg('text', { x, y: 162, 'text-anchor': ancre });
        t.textContent = mot;
        textes.appendChild(t);
      }
      dessin.appendChild(textes);
      const grille = svg('g', { stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1 });
      for (const y of [11, 43, 76, 108, 141]) grille.appendChild(svg('line', { x1: 36, y1: y, x2: 276, y2: y }));
      grille.appendChild(svg('line', { x1: 156, y1: 11, x2: 156, y2: 141 }));
      dessin.appendChild(grille);
      dessin.appendChild(svg('line', { x1: 36, y1: 11, x2: 36, y2: 141, stroke: 'rgba(255,255,255,.2)' }));
      const bande = svg('rect', { x: 36, y: 0, width: 240, height: 0, fill: '#2ecc71', opacity: 0.08 });
      const zero = svg('line', { x1: 36, y1: -10, x2: 276, y2: -10, stroke: 'rgba(255,255,255,.22)', 'stroke-dasharray': '3 3' });
      const cheminB = svg('path', { d: '', fill: 'none', stroke: '#4a525c', 'stroke-width': 1.6, 'stroke-dasharray': '4 3' });
      const cheminA = svg('path', { d: '', fill: 'none', stroke: '#4a525c', 'stroke-width': 2 });
      const point = svg('circle', { cx: 276, cy: -10, r: 0, fill: '#4a525c' });
      for (const e of [bande, zero, cheminB, cheminA, point]) dessin.appendChild(e);
      const attente = el('div', 'tele-attente cond');
      const roue = svg('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#8b949e', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'aria-hidden': 'true' });
      roue.appendChild(svg('path', { d: 'M12 3a9 9 0 1 1-9 9' }));
      attente.appendChild(roue);
      attente.appendChild(el('span', '', 'En attente de données'));
      section.appendChild(titre);
      section.appendChild(dessin);
      section.appendChild(attente);
      conteneur.appendChild(section);
      return { g, vA, vB, max, mil, min, bande, zero, cheminA, cheminB, point, attente };
    });
    const $ = id => document.getElementById(id);
    this.dom = { codeA: $('f1-tele-code-a'), codeB: $('f1-tele-code-b'), traitA: $('f1-tele-trait-a'), traitB: $('f1-tele-trait-b'), note: $('f1-tele-note') };
  }

  // telemetrie = l'objet Telemetrie (mesures) ; comparaison = mode du pilote B.
  mettreAJour(course, telemetrie, comparaison) {
    const { texte, attribut, cacher, style, rgb, eclaircir } = DomF1;
    const [a, b] = Telemetrie.paire(course, comparaison);
    const serieA = a === null ? [] : telemetrie.series.get(a) ?? [];
    const serieB = b === null ? [] : telemetrie.series.get(b) ?? [];
    const vide = serieA.length < 2;
    const couleurA = vide ? '#4a525c' : rgb(Livrees.ui(a.ecurie));
    const memeCouleur = b !== null && a !== null && b.ecurie === a.ecurie;
    const couleurB = vide || b === null ? '#4a525c' : rgb(memeCouleur ? eclaircir(Livrees.ui(b.ecurie), 0.55) : Livrees.ui(b.ecurie));
    texte(this.dom.codeA, a === null ? '—' : a.pilote.code);
    texte(this.dom.codeB, b === null ? '—' : b.pilote.code);
    style(this.dom.codeA, 'color', vide ? '#8b949e' : rgb(eclaircir(Livrees.ui(a.ecurie))));
    style(this.dom.codeB, 'color', vide || b === null ? '#8b949e' : rgb(eclaircir(Livrees.ui(b.ecurie))));
    style(this.dom.traitA, 'background', couleurA);
    style(this.dom.traitB, 'borderTopColor', couleurB);
    cacher(this.dom.note, !vide);
    const fin = telemetrie.chrono?.horloge ?? 0;
    for (const gr of this.graphes) {
      const { g } = gr;
      const [lo, hi] = g.bornes(a);
      const etiquettes = g.etiquettes ?? [String(hi), String((lo + hi) / 2), String(lo)];
      texte(gr.max, etiquettes[0]);
      texte(gr.mil, etiquettes[1]);
      texte(gr.min, etiquettes[2]);
      attribut(gr.zero, 'y1', g.zero === null ? -10 : OngletTelemetrie.y(g.zero, lo, hi).toFixed(1));
      attribut(gr.zero, 'y2', g.zero === null ? -10 : OngletTelemetrie.y(g.zero, lo, hi).toFixed(1));
      if (g.bande && a !== null) {
        const [bas, haut] = Glisse.FENETRES[OngletTelemetrie.categorie(a)] ?? Glisse.FENETRES.slick;
        const y1 = OngletTelemetrie.y(haut, lo, hi);
        attribut(gr.bande, 'y', y1.toFixed(1));
        attribut(gr.bande, 'height', (OngletTelemetrie.y(bas, lo, hi) - y1).toFixed(1));
      }
      cacher(gr.attente, !vide);
      attribut(gr.cheminA, 'stroke', couleurA);
      attribut(gr.cheminB, 'stroke', couleurB);
      attribut(gr.point, 'fill', couleurA);
      style(gr.vA, 'color', couleurA);
      style(gr.vB, 'color', couleurB);
      if (vide) {
        attribut(gr.cheminA, 'd', '');
        attribut(gr.cheminB, 'd', '');
        attribut(gr.point, 'r', 0);
        texte(gr.vA, '—');
        texte(gr.vB, '—');
        continue;
      }
      attribut(gr.cheminA, 'd', OngletTelemetrie.chemin(serieA, g, lo, hi, fin));
      attribut(gr.cheminB, 'd', serieB.length < 2 ? '' : OngletTelemetrie.chemin(serieB, g, lo, hi, fin));
      const derniere = serieA[serieA.length - 1];
      attribut(gr.point, 'cx', OngletTelemetrie.x(derniere.t, fin).toFixed(1));
      attribut(gr.point, 'cy', OngletTelemetrie.y(g.valeur(derniere), lo, hi).toFixed(1));
      attribut(gr.point, 'r', 3);
      texte(gr.vA, g.texte(g.valeur(derniere)));
      texte(gr.vB, serieB.length === 0 ? '—' : g.texte(g.valeur(serieB[serieB.length - 1])));
    }
  }
}
