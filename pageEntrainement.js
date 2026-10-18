// Page d'entraînement IA (bouton « Entraînement IA » de la barre du haut). Ce n'est pas un
// Vehicle et elle ne bouge rien : elle montre l'Entraineur (entraineur.js), qui fait rouler les
// voitures, et règle ses paramètres. Même design que l'interface du jeu (verre sombre, Barlow
// Condensed, accent #e10600, variables CSS d'interfaceF1.css). Disposition (zones, de 1280 × 720
// à 1920 × 1080) :
//   haut     barre : titre, « Étape 1 · seul » / « Étape 2 · trafic », niveau, statut, Retour ;
//   gauche   le RÉSEAU de la meilleure voiture en direct (SVG) : entrées et sorties nommées,
//            connexions (épaisseur = |poids|, rouge positif, bleu négatif), neurones colorés selon
//            leur activation ;
//   centre   la piste et toutes les voitures d'entraînement (dessin p5), la meilleure en
//            surbrillance avec les rayons de ses capteurs ;
//   droite   génération, voitures en vie, meilleur fitness, note de qualité et badge ; courbe du
//            fitness (meilleur, moyenne) par génération, avec axes et valeurs ; les 4 POIDS de la
//            meilleure voiture le long de son tour ;
//   bas      Démarrer, Pause, Réinitialiser, curseurs (vitesse 1x à 20x, population, taux et
//            amplitude de mutation, neurones cachés, graine, seuil « prêt »), curriculum, arrêt
//            automatique, pondérations du fitness, modèles (Sauvegarder, Charger, Renommer,
//            Supprimer, Exporter, Importer), Tester le modèle (seul, contre les classiques).
// Les curseurs sont actifs pendant le glissement (événement input) et validés par
// Reglages.fabrique. Vitesse, mutation, pondérations, seuil et arrêt automatique s'appliquent tout
// de suite ; population, neurones cachés, graine et curriculum à la prochaine réinitialisation.
class PageEntrainement {
  static FREQUENCE = 10;
  static MARGE = 12;
  static BARRE = 48;
  // Valeurs de départ des curseurs : les constantes de l'Entraineur et du réseau.
  static PLAGES = {
    vitesse: { min: 1, max: Entraineur.VITESSE_MAX, pas: 1, initial: Entraineur.VITESSE, decimales: 0, unite: 'x', entier: true },
    population: { min: Entraineur.POPULATION_MIN, max: Entraineur.POPULATION_MAX, pas: 5, initial: Entraineur.POPULATION, decimales: 0, unite: '', entier: true },
    tauxMutation: { min: 0, max: 0.5, pas: 0.01, initial: Entraineur.TAUX_MUTATION, decimales: 2, unite: '' },
    amplitudeMutation: { min: 0.05, max: 1.5, pas: 0.05, initial: Entraineur.AMPLITUDE_MUTATION, decimales: 2, unite: '' },
    neurones: { min: ReseauNeuronal.CACHES_MIN, max: ReseauNeuronal.CACHES_MAX, pas: 1, initial: ReseauNeuronal.CACHES, decimales: 0, unite: '', entier: true },
    graine: { min: 1, max: 9999, pas: 1, initial: Entraineur.GRAINE, decimales: 0, unite: '', entier: true },
    seuilPret: { min: 40, max: 95, pas: 1, initial: Entraineur.SEUIL_PRET, decimales: 0, unite: '', entier: true },
    poidsProgression: { min: 0, max: 3, pas: 0.1, initial: Entraineur.POIDS_FITNESS.progression, decimales: 1, unite: '' },
    poidsTour: { min: 0, max: 50, pas: 1, initial: Entraineur.POIDS_FITNESS.tour, decimales: 0, unite: '' },
    poidsSecteur: { min: 0, max: 20, pas: 1, initial: Entraineur.POIDS_FITNESS.secteur, decimales: 0, unite: '' },
    poidsVitesse: { min: 0, max: 50, pas: 1, initial: Entraineur.POIDS_FITNESS.vitesse, decimales: 0, unite: '' },
    poidsLigne: { min: 0, max: 30, pas: 1, initial: Entraineur.POIDS_FITNESS.ligne, decimales: 0, unite: '' },
    poidsSortie: { min: 0, max: 40, pas: 1, initial: Entraineur.POIDS_FITNESS.sortie, decimales: 0, unite: '' },
    poidsContact: { min: 0, max: 50, pas: 1, initial: Entraineur.POIDS_FITNESS.contact, decimales: 0, unite: '' },
    poidsGlisse: { min: 0, max: 20, pas: 1, initial: Entraineur.POIDS_FITNESS.glisse, decimales: 0, unite: '' },
    poidsImmobilite: { min: 0, max: 20, pas: 1, initial: Entraineur.POIDS_FITNESS.immobilite, decimales: 0, unite: '' },
    poidsArriere: { min: 0, max: 40, pas: 1, initial: Entraineur.POIDS_FITNESS.arriere, decimales: 0, unite: '' },
  };
  static REGLAGES = Reglages.fabrique(PageEntrainement.PLAGES);
  // id du curseur d'un réglage : tauxMutation -> ia-taux-mutation
  static id(cle) {
    return `ia-${cle.replace(/[A-Z]/g, lettre => `-${lettre.toLowerCase()}`)}`;
  }

