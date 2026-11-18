# Builds the Windows installer of the Plateforme avicole.
# Run on a Windows 10/11 64-bit PC with Internet, from the project folder:
#
#   powershell -ExecutionPolicy Bypass -File installateur\construire.ps1
#
# Result: installateur\sortie\Installer-Plateforme-Avicole-<version>.exe (give this single file to the farmer).
#
# Needs Inno Setup 6 (free): https://jrsoftware.org/isdl.php  or  winget install JRSoftware.InnoSetup
# Downloads (kept in installateur\cache for the next builds):
#   - Node.js 22 LTS for Windows x64 (checked against its official SHA-256)
#   - WinSW 2.12.0 (turns the server into a Windows service)
# then installs the application's dependencies for Windows (npm ci, with the PostgreSQL binaries for Windows).
param(
  [switch]$SansCompiler   # prepare build\ only, without compiling the .exe
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is much faster without the progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ici = $PSScriptRoot
$racine = Split-Path $ici -Parent
$build = Join-Path $ici 'build'
$cache = Join-Path $ici 'cache'
$version = (Get-Content (Join-Path $racine 'package.json') -Raw | ConvertFrom-Json).version

function Etape($texte) { Write-Host ''; Write-Host "== $texte" -ForegroundColor Cyan }
function Telecharger($url, $fichier) {
  if (Test-Path $fichier) { Write-Host "   déjà téléchargé : $(Split-Path $fichier -Leaf)"; return }
  Write-Host "   téléchargement : $url"
  Invoke-WebRequest -Uri $url -OutFile "$fichier.part" -UseBasicParsing
  Move-Item "$fichier.part" $fichier
}

Write-Host "Plateforme avicole $version — construction de l'installateur" -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $cache | Out-Null
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$build\node", "$build\app", "$build\service" | Out-Null

# --- 1. Node.js (latest 22.x LTS) -------------------------------------------------------------
Etape 'Node.js'
$versions = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -UseBasicParsing
$node = $versions | Where-Object { $_.version -like 'v22.*' -and $_.lts } | Select-Object -First 1
if (-not $node) { throw 'Impossible de trouver Node.js 22 LTS sur nodejs.org.' }
$nomNode = "node-$($node.version)-win-x64"
$zipNode = Join-Path $cache "$nomNode.zip"
Telecharger "https://nodejs.org/dist/$($node.version)/$nomNode.zip" $zipNode
$sommes = (Invoke-WebRequest "https://nodejs.org/dist/$($node.version)/SHASUMS256.txt" -UseBasicParsing).Content
$attendu = (($sommes -split "`n") | Where-Object { $_ -match "  $nomNode\.zip$" }) -replace '\s.*$', ''
$obtenu = (Get-FileHash $zipNode -Algorithm SHA256).Hash.ToLower()
if (-not $attendu -or $attendu.Trim().ToLower() -ne $obtenu) {
  Remove-Item $zipNode
  throw "Le fichier Node.js téléchargé est abîmé (SHA-256 différent). Relancez le script."
}
Write-Host "   $($node.version) vérifié (SHA-256)"
$tmp = Join-Path $cache 'node-extrait'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zipNode $tmp
Copy-Item "$tmp\$nomNode\*" "$build\node" -Recurse
Remove-Item $tmp -Recurse -Force

# --- 2. WinSW (Windows service) -----------------------------------------------------------------
Etape 'Service Windows (WinSW)'
$winsw = Join-Path $cache 'WinSW-x64-2.12.0.exe'
Telecharger 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' $winsw
Copy-Item $winsw "$build\service\PlateformeAvicole.exe"
Copy-Item "$ici\fichiers\PlateformeAvicole.xml" "$build\service\PlateformeAvicole.xml"

# --- 3. The application and its dependencies for Windows ---------------------------------------
Etape 'Application'
foreach ($d in 'server', 'public', 'scripts') { Copy-Item (Join-Path $racine $d) "$build\app\$d" -Recurse }
foreach ($f in 'package.json', 'package-lock.json') { Copy-Item (Join-Path $racine $f) "$build\app\$f" }
Copy-Item "$ici\fichiers\nouveau-mot-de-passe.cmd" "$build\nouveau-mot-de-passe.cmd"
Push-Location "$build\app"
try {
  $env:Path = "$build\node;$env:Path"      # npm and its install scripts use THIS Node.js
  & "$build\node\npm.cmd" ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm ci a échoué (voir les messages ci-dessus).' }
} finally { Pop-Location }
$pgWindows = "$build\app\node_modules\@embedded-postgres\windows-x64"
if (-not (Test-Path $pgWindows)) { throw "PostgreSQL pour Windows manque ($pgWindows)." }
$pgExe = Get-ChildItem $pgWindows -Recurse -Filter 'postgres.exe' | Select-Object -First 1
if (-not $pgExe) { throw 'postgres.exe introuvable dans les dépendances.' }
Write-Host "   PostgreSQL pour Windows : $($pgExe.FullName.Substring($build.Length))"

# Quick check: the server code loads with this Node.js (syntax, imports).
& "$build\node\node.exe" --check "$build\app\server\index.js"
if ($LASTEXITCODE -ne 0) { throw 'Le serveur ne se charge pas.' }

if ($SansCompiler) { Write-Host ''; Write-Host "Prêt dans $build (sans compiler)." -ForegroundColor Green; exit 0 }

# --- 4. Inno Setup → the .exe ----------------------------------------------------------------------
Etape 'Installateur (Inno Setup)'
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
  throw "Inno Setup 6 n'est pas installé. Installez-le (https://jrsoftware.org/isdl.php ou : winget install JRSoftware.InnoSetup) puis relancez."
}
& $iscc "/DAppVersion=$version" "$ici\plateforme-avicole.iss"
if ($LASTEXITCODE -ne 0) { throw 'La compilation Inno Setup a échoué.' }

$exe = Join-Path $ici "sortie\Installer-Plateforme-Avicole-$version.exe"
Write-Host ''
Write-Host "Installateur prêt : $exe ($([math]::Round((Get-Item $exe).Length / 1MB)) Mo)" -ForegroundColor Green
