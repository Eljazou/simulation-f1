# Architecture et conventions

Ce document décrit l'organisation du code de **Circuit Formule 1** et les règles que le projet
respecte. Il complète le `README.md` placé à la racine du dépôt.

## Vue d'ensemble

Le jeu est écrit en JavaScript classique (balises `<script>`, pas de modules) avec p5.js 1.7.0.
L'ordre de chargement des scripts dans `index.html` compte : une classe est chargée avant celles
qui l'utilisent.

Tout ce qui bouge est un `Vehicle` piloté par des *steering behaviors* (Craig Reynolds) : seek,
arrive, wander, séparation, évitement. Le reste (circuit, chronométrage, météo, interface) ne
bouge pas et ne crée aucune force.

## Règle centrale

- `vehicle.js` est fourni et **ne doit jamais être modifié**. Son empreinte SHA-256 est vérifiée
  par les tests (`tests/vehicle.sha256`). Ses limites se contournent dans une sous-classe.
- **Tout objet mobile étend `Vehicle`** et n'est piloté que par des forces : `applyForce`, puis
  `update`. Aucune écriture directe de `pos`, `vel` ou `acc` (vérifié par les tests). Seule
  exception nommée : `VoiturePilote.reapparaitre`.
- Les voitures d'entraînement naissent à la position de départ à chaque génération et ne sont
  jamais déplacées ensuite.
- Le réseau de neurones, les capteurs, l'entraîneur, le gestionnaire de modèles, la page et
  l'onglet d'entraînement ne sont pas des `Vehicle`.

## Une image du jeu

`sketch.js`, fonction `draw` :

1. `dt = min(deltaTime / 1000, 0.1)`.
2. Page d'entraînement ouverte : `pageEntrainement.update(dt)` puis `show()` ; la course attend,
   en pause.
3. Sinon : `scenario.update(dt)`, `scenario.show(debug)`, `interfaceF1.mettreAJour(dt)`.

La course joue des pas fixes de 1/60 s (`Course.avancer`). Un pas :

- `decide()` : perception et changements d'état ;
- `applyBehaviors()` : forces, par `applyForce` ;
- `update(dt)` : locomotion héritée de `Vehicle`.

## Forces d'une voiture (`VoitureF1`)

- **Seek** vers un point d'anticipation sur la ligne de course.
- **Arrive** vers l'apex du prochain virage serré (la vitesse désirée descend à celle du virage),
  vers la grille, le box, ou derrière la voiture de devant.
- **Wander**, hérité de `Vehicle`.
- **Évitement** : séparation, anticipation, urgence juste avant le contact, suivi, contournement.
- `garderSurPiste()` : filet de sécurité.

