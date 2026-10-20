# Performances — mesure APRÈS optimisation

Mesure du 20 octobre 2026. Même outil (`demo/mesurer-perf.mjs`), mêmes conditions que
[perf-avant.md](perf-avant.md) :
- Chrome 155 en fenêtre, GPU activé ;
- fenêtre 1920 × 1080 à `devicePixelRatio` 1,25 ;
- 12 voitures, scénarios **sec** et **pluie** (orage, intensité 0,8) ;
- 30 s par mesure, après une page de préchauffage.

L'ancienne version (`32843c1`) et la nouvelle ont été servies côte à côte et mesurées **en alternance**, en deux tours (avant, après, avant, après). La machine (CPU et GPU Intel sur la même puce) change en effet de fréquence d'une minute à l'autre : une mesure isolée peut varier de 10 img/s. Pendant la mesure, la qualité est fixée (détection automatique coupée). Données brutes : [perf-apres.json](perf-apres.json).

GPU utilisé par Chrome : **Intel UHD Graphics** (inchangé, voir plus bas). Rappel : p5 cale ses images sur 60 img/s. Sur cet écran à 144 Hz, il alterne des images de 13,9 et 20,8 ms. Même sans rien dessiner, la page plafonne à **57 img/s** de moyenne : c'est le maximum mesurable ici.

## Avant / après (1920 × 1080)

Images/s moyennes : les deux tours. Minimum : la pire image des deux tours. Les autres colonnes donnent la moyenne des deux tours.

| Scénario | Qualité | img/s moyen avant | img/s moyen **après** | img/s min avant → après | img/s 1 % avant → après | ms/image avant → après | GPU ms/image avant → après | Canvas avant → après |
|---|---|---|---|---|---|---|---|---|
| sec | Haute | 54,7 / 45,6 | **57,5 / 57,5** | 20,3 → 27,9 | 31,8 → 37,7 | 20,1 → **17,4** | 18,1 → **9,0** | 3840 × 2160 → 1920 × 1080 |
| sec | Moyenne | 54,8 / 46,3 | **57,7 / 57,6** | 21,5 → 30,1 | 31,7 → 38,4 | 19,9 → **17,3** | 18,2 → **8,7** | 3840 × 2160 → 1920 × 1080 |
| sec | Basse | 58,1 / 56,3 | **57,7 / 57,7** | 28,7 → 30,4 | 39,9 → 38,5 | 17,5 → **17,3** | 10,5 → **7,7** | 3840 × 2160 → 1920 × 1080 |
| pluie | Haute | 52,8 / 42,0 | **56,9 / 57,2** | 21,8 → 27,7 | 33,6 → 35,8 | 21,4 → **17,5** | 21,3 → **10,0** | 3840 × 2160 → 1920 × 1080 |
| pluie | Moyenne | 52,1 / 20,7 * | **58,0 / 58,0** | 1,0 * → 39,8 | 18,7 → 46,2 | 33,8 → **17,2** | 21,8 → **6,2** | 3840 × 2160 → 1920 × 1080 |
| pluie | Basse | 57,3 / 57,8 | **57,8 / 57,8** | 33,1 → 39,5 | 39,2 → 46,2 | 17,4 → **17,3** | 11,3 → **5,1** | 3840 × 2160 → 1920 × 1080 |

\* Une seconde entière sans image pendant cette mesure de l'ancienne version (fenêtre de Chrome momentanément ralentie par Windows) ; l'autre tour donne 52,1.

