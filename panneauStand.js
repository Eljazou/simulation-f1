// Arrêt au stand de la voiture suivie, en HTML (design/ : « Pit stop ») : le limiteur (en bas à
// gauche, au-dessus du HUD) et le panneau de l'arrêt (en bas, centré, au-dessus du bandeau) :
// pneus avant -> après, chrono d'immobilisation, record de l'équipe, état de chaque roue, phases
// entrée / arrêt / sortie et temps passé dans la voie. Ce n'est pas un Vehicle : il lit la voiture
// (phaseStand, arret, typePneus, pneuDemande) et l'équipe de son box (EquipeDeStand : état, roues,
// dernierArret), et ne change rien. Les durées sont mesurées en temps de COURSE (tempsCourse),
// pas en temps réel : elles restent justes quand la simulation est accélérée.
// Le design affiche aussi « Ressort estimé P5 devant LUN » : la course ne calcule pas cette
// estimation, elle n'est pas inventée (le pied du panneau montre le numéro de l'arrêt et la
// pénalité éventuelle).
class PanneauStand {
  static NOMS_ROUES = { AVG: 'AV G', AVD: 'AV D', ARG: 'AR G', ARD: 'AR D' };

  // Vitesse du limiteur des stands, en km/h (même conversion que le HUD).
  static limiteurKmh() {
    return Math.round(VoitureF1.VITESSE_STANDS * VoiturePilote.KMH);
  }

  // L'état d'une roue pour l'affichage : { nom, texte, etat : 'fini' | 'encours' | 'attente' }.
  static roue(r) {
    const nom = PanneauStand.NOMS_ROUES[r.nom] ?? r.nom;
    if (r.fini) return { nom, texte: `✓ ${r.duree.toFixed(2)}`, etat: 'fini' };
    if (r.temps > 0) return { nom, texte: 'en cours', etat: 'encours' };
    return { nom, texte: '—', etat: 'attente' };
  }

  // parent = le calque de l'interface (#f1-ui).
  constructor(parent) {
    const { el } = DomF1;
    // limiteur
    this.limiteur = el('section', 'stand-limiteur glass');
    this.limiteur.id = 'f1-limiteur';
    this.limiteur.setAttribute('aria-label', 'Limiteur des stands');
    const valeur = el('div');
    valeur.appendChild(el('div', 'stand-limite cond', String(PanneauStand.limiteurKmh())));
    valeur.appendChild(el('div', 'lbl', 'km/h'));
    const texte = el('div', 'stand-limiteur-texte');
    texte.appendChild(el('span', 'stand-badge cond', 'LIMITEUR'));
    texte.appendChild(el('span', 'stand-limiteur-detail', `Voie des stands · ${PanneauStand.limiteurKmh()} km/h max`));
    this.limiteur.appendChild(valeur);
    this.limiteur.appendChild(texte);
    this.limiteur.hidden = true;
    // panneau de l'arrêt
    this.racine = el('section', 'stand-arret glass');
    this.racine.id = 'f1-arret';
    this.racine.setAttribute('aria-label', 'Arrêt au stand en cours');
    const entete = el('div', 'stand-entete');
    const gauche = el('div', 'stand-entete-gauche');
    gauche.appendChild(el('span', 'stand-trait'));
    gauche.appendChild(el('span', 'stand-titre cond', 'ARRÊT AU STAND'));
    this.code = el('span', 'stand-code cond');
    gauche.appendChild(this.code);
    const pneus = el('span', 'stand-pneus');
    this.avant = el('span', 'stand-pneu-avant');
    this.apres = el('span', 'pneu');
    pneus.appendChild(this.avant);
    pneus.appendChild(el('span', 'stand-fleche', '→'));
    pneus.appendChild(this.apres);
    entete.appendChild(gauche);
    entete.appendChild(pneus);
    const corps = el('div', 'stand-corps');
    const chrono = el('div');
    this.chrono = el('div', 'stand-chrono mono', '—');
    this.record = el('div', 'lbl stand-record');
    chrono.appendChild(this.chrono);
    chrono.appendChild(this.record);
    const roues = el('div', 'stand-roues');
    this.roues = ['AVG', 'AVD', 'ARG', 'ARD'].map(nom => {
      const case_ = el('div', 'stand-roue');
      const n = el('span', 'cond stand-roue-nom', PanneauStand.NOMS_ROUES[nom]);
      const t = el('span', 'mono stand-roue-temps', '—');
      case_.appendChild(n);
      case_.appendChild(t);
      roues.appendChild(case_);
      return { case_, t };
    });
    corps.appendChild(chrono);
    corps.appendChild(roues);
    const phases = el('div', 'stand-phases');
    this.phases = ['Entrée', 'Arrêt', 'Sortie'].map(nom => {
      const p = el('div', 'stand-phase');
      const barre = el('div', 'stand-phase-barre');
      const pied = el('div', 'lbl stand-phase-pied');
      pied.appendChild(el('span', '', nom));
      const t = el('span', 'mono');
      pied.appendChild(t);
      p.appendChild(barre);
      p.appendChild(pied);
      phases.appendChild(p);
      return { p, barre, t };
    });
    const pied = el('div', 'stand-pied');
    this.numero = el('span');
    this.voie = el('span');
    pied.appendChild(this.numero);
    pied.appendChild(this.voie);
    for (const e of [entete, corps, phases, pied]) this.racine.appendChild(e);
    this.racine.hidden = true;
    parent.appendChild(this.limiteur);
    parent.appendChild(this.racine);
    // suivi de l'arrêt en cours : voiture, instants des changements de phase, pneus d'avant
    this.suivi = null;
    this.records = new Map();
  }

