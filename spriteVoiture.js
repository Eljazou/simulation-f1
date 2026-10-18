// Monoplace vue de dessus, d'après le design (design/ : « Voiture — zoom coté et états » et le
// calque 11 de la scène). Ce n'est pas une entité : un cache de p5.Graphics, un par voiture
// (écurie, numéro, nez cassé, abandon), dessiné UNE fois en haute résolution, puis seulement
// copié, tourné, à chaque image. Les parties qui bougent sont dessinées à chaque image (voir
// dessinerParties) : roues (les avant braquent, ±22°), flancs à la couleur du pneu monté, disques
// incandescents, volet du DRS, feu arrière (freinage, pluie).
//
// Repère du design : le nez vers +x, la gauche vers -y, en « unités design » (le sprite mesure
// 77 × 33 : de x = -40.6 à 37, de y = -16.6 à 16.6 ; essieux à x = -23.5 et +19.5). La voiture
// garde sa taille physique (VoitureF1.LONGUEUR × LARGEUR, qui sert aux collisions) : le dessin
// est mis à l'échelle K = LONGUEUR / 77.5. Le design montre une voiture de 77 px sur une piste de
// 100 px ; la règle (la logique de course ne change pas) l'emporte, la voiture reste à 26 px.
class SpriteVoiture {
  // pixels du graphique par unité design (77.5 unités -> 155 px : net jusqu'au zoom de la caméra)
  static RESOLUTION = 2;
  // cadre du graphique (unités design), autour de l'origine de la voiture
  static DEMI_LONGUEUR = 42;
  static DEMI_LARGEUR = 17.5;
  static LONGUEUR_DESIGN = 77.5;
  static BRAQUAGE_MAX = 22 * Math.PI / 180;
  // couleurs du design
  static CARBONE = [22, 24, 28];
  static CARBONE_CLAIR = [34, 37, 42];
  static ROUE = [17, 18, 21];
  static JANTE = [125, 131, 140];
  static NOIR = [5, 6, 8];
  static FEU_ETEINT = [90, 21, 18];
  static FEU_ALLUME = [255, 42, 31];
  static DISQUE = [255, 122, 26];
  // ombre portée : décalage (+4, +6) et noir 50 % (nuit 35 %, pluie 25 %)
  static OMBRE = { x: 4, y: 6, jour: 0.5, nuit: 0.35, pluie: 0.25 };
  // états dessinés « abandon » (désaturée, immobile)
  static ABANDONS = ['ABANDON', 'ACCIDENT', 'REMORQUEE'];
  static cache = new Map();
  static ombres = new Map();

  // Échelle du dessin : unités design -> pixels du monde.
  static get K() {
    return VoitureF1.LONGUEUR / SpriteVoiture.LONGUEUR_DESIGN;
  }

  // Le graphique d'une voiture (créé à la première demande). abandon : désaturé et assombri.
  static de(voiture, { endommagee = false, abandon = false } = {}) {
    const cle = `${voiture.ecurie.nom}|${voiture.numero}|${endommagee}|${abandon}`;
    if (!SpriteVoiture.cache.has(cle)) SpriteVoiture.cache.set(cle, SpriteVoiture.dessiner(voiture.ecurie, voiture.numero, { endommagee, abandon }));
    return SpriteVoiture.cache.get(cle);
  }

  // Abandon (design : « désaturée 12 %, assombrie ») : saturation 0,12 puis luminosité × 0,7.
  static desaturer([r, v, b]) {
    const gris = 0.299 * r + 0.587 * v + 0.114 * b;
    return [r, v, b].map(c => Math.round((gris + (c - gris) * 0.12) * 0.7));
  }

  // Les couleurs d'une écurie (p1, p2, p3 et la livrée), désaturées en cas d'abandon.
  static palette(ecurie, abandon = false) {
    const l = Livrees.de(ecurie);
    const brut = { p1: ecurie.couleurs[0], p2: ecurie.couleurs[1], p3: ecurie.couleurs[2], clair: l.clair, fonce: l.fonce, numero: l.numero, casque: l.casque };
    if (!abandon) return brut;
    return Object.fromEntries(Object.entries(brut).map(([k, c]) => [k, SpriteVoiture.desaturer(c)]));
  }

