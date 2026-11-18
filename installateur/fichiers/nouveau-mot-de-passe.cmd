@echo off
rem Forgotten password: creates a new password for the account of the installed platform.
rem Right-click > "Exécuter en tant qu'administrateur" is NOT needed. The platform must be running.
chcp 65001 >nul
set NODE_ENV=production
cd /d "%~dp0app"
echo.
echo Nouveau mot de passe pour la Plateforme avicole...
"%~dp0node\node.exe" scripts\mot-de-passe.js
echo.
echo Notez ce mot de passe. Vous pourrez le changer dans Parametres.
pause
