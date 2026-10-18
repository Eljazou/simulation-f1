// Écran partagé en HTML (design/ : « Multijoueur local — écran partagé ») : pour chaque joueur,
// une étiquette (J1 / J2, code et écurie, touches) en haut de sa moitié et un HUD compact
// (400 × 168) en bas ; au centre, le duel : position de chacun, écart entre eux, tours menés.
// Ce n'est pas un Vehicle : il lit la course (HudCourse.donnees, le chronométrage) et ne change
// rien. Les tours menés sont comptés ici, à chaque tour bouclé, d'après l'ordre de la course.
class HudDuel {
  static COULEURS = ['#e10600', '#1f8fe0'];
  static TOUCHES = ['WASD · Espace', 'Flèches · Entrée'];

  // L'écart (secondes) entre les deux joueurs, d'après les écarts au leader ; null si inconnu.
  static ecart(course) {
    const [a, b] = course.joueurs;
    if (!a || !b) return null;
    const e = course.chronometrage.ecarts('leader');
    const ea = course.leader === a ? 0 : e.get(a)?.valeur ?? null;
    const eb = course.leader === b ? 0 : e.get(b)?.valeur ?? null;
    return ea === null || eb === null ? null : Math.abs(eb - ea);
  }

  // parent = le calque de l'interface (#f1-ui).
  constructor(parent) {
    const { el } = DomF1;
    this.racine = el('div', 'duel');
    this.racine.id = 'f1-duel';
    this.racine.hidden = true;
    this.joueurs = [0, 1].map(k => this.construireJoueur(k));
    // panneau du duel
    this.panneau = el('section', 'duel-panneau glass');
    this.panneau.setAttribute('aria-label', 'Duel des joueurs');
    const ligne = el('div', 'duel-ligne');
    const cote = k => {
      const c = el('span', `duel-cote${k === 1 ? ' droite' : ''}`);
      const badge = el('span', 'cond duel-badge', `J${k + 1}`);
      badge.style.background = HudDuel.COULEURS[k];
      const pos = el('span', 'cond duel-position', '—');
      if (k === 0) { c.appendChild(badge); c.appendChild(pos); } else { c.appendChild(pos); c.appendChild(badge); }
      return { c, pos };
    };
    this.cotes = [cote(0), cote(1)];
    this.ecart = el('span', 'mono duel-ecart', '—');
    ligne.appendChild(this.cotes[0].c);
    ligne.appendChild(this.ecart);
    ligne.appendChild(this.cotes[1].c);
    const barre = el('div', 'duel-barre');
    this.parts = [0, 1].map(k => {
      const p = el('span');
      p.style.background = HudDuel.COULEURS[k];
      barre.appendChild(p);
      return p;
    });
    this.menes = el('div', 'lbl duel-menes', 'Tours menés · J1 0 – J2 0');
    this.panneau.appendChild(ligne);
    this.panneau.appendChild(barre);
    this.panneau.appendChild(this.menes);
    this.racine.appendChild(this.panneau);
    parent.appendChild(this.racine);
    this.course = null;
    this.toursMenes = [0, 0];
    this.dernierTour = 0;
  }

  construireJoueur(k) {
    const { el } = DomF1;
    const etiquette = el('div', `duel-etiquette glass${k === 1 ? ' droite' : ''}`);
    const j = el('span', 'cond duel-j', `J${k + 1}`);
    j.style.background = HudDuel.COULEURS[k];
    const code = el('span', 'cond duel-code');
    const touches = el('span', 'lbl duel-touches', HudDuel.TOUCHES[k]);
    for (const e of [j, code, touches]) etiquette.appendChild(e);
    const hud = el('section', `duel-hud glass${k === 1 ? ' droite' : ''}`);
    hud.setAttribute('aria-label', `HUD joueur ${k + 1}`);
    const haut = el('div', 'duel-hud-haut');
    const vitesse = el('div');
    const kmh = el('div', 'cond duel-vitesse', '0');
    vitesse.appendChild(kmh);
    vitesse.appendChild(el('div', 'lbl', 'km/h'));
    const rapportBloc = el('div', 'duel-rapport');
    const rapport = el('span', 'cond', '1');
    rapportBloc.appendChild(rapport);
    rapportBloc.appendChild(el('span', 'lbl', 'Rapport'));
    const commandes = el('div', 'duel-commandes');
    const barre = couleur => {
      const b = el('span', 'duel-jauge');
      const r = el('span');
      r.style.background = couleur;
      b.appendChild(r);
      commandes.appendChild(b);
      return r;
    };
    const gaz = barre('#2ecc71');
    const frein = barre('#e74c3c');
    const bas = el('span', 'duel-drs-ligne');
    const drs = el('span', 'cond duel-drs', 'DRS');
    const pneu = el('span', 'pneu M', 'M');
    const usure = el('span', 'lbl duel-usure', '0 %');
    for (const e of [drs, pneu, usure]) bas.appendChild(e);
    commandes.appendChild(bas);
    for (const e of [vitesse, rapportBloc, commandes]) haut.appendChild(e);
    const pied = el('div', 'duel-hud-pied');
    const position = el('span', 'cond duel-hud-position');
    position.style.background = HudDuel.COULEURS[k];
    const tourBloc = el('span', 'duel-bloc');
    tourBloc.appendChild(el('span', 'lbl', 'Tour'));
    const tour = el('span', 'mono', '0:00.000');
    tourBloc.appendChild(tour);
    const ecartBloc = el('span', 'duel-bloc bordure');
    const ecartLibelle = el('span', 'lbl', 'Devant');
    const ecart = el('span', 'mono', '—');
    ecartBloc.appendChild(ecartLibelle);
    ecartBloc.appendChild(ecart);
    for (const e of [position, tourBloc, ecartBloc]) pied.appendChild(e);
    hud.appendChild(haut);
    hud.appendChild(pied);
    this.racine.appendChild(etiquette);
    this.racine.appendChild(hud);
    return { etiquette, code, hud, kmh, rapport, gaz, frein, drs, pneu, usure, position, tour, ecartLibelle, ecart };
  }

