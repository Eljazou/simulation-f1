// HUD pilote (HTML, design/ « HUD pilote — 3 états ») : vitesse en très grand, rapport, barres gaz
// et frein, DRS (indisponible, disponible qui clignote à 2 Hz, actif), pneus (usure et
// température), position P2/12, temps du tour en cours, écarts devant et derrière colorés selon
// leur évolution (vert : en notre faveur, rouge : contre nous). Alerte « pneus » (usure au-delà de
// 70 %, ou température plus de ECART_SURCHAUFFE °C au-dessus de la fenêtre du pneu monté) : cadre
// rouge pulsé et bandeau. Écart avec le design (alerte fixe à 115 °C) : le modèle fait tourner les
// slicks vers 115-125 °C en course normale ; un seuil fixe resterait allumé en permanence.
//
// Il montre la voiture du joueur, sinon la voiture choisie (clic) ; aucune : il se cache. Il ne
// fait que lire : la voiture, le chronométrage, et les commandes lissées de la télémétrie.
//
// Écart avec le design : le modèle n'a qu'une usure et une température de pneus par voiture (pas
// une par roue) ; le HUD montre donc un seul train de pneus au lieu de quatre cases inventées.
class HudCourse {
  static USURE_ALERTE = 0.7;
  static ECART_SURCHAUFFE = 15;

  // Température d'alerte pour le pneu monté : haut de sa fenêtre (Glisse.FENETRES) + ECART_SURCHAUFFE.
  static temperatureAlerte(voiture) {
    const fenetre = Glisse.FENETRES[Pneus.type(voiture.typePneus).categorie] ?? Glisse.FENETRES.slick;
    return fenetre[1] + HudCourse.ECART_SURCHAUFFE;
  }

  constructor(racine) {
    this.racine = racine;
    const $ = id => document.getElementById(id);
    this.dom = {
      vitesse: $('f1-hud-vitesse'), rapport: $('f1-hud-rapport'),
      gaz: $('f1-hud-gaz'), gazValeur: $('f1-hud-gaz-valeur'), frein: $('f1-hud-frein'), freinValeur: $('f1-hud-frein-valeur'),
      drsLigne: $('f1-hud-drs-ligne'), drs: $('f1-hud-drs'), drsLibelle: $('f1-hud-drs-libelle'),
      pneu: $('f1-hud-pneu'), pneuUsure: $('f1-hud-pneu-usure'), pneuType: $('f1-hud-pneu-type'), pneuTemp: $('f1-hud-pneu-temp'), pneuPct: $('f1-hud-pneu-pct'),
      alerte: $('f1-hud-alerte'), alerteTexte: $('f1-hud-alerte-texte'), limites: $('f1-hud-limites'),
      position: $('f1-hud-position'), total: $('f1-hud-total'), tour: $('f1-hud-tour'),
      devantLibelle: $('f1-hud-devant-libelle'), devant: $('f1-hud-devant'), derriereLibelle: $('f1-hud-derriere-libelle'), derriere: $('f1-hud-derriere'),
    };
    // tendance des écarts : dernière valeur différente vue, et le sens de la dernière variation
    this.tendances = { devant: { valeur: null, sens: 0, voiture: null }, derriere: { valeur: null, sens: 0, voiture: null } };
  }

  // La voiture montrée : le joueur, sinon la voiture choisie.
  static voitureMontree(course) {
    return course.joueur ?? course.selection ?? null;
  }

  // Rapport engagé (1 à 8) selon la vitesse : même règle que VoiturePilote.rapport, pour toutes
  // les voitures.
  static rapport(voiture) {
    const allure = Math.min(0.999, voiture.vitesse / Math.max(0.1, voiture.parametres.vitesseMax * 1.1));
    return 1 + Math.floor(allure * VoiturePilote.RAPPORTS);
  }

  // Le numéro (1, 2...) de la zone DRS où se trouve la voiture, ou 0.
  static zoneDRS(voiture) {
    const c = voiture.circuit;
    return c.zonesDRS.findIndex(z => c.dansIntervalle(voiture.indicePiste, z.debut, z.fin)) + 1;
  }

  // État du DRS : 'actif', 'disponible' ou 'indisponible', et le texte qui l'accompagne.
  static drs(voiture) {
    const zone = HudCourse.zoneDRS(voiture);
    const pilote = voiture instanceof VoiturePilote;
    const actif = pilote ? voiture.drsActif : Boolean(voiture.drs);
    const disponible = pilote ? voiture.drsDisponible : false;
    if (actif) return { etat: 'actif', texte: `Actif · zone ${zone || 1}` };
    if (disponible) return { etat: 'disponible', texte: pilote ? 'Disponible · appuie sur Espace' : `Disponible · zone ${zone}` };
    return { etat: 'indisponible', texte: 'Indisponible' };
  }

