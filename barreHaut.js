// Barre du haut (design/ écran principal : top 12 · left 12 · right 12 · h 40) : à gauche le bouton
// « Entraînement IA » (à la place du menu Scénario du design : ce projet n'a que le jeu F1), au centre un statut court (pastille du drapeau, état, tour, météo), à droite les
// boutons icônes (pause, caméra, panneau, aide). Elle lit la course. Le mode de jeu ne s'y
// affiche plus : il se choisit avec le bouton JOUER (menuModes.js).
class BarreHaut {
  static ETATS = { PRESENTATION: 'Présentation', FEUX: 'Départ', COURSE: 'Course', SAFETY_CAR: 'Safety car', VSC: 'VSC',
    RELANCE: 'Relance', ARRIVEE: 'Arrivée', FIN: 'Fin' };
  static PASTILLES = { vert: '#2ecc71', jaune: '#f5c518', sc: '#f5c518', vsc: '#f5c518', damier: '#e6edf3' };
  // Icônes météo du design (soleil, lune, pluie) et leurs couleurs.
  static METEO = {
    soleil: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', '#f5c518'],
    lune: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', '#c9d6ff'],
    pluie: ['M7 15a4 4 0 1 1 1-7.9A6 6 0 0 1 19 9a3.5 3.5 0 0 1-1 6.9M8 18l-1 3M12 18l-1 3M16 18l-1 3', '#7dbbff'],
  };

  // Le statut court : { etat, couleur, tour, tours, meteo: { icone, couleur, texte } } (données pures).
  static statut(course, nuit = false) {
    const m = course.meteo;
    const pluie = m.etat !== Meteo.ETATS.SEC;
    const icone = pluie ? 'pluie' : nuit ? 'lune' : 'soleil';
    const texteMeteo = pluie ? `${m.etat === Meteo.ETATS.ORAGE ? 'Orage' : m.etat === Meteo.ETATS.BRUINE ? 'Bruine' : 'Pluie'} · ${Math.round(m.intensite * 100)} %`
      : nuit ? 'Nuit · sec' : 'Sec';
    return {
      etat: course.pause ? 'Pause' : BarreHaut.ETATS[course.etat] ?? String(course.etat),
      couleur: course.pause ? '#8b949e' : BarreHaut.PASTILLES[course.drapeau] ?? '#2ecc71',
      tour: TourClassement.tourEnCours(course),
      tours: course.parametres.nombreTours,
      meteo: { icone: BarreHaut.METEO[icone][0], couleur: BarreHaut.METEO[icone][1], texte: texteMeteo },
    };
  }

  // actions : pause(), camera(), panneau(), aide(), entrainement() (ouvre la page d'entraînement IA).
  constructor(actions) {
    const $ = id => document.getElementById(id);
    this.dom = {
      entrainement: $('f1-bouton-entrainement'), pastille: $('f1-statut-pastille'), etat: $('f1-statut-etat'),
      tour: $('f1-statut-tour'), tours: $('f1-statut-tours'), meteo: $('f1-statut-meteo'), icone: $('f1-statut-meteo-icone'),
      meteoTexte: $('f1-statut-meteo-texte'), pause: $('f1-bouton-pause'),
    };
    for (const [id, action] of [['f1-bouton-entrainement', actions.entrainement ?? (() => {})], ['f1-bouton-pause', actions.pause], ['f1-bouton-camera', actions.camera], ['f1-bouton-panneau', actions.panneau], ['f1-bouton-aide', actions.aide]]) {
      $(id).addEventListener('click', () => { action(); $(id).blur(); });
    }
  }

  mettreAJour(formule1, course, nuit = false) {
    const s = BarreHaut.statut(course, nuit);
    const { texte, style, attribut } = DomF1;
    style(this.dom.pastille, 'background', s.couleur);
    texte(this.dom.etat, s.etat);
    texte(this.dom.tour, s.tour);
    texte(this.dom.tours, s.tours);
    attribut(this.dom.icone, 'd', s.meteo.icone);
    style(this.dom.meteo, 'color', s.meteo.couleur);
    texte(this.dom.meteoTexte, s.meteo.texte);
    attribut(this.dom.pause, 'aria-pressed', course.pause ? 'true' : 'false');
    DomF1.classe(this.dom.pause, 'actif', course.pause);
  }
}
