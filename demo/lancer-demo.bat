@echo off
rem Demonstration automatique filmee du jeu Circuit Formule 1 (Playwright), avec voix off.
rem   lancer-demo.bat         tout : installation, voix (edge-tts), enregistrement, montage
rem   lancer-demo.bat voix    voix seule : apres une modification de narration.json, regenere
rem                           l'audio et le montage, sans nouvel enregistrement video
rem Sorties : videos\demo-f1-voix.mp4 (avec voix), videos\demo-f1.mp4 (sans voix), rapport.md.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 ou plus est necessaire : https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  echo Installation de Playwright, ffmpeg-static et ffprobe-static...
  call npm install
  if errorlevel 1 goto erreur
)
rem edge-tts (Python) : installe s'il manque ; sans Python, la voix Windows prend le relais
where edge-tts >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if not errorlevel 1 (
    echo Installation de edge-tts...
    python -m pip install --user --quiet edge-tts
  )
)
if /i "%~1"=="voix" goto voix
call npx playwright install chromium
if errorlevel 1 goto erreur
echo.
echo 1/3 Synthese vocale des repliques (narration.json)...
node voix.mjs --synthese
if errorlevel 1 goto erreur
echo.
echo 2/3 Enregistrement de la demonstration (environ 10 minutes)...
node demo.mjs
echo.
echo 3/3 Montage de la voix off...
node voix.mjs --montage
if errorlevel 1 goto erreur
goto fin
:voix
echo Voix seule : synthese des repliques modifiees et montage sur la video existante...
node voix.mjs
if errorlevel 1 goto erreur
:fin
echo.
echo Video avec voix : %~dp0videos\demo-f1-voix.mp4
echo Rapport         : %~dp0rapport.md
pause
exit /b 0
:erreur
echo Echec : voir les messages ci-dessus.
pause
exit /b 1
