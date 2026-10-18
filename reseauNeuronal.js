// Petit réseau de neurones (perceptron à UNE couche cachée) : 8 entrées -> N neurones cachés -> 4
// sorties. Ce n'est pas un Vehicle et il ne bouge rien : il reçoit les capteurs d'une voiture
// (voir capteursVoiture.js) et rend 4 POIDS entre 0 et 1, qui dosent les steering behaviors
// seek, arrive, wander et séparation de la voiture (voir voitureNeuronale.js). Le réseau ne
// conduit pas : il choisit, à chaque image, combien compte chaque comportement.
//
//   couche cachée   h = tanh(Wc · e + bc)        (N valeurs entre -1 et 1)
//   sorties         s = sigmoïde(Ws · h + bs)    (4 valeurs entre 0 et 1)
//
// N est réglable de 10 à 15 (12 par défaut) : 8N + N + 4N + 4 = 13N + 4 poids, soit 160 pour
// N = 12. Les poids sont rangés dans des tableaux typés (Float64Array), ligne par neurone :
// Wc[h * 8 + i] relie l'entrée i au neurone caché h ; Ws[s * N + h] relie le neurone caché h à
// la sortie s.
//
// Aléatoire : uniquement un générateur à graine (mulberry32), jamais Math.random. La même graine
// donne le même réseau, les mêmes mutations, les mêmes croisements.
class ReseauNeuronal {
  static ENTREES = 8;
  static SORTIES = 4;
  static CACHES = 12;
  static CACHES_MIN = 10;
  static CACHES_MAX = 15;
  // Version du format JSON (versJSON / depuisJSON) : un modèle d'une autre version est refusé.
  static VERSION = 1;
  static GRAINE = 1;
  static BORNE_DEPART = 1;

