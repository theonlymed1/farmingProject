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
  "nombreMales": 2500,
  "nombreFemelles": 2500,
  "nombrePoussins": 5000,
  "effectifActuel": 4995,
  "sante": {
    "males":    { "recus": 2500, "sains": 2480, "malades": 17, "morts": 3, "vivants": 2497, "tauxMortalite": 0.12 },
    "femelles": { "recus": 2500, "sains": 2488, "malades": 10, "morts": 2, "vivants": 2498, "tauxMortalite": 0.08 },
    "total":    { "recus": 5000, "sains": 4968, "malades": 27, "morts": 5, "vivants": 4995, "tauxMortalite": 0.1 }
  },
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
| `nombrePoussins` | `nombreMales` + `nombreFemelles` (computed, phase 3) |
| `effectifActuel` | Birds alive = received − dead (phase 3) |
| `sante` | Per sex and total: received, healthy, sick, dead, alive, mortality % (phase 3) |

Validation (400 `VALIDATION`, `details` per field):
`nom` 1–60 characters, unique (case and spaces ignored → 409 `CONFLIT` on `nom`) ·
`dateDebut` real date `YYYY-MM-DD`, 2000–2100 · `dureeMois` integer 1–12, default 4 ·
`nombreMales`, `nombreFemelles` integers ≥ 0, total 1–1 000 000 (phase 3; before: `nombrePoussins`).
Editing a Bande is refused (409 `CONFLIT`) if the new numbers or start date no longer fit its health declarations.

### GET /bandes

All Bandes, newest start date first. Response 200: `{ "data": [ Bande, … ] }`. Historique: no.

### POST /bandes

Body: `{ "nom": "…", "dateDebut": "2026-11-14", "dureeMois": 4, "nombreMales": 2500, "nombreFemelles": 2500 }`.
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

---

## Phase 3 — Mortalité et malades

Each declaration moves birds between groups, separately for males and females:

| `type` | Effect |
| --- | --- |
| `maladie` | healthy → sick |
| `guerison` | sick → healthy |
| `mort` | healthy (`provenance: "sains"`) or sick (`provenance: "malades"`) → dead |

The server refuses (409 `CONFLIT`) any declaration, cancellation or Bande edit that would leave,
**on any date**, fewer than 0 healthy or sick males or females. Example message:
"Pas assez de mâles malades au 14/11/2026 : il en manquerait 10."

### GET /bandes/:bandeId/volaille

Response 200:

```json
{
  "data": {
    "bande": { "…": "Bande object, with sante" },
    "mouvements": [
      { "id": 4, "type": "mort", "provenance": "malades", "date": "2026-11-14",
        "males": 3, "femelles": 2, "total": 5, "note": null, "creeLe": "…" }
    ]
  }
}
```

Declarations newest first. Historique: no.

### POST /bandes/:bandeId/volaille

Body: `{ "type": "mort", "provenance": "sains", "date": "2026-11-14", "males": 3, "femelles": 0, "note": "coup de chaleur" }`
(`provenance` only for `mort`; `note` optional, 200 characters max).

