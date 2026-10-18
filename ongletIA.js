// Onglet « IA » du panneau latéral : les adversaires de la course (classiques ou IA entraînée), le
// modèle actif et sa note de qualité (badge « Prêt pour la course » / « En apprentissage »), le
// nombre de voitures pilotées par le réseau, les 4 poids de la voiture suivie, et un bouton vers
// la page d'entraînement. Ce n'est pas un Vehicle : il lit la course, il ne bouge rien.
class OngletIA {
  static NOMS = { seek: 'S', arrive: 'A', wander: 'W', separation: 'Sép' };

  // actions : entrainement() (ouvre la page d'entraînement).
  constructor(actions = {}) {
    const $ = id => document.getElementById(id);
    this.dom = { adversaires: $('f1-ia-adversaires'), modele: $('f1-ia-modele'), note: $('f1-ia-note'), badge: $('f1-ia-badge'),
      nombre: $('f1-ia-nombre'), poids: $('f1-ia-poids') };
    const bouton = $('f1-ia-entrainement');
    bouton.addEventListener('click', () => { if (actions.entrainement) actions.entrainement(); bouton.blur(); });
  }

  // Ce qu'affiche l'onglet (données pures). seuilPret : la note à partir de laquelle le modèle est prêt.
  static etat(course, suivie = null, seuilPret = Entraineur.SEUIL_PRET) {
    const p = course.parametres;
    const modele = p.modeleIA;
    const ia = course.voitures.filter(v => v instanceof VoitureNeuronale);
    const note = modele && Number.isFinite(modele.note) ? modele.note : null;
    const poids = suivie instanceof VoitureNeuronale && suivie.pilotageNeuronal
      ? VoitureNeuronale.COMPORTEMENTS.map(nom => `${OngletIA.NOMS[nom]} ${suivie.poidsNeuronaux[nom].toFixed(2)}`).join(' · ')
      : suivie instanceof VoitureNeuronale ? 'conduite classique (stand, SC, VSC...)' : '—';
    return {
      adversaires: p.adversaires === 'ia' ? 'IA entraînée' : 'Classiques',
      modele: modele ? modele.nom : 'aucun',
      note: note === null ? '—' : `${note}/100`,
      pret: note !== null && note >= seuilPret,
      nombre: ia.length,
      poids,
    };
  }

  mettreAJour(course, suivie = null) {
    const e = OngletIA.etat(course, suivie);
    const { texte, classe } = DomF1;
    texte(this.dom.adversaires, e.adversaires);
    texte(this.dom.modele, e.modele);
    texte(this.dom.note, e.note);
    texte(this.dom.badge, e.pret ? 'Prêt pour la course' : 'En apprentissage');
    classe(this.dom.badge, 'pret', e.pret);
    classe(this.dom.badge, 'apprentissage', !e.pret);
    texte(this.dom.nombre, e.nombre);
    texte(this.dom.poids, e.poids);
  }
}