  get visible() {
    return !this.racine.hidden;
  }

  // Une mise à jour (30 Hz). telemetrie : les commandes lissées (gaz, frein) de chaque voiture.
  mettreAJour(course, { telemetrie = null } = {}) {
    const { cacher, texte, style, classe } = DomF1;
    const visible = course.multijoueur === true;
    cacher(this.racine, !visible);
    if (!visible) return;
    // nouvelle course (même objet Course) : les tours menés repartent de zéro
    if (course !== this.course || course.numeroCourse !== this.numeroCourse) {
      this.course = course;
      this.numeroCourse = course.numeroCourse;
      this.toursMenes = [0, 0];
      this.dernierTour = 0;
    }
    const joueurs = course.joueurs;
    const ordre = course.classement();
    joueurs.forEach((j, k) => {
      const d = HudDuel.donnees(course, j, telemetrie);
      const v = this.joueurs[k];
      texte(v.code, `${j.pilote.code} · ${j.ecurie.nom}`);
      texte(v.kmh, d.kmh);
      texte(v.rapport, d.rapport);
      style(v.gaz, 'width', `${d.gaz}%`);
      style(v.frein, 'width', `${d.frein}%`);
      classe(v.drs, 'actif', d.drs.etat === 'actif' || d.drs.etat === 'disponible');
      if (v.pneu.textContent !== d.pneu) v.pneu.className = `pneu ${d.pneu}`;
      texte(v.pneu, d.pneu);
      texte(v.usure, `${d.pneu} · ${Math.round(d.usure * 100)} %`);
      texte(v.position, `P${d.position}`);
      texte(v.tour, Chronometrage.formater(d.tour));
      const autre = joueurs[1 - k];
      const devantEstAutre = d.devant !== null && d.devant.voiture === autre;
      texte(v.ecartLibelle, d.devant ? `Devant · ${devantEstAutre ? `J${2 - k} ` : ''}${d.devant.voiture.pilote.code}` : 'Devant');
      texte(v.ecart, d.devant && d.devant.valeur !== null ? DomF1.ecartSigne(d.devant.valeur) : '—');
      texte(this.cotes[k].pos, `P${ordre.indexOf(j) + 1}`);
    });
    // tours menés : à chaque tour bouclé par le premier des deux, celui qui est devant le mène
    if (joueurs.length === 2) {
      const tour = Math.max(joueurs[0].tour, joueurs[1].tour);
      if (tour > this.dernierTour) {
        const devant = ordre.indexOf(joueurs[0]) < ordre.indexOf(joueurs[1]) ? 0 : 1;
        this.toursMenes[devant] += tour - this.dernierTour;
        this.dernierTour = tour;
      }
      const e = HudDuel.ecart(course);
      texte(this.ecart, e === null ? '—' : e.toFixed(3));
      const total = this.toursMenes[0] + this.toursMenes[1];
      this.parts.forEach((p, k) => style(p, 'flex', String(total === 0 ? 1 : Math.max(0.0001, this.toursMenes[k]))));
      texte(this.menes, `Tours menés · J1 ${this.toursMenes[0]} – J2 ${this.toursMenes[1]}`);
    }
  }

  // Les données d'un joueur (celles du HUD principal).
  static donnees(course, joueur, telemetrie = null) {
    const commandes = telemetrie?.lisses?.get(joueur) ?? Telemetrie.commandes(joueur);
    return HudCourse.donnees(course, joueur, commandes);
  }
}
