// Diagnostic de performance (?debug=perf dans l'adresse, ou touche F9) : un petit cadre en haut à
// gauche, au-dessus de l'interface. Ce n'est pas un Vehicle et il ne change rien à la course : il
// reçoit à chaque image le temps écoulé et la durée de draw() (mesurés par sketch.js, comme
// deltaTime) et lit des compteurs (particules, redessins du décor, écritures dans la page).
//   images/s moyennes et minimales sur FENETRE secondes (la plus longue image de la fenêtre) ;
//   durée de draw() en ms (moyenne et maximum) ;
//   particules vivantes (fumée, gerbes, étincelles, poussière, billes, débris) ;
//   Vehicle vivants (voitures, safety car, drone, particules, mécaniciens, dépanneuses, confettis
//   du podium, points du mot REJOUER) et confettis ;
//   redessins du décor (total, et pendant la fenêtre) ;
//   écritures dans la page par seconde (MutationObserver, hors du cadre lui-même) ;
//   pixelDensity() du canvas et devicePixelRatio de l'écran.
// Le cadre n'est réécrit que AFFICHAGE fois par seconde.
class DiagnosticPerf {
  static FENETRE = 2;
  static AFFICHAGE = 2;
  static CAPACITE = 1200;
  // Les groupes de particules de la course (tableaux de Vehicle visuels).
  static PARTICULES = ['fumees', 'gerbes', 'etincelles', 'poussieres', 'billes', 'debris'];

  // Le diagnostic est-il demandé dans l'adresse ? (« ?debug=perf », éventuellement parmi d'autres)
  static demande(recherche = '') {
    const valeurs = String(recherche).replace(/^\?/, '').split('&')
      .filter(p => p.split('=')[0] === 'debug').map(p => (p.split('=')[1] ?? '').split(','));
    return valeurs.some(v => v.includes('perf'));
  }

  // Les particules vivantes d'une course : { total, detail : { fumees: n, ... } }.
  static particules(course) {
    const detail = {};
    let total = 0;
    for (const nom of DiagnosticPerf.PARTICULES) {
      const n = Array.isArray(course?.[nom]) ? course[nom].length : 0;
      detail[nom] = n;
      total += n;
    }
    return { total, detail };
  }

  // Les Vehicle vivants du scénario du circuit : { vehicules, particules, confettis }.
  static entites(formule1) {
    if (!formule1 || !formule1.demarre) return { vehicules: 0, particules: 0, confettis: 0 };
    const c = formule1.course;
    const particules = DiagnosticPerf.particules(c).total + (c.perturbations?.length ?? 0);
    const mecaniciens = c.stands ? [...c.stands.equipes.values()].reduce((s, e) => s + e.mecaniciens.length, 0) : 0;
    const confettis = formule1.podium?.confettis?.length ?? 0;
    const points = formule1.ecranFin?.particules?.length ?? 0;
    const vehicules = c.voitures.length + (c.safetyCar ? 1 : 0) + (c.drone ? 1 : 0) + particules + mecaniciens +
      (c.incidents?.commissaires?.length ?? 0) + confettis + points;
    return { vehicules, particules, confettis };
  }

  // parent : l'élément où poser le cadre (document.body) ; null : pas de cadre (calcul seul).
  constructor(parent = null) {
    this.actif = false;
    // temps cumulé en ms (somme des durées reçues : pas d'arrondi sur les bords de la fenêtre)
    this.temps = 0;
    // anneau des dernières images : instant (ms), durée de l'image (ms), durée de draw() (ms)
    this.instants = new Float64Array(DiagnosticPerf.CAPACITE);
    this.images = new Float64Array(DiagnosticPerf.CAPACITE);
    this.draws = new Float64Array(DiagnosticPerf.CAPACITE);
    this.debut = 0;
    this.nombre = 0;
    // écritures dans la page : instants (ms) des lots de mutations, avec leur taille
    this.ecritures = [];
    this.attente = 0;
    // redessins du décor : [instant, total] à chaque changement
    this.redessins = [];
    this.depuisAffichage = Infinity;
    this.racine = null;
    this.observateur = null;
    if (parent !== null && typeof document !== 'undefined') {
      this.racine = document.createElement('pre');
      this.racine.id = 'diagnostic-perf';
      this.racine.hidden = true;
      parent.appendChild(this.racine);
      if (typeof MutationObserver === 'function') {
        this.observateur = new MutationObserver(liste => {
          // les écritures du cadre lui-même ne comptent pas
          this.attente += liste.filter(m => !this.racine.contains(m.target)).length;
        });
      }
    }
  }

  // Allume ou éteint le diagnostic (l'observateur de la page ne tourne que s'il est allumé).
  activer(actif) {
    this.actif = Boolean(actif);
    if (this.racine !== null) this.racine.hidden = !this.actif;
    if (this.observateur !== null) {
      if (this.actif) this.observateur.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      else this.observateur.disconnect();
    }
    this.depuisAffichage = Infinity;
  }