  // Les données affichées (pures, testées) : voiture, course, commandes lissées { accelerateur, frein }.
  static donnees(course, voiture, commandes = Telemetrie.commandes(voiture)) {
    const chrono = course.chronometrage;
    const ordre = course.classement();
    const rang = ordre.indexOf(voiture);
    const intervalles = chrono.ecarts('intervalle');
    const devant = rang > 0 ? ordre[rang - 1] : null;
    const derriere = ordre[rang + 1] ?? null;
    const usure = 1 - voiture.pneus;
    const temperature = voiture.temperaturePneus;
    return {
      kmh: Math.round(voiture.vitesse * VoiturePilote.KMH),
      rapport: HudCourse.rapport(voiture),
      gaz: Math.round(commandes.accelerateur * 100),
      frein: Math.round(commandes.frein * 100),
      drs: HudCourse.drs(voiture),
      pneu: DomF1.lettrePneu(voiture.typePneus),
      usure,
      temperature,
      temperatureAlerte: HudCourse.temperatureAlerte(voiture),
      alerte: usure > HudCourse.USURE_ALERTE || temperature > HudCourse.temperatureAlerte(voiture),
      position: rang + 1,
      total: course.voitures.length,
      // incident du joueur (avant la reprise du contrôle) : « REMISE EN PISTE » à la place des écarts
      remise: (voiture.incident ?? null) !== null && voiture.sousControle === false,
      // limites de piste : « Limites 1/3 » dès le premier avertissement (null sinon)
      limites: (voiture.limites ?? 0) > 0
        ? `Limites ${Math.min(voiture.limites, course.parametres.avertissementsLimites + 1)}/${course.parametres.avertissementsLimites + 1}` : null,
      tour: chrono.tempsTourEnCours(voiture),
      devant: devant === null ? null : { voiture: devant, valeur: intervalles.get(voiture)?.valeur ?? null },
      derriere: derriere === null ? null : { voiture: derriere, valeur: intervalles.get(derriere)?.valeur ?? null },
    };
  }

  // Sens d'évolution d'un écart (−1 : il diminue, 1 : il augmente, 0 : pas encore connu).
  suivreTendance(cle, ecart) {
    const t = this.tendances[cle];
    if (ecart === null || ecart.valeur === null) {
      Object.assign(t, { valeur: null, sens: 0, voiture: ecart?.voiture ?? null });
      return 0;
    }
    if (ecart.voiture !== t.voiture) Object.assign(t, { valeur: ecart.valeur, sens: 0, voiture: ecart.voiture });
    if (Math.abs(ecart.valeur - t.valeur) > 1e-9) {
      t.sens = ecart.valeur < t.valeur ? -1 : 1;
      t.valeur = ecart.valeur;
    }
    return t.sens;
  }

