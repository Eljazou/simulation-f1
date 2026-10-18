@echo off
rem Lance le jeu Circuit Formule 1 : un serveur local (la police ne se charge pas en file://),
rem puis le navigateur. Fermer cette fenetre arrete le serveur.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080/"
  node serveur.mjs 8080
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080/"
  python -m http.server 8080
  goto :eof
)
echo Node.js ou Python est necessaire pour lancer le serveur local.
pause
