// Podium de fin de course en HTML (design/ : « Podium de fin ») : « VICTOIRE DE … », les trois
// marches (2e, 1er, 3e) avec code, écurie et temps, le classement final (temps ou écart, points
// du barème du championnat, meilleur tour en violet, abandons grisés), et les boutons REJOUER et
// MENU. Ce n'est pas un Vehicle : il lit la course terminée (Championnat.pointsDe, les lignes de
// la tour de classement) et ne change rien ; ses boutons appellent les actions du scénario.
// Écarts au design (règles) : pas de bouton « REVOIR LA COURSE » (la course n'est pas
// enregistrée, il n'y a rien à revoir) ; pas de confettis CSS : tout ce qui bouge est un Vehicle
// (les confettis du podium de championnat, confetti.js).
class PodiumFin {
  // Délai (secondes réelles) entre la fin de la course et le podium : le temps de voir l'arrivée
  // (et, en mode pilote, les trois premiers rejoindre le podium de la scène).
  static DELAI = 3;

  // Le contenu, calculé une fois à l'arrivée : { titre, vainqueur, sousTitre, podium, lignes, meilleurTour }.
  static donnees(course) {
    const points = Championnat.pointsDe(course);
    const lignes = TourClassement.lignes(course, 'leader');
    const ordre = course.classement();
    const chrono = course.chronometrage;
    const meilleur = chrono.meilleurTour;
    const nom = Circuit.NOMS[course.circuit.profil] ?? course.circuit.profil;
    const tours = course.parametres.nombreTours;
    const vainqueur = ordre[0] ?? null;
    const temps = (v, k) => {
      if (points[k].position === null) {
        const l = lignes.find(x => x.voiture === v);
        return l ? l.ecart : 'ABD';
      }
      if (k === 0) return Chronometrage.formater(course.tempsCourse);
      return lignes.find(x => x.voiture === v)?.ecart ?? '—';
    };
    const rangs = ordre.map((v, k) => ({
      voiture: v,
      position: points[k].position === null ? '—' : String(points[k].position),
      code: v.pilote.code,
      ecurie: v.ecurie.nom,
      couleur: Livrees.ui(v.ecurie),
      temps: temps(v, k),
      points: points[k].points,
      bonus: points[k].meilleurTour,
      meilleur: meilleur !== null && meilleur.voiture === v,
      // pénalités reçues (limites de piste, accidents, stand), déjà comprises dans le temps
      penalite: (v.penalites ?? 0) > 0 ? `+${v.penalites} s` : null,
      abandon: points[k].position === null,
    }));
    let sousTitre = '';
    if (vainqueur !== null) {
      const grille = course.voitures.indexOf(vainqueur) + 1;
      const arrets = vainqueur.arretsAuStand ?? 0;
      const depassements = vainqueur.depassements ?? 0;
      sousTitre = `${vainqueur.ecurie.nom} · parti ${grille}${grille === 1 ? 'ᵉʳ' : 'ᵉ'} · ${depassements} dépassement${depassements > 1 ? 's' : ''} · ${arrets} arrêt${arrets > 1 ? 's' : ''}`;
    }
    return {
      titre: `Arrivée · Grand Prix de ${nom} · ${tours} tour${tours > 1 ? 's' : ''}`,
      vainqueur,
      sousTitre,
      podium: rangs.filter(r => !r.abandon).slice(0, 3),
      lignes: rangs,
      meilleurTour: meilleur === null ? null : `${Chronometrage.formater(meilleur.temps)} · ${meilleur.voiture.pilote.code}`,
    };
  }

  // parent = le calque de l'interface (#f1-ui) ; actions : rejouer(), menu().
  constructor(parent, actions = {}) {
    const { el } = DomF1;
    this.actions = actions;
    this.racine = el('div', 'podium-fin');
    this.racine.id = 'f1-podium';
    this.racine.setAttribute('role', 'dialog');
    this.racine.setAttribute('aria-label', 'Podium de fin de course');
    this.racine.hidden = true;
    parent.appendChild(this.racine);
    this.course = null;
  }

  get visible() {
    return !this.racine.hidden;
  }

  // visible : la course est finie depuis DELAI et aucun autre écran de fin n'est montré
  // (championnat, défi, REJOUER après un accident).
  mettreAJour(course, { visible = false } = {}) {
    DomF1.cacher(this.racine, !visible);
    if (!visible) {
      this.course = null;
      return;
    }
    if (this.course === course) return;
    this.course = course;
    this.construire(PodiumFin.donnees(course));
  }