  basculer() {
    this.activer(!this.actif);
  }

  // Écritures dans la page comptées depuis l'appel précédent (tests, ou sans MutationObserver).
  compterEcritures(n) {
    this.attente += n;
  }

  // Une image : dtMs = durée de l'image (deltaTime), drawMs = durée de draw() ; redessins = total
  // des redessins du décor à cet instant.
  enregistrer(dtMs, drawMs, { redessins = 0 } = {}) {
    if (!(dtMs > 0)) return;
    this.temps += dtMs;
    const fenetre = DiagnosticPerf.FENETRE * 1000;
    const C = DiagnosticPerf.CAPACITE;
    const k = (this.debut + this.nombre) % C;
    this.instants[k] = this.temps;
    this.images[k] = dtMs;
    this.draws[k] = drawMs;
    if (this.nombre < C) this.nombre++;
    else this.debut = (this.debut + 1) % C;
    // la fenêtre glisse : les images plus anciennes que FENETRE sortent
    while (this.nombre > 1 && this.temps - this.instants[this.debut] > fenetre) {
      this.debut = (this.debut + 1) % C;
      this.nombre--;
    }
    if (this.attente > 0) {
      this.ecritures.push([this.temps, this.attente]);
      this.attente = 0;
    }
    while (this.ecritures.length > 0 && this.temps - this.ecritures[0][0] > fenetre) this.ecritures.shift();
    const dernier = this.redessins.at(-1);
    if (dernier === undefined || dernier[1] !== redessins) this.redessins.push([this.temps, redessins]);
    while (this.redessins.length > 1 && this.temps - this.redessins[1][0] > fenetre) this.redessins.shift();
  }

  // Les mesures de la fenêtre.
  stats() {
    const C = DiagnosticPerf.CAPACITE;
    let somme = 0;
    let pire = 0;
    let sommeDraw = 0;
    let maxDraw = 0;
    for (let n = 0; n < this.nombre; n++) {
      const k = (this.debut + n) % C;
      somme += this.images[k];
      pire = Math.max(pire, this.images[k]);
      sommeDraw += this.draws[k];
      maxDraw = Math.max(maxDraw, this.draws[k]);
    }
    const duree = somme / 1000;
    const ecritures = this.ecritures.reduce((s, [, n]) => s + n, 0);
    const total = this.redessins.at(-1)?.[1] ?? 0;
    // la première entrée gardée : la valeur au début de la fenêtre (ou à la première image vue)
    const avant = this.redessins[0]?.[1] ?? 0;
    return {
      images: this.nombre,
      fpsMoyen: duree > 0 ? this.nombre / duree : 0,
      fpsMin: pire > 0 ? 1000 / pire : 0,
      drawMoyen: this.nombre > 0 ? sommeDraw / this.nombre : 0,
      drawMax: maxDraw,
      ecrituresParSeconde: duree > 0 ? ecritures / Math.min(duree, DiagnosticPerf.FENETRE) : 0,
      redessinsDecor: total,
      redessinsFenetre: Math.max(0, total - avant),
    };
  }

  // Le texte du cadre.
  texte(course, { densite = 1, ratio = 1, entites = null } = {}) {
    const s = this.stats();
    const p = DiagnosticPerf.particules(course);
    const detail = Object.entries(p.detail).filter(([, n]) => n > 0).map(([nom, n]) => `${nom} ${n}`).join(' · ');
    return [
      `images/s  ${s.fpsMoyen.toFixed(1)} moy · ${s.fpsMin.toFixed(1)} min (${DiagnosticPerf.FENETRE} s)`,
      `draw()    ${s.drawMoyen.toFixed(2)} ms moy · ${s.drawMax.toFixed(2)} ms max`,
      `particules ${p.total}${detail ? ` (${detail})` : ''}`,
      ...(entites === null ? [] : [`Vehicle   ${entites.vehicules} vivants · confettis ${entites.confettis}`]),
      `décor     ${s.redessinsDecor} redessins · ${s.redessinsFenetre} sur ${DiagnosticPerf.FENETRE} s`,
      `page      ${Math.round(s.ecrituresParSeconde)} écritures/s`,
      `densité   pixelDensity ${densite} · devicePixelRatio ${ratio}`,
    ].join('\n');
  }

  // Réécrit le cadre au plus AFFICHAGE fois par seconde (dt en secondes).
  afficher(dt, course, ecran = {}) {
    if (!this.actif || this.racine === null) return;
    this.depuisAffichage += dt;
    if (this.depuisAffichage < 1 / DiagnosticPerf.AFFICHAGE) return;
    this.depuisAffichage = 0;
    const t = this.texte(course, ecran);
    if (this.racine.textContent !== t) this.racine.textContent = t;
  }
}
