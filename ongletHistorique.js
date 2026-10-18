// Onglet Historique du panneau latéral (design/ « Onglets Prédiction · Historique · Réglages ») :
// les positions par tour (de la grille au dernier tour bouclé) en courbes aux couleurs des
// écuries, la voiture suivie épaissie en blanc, les tours à venir grisés (« À VENIR »), une croix
// rouge à l'abandon ; survoler une courbe l'isole. Dessous, les faits marquants. Données :
// HistoriquePositions.parTour (temps de passage du chronométrage) ; rien d'inventé.
class OngletHistorique {
  static LARGEUR = 320;
  static HAUTEUR = 360;
  static X_GRILLE = 40;
  static X_FIN = 280;
  static Y_HAUT = 14;
  static Y_BAS = 300;
  static FAITS_MAX = 8;

  // Abscisse de la colonne i (0 = grille) pour n tours.
  static x(i, tours) {
    return OngletHistorique.X_GRILLE + i * (OngletHistorique.X_FIN - OngletHistorique.X_GRILLE) / Math.max(1, tours);
  }

  // Ordonnée de la position p (1 en haut) pour n voitures.
  static y(p, voitures) {
    const pas = Math.min(26, (OngletHistorique.Y_BAS - OngletHistorique.Y_HAUT) / Math.max(1, voitures - 1));
    return OngletHistorique.Y_HAUT + (p - 1) * pas;
  }

  constructor(svgRacine, listeFaits) {
    this.svg = svgRacine;
    this.liste = listeFaits;
    this.cle = null;
    this.isolee = null;
  }

  mettreAJour(course, suivie = null) {
    const donnees = HistoriquePositions.parTour(course);
    const cle = JSON.stringify([course.voitures.length, course.parametres.nombreTours, donnees.tours, suivie?.numero ?? null,
      [...donnees.positions.values()].map(p => p.join(',')), [...donnees.abandons.values()]]);
    if (cle === this.cle && this.course === course) return;
    this.cle = cle;
    this.course = course;
    this.dessiner(course, donnees, suivie);
    this.ecrireFaits(course, donnees, suivie);
  }

  dessiner(course, { tours, positions, abandons }, suivie) {
    const { svg, rgb } = DomF1;
    const n = course.voitures.length;
    const N = course.parametres.nombreTours;
    const X = i => OngletHistorique.x(i, N);
    const Y = p => OngletHistorique.y(p, n);
    const enfants = [];
    // tours à venir
    if (tours < N) {
      const x0 = X(tours) + 2;
      enfants.push(svg('rect', { x: x0, y: 4, width: 294 - x0, height: 314, fill: 'rgba(255,255,255,.025)' }));
      const t = svg('text', { x: (x0 + 294) / 2, y: 170, 'text-anchor': 'middle', 'font-family': 'Barlow Condensed', 'font-weight': 600, 'font-size': 12, 'letter-spacing': 1, fill: '#5b636d' });
      t.textContent = 'À VENIR';
      enfants.push(t);
    }
    // positions (P1 à Pn) et lignes de repère
    const graduations = svg('g', { 'font-family': 'JetBrains Mono', 'font-size': 9, fill: '#6e7781' });
    for (let p = 1; p <= n; p++) {
      const t = svg('text', { x: 22, y: Y(p) + 3, 'text-anchor': 'end' });
      t.textContent = `P${p}`;
      graduations.appendChild(t);
      graduations.appendChild(svg('line', { x1: 30, x2: 294, y1: Y(p), y2: Y(p), stroke: 'rgba(255,255,255,.05)' }));
    }
    enfants.push(graduations);
    // colonnes : GRILLE, T1... (le tour en cours en blanc)
    const colonnes = svg('g', { 'font-family': 'Barlow Condensed', 'font-weight': 600, 'font-size': 11, fill: '#8b949e', 'text-anchor': 'middle' });
    for (let i = 0; i <= N; i++) {
      const t = svg('text', { x: X(i), y: 340 });
      if (i === tours && i > 0) t.setAttribute('fill', '#fff');
      t.textContent = i === 0 ? 'GRILLE' : `T${i}`;
      colonnes.appendChild(t);
    }
    enfants.push(colonnes);
    // une courbe par voiture (la suivie en dernier, au-dessus)
    const ordre = course.voitures.filter(v => v !== suivie);
    if (suivie !== null && positions.has(suivie)) ordre.push(suivie);
    for (const v of ordre) {
      const p = positions.get(v);
      const points = p.map((pos, i) => (pos === undefined ? null : [X(i), Y(pos)])).filter(x => x !== null);
      if (points.length === 0) continue;
      const moi = v === suivie;
      const abandon = abandons.has(v);
      const couleur = moi ? '#ffffff' : rgb(Livrees.ui(v.ecurie));
      const opacite = moi ? 1 : abandon ? 0.4 : 0.6;
      const chemin = svg('path', { d: points.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '),
        fill: 'none', stroke: couleur, 'stroke-width': moi ? 3.5 : 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: opacite });
      chemin.addEventListener('mouseenter', () => this.isoler(chemin));
      chemin.addEventListener('mouseleave', () => this.isoler(null));
      enfants.push(chemin);
      const [ex, ey] = points[points.length - 1];
      enfants.push(svg('circle', { cx: ex, cy: ey, r: moi ? 4.5 : 2.5, fill: couleur, opacity: opacite }));
      const etiquette = svg('text', { x: ex + 8, y: ey + 4, 'font-family': 'Barlow Condensed', 'font-weight': 700, 'font-size': 11, fill: moi ? '#fff' : abandon ? '#6e7781' : '#a3acb6' });
      etiquette.textContent = v.pilote.code;
      enfants.push(etiquette);
      if (abandon) {
        const croix = svg('g', { transform: `translate(${ex} ${ey})` });
        croix.appendChild(svg('line', { x1: -5, y1: -5, x2: 5, y2: 5, stroke: '#e74c3c', 'stroke-width': 2 }));
        croix.appendChild(svg('line', { x1: 5, y1: -5, x2: -5, y2: 5, stroke: '#e74c3c', 'stroke-width': 2 }));
        enfants.push(croix);
      }
    }
    this.svg.replaceChildren(...enfants);
  }

  // Survol : la courbe survolée reste, les autres pâlissent.
  isoler(chemin) {
    if (this.isolee) this.isolee.classList.remove('isole');
    this.isolee = chemin;
    if (chemin) chemin.classList.add('isole');
    this.svg.classList.toggle('isolement', chemin !== null);
  }

  ecrireFaits(course, donnees, suivie) {
    const { el } = DomF1;
    const faits = HistoriquePositions.faitsMarquants(course, donnees, suivie).slice(0, OngletHistorique.FAITS_MAX);
    const enfants = [];
    for (const f of faits) {
      enfants.push(el('span', 'tour cond', `T${f.tour}`));
      const ligne = el('span');
      ligne.appendChild(el('b', 'cond', f.code));
      ligne.appendChild(document.createTextNode ? document.createTextNode(` ${f.texte}`) : el('span', '', ` ${f.texte}`));
      enfants.push(ligne);
    }
    if (faits.length === 0) enfants.push(el('span', 'tour cond', '—'), el('span', '', 'Rien encore : les faits arrivent au premier tour bouclé.'));
    this.liste.replaceChildren(...enfants);
  }
}