  construire(d) {
    const { el, rgb } = DomF1;
    const titre = el('div', 'podium-titres');
    titre.appendChild(el('span', 'lbl podium-surtitre', d.titre));
    const h1 = el('h1', 'cond podium-victoire', 'VICTOIRE DE ');
    const code = el('span', '', d.vainqueur ? d.vainqueur.pilote.code : '—');
    if (d.vainqueur) code.style.color = rgb(Livrees.ui(d.vainqueur.ecurie));
    h1.appendChild(code);
    titre.appendChild(h1);
    titre.appendChild(el('span', 'podium-sous-titre', d.sousTitre));
    // marches : 2e, 1er, 3e
    const marches = el('div', 'podium-marches');
    const hauteurs = [210, 150, 110];
    [1, 0, 2].forEach(k => {
      const r = d.podium[k];
      const colonne = el('div', 'podium-colonne');
      if (r) {
        const tete = el('div', 'podium-tete');
        tete.appendChild(el('div', 'cond podium-code', r.code));
        tete.appendChild(el('div', 'podium-ecurie', r.ecurie));
        tete.appendChild(el('div', `mono podium-temps${k === 0 ? ' premier' : ''}`, r.temps));
        colonne.appendChild(tete);
      }
      const marche = el('div', `podium-marche${k === 0 ? ' premier' : ''}`);
      marche.style.height = `${hauteurs[k]}px`;
      const bande = el('span', 'podium-bande');
      if (r) bande.style.background = rgb(r.couleur);
      marche.appendChild(bande);
      marche.appendChild(el('span', `cond podium-rang rang-${k + 1}`, String(k + 1)));
      colonne.appendChild(marche);
      marches.appendChild(colonne);
    });
    // classement final
    const table = el('section', 'podium-classement glass');
    table.setAttribute('aria-label', 'Classement final');
    const entete = el('div', 'podium-entete');
    entete.appendChild(el('span', 'cond podium-entete-titre', 'CLASSEMENT FINAL'));
    const mt = el('span', 'lbl', 'Meilleur tour ');
    mt.appendChild(el('span', 'mono podium-meilleur', d.meilleurTour ?? '—'));
    entete.appendChild(mt);
    table.appendChild(entete);
    const colonnes = el('div', 'podium-ligne lbl podium-colonnes');
    for (const t of ['P', '', 'Pilote', 'Écurie', 'Temps / écart', 'Pts']) colonnes.appendChild(el('span', '', t));
    table.appendChild(colonnes);
    d.lignes.forEach((r, k) => {
      const ligne = el('div', `podium-ligne${k === 0 ? ' vainqueur' : ''}${r.abandon ? ' abandon' : ''}`);
      ligne.appendChild(el('span', 'cond podium-pos', r.position));
      const bande = el('span', 'podium-trait');
      bande.style.background = rgb(r.couleur);
      ligne.appendChild(bande);
      ligne.appendChild(el('span', 'cond podium-ligne-code', r.code));
      ligne.appendChild(el('span', 'podium-ligne-ecurie', r.ecurie));
      const temps = el('span', `mono podium-ligne-temps${r.meilleur ? ' meilleur' : ''}`, r.temps);
      if (r.penalite !== null) temps.appendChild(el('span', 'penalite-badge', ` ${r.penalite}`));
      ligne.appendChild(temps);
      ligne.appendChild(el('span', 'mono podium-points', r.bonus ? `${r.points - Championnat.POINT_MEILLEUR_TOUR}+${Championnat.POINT_MEILLEUR_TOUR}` : String(r.points)));
      table.appendChild(ligne);
    });
    // boutons
    const boutons = el('div', 'podium-boutons');
    const rejouer = el('button', 'cond bouton-principal', 'REJOUER');
    rejouer.type = 'button';
    // le bouton rend le focus avant d'agir (les touches vont ensuite au jeu, ou au menu)
    rejouer.addEventListener('click', () => { rejouer.blur(); (this.actions.rejouer ?? (() => {}))(); });
    const menu = el('button', 'cond bouton-discret', 'MENU');
    menu.type = 'button';
    menu.addEventListener('click', () => { menu.blur(); (this.actions.menu ?? (() => {}))(); });
    boutons.appendChild(rejouer);
    boutons.appendChild(menu);
    this.boutons = { rejouer, menu };
    this.racine.replaceChildren(el('div', 'podium-halo'), titre, marches, table, boutons);
  }
}
