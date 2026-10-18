// Fenêtre d'aide (design/ « Fenêtre d'aide ») : dialogue modal de 760 px, quatre groupes de
// raccourcis en deux colonnes, touches en <kbd>. Ouverte par le bouton « ? » de la barre, la
// touche ? ou h ; fermée par Échap, le bouton ou un clic sur le fond.
//
// Les touches listées sont celles du simulateur (clavier QWERTY). Écarts avec le design, où la
// règle du projet l'emporte : l'arrêt au stand est B (P est la pause, aussi en pilotage) ; h ouvre
// l'aide au lieu de masquer l'interface ; le panneau s'ouvre avec s (Tab en plus) ; d bascule le
// debug ; F (plein écran) et C (caméra) marchent aussi en pilotage.
class FenetreAide {
  // [groupe, [[action, touches]]] ; '|' sépare deux possibilités (« ou »).
  static GROUPES = [
    ['Conduite', [['Accélérer', ['W', '|', '↑']], ['Freiner', ['S', '|', '↓']], ['Diriger', ['A', 'D', '|', '←', '→']],
      ['Ouvrir le DRS', ['Espace']], ['Arrêt au stand', ['B']], ['Pneus du prochain arrêt', ['1', '…', '5']]]],
    ['Vue', [['Changer de caméra (aussi en course)', ['C']], ['Voiture précédente / suivante', ['[', ']']], ['Zoom carte', ['+', '−']], ['Plein écran (partout)', ['F']]]],
    ['Interface', [['Ouvrir / fermer le panneau', ['S', '|', 'Tab']], ['Onglet du panneau', ['1', '…', '5']], ['Écart ↔ intervalle', ['G']], ['Debug', ['D']]]],
    ['Course', [['Pause (menu : ↑ ↓, Entrée)', ['P', '|', 'Échap']], ['JOUER : choisir le mode de jeu', ['Entrée']], ['Rejouer la course (avec confirmation)', ['R']], ['Cette aide', ['?', '|', 'H']], ['Choisir sa voiture (pilote)', ['Tab']]]],
  ];

  constructor() {
    const $ = id => document.getElementById(id);
    this.racine = $('f1-aide');
    this.racine.hidden = true;
    const groupes = $('f1-aide-groupes');
    const { el } = DomF1;
    for (const [nom, rangees] of FenetreAide.GROUPES) {
      const section = el('section');
      section.appendChild(el('h3', 'lbl', nom));
      for (const [action, touches] of rangees) {
        const rangee = el('div', 'rangee');
        rangee.appendChild(el('span', '', action));
        const zone = el('span', 'touches');
        touches.forEach(t => zone.appendChild(t === '|' ? el('span', 'ou', 'ou') : el('kbd', '', t)));
        rangee.appendChild(zone);
        section.appendChild(rangee);
      }
      groupes.appendChild(section);
    }
    $('f1-aide-fermer').addEventListener('click', () => this.fermer());
    this.racine.addEventListener('click', evenement => { if (evenement.target === this.racine) this.fermer(); });
  }

  get ouverte() {
    return !this.racine.hidden;
  }

  ouvrir() {
    this.racine.hidden = false;
  }

  fermer() {
    this.racine.hidden = true;
  }

  basculer() {
    this.racine.hidden = !this.racine.hidden;
  }
}
