// Bulles de radio d'équipe : les messages de course.messagesRadio (ordres d'équipe, refus,
// stands...) dessinés en bulle au-dessus de la voiture concernée, qui s'effacent à la fin de leur
// durée de vie (Course.DUREE_RADIO). Une aide de dessin, pas un Vehicle. Dessinée dans le repère
// du monde ; la taille du texte suit l'échelle de la caméra pour rester lisible.
class BullesRadio {
  // Nombre maximal de bulles à la fois, durée du fondu de sortie (secondes).
  static MAX = 4;
  static FONDU = 0.8;
  static TAILLE_TEXTE = 11;
  static LARGEUR_MAX = 34;
  // Chasse moyenne d'un caractère (fraction de la taille du texte).
  static CHASSE = 0.56;

  // Les messages à montrer : le plus récent par voiture, les MAX plus récents.
  static visibles(messages) {
    const parVoiture = new Map();
    for (const m of messages) {
      if (m.voiture) parVoiture.set(m.voiture, m);
    }
    return [...parVoiture.values()].sort((a, b) => a.age - b.age).slice(0, BullesRadio.MAX);
  }

  // Le texte coupé en lignes d'au plus LARGEUR_MAX caractères.
  static lignes(texte) {
    const mots = String(texte).split(' ');
    const lignes = [''];
    for (const mot of mots) {
      const courante = lignes.at(-1);
      if (courante.length > 0 && courante.length + 1 + mot.length > BullesRadio.LARGEUR_MAX) lignes.push(mot);
      else lignes[lignes.length - 1] = courante.length === 0 ? mot : `${courante} ${mot}`;
    }
    return lignes;
  }

  show(course, echelle = 1) {
    const s = 1 / Math.max(0.2, echelle);
    push();
    textSize(BullesRadio.TAILLE_TEXTE * s);
    textAlign(LEFT, TOP);
    for (const m of BullesRadio.visibles(course.messagesRadio)) {
      const v = m.voiture;
      const reste = Course.DUREE_RADIO - m.age;
      const alpha = Math.max(0, Math.min(1, reste / BullesRadio.FONDU, m.age / 0.2));
      const lignes = BullesRadio.lignes(m.texte);
      const h = BullesRadio.TAILLE_TEXTE * 1.25 * s;
      // largeur estimée (caractères × chasse moyenne) : pas de mesure de texte à chaque image
      const largeur = Math.max(16, ...lignes.map(l => l.length)) * BullesRadio.TAILLE_TEXTE * BullesRadio.CHASSE * s + 12 * s;
      const hauteur = h * (lignes.length + 1) + 8 * s;
      const x = v.pos.x + 14 * s;
      const y = v.pos.y - 20 * s - hauteur;
      noStroke();
      fill(14, 16, 24, 225 * alpha);
      rect(x, y, largeur, hauteur, 5 * s);
      triangle(x + 4 * s, y + hauteur, x + 14 * s, y + hauteur, v.pos.x + 3 * s, v.pos.y - 6 * s);
      fill(...v.ecurie.couleurs[0], 255 * alpha);
      rect(x, y, 3 * s, hauteur, 5 * s, 0, 0, 5 * s);
      fill(255, 210, 60, 255 * alpha);
      text(`RADIO #${v.numero} ${v.pilote.code}`, x + 7 * s, y + 4 * s);
      fill(240, 240, 240, 255 * alpha);
      lignes.forEach((l, k) => text(l, x + 7 * s, y + 4 * s + h * (k + 1)));
    }
    pop();
  }
}
