// Gestionnaire des modèles d'IA entraînés (réseaux de voitureNeuronale.js). Ce n'est pas un
// Vehicle et il ne bouge rien : il sauvegarde, liste, renomme, supprime, exporte et importe des
// modèles. Un modèle est un document JSON :
//   { format: 'f1-modele-ia', version, architecture, poids,
//     metadonnees: { nom, date, generations, meilleurFitness, note } }
// (architecture et poids : ceux de ReseauNeuronal.versJSON). Un document d'une autre version, ou
// dont l'architecture ne correspond pas, est refusé avec un message clair.
//
// Stockage : localStorage (injecté), chaque lecture et écriture en try/catch. S'il est
// indisponible (navigation privée, fichier local, quota), les modèles sont gardés pour la session
// et un message invite à passer par Exporter / Importer (un fichier). Les modèles INTÉGRÉS (fournis
// avec le jeu, models/) sont toujours listés, en lecture seule.
class GestionnaireModeles {
  static FORMAT = 'f1-modele-ia';
  static VERSION = ReseauNeuronal.VERSION;
  static CLE = 'f1-simulation-modeles-ia';
  static MESSAGE_SANS_STOCKAGE = 'Stockage du navigateur indisponible : le modèle est gardé pour cette session seulement. ' +
    'Utilisez « Exporter » pour l\'enregistrer dans un fichier, et « Importer » pour le recharger.';

  // Le document d'un réseau. meta : nom, date (texte ISO, donné par l'appelant), generations,
  // meilleurFitness, note (ou null).
  static documentDe(reseau, meta = {}) {
    const json = reseau.versJSON();
    return {
      format: GestionnaireModeles.FORMAT,
      version: json.version,
      architecture: json.architecture,
      poids: json.poids,
      metadonnees: {
        nom: String(meta.nom ?? 'Modèle').slice(0, 60) || 'Modèle',
        date: meta.date ?? '',
        generations: Number.isFinite(meta.generations) ? meta.generations : 0,
        meilleurFitness: Number.isFinite(meta.meilleurFitness) ? meta.meilleurFitness : null,
        note: Number.isFinite(meta.note) ? meta.note : null,
      },
    };
  }

  // Lit un document (objet ou texte JSON) : { reseau, metadonnees }. Lève RangeError s'il est
  // illisible, d'un autre format ou d'une version incompatible.
  static lire(document) {
    let doc = document;
    if (typeof doc === 'string') {
      try {
        doc = JSON.parse(doc);
      } catch {
        throw new RangeError('Fichier illisible : ce n\'est pas du JSON.');
      }
    }
    if (!doc || typeof doc !== 'object' || doc.format !== GestionnaireModeles.FORMAT) {
      throw new RangeError('Ce fichier n\'est pas un modèle d\'IA du circuit F1.');
    }
    if (doc.version !== GestionnaireModeles.VERSION) {
      throw new RangeError(`Version de modèle incompatible : ${doc.version}, ce jeu lit la version ${GestionnaireModeles.VERSION}.`);
    }
    const reseau = ReseauNeuronal.depuisJSON({ version: doc.version, architecture: doc.architecture, poids: doc.poids });
    return { reseau, metadonnees: { nom: 'Modèle', date: '', generations: 0, meilleurFitness: null, note: null, ...(doc.metadonnees ?? {}) } };
  }

  // stockage = localStorage ou null ; integres = [{ id, document }] (modèles fournis).
  constructor({ stockage = null, integres = [] } = {}) {
    this.stockage = stockage;
    this.integres = new Map();
    for (const { id, document } of integres) {
      try {
        GestionnaireModeles.lire(document);
        this.integres.set(id, document);
      } catch {
        // un modèle fourni illisible n'est simplement pas proposé
      }
    }
    this.memoire = new Map();
    this.message = '';
    this.disponible = this.tester();
    for (const [id, document] of this.lireStockage()) this.memoire.set(id, document);
  }

