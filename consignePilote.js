// Consigne du mode pilote : une bulle sous la barre du haut qui dit quoi faire. Ce n'est pas un
// Vehicle : elle lit la course et le scénario, et ne change rien.
//   aucun pilote choisi      « Clique sur une voiture pour la piloter »
//   un pilote                « Tu pilotes MIR · WASD / flèches »
//   défi (voiture imposée)   « Défi : tu pilotes MIR · WASD / flèches »
//   deux joueurs             « J1 MIR · WASD + Espace — J2 TAV · flèches + Entrée — clic : J2 »
//   deux joueurs, au choix   « J1 : clique sur ta voiture », puis « J1 MIR — J2 : clique sur ta
//                            voiture » (menu JOUER : la course attend les deux)
//   menu (écran de fin)      « Menu · choisis le mode, puis P pour lancer » (ou
//                            « … puis clique sur une voiture pour la piloter »)
// Elle reste affichée avant le départ et pendant DUREE_APRES_DEPART secondes de course, puis
// s'efface ; elle n'apparaît pas sans mode pilote (spectateur).
class ConsignePilote {
  static DUREE_APRES_DEPART = 4;

  // Le texte pour l'état de la course, ou null (rien à afficher). formule1 = le scénario.
  static texte(formule1, course) {
    const { PRESENTATION, FEUX, COURSE } = Course.ETATS;
    if (formule1.enMenu) {
      const choix = course.parametres.modePilote && course.joueur === null ? 'clique sur une voiture pour la piloter' : 'P pour lancer';
      return `Menu · choisis le mode, puis ${choix}`;
    }
    // incident du joueur en cours : la radio et la séquence parlent, pas la consigne
    if ((course.incidentJoueur ?? null) !== null) return null;
    const avantDepart = [PRESENTATION, FEUX].includes(course.etat);
    const debut = course.etat === COURSE && course.chronometrage.tempsCourse < ConsignePilote.DUREE_APRES_DEPART;
    if (!course.parametres.modePilote || !(avantDepart || debut)) return null;
    if (course.multijoueur) {
      const [j1, j2] = course.joueurs.map(j => j.pilote.code);
      const clic = avantDepart ? ` — clic : J${formule1.prochainJoueur + 1}` : '';
      return `J1 ${j1} · WASD + Espace — J2 ${j2} · flèches + Entrée${clic}`;
    }
    if (formule1.mode === 'multijoueur' && (course.joueursAttendus ?? 1) === 2 && avantDepart) {
      return course.joueur === null ? 'J1 : clique sur ta voiture' : `J1 ${course.joueur.pilote.code} — J2 : clique sur ta voiture`;
    }
    if (course.joueur === null) return avantDepart ? 'Clique sur une voiture pour la piloter' : null;
    const code = course.joueur.pilote.code;
    return formule1.mode === 'defi' ? `Défi : tu pilotes ${code} · WASD / flèches` : `Tu pilotes ${code} · WASD / flèches`;
  }

  // parent = le calque de l'interface (#f1-ui).
  constructor(parent) {
    this.racine = DomF1.el('div', 'consigne glass cond');
    this.racine.id = 'f1-consigne';
    this.racine.setAttribute('role', 'status');
    this.racine.hidden = true;
    parent.appendChild(this.racine);
  }

  // Une image : n'écrit dans la page que ce qui change.
  mettreAJour(formule1, course) {
    const t = ConsignePilote.texte(formule1, course);
    DomF1.cacher(this.racine, t === null);
    if (t !== null) DomF1.texte(this.racine, t);
  }
}
