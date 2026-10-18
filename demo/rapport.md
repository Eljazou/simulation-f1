# Rapport de la démonstration automatique

- Date : 2026-10-18 20:11:22
- Résultat : **15/15 étapes OK**
- Vidéo : `videos/demo-f1.mp4` (H.264, 30 images/s ; brut Playwright : `videos/demo-f1-brut.webm`)
- Durée du script : 10.2 min ; fenêtre 1920 × 1080, Chromium sans fenêtre (GPU) ; 61 images/s mesurées en fin de scénario
- ffmpeg : ffmpeg-static
- Erreurs dans la console : **0**

| # | Étape | Résultat | Durée | Vérifications / détail | Capture |
|---|---|---|---|---|---|
| 1 | Chargement du jeu (1920 × 1080, graines fixes) | OK | 1.4 s | circuit classique #2026, 12 voitures, 12 tours, graine p5 2026 |  |
| 2 | Feux de départ et course IA | OK | 30.6 s | 12 voitures en mouvement après le départ |  |
| 3 | Classement et mini-carte | OK | 22.0 s | 12 lignes, mini-carte dessinée, pilote suivi : KAR |  |
| 4 | Mode pilote : touches W A S D simulées et DRS | OK | 24.8 s | voiture LUN choisie au clic ; frappes : W 112, A 68, S 32, D 40, Espace 2 ; HUD 170 km/h ; DRS ouvert (Espace) observé |  |
| 5 | Mode multijoueur local : écran partagé | OK | 60.9 s | J1 SKO et J2 BRE choisis au clic ; 2 HUD visibles (165 / 183 km/h) ; frappes J1 : W 543, A 272, S 211, D 185, Espace 8 ; J2 : ↑ 380, ← 236, ↓ 153, → 137, Entrée 7 ; DRS ouvert : J1 oui, J2 oui ; dépassement entre joueurs : oui (J2 devant J1) |  |
| 6 | Pit stop | OK | 28.7 s | arrêt observé pour KAR ; 10 arrêt(s) comptés |  |
| 7 | Virtual Safety Car (VSC) et panne | OK | 17.5 s | VSC déclaré puis levé ; panne de KAR (état ABANDON, vitesse 0.10) |  |
| 8 | Safety car | OK | 7.6 s | safety car en piste (déjà sortie après la panne : non), drapeau sc, caméra TV |  |
| 9 | Ambiance : jour, nuit et pluie | OK | 24.6 s | obscurité de nuit 0.88 ; météo PLUIE, humidité 0.90 |  |
| 10 | Onglets du panneau latéral | OK | 21.6 s | Télémétrie : 132 élément(s) ; Prédiction : 12 élément(s) ; Historique : 80 élément(s) ; Réglages : 445 élément(s) |  |
| 11 | Page « Entraînement IA » : générations à vitesse maximale | OK | 34.8 s | génération 7, meilleure fitness 296.6, note —, En cours · 20x (effectif 20.1x) · note en calcul ; SVG : réseau 168, fitness 3, poids 5 tracés |  |
| 12 | Sauvegarde du modèle | OK | 10.6 s | message « Modèle « Démo Playwright » sauvegardé. » ; 1 clé(s) dans localStorage |  |
| 13 | Course contre les adversaires « IA entraînée » | OK | 18.0 s | 11 adversaires VoitureNeuronale, modèle « Démo Playwright », 11 badges IA |  |
| 14 | Arrivée et podium | OK | 24.2 s | « VICTOIRE DE KAR », classement final affiché, bouton REJOUER présent |  |
| 15 | Écran REJOUER (défi « Tour rapide ») | OK | 55.2 s | boutons REJOUER / MENU ; bilan : Dernier résultatP8 · SKOMeilleur tour0:15.785Dépassements0 |  |

## Console

Aucune erreur (`console.error` ou exception) pendant tout le scénario.

## Méthode

