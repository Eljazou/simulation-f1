// Outils de la démonstration, ajoutés à la page du jeu par demo.mjs (addScriptTag) : sous-titres,
// cadre de surlignage, claviers affichés et pilote automatique (un ou deux joueurs). Ils
// n'existent que dans cette page pendant la démonstration ; le jeu ne les connaît pas.
function outilsDemo() {
  if (window.__demo) return;
  const style = document.createElement('style');
  style.textContent = `
    #demo-sous-titre { position: fixed; left: 50%; bottom: 46px; transform: translateX(-50%); z-index: 2147483646;
      max-width: 1320px; padding: 14px 30px 16px; border-radius: 14px; background: rgba(8, 10, 16, 0.82);
      border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45); color: #fff;
      font: 500 27px/1.35 'Barlow', 'Segoe UI', system-ui, sans-serif; text-align: center; pointer-events: none;
      transition: opacity 0.35s ease; }
    #demo-sous-titre .chapitre { display: block; font: 700 15px/1.2 'Barlow Condensed', 'Segoe UI', sans-serif;
      letter-spacing: 0.16em; text-transform: uppercase; color: #ff5a52; margin-bottom: 4px; }
    #demo-surlignage { position: fixed; z-index: 2147483645; pointer-events: none; border: 3px solid #ffd400;
      border-radius: 12px; box-shadow: 0 0 0 4px rgba(255, 212, 0, 0.25), 0 0 30px rgba(255, 212, 0, 0.5);
      transition: all 0.3s ease; }
    .demo-clavier { position: fixed; bottom: 200px; transform: translateX(-50%); z-index: 2147483646;
      display: grid; grid-template-columns: repeat(3, 54px) 18px 130px; grid-template-rows: 54px 54px; gap: 6px;
      pointer-events: none; font: 700 22px 'JetBrains Mono', Consolas, monospace; }
    .demo-clavier span { display: flex; align-items: center; justify-content: center; border-radius: 9px;
      background: rgba(8, 10, 16, 0.75); color: #cfd3dc; border: 1px solid rgba(255, 255, 255, 0.2); transition: background 0.05s; }
    .demo-clavier span.on { background: var(--allume, #ff5a52); color: #fff; border-color: rgba(255, 255, 255, 0.6); }
    .demo-clavier .vide { visibility: hidden; }
    .demo-clavier .nom { background: none; border: none; color: var(--allume, #ff5a52); font: 700 22px 'Barlow Condensed', sans-serif; }`;
  document.head.appendChild(style);
  const sousTitre = document.createElement('div');
  sousTitre.id = 'demo-sous-titre';
  sousTitre.style.opacity = '0';
  document.body.appendChild(sousTitre);
  const cadre = document.createElement('div');
  cadre.id = 'demo-surlignage';
  cadre.hidden = true;
  document.body.appendChild(cadre);

  // Les touches de chaque joueur (celles du jeu : VoiturePilote et EcranPartage.TOUCHES), leur nom
  // d'événement (e.key) et leur keyCode (e.which, lu par p5).
  const JOUEURS = [
    { haut: 'w', bas: 's', gauche: 'a', droite: 'd', drs: ' ' },
    { haut: 'arrowup', bas: 'arrowdown', gauche: 'arrowleft', droite: 'arrowright', drs: 'enter' },
  ];
  const TOUCHES = {
    w: ['w', 87, 'KeyW', 'W'], a: ['a', 65, 'KeyA', 'A'], s: ['s', 83, 'KeyS', 'S'], d: ['d', 68, 'KeyD', 'D'],
    ' ': [' ', 32, 'Space', 'ESPACE'], b: ['b', 66, 'KeyB', 'B'],
    arrowup: ['ArrowUp', 38, 'ArrowUp', '↑'], arrowdown: ['ArrowDown', 40, 'ArrowDown', '↓'],
    arrowleft: ['ArrowLeft', 37, 'ArrowLeft', '←'], arrowright: ['ArrowRight', 39, 'ArrowRight', '→'],
    enter: ['Enter', 13, 'Enter', 'ENTRÉE'],
  };
  const COULEURS = ['#ff5a52', '#3aa0ff'];

  // Un clavier affiché par joueur : la croix de direction et la touche DRS.
  const touchesAffichees = {};
  const claviers = JOUEURS.map((t, k) => {
    const bloc = document.createElement('div');
    bloc.className = 'demo-clavier';
    bloc.style.setProperty('--allume', COULEURS[k]);
    bloc.hidden = true;
    const cases = [['J' + (k + 1), 'nom'], [TOUCHES[t.haut][3], t.haut], ['', 'vide'], ['', 'vide'], ['', 'vide'],
      [TOUCHES[t.gauche][3], t.gauche], [TOUCHES[t.bas][3], t.bas], [TOUCHES[t.droite][3], t.droite], ['', 'vide'], [TOUCHES[t.drs][3], t.drs]];
    for (const [texte, cle] of cases) {
      const s = document.createElement('span');
      s.textContent = texte;
      if (cle === 'vide' || cle === 'nom') s.className = cle;
      else touchesAffichees[cle] = s;
      bloc.appendChild(s);
    }
    document.body.appendChild(bloc);
    return bloc;
  });

  let cible = null;
  const suivreCible = () => {
    if (cible !== null) {
      const e = document.querySelector(cible);
      const r = e ? e.getBoundingClientRect() : null;
      if (r && r.width > 0) {
        cadre.hidden = false;
        Object.assign(cadre.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
      } else cadre.hidden = true;
    }
    requestAnimationFrame(suivreCible);
  };
  requestAnimationFrame(suivreCible);

  // Touches envoyées au jeu comme par un clavier : p5 lit e.key et e.which (keyCode).
  const enfoncees = new Set();
  const compteurs = Object.fromEntries(Object.keys(TOUCHES).map(cle => [cle, 0]));
  const envoyer = (type, cle) => {
    const [nom, code, codePhysique] = TOUCHES[cle];
    const ev = new KeyboardEvent(type, { key: nom, code: codePhysique, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'which', { get: () => code });
    Object.defineProperty(ev, 'keyCode', { get: () => code });
    document.body.dispatchEvent(ev);
  };
  const tenir = (cle, oui) => {
    if (oui === enfoncees.has(cle)) return;
    if (oui) {
      enfoncees.add(cle);
      compteurs[cle] += 1;
      envoyer('keydown', cle);
    } else {
      enfoncees.delete(cle);
      envoyer('keyup', cle);
    }
    if (touchesAffichees[cle]) touchesAffichees[cle].classList.toggle('on', oui);
  };
  const toutRelacher = () => [...enfoncees].forEach(cle => tenir(cle, false));
  const relacherJoueur = t => Object.values(t).forEach(cle => tenir(cle, false));

  // Pilote automatique, par joueur : vise la ligne de course devant sa voiture (gauche / droite),
  // suit le profil de vitesse de la voiture (haut / bas), active le DRS quand il est permis.
  // Réglages par joueur (mise en scène d'un duel) : facteur de vitesse visée, et décalage latéral
  // de la ligne visée (pour passer à côté de la voiture de devant).
  const pilote = { actif: false };
  const etats = JOUEURS.map(() => ({ phase: 0, drsActive: 0, facteur: 1, decalage: 0 }));
  const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const conduireUn = (c, j, t, e) => {
    const enCourse = !c.pause && ![Course.ETATS.PRESENTATION, Course.ETATS.FEUX, Course.ETATS.FIN].includes(c.etat);
    if (!enCourse || j.auStand || j.incident || j.pilotageAuto) {
      relacherJoueur(t);
      return;
    }
    const circ = c.circuit;
    const i = j.indicePiste;
    const v = j.vitesse;
    const avance = circ.indice(i + Math.round((50 + 14 * v) / circ.pas));
    // le point visé : la ligne de course, décalée si on cherche à passer (reste dans la piste)
    const limite = circ.largeur / 2 - 10;
    const lateral = Math.max(-limite, Math.min(limite, circ.decalagesLigne[avance] + e.decalage));
    const cible = circ.pointLateral(avance, lateral);
    const ecart = angle(Math.atan2(cible.y - j.pos.y, cible.x - j.pos.x) - j.cap);
    // braquage proportionnel : la touche est tenue une part des images (modulation), selon
    // l'écart d'angle, au lieu d'un tout-ou-rien qui fait zigzaguer la voiture
    e.phase += Math.min(1, Math.abs(ecart) / 0.3);
    const braquer = e.phase >= 1 && Math.abs(ecart) > 0.01;
    if (e.phase >= 1) e.phase -= 1;
    tenir(t.gauche, braquer && ecart < 0);
    tenir(t.droite, braquer && ecart > 0);
    const profil = j.profil();
    let vise = Infinity;
    const portee = Math.round((20 + 22 * v) / circ.pas);
    for (let k = 0; k <= portee; k++) vise = Math.min(vise, profil[circ.indice(i + k)]);
    vise *= 0.96 * e.facteur;
    // trafic : une voiture juste devant, dans l'axe (repère de la voiture du joueur) : on
    // lève le pied, ou on freine si elle est très proche
    const avant = { x: Math.cos(j.cap), y: Math.sin(j.cap) };
    let devant = Infinity;
    for (const autre of c.voitures) {
      if (autre === j || autre.horsCourse) continue;
      const rx = autre.pos.x - j.pos.x;
      const ry = autre.pos.y - j.pos.y;
      const lon = rx * avant.x + ry * avant.y;
      const lat = Math.abs(-rx * avant.y + ry * avant.x);
      if (lon > 0 && lat < 22 && lon < devant && autre.vitesse < v + 0.3) devant = lon;
    }
    if (devant < 45 + 8 * v) vise = Math.min(vise, devant < 32 + 4 * v ? 0 : v * 0.97);
    tenir(t.haut, v < vise);
    tenir(t.bas, v > vise * 1.07);
    tenir(t.drs, Boolean(j.drsDisponible));
    if (j.drsActif) e.drsActive += 1;
  };
  const conduire = () => {
    if (pilote.actif) {
      try {
        const c = formule1.course;
        const joueurs = c.multijoueur ? c.joueurs : (c.joueur ? [c.joueur] : []);
        JOUEURS.forEach((t, k) => {
          if (joueurs[k]) conduireUn(c, joueurs[k], t, etats[k]);
          else relacherJoueur(t);
        });
      } catch {
        toutRelacher();
      }
    }
    requestAnimationFrame(conduire);
  };
  requestAnimationFrame(conduire);

  window.__demo = {
    sousTitre(chapitre, texte) {
      if (!texte) {
        sousTitre.style.opacity = '0';
        return;
      }
      sousTitre.innerHTML = '';
      const c = document.createElement('span');
      c.className = 'chapitre';
      c.textContent = chapitre;
      sousTitre.appendChild(c);
      sousTitre.appendChild(document.createTextNode(texte));
      sousTitre.style.opacity = '1';
    },
    surligner(selecteur) {
      cible = selecteur;
      if (selecteur === null) cadre.hidden = true;
    },
    // claviers affichés : 0 (aucun), 1 (J1, au centre) ou 2 (J1 et J2, au-dessus de chaque moitié)
    clavier(nombre) {
      const n = nombre === true ? 1 : Number(nombre) || 0;
      claviers.forEach((bloc, k) => {
        bloc.hidden = k >= n;
        bloc.style.left = n === 2 ? `${25 + 50 * k}%` : '50%';
      });
    },
    pilote(actif) {
      pilote.actif = actif;
      if (!actif) {
        toutRelacher();
        etats.forEach(e => Object.assign(e, { facteur: 1, decalage: 0 }));
      }
    },
    // mise en scène d'un duel : { facteur, decalage } pour le joueur k (0 : J1, 1 : J2)
    reglerJoueur(k, reglages) {
      Object.assign(etats[k], reglages);
    },
    etatPilote: () => ({
      actif: pilote.actif,
      drsActive: etats.reduce((s, e) => s + e.drsActive, 0),
      joueurs: etats.map(e => ({ drsActive: e.drsActive })),
      compteurs: { ...compteurs },
    }),
    tenir,
  };
}

outilsDemo();
