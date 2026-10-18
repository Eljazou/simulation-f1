// HUD du mode pilote : ce que le joueur voit de sa voiture, dessiné par-dessus la scène dans le
// repère de l'écran. Il ne bouge pas et ne possède rien : il lit la Course et la voiture du joueur.
// Contenu : vitesse et rapport, position, tours, temps au tour et meilleur tour, écarts devant
// et derrière (intervalles du chronométrage), pneus (type et usure), météo, jauge DRS,
// pénalités ; en accident, un bandeau.
class HudPilote {
  static LARGEUR = 300;
  static HAUTEUR = 118;
  // Placé dans le coin en bas à gauche, sous la tour de classement : le bas-centre est réservé au
  // bandeau des événements.
  static MARGE = 10;

  show(course, largeur, hauteur) {
    const j = course.joueur;
    if (j === null) {
      if (course.parametres.modePilote) this.showChoix(largeur);
      return;
    }
    const x = HudPilote.MARGE;
    const y = hauteur - HudPilote.HAUTEUR - HudPilote.MARGE;
    const position = course.classement().indexOf(j) + 1;
    const meteo = course.meteo.resume();
    push();
    textFont('sans-serif');
    noStroke();
    fill(10, 12, 18, 210);
    rect(x, y, HudPilote.LARGEUR, HudPilote.HAUTEUR, 8);
    // vitesse et rapport
    fill(255);
    textAlign(LEFT, TOP);
    textSize(30);
    text(String(j.kmh), x + 12, y + 8);
    textSize(11);
    fill(180);
    text('km/h', x + 14, y + 42);
    fill(255, 210, 90);
    textSize(26);
    text(String(j.rapport), x + 78, y + 10);
    // position, tour, temps
    fill(255);
    textSize(13);
    text(`P${position}/${course.voitures.length}   Tour ${Math.min(course.parametres.nombreTours, Math.max(1, j.tour + 1))}/${course.parametres.nombreTours}`, x + 112, y + 10);
    fill(200);
    textSize(11);
    // temps du chronométrage : tour en cours, meilleur tour personnel, intervalles (aux points)
    const chrono = course.chronometrage;
    const meilleur = chrono.meilleurPersonnel(j);
    text(`Tour : ${Chronometrage.formater(chrono.tempsTourEnCours(j))}   Meilleur : ${meilleur === null ? '—' : Chronometrage.formater(meilleur.temps)}`, x + 112, y + 30);
    const intervalles = chrono.ecarts('intervalle');
    const ordre = chrono.classement();
    const suivante = ordre[ordre.indexOf(j) + 1];
    const devant = position > 1 ? intervalles.get(j)?.texte || '—' : '—';
    const derriere = suivante ? intervalles.get(suivante)?.texte || '—' : '—';
    text(`Devant : ${devant}   Derrière : ${derriere}`, x + 112, y + 46);
    // pneus
    const pneu = Pneus.type(j.typePneus);
    fill(...pneu.couleur);
    circle(x + 20, y + 76, 16);
    fill(30);
    circle(x + 20, y + 76, 8);
    fill(220);
    text(`${pneu.libelle} ${Math.round(j.pneus * 100)} %${j.pneuChoisi ? ` → ${Pneus.type(j.pneuChoisi).libelle}` : ''}`, x + 34, y + 70);
    // météo
    text(`${meteo.etat} · adhérence ${Math.round(meteo.adherence * 100)} %`, x + 34, y + 88);
    // DRS : gris indisponible, vert disponible, vert vif actif
    fill(...(j.drsActif ? [80, 255, 120] : j.drsDisponible ? [40, 140, 70] : [70, 70, 70]));
    rect(x + 210, y + 68, 76, 18, 4);
    fill(255);
    textAlign(CENTER, CENTER);
    text(j.drsActif ? 'DRS OUVERT' : 'DRS', x + 248, y + 77);
    textAlign(LEFT, TOP);
    // pénalités et stand
    fill(255, 120, 90);
    if (j.penalites > 0) text(`Pénalités : +${j.penalites} s`, x + 210, y + 92);
    if (j.demandeStand) {
      fill(255, 220, 90);
      text('STAND demandé', x + 112, y + 92);
    }
    if (j.accidentee) {
      fill(200, 20, 20, 220);
      rect(largeur / 2 - 160, hauteur / 2 - 30, 320, 60, 8);
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(30);
      text('ACCIDENT', largeur / 2, hauteur / 2);
    }
    pop();
  }

  // Avant le départ, en mode pilote : le joueur doit choisir sa voiture.
  showChoix(largeur) {
    push();
    noStroke();
    fill(10, 12, 18, 220);
    rect(largeur / 2 - 230, 70, 460, 34, 8);
    fill(255, 230, 120);
    textAlign(CENTER, CENTER);
    textSize(15);
    text('Mode pilote : cliquez sur une voiture de la grille (ou Tab)', largeur / 2, 87);
    pop();
  }
}