  // Le contexte 2D d'un graphique, s'il en a un vrai (pas dans les tests).
  static contexte(g) {
    const ctx = g.drawingContext;
    return ctx && typeof ctx.createLinearGradient === 'function' ? ctx : null;
  }

  // Dégradé vertical du design (clair 0 %, p1 48 %, foncé 100 %) entre y0 et y1 ; sans contexte,
  // la couleur p1.
  static degrade(g, y0, y1, couleurs) {
    const ctx = SpriteVoiture.contexte(g);
    g.fill(...couleurs.p1);
    if (ctx === null) return;
    const d = ctx.createLinearGradient(0, y0, 0, y1);
    d.addColorStop(0, `rgb(${couleurs.clair.join(',')})`);
    d.addColorStop(0.48, `rgb(${couleurs.p1.join(',')})`);
    d.addColorStop(1, `rgb(${couleurs.fonce.join(',')})`);
    ctx.fillStyle = d;
  }

  // Le tissage carbone du design (damier 2,4 : #16181c et #22252a) ; sans contexte, une teinte.
  static carbone(g) {
    g.fill(...SpriteVoiture.CARBONE);
    const ctx = SpriteVoiture.contexte(g);
    if (ctx === null || typeof document === 'undefined' || typeof ctx.createPattern !== 'function') return;
    if (!SpriteVoiture.motifCarbone) {
      const R = SpriteVoiture.RESOLUTION;
      const toile = document.createElement('canvas');
      toile.width = Math.round(2.4 * R);
      toile.height = Math.round(2.4 * R);
      const t = toile.getContext('2d');
      t.fillStyle = '#16181c';
      t.fillRect(0, 0, toile.width, toile.height);
      t.fillStyle = '#22252a';
      t.fillRect(0, 0, toile.width / 2, toile.height / 2);
      t.fillRect(toile.width / 2, toile.height / 2, toile.width / 2, toile.height / 2);
      SpriteVoiture.motifCarbone = toile;
    }
    ctx.fillStyle = ctx.createPattern(SpriteVoiture.motifCarbone, 'repeat');
  }

  // Un chemin du design : ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Q', cx, cy, x, y].
  static chemin(g, commandes, ferme = true) {
    g.beginShape();
    for (const [c, ...a] of commandes) {
      if (c === 'M' || c === 'L') g.vertex(a[0], a[1]);
      else if (c === 'C') g.bezierVertex(...a);
      else if (c === 'Q') g.quadraticVertex(...a);
    }
    if (ferme) g.endShape(CLOSE);
    else g.endShape();
  }

  // Le même chemin, symétrique par rapport à l'axe de la voiture.
  static miroir(commandes) {
    return commandes.map(([c, ...a]) => [c, ...a.map((v, i) => (i % 2 === 1 ? -v : v))]);
  }