Response 201: same shape as GET (updated Bande + declarations).
Errors: 400 `VALIDATION` on `type`, `date` (before the Bande's start or in the future),
`males` / `femelles` (integers ≥ 0, at least one bird), `provenance`, `note`; 409 `CONFLIT` (not enough birds).
Historique: yes — "Déclaration de morts : 3 mâles, qui étaient en bonne santé, le 14/11/2026 (coup de chaleur)".

### DELETE /bandes/:bandeId/volaille/:id

Cancels a declaration made by mistake. Response `204`.
409 `CONFLIT` if later declarations depend on it (e.g. cancelling a "malades" declaration whose birds were later declared cured).
Historique: yes — "Déclaration de morts annulée : …".

---

## Phase 4 — Croissance et pesées

Each Bande has its own guide: a check frequency (`periodeJours`, 1–60, 7 = weekly).
**All weights in the API are in grams** (0.1 – 99 999.9, one decimal). There is no unit setting
(removed by migration 006): the farmer types `900g`, `1,25 kg` or a plain number (below 20 = kg,
otherwise g) and the screen shows each weight in g below 1 kg, in kg from 1 kg.
Check number `rang` falls `rang × periodeJours` days after the start date. The table covers the
Bande's whole duration (4 months weekly = 17 checks), plus any later check that already has values.

A point:

```json
{
  "rang": 1, "libelle": "Semaine 1", "jourApresArrivee": 7, "date": "2026-10-29",
  "guideMales": 180, "observeMales": 195.5, "guideFemelles": 170, "observeFemelles": 160,
  "ecartMales": { "valeur": 15.5, "pourcent": 8.6, "positif": true },
  "ecartFemelles": { "valeur": -10, "pourcent": -5.9, "positif": false },
  "passe": true, "actuel": true
}
```

`ecart` = observed − guide (null if one is missing). `positif` is true when observed ≥ guide
(light green), false when below (light red). `actuel` marks the latest check whose date has arrived.

### GET /bandes/:bandeId/croissance

Response 200: `{ "data": { "bande": Bande, "config": { "periodeJours": 7 } | null, "points": [ … ] } }`.
`config` is null (and `points` empty) until the guide is configured. Historique: no.

### PUT /bandes/:bandeId/croissance/config

Body: `{ "periodeJours": 7 }`. Response 200: same as GET.
Changing the frequency when values exist
returns 409 `CONFLIT` with `details.confirmationRequise: true`; resend with
`"confirmerEffacement": true` to clear them.
Historique: yes — "Guide de croissance créé : contrôle chaque semaine" /
"Guide de croissance modifié : fréquence chaque semaine → tous les 3 jours (2 contrôles effacés)".

### DELETE /bandes/:bandeId/croissance

Deletes the guide and all its values. Body: `{ "motDePasse": "…" }` (required).
Response 200: same as GET (`config: null`). Errors: 400 `VALIDATION` on `motDePasse`,
404 `INTROUVABLE` if the Bande has no guide.
Historique: yes — "Guide de croissance supprimé (contrôle chaque semaine, 3 contrôles avec des valeurs)".

### PUT /bandes/:bandeId/croissance/valeurs

Body: `{ "points": [ { "rang": 1, "guideMales": 180, "observeMales": 195.5 }, { "rang": 2, "guideMales": null } ] }`.
Only the keys sent are changed; `null` empties a cell. Response 200: same as GET.
Errors: 409 `CONFLIT` if not configured; 400 `VALIDATION` with `details` keyed `"<rang>-<colonne>"`.
Historique: yes, one line per save listing the changes —
"Croissance : Semaine 1 observé mâles vide → 1,25 kg ; …" (first 12, then "et N autres modifications").

---

## Phase 5 — Charges

Purchases and services of a Bande. The price can be entered later (bought on credit): a charge
without `prixTotal` is listed as "Prix à saisir" and doesn't count in the totals until it has one.

A charge:

```json
{
  "id": 3, "date": "2026-11-03", "vendeur": "Alf Sahel", "typeProduit": "Aliment",
  "produit": "Aliment croissance", "quantite": 2.5, "unite": "tonnes", "prixTotal": null,
  "description": "Prix convenu 4 200 DH la tonne, payé fin du mois", "creeLe": "…", "modifieLe": null
}
```

Validation (400 `VALIDATION`, per field): `date` required; `vendeur` (1–80), `typeProduit` (1–60),
`produit` (1–100) required; `quantite` optional, > 0 (3 decimals); `unite` optional (≤ 20, needs a
quantity); `prixTotal` optional, ≥ 0 DH (2 decimals); `description` optional (≤ 500).
Numbers may be sent as `"7 500,50"`. `vendeur`, `typeProduit`, `produit` and `unite` are saved with the
spelling already on file when they match ignoring case ("alf sahel" → "Alf Sahel").

Every response below returns the same shape:

```json
{
  "data": {
    "bande": { "…": "Bande object" },
    "charges": [ "…newest first…" ],
    "resume": {
      "total": 18500, "nombre": 3, "sansPrix": 0, "coutParPoussin": 3.7,
      "parType": [ { "type": "Aliment", "nombre": 2, "total": 18000, "sansPrix": 0 } ]
    }
  }
}
```

| Endpoint | Body | Response | Historique |
| --- | --- | --- | --- |
| `GET /bandes/:bandeId/charges` | — | 200 | no |
| `POST /bandes/:bandeId/charges` | charge fields | 201 | "Charge ajoutée : Aliment démarrage (Aliment) chez Alf Sahel, le 01/11/2026 — 50 sacs — 7 500,00 DH" |
| `PUT /bandes/:bandeId/charges/:id` | charge fields | 200 | "Charge modifiée (…) : prix à saisir → 10 500,00 DH" (only if something changed) |
| `DELETE /bandes/:bandeId/charges/:id` | `{ "motDePasse": "…" }` | 200 | "Charge supprimée : …" |

### GET /charges/suggestions?vendeur=…

Values typed in earlier charges, **all Bandes**, most used first:

```json
{
  "data": {
    "vendeurs": ["Alf Sahel", "Afriquia Gaz"],
    "types": ["Aliment", "Gaz"],
    "produits": [ { "produit": "Aliment démarrage", "typeProduit": "Aliment", "unite": "sacs" } ],
    "unites": ["sacs", "bouteilles"]
  }
}
```

With `vendeur`: `types` lists that seller's types first, `produits` only that seller's products.
