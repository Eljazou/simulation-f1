// Classement : l'habillage télévisé de la course, dessiné par-dessus la scène, dans le repère de
// l'écran. Il ne bouge pas et ne possède rien : il lit la Course et la dessine. Contenu :
//   - à gauche, la tour de classement (celui du chronométrage) : position, couleur d'écurie,
//     numéro, code du pilote, écart au leader ou intervalle (bouton du panneau ; après l'arrivée,
//     temps final du vainqueur puis écarts figés), pneus (type et usure), dernier tour (violet :
//     meilleur de la course, vert : meilleur personnel, jaune : autre ; IN / OUT au stand), et
//     une étiquette (PIT, DRS, ARR...) ;
//   - en haut, les tours, le temps de course (figé à l'arrivée du vainqueur), le drapeau en
//     cours et le meilleur tour ;
//   - au centre, les 5 feux de départ ; en bas, le bandeau des derniers événements.
class Classement {
  // Largeur de la tour de classement (la caméra laisse cette place libre à gauche).
  static LARGEUR = 336;
  static HAUTEUR_LIGNE_MAX = 22;
  static HAUTEUR_ENTETE = 64;
  static COULEURS_DRAPEAU = { vert: [40, 190, 90], jaune: [250, 210, 40], sc: [250, 150, 20], vsc: [250, 190, 30], damier: [240, 240, 240] };
  // Couleurs des temps : meilleur de la course, meilleur personnel, autre.
  static COULEURS_TEMPS = { violet: [190, 110, 255], vert: [70, 210, 90], jaune: [245, 205, 50] };

  // Couleur de l'état des pneus : vert (neufs), jaune, rouge (usés).
  static couleurPneus(pneus) {
    if (pneus > 0.6) return [70, 210, 90];
    if (pneus > 0.35) return [245, 205, 50];
    return [240, 70, 60];
  }

  // Texte et couleur du dernier tour d'une voiture : son temps, ou IN / OUT et le temps passé
  // dans la voie des stands.
  static dernierTour(chronometrage, voiture) {
    const fiche = chronometrage.dernierTour(voiture);
    if (fiche === null) return { texte: '', couleur: [150, 150, 150] };
    const couleur = Classement.COULEURS_TEMPS[chronometrage.couleurTour(voiture, fiche)];
    if (fiche.stand !== null) {
      const stand = fiche.tempsStand > 0 ? ` ${fiche.tempsStand.toFixed(1)}` : '';
      return { texte: `${fiche.stand}${stand}`, couleur: [150, 190, 255] };
    }
    return { texte: Chronometrage.formater(fiche.temps), couleur };
  }

  // Étiquette affichée au bout de la ligne d'une voiture.
  static etiquette(voiture) {
    const { STAND, DRAPEAU, ARRIVEE } = VoitureF1.ETATS;
    if (voiture.etat === ARRIVEE || voiture.arrivee) return 'ARR';
    if (voiture.accidentee) return 'OUT';
    if (voiture.horsCourse) return 'DNF';
    if (voiture.panne) return 'PANNE';
    if (voiture.laisserPasser) return 'ORDRE';
    if (voiture.etat === STAND) return 'PIT';
    if (voiture.incident) return 'LENT';
    if (voiture.drs) return 'DRS';
    if (voiture.etat === DRAPEAU) return 'SC';
    return '';
  }

  // course = la Course ; largeur, hauteur = taille de l'écran ; montrerTour = afficher la tour
  // de classement (case du panneau). Options : entete, bandeau, feux (faux quand l'interface HTML
  // les affiche). La pause reste dessinée ici.
  show(course, largeur, hauteur, montrerTour = true, { entete = true, bandeau = true, feux = true } = {}) {
    push();
    textFont('sans-serif');
    if (montrerTour) this.showTour(course, hauteur);
    if (entete) this.showEntete(course, largeur, montrerTour);
    if (feux && (course.etat === Course.ETATS.FEUX || course.etat === Course.ETATS.PRESENTATION)) this.showFeux(course, largeur);
    if (bandeau) this.showBandeau(course, largeur, hauteur);
    if (course.pause) this.showPause(largeur, hauteur);
    pop();
  }

  showTour(course, hauteur) {
    const voitures = course.classement();
    const ecarts = course.ecarts(course.affichage?.ecarts ?? 'leader');
    const ligne = Math.min(Classement.HAUTEUR_LIGNE_MAX, (hauteur - Classement.HAUTEUR_ENTETE - 20) / Math.max(1, voitures.length));
    const x = 10;
    let y = Classement.HAUTEUR_ENTETE;
    noStroke();
    fill(12, 14, 20, 215);
    rect(x - 4, y - 6, Classement.LARGEUR - 8, ligne * voitures.length + 12, 6);
    textSize(Math.max(9, ligne * 0.55));
    textAlign(LEFT, CENTER);
    voitures.forEach((voiture, rang) => {
      const milieu = y + ligne / 2;
      if (voiture === course.selection) {
        fill(255, 255, 255, 30);
        rect(x - 2, y, Classement.LARGEUR - 12, ligne);
      }
      fill(240);
      text(String(rang + 1).padStart(2, ' '), x + 2, milieu);
      fill(...voiture.ecurie.couleurs[0]);
      rect(x + 24, y + 3, 4, ligne - 6);
      fill(200);
      text(String(voiture.numero), x + 32, milieu);
      fill(255);
      text(voiture.pilote.code, x + 56, milieu);
      fill(190);
      text(ecarts.get(voiture)?.texte ?? '', x + 96, milieu);
      // pneus : couleur du type (flanc), anneau selon l'usure
      stroke(...Classement.couleurPneus(voiture.pneus));
      strokeWeight(2);
      fill(...Pneus.type(voiture.typePneus).couleur);
      circle(x + 208, milieu, ligne * 0.5);
      noStroke();
      const dernier = Classement.dernierTour(course.chronometrage, voiture);
      fill(...dernier.couleur);
      text(dernier.texte, x + 220, milieu);
      fill(230, 200, 90);
      text(Classement.etiquette(voiture), x + 290, milieu);
      y += ligne;
    });
  }