  // Une mise à jour (10 Hz). suivie = la voiture suivie (ou null).
  mettreAJour(course, suivie, { panneauOuvert = false, hud = true } = {}) {
    const { cacher, texte, classe, style } = DomF1;
    const v = suivie;
    const auStand = v !== null && v.phaseStand !== null && v.phaseStand !== undefined;
    const t = course.tempsCourse;
    if (!auStand) {
      // l'arrêt terminé : on garde le record de l'équipe
      this.suivi = null;
      cacher(this.racine, true);
      cacher(this.limiteur, true);
      return;
    }
    if (this.suivi === null || this.suivi.voiture !== v) {
      this.suivi = { voiture: v, avant: v.typePneus, debut: { [v.phaseStand]: t }, phase: v.phaseStand, numero: v.arretsAuStand + 1 };
    }
    const s = this.suivi;
    if (v.phaseStand !== s.phase) {
      s.debut[v.phaseStand] = t;
      s.phase = v.phaseStand;
    }
    const { ENTREE, ARRET, SORTIE, GARAGE } = VoitureF1.PHASES_STAND;
    cacher(this.racine, false);
    classe(this.racine, 'panneau-ouvert', panneauOuvert);
    cacher(this.limiteur, v.etat !== VoitureF1.ETATS.STAND);
    classe(this.limiteur, 'sans-hud', !hud);
    texte(this.code, v.pilote.code);
    style(this.code, 'color', DomF1.rgb(DomF1.eclaircir(Livrees.ui(v.ecurie))));
    // pneus : avant -> après (le type demandé, posé à la fin de l'arrêt)
    const lettreAvant = DomF1.lettrePneu(s.avant);
    const lettreApres = DomF1.lettrePneu(v.pneuDemande ?? v.typePneus);
    texte(this.avant, lettreAvant);
    texte(this.apres, lettreApres);
    if (this.apres.className !== `pneu ${lettreApres}`) this.apres.className = `pneu ${lettreApres}`;
    // chrono d'immobilisation : celui de l'équipe (arrêt spectaculaire), sinon celui de la voiture
    const equipe = course.stands?.equipeDe?.(v) ?? null;
    const E = EquipeDeStand.ETATS;
    let chrono = null;
    if (equipe !== null && equipe.voiture === v && [E.PENALITE, E.TRAVAIL, E.LIBERATION].includes(equipe.etat)) chrono = equipe.temps;
    else if (equipe !== null && equipe.dernierArret?.voiture === v && v.phaseStand === SORTIE) chrono = equipe.dernierArret.duree;
    else if (equipe === null && (v.phaseStand === ARRET || v.phaseStand === GARAGE)) chrono = v.arret;
    texte(this.chrono, chrono === null ? '—' : chrono.toFixed(2));
    // record de l'équipe : le plus court de ses arrêts terminés (pénalité comprise)
    if (equipe !== null && equipe.dernierArret) {
      const d = equipe.dernierArret.duree;
      if (!this.records.has(equipe) || d < this.records.get(equipe).duree) this.records.set(equipe, { duree: d });
    }
    const record = equipe !== null && this.records.has(equipe) ? this.records.get(equipe).duree : null;
    texte(this.record, record === null ? 'secondes · premier arrêt de l’équipe' : `secondes · record équipe ${record.toFixed(2)}`);
    // roues
    const roues = equipe !== null && equipe.voiture === v && equipe.roues ? equipe.roues : null;
    this.roues.forEach(({ case_, t: temps }, k) => {
      const r = roues === null ? null : PanneauStand.roue(roues[k]);
      texte(temps, r === null ? (v.phaseStand === SORTIE ? '✓' : '—') : r.texte);
      classe(case_, 'fini', r !== null ? r.etat === 'fini' : v.phaseStand === SORTIE);
      classe(case_, 'encours', r !== null && r.etat === 'encours');
    });
    // phases : durée de l'entrée (jusqu'à l'arrêt), avancée de l'arrêt, durée de la sortie
    const fin = (a, b) => (s.debut[b] !== undefined ? s.debut[b] : t) - s.debut[a];
    const [entree, arret, sortie] = this.phases;
    const finies = roues === null ? (v.phaseStand === SORTIE ? 4 : 0) : roues.filter(r => r.fini).length;
    const etats = {
      entree: s.debut[ENTREE] === undefined ? null : fin(ENTREE, s.debut[ARRET] !== undefined ? ARRET : GARAGE),
      sortie: s.debut[SORTIE] === undefined ? null : t - s.debut[SORTIE],
    };
    classe(entree.p, 'faite', v.phaseStand !== ENTREE);
    classe(entree.p, 'courante', v.phaseStand === ENTREE);
    texte(entree.t, etats.entree === null ? '' : `${etats.entree.toFixed(1)} s`);
    classe(arret.p, 'courante', v.phaseStand === ARRET || v.phaseStand === GARAGE);
    classe(arret.p, 'faite', v.phaseStand === SORTIE);
    style(arret.barre, '--part', `${Math.round(finies / 4 * 100)}%`);
    classe(sortie.p, 'courante', v.phaseStand === SORTIE);
    texte(sortie.t, etats.sortie === null ? '' : `${etats.sortie.toFixed(1)} s`);
    // pied : numéro de l'arrêt, pénalité, temps passé dans la voie
    const penalite = v.penaliteStand > 0 ? ` · pénalité +${v.penaliteStand} s` : '';
    texte(this.numero, `Arrêt n° ${s.numero}${penalite}`);
    const premier = Math.min(...Object.values(s.debut));
    texte(this.voie, `Dans la voie : ${(t - premier).toFixed(1)} s`);
  }
}
