; Installer of the Plateforme avicole (Inno Setup 6, https://jrsoftware.org/isinfo.php).
; Do not compile this file by hand: run installateur\construire.ps1, which prepares build\
; (Node.js, the application with its node_modules, the Windows service) and then compiles it.
;
; What the installer does on the farmer's PC (Windows 10/11, 64-bit):
;   - copies Node.js + the application to C:\Program Files\Plateforme avicole
;   - creates C:\ProgramData\PlateformeAvicole (data, backups, logs) and lets the service write there
;   - optional: a folder where every daily backup is also copied (asked on first install only)
;   - installs and starts the Windows service "Plateforme avicole" (starts with Windows)
;   - desktop icon "Ferme Sidi Aidi" that opens the platform in the browser
;   - first install: shows the login and the initial password
; Update = run a newer installer: the service is stopped, the program replaced, the data kept.
; Uninstall: the program and the service are removed, the DATA IS KEPT in C:\ProgramData\PlateformeAvicole.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define Build "build"
#define Service "PlateformeAvicole"
#define DossierDonnees "{commonappdata}\PlateformeAvicole"
; Careful in [Code]: a line must never START with # (e.g. #13#10), the preprocessor would read it as a directive.

[Setup]
AppId={{6F3B2C1A-8E4D-4B7A-9D2E-5C1F0A7B3E91}
AppName=Plateforme avicole
AppVersion={#AppVersion}
AppVerName=Plateforme avicole {#AppVersion}
AppPublisher=Ferme Sidi Aidi
DefaultDirName={autopf}\Plateforme avicole
DisableDirPage=yes
DisableProgramGroupPage=yes
DefaultGroupName=Plateforme avicole
OutputDir=sortie
OutputBaseFilename=Installer-Plateforme-Avicole-{#AppVersion}
SetupIconFile=icone.ico
UninstallDisplayIcon={app}\icone.ico
UninstallDisplayName=Plateforme avicole
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
WizardStyle=modern
CloseApplications=no
RestartApplications=no

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[Messages]
fr.WelcomeLabel2=Cet assistant va installer la Plateforme avicole sur cet ordinateur.%n%nTout est inclus : rien d'autre à installer. Les données restent sur ce PC, aucune connexion Internet n'est nécessaire.%n%nSi la plateforme est déjà installée, elle sera mise à jour et les données seront conservées.

[InstallDelete]
; On update: the old program files are removed first (never the data, which is in ProgramData).
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\node"

[Dirs]
; The data stays when the program is uninstalled (reinstall = everything comes back).
Name: "{#DossierDonnees}"; Flags: uninsneveruninstall
Name: "{#DossierDonnees}\sauvegardes"; Flags: uninsneveruninstall

[Files]
Source: "{#Build}\node\*"; DestDir: "{app}\node"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#Build}\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#Build}\service\*"; DestDir: "{app}\service"; Flags: ignoreversion
Source: "fichiers\ouvrir-plateforme.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Build}\nouveau-mot-de-passe.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "icone.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\Ferme Sidi Aidi"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\ouvrir-plateforme.vbs"""; IconFilename: "{app}\icone.ico"; Comment: "Ouvrir la plateforme avicole"
Name: "{autoprograms}\Plateforme avicole"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\ouvrir-plateforme.vbs"""; IconFilename: "{app}\icone.ico"; Comment: "Ouvrir la plateforme avicole"
Name: "{autoprograms}\Sauvegardes de la plateforme"; Filename: "{#DossierDonnees}\sauvegardes"; Comment: "Dossier des sauvegardes automatiques"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\ouvrir-plateforme.vbs"""; Description: "Ouvrir la plateforme maintenant"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""$s = Get-Service {#Service} -ErrorAction SilentlyContinue; if ($s) {{ Stop-Service {#Service} -Force -ErrorAction SilentlyContinue; $s.WaitForStatus('Stopped', '00:01:30') }"""; Flags: runhidden waituntilterminated; RunOnceId: "ArretService"
Filename: "{app}\service\{#Service}.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "SuppressionService"

[Code]
var
  PageChoixCopie: TInputOptionWizardPage;
  PageDossierCopie: TInputDirWizardPage;
  MiseAJour: Boolean;
  IdentifiantsInitiaux: String;
  ServicePret: Boolean;

function PowerShell(const Commande: String): Integer;
var
  Code: Integer;
begin
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -Command "' + Commande + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) then
    Code := -1;
  Result := Code;
end;

function ServiceExiste(): Boolean;
begin
  Result := PowerShell('if (Get-Service {#Service} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }') = 0;
end;

{ Gives the service account (LocalService, SID S-1-5-19, same name in every language) the right to
  write in a folder and everything inside it. }
procedure AutoriserService(const Dossier: String);
var
  Code: Integer;
begin
  ForceDirectories(Dossier);
  Exec(ExpandConstant('{sys}\icacls.exe'), '"' + Dossier + '" /grant *S-1-5-19:(OI)(CI)M /T /C /Q', '',
    SW_HIDE, ewWaitUntilTerminated, Code);
end;

procedure InitializeWizard();
begin
  MiseAJour := ServiceExiste();

  PageChoixCopie := CreateInputOptionPage(wpWelcome,
    'Sauvegardes automatiques',
    'Chaque jour, la plateforme enregistre une sauvegarde de toutes les données sur ce PC.',
    'Pour être protégé si ce PC tombe en panne, chaque sauvegarde peut aussi être copiée dans un autre dossier : ' +
    'un autre disque (D:, E:…) ou un dossier OneDrive / Google Drive. Vous pourrez le changer plus tard dans Paramètres.',
    True, False);
  PageChoixCopie.Add('Copier aussi chaque sauvegarde dans un autre dossier (recommandé)');
  PageChoixCopie.Add('Pas pour le moment');
  PageChoixCopie.SelectedValueIndex := 0;

  PageDossierCopie := CreateInputDirPage(PageChoixCopie.ID,
    'Dossier de copie des sauvegardes',
    'Où copier les sauvegardes ?',
    'Choisissez un dossier sur un autre disque, ou dans OneDrive / Google Drive. Les 30 dernières sauvegardes y seront gardées.',
    False, 'Sauvegardes ferme');
  PageDossierCopie.Add('');
  if DirExists('D:\') then
    PageDossierCopie.Values[0] := 'D:\Sauvegardes ferme'
  else
    PageDossierCopie.Values[0] := ExpandConstant('{userdocs}\Sauvegardes ferme');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  { On update the copy folder is not asked again: it is changed in Paramètres. }
  if (PageID = PageChoixCopie.ID) and MiseAJour then Result := True;
  if (PageID = PageDossierCopie.ID) and (MiseAJour or (PageChoixCopie.SelectedValueIndex <> 0)) then Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PageDossierCopie.ID) and (Trim(PageDossierCopie.Values[0]) = '') then begin
    MsgBox('Choisissez un dossier, ou revenez en arrière et choisissez « Pas pour le moment ».', mbError, MB_OK);
    Result := False;
  end;
end;

{ Before copying the files: stop and remove the service of the previous version (update). }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if ServiceExiste() then begin
    WizardForm.PreparingLabel.Caption := 'Arrêt de la plateforme en cours…';
    PowerShell('Stop-Service {#Service} -Force -ErrorAction SilentlyContinue; ' +
      '(Get-Service {#Service}).WaitForStatus(''Stopped'', ''00:01:30'')');
    PowerShell('sc.exe delete {#Service} | Out-Null; $n = 0; ' +
      'while ((Get-Service {#Service} -ErrorAction SilentlyContinue) -and $n -lt 30) { Start-Sleep 1; $n++ }');
  end;
  { Safety: a database process of this program still running would lock its files. }
  PowerShell('Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ''' +
    ExpandConstant('{app}') + '*'' } | Stop-Process -Force');
  if ServiceExiste() then
    Result := 'L''ancienne version de la plateforme n''a pas pu être arrêtée. Redémarrez l''ordinateur puis relancez cette installation.';
end;

function AttendreServeur(Secondes: Integer): Boolean;
var
  Http: Variant;
  i: Integer;
begin
  Result := False;
  for i := 1 to Secondes div 2 do begin
    try
      Http := CreateOleObject('WinHttp.WinHttpRequest.5.1');
      Http.SetTimeouts(1000, 1000, 2000, 2000);
      Http.Open('GET', 'http://127.0.0.1:3000/pages/connexion.html', False);
      Http.Send('');
      if Http.Status = 200 then begin
        Result := True;
        Exit;
      end;
    except
    end;
    Sleep(2000);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code, i: Integer;
  Dossier, Fichier: String;
  Lignes, Choix: TArrayOfString;
begin
  if CurStep <> ssPostInstall then Exit;

  { 1. Data folder, writable by the service. }
  AutoriserService(ExpandConstant('{#DossierDonnees}'));
  { embedded-postgres sets the permissions of postgres.exe and initdb.exe at every start (fs.chmod):
    without this, Windows refuses (EPERM) because Program Files is read-only for the service. }
  AutoriserService(ExpandConstant('{app}\app\node_modules\@embedded-postgres\windows-x64\native\bin'));

  { 2. Copy folder chosen (first install only): the service may write there, the server reads it at start. }
  if (not MiseAJour) and (PageChoixCopie.SelectedValueIndex = 0) then begin
    Dossier := Trim(PageDossierCopie.Values[0]);
    AutoriserService(Dossier);
    SetArrayLength(Choix, 1);
    Choix[0] := Dossier;
    SaveStringsToUTF8File(ExpandConstant('{#DossierDonnees}\dossier-copie.txt'), Choix, False);
  end;

  { 3. The Windows service: install, start. }
  WizardForm.StatusLabel.Caption := 'Démarrage de la plateforme (la première fois, cela peut prendre une minute)…';
  Exec(ExpandConstant('{app}\service\{#Service}.exe'), 'install', '', SW_HIDE, ewWaitUntilTerminated, Code);
  { Normal automatic start (not delayed): starts as soon as Windows boots. }
  Exec(ExpandConstant('{sys}\sc.exe'), 'config {#Service} start= auto', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Exec(ExpandConstant('{app}\service\{#Service}.exe'), 'start', '', SW_HIDE, ewWaitUntilTerminated, Code);
  ServicePret := AttendreServeur(120);

  { 4. First install: the server created the account and wrote the initial password. }
  Fichier := ExpandConstant('{#DossierDonnees}\identifiants-initiaux.txt');
  if (not MiseAJour) and FileExists(Fichier) and LoadStringsFromFile(Fichier, Lignes) then
    for i := 0 to GetArrayLength(Lignes) - 1 do
      if (Pos('Identifiant :', Lignes[i]) = 1) or (Pos('Mot de passe :', Lignes[i]) = 1) then
        IdentifiantsInitiaux := IdentifiantsInitiaux + Lignes[i] + #13#10;
end;

procedure CurPageChanged(CurPageID: Integer);
var
  Texte: String;
begin
  if CurPageID <> wpFinished then Exit;
  if MiseAJour then
    Texte := 'La plateforme a été mise à jour. Toutes les données ont été conservées.'
  else
    Texte := 'La plateforme est installée. Elle démarre toute seule avec Windows.' + #13#10 +
      'Pour l''ouvrir : icône « Ferme Sidi Aidi » sur le bureau.';
  if not ServicePret then
    Texte := Texte + #13#10#13#10 + 'Attention : la plateforme ne répond pas encore. Redémarrez l''ordinateur. ' +
      'Si elle ne s''ouvre toujours pas, les journaux sont dans C:\ProgramData\PlateformeAvicole\journaux.';
  WizardForm.FinishedLabel.Caption := Texte;
  if IdentifiantsInitiaux <> '' then
    MsgBox('NOTEZ CES IDENTIFIANTS (ils sont demandés pour se connecter) :' + #13#10#13#10 +
      IdentifiantsInitiaux + #13#10#13#10 + 'Ils sont aussi dans le fichier C:\ProgramData\PlateformeAvicole\identifiants-initiaux.txt : ' +
      'supprimez ce fichier après les avoir notés. Le mot de passe peut être changé dans Paramètres.',
      mbInformation, MB_OK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    MsgBox('La plateforme a été désinstallée.' + #13#10#13#10 +
      'Les DONNÉES et les sauvegardes sont conservées dans C:\ProgramData\PlateformeAvicole : ' +
      'en réinstallant la plateforme, tout revient. Pour tout effacer, supprimez ce dossier.',
      mbInformation, MB_OK);
end;
