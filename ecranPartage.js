// Écran partagé (multijoueur local) : deux moitiés d'écran, une caméra par joueur (Camera en mode
// suivi), un petit HUD par joueur. Ce n'est pas un Vehicle : il découpe le dessin.
//
// Touches (clavier QWERTY), choisies pour ne pas se chevaucher :
//   J1 : W A S D pour conduire, Espace = DRS, Q = arrêt au stand, E = pneus suivants ;
//   J2 : flèches pour conduire, Entrée = DRS, / = arrêt au stand, . = pneus suivants.
class EcranPartage {
  static TOUCHES = [
    { haut: 'w', bas: 's', gauche: 'a', droite: 'd', drs: ' ', stand: 'q', pneus: 'e' },
    { haut: 'arrowup', bas: 'arrowdown', gauche: 'arrowleft', droite: 'arrowright', drs: 'enter', stand: '/', pneus: '.' },
  ];

  // Grossissement de chaque moitié (par rapport à la vue d'ensemble de la moitié).
  static ZOOM = 3.6;

  constructor() {
    this.cameras = [new Camera(), new Camera()];
    this.cameras.forEach(c => c.choisirMode('suivi'));
  }

  // Les deux moitiés (gauche, droite) d'une zone d'écran.
  static zones(zone) {
    const l = (zone.largeur - 6) / 2;
    return [{ ...zone, largeur: l }, { ...zone, x: zone.x + l + 6, largeur: l }];
  }

  // Le joueur (0 ou 1) et l'action d'une touche, ou null.
  static action(touche) {
    const k = String(touche).toLowerCase();
    for (let j = 0; j < EcranPartage.TOUCHES.length; j++) {
      for (const [action, t] of Object.entries(EcranPartage.TOUCHES[j])) {
        if (t === k) return { joueur: j, action };
      }
    }
    return null;
  }

  // Commandes de conduite d'un joueur d'après les touches enfoncées.
  static commandes(joueur, enfoncees) {
    const t = EcranPartage.TOUCHES[joueur];
    return { haut: enfoncees.has(t.haut), bas: enfoncees.has(t.bas), gauche: enfoncees.has(t.gauche), droite: enfoncees.has(t.droite), drs: enfoncees.has(t.drs) };
  }

  // Les pneus suivants (dans l'ordre de Pneus.NOMS) pour le prochain arrêt.
  static pneusSuivants(voiture) {
    const actuel = voiture.pneuChoisi ?? voiture.typePneus;
    return Pneus.NOMS[(Pneus.NOMS.indexOf(actuel) + 1) % Pneus.NOMS.length];
  }

  update(dt, course, zone) {
    const zones = EcranPartage.zones(zone);
    course.joueurs.forEach((j, k) => {
      const vitesse = Math.min(1, j.vitesse / Math.max(0.1, course.parametres.vitesseMax));
      this.cameras[k].suivre(zones[k], course.circuit.largeurMonde, course.circuit.hauteurMonde, j, dt, { vitesseRelative: vitesse, zoom: EcranPartage.ZOOM });
    });
  }

  // Dessine le monde dans chaque moitié : dessinerMonde(camera) est appelé une fois par joueur,
  // découpé à sa moitié (clip du contexte 2D, s'il existe).
  // hud = false : les HUD sont ceux de l'interface HTML (HudDuel).
  show(course, zone, dessinerMonde, { hud = true } = {}) {
    const zones = EcranPartage.zones(zone);
    const ctx = typeof drawingContext === 'undefined' ? null : drawingContext;
    const decoupe = ctx !== null && typeof ctx.clip === 'function';
    zones.forEach((z, k) => {
      push();
      if (decoupe) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(z.x, z.y, z.largeur, z.hauteur);
        ctx.clip();
      }
      this.cameras[k].appliquer();
      dessinerMonde(this.cameras[k]);
      if (decoupe) ctx.restore();
      pop();
    });
    // séparation et HUD de chaque joueur
    push();
    noStroke();
    fill(10, 12, 18);
    rect(zones[1].x - 6, zone.y, 6, zone.hauteur);
    if (hud) course.joueurs.forEach((j, k) => this.showHud(course, j, k, zones[k]));
    pop();
  }

  showHud(course, j, k, z) {
    const ordre = course.classement();
    // en haut à gauche de sa moitié (le bas de l'écran reste aux messages de course)
    const x = z.x + 8;
    const y = z.y + 8;
    noStroke();
    fill(10, 12, 18, 210);
    rect(x, y, 230, 58, 6);
    fill(...(k === 0 ? [255, 230, 120] : [150, 200, 255]));
    rect(x, y, 4, 58, 6, 0, 0, 6);
    fill(240);
    textAlign(LEFT, CENTER);
    textSize(13);
    const tour = Math.min(course.parametres.nombreTours, Math.max(1, j.tour + 1));
    text(`J${k + 1} · #${j.numero} ${j.pilote.code} · P${ordre.indexOf(j) + 1} · tour ${tour}/${course.parametres.nombreTours}`, x + 10, y + 14);
    textSize(11);
    fill(200);
    const etat = j.accidentee ? 'ACCIDENT' : j.auStand ? 'au stand' : j.demandeStand ? 'rentre au stand' : '';
    text(`${j.kmh} km/h · rapport ${j.rapport} · ${Pneus.type(j.typePneus).libelle} ${Math.round(j.pneus * 100)} % ${etat}`, x + 10, y + 32);
    fill(...(j.drsActif ? [70, 220, 110] : j.drsDisponible ? [250, 210, 40] : [110, 110, 110]));
    text(`DRS${j.pneuChoisi ? ` · prochain : ${Pneus.type(j.pneuChoisi).libelle}` : ''}`, x + 10, y + 48);
  }
}
