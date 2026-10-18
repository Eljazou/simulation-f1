// Onglet Prédiction du panneau latéral (design/ « Onglets Prédiction · Historique · Réglages ») :
// probabilité de victoire, de podium ou de top 5 (segments), une ligne par voiture dans l'ordre de
// la course, barre (celle du pilote suivi en rouge), pourcentage et variation depuis le passage de
// ligne précédent (Δ tour). Formule : voir prediction.js (softmax documenté). Recalculé à chaque
// passage de ligne (un tour bouclé par une voiture) et à chaque nouvelle course.
class OngletPrediction {
  static MODES = { victoire: 1, podium: 3, top5: 5 };
  static TITRES = { victoire: 'Probabilité de victoire', podium: 'Probabilité de podium', top5: 'Probabilité de top 5' };

  constructor(conteneur) {
    this.conteneur = conteneur;
    this.mode = 'victoire';
    this.cle = null;
    this.course = null;
    this.probas = new Map();
    this.precedentes = new Map();
    this.lignes = new Map();
    const $ = id => document.getElementById(id);
    this.dom = { titre: $('f1-pred-titre'), tour: $('f1-pred-tour'), milieu: $('f1-pred-milieu'), max: $('f1-pred-max') };
    this.boutons = { victoire: $('f1-pred-victoire'), podium: $('f1-pred-podium'), top5: $('f1-pred-top5') };
    Object.entries(this.boutons).forEach(([mode, bouton]) => bouton.addEventListener('click', () => {
      this.choisirMode(mode);
      bouton.blur();
    }));
  }

  choisirMode(mode) {
    if (!Object.hasOwn(OngletPrediction.MODES, mode)) throw new RangeError(`Mode de prédiction inconnu : ${mode}.`);
    this.mode = mode;
    this.cle = null;
    this.precedentes.clear();
  }

  // Le moment du calcul : la somme des tours bouclés (change à chaque passage de ligne).
  static passages(course) {
    return course.voitures.reduce((s, v) => s + course.chronometrage.tours(v).length, 0) + (course.chronometrage.vainqueur ? 1 : 0);
  }

  // Probabilités du mode courant.
  static calculer(course, mode) {
    const k = OngletPrediction.MODES[mode];
    return k === 1 ? Prediction.probabilites(course) : Prediction.probabilitesTop(course, k);
  }

  ligneDe(voiture) {
    if (this.lignes.has(voiture)) return this.lignes.get(voiture);
    const { el } = DomF1;
    const ligne = el('div', 'ligne-pred');
    const pos = el('span', 'pos cond');
    const bande = el('span', 'bande');
    bande.style.background = DomF1.rgb(Livrees.ui(voiture.ecurie));
    const code = el('span', 'code cond', voiture.pilote.code);
    const piste = el('span', 'piste');
    const barre = el('span', 'barre');
    piste.appendChild(barre);
    const pct = el('span', 'pct mono');
    const delta = el('span', 'delta mono');
    for (const e of [pos, bande, code, piste, pct, delta]) ligne.appendChild(e);
    const d = { ligne, pos, barre, pct, delta };
    this.lignes.set(voiture, d);
    return d;
  }

  mettreAJour(course, suivie = null) {
    // nouvelle course (même objet Course, nouvelles voitures) : les lignes repartent de zéro
    if (course !== this.course || course.numeroCourse !== this.numeroCourse) {
      this.course = course;
      this.numeroCourse = course.numeroCourse;
      this.cle = null;
      this.precedentes.clear();
      this.lignes.clear();
      this.conteneur.replaceChildren();
    }
    const cle = OngletPrediction.passages(course);
    if (cle !== this.cle) {
      if (this.cle !== null) this.precedentes = this.probas;
      this.probas = OngletPrediction.calculer(course, this.mode);
      this.cle = cle;
    }
    const { texte, classe, style } = DomF1;
    Object.entries(this.boutons).forEach(([mode, b]) => classe(b, 'on', mode === this.mode));
    texte(this.dom.titre, OngletPrediction.TITRES[this.mode]);
    const tour = TourClassement.tourEnCours(course);
    texte(this.dom.tour, !course.chronometrage.demarre ? 'Avant le départ' : `Après tour ${Math.max(0, tour - 1)}/${course.parametres.nombreTours}`);
    // échelle : 0 à 40 % comme le design, élargie si une probabilité dépasse
    const max = Math.max(...this.probas.values(), 0);
    const echelle = max <= 0.4 ? 0.4 : max <= 0.6 ? 0.6 : 1;
    texte(this.dom.milieu, String(Math.round(echelle * 50)));
    texte(this.dom.max, `${Math.round(echelle * 100)} %`);
    const ordre = course.classement();
    const chrono = course.chronometrage;
    let rang = 0;
    ordre.forEach(v => {
      const d = this.ligneDe(v);
      if (d.ligne.parentNode !== this.conteneur || this.conteneur.children[rang] !== d.ligne) this.conteneur.appendChild(d.ligne);
      rang++;
      const abandon = chrono.abandon(v) || v.horsCourse;
      const p = this.probas.get(v) ?? 0;
      texte(d.pos, abandon ? '—' : String(ordre.indexOf(v) + 1));
      style(d.barre, 'width', `${Math.min(100, (p / echelle) * 100).toFixed(1)}%`);
      texte(d.pct, abandon ? 'ABD' : `${(p * 100).toFixed(1).replace('.', ',')} %`);
      const avant = this.precedentes.get(v);
      const delta = avant === undefined || abandon ? null : (p - avant) * 100;
      texte(d.delta, delta === null ? '' : delta === 0 ? '0.0' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`);
      style(d.delta, 'color', delta === null || Math.abs(delta) < 0.05 ? '#8b949e' : delta > 0 ? '#2ecc71' : '#e74c3c');
      classe(d.ligne, 'suivie', v === suivie);
      classe(d.ligne, 'abandon', abandon);
    });
  }
}