  static COULEURS = { seek: '#2fd3ff', arrive: '#ff5a52', wander: '#7cff8a', separation: '#ff5ad1' };
  static NIVEAUX = { ecole: 'École · sec', classique: 'Classique · sec', technique: 'Technique · humide', rapide: 'Rapide · mouillé',
    aleatoire: 'Circuits aléatoires' };

  // Zones de la page pour une fenêtre largeur × hauteur (adaptées de 1280 × 720 à 1920 × 1080) :
  // { barre, gauche, droite, bas, centre }, chacune { x, y, largeur, hauteur }.
  static zones(largeur, hauteur) {
    const m = PageEntrainement.MARGE;
    const t = Math.max(0, Math.min(1, (largeur - 1280) / 640));
    const gauche = Math.round(270 + 110 * t);
    const droite = Math.round(320 + 120 * t);
    const bas = hauteur >= 900 ? 132 : 170;
    const haut = m * 2 + PageEntrainement.BARRE;
    const zone = (x, y, l, h) => ({ x, y, largeur: Math.max(40, l), hauteur: Math.max(40, h) });
    return {
      barre: zone(m, m, largeur - 2 * m, PageEntrainement.BARRE),
      gauche: zone(m, haut, gauche, hauteur - haut - bas - 2 * m),
      droite: zone(largeur - m - droite, haut, droite, hauteur - haut - bas - 2 * m),
      bas: zone(m, hauteur - m - bas, largeur - 2 * m, bas),
      centre: zone(2 * m + gauche, haut, largeur - 4 * m - gauche - droite, hauteur - haut - bas - 2 * m),
    };
  }

  // Courbe du fitness par génération dans un cadre largeur × hauteur (avec marges pour les
  // axes) : { meilleur, moyenne } (attributs points de polylignes SVG), { min, max } de l'axe.
  static courbeFitness(historique, largeur = 360, hauteur = 170, marges = { gauche: 36, bas: 20, haut: 8, droite: 8 }) {
    if (historique.length === 0) return { meilleur: '', moyenne: '', min: 0, max: 1 };
    const valeurs = historique.flatMap(h => [h.meilleur, h.moyenne]).filter(Number.isFinite);
    let min = Math.min(0, ...valeurs);
    let max = Math.max(1, ...valeurs);
    if (max - min < 1e-9) max = min + 1;
    const n = historique.length;
    const x = k => marges.gauche + (n === 1 ? 0 : k / (n - 1)) * (largeur - marges.gauche - marges.droite);
    const y = v => hauteur - marges.bas - (v - min) / (max - min) * (hauteur - marges.bas - marges.haut);
    const points = cle => historique.map((h, k) => `${x(k).toFixed(1)},${y(h[cle]).toFixed(1)}`).join(' ');
    return { meilleur: points('meilleur'), moyenne: points('moyenne'), min, max };
  }

