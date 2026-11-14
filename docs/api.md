# API contract — Plateforme avicole

This file is the agreement between the backend (Mohamed) and the frontend (Yazid).
**Any change goes through a pull request approved by the other person.**

## Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `http://localhost:3000/api` |
| Format | JSON in, JSON out (`Content-Type: application/json`) |
| Success | `{ "data": … }` — an object, a list, or `null` |
| Error | HTTP status + `{ "erreur": { "code": "…", "message": "…", "details": … } }`. `message` is French and shown as is |
| Field names | `camelCase` in JSON (`dateDebut`), `snake_case` in the database (`date_debut`) |
| Dates | `"YYYY-MM-DD"` strings. Timestamps: ISO 8601 (`"2026-11-14T13:20:00.000Z"`) |
| Money | Number in MAD with 2 decimals max (`3500.5`). Stored as `NUMERIC(12,2)` |
| URLs | Plural nouns; feature data nested under its Bande: `/bandes/:bandeId/charges` |
| Delete | `DELETE` returns `204` with no body |

### Common error codes

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION` | A field is missing or wrong. `details` = `{ "champ": "message" }` |
| 400 | `JSON_INVALIDE` | Body is not valid JSON |
| 401 | `NON_AUTORISE` | Not logged in (phase 1) |
| 404 | `INTROUVABLE` / `ROUTE_INCONNUE` | Record or route doesn't exist |
| 409 | `CONFLIT` / `DOUBLON` / `REFERENCE` | Business rule or constraint blocks the operation |
| 500 | `ERREUR_INTERNE` | Unexpected error (logged on the server) |

### Endpoint template

Copy this block for every new endpoint:

```
### METHOD /path
Phase N — short description.

Request body:
{ … }

Response 200/201:
{ "data": { … } }

Errors: 400 VALIDATION (champ …), 404 INTROUVABLE, …
Historique: yes/no — description written
```

---

## Phase 0

### GET /sante

Checks that Express and PostgreSQL both answer.

Response 200:

```json
{
  "data": {
    "statut": "ok",
    "application": "0.1.0",
    "base": "PostgreSQL 17.6",
    "nomExploitation": "Exploitation avicole",
    "heure": "2026-11-14T13:20:00.000Z"
  }
}
```

Historique: no.

---

## Phase 1 — Login

One account, created automatically on first start (identifiant `admin`, generated password
printed in the console and saved in `identifiants-initiaux.txt` in the data folder).
The session is an `httpOnly` cookie `avicole_session`. It ends on logout or after
**5 hours without activity**. Every route below `/api` except `/api/auth/*` requires it,
and every page except `/pages/connexion.html` redirects to the login page without it.

### GET /auth/etat

Public. Tells the page whether someone is logged in.

Response 200:

```json
{ "data": { "connecte": true, "identifiant": "admin", "nomExploitation": "Firme Sidi Aidi" } }
```

Historique: no.

### POST /auth/connexion

Public.

Request body:

```json
{ "identifiant": "admin", "motDePasse": "…" }
```

Response 200 (+ `Set-Cookie: avicole_session=…`):

```json
{ "data": { "identifiant": "admin" } }
```

Errors: 400 `VALIDATION` (`identifiant`, `motDePasse` empty), 401 `IDENTIFIANTS_INVALIDES`.
Historique: no.

### POST /auth/deconnexion

Public (works even if the session already expired). Response `204`, cookie cleared.
Historique: no.

### PUT /auth/mot-de-passe

Logged in only.

Request body:

```json
{ "actuel": "…", "nouveau": "…", "confirmation": "…" }
```

Strong password rules: at least 10 characters, one lowercase letter, one uppercase letter,
one digit, one special character; different from the current one.

Response 200:

```json
{ "data": { "message": "Mot de passe modifié." } }
```

Errors: 400 `VALIDATION` with `details` on `actuel` (wrong or empty), `nouveau` (too weak or
same as current), `confirmation` (doesn't match). 401 `NON_AUTORISE`.
Other open sessions are closed.
Historique: yes — "Mot de passe modifié" (module `parametres`).

---

## Phase 2 — Bandes

A Bande object (every endpoint below returns this shape):

```json
{
  "id": 1,
  "nom": "Bande Novembre 2026",
  "dateDebut": "2026-11-14",
  "dureeMois": 4,
  "dateFin": "2027-03-14",
  "nombrePoussins": 5000,
  "effectifActuel": 5000,
  "statut": "en_cours",
  "ageJours": 1,
  "creeLe": "2026-11-14T15:48:00.000Z",
  "modifieLe": null
}
```

| Field | Meaning |
| --- | --- |
| `dateFin` | `dateDebut` + `dureeMois` (31/01 + 1 month = 28/02) |
| `statut` | `a_venir` (not started) · `en_cours` (green) · `terminee` (red: today is after `dateFin`) |
| `ageJours` | Day 1 = `dateDebut` (negative before it starts) |
| `effectifActuel` | = `nombrePoussins` until the "Mortalité et malades" phase |

Validation (400 `VALIDATION`, `details` per field):
`nom` 1–60 characters, unique (case and spaces ignored → 409 `CONFLIT` on `nom`) ·
`dateDebut` real date `YYYY-MM-DD`, 2000–2100 · `dureeMois` integer 1–12, default 4 ·
`nombrePoussins` integer 1–1 000 000.

### GET /bandes

All Bandes, newest start date first. Response 200: `{ "data": [ Bande, … ] }`. Historique: no.

### POST /bandes

Body: `{ "nom": "…", "dateDebut": "2026-11-14", "dureeMois": 4, "nombrePoussins": 5000 }`.
Response 201: `{ "data": Bande }`.
Historique: yes — "Bande « … » créée : 5 000 poussins, début le 14/11/2026, durée 4 mois".

### GET /bandes/:id

Response 200: `{ "data": Bande }`. 404 `INTROUVABLE`. Historique: no.

### PUT /bandes/:id

Same body and validation as POST. Response 200: `{ "data": Bande }`.
Historique: yes, only if something changed — "Bande « … » modifiée : nombre de poussins 5 000 → 5 200".

### DELETE /bandes/:id

Body: `{ "motDePasse": "…" }` (the user's password, required).
Response `204`. Deletes the Bande **and everything recorded in it** (later tables use
`ON DELETE CASCADE`). History lines of the Bande are kept, with `bande_id` cleared.
Errors: 400 `VALIDATION` on `motDePasse` (empty or incorrect), 404 `INTROUVABLE`.
Historique: yes — "Bande « … » supprimée (début le …, … poussins)".
