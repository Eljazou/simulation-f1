// Carte des surfaces du circuit : sur quoi roule une voiture (asphalte, vibreur, herbe, gravier,
// mur), selon sa position sur la piste (indice du point le plus proche, écart latéral). Elle ne
// bouge pas : ce n'est pas un Vehicle. Elle est calculée une fois par circuit, à partir des
// placements du décor (bacs à gravier, rails), pour que la physique et le dessin soient d'accord.
//
// Elle tient aussi la GOMME déposée sur la piste : au fil des tours, les voitures laissent du
// caoutchouc sur la trajectoire (deposer) ; plus il y en a, plus l'adhérence est bonne près de la
// ligne de course (bonusGomme), jusqu'à GOMME_MAX.
class CarteSurfaces {
  // Largeur d'un vibreur au-delà du bord de la piste, en pixels (adhérence de la glisse).
  static LARGEUR_VIBREUR = 6;
  // Limites de piste, telles que le décor les dessine (DecorCircuit.TRAITS, au-delà de l'asphalte) :
  // la ligne blanche (3,5 px) et le vibreur rouge et blanc (11 px), des deux côtés de chaque virage.
  static LIGNE_BLANCHE = 3.5;
  static VIBREUR_DESSINE = 11;
  // Le mur dessiné (bord de l'herbe, DecorCircuit.TRAITS), en px de l'axe : les rails du décor ne
  // sont pas dessinés et n'en sont jamais plus près (avant le 18 octobre 2026, un rail à 62 px
  // faisait du vibreur un « mur » qui arrêtait la voiture).
  static MUR_DESSINE = DecorCircuit.TRAITS.herbe / 2;
  // Gomme : bonus d'adhérence maximal, largeur de la bande gommée autour de la ligne de course,
  // quantité déposée par passage (part du maximum), et évaporation (part perdue par seconde).
  static GOMME_MAX = 0.05;
  static LARGEUR_GOMME = 16;
  static DEPOT = 0.0006;
  static EVAPORATION = 0.0005;

  // circuit = le Circuit ; decor = un DecorCircuit (ses placements : graviers, rails).
  constructor(circuit, decor) {
    this.circuit = circuit;
    const n = circuit.n;
    // vibreurs : à la corde de chaque virage, et à l'extérieur de la sortie (comme le décor)
    this.vibreurs = { '1': new Array(n).fill(false), '-1': new Array(n).fill(false) };
    circuit.virages.forEach(virage => {
      const zones = [[virage.sens, virage.debut, virage.fin], [-virage.sens, virage.apex, circuit.indice(virage.fin + 6)]];
      zones.forEach(([cote, debut, fin]) => {
        for (let i = debut; i !== fin; i = (i + 1) % n) {
          if (cote === circuit.exterieur && decor.presDesStands(i)) continue;
          this.vibreurs[cote][i] = true;
        }
      });
    });
    // vibreurs dessinés (limites de piste) : des deux côtés, du début à la fin de chaque virage
    this.bordures = { '1': new Array(n).fill(false), '-1': new Array(n).fill(false) };
    circuit.virages.forEach(virage => {
      for (let i = virage.debut; ; i = (i + 1) % n) {
        this.bordures['1'][i] = true;
        this.bordures['-1'][i] = true;
        if (i === virage.fin) break;
      }
    });
    // graviers : profondeur au-delà du bord (0 sans gravier)
    this.graviers = { '1': new Array(n).fill(0), '-1': new Array(n).fill(0) };
    decor.graviers.forEach(({ cote, tranche }) => tranche.forEach(t => { this.graviers[cote][t.i] = t.profondeur; }));
    // dégagements dessinés (asphalte coloré ou gris) : leur demi-largeur, 0 ailleurs ; on y roule
    // comme sur l'asphalte (ni herbe ni gravier dessous)
    this.degagements = { '1': new Array(n).fill(0), '-1': new Array(n).fill(0) };
    const T = DecorCircuit.TRAITS;
    const degager = (virages, marge, largeur) => virages.forEach(v => {
      for (let k = v.debut - marge; k <= v.fin + marge + (v.fin < v.debut ? n : 0); k++) {
        const i = circuit.indice(k);
        this.degagements['1'][i] = Math.max(this.degagements['1'][i], largeur / 2);
        this.degagements['-1'][i] = Math.max(this.degagements['-1'][i], largeur / 2);
      }
    });
    degager(decor.freinages ?? [], 4, T.degagementCouleur);
    degager(decor.degagementsGris ?? [], 2, T.degagementGris);
    // murs : distance du rail à la ligne centrale (null : pas de rail, le long des stands), jamais
    // plus près que le mur dessiné
    const derriere = r => (r === null || r === undefined ? r : Math.max(r, CarteSurfaces.MUR_DESSINE));
    this.rails = { '1': decor.rails['1'].map(derriere), '-1': decor.rails['-1'].map(derriere) };
    // gomme déposée en chaque point (0 à 1)
    this.gomme = new Array(n).fill(0);
  }