  // Le stockage marche-t-il vraiment (écriture puis lecture) ?
  tester() {
    if (this.stockage === null) return false;
    try {
      const cle = `${GestionnaireModeles.CLE}-essai`;
      this.stockage.setItem(cle, '1');
      const ok = this.stockage.getItem(cle) === '1';
      this.stockage.removeItem(cle);
      return ok;
    } catch {
      return false;
    }
  }

  lireStockage() {
    if (!this.disponible) return [];
    try {
      const texte = this.stockage.getItem(GestionnaireModeles.CLE);
      const objet = texte ? JSON.parse(texte) : {};
      return Object.entries(objet).filter(([, doc]) => {
        try {
          GestionnaireModeles.lire(doc);
          return true;
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  // Écrit les modèles de la session dans le stockage ; false (et un message) si c'est impossible.
  ecrireStockage() {
    if (!this.disponible) {
      this.message = GestionnaireModeles.MESSAGE_SANS_STOCKAGE;
      return false;
    }
    try {
      this.stockage.setItem(GestionnaireModeles.CLE, JSON.stringify(Object.fromEntries(this.memoire)));
      this.message = '';
      return true;
    } catch {
      this.message = GestionnaireModeles.MESSAGE_SANS_STOCKAGE;
      return false;
    }
  }

  nouvelId() {
    let n = 1;
    while (this.memoire.has(`modele-${n}`) || this.integres.has(`modele-${n}`)) n++;
    return `modele-${n}`;
  }

  document(id) {
    return this.integres.get(id) ?? this.memoire.get(id) ?? null;
  }

  // [{ id, nom, date, generations, meilleurFitness, note, integre }] : les intégrés d'abord.
  liste() {
    const ligne = (id, doc, integre) => ({ id, integre, ...GestionnaireModeles.lire(doc).metadonnees });
    return [...[...this.integres].map(([id, doc]) => ligne(id, doc, true)), ...[...this.memoire].map(([id, doc]) => ligne(id, doc, false))];
  }

  // Sauvegarde un réseau : { ok, id, message } (ok : écrit dans le stockage du navigateur).
  sauvegarder(reseau, meta = {}) {
    const id = this.nouvelId();
    this.memoire.set(id, GestionnaireModeles.documentDe(reseau, meta));
    const ok = this.ecrireStockage();
    return { ok, id, message: this.message };
  }

  // { reseau, metadonnees } du modèle `id` ; RangeError s'il n'existe pas.
  charger(id) {
    const doc = this.document(id);
    if (doc === null) throw new RangeError(`Modèle introuvable : ${id}.`);
    return GestionnaireModeles.lire(doc);
  }

  renommer(id, nom) {
    const doc = this.memoire.get(id);
    const propre = String(nom ?? '').trim().slice(0, 60);
    if (!doc || propre === '') return false;
    doc.metadonnees.nom = propre;
    this.ecrireStockage();
    return true;
  }

  supprimer(id) {
    if (!this.memoire.has(id)) return false;
    this.memoire.delete(id);
    this.ecrireStockage();
    return true;
  }

  // Le texte JSON du modèle `id` (à enregistrer dans un fichier).
  exporter(id) {
    const doc = this.document(id);
    if (doc === null) throw new RangeError(`Modèle introuvable : ${id}.`);
    return JSON.stringify(doc, null, 2);
  }

  // Importe un texte JSON : { ok, id, message }. Un document invalide ou incompatible est refusé
  // (ok faux, message clair) sans rien changer.
  importer(texte) {
    let lu;
    try {
      lu = GestionnaireModeles.lire(texte);
    } catch (erreur) {
      return { ok: false, id: null, message: erreur.message };
    }
    const id = this.nouvelId();
    this.memoire.set(id, GestionnaireModeles.documentDe(lu.reseau, lu.metadonnees));
    const ecrit = this.ecrireStockage();
    return { ok: true, id, message: ecrit ? '' : this.message };
  }
}
