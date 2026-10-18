// Outillage des curseurs : à partir d'une table de plages (bornes, pas, valeur de départ = la
// constante de l'entité concernée, affichage), fabrique(plages) donne valider, formater et
// lierCurseur. Ce module ne connaît que les plages de valeurs : il valide ce qui vient de
// l'interface, puis laisse le jeu appliquer la valeur. Les curseurs du circuit l'utilisent (voir
// reglagesF1.js), ceux de l'entraînement IA aussi (voir pageEntrainement.js).
const Reglages = (() => {
  function fabrique(PLAGES) {
    function plage(cle) {
      if (!Object.hasOwn(PLAGES, cle)) throw new RangeError(`Réglage inconnu : ${cle}.`);
      return PLAGES[cle];
    }

    // Renvoie la valeur sous forme de nombre, ou lève RangeError si elle n'est pas un nombre de la
    // plage (ou pas un entier, pour le nombre de particules).
    function valider(cle, valeur) {
      const { min, max, entier } = plage(cle);
      const nombre = typeof valeur === 'string' && valeur.trim() !== '' ? Number(valeur) : valeur;
      if (typeof nombre !== 'number' || !Number.isFinite(nombre) || nombre < min || nombre > max) {
        throw new RangeError(`${cle} doit être un nombre entre ${min} et ${max}.`);
      }
      if (entier && !Number.isInteger(nombre)) {
        throw new RangeError(`${cle} doit être un nombre entier.`);
      }
      return nombre;
    }

    // Texte affiché à côté du curseur : « 100 px », « 6.0 », « 0.40 »...
    function formater(cle, valeur) {
      const { decimales, unite } = plage(cle);
      return `${valeur.toFixed(decimales)}${unite}`;
    }

    // Relie un curseur de la page à un réglage. Le curseur prend les bornes et la valeur de départ
    // de PLAGES ; `sortie` affiche la valeur courante. A chaque mouvement (événement input), la
    // valeur est validée puis passée à appliquer(valeur). Une valeur invalide est refusée : rien
    // n'est appliqué et le curseur revient à la dernière valeur acceptée.
    function lierCurseur(curseur, sortie, cle, appliquer) {
      const { min, max, pas, initial } = plage(cle);
      curseur.min = String(min);
      curseur.max = String(max);
      curseur.step = String(pas);
      let acceptee = initial;

      const afficher = () => {
        curseur.value = String(acceptee);
        sortie.textContent = formater(cle, acceptee);
      };
      curseur.addEventListener('input', () => {
        try {
          acceptee = valider(cle, curseur.value);
          appliquer(acceptee);
        } catch (erreur) {
          if (!(erreur instanceof RangeError)) throw erreur;
        }
        afficher();
      });
      afficher();
    }

    return { PLAGES, valider, formater, lierCurseur };
  }

  return { fabrique };
})();