  // Surface au point d'indice i, à l'écart latéral `ecart` de la ligne centrale. demiLargeur =
  // demi-largeur de la carrosserie (pour le contact avec le mur).
  surface(i, ecart, demiLargeur = 0) {
    const c = this.circuit;
    const demi = c.largeur / 2;
    const cote = ecart >= 0 ? '1' : '-1';
    const d = Math.abs(ecart);
    const rail = this.rails[cote][i];
    if (rail !== null && rail !== undefined && d + demiLargeur > rail) return 'mur';
    // ligne blanche : asphalte ; vibreur dessiné (11 px, dans chaque virage) : vibreur ;
    // dégagement dessiné : asphalte
    if (d <= demi + CarteSurfaces.LIGNE_BLANCHE) return 'asphalte';
    if (this.vibreurs[cote][i] && d <= demi + CarteSurfaces.LARGEUR_VIBREUR) return 'vibreur';
    if (this.bordures[cote][i] && d <= demi + CarteSurfaces.VIBREUR_DESSINE) return 'vibreur';
    if (d <= this.degagements[cote][i]) return 'asphalte';
    const gravier = this.graviers[cote][i];
    if (gravier > 0 && d <= demi + 4 + gravier) return 'gravier';
    return 'herbe';
  }

  // Limite de piste au point i, du côté `cote` (1 ou -1), en px de l'axe : le bord extérieur du
  // vibreur s'il y en a un (il fait partie de la piste), sinon celui de la ligne blanche. Limites
  // strictes : la ligne blanche partout.
  limite(i, cote, { strictes = false } = {}) {
    const vibreur = !strictes && this.bordures[cote >= 0 ? '1' : '-1'][i];
    return this.circuit.largeur / 2 + (vibreur ? CarteSurfaces.VIBREUR_DESSINE : CarteSurfaces.LIGNE_BLANCHE);
  }

  // Bonus d'adhérence dû à la gomme, au point i, à l'écart `ecart` : maximal sur la ligne de
  // course, nul à LARGEUR_GOMME pixels de part et d'autre.
  bonusGomme(i, ecart) {
    const ecartLigne = Math.abs(ecart - this.circuit.decalagesLigne[i]);
    if (ecartLigne >= CarteSurfaces.LARGEUR_GOMME) return 0;
    return CarteSurfaces.GOMME_MAX * this.gomme[i] * (1 - ecartLigne / CarteSurfaces.LARGEUR_GOMME);
  }

  // Une voiture passe sur le point i à l'écart `ecart` : elle dépose un peu de gomme si elle est
  // près de la ligne de course (le caoutchouc s'accumule là où tout le monde passe).
  deposer(i, ecart, quantite = 1) {
    if (Math.abs(ecart - this.circuit.decalagesLigne[i]) > CarteSurfaces.LARGEUR_GOMME) return;
    this.gomme[i] = Math.min(1, this.gomme[i] + CarteSurfaces.DEPOT * quantite);
  }

  // Le temps passe : la gomme s'en va lentement (pluie : bien plus vite).
  update(dt, humidite = 0) {
    const perte = CarteSurfaces.EVAPORATION * dt * (1 + 20 * humidite);
    for (let i = 0; i < this.gomme.length; i++) this.gomme[i] = Math.max(0, this.gomme[i] - perte);
  }

  // Nouvelle course : piste propre.
  reinitialiser() {
    this.gomme.fill(0);
  }
}
