# Performances — mesure AVANT optimisation

Mesure du 20 octobre 2026, version `32843c1` (celle publiée sur GitHub Pages), avec
`demo/mesurer-perf.mjs` (Playwright). Données brutes : [perf-avant.json](perf-avant.json).

## Conditions

| | |
|---|---|
| Navigateur | Google Chrome 155.0.8059.85, en fenêtre (pas headless), GPU activé (pas de `--disable-gpu`) |
| Page | servie par `serveur.mjs` (serveur local), fenêtre 1920 × 1080, `devicePixelRatio` 1,25 (l'écran de la machine est réglé à 125 %) |
| Machine | Intel Core i7-11800H, Intel UHD Graphics + NVIDIA GeForce RTX 3080 Laptop GPU, écran 1920 × 1080 à 144 Hz, secteur, mode d'alimentation « Équilibré » |
| Course | 12 voitures, circuit Classique, spectateur (vue d'ensemble) ; 30 s mesurées après 3 s de course |
| Scénarios | **sec** (réglages de départ) et **pluie** (météo manuelle, intensité 0,8 : orage) ; pour chaque qualité Élevée, Moyenne (celle de départ), Basse |

### GPU utilisé par Chrome (`chrome://gpu`)

- **GPU actif : Intel UHD Graphics** (`GPU0 … [Intel(R) UHD Graphics] … *ACTIVE*`).
- La RTX 3080 (`GPU1`) est détectée mais **non utilisée**.
- `GL_RENDERER` : `ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11-30.0.101.1340)`.
- Canvas : *Hardware accelerated* · Compositing : *Hardware accelerated* · Rasterization : *Hardware accelerated* · WebGL : *Hardware accelerated*.

Le canvas 2D est donc bien accéléré, mais par le GPU intégré Intel.

## Méthode

- **Images/s** : chaque appel de `draw()` (p5) est daté.
  - *moyen* : nombre d'images / durée ;
  - *minimum* : la plus longue image des 30 s ;
  - *1 %* : le 99ᵉ centile des durées d'image ;
  - *pire seconde* : la seconde qui compte le moins d'images.
- **ms par image** : l'intervalle moyen entre deux `draw()`.
- **JS (draw)** : durée de `draw()`, découpée en trois :
  - *simulation* : `scenario.update` ;
  - *canvas* : `scenario.show`, les appels de dessin p5 et 2D ;
  - *interface* : `interfaceF1.mettreAJour`, le DOM.
- **Trace Chrome** (catégories `devtools.timeline`, `toplevel`, `v8`, `gpu`, `cc`, `viz`) : temps occupé, ramené à une image, de chaque thread :
  - le thread principal de la page, dont JS, style et mise en page, peinture ;
  - le compositeur ;
  - le **GPU** (`CrGpuMain` : raster du canvas, composition, flous CSS).

Rappel : p5 1.7 cale ses images sur une cible de 60 images/s. Sur un écran à 144 Hz, il alterne des images de 2 et 3 rafraîchissements (13,9 et 20,8 ms) : **60 images/s est le maximum**.

## Résultats

| Scénario | Qualité | img/s moyen | img/s min | img/s 1 % | ms/image | JS draw (simu · canvas · interface) | GPU ms/image (occupation) | Thread principal |
|---|---|---|---|---|---|---|---|---|
| sec | Élevée | 12,5 * | 1,0 * | 1,0 * | 80,0 * | 7,8 (1,7 · 5,7 · 0,4) | 18,1 (22 %) | 14 % |
| sec | Moyenne | **45,8** | 19,6 | 28,2 | 21,8 | 10,0 (2,5 · 7,0 · 0,5) | 21,8 (**100 %**) | 60 % |
| sec | Basse | 56,3 | 26,3 | 32,9 | 17,8 | 6,3 (1,4 · 4,5 · 0,3) | 13,0 (73 %) | 56 % |
| pluie | Élevée | **40,8** | 23,3 | 26,8 | 24,5 | 12,0 (3,2 · 8,2 · 0,5) | 24,5 (**100 %**) | 64 % |
| pluie | Moyenne | **42,6** | 20,0 | 25,4 | 23,5 | 11,1 (2,8 · 7,8 · 0,5) | 23,5 (**100 %**) | 62 % |
| pluie | Basse | 56,2 | 27,7 | 32,2 | 17,8 | 8,1 (1,9 · 5,7 · 0,4) | 15,9 (89 %) | 69 % |

\* Première page ouverte par le navigateur : Chrome compile les shaders du GPU pendant la mesure. La même mesure, refaite tout de suite après, donne **44,1 et 49,1 img/s** (GPU à 100 %). L'outil ouvre désormais une page de préchauffage avant de mesurer.

Détail du thread principal (sec, Moyenne), par image :

| JS | dont GC | style et mise en page | peinture | compositeur | GPU |
|---|---|---|---|---|---|
| 10,4 ms | 0,2 ms | 0,3 ms | 0,6 ms | 2,2 ms | 21,8 ms |

**Conclusion : le jeu est limité par le GPU**, occupé à 100 % en qualité Moyenne et Élevée. Le JS (10 à 12 ms par image) tiendrait 60 images/s ; le GPU (22 à 25 ms par image) non. Le style, la mise en page et la peinture du DOM sont négligeables.

## Ce qui est dessiné à chaque image (sec, Moyenne)

- **Canvas : 3840 × 2160 pixels** (8,3 Mpx) pour une fenêtre de 1920 × 1080. p5 1.7 prend `pixelDensity = Math.ceil(devicePixelRatio)`, soit 2 sur un écran à 125 % : 4 fois plus de pixels qu'en densité 1.
- Appels au contexte 2D du canvas, par image : 1 570 `fill`, 4 769 `bezierCurveTo` (p5 trace chaque cercle avec 4 courbes de Bézier), 1 761 `beginPath`, 366 `save`/`restore`, 67 `drawImage`.

| Ce qui est dessiné | Par image |
|---|---|
| foule animée | 800 disques |
| mécaniciens | 96, soit 192 ellipses et cercles |
| roues (vectorielles) | 48, soit 192 rectangles dont 96 arrondis |
| herbe autour du monde (`showAbords`) | 94 bandes de la taille du monde, presque toutes cachées sous le décor |
| grain d'écran | 40 tuiles plein écran |
| pluie | 50 tuiles plein écran |

- Particules vivantes : jusqu'à 290 au sec et 510 sous la pluie (fumée, gerbes, billes, poussière, étincelles).
- Page : 410 à 560 écritures DOM par seconde. Ce sont surtout les points de la mini-carte SVG (12 voitures, 30 fois par seconde) et le classement.
- Panneaux de l'interface (barre, classement, mini-carte, panneau, bandeau) : `backdrop-filter: blur(14px)` et ombres floues (`box-shadow` de 24 px), par-dessus un canvas qui change à chaque image.

## Profil JS (10 s, sec, Moyenne)

Temps propre, en part du temps actif :

| Où | Part | Détail |
|---|---|---|
| fonctions natives du canvas | 42 % | `fill` 24 %, `drawImage` 4 %, `save` 3 % |
| p5.min.js | 28 % | `pop()` relit `fillStyle` et `strokeStyle`, `fill()` construit une `p5.Color` et sa chaîne CSS |
| voitureF1.js | 5 % | |
| course.js | 4 % | |
| foule.js | 3,5 % | |
| fumee.js | 2 % | |
| ramasse-miettes | 2,3 % | |
