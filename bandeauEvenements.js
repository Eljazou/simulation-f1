// Bandeau d'événement (HTML, design/ : écran principal et Design system « Bandeau événement ») :
// en bas au centre, UN message à la fois, montré DUREE secondes avec un fondu de 250 ms (CSS).
// Ses messages viennent de la course : ses événements (course.evenements) et la radio d'équipe
// (course.messagesRadio). Chacun reçoit un type (PIT, RADIO, DRAPEAU, SC, ACCIDENT...), une
// couleur et une icône d'après son texte. Il ne fait que lire.
class BandeauEvenements {
  // Durée d'affichage d'un message (secondes) ; file d'attente maximale (les plus anciens sautent).
  static DUREE = 4;
  static MAINTIEN = 0.5;
  static FILE_MAX = 3;
  // Icônes (chemins SVG du design : clé, radio ; les autres dans le même trait de 24 px).
  static ICONES = {
    cle: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
    radio: 'M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4',
    drapeau: 'M5 21V4h11l-1.5 3.5L16 11H5',
    alerte: 'M12 3 2 20h20zM12 10v4M12 17v.5',
    info: 'M12 8v.5M12 11v6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  };
  // Types : [mot du bandeau, fond de l'icône, couleur du mot, icône]. Couleurs du design system.
  static TYPES = {
    pit: ['PIT', '#ff8a1f', '#ffb066', 'cle'],
    radio: ['RADIO', '#5aa9ff', '#7dbbff', 'radio'],
    jaune: ['DRAPEAU', '#f5c518', '#f5c518', 'drapeau'],
    sc: ['SC', '#f5c518', '#f5c518', 'drapeau'],
    vsc: ['VSC', '#f5c518', '#f5c518', 'drapeau'],
    accident: ['ACCIDENT', '#e74c3c', '#ff8a80', 'alerte'],
    penalite: ['PÉNALITÉ', '#e74c3c', '#ff8a80', 'alerte'],
    depart: ['COURSE', '#2ecc71', '#2ecc71', 'drapeau'],
    info: ['INFO', '#8b949e', '#c9d1d9', 'info'],
  };

  // Le type d'un texte d'événement (règles lues dans l'ordre).
  static typeDe(texte) {
    const t = texte.toLowerCase();
    if (/drapeau jaune|dépanneuse/.test(t)) return 'jaune';
    if (/virtual|\bvsc\b/.test(t)) return 'vsc';
    if (/accident|panne|abandon|immobilis/.test(t)) return 'accident';
    if (/pénalité|penalite|limites de piste/.test(t)) return 'penalite';
    if (/safety car/.test(t)) return 'sc';
    if (/stand|rentrera|box|pneus/.test(t)) return 'pit';
    if (/départ|feux|damier|victoire|reprise|relance/.test(t)) return 'depart';
    return 'info';
  }

  // Un message prêt à afficher : { type, qui (code pilote ou ''), texte }.
  static message(evenement, radio = false) {
    if (radio) {
      const m = { type: 'radio', qui: evenement.voiture?.pilote.code ?? 'BOX', texte: evenement.texte };
      // message prioritaire (incident du joueur) : en tête de la file, montré `duree` secondes
      if (evenement.prioritaire) Object.assign(m, { prioritaire: true, duree: evenement.duree ?? BandeauEvenements.DUREE });
      return m;
    }
    const texte = evenement.texte;
    // « #7 MIR : ... » ou « ... #7 MIR ... » : le code du pilote concerné
    const m = texte.match(/#\d+\s+([A-Z]{3})\b/);
    const qui = m ? m[1] : '';
    let reste = texte;
    if (m && texte.startsWith(m[0])) reste = texte.slice(m[0].length).replace(/^\s*[:,·-]?\s*/, '');
    const m2 = { type: BandeauEvenements.typeDe(texte), qui, texte: reste };
    // prioritaire (limites de piste du joueur) : montré tout de suite
    if (evenement.prioritaire) m2.prioritaire = true;
    return m2;
  }

  constructor(racine) {
    this.racine = racine;
    const $ = id => document.getElementById(id);
    this.dom = { chemin: $('f1-ev-chemin'), icone: $('f1-ev-icone'), type: $('f1-ev-type'), qui: $('f1-ev-qui'), texte: $('f1-ev-texte') };
    this.vus = new WeakSet();
    this.file = [];
    this.courant = null;
    this.reste = 0;
    this.course = null;
  }

  // Les nouveaux événements et messages radio de la course entrent dans la file.
  recueillir(course) {
    if (course !== this.course) {
      this.course = course;
      this.file = [];
      this.courant = null;
      this.reste = 0;
    }
    for (const e of course.evenements) {
      if (this.vus.has(e)) continue;
      this.vus.add(e);
      const m = BandeauEvenements.message(e);
      if (m.prioritaire) {
        this.file.unshift(m);
        this.reste = 0;
      } else {
        this.file.push(m);
      }
    }
    for (const r of course.messagesRadio) {
      if (this.vus.has(r)) continue;
      this.vus.add(r);
      const m = BandeauEvenements.message(r, true);
      if (m.prioritaire) {
        // il remplace le message en cours dès cette image
        this.file.unshift(m);
        this.reste = 0;
      } else {
        this.file.push(m);
      }
    }
    while (this.file.length > BandeauEvenements.FILE_MAX) this.file.shift();
  }

  // Le bandeau se vide (écran de fin, nouvelle course) : plus de message en cours ni en attente.
  vider() {
    this.file = [];
    this.courant = null;
    this.reste = 0;
    DomF1.classe(this.racine, 'visible', false);
  }

  // dt en secondes réelles (le bandeau se lit à vitesse humaine, même en accéléré).
  mettreAJour(course, dt, { decale = false } = {}) {
    this.recueillir(course);
    this.reste -= dt;
    if (this.reste <= 0) {
      this.courant = this.file.shift() ?? null;
      this.reste = this.courant === null ? 0 : this.courant.duree ?? BandeauEvenements.DUREE;
      if (this.courant !== null) this.afficher(this.courant);
    }
    DomF1.classe(this.racine, 'visible', this.courant !== null && this.reste > 0.25);
    DomF1.classe(this.racine, 'panneau-ouvert', decale);
  }

  // Un message imposé tant qu'une condition dure (radio de l'incident du joueur, pendant sa phase
  // radio) : montré tout de suite, gardé au moins MAINTIEN s après le dernier appel.
  imposer(m) {
    if (this.courant === null || this.courant.texte !== m.texte) {
      this.courant = m;
      this.afficher(m);
    }
    this.reste = Math.max(this.reste, BandeauEvenements.MAINTIEN);
    DomF1.classe(this.racine, 'visible', true);
  }

  afficher(m) {
    const [mot, fond, couleur, icone] = BandeauEvenements.TYPES[m.type];
    DomF1.attribut(this.dom.chemin, 'd', BandeauEvenements.ICONES[icone]);
    DomF1.style(this.dom.icone, 'background', fond);
    DomF1.texte(this.dom.type, mot);
    DomF1.style(this.dom.type, 'color', couleur);
    DomF1.texte(this.dom.qui, m.qui);
    DomF1.texte(this.dom.texte, m.type === 'radio' && !m.texte.includes('«') ? `« ${m.texte} »` : m.texte);
  }
}