  static dessiner(ecurie, numero, { endommagee = false, abandon = false } = {}) {
    const R = SpriteVoiture.RESOLUTION;
    const L = SpriteVoiture.DEMI_LONGUEUR;
    const W = SpriteVoiture.DEMI_LARGEUR;
    const S = SpriteVoiture;
    const c = S.palette(ecurie, abandon);
    const g = createGraphics(Math.ceil(2 * L * R), Math.ceil(2 * W * R));
    g.pixelDensity(1);
    g.push();
    g.translate(L * R, W * R);
    g.scale(R);
    // bras de suspension
    g.stroke(12, 13, 15);
    g.strokeWeight(1.1);
    for (const s of [-1, 1]) {
      g.line(12, s * 4, 18, s * 10);
      g.line(24, s * 3, 21, s * 10);
      g.line(-19, s * 6, -23, s * 10);
      g.line(-13, s * 6, -21, s * 10);
    }
    g.noStroke();
    // fond plat en carbone
    S.carbone(g);
    S.chemin(g, [['M', -29, -11], ['L', 4, -11], ['L', 9, -7], ['L', 9, 7], ['L', 4, 11], ['L', -29, 11]]);
    // aileron arrière : dérives et plan principal (le volet est dessiné à chaque image : DRS)
    g.fill(13, 14, 16);
    g.rect(-39.5, -14, 9, 2, 0.5);
    g.rect(-39.5, 12, 9, 2, 0.5);
    S.carbone(g);
    g.rect(-39, -12.5, 4.6, 25, 0.6);
    // pontons (dégradé clair -> p1 -> foncé), prises d'air, bandes p2
    S.degrade(g, -11.6, 11.6, c);
    S.chemin(g, [['M', -23, -9.5], ['C', -12, -11.6, 0, -11, 6, -8], ['L', 7, -5], ['L', 7, 5], ['L', 6, 8], ['C', 0, 11, -12, 11.6, -23, 9.5]]);
    g.fill(...S.NOIR);
    const prise = [['M', 3.5, -9.6], ['L', 6.6, -8], ['L', 6.6, -5.4], ['L', 3.5, -6]];
    S.chemin(g, prise);
    S.chemin(g, S.miroir(prise));
    g.fill(...c.p2);
    const bande = [['M', -19, -10.4], ['L', -6, -10.9], ['L', -6, -8.2], ['L', -19, -7.6]];
    S.chemin(g, bande);
    S.chemin(g, S.miroir(bande));
    // capot moteur, liseré p3, reflets
    S.degrade(g, -5.3, 5.3, c);
    S.chemin(g, [['M', -32, -3], ['C', -20, -3.8, -6, -5.3, 4, -5], ['L', 10, -3.6], ['L', 10, 3.6], ['L', 4, 5], ['C', -6, 5.3, -20, 3.8, -32, 3]]);
    g.fill(...c.p3);
    g.rect(-30, -1, 40, 2);
    g.noFill();
    g.stroke(255, 255, 255, 0.35 * 255);
    g.strokeWeight(1);
    S.chemin(g, [['M', -18, -9.6], ['C', -8, -10.6, 0, -10.2, 4.5, -8.4]], false);
    g.stroke(255, 255, 255, 0.3 * 255);
    g.strokeWeight(0.8);
    S.chemin(g, [['M', -28, -2.6], ['C', -16, -3.2, -4, -4.4, 6, -4.2]], false);
    g.noStroke();
    // numéro sur le capot (6,6 unités, couleur de la livrée)
    g.fill(...c.numero);
    g.textAlign(CENTER, CENTER);
    g.textFont('Barlow Condensed');
    g.textStyle(BOLD);
    g.textSize(6.6);
    g.text(String(numero), -15, 0);
    // cockpit, casque (Ø 5,2) et visière, halo
    g.fill(...S.NOIR);
    g.ellipse(6, 0, 5.2, 3.6);
    g.fill(7, 8, 10);
    S.chemin(g, [['M', 9, -3.2], ['C', 13, -3.7, 17, -3, 18.5, 0], ['C', 17, 3, 13, 3.7, 9, 3.2]]);
    g.fill(...c.casque);
    g.circle(12.5, 0, 5.2);
    g.noFill();
    g.stroke(11, 11, 11);
    g.strokeWeight(1.2);
    g.arc(12.5, 0, 5.2, 5.2, -0.956, 0.956);
    g.stroke(43, 46, 51);
    g.strokeWeight(1.4);
    S.chemin(g, [['M', 9.5, -3.5], ['C', 13, -3.9, 17.5, -2.7, 19, 0], ['C', 17.5, 2.7, 13, 3.9, 9.5, 3.5]], false);
    g.line(19, 0, 22, 0);
    g.noStroke();
    // nez effilé et sa pointe p2
    S.degrade(g, -3.4, 3.4, c);
    S.chemin(g, [['M', 18, -3.4], ['L', 33, -1.8], ['Q', 36.5, 0, 33, 1.8], ['L', 18, 3.4]]);
    g.fill(...c.p2);
    S.chemin(g, [['M', 30, -2.1], ['L', 33, -1.8], ['Q', 36.5, 0, 33, 1.8], ['L', 30, 2.1]]);
    // rétroviseurs
    g.stroke(26, 27, 30);
    g.strokeWeight(0.8);
    g.line(15.6, -7.2, 15.4, -4);
    g.line(15.6, 7.2, 15.4, 4);
    g.noStroke();
    g.fill(...c.p1);
    g.rect(14.4, -9.4, 3.2, 2.1, 0.6);
    g.rect(14.4, 7.3, 3.2, 2.1, 0.6);
    // aileron avant : plan carbone, volets p2 et p1, dérives ; nez cassé : il manque un côté
    const haut = endommagee ? -6 : -15.5;
    S.carbone(g);
    g.rect(30.5, haut, 5, 15.5 - haut, 1);
    g.fill(...c.p2);
    g.rect(33, haut + 0.5, 1.8, 15 - haut - 0.5);
    g.fill(...c.p1);
    g.rect(35, haut + 1, 1.3, 14.5 - haut - 1);
    g.fill(13, 14, 16);
    if (!endommagee) g.rect(29, -16.6, 8, 1.9, 0.5);
    g.rect(29, 14.7, 8, 1.9, 0.5);
    if (endommagee) {
      // éclats de carbone au bout de l'aileron cassé
      g.fill(...S.CARBONE_CLAIR);
      g.triangle(30.5, -6, 35.5, -6, 33, -9.5);
    }
    g.pop();
    return g;
  }

