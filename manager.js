// Mode manager du scénario « Circuit Formule 1 » : le joueur dirige une écurie au lieu de piloter.
// Il appelle ses voitures au stand (avec les pneus de son choix), donne une consigne d'allure
// (attaque, normal, économie : voir VoitureF1.CONSIGNES) et des ordres d'équipe (la voiture de
// devant laisse passer sa coéquipière ; elle peut refuser selon son obéissance). La stratégie
// automatique ne touche plus l'écurie dirigée (Course.ecurieGeree). Ce n'est pas un Vehicle : il ne
// fait que transmettre des décisions aux voitures, qui se pilotent toujours par leurs forces.
class Manager {
  static LARGEUR = 300;

  // course = la Course ; ecurie = l'une des Course.ECURIES (par défaut : la première).
  constructor(course, ecurie = Course.ECURIES[0]) {
    this.alea = Circuit.generateur(Course.GRAINE + 7);
    this.diriger(course, ecurie);
  }

  // Prend la direction d'une écurie (le panneau peut en changer).
  diriger(course, ecurie) {
    if (!Course.ECURIES.includes(ecurie)) throw new RangeError(`Écurie inconnue : ${ecurie?.nom}.`);
    this.ecurie = ecurie;
    course.ecurieGeree = ecurie;
  }

  // Les voitures de l'écurie, dans l'ordre de la grille.
  voitures(course) {
    return course.voitures.filter(v => v.ecurie === this.ecurie);
  }

  // La k-ième voiture de l'écurie (0 ou 1), ou null.
  voiture(course, k) {
    return this.voitures(course)[k] ?? null;
  }

  // Appel au stand : au prochain passage devant la voie, avec ces pneus. Refusé (false) si la
  // voiture n'est pas de l'écurie, déjà au stand ou hors course.
  rentrer(course, voiture, pneus) {
    Pneus.type(pneus);
    if (voiture === null || voiture.ecurie !== this.ecurie || voiture.auStand || voiture.horsCourse) return false;
    voiture.demanderStand();
    voiture.pneuDemande = pneus;
    voiture.raisonStand = 'manager';
    course.radio(voiture, `Manager : « Box, box ! Pneus ${Pneus.type(pneus).libelle}. »`);
    return true;
  }

  // Consigne d'allure.
  consigner(course, voiture, consigne) {
    if (voiture === null || voiture.ecurie !== this.ecurie) return false;
    voiture.consigner(consigne);
    const textes = { attaque: 'Attaque, on pousse !', normal: 'Rythme normal.', economie: 'Économise les pneus.' };
    course.radio(voiture, `Manager : « ${textes[consigne]} »`);
    return true;
  }

  // Ordre d'équipe : la voiture de devant laisse passer sa coéquipière (si elles sont toutes deux
  // en course). Renvoie { lent, rapide, refus } ou null.
  inverser(course) {
    const ordre = course.classement().filter(v => v.ecurie === this.ecurie && v.etat === VoitureF1.ETATS.COURSE && !v.horsCourse);
    if (ordre.length < 2) return null;
    const [lent, rapide] = ordre;
    course.radio(lent, `Manager : « ${lent.pilote.code}, laisse passer ${rapide.pilote.code}. »`);
    const refus = this.alea() > (lent.traits.obeissance ?? 1);
    if (refus) {
      course.radio(lent, `${lent.pilote.code} : « Négatif. Je garde ma place. »`);
    } else {
      lent.laisserPasserCoequipier(rapide, OrdresEquipe.cote(lent));
      course.evenement(`Ordre du manager : #${lent.numero} laisse passer #${rapide.numero}`);
    }
    return { lent, rapide, refus };
  }

  // Le mur des stands : chaque voiture de l'écurie (position, écart, pneus, usure, consigne).
  show(course, x, y) {
    const voitures = this.voitures(course);
    const ecarts = course.ecarts('leader');
    const ordre = course.classement();
    const ligne = 34;
    const hauteur = 26 + ligne * voitures.length;
    push();
    noStroke();
    fill(10, 12, 18, 220);
    rect(x, y, Manager.LARGEUR, hauteur, 6);
    fill(...this.ecurie.couleurs[0]);
    rect(x, y, 4, hauteur, 6, 0, 0, 6);
    fill(240);
    textSize(11);
    textAlign(LEFT, CENTER);
    text(`MUR DES STANDS · ${this.ecurie.nom}`, x + 10, y + 12);
    voitures.forEach((v, k) => {
      const yy = y + 26 + k * ligne;
      const e = ecarts.get(v);
      fill(230);
      textSize(11);
      text(`P${ordre.indexOf(v) + 1}  #${v.numero} ${v.pilote.code}  ${e?.texte ?? ''}`, x + 10, yy + 8);
      fill(170);
      textSize(10);
      const etat = v.horsCourse ? 'hors course' : v.auStand ? 'au stand' : v.demandeStand ? 'rentre au stand' : v.consigne;
      text(`${Pneus.type(v.typePneus).libelle} ${Math.round(v.pneus * 100)} % · ${Math.round(v.temperaturePneus)} °C · ${etat}`, x + 10, yy + 22);
      // barre d'usure
      fill(60);
      rect(x + Manager.LARGEUR - 70, yy + 4, 60, 6, 2);
      fill(...(v.pneus > 0.5 ? [80, 200, 110] : v.pneus > 0.3 ? [240, 200, 60] : [230, 60, 50]));
      rect(x + Manager.LARGEUR - 70, yy + 4, 60 * v.pneus, 6, 2);
    });
    pop();
    return hauteur;
  }
}