  showEntete(course, largeur, montrerTour) {
    const { tour, tours } = course.resume();
    const x = montrerTour ? 6 : 10;
    noStroke();
    fill(12, 14, 20, 215);
    rect(x, 8, Classement.LARGEUR - 8, 44, 6);
    fill(255);
    textAlign(LEFT, CENTER);
    textSize(15);
    text(course.etat === Course.ETATS.ARRIVEE ? 'ARRIVÉE' : `TOUR ${tour}/${tours}`, x + 10, 22);
    textSize(12);
    fill(200);
    text(Chronometrage.formater(course.tempsCourse), x + 10, 40);
    // drapeau en cours : un rectangle (à damier pour l'arrivée)
    const drapeau = course.drapeau;
    if (drapeau === 'damier') {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          fill((i + j) % 2 === 0 ? 245 : 20);
          rect(x + 150 + i * 7, 16 + j * 7, 7, 7);
        }
      }
    } else {
      fill(...Classement.COULEURS_DRAPEAU[drapeau]);
      rect(x + 150, 16, 28, 21, 2);
      if (drapeau === 'sc' || drapeau === 'vsc') {
        fill(20);
        textSize(10);
        textAlign(CENTER, CENTER);
        text(drapeau === 'sc' ? 'SC' : 'VSC', x + 164, 27);
        textAlign(LEFT, CENTER);
      }
      // VSC : le delta de la voiture suivie (positif : plus lente que la référence, comme il faut)
      if (drapeau === 'vsc') {
        const suivie = course.selection ?? course.joueur ?? course.leader;
        if (suivie) {
          fill(250, 190, 30);
          textSize(11);
          text(`Δ ${suivie.deltaVSC >= 0 ? '+' : ''}${suivie.deltaVSC.toFixed(1)}`, x + 186, 27);
        }
      }
    }
    // meilleur tour : à droite de l'en-tête (la droite de l'écran est prise par le panneau)
    if (course.meilleurTour !== null) {
      const { temps, voiture, numero } = course.meilleurTour;
      const gauche = x + Classement.LARGEUR;
      textAlign(LEFT, CENTER);
      textSize(12);
      fill(12, 14, 20, 200);
      rect(gauche, 8, 268, 26, 6);
      fill(...Classement.COULEURS_TEMPS.violet);
      text(`Meilleur tour  #${voiture.numero} ${voiture.pilote.code}  ${Chronometrage.formater(temps)} (T${numero})`, gauche + 10, 21);
    }
  }

  // Les 5 feux rouges : allumés un par un, éteints ensemble au départ.
  showFeux(course, largeur) {
    const rayon = 16;
    const x0 = largeur / 2 - 2.5 * rayon * 2.6 + rayon * 1.3;
    noStroke();
    fill(15, 15, 18, 230);
    rect(largeur / 2 - 2.5 * rayon * 2.6 - 8, 14, 5 * rayon * 2.6 + 16, rayon * 2 + 20, 8);
    for (let i = 0; i < 5; i++) {
      const allume = i < course.feux;
      fill(...(allume ? [255, 30, 30] : [60, 20, 20]));
      circle(x0 + i * rayon * 2.6, 24 + rayon, rayon * 2);
      if (allume) {
        fill(255, 40, 40, 60);
        circle(x0 + i * rayon * 2.6, 24 + rayon, rayon * 3);
      }
    }
  }

  // Bandeau des événements récents, en bas au centre ; le plus récent en dernier.
  showBandeau(course, largeur, hauteur) {
    const messages = course.evenements;
    if (messages.length === 0) return;
    textSize(13);
    textAlign(CENTER, CENTER);
    messages.forEach((message, rang) => {
      const y = hauteur - 22 - (messages.length - 1 - rang) * 24;
      const opacite = 255 * Math.min(1, (Course.DUREE_EVENEMENT - message.age) / 1);
      noStroke();
      fill(12, 14, 20, 0.8 * opacite);
      rect(largeur / 2 - 260, y - 10, 520, 21, 5);
      fill(255, 255, 255, opacite);
      text(message.texte, largeur / 2, y);
    });
  }

  showPause(largeur, hauteur) {
    noStroke();
    fill(0, 0, 0, 90);
    rect(0, 0, largeur, hauteur);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(34);
    text('PAUSE', largeur / 2, hauteur / 2);
  }
}