  // Les 4 poids le long du tour : serie = [[fraction du tour, seek, arrive, wander, separation]].
  static courbesPoids(serie, largeur = 360, hauteur = 150, marges = { gauche: 28, bas: 18, haut: 6, droite: 6 }) {
    const courbes = {};
    VoitureNeuronale.COMPORTEMENTS.forEach((nom, k) => {
      courbes[nom] = serie.map(p => {
        const x = marges.gauche + Math.max(0, Math.min(1, p[0])) * (largeur - marges.gauche - marges.droite);
        const y = hauteur - marges.bas - Math.max(0, Math.min(1, p[k + 1])) * (hauteur - marges.bas - marges.haut);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
    });
    return courbes;
  }

  // Couleur d'une valeur de -1 (bleu) à +1 (rouge), en passant par le gris.
  static couleur(v) {
    const t = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
    const gris = [70, 76, 86];
    const cible = t >= 0 ? [225, 6, 0] : [47, 128, 255];
    const a = Math.abs(t);
    return DomF1.rgb(gris.map((c, i) => Math.round(c + (cible[i] - c) * a)));
  }

  // options : gestionnaire (GestionnaireModeles), horloge (ms, budget de l'Entraineur), date
  // (texte ISO des sauvegardes), actions : fermer(), modelesChanges(), exporter(nom, texte).
  constructor({ gestionnaire, horloge = () => 0, date = () => '', actions = {} } = {}) {
    this.gestionnaire = gestionnaire;
    this.horloge = horloge;
    this.date = date;
    this.actions = actions;
    this.entraineur = null;
    this.ouverte = false;
    this.temps = Infinity;
    this.reseauDessine = null;
    const $ = id => document.getElementById(id);
    this.$ = $;
    this.racine = $('ia-page');
    this.dom = {
      etape: $('ia-etape'), niveau: $('ia-niveau'), statut: $('ia-statut'), architecture: $('ia-architecture'),
      reseau: $('ia-reseau-svg'), generation: $('ia-generation'), enVie: $('ia-en-vie'), meilleur: $('ia-meilleur'),
      note: $('ia-note'), badge: $('ia-badge'), fitness: $('ia-fitness-svg'), poids: $('ia-poids-svg'), detail: $('ia-detail'),
      liste: $('ia-liste-modeles'), nom: $('ia-nom-modele'), message: $('ia-message'), fichier: $('ia-fichier'),
    };
    // réglages en cours (curseurs) ; certains ne servent qu'à la réinitialisation
    this.reglages = Object.fromEntries(Object.entries(PageEntrainement.PLAGES).map(([cle, p]) => [cle, p.initial]));
    this.reglages.curriculum = true;
    this.reglages.arretAuto = false;
    for (const cle of Object.keys(PageEntrainement.PLAGES)) {
      const id = PageEntrainement.id(cle);
      PageEntrainement.REGLAGES.lierCurseur($(id), $(`${id}-valeur`), cle, valeur => this.regler(cle, valeur));
    }
    for (const [cle, id] of [['curriculum', 'ia-curriculum'], ['arretAuto', 'ia-arret-auto']]) {
      const c = $(id);
      c.checked = this.reglages[cle];
      c.addEventListener('change', () => { this.regler(cle, c.checked); c.blur(); });
    }
    const bouton = (id, action) => $(id).addEventListener('click', () => { action(); $(id).blur(); });
    bouton('ia-retour', () => this.fermer());
    bouton('ia-demarrer', () => this.demarrer());
    bouton('ia-pause', () => this.pause());
    bouton('ia-reinitialiser', () => this.reinitialiser());
    bouton('ia-sauvegarder', () => this.sauvegarder());
    bouton('ia-charger', () => this.charger(this.dom.liste.value));
    bouton('ia-renommer', () => this.renommer(this.dom.liste.value, this.dom.nom.value));
    bouton('ia-supprimer', () => this.supprimer(this.dom.liste.value));
    bouton('ia-exporter', () => this.exporter(this.dom.liste.value));
    bouton('ia-importer', () => { if (typeof this.dom.fichier.click === 'function') this.dom.fichier.click(); });
    bouton('ia-tester-seul', () => this.tester('seul'));
    bouton('ia-tester-trafic', () => this.tester('trafic'));
    this.dom.fichier.addEventListener('change', () => {
      const fichier = this.dom.fichier.files && this.dom.fichier.files[0];
      if (fichier && typeof fichier.text === 'function') fichier.text().then(texte => this.importer(texte));
    });
    // dans le champ du nom, Entrée ne va pas au jeu ; Échap rend la main
    this.dom.nom.addEventListener('keydown', evenement => { if (evenement.key === 'Escape' || evenement.key === 'Enter') this.dom.nom.blur(); });
    this.remplirListe();
  }

  // Un curseur ou une case : appliqué tout de suite à l'entraîneur quand c'est possible.
  regler(cle, valeur) {
    this.reglages[cle] = valeur;
    const e = this.entraineur;
    if (e === null) return;
    if (cle === 'vitesse') e.vitesse = valeur;
    else if (cle === 'tauxMutation') e.tauxBase = e.taux = valeur;
    else if (cle === 'amplitudeMutation') e.amplitudeBase = e.amplitude = valeur;
    else if (cle === 'seuilPret') {
      e.seuilPret = valeur;
      e.pret = e.note !== null && e.note >= valeur;
    } else if (cle === 'arretAuto') e.arretAuto = valeur;
    else if (cle.startsWith('poids')) e.poidsFitness[cle[5].toLowerCase() + cle.slice(6)] = valeur;
  }

  // Les options de l'Entraineur d'après les réglages.
  optionsEntraineur() {
    const r = this.reglages;
    const poidsFitness = {};
    for (const nom of Object.keys(Entraineur.POIDS_FITNESS)) poidsFitness[nom] = r[`poids${nom[0].toUpperCase()}${nom.slice(1)}`];
    return { population: r.population, caches: r.neurones, graine: r.graine, tauxMutation: r.tauxMutation, amplitudeMutation: r.amplitudeMutation,
      curriculum: r.curriculum, vitesse: r.vitesse, seuilPret: r.seuilPret, arretAuto: r.arretAuto, poidsFitness, horloge: this.horloge };
  }

  // L'entraîneur n'est créé qu'à la première ouverture (calculer le circuit école prend un moment).
  preparer() {
    if (this.entraineur === null) this.entraineur = new Entraineur(this.optionsEntraineur());
    return this.entraineur;
  }

  ouvrir() {
    this.preparer();
    this.ouverte = true;
    DomF1.cacher(this.racine, false);
    for (const id of ['f1-ui', 'panneau-f1']) {
      const e = this.$(id);
      if (e) e.hidden = true;
    }
    this.remplirListe();
    this.forcer();
  }

  fermer() {
    this.ouverte = false;
    if (this.entraineur !== null) this.entraineur.pause();
    DomF1.cacher(this.racine, true);
    for (const id of ['f1-ui', 'panneau-f1']) {
      const e = this.$(id);
      if (e) e.hidden = false;
    }
    if (this.actions.fermer) this.actions.fermer();
  }

  demarrer() {
    const e = this.preparer();
    e.arreterTest();
    e.demarrer();
    this.forcer();
  }

  pause() {
    this.preparer().pause();
    this.forcer();
  }

  reinitialiser() {
    const e = this.preparer();
    const enCours = e.enCours;
    e.reinitialiser(this.optionsEntraineur());
    if (enCours) e.demarrer();
    this.reseauDessine = null;
    this.forcer();
  }

  tester(mode) {
    const e = this.preparer();
    e.lancerTest(mode);
    this.afficherMessage(mode === 'seul' ? 'Test : le meilleur réseau seul, sur un circuit jamais vu.'
      : 'Test : le meilleur réseau contre des voitures classiques, sur un circuit jamais vu. « Démarrer » reprend l\'entraînement.');
    this.forcer();
  }

  afficherMessage(texte) {
    DomF1.texte(this.dom.message, texte);
    DomF1.cacher(this.dom.message, texte === '');
  }

  // --- Modèles ------------------------------------------------------------------------------

  remplirListe() {
    const liste = this.dom.liste;
    const choisi = liste.value;
    const modeles = this.gestionnaire.liste();
    liste.replaceChildren(...modeles.map(m => {
      const o = DomF1.el('option', '', `${m.nom}${m.note === null ? '' : ` · ${m.note}/100`}${m.integre ? ' (fourni)' : ''}`);
      o.value = m.id;
      return o;
    }));
    if (modeles.some(m => m.id === choisi)) liste.value = choisi;
    else if (modeles.length > 0) liste.value = modeles.at(-1).id;
  }

  modelesChanges() {
    this.remplirListe();
    if (this.actions.modelesChanges) this.actions.modelesChanges();
  }

  // Sauvegarde le meilleur réseau (ou la population de départ) avec ses métadonnées.
  sauvegarder() {
    const e = this.preparer();
    const reseau = e.meilleur?.reseau ?? e.reseaux[0];
    const r = this.gestionnaire.sauvegarder(reseau, { nom: this.dom.nom.value, date: this.date(), generations: e.generation,
      meilleurFitness: e.meilleur === null ? null : Math.round(e.meilleur.fitness * 10) / 10, note: e.note });
    this.modelesChanges();
    this.dom.liste.value = r.id;
    this.afficherMessage(r.ok ? `Modèle « ${this.dom.nom.value} » sauvegardé.` : r.message);
    return r;
  }

  // Charger : la population repart de ce modèle (le modèle et des copies mutées).
  charger(id) {
    try {
      const { reseau, metadonnees } = this.gestionnaire.charger(id);
      const e = this.preparer();
      if (reseau.caches !== e.caches) this.reglages.neurones = reseau.caches;
      e.chargerReseau(reseau);
      this.reseauDessine = null;
      this.afficherMessage(`Population repartie du modèle « ${metadonnees.nom} ».`);
      return true;
    } catch (erreur) {
      this.afficherMessage(erreur.message);
      return false;
    }
  }

  renommer(id, nom) {
    const ok = this.gestionnaire.renommer(id, nom);
    if (ok) this.modelesChanges();
    this.afficherMessage(ok ? 'Modèle renommé.' : 'Un modèle fourni avec le jeu ne se renomme pas (ou le nom est vide).');
    return ok;
  }

  supprimer(id) {
    const ok = this.gestionnaire.supprimer(id);
    if (ok) this.modelesChanges();
    this.afficherMessage(ok ? 'Modèle supprimé.' : 'Un modèle fourni avec le jeu ne se supprime pas.');
    return ok;
  }

  // Exporter : un fichier JSON (téléchargé par le navigateur).
  exporter(id) {
    try {
      const texte = this.gestionnaire.exporter(id);
      const nom = `${String(this.gestionnaire.charger(id).metadonnees.nom).replace(/[^\w-]+/g, '_') || 'modele'}.json`;
      if (this.actions.exporter) this.actions.exporter(nom, texte);
      this.afficherMessage(`Export : ${nom}`);
      return texte;
    } catch (erreur) {
      this.afficherMessage(erreur.message);
      return null;
    }
  }

  importer(texte) {
    const r = this.gestionnaire.importer(texte);
    if (r.ok) {
      this.modelesChanges();
      this.dom.liste.value = r.id;
    }
    this.afficherMessage(r.ok ? (r.message || 'Modèle importé.') : r.message);
    return r;
  }

  // --- Une image ----------------------------------------------------------------------------

  // dt en secondes réelles.
  update(dt) {
    if (!this.ouverte) return;
    const e = this.preparer();
    e.avancer(dt);
    this.temps += dt;
    if (this.temps >= 1 / PageEntrainement.FREQUENCE) this.mettreAJourPage();
  }

  forcer() {
    this.temps = Infinity;
    if (this.entraineur !== null) this.mettreAJourPage();
  }

  // Textes, badge, SVG (10 Hz).
  mettreAJourPage() {
    this.temps = 0;
    const e = this.entraineur;
    const r = e.resume();
    const { texte, classe } = DomF1;
    texte(this.dom.etape, e.demo !== null ? `Test · ${e.demo.mode === 'seul' ? 'seul' : 'trafic'}` : r.etape === 1 ? 'Étape 1 · seul' : 'Étape 2 · trafic');
    classe(this.dom.etape, 'trafic', r.etape === 2);
    const c = e.demo !== null ? e.demo.circuit : r.circuit;
    texte(this.dom.niveau, `${PageEntrainement.NIVEAUX[r.niveau] ?? r.niveau} · ${c.profil} #${c.graine} · humidité ${Math.round((c.humidite ?? 0) * 100)} %`);
    texte(this.dom.statut, r.enCours ? `En cours · ${r.vitesse}x (effectif ${r.vitesseEffective.toFixed(1)}x)${r.evaluation ? ' · note en calcul' : ''}` : 'En pause');
    texte(this.dom.generation, r.generation);
    texte(this.dom.enVie, `${r.enVie}/${r.population}`);
    texte(this.dom.meilleur, r.meilleur === null ? '—' : r.meilleur.toFixed(1));
    texte(this.dom.note, r.note === null ? '—' : `${r.note}/100`);
    texte(this.dom.badge, r.pret ? 'Prêt pour la course' : 'En apprentissage');
    classe(this.dom.badge, 'pret', r.pret);
    classe(this.dom.badge, 'apprentissage', !r.pret);
    const d = e.detailNote;
    texte(this.dom.detail, d === null ? 'La note est calculée toutes les 3 générations, sur 3 circuits jamais vus (sec, humide, mouillé).'
      : `Note : tours propres ${d.toursPropres}/${d.toursDemandes} (${d.tours.toFixed(0)}/50), temps au tour ${d.temps.toFixed(0)}/30, contacts ${d.nombreContacts} (${d.contacts.toFixed(0)}/20).`);
    this.dessinerReseau(this.reseauMontre());
    this.dessinerFitness(e.historique);
    this.dessinerPoids(e.suiviMeilleur?.dernierTour ?? e.suiviMeilleur?.poids ?? []);
  }

  // La voiture montrée : la meilleure de la génération (ou la première du test).
  voitureMontree() {
    const e = this.entraineur;
    if (e === null) return null;
    if (e.demo !== null) return e.demo.manche.suivis.find(s => s.voiture instanceof VoitureNeuronale)?.voiture ?? null;
    return e.meilleureVoiture;
  }

  reseauMontre() {
    const v = this.voitureMontree();
    return v instanceof VoitureNeuronale ? v.reseau : this.entraineur.reseaux[0];
  }

  // Le réseau en SVG : construit une fois par architecture, puis seuls les attributs qui changent.
  dessinerReseau(reseau) {
    const { svg, attribut, texte } = DomF1;
    const E = ReseauNeuronal.ENTREES;
    const S = ReseauNeuronal.SORTIES;
    const N = reseau.caches;
    texte(this.dom.architecture, `${E} · ${N} · ${S}`);
    const L = 320;
    const H = 440;
    const colonne = { entree: 96, cache: 180, sortie: 252 };
    const y = (k, n) => 24 + (k + 0.5) * (H - 48) / n;
    if (this.reseauSvg?.N !== N) {
      const racine = this.dom.reseau;
      racine.replaceChildren();
      const liens = { caches: [], sorties: [] };
      for (let h = 0; h < N; h++) {
        for (let i = 0; i < E; i++) {
          const l = svg('line', { x1: colonne.entree, y1: y(i, E).toFixed(1), x2: colonne.cache, y2: y(h, N).toFixed(1) });
          racine.appendChild(l);
          liens.caches.push(l);
        }
      }
      for (let s = 0; s < S; s++) {
        for (let h = 0; h < N; h++) {
          const l = svg('line', { x1: colonne.cache, y1: y(h, N).toFixed(1), x2: colonne.sortie, y2: y(s, S).toFixed(1) });
          racine.appendChild(l);
          liens.sorties.push(l);
        }
      }
      const neurone = (x, yy, r) => { const c = svg('circle', { cx: x, cy: yy.toFixed(1), r, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1 }); racine.appendChild(c); return c; };
      const entrees = CapteursVoiture.LIBELLES.map((libelle, i) => {
        const t = svg('text', { x: colonne.entree - 12, y: (y(i, E) + 4).toFixed(1), 'text-anchor': 'end', class: 'ia-libelle' });
        t.textContent = libelle;
        racine.appendChild(t);
        return neurone(colonne.entree, y(i, E), 7);
      });
      const caches = Array.from({ length: N }, (_, h) => neurone(colonne.cache, y(h, N), 6));
      const sorties = VoitureNeuronale.COMPORTEMENTS.map((nom, s) => {
        const t = svg('text', { x: colonne.sortie + 13, y: (y(s, S) + 4).toFixed(1), class: 'ia-libelle', fill: PageEntrainement.COULEURS[nom] });
        t.textContent = { seek: 'Seek', arrive: 'Arrive', wander: 'Wander', separation: 'Sépar.' }[nom];
        racine.appendChild(t);
        return neurone(colonne.sortie, y(s, S), 8);
      });
      this.reseauSvg = { N, liens, entrees, caches, sorties };
      this.reseauDessine = null;
    }
    const d = this.reseauSvg;
    if (this.reseauDessine !== reseau) {
      // les poids ne changent qu'avec le réseau montré
      const trait = (l, w) => {
        attribut(l, 'stroke', w >= 0 ? 'rgba(225, 6, 0, .75)' : 'rgba(47, 128, 255, .75)');
        attribut(l, 'stroke-width', Math.min(3.5, 0.25 + Math.abs(w) * 1.2).toFixed(2));
        attribut(l, 'stroke-opacity', Math.min(1, 0.15 + Math.abs(w) * 0.5).toFixed(2));
      };
      reseau.poidsCaches.forEach((w, k) => trait(d.liens.caches[k], w));
      reseau.poidsSorties.forEach((w, k) => trait(d.liens.sorties[k], w));
      this.reseauDessine = reseau;
    }
    d.entrees.forEach((c, i) => attribut(c, 'fill', PageEntrainement.couleur(reseau.entrees[i] * 2 - 1)));
    d.caches.forEach((c, h) => attribut(c, 'fill', PageEntrainement.couleur(reseau.activations[h])));
    d.sorties.forEach((c, s) => attribut(c, 'fill', PageEntrainement.couleur(reseau.sorties[s] * 2 - 1)));
  }

  // Axes, valeurs et deux courbes (meilleur, moyenne).
  dessinerFitness(historique) {
    const { svg, attribut } = DomF1;
    const racine = this.dom.fitness;
    if (!this.fitnessSvg) {
      racine.replaceChildren();
      const axes = svg('path', { d: 'M36 8V150H352', class: 'ia-axe', fill: 'none' });
      const meilleur = svg('polyline', { class: 'ia-courbe meilleur', fill: 'none' });
      const moyenne = svg('polyline', { class: 'ia-courbe moyenne', fill: 'none' });
      const haut = svg('text', { x: 32, y: 14, 'text-anchor': 'end', class: 'ia-valeur' });
      const bas = svg('text', { x: 32, y: 150, 'text-anchor': 'end', class: 'ia-valeur' });
      const gens = svg('text', { x: 352, y: 166, 'text-anchor': 'end', class: 'ia-valeur' });
      const zero = svg('text', { x: 36, y: 166, class: 'ia-valeur' });
      for (const e of [axes, moyenne, meilleur, haut, bas, gens, zero]) racine.appendChild(e);
      this.fitnessSvg = { meilleur, moyenne, haut, bas, gens, zero };
    }
    const c = PageEntrainement.courbeFitness(historique);
    const f = this.fitnessSvg;
    attribut(f.meilleur, 'points', c.meilleur);
    attribut(f.moyenne, 'points', c.moyenne);
    DomF1.texte(f.haut, Math.round(c.max));
    DomF1.texte(f.bas, Math.round(c.min));
    DomF1.texte(f.zero, historique.length > 0 ? `gén. ${historique[0].generation}` : 'gén. 0');
    DomF1.texte(f.gens, historique.length > 0 ? `gén. ${historique.at(-1).generation}` : '');
  }

  dessinerPoids(serie) {
    const { svg, attribut } = DomF1;
    const racine = this.dom.poids;
    if (!this.poidsSvg) {
      racine.replaceChildren();
      racine.appendChild(svg('path', { d: 'M28 6V132H354', class: 'ia-axe', fill: 'none' }));
      for (const [y, t] of [[10, '1'], [132, '0']]) {
        const e = svg('text', { x: 24, y, 'text-anchor': 'end', class: 'ia-valeur' });
        e.textContent = t;
        racine.appendChild(e);
      }
      const debut = svg('text', { x: 28, y: 147, class: 'ia-valeur' });
      debut.textContent = 'départ du tour';
      const fin = svg('text', { x: 354, y: 147, 'text-anchor': 'end', class: 'ia-valeur' });
      fin.textContent = 'fin';
      racine.appendChild(debut);
      racine.appendChild(fin);
      this.poidsSvg = Object.fromEntries(VoitureNeuronale.COMPORTEMENTS.map(nom => {
        const l = svg('polyline', { fill: 'none', stroke: PageEntrainement.COULEURS[nom], 'stroke-width': 1.6 });
        racine.appendChild(l);
        return [nom, l];
      }));
    }
    const courbes = PageEntrainement.courbesPoids(serie);
    for (const nom of VoitureNeuronale.COMPORTEMENTS) attribut(this.poidsSvg[nom], 'points', courbes[nom]);
  }

  // --- Dessin p5 (centre) ---------------------------------------------------------------------

  show() {
    if (!this.ouverte || this.entraineur === null) return;
    const e = this.entraineur;
    background(11, 13, 16);
    const z = PageEntrainement.zones(width, height).centre;
    const manches = e.demo !== null ? [e.demo.manche] : e.manches;
    const circuit = manches[0].circuit;
    const echelle = Math.min(z.largeur / circuit.largeurMonde, z.hauteur / circuit.hauteurMonde);
    push();
    translate(z.x + (z.largeur - circuit.largeurMonde * echelle) / 2, z.y + (z.hauteur - circuit.hauteurMonde * echelle) / 2);
    scale(echelle);
    this.dessinerPiste(circuit, manches[0].meteo);
    const montree = this.voitureMontree();
    for (const manche of manches) {
      for (const suivi of manche.suivis) if (suivi.voiture !== montree) this.dessinerVoiture(suivi.voiture, suivi.eliminee, false);
    }
    if (montree !== null) {
      this.dessinerRayons(montree);
      this.dessinerVoiture(montree, false, true);
    }
    pop();
  }

  // La piste : asphalte, bords blancs, ligne de course pointillée, ligne d'arrivée. Mouillée :
  // plus sombre et bleutée.
  dessinerPiste(circuit, meteo) {
    const mouille = meteo ? meteo.humidite : 0;
    const contour = decalage => {
      beginShape();
      for (let i = 0; i < circuit.n; i += 2) {
        const p = circuit.pointLateral(i, decalage);
        vertex(p.x, p.y);
      }
      endShape(CLOSE);
    };
    push();
    noFill();
    strokeJoin(ROUND);
    stroke(28, 46, 34);
    strokeWeight(circuit.largeur + 40);
    contour(0);
    stroke(52 - 14 * mouille, 56 - 10 * mouille, 62 + 6 * mouille);
    strokeWeight(circuit.largeur);
    contour(0);
    stroke(230, 230, 230, 160);
    strokeWeight(2);
    contour(circuit.largeur / 2);
    contour(-circuit.largeur / 2);
    stroke(225, 6, 0, 90);
    strokeWeight(1.5);
    beginShape();
    for (let i = 0; i < circuit.n; i += 2) vertex(circuit.ligne[i].x, circuit.ligne[i].y);
    endShape(CLOSE);
    const a = circuit.pointLateral(0, circuit.largeur / 2);
    const b = circuit.pointLateral(0, -circuit.largeur / 2);
    stroke(255);
    strokeWeight(4);
    line(a.x, a.y, b.x, b.y);
    pop();
  }

  dessinerVoiture(voiture, eliminee, meilleure) {
    push();
    translate(voiture.pos.x, voiture.pos.y);
    rotate(voiture.cap);
    rectMode(CENTER);
    noStroke();
    if (meilleure) {
      fill(225, 6, 0, 70);
      circle(0, 0, 46);
      fill(225, 6, 0);
    } else if (eliminee) {
      fill(110, 119, 129, 90);
    } else if (voiture instanceof VoitureNeuronale) {
      fill(47, 211, 255, 150);
    } else {
      fill(230, 237, 243, 210);
    }
    rect(0, 0, VoitureF1.LONGUEUR, VoitureF1.LARGEUR, 3);
    pop();
  }

  dessinerRayons(voiture) {
    if (!(voiture instanceof VoitureNeuronale)) return;
    push();
    strokeWeight(1.5);
    for (const r of voiture.capteurs.rayons) {
      stroke(r.distance < CapteursVoiture.PORTEE_RAYON / 3 ? 'red' : 'yellow');
      line(voiture.pos.x, voiture.pos.y, r.x, r.y);
    }
    pop();
  }

  // Touches de la page : Échap = retour à la course, Espace = démarrer / pause.
  touche(key) {
    const k = String(key).toLowerCase();
    if (k === 'escape') {
      this.fermer();
      return true;
    }
    if (k === ' ') {
      if (this.preparer().enCours) this.pause();
      else this.demarrer();
      return true;
    }
    return false;
  }
}
