// Podium animé du championnat (fin de manche) : un écran DESSINÉ (marches, trois premiers aux
// couleurs de leur écurie, classements des pilotes et des écuries), avec une pluie de confettis
// (Confetti : des Vehicle). Le podium lui-même ne bouge pas, ce n'est pas un Vehicle. Les marches
// montent en DUREE_MONTEE secondes (animation de dessin).
class Podium {
  static CONFETTIS = 140;
  // Jamais plus de confettis vivants que ce plafond.
  static PLAFOND_CONFETTIS = 200;
  static DUREE_MONTEE = 1.2;
  static GRAINE = 23;

  // resultat = Championnat.pointsDe(course) de la manche ; championnat = le Championnat ; largeur,
  // hauteur = l'écran. Règle de scène : les confettis naissent ici, une fois, au-dessus de l'écran.
  constructor(resultat, championnat, largeur, hauteur) {
    this.podium = resultat.filter(l => l.position !== null).slice(0, 3);
    this.championnat = championnat;
    this.largeur = largeur;
    this.hauteur = hauteur;
    this.horloge = 0;
    const alea = Circuit.generateur(Podium.GRAINE);
    const sol = hauteur * 0.62;
    this.confettis = Array.from({ length: Math.min(Podium.CONFETTIS, Podium.PLAFOND_CONFETTIS) }, (_, k) =>
      new Confetti(largeur * (0.25 + 0.5 * alea()), -20 - alea() * hauteur * 0.6, sol + alea() * 30, Confetti.COULEURS[k % Confetti.COULEURS.length]));
  }

  update(dt) {
    this.horloge += dt;
    this.confettis.forEach(c => {
      c.decide();
      c.applyBehaviors();
      c.update(dt);
    });
    // règle de scène : les confettis éteints ou sortis de l'écran disparaissent
    this.confettis = this.confettis.filter(c => !c.eteint && !c.sorti(this.largeur, this.hauteur));
  }

  show() {
    const w = this.largeur;
    const h = this.hauteur;
    push();
    noStroke();
    fill(8, 10, 16, 215);
    rect(0, 0, w, h);
    const montee = Math.min(1, this.horloge / Podium.DUREE_MONTEE);
    const base = h * 0.62;
    const marche = Math.min(130, w * 0.12);
    // ordre visuel : 2e, 1er, 3e
    const places = [[1, -1, 0.65], [0, 0, 1], [2, 1, 0.45]];
    textAlign(CENTER, CENTER);
    for (const [rang, colonne, hauteurRel] of places) {
      const ligne = this.podium[rang];
      const x = w / 2 + colonne * (marche + 8);
      const hm = 120 * hauteurRel * montee;
      fill(...[[212, 175, 55], [192, 192, 200], [176, 110, 60]][rang]);
      rect(x - marche / 2, base - hm, marche, hm, 4, 4, 0, 0);
      fill(20);
      textSize(28);
      text(String(rang + 1), x, base - hm / 2);
      if (ligne) {
        fill(...ligne.couleur);
        rect(x - 26, base - hm - 34, 52, 26, 5);
        fill(255);
        textSize(14);
        text(ligne.code, x, base - hm - 21);
        fill(200);
        textSize(10);
        text(`+${ligne.points} pts`, x, base - hm - 46);
      }
    }
    this.confettis.forEach(c => c.show());
    // classements du championnat
    const ch = this.championnat;
    fill(240);
    textSize(16);
    const titre = ch.termine ? `CHAMPION : ${ch.classementPilotes()[0]?.nom ?? ''}` : `MANCHE ${ch.resultats.length}/${ch.manches.length}`;
    text(titre, w / 2, h * 0.1);
    this.showTable('PILOTES', ch.classementPilotes().slice(0, 8), w * 0.5 - 250, h * 0.68);
    this.showTable('ÉCURIES', ch.classementEcuries().slice(0, 6), w * 0.5 + 30, h * 0.68);
    fill(180);
    textSize(12);
    textAlign(CENTER, CENTER);
    text(`${ch.termine ? 'Entrée : nouveau championnat' : 'Entrée : manche suivante'} · Échap : menu`, w / 2, h - 24);
    pop();
  }

  showTable(titre, lignes, x, y) {
    textAlign(LEFT, CENTER);
    fill(250, 210, 40);
    textSize(12);
    text(titre, x, y);
    lignes.forEach((l, k) => {
      fill(...l.couleur);
      rect(x, y + 14 + k * 17, 4, 12);
      fill(235);
      textSize(11);
      text(`${k + 1}. ${l.nom}`, x + 10, y + 20 + k * 17);
      textAlign(RIGHT, CENTER);
      text(`${l.points}`, x + 220, y + 20 + k * 17);
      textAlign(LEFT, CENTER);
    });
  }
}