  // Ombre portée et reflet (pluie) : un rectangle arrondi flou (une fois, en cache). Sans vrai
  // contexte, un rectangle simple.
  static tache(couleur, largeur, hauteur, flou) {
    const cle = `${couleur.join(',')}|${largeur}|${hauteur}|${flou}`;
    if (SpriteVoiture.ombres.has(cle)) return SpriteVoiture.ombres.get(cle);
    const R = SpriteVoiture.RESOLUTION;
    const marge = flou * 3;
    const g = createGraphics(Math.ceil((largeur + 2 * marge) * R), Math.ceil((hauteur + 2 * marge) * R));
    g.pixelDensity(1);
    g.noStroke();
    const ctx = SpriteVoiture.contexte(g);
    if (ctx !== null) ctx.filter = `blur(${flou * R}px)`;
    g.fill(...couleur);
    g.rect(marge * R, marge * R, largeur * R, hauteur * R, 10 * R);
    if (ctx !== null) ctx.filter = 'none';
    const tache = { g, largeur: largeur + 2 * marge, hauteur: hauteur + 2 * marge };
    SpriteVoiture.ombres.set(cle, tache);
    return tache;
  }

  // Une roue du design : pneu, flancs à la couleur du type monté, jante. cote = -1 (gauche) ou 1.
  static roue(x, y, l, w, flanc, couleurPneu, jante, cote) {
    fill(...SpriteVoiture.ROUE);
    rect(x, y, l, w, 2.3);
    fill(...couleurPneu);
    // flanc extérieur (1,6) et flanc intérieur (1,2, à 75 %)
    const exterieur = cote < 0 ? y : y + w - flanc;
    const interieur = cote < 0 ? y + w - 1.2 - 0.6 : y + 0.4;
    rect(x + 1, exterieur, l - 2, flanc);
    fill(...couleurPneu, 0.75 * 255);
    rect(x + 1, interieur, l - 2, 1.2);
    fill(...jante);
    rect(x + l / 2 - 2, y + w / 2 - 1.2, 4, 2.4, 0.6);
  }

  // Les parties qui bougent, dessinées à chaque image dans le repère de la voiture (unités design).
  static dessinerRoues(voiture, braquage, abandon) {
    const S = SpriteVoiture;
    const pneu = abandon ? S.desaturer(Pneus.type(voiture.typePneus).couleur) : Pneus.type(voiture.typePneus).couleur;
    const jante = S.JANTE;
    noStroke();
    // arrière : 15 × 7, fixes
    S.roue(-31, -16, 15, 7, 1.6, pneu, jante, -1);
    S.roue(-31, 9, 15, 7, 1.6, pneu, jante, 1);
    // avant : 13 × 6,5, braquées autour de leur centre
    const angle = Math.max(-S.BRAQUAGE_MAX, Math.min(S.BRAQUAGE_MAX, braquage));
    for (const s of [-1, 1]) {
      push();
      translate(19.5, s * 12.25);
      rotate(angle);
      S.roue(-6.5, -3.25, 13, 6.5, 1.5, pneu, jante, s);
      // plat de pneu après un blocage : une tache claire sur la bande de roulement
      if (voiture.platDePneu > 0.2) {
        fill(140, 140, 140, 220 * voiture.platDePneu);
        rect(-1, -3.25, 2.4, 6.5);
      }
      pop();
    }
  }