`maxSpeed` et `maxForce` sont modulés à chaque image : pneus, carburant, profil de virage, DRS,
limiteur, safety car. Avec la glisse réaliste, les forces de pilotage deviennent une demande aux
pneus (cercle d'adhérence) ; les réflexes s'appliquent directement sur l'asphalte et le vibreur.

## Adversaires entraînés (réseau de neurones)

Le réseau ne conduit pas : il **dose**. À chaque image de course :

```
force = w1·seek + w2·arrive + w3·wander + w4·séparation   (limitée à maxForce)
```

- `CapteursVoiture.mesurer` : 8 entrées normalisées — bords gauche, droit et devant (lancers de
  rayon de 300 px sur la géométrie du circuit), courbure à venir, vitesse, voisine la plus proche,
  adhérence, écart à la ligne de course. Les capteurs n'ont aucun accès à l'état de la course.
- `ReseauNeuronal` : 8 → N (10 à 15, 12 par défaut, tanh) → 4 (sigmoïde), soit 13N + 4 poids
  (`Float64Array`). `passeAvant`, `cloner`, `muter`, `croiser` (un neurone caché entier vient d'un
  parent), `versJSON` / `depuisJSON`. Tout l'aléa vient de générateurs à graine (mulberry32).
- `VoitureNeuronale extends VoitureF1` :
  - le réseau ne pilote qu'en course et au départ ; au stand, sous safety car ou VSC, en relance,
    en cas de danger, d'ordre d'équipe, de panne ou d'erreur, la conduite de `VoitureF1` reprend
    la main ;
  - hors trafic, pas de plafond de vitesse en virage : le réseau doit freiner avec arrive ; dans
    le trafic, le plafond du profil revient ;
  - `garderSurPiste` reste actif comme filet (demande aux pneus) ;
  - les réflexes d'évitement restent, y compris la séparation ; celle du réseau s'y ajoute.
- `Entraineur` (neuroévolution) : population de 20 à 100 voitures en parallèle ; élimination
  (hors piste 2 s, immobile 3 s, recul 1 s) ; tournoi, élitisme, croisement, mutation (réduite en
  cas de stagnation), part d'individus aléatoires.
  - **Étape 1** (seul) : curriculum — circuit école (ovale), Classique sec, Technique humide,
    Rapide mouillé, puis circuits aléatoires.
  - **Étape 2** (trafic) : manches de 8 voitures entraînées + 3 classiques, collisions comptées.
  - **Note sur 100** sur 3 circuits de test jamais vus (sec, humide, mouillé) : tours propres
    (50), temps au tour comparé à une `VoitureF1` (30), contacts (20).
- `GestionnaireModeles` : document `{ format: 'f1-modele-ia', version, architecture, poids,
  metadonnees }` ; sauvegarder, lister, renommer, supprimer, exporter, importer (localStorage).

### Résultats mesurés (modèle fourni)

`node entrainer.mjs --generations 40 --population 30` : 273 s ; modèle retenu à la génération 16,
note 93/100 sur les circuits jamais vus (6/6 tours propres, 0 contact en trafic). Meilleurs tours
15,58 / 16,97 / 14,25 s contre 15,60 / 17,88 / 15,43 s pour une `VoitureF1` classique (sec, humide
0,4, mouillé 0,7).

## Structure des fichiers

| Fichiers | Rôle |
|---|---|
| `index.html`, `sketch.js` | Page et câblage p5 : `preload`, `setup`, `draw`, touches, souris |
| `vehicle.js` | `Vehicle` et `Target` : fourni, protégé |
| `scenarios.js` | `Scenarios.formule1(...)` : contrôleur du jeu (ne calcule aucune force) |
| `course.js` | Directeur de course : états, perception partagée, tours, stands, safety car, météo, joueur |
| `circuit.js` | Piste, ligne de course, virages, profil de vitesse, stands, grille |
| `voitureF1.js`, `voiturePilote.js`, `safetyCar.js` | Voitures : pilote automatique, joueur (commandes → forces), safety car |
| `voitureNeuronale.js`, `reseauNeuronal.js`, `capteursVoiture.js` | Adversaires pilotés par le réseau |
| `entraineur.js`, `modelesIA.js` | Neuroévolution ; gestion des modèles |
| `pageEntrainement.js`, `ongletIA.js` | Page d'entraînement ; onglet du panneau latéral |
| `particule.js`, `pointRejouer.js`, `ecranFin.js`, `affectation.js`, `perturbation.js` | Écran REJOUER (points d'encre en arrive), souffle d'un accident |
| `fumee.js`, `etincelle.js`, `gerbeEau.js`, `gerbePoussiere.js`, `debris.js`, `billeGomme.js`, `drone.js`, `commissaire.js`, `mecanicien.js`, `confetti.js` | Autres objets mobiles (effets, dépanneuse, mécaniciens, confettis) |
| `chronometrage.js`, `incidents.js`, `voieDesStands.js`, `equipeDeStand.js`, `meteo.js`, `glisse.js`, `surfaces.js`, `strategie.js`, `pneus.js`, `personnalites.js`, `ordresEquipe.js` | Règles de course |
| `decorCircuit.js`, `spriteVoiture.js`, `livrees.js`, `ambiance.js`, `foule.js`, `effetsVitesse.js`, `tracesPneus.js`, `camera.js` | Rendu et caméra |
| `planchesSprites.js`, `imageAlpha.js` | Petits dessins répétés (foule, mécaniciens, roues) tracés une fois puis recopiés ; opacités et motifs sans copie intermédiaire |
| `qualiteRendu.js`, `compteurImages.js`, `diagnosticPerf.js` | Qualité Haute / Moyenne / Basse (densité de pixels, détection automatique), compteur FPS, diagnostic F9 |
| `interfaceF1.js`, `interfaceF1.css`, `domF1.js`, `barreHaut.js`, `tourClassement.js`, `hudCourse.js`, `panneauLateral.js`, `menuModes.js`, … | Interface HTML (elle lit la course) |
| `reglages.js`, `reglagesF1.js` | Plages et liaison des curseurs |
| `entrainer.mjs`, `serveur.mjs`, `start.bat` | Entraînement sans affichage (Node) ; serveur local ; lanceur Windows |
| `models/` | Modèle fourni (`pilote-defaut.json`, `piloteDefaut.js`) |
| `tests/` | Suites `*.test.mjs`, outils `support.mjs` et `page.mjs` |
| `demo/` | Démonstration automatique filmée (Playwright) et voix off |
| `design/` | Export HTML de la maquette (référence visuelle) |

## Conventions

- JavaScript classique, une classe par fichier, indentation de 2 espaces, noms en français (sauf
  `seek`, `arrive`, `update`… de p5 et de `Vehicle`).
- Aucune bibliothèque externe dans le jeu. `circuit.js` et les identifiants des curseurs existants
  ne changent pas.
- Clavier QWERTY : W A S D et flèches pour conduire, Échap pour la pause.
- Durées en secondes reçues en paramètre ; aucun minuteur ; l'aléa du réseau et de
  l'entraînement vient de générateurs à graine (seul `wander()` de `Vehicle` utilise `random()`).
- Nouveau fichier `.js` : l'ajouter à `index.html` au bon rang (un test vérifie la liste) et à
  `F1` dans `tests/support.mjs` ; une nouvelle classe s'inscrit dans `tests/architecture.test.mjs`.
- Nouveau réglage : une plage (`ReglagesF1.PLAGES` ou `PageEntrainement.PLAGES`), valeur de départ
  égale à la constante de l'entité, curseur actif à l'événement `input`, valeurs hors bornes
  refusées.
- Aucun chemin vers un dossier parent (vérifié par `tests/isolation.test.mjs`).
- Après une modification des capteurs, de `VoitureNeuronale` ou du fitness : relancer
  `node entrainer.mjs`, puis les tests.

## Points d'attention

- `Course.parametresParDefaut()` renvoie un objet partagé avec le panneau ; « Réinitialiser »
  remet les menus à leur valeur de départ.
- La page d'entraînement crée son `Entraineur` à la première ouverture (le circuit école prend
  environ 0,3 s), et chaque nouveau circuit aléatoire aussi (cache de 16 circuits).
- La vitesse réelle de l'entraînement est bornée par un budget de 12 ms par image ; la vitesse
  effective est affichée dans la barre de la page.
- Certains fichiers sont en fins de ligne CRLF : les garder telles quelles.
