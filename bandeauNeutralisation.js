// Bandeau de neutralisation (design/ : « Drapeau jaune · Safety car · VSC ») : sous la barre du
// haut (top 64, centré, 640 × 44), entrée en glissé de 200 ms. Ce n'est pas un Vehicle : il lit
// le drapeau de la course (course.drapeau) et ne change rien.
//   DRAPEAU JAUNE        contour jaune sur fond sombre : secteur et virage de l'incident ;
//   SAFETY CAR           plein jaune, texte noir, tant que la voiture de sécurité est en piste ;
//   VIRTUAL SAFETY CAR   hachures animées, la réduction de vitesse réelle (facteurVSC) ;
//   PISTE LIBRE          3 s à la fin d'une neutralisation, puis fondu de 250 ms.
// Le design prévoit aussi un « DRAPEAU ROUGE » : la course n'a pas de drapeau rouge (aucun état
// ne suspend la course), il n'est donc jamais affiché.
class BandeauNeutralisation {
  static DUREE_LIBRE = 3;
  static ICONES = {
    drapeau: 'M5 21V4M5 4h12l-2 4 2 4H5',
    voiture: 'M3 15h18l-2-5H5zM7 15v3M17 15v3M9 10l1-3h4l1 3',
  };

  // Le virage (numéro de la mini-carte, T1...) le plus proche d'un indice du tracé.
  static virageDe(circuit, indice) {
    let meilleur = null;
    let distance = Infinity;
    circuit.virages.forEach((v, n) => {
      const d = Math.min((v.apex - indice + circuit.n) % circuit.n, (indice - v.apex + circuit.n) % circuit.n);
      if (d < distance) {
        distance = d;
        meilleur = n + 1;
      }
    });
    return meilleur;
  }

  // Le contenu du bandeau pour l'état de la course : { type, titre, detail } ou null. libre :
  // vrai pendant les DUREE_LIBRE secondes qui suivent une neutralisation.
  static contenu(course, libre = false) {
    const drapeau = course.drapeau;
    if (drapeau === 'sc') {
      const relance = course.etat === Course.ETATS.RELANCE;
      return { type: 'sc', titre: 'SAFETY CAR', detail: relance ? 'Relance · le safety car rentre' : 'Pas de dépassement', icone: 'voiture' };
    }
    if (drapeau === 'vsc') {
      const reduction = Math.round((1 - (course.parametres.facteurVSC ?? VoitureF1.FACTEUR_VSC)) * 100);
      return { type: 'vsc', titre: 'VIRTUAL SAFETY CAR', detail: `Respectez la limite · −${reduction} %`, icone: 'voiture' };
    }
    if (drapeau === 'jaune') {
      const zone = course.incidents?.zones?.[0] ?? null;
      const secteur = [...(course.incidents?.secteursJaunes ?? [])].sort()[0];
      const morceaux = [];
      if (secteur !== undefined) morceaux.push(`Secteur ${secteur + 1}`);
      if (zone !== null) morceaux.push(`virage ${BandeauNeutralisation.virageDe(course.circuit, zone.indice)}`);
      morceaux.push('dépassement interdit');
      return { type: 'jaune', titre: 'DRAPEAU JAUNE', detail: morceaux.join(' · '), icone: 'drapeau' };
    }
    if (libre && drapeau === 'vert') return { type: 'libre', titre: 'PISTE LIBRE', detail: 'Fin de neutralisation', icone: 'drapeau' };
    return null;
  }

  // parent = le calque de l'interface (#f1-ui).
  constructor(parent) {
    const { el, svg } = DomF1;
    this.racine = el('div', 'neutralisation');
    this.racine.id = 'f1-neutralisation';
    this.racine.setAttribute('role', 'status');
    const boite = el('span', 'neutralisation-icone');
    const icone = svg('svg', { 'aria-hidden': 'true', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    this.trace = svg('path', { d: BandeauNeutralisation.ICONES.drapeau });
    icone.appendChild(this.trace);
    boite.appendChild(icone);
    this.titre = el('span', 'neutralisation-titre cond');
    this.detail = el('span', 'neutralisation-detail cond');
    for (const e of [boite, this.titre, el('span', 'neutralisation-espace'), this.detail]) this.racine.appendChild(e);
    this.racine.hidden = true;
    parent.appendChild(this.racine);
    this.precedent = 'vert';
    this.libre = 0;
    this.type = null;
  }

  // Une nouvelle course : rien de la précédente (pas de « piste libre » hérité).
  reinitialiser() {
    this.precedent = 'vert';
    this.libre = 0;
    this.type = null;
    DomF1.cacher(this.racine, true);
  }

  // Une image (dt en secondes réelles).
  mettreAJour(course, dt = 0) {
    const drapeau = course.drapeau;
    // avant le départ, aucune neutralisation ne peut finir : pas de « piste libre »
    if ([Course.ETATS.PRESENTATION, Course.ETATS.FEUX].includes(course.etat)) this.precedent = 'vert';
    // fin d'une neutralisation (jaune, VSC ou safety car) : « piste libre » pendant 3 s
    if (drapeau === 'vert' && ['jaune', 'vsc', 'sc'].includes(this.precedent)) this.libre = BandeauNeutralisation.DUREE_LIBRE;
    else if (drapeau !== 'vert') this.libre = 0;
    else this.libre = Math.max(0, this.libre - dt);
    this.precedent = drapeau;
    // course finie (arrivée, fin du mode pilote) : plus de bandeau
    const finie = [Course.ETATS.ARRIVEE, Course.ETATS.FIN].includes(course.etat);
    const c = finie ? null : BandeauNeutralisation.contenu(course, this.libre > 0);
    DomF1.cacher(this.racine, c === null);
    if (c === null) {
      this.type = null;
      return;
    }
    if (c.type !== this.type) {
      // nouvelle neutralisation : la classe relance l'animation d'entrée
      for (const t of ['jaune', 'sc', 'vsc', 'libre']) DomF1.classe(this.racine, t, t === c.type);
      DomF1.attribut(this.trace, 'd', BandeauNeutralisation.ICONES[c.icone]);
      this.type = c.type;
    }
    DomF1.classe(this.racine, 'fondu', c.type === 'libre' && this.libre < 0.25);
    DomF1.texte(this.titre, c.titre);
    DomF1.texte(this.detail, c.detail);
  }
}