  // Générateur pseudo-aléatoire mulberry32 : rapide, 32 bits, reproductible. Valeurs dans [0, 1[.
  static mulberry32(graine) {
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Tirage gaussien (Box-Muller) à partir d'un générateur uniforme.
  static gaussien(alea) {
    const u = Math.max(1e-12, alea());
    const v = alea();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  static sigmoide(x) {
    return 1 / (1 + Math.exp(-x));
  }

  // Nombre de neurones cachés permis : un entier de CACHES_MIN à CACHES_MAX.
  static validerCaches(caches) {
    if (!Number.isInteger(caches) || caches < ReseauNeuronal.CACHES_MIN || caches > ReseauNeuronal.CACHES_MAX) {
      throw new RangeError(`Le nombre de neurones cachés doit être un entier de ${ReseauNeuronal.CACHES_MIN} à ${ReseauNeuronal.CACHES_MAX}.`);
    }
    return caches;
  }

  // caches = N ; alea = générateur [0, 1[ (par défaut : mulberry32 de la graine GRAINE). Les poids
  // de départ sont tirés uniformément dans [-BORNE_DEPART, BORNE_DEPART] : en neuroévolution, des
  // réseaux de départ très différents (certains saturés, donc mauvais conducteurs) donnent à la
  // sélection de quoi choisir.
  constructor(caches = ReseauNeuronal.CACHES, alea = ReseauNeuronal.mulberry32(ReseauNeuronal.GRAINE)) {
    ReseauNeuronal.validerCaches(caches);
    const E = ReseauNeuronal.ENTREES;
    const S = ReseauNeuronal.SORTIES;
    this.caches = caches;
    this.poidsCaches = new Float64Array(E * caches);
    this.biaisCaches = new Float64Array(caches);
    this.poidsSorties = new Float64Array(S * caches);
    this.biaisSorties = new Float64Array(S);
    const borne = ReseauNeuronal.BORNE_DEPART;
    for (const tableau of [this.poidsCaches, this.biaisCaches, this.poidsSorties, this.biaisSorties]) {
      for (let k = 0; k < tableau.length; k++) tableau[k] = (alea() * 2 - 1) * borne;
    }
    // activations de la dernière passe avant (dessin du réseau en direct)
    this.entrees = new Float64Array(E);
    this.activations = new Float64Array(caches);
    this.sorties = new Float64Array(S).fill(0.5);
  }

  get nombrePoids() {
    return this.poidsCaches.length + this.biaisCaches.length + this.poidsSorties.length + this.biaisSorties.length;
  }

  // Les 4 tableaux de poids, dans un ordre fixe (mutation, croisement, JSON).
  get tableaux() {
    return [this.poidsCaches, this.biaisCaches, this.poidsSorties, this.biaisSorties];
  }

  // Passe avant : 8 entrées (nombres finis) -> 4 sorties entre 0 et 1. Une entrée non finie
  // compte pour 0 (un capteur défaillant ne doit pas rendre le réseau fou).
  passeAvant(entrees) {
    const E = ReseauNeuronal.ENTREES;
    const S = ReseauNeuronal.SORTIES;
    if (!entrees || entrees.length !== E) throw new RangeError(`Le réseau attend ${E} entrées.`);
    for (let i = 0; i < E; i++) this.entrees[i] = Number.isFinite(entrees[i]) ? entrees[i] : 0;
    for (let h = 0; h < this.caches; h++) {
      let somme = this.biaisCaches[h];
      const base = h * E;
      for (let i = 0; i < E; i++) somme += this.poidsCaches[base + i] * this.entrees[i];
      this.activations[h] = Math.tanh(somme);
    }
    for (let s = 0; s < S; s++) {
      let somme = this.biaisSorties[s];
      const base = s * this.caches;
      for (let h = 0; h < this.caches; h++) somme += this.poidsSorties[base + h] * this.activations[h];
      this.sorties[s] = ReseauNeuronal.sigmoide(somme);
    }
    return Array.from(this.sorties);
  }

  // Une copie indépendante (mêmes poids, tableaux distincts).
  cloner() {
    const copie = Object.create(ReseauNeuronal.prototype);
    copie.caches = this.caches;
    copie.poidsCaches = Float64Array.from(this.poidsCaches);
    copie.biaisCaches = Float64Array.from(this.biaisCaches);
    copie.poidsSorties = Float64Array.from(this.poidsSorties);
    copie.biaisSorties = Float64Array.from(this.biaisSorties);
    copie.entrees = new Float64Array(ReseauNeuronal.ENTREES);
    copie.activations = new Float64Array(this.caches);
    copie.sorties = new Float64Array(ReseauNeuronal.SORTIES).fill(0.5);
    return copie;
  }

  // Mutation sur place : chaque poids, avec la probabilité `taux`, reçoit un bruit gaussien
  // d'écart-type `amplitude`. Taux 0 : rien ne change. Renvoie le nombre de poids modifiés.
  muter(taux, amplitude, alea = ReseauNeuronal.mulberry32(ReseauNeuronal.GRAINE)) {
    if (!(taux >= 0 && taux <= 1)) throw new RangeError('Le taux de mutation doit être entre 0 et 1.');
    if (!(amplitude >= 0)) throw new RangeError('L\'amplitude de mutation doit être positive.');
    let modifies = 0;
    if (taux === 0 || amplitude === 0) return 0;
    for (const tableau of this.tableaux) {
      for (let k = 0; k < tableau.length; k++) {
        if (alea() < taux) {
          tableau[k] += ReseauNeuronal.gaussien(alea) * amplitude;
          modifies++;
        }
      }
    }
    return modifies;
  }

  // Croisement : un enfant dont chaque neurone caché (ses 8 poids d'entrée, son biais et ses 4
  // poids de sortie) vient en bloc de l'un ou l'autre parent, tiré à pile ou face ; les biais
  // des sorties, de même. Garder un neurone entier garde ce qu'il a appris (un croisement poids
  // par poids le casserait). Les deux parents doivent avoir le même nombre de neurones cachés.
  croiser(autre, alea = ReseauNeuronal.mulberry32(ReseauNeuronal.GRAINE)) {
    if (!(autre instanceof ReseauNeuronal) || autre.caches !== this.caches) {
      throw new RangeError('Croisement impossible : les deux réseaux doivent avoir la même architecture.');
    }
    const E = ReseauNeuronal.ENTREES;
    const S = ReseauNeuronal.SORTIES;
    const enfant = this.cloner();
    for (let h = 0; h < this.caches; h++) {
      if (alea() < 0.5) continue;
      for (let i = 0; i < E; i++) enfant.poidsCaches[h * E + i] = autre.poidsCaches[h * E + i];
      enfant.biaisCaches[h] = autre.biaisCaches[h];
      for (let s = 0; s < S; s++) enfant.poidsSorties[s * this.caches + h] = autre.poidsSorties[s * this.caches + h];
    }
    for (let s = 0; s < S; s++) if (alea() >= 0.5) enfant.biaisSorties[s] = autre.biaisSorties[s];
    return enfant;
  }

  // Objet JSON : version, architecture, poids (tableaux ordinaires de nombres).
  versJSON() {
    return {
      version: ReseauNeuronal.VERSION,
      architecture: { entrees: ReseauNeuronal.ENTREES, caches: this.caches, sorties: ReseauNeuronal.SORTIES,
        activationCachee: 'tanh', activationSortie: 'sigmoide' },
      poids: {
        caches: Array.from(this.poidsCaches),
        biaisCaches: Array.from(this.biaisCaches),
        sorties: Array.from(this.poidsSorties),
        biaisSorties: Array.from(this.biaisSorties),
      },
    };
  }

  // Le réseau décrit par un objet de versJSON. Version, architecture et tailles sont vérifiées :
  // un modèle incompatible est refusé (RangeError, avec un message clair).
  static depuisJSON(objet) {
    if (!objet || typeof objet !== 'object') throw new RangeError('Modèle illisible : un objet JSON est attendu.');
    if (objet.version !== ReseauNeuronal.VERSION) {
      throw new RangeError(`Modèle incompatible : version ${objet.version ?? 'inconnue'}, version attendue ${ReseauNeuronal.VERSION}.`);
    }
    const a = objet.architecture ?? {};
    if (a.entrees !== ReseauNeuronal.ENTREES || a.sorties !== ReseauNeuronal.SORTIES) {
      throw new RangeError(`Modèle incompatible : ${a.entrees} entrées et ${a.sorties} sorties, ${ReseauNeuronal.ENTREES} et ${ReseauNeuronal.SORTIES} attendues.`);
    }
    const caches = ReseauNeuronal.validerCaches(a.caches);
    const p = objet.poids ?? {};
    const tailles = { caches: ReseauNeuronal.ENTREES * caches, biaisCaches: caches, sorties: ReseauNeuronal.SORTIES * caches,
      biaisSorties: ReseauNeuronal.SORTIES };
    for (const [nom, taille] of Object.entries(tailles)) {
      if (!Array.isArray(p[nom]) || p[nom].length !== taille || !p[nom].every(Number.isFinite)) {
        throw new RangeError(`Modèle incompatible : poids « ${nom} » absents ou de mauvaise taille (${taille} attendus).`);
      }
    }
    const reseau = new ReseauNeuronal(caches, () => 0.5);
    reseau.poidsCaches = Float64Array.from(p.caches);
    reseau.biaisCaches = Float64Array.from(p.biaisCaches);
    reseau.poidsSorties = Float64Array.from(p.sorties);
    reseau.biaisSorties = Float64Array.from(p.biaisSorties);
    return reseau;
  }
}
