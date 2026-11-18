' Desktop icon "Ferme Sidi Aidi": opens the platform in the browser.
' The service starts with Windows; right after the PC turns on it may need a few seconds,
' so this waits (up to 90 s) until the server answers, then opens the page.
Option Explicit
Dim http, shell, essai, pret
Set shell = CreateObject("WScript.Shell")
pret = False
For essai = 1 To 45
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 2000, 2000
  http.Open "GET", "http://127.0.0.1:3000/pages/connexion.html", False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then pret = True
  End If
  Err.Clear
  On Error GoTo 0
  If pret Then Exit For
  WScript.Sleep 2000
Next

If pret Then
  shell.Run "http://localhost:3000/", 1, False
Else
  MsgBox "La plateforme ne répond pas encore." & vbCrLf & vbCrLf & _
    "Si l'ordinateur vient de démarrer, attendez une minute puis cliquez de nouveau sur l'icône." & vbCrLf & _
    "Sinon, redémarrez l'ordinateur. Si le problème continue, les journaux sont dans :" & vbCrLf & _
    "C:\ProgramData\PlateformeAvicole\journaux", vbExclamation, "Plateforme avicole"
End If