  mettreAJour(course, { commandes = null, visible = true } = {}) {
    const voiture = HudCourse.voitureMontree(course);
    DomF1.cacher(this.racine, !visible || voiture === null);
    if (!visible || voiture === null) return;
    const d = HudCourse.donnees(course, voiture, commandes ?? Telemetrie.commandes(voiture));
    const { texte, classe, style } = DomF1;
    texte(this.dom.vitesse, d.kmh);
    texte(this.dom.rapport, d.rapport);
    style(this.dom.gaz, 'width', `${d.gaz}%`);
    texte(this.dom.gazValeur, d.gaz);
    style(this.dom.frein, 'width', `${d.frein}%`);
    texte(this.dom.freinValeur, d.frein);
    for (const etat of ['disponible', 'actif']) {
      classe(this.dom.drs, etat, d.drs.etat === etat);
      classe(this.dom.drsLigne, etat, d.drs.etat === etat);
    }
    texte(this.dom.drsLibelle, d.drs.texte);
    // pneus : barre d'usure (ce qui reste), température, pourcentage d'usure
    const reste = Math.max(0, Math.min(100, Math.round((1 - d.usure) * 100)));
    style(this.dom.pneuUsure, 'height', `${reste}%`);
    const couleur = d.usure > HudCourse.USURE_ALERTE ? 'var(--loss)' : d.usure > 0.5 ? 'var(--pit)' : 'var(--gain)';
    style(this.dom.pneuUsure, 'background', couleur);
    if (this.dom.pneuType.textContent !== d.pneu) this.dom.pneuType.className = `pneu ${d.pneu}`;
    texte(this.dom.pneuType, d.pneu);
    texte(this.dom.pneuTemp, `${Math.round(d.temperature)}°`);
    style(this.dom.pneuTemp, 'color', d.temperature > d.temperatureAlerte ? 'var(--loss)' : '');
    texte(this.dom.pneuPct, `${Math.round(d.usure * 100)}%`);
    classe(this.dom.pneu, 'mauvais', d.alerte);
    classe(this.racine, 'alerte', d.alerte);
    DomF1.cacher(this.dom.alerte, !d.alerte);
    if (d.alerte) {
      const raison = d.usure > HudCourse.USURE_ALERTE ? `PNEUS USÉS · ${Math.round(d.usure * 100)} %` : `PNEUS SURCHAUFFÉS · ${Math.round(d.temperature)} °C`;
      texte(this.dom.alerteTexte, `${raison} · BOX CONSEILLÉ`);
    }
    texte(this.dom.position, `P${d.position}`);
    texte(this.dom.total, d.total);
    texte(this.dom.tour, Chronometrage.formater(d.tour));
    // devant : un écart qui diminue est en notre faveur ; derrière : un écart qui augmente
    const sensDevant = this.suivreTendance('devant', d.devant);
    const sensDerriere = this.suivreTendance('derriere', d.derriere);
    const fleche = sens => (sens < 0 ? ' ▾' : sens > 0 ? ' ▴' : '');
    texte(this.dom.devantLibelle, d.devant ? `Devant · ${d.devant.voiture.pilote.code}` : 'Devant');
    texte(this.dom.devant, d.devant && d.devant.valeur !== null ? `${DomF1.ecartSigne(d.devant.valeur)}${fleche(sensDevant)}` : '—');
    classe(this.dom.devant, 'gain', sensDevant < 0);
    classe(this.dom.devant, 'perte', sensDevant > 0);
    texte(this.dom.derriereLibelle, d.derriere ? `Derrière · ${d.derriere.voiture.pilote.code}` : 'Derrière');
    texte(this.dom.derriere, d.derriere && d.derriere.valeur !== null ? `${DomF1.ecartSigne(-d.derriere.valeur)}${fleche(sensDerriere)}` : '—');
    classe(this.dom.derriere, 'gain', sensDerriere > 0);
    classe(this.dom.derriere, 'perte', sensDerriere < 0);
    // neutralisation (design : « Drapeau jaune · Safety car · VSC ») : sous VSC, les écarts sont
    // remplacés par la limite à respecter et la marge ; sous safety car, « pas de dépassement »
    DomF1.cacher(this.dom.limites, d.limites === null);
    if (d.limites !== null) texte(this.dom.limites, d.limites);
    classe(this.racine, 'remise', d.remise);
    if (d.remise) {
      texte(this.dom.devantLibelle, 'Incident');
      texte(this.dom.devant, 'REMISE EN PISTE');
      texte(this.dom.derriereLibelle, 'Pénalité');
      const penalite = course.parametres.penaliteAccident;
      texte(this.dom.derriere, penalite > 0 ? `+${penalite} s` : '—');
      for (const e of [this.dom.devant, this.dom.derriere]) {
        classe(e, 'gain', false);
        classe(e, 'perte', false);
      }
      classe(this.racine, 'neutralise', false);
      return;
    }
    const n = HudCourse.neutralisation(course, voiture);
    classe(this.racine, 'neutralise', n !== null);
    if (n === null) return;
    texte(this.dom.devantLibelle, n.devant.libelle);
    texte(this.dom.devant, n.devant.valeur);
    texte(this.dom.derriereLibelle, n.derriere.libelle);
    texte(this.dom.derriere, n.derriere.valeur);
    classe(this.dom.devant, 'gain', false);
    classe(this.dom.devant, 'perte', false);
    classe(this.dom.derriere, 'gain', n.derriere.ok === true);
    classe(this.dom.derriere, 'perte', n.derriere.ok === false);
  }

  // Ce que montrent les deux cases d'écart pendant une neutralisation, ou null. VSC : la limite
  // de vitesse ici (km/h) et la marge (limite - vitesse : positive = sous la limite, OK).
  static neutralisation(course, voiture) {
    const drapeau = course.drapeau;
    if (drapeau === 'vsc' && voiture.vsc) {
      const limite = Math.round(voiture.limiteVSC() * VoiturePilote.KMH);
      const marge = limite - Math.round(voiture.vitesse * VoiturePilote.KMH);
      return {
        devant: { libelle: 'Limite VSC', valeur: `${limite} km/h` },
        derriere: { libelle: 'Marge', valeur: `${marge >= 0 ? '+' : '−'}${Math.abs(marge)} km/h`, ok: marge >= 0 },
      };
    }
    if (drapeau === 'sc') {
      return {
        devant: { libelle: 'Safety car', valeur: course.etat === Course.ETATS.RELANCE ? 'Relance' : 'En piste' },
        derriere: { libelle: 'Consigne', valeur: 'Pas de dépassement', ok: null },
      };
    }
    return null;
  }
}
