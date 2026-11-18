# Windows installer

Builds **one file**, `Installer-Plateforme-Avicole-<version>.exe`, that the farmer double-clicks.
Nothing else to install on his PC: Node.js, PostgreSQL and the application are inside.

## Build it (on your Windows PC, with Internet)

1. Install **Inno Setup 6** once: <https://jrsoftware.org/isdl.php>, or in a terminal:
   `winget install JRSoftware.InnoSetup`
2. In the project folder, run:

   ```
   powershell -ExecutionPolicy Bypass -File installateur\construire.ps1
   ```

   The script downloads Node.js 22 LTS (checked with its official SHA-256) and WinSW (the Windows service
   wrapper) into `installateur\cache\`. It then installs the application's dependencies for Windows
   (`npm ci`, which brings the PostgreSQL binaries for Windows) into `installateur\build\` and compiles
   the installer.
3. Result: `installateur\sortie\Installer-Plateforme-Avicole-<version>.exe` (about 100–150 MB).

`build\`, `cache\` and `sortie\` are git-ignored. The version comes from `package.json`.

## What the installer does

| Step | Where |
| --- | --- |
| Program (Node.js + application + service) | `C:\Program Files\Plateforme avicole` |
| Data (database), daily backups, logs | `C:\ProgramData\PlateformeAvicole\` (`data`, `sauvegardes`, `journaux`) |
| Windows service **Plateforme avicole** | starts with Windows, restarts by itself if it stops |
| Desktop icon **Ferme Sidi Aidi** | waits until the server answers, then opens `http://localhost:3000` |
| Start menu | the same shortcut + "Sauvegardes de la plateforme" (the backups folder) |

- **First install**: a page asks for a folder where each daily backup is also copied, e.g. another disk
  or a OneDrive / Google Drive folder. The installer gives the service the right to write there. The
  login and the **initial password** are then shown in a message. They are also kept in
  `C:\ProgramData\PlateformeAvicole\identifiants-initiaux.txt`, which should be deleted once noted.
- **Update**: run the newer installer. The service is stopped, the program replaced and the data kept.
  The copy folder isn't asked again; it can be changed in Paramètres.
- **Uninstall** (Windows Settings → Apps): removes the program and the service, **keeps the data**.
  Reinstalling brings everything back. To erase everything, delete `C:\ProgramData\PlateformeAvicole`.

The service runs as **NT AUTHORITY\LocalService**, a built-in account without administrator rights,
because PostgreSQL refuses to run as an administrator. That is why the installer grants it write access
to `C:\ProgramData\PlateformeAvicole` and to the chosen copy folder. A copy folder chosen later in
Paramètres must be writable by that account: if it isn't, Paramètres says so. Then either pick that
folder by running the installer again (uninstall first, data is kept), or choose another folder.

**Forgotten password**: double-click `C:\Program Files\Plateforme avicole\nouveau-mot-de-passe.cmd`
(the platform must be running). It prints a new password.

## Test checklist (Windows 10, 64-bit)

Ideally on a PC or a virtual machine without Node.js or PostgreSQL installed.

1. Run the `.exe`. Windows SmartScreen may warn, because the installer isn't signed: click
   *Informations complémentaires → Exécuter quand même*.
2. Choose a copy folder (e.g. `D:\Sauvegardes ferme`), install, and note the password shown.
3. The page opens by itself. Log in with `admin` and that password, then create a bande.
4. Restart the PC **without logging in to Windows for 1 minute**, then click the desktop icon: the
   platform must open (the service started with Windows).
5. After 2–3 minutes, Paramètres → Sauvegarde must show a "Dernière sauvegarde automatique" and a
   successful copy. The copy folder must contain `sauvegarde-auto-<date>.avicole`.
6. Run the same installer again (update): the data must still be there.
7. Uninstall, then reinstall: the data must come back.

If something fails, the logs are in `C:\ProgramData\PlateformeAvicole\journaux\`
(`PlateformeAvicole.out.log`, `PlateformeAvicole.err.log`, `PlateformeAvicole.wrapper.log`).
Send them to me.
