' Desktop icon "Ferme Sidi Aidi": opens the platform in the browser.
' The service starts with Windows; right after the PC turns on it may need a little time,
' so this waits (up to 3 minutes) until the server answers, then opens the page.
' If it isn't ready after a few seconds, a message says it is starting (it closes by itself).
Option Explicit
Dim shell, essai, pret, prevenu

Function Repond()
  Dim http
  Repond = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 2000, 2000
  http.Open "GET", "http://127.0.0.1:3000/pages/connexion.html", False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then Repond = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

Set shell = CreateObject("WScript.Shell")
pret = False
prevenu = False
For essai = 1 To 90
  If Repond() Then
    pret = True
    Exit For
  End If
  If essai = 3 And Not prevenu Then
    prevenu = True
    shell.Popup "La plateforme démarre, patientez un instant..." & vbCrLf & vbCrLf & _
      "Elle s'ouvrira toute seule dans le navigateur dès qu'elle sera prête" & vbCrLf & _
      "(jusqu'à 2 ou 3 minutes juste après avoir allumé l'ordinateur).", 8, "Ferme Sidi Aidi", 64
  End If
  WScript.Sleep 2000
Next

If pret Then
  shell.Run "http://localhost:3000/", 1, False
Else
  MsgBox "La plateforme ne répond pas." & vbCrLf & vbCrLf & _
    "Redémarrez l'ordinateur, attendez 2 minutes, puis cliquez de nouveau sur l'icône." & vbCrLf & _
    "Si le problème continue, les journaux sont dans :" & vbCrLf & _
    "C:\ProgramData\PlateformeAvicole\journaux", vbExclamation, "Plateforme avicole"
End If