- Le jeu n'est pas modifié : le script ajoute à la page un calque temporaire (sous-titres, cadre de surlignage, clavier) et pilote le jeu par des clics, des touches, les curseurs et boutons du panneau, et l'API publique du contrôleur (`formule1`) là où un clic à l'écran serait fragile (choix du pilote suivi, caméra).
- Graines fixes : course, météo, incidents et entraînement ont leurs graines (constantes du jeu, graine 1 de l'entraînement) ; `randomSeed` de p5 est fixé pour `wander()`.
- Événements rares déclenchés de façon sûre : usure des pneus et seuil de stand au maximum (pit stop), bouton VSC, bouton Panne, bouton Safety car, météo « manuel » + intensité 0,9 (pluie) ; vitesse d'impact au maximum (150 km/h) pour qu'un contact léger du pilote automatique reste un frôlement.
- Mode pilote : un pilote automatique dans la page envoie des événements clavier W / A / S / D / Espace (avec `key` et `keyCode`, lus par p5) ; il vise la ligne de course et suit le profil de vitesse de la voiture.
- Multijoueur local : le même pilote automatique conduit les deux voitures en même temps, chacune avec ses touches (J1 : W A S D + Espace ; J2 : flèches + Entrée). Le dépassement entre joueurs est mis en scène en ligne droite : celui de devant vise 85 % de sa vitesse, l'autre décale sa trajectoire de 26 px.

<!-- voix-off -->
## Voix off

- Vidéo : `videos/demo-f1-voix.mp4` (6:23.8, piste audio AAC normalisée à -16 LUFS) ; sans voix : `videos/demo-f1.mp4` ; ancienne vidéo : `videos/demo-f1-sans-voix.mp4`
- Voix : edge-tts fr-FR-HenriNeural ; 50 répliques, une par sous-titre affiché ; aucun chevauchement ; aucune réplique accélérée
- Toutes les répliques de narration.json ont été placées.

| # | Réplique | Début | Voix | Affiché | Marge avant la suivante |
|---|---|---|---|---|---|
| 1 | intro | 0:00.0 | 8.81 s | 9.48 s | 0.67 s |
| 2 | grille | 0:09.5 | 9.70 s | 10.44 s | 0.74 s |
| 3 | feux | 0:19.9 | 4.68 s | 5.47 s | 0.79 s |
| 4 | course-ia | 0:25.4 | 6.31 s | 7.52 s | 1.21 s |
| 5 | classement | 0:32.9 | 7.03 s | 7.95 s | 0.92 s |
| 6 | mini-carte | 0:40.9 | 5.09 s | 6.12 s | 1.03 s |
| 7 | suivre-pilote | 0:47.0 | 4.61 s | 5.45 s | 0.84 s |
| 8 | pilote-menu | 0:52.4 | 5.52 s | 6.29 s | 0.77 s |
| 9 | pilote-choix | 0:58.7 | 4.63 s | 5.35 s | 0.72 s |
| 10 | pilote-commandes | 1:04.1 | 9.17 s | 10.10 s | 0.93 s |
| 11 | drs | 1:14.2 | 7.58 s | 8.88 s | 1.30 s |
| 12 | multi-intro | 1:23.0 | 6.74 s | 7.87 s | 1.13 s |
| 13 | multi-carte | 1:30.9 | 5.57 s | 6.36 s | 0.79 s |
| 14 | multi-choix | 1:37.3 | 4.39 s | 5.16 s | 0.77 s |
| 15 | multi-touches | 1:42.4 | 8.18 s | 9.14 s | 0.96 s |
| 16 | multi-hud | 1:51.6 | 5.74 s | 7.65 s | 1.91 s |
| 17 | multi-duel | 1:59.2 | 5.86 s | 13.79 s | 7.93 s |
| 18 | multi-depassement | 2:13.0 | 5.23 s | 5.90 s | 0.67 s |
| 19 | pit-usure | 2:18.9 | 6.82 s | 15.95 s | 9.13 s |
| 20 | pit-entree | 2:34.9 | 7.51 s | 8.37 s | 0.86 s |
| 21 | pit-sortie | 2:43.2 | 3.29 s | 3.96 s | 0.67 s |
| 22 | vsc | 2:47.2 | 5.81 s | 6.60 s | 0.79 s |
| 23 | vsc-fin | 2:53.8 | 3.50 s | 3.93 s | 0.43 s |
| 24 | panne | 2:57.7 | 5.28 s | 6.53 s | 1.25 s |
| 25 | safety-car | 3:04.3 | 6.65 s | 7.98 s | 1.33 s |
| 26 | crepuscule | 3:12.2 | 4.46 s | 5.16 s | 0.69 s |
| 27 | nuit | 3:17.4 | 3.41 s | 5.00 s | 1.59 s |
| 28 | pluie | 3:22.4 | 6.91 s | 7.95 s | 1.03 s |
| 29 | pluie-etat | 3:30.3 | 4.94 s | 6.07 s | 1.12 s |
| 30 | onglet-telemetrie | 3:36.4 | 7.06 s | 8.14 s | 1.08 s |
| 31 | onglet-prediction | 3:44.5 | 4.37 s | 5.23 s | 0.87 s |
| 32 | onglet-historique | 3:49.8 | 3.96 s | 4.44 s | 0.48 s |
| 33 | onglet-reglages | 3:54.2 | 4.99 s | 5.56 s | 0.57 s |
| 34 | ia-page | 3:59.8 | 7.66 s | 8.57 s | 0.91 s |
| 35 | ia-reglages | 4:08.4 | 5.52 s | 6.38 s | 0.86 s |
| 36 | ia-reseau | 4:14.7 | 7.13 s | 7.96 s | 0.83 s |
| 37 | ia-courbes | 4:22.7 | 7.51 s | 8.41 s | 0.90 s |
| 38 | ia-poids | 4:31.1 | 5.26 s | 6.00 s | 0.75 s |
| 39 | sauvegarde | 4:37.1 | 4.18 s | 5.03 s | 0.86 s |
| 40 | retour-course | 4:42.1 | 3.00 s | 3.50 s | 0.50 s |
| 41 | ia-course-menu | 4:45.6 | 5.78 s | 7.28 s | 1.50 s |
| 42 | ia-badges | 4:52.9 | 4.94 s | 8.54 s | 3.59 s |
| 43 | ia-course | 5:01.5 | 5.14 s | 7.48 s | 2.34 s |
| 44 | arrivee | 5:09.0 | 5.11 s | 5.73 s | 0.62 s |
| 45 | podium-arrivee | 5:14.7 | 2.81 s | 3.46 s | 0.65 s |
| 46 | podium | 5:18.1 | 5.71 s | 7.53 s | 1.82 s |
| 47 | rejouer-defi | 5:25.7 | 5.40 s | 6.31 s | 0.91 s |
| 48 | defi | 5:32.0 | 4.78 s | 28.30 s | 23.52 s |
| 49 | rejouer | 6:00.3 | 6.65 s | 7.30 s | 0.65 s |
| 50 | conclusion | 6:07.6 | 10.46 s | 11.74 s | 5.72 s |
<!-- /voix-off -->