La « pire seconde » (la seconde qui compte le moins d'images) :

| | Avant | Après |
|---|---|---|
| sec, Haute ou Moyenne | 40 à 48 img/s | **56 img/s** |
| pluie, Haute | 35 à 45 img/s | **55 img/s** |

Thread principal par image (sec, Moyenne, après) :

| JS | style et mise en page | peinture | compositeur | GPU |
|---|---|---|---|---|
| 6,7 ms (avant 10,4) | 0,2 ms | 0,4 ms | 1,3 ms | 8,7 ms (avant 21,8, à 100 %) |

Le GPU n'est plus saturé : 36 à 57 % d'occupation, contre 82 à 100 %.

## Fenêtre réelle de la machine (1536 × 750 à 125 %, sec)

Navigateur non maximisé dans l'écran 1920 × 1080 réglé à 125 % : c'est ce que voit l'utilisateur sur GitHub Pages.

| Qualité | img/s moyen | img/s min | img/s 1 % | pire seconde | ms/image | GPU ms/image (occupation) | Canvas |
|---|---|---|---|---|---|---|---|
| Haute, avant | 54,2 | 17,5 | 30,0 | 49 | 18,4 | 17,9 (97 %) | 3072 × 1500 |
| Haute, **après** | **57,9** | 40,3 | 46,3 | **57** | 17,3 | **6,7 (39 %)** | 1920 × 937 (densité 1,25 : netteté de l'écran gardée) |
| Moyenne, avant | 53,9 | 31,2 | 36,6 | 52 | 18,5 | 13,9 (75 %) | 3072 × 1500 |
| Moyenne, **après** | **57,8** | 43,5 | 46,5 | **57** | 17,3 | **6,5 (38 %)** | 1536 × 750 |

## Objectifs

- **Au moins 50 img/s stables en Haute : atteint.** Moyenne 57,5 à 57,9 img/s, et jamais moins de 55 images dans une seconde.
- **60 img/s en Moyenne : atteint au plafond de la machine.** 57,7 à 58,0 img/s de moyenne, la même valeur que la page qui ne dessine rien (57,1). p5 ne peut pas faire mieux sur un écran à 144 Hz. Il reste presque la moitié du GPU en réserve.

## Ce qui a été changé, et le gain de chaque étape

Gains mesurés au sec et sous la pluie, en qualité Moyenne, 15 s par mesure, une étape après l'autre. Les chiffres sont indicatifs, car la machine varie.

| Étape | img/s sec | img/s pluie | GPU ms/image sec · pluie |
|---|---|---|---|
| départ | 45,8 | 42,6 | 21,8 · 23,5 |
| 1. densité de pixels plafonnée | 52,4 | 47,9 | 16,6 · 20,8 |
| 2. plus de `backdrop-filter` ni d'ombres floues | 58,9 | 56,8 | 9,6 · 12,5 |
| 3. calques et planches de sprites | 57,9 | 57,4 | 8,0 · 9,7 |
| 4. particules (compactage sur place, plafonds par qualité) | 57,7 | 57,1 | 8,1 · 10,5 |
| 5 et 6. DOM à 10 Hz, calculs | 57,7 | 58,0 | 8,7 · 6,2 (mesure finale) |

### Détail des étapes

1. **Densité de pixels** (`qualiteRendu.js`, `sketch.js`). Densité = la plus petite de ces valeurs :
   - celle de l'écran ;
   - le plafond de la qualité : 1,5 en Haute, 1 en Moyenne et en Basse ;
   - celle qui garde le canvas sous 1920 × 1080 pixels réels.

   p5 prenait `Math.ceil(1,25) = 2`. Vérifiée à chaque image, appliquée seulement quand elle change.
2. **CSS** (`interfaceF1.css`). Les panneaux `.glass` perdent `backdrop-filter: blur(14px)` et leur ombre de 24 px ; ils gardent un fond `rgba(15, 17, 21, .9)` (au lieu de .85, pour rester lisibles). Sont aussi supprimées :
   - l'ombre floue de la mini-carte, repeinte 30 fois par seconde ;
   - celle du bandeau de neutralisation, aux hachures animées ;
   - l'ombre portée de l'alerte du HUD (l'anneau rouge reste) ;
   - le flou de la fenêtre d'aide.
3. **Dessiné une fois, recopié ensuite.** Le circuit, le décor, la mini-carte et les traces de pneus étaient déjà des calques hors écran. En plus :
   - la **planche de sprites** (`planchesSprites.js`) : les 800 spectateurs, les ~100 mécaniciens et les 48 roues sont tracés une fois par apparence, puis recopiés avec `drawImage` (une texture que le GPU recopie en lot) ;
   - l'herbe autour du monde utilise le motif du décor, sur 4 rectangles hors du monde, au lieu de 94 bandes repeintes sous le décor ;
   - le grain d'écran et la pluie passent en **un seul remplissage par motif**, au lieu de 40 et 50 copies.

   Par image, au sec : `fill` passe de 1 570 à 281, `bezierCurveTo` de 4 769 à 748.
4. **Particules.**
   - Plus de nouveau tableau à chaque pas : les 7 `filter()` deviennent un compactage sur place (`Course.garder`).
   - Le plafond des gerbes suit la qualité (×0,4 en Basse, inchangé ailleurs).
   - En Basse : pluie à moitié des gouttes, pas de calque de traces (la gomme qui change l'adhérence est toujours déposée).
5. **DOM.**
   - HUD et HUD du duel : 10 fois par seconde au lieu de 30. Le classement et la télémétrie l'étaient déjà, et n'écrivaient déjà que si la valeur changeait.
   - Mini-carte : 30 fois par seconde en Haute et Moyenne (ses points bougent), 10 en Basse.
   - La barre des jauges glisse en 100 ms.
6. **Calculs.**
   - Billes de gomme : pré-filtre sur le carré des distances, sans racine pour les voitures lointaines, avec le même `Math.hypot` exact pour les autres.
   - Grille spatiale : boucle sans fermeture.
   - Voisins de chaque voiture : cherchés une fois par pas, au lieu de deux (`decide` et `applyBehaviors`).
7. **Réglage Qualité** (onglet Réglages, section Effets) :
   - menu Haute / Moyenne / Basse ;
   - case « **Qualité automatique** », cochée par défaut : sous 40 img/s pendant 3 s, la qualité baisse d'un cran, sans jamais remonter. Les 5 premières secondes et un onglet caché ne comptent pas. Le changement est annoncé discrètement à droite du classement ;
   - case « **Compteur FPS** ».

## Fidélité

- **Mêmes résultats avec la même graine.** Une course complète a été jouée par la vraie page, 4 scénarios de 3 600 images : sec, pluie, pluie en Haute, pluie en Basse. Les empreintes des positions, vitesses, états et tours, relevées toutes les 300 images, et le nombre de tirages de `random()` sont **identiques** avant et après. Un test permanent (`tests/qualiteRendu.test.mjs`) vérifie qu'un changement de qualité en pleine course ne change pas la course.
- Aucune force remplacée par une écriture de `pos` ou `vel` : les tests d'architecture passent, et `vehicle.js` est inchangé (empreinte vérifiée).
- `node --test tests/*.test.mjs` : **517 tests, 517 réussis**.

## Ce qui reste limité

- **Chrome utilise le GPU intégré Intel, pas la RTX 3080.** C'est un réglage de Windows, pas du jeu. Le jeu ne sature plus le GPU Intel, mais la marge serait bien plus grande sur la RTX.
- Le plafond de 57 à 58 img/s vient de p5 (cible 60 img/s) sur un écran à 144 Hz, pas du travail fait.
- Les images les plus lentes (1 % : environ 38 à 46 img/s) restent marquées par cette alternance 13,9 / 20,8 ms.
- Le JS reste pour moitié dans p5 lui-même : `push`/`pop` relisent les styles du contexte, `fill` construit une couleur à chaque appel.