  // Après la carrosserie : volet du DRS, feu arrière (et son halo), disques incandescents.
  static dessinerParties(voiture, { abandon = false, pluie = false } = {}) {
    const S = SpriteVoiture;
    const c = S.palette(voiture.ecurie, abandon);
    noStroke();
    // DRS : fermé, le volet p2 (2,6) ; ouvert, une fente noire (1,4) et le volet relevé (1,2)
    if (voiture.drs) {
      fill(...S.NOIR);
      rect(-35.2, -12, 1.4, 24);
      fill(...c.p2);
      rect(-33.6, -12, 1.2, 24);
    } else {
      fill(...c.p2);
      rect(-34.8, -12, 2.6, 24, 0.5);
    }
    // feu arrière : rouge au freinage, allumé en permanence sous la pluie
    const freine = Boolean(voiture.freine) && !abandon;
    const allume = freine || (pluie && !abandon);
    fill(...(allume ? S.FEU_ALLUME : S.FEU_ETEINT));
    rect(-40.6, -1.5, 1.9, 3, 0.4);
    if (allume) {
      const halo = freine ? 0.9 : 0.55;
      fill(...S.FEU_ALLUME, 255 * halo * 0.35);
      circle(-41, 0, 10);
      fill(...S.FEU_ALLUME, 255 * halo * 0.6);
      circle(-41, 0, 5);
    }
    // disques incandescents (avant, visibles) au gros freinage
    if (freine && voiture.vitesse > 2.5) {
      for (const s of [-1, 1]) {
        fill(...S.DISQUE, 0.45 * 255);
        circle(19.5, s * 8.6, 7);
        fill(...S.DISQUE);
        circle(19.5, s * 8.6, 3.4);
      }
    }
  }

  // Une voiture complète : ombre portée, reflet (pluie), roues, sprite, parties mobiles, à sa
  // position, tournée selon `cap`. theme : 'jour', 'nuit' ou 'pluie' (ombre, reflet, feu).
  static montrer(voiture, cap, braquage, { ombres = true, vibration = 0, theme = 'jour' } = {}) {
    const S = SpriteVoiture;
    const K = S.K;
    const L = S.DEMI_LONGUEUR;
    const W = S.DEMI_LARGEUR;
    const abandon = SpriteVoiture.ABANDONS.includes(voiture.etat);
    const pluie = theme === 'pluie' || (voiture.humidite ?? 0) > 0.25;
    push();
    if (ombres) {
      const ombre = S.tache([0, 0, 0], 74, 29, 3);
      push();
      translate(voiture.pos.x + S.OMBRE.x * K, voiture.pos.y + S.OMBRE.y * K);
      rotate(cap);
      scale(K);
      ImageAlpha.dessiner(ombre.g, S.OMBRE[theme] ?? S.OMBRE.jour, -ombre.largeur / 2, -ombre.hauteur / 2, ombre.largeur, ombre.hauteur);
      pop();
    }
    // reflet sous la voiture : copie floue couleur p1, décalée de +16 (pluie 35 %, nuit 18 %)
    const reflet = theme === 'pluie' ? 0.35 : theme === 'nuit' ? 0.18 : 0;
    if (reflet > 0) {
      const tache = S.tache(voiture.ecurie.couleurs[0], 76, 28, 9);
      push();
      translate(voiture.pos.x + 2 * K, voiture.pos.y + 16 * K);
      rotate(cap);
      scale(K);
      ImageAlpha.dessiner(tache.g, reflet, -tache.largeur / 2, -tache.hauteur / 2, tache.largeur, tache.hauteur);
      pop();
    }
    translate(voiture.pos.x, voiture.pos.y + vibration);
    rotate(cap);
    scale(K);
    S.dessinerRoues(voiture, braquage, abandon);
    image(S.de(voiture, { endommagee: Boolean(voiture.endommagee), abandon }), -L, -W, 2 * L, 2 * W);
    S.dessinerParties(voiture, { abandon, pluie });
    pop();
  }
}
