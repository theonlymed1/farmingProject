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
{ "data": { "connecte": true, "identifiant": "admin", "nomExploitation": "Ferme Sidi Aidi" } }
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
  "prixPoussins": 32500.5,
  "prixParPoussin": 6.5,
  "effectifActuel": 4995,
  "sante": {
    "males":    { "sains": 2480, "malades": 17, "morts": 3, "vivants": 2497 },
    "femelles": { "sains": 2488, "malades": 10, "morts": 2, "vivants": 2498 },
    "nonSexes": { "sains": 0, "malades": 0, "morts": 0, "vivants": 0 },
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
| `nombrePoussins` | Chicks received. Their sex isn't known at the start (migration 009) |
| `prixPoussins` | Total paid for the chicks, DH (migration 008). `null` for Bandes created before it was asked |
| `prixParPoussin` | `prixPoussins` ÷ `nombrePoussins`, or `null` |
| `effectifActuel` | Birds alive = received − dead (phase 3) |
| `sante` | Healthy, sick, dead, alive for males, females and non-sexed birds; total with received and mortality % |

Validation (400 `VALIDATION`, `details` per field):
`nom` 1–60 characters, unique (case and spaces ignored → 409 `CONFLIT` on `nom`) ·
`dateDebut` real date `YYYY-MM-DD`, 2000–2100 · `dureeMois` integer 1–12, default 4 ·
`nombrePoussins` integer 1–1 000 000 ·
`prixPoussins` required, ≥ 0 DH, 2 decimals, may be sent as `"32 500,50"`.
Editing a Bande is refused (409 `CONFLIT`) if the new numbers or start date no longer fit its health declarations.

### GET /bandes

All Bandes, newest start date first. Response 200: `{ "data": [ Bande, … ] }`. Historique: no.

### POST /bandes

Body: `{ "nom": "…", "dateDebut": "2026-11-14", "dureeMois": 4, "nombrePoussins": 5000, "prixPoussins": 32500.5 }`.
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

Every chick starts **non-sexed and healthy**. Each declaration moves birds between groups, with three
counts: `males`, `femelles`, `nonSexes` (migration 009):

| `type` | Effect |
| --- | --- |
| `sexage` | healthy non-sexed → healthy males (`males`) and healthy females (`femelles`); `nonSexes` is always 0 |
| `maladie` | healthy → sick (each count in its own sex group) |
| `guerison` | sick → healthy |
| `mort` | healthy (`provenance: "sains"`) or sick (`provenance: "malades"`) → dead |

Bandes created before migration 009 with males / females got a `sexage` declaration on their start date
("Sexes saisis à la création de la bande").

The server refuses (409 `CONFLIT`) any declaration, cancellation or Bande edit that would leave,
**on any date**, fewer than 0 healthy or sick males, females or non-sexed birds. Example message:
"Pas assez de mâles malades au 14/11/2026 : il en manquerait 10."

### GET /bandes/:bandeId/volaille

Response 200:

```json
{
  "data": {
    "bande": { "…": "Bande object, with sante" },
    "mouvements": [
      { "id": 4, "type": "mort", "provenance": "malades", "date": "2026-11-14",
        "males": 3, "femelles": 2, "nonSexes": 1, "total": 6, "note": null, "creeLe": "…" }
    ]
  }
}
```

Declarations newest first. Historique: no.

### POST /bandes/:bandeId/volaille

Body: `{ "type": "mort", "provenance": "sains", "date": "2026-11-14", "males": 3, "femelles": 0, "nonSexes": 2, "note": "coup de chaleur" }`
or `{ "type": "sexage", "date": "2026-11-20", "males": 80, "femelles": 90 }`
(`provenance` only for `mort`; `note` optional, 200 characters max).

Response 201: same shape as GET (updated Bande + declarations).
Errors: 400 `VALIDATION` on `type`, `date` (before the Bande's start or in the future),
`males` / `femelles` / `nonSexes` (integers ≥ 0, at least one bird; a sexing needs at least one male or female),
`provenance`, `note`; 409 `CONFLIT` (not enough birds, e.g. "Pas assez d’oiseaux non sexés en bonne santé au …").
Historique: yes — "Déclaration de morts : 3 mâles et 2 non sexés, qui étaient en bonne santé, le 14/11/2026 (coup de chaleur)" /
"Déclaration du sexe : 80 mâles et 90 femelles parmi les oiseaux non sexés en bonne santé, le 20/11/2026".

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
      "total": 18500, "nombre": 3, "sansPrix": 0,
      "prixPoussins": 32500.5, "coutTotal": 51000.5, "coutParPoussin": 10.2,
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

`resume.total` = charges with a price. `resume.coutTotal` = `prixPoussins` (0 if unknown) + `total`.
`resume.coutParPoussin` = `coutTotal` ÷ chicks received.

---

## Phase 6 — Employés

Workers of a Bande. **Since 0.11** advances are declared one by one by the admin (amount + date, any number
per week; see "Avances" below). Before, one advance per full week was counted automatically: migration 012
turned those into real advances (one per full week, on its last day) so no balance changed. The pay rule (`server/modules/employes/calcul.js`, copied in `public/js/employes-calcul.js`):

| Value | Rule |
| --- | --- |
| `joursPeriode` | start date → departure date (or today), both included |
| `joursRepos` | rest days declared inside that period |
| `joursTravailles` | `joursPeriode` − `joursRepos` |
| `nombreAvances` | advances dated up to the end of the period |
| `totalAvances` | sum of their amounts |
| `salaireTotal` | `joursTravailles` × `salaireJournalier` |
| `solde` | `salaireTotal` − `totalAvances` (negative = the worker owes) |
| `cout` | current worker: `totalAvances` · departed: `totalAvances` + max(0, `solde`) |

Example: 30 days at 100 DH/day, 4 advances of 200 DH → 3 000 − 800 = **2 200 DH**.

An employee:

```json
{
  "id": 1, "nom": "Ahmed Alaoui", "age": 34, "cin": "AB123456", "dateDebut": "2026-10-10",
  "salaireJournalier": 110, "dateDepart": "2026-11-08", "actif": false,
  "joursRepos": [ { "date": "2026-10-17", "note": "malade" } ],
  "avances": [ { "id": 5, "date": "2026-10-16", "montant": 200, "note": null, "creeLe": "…" }, "…" ],
  "compte": { "jusquAu": "2026-11-08", "joursPeriode": 30, "joursRepos": 1, "joursTravailles": 29, "nombreAvances": 4,
              "totalAvances": 800, "salaireTotal": 3190, "solde": 2390, "cout": 3190 }
}
```

Validation: `nom` 1–100 · `age` 15–90 · `cin` 1–2 letters + digits (saved without spaces, upper case;
unique among the Bande's current workers → 409) · `dateDebut` (not after his first rest day or advance) ·
`salaireJournalier` required ≥ 0. A departed worker can't be edited or get rest days or advances (409).

Every endpoint returns `{ "data": { "bande", "employes": [ current first, then departed ], "resume" } }` with
`resume = { nombreActifs, nombrePartis, totalAvances, nombreAvances, cout, soldeActifs }`.

| Endpoint | Body | Historique |
| --- | --- | --- |
| `GET /bandes/:bandeId/employes` | — | no |
| `POST /bandes/:bandeId/employes` | employee fields | "Employé ajouté : … (CIN …), début le …, salaire … par jour" |
| `PUT /bandes/:bandeId/employes/:id` | employee fields | "Employé modifié (…) : salaire journalier 100,00 DH → 110,00 DH" |
| `POST /bandes/:bandeId/employes/:id/repos` | `{ "date", "note"? }` (start → today, not twice) | "Jour de repos déclaré pour … : 17/10/2026 (malade)" |
| `DELETE /bandes/:bandeId/employes/:id/repos/:date` | — | "Jour de repos annulé pour … : …" |
| `POST /bandes/:bandeId/employes/:id/avances` | `{ "montant", "date", "note"? }` — montant > 0, date start → today | "Avance de 300,00 DH donnée à … le 18/11/2026 (souk)" |
| `DELETE /bandes/:bandeId/employes/:id/avances/:avanceId` | `{ "motDePasse" }` | "Avance supprimée pour … : 300,00 DH du 18/11/2026" |
| `POST /bandes/:bandeId/employes/:id/depart` | `{ "dateDepart", "motDePasse" }` | "Départ d’Ahmed Alaoui le 08/11/2026 : 29 jours travaillés × 110,00 DH = 3 190,00 DH, avances 800,00 DH, reste à payer 2 390,00 DH" |

`POST …/avances` answers 201 with `avance` = the advance just saved, for its printable receipt (farm, worker,
CIN, Bande, date, amount, remark if any, and the two signatures — no account balance on it). The departure date can't be before an advance.

The departure ("Supprimer" in the menu) keeps the worker in "Anciens employés"; its response also has
`depart` = the departed employee, used for the receipt. The Charges summary now has `resume.employes`
and `coutTotal` = chicks + charges + workers' `cout`.

---

## Phase 7 — Historique

List of every operation written by `journaliser()` since phase 1. Lines can be deleted one by one, or all at
once, with the password.

### GET /historique

Query parameters (all optional):

| Parameter | Meaning |
| --- | --- |
| `bande` | Only this Bande's operations (lines of a deleted Bande keep no `bande` and show in the general view only) |
| `module` | `bandes` · `volaille` · `croissance` · `charges` · `employes` · `parametres` |
| `action` | `creation` · `modification` · `suppression` · `autre` |
| `du`, `au` | `YYYY-MM-DD`, both included (`au` before `du` → 400) |
| `q` | Words that must all appear in the description (case ignored) |
| `limite` | 1–500, default 100 |
| `decalage` | Skip that many lines ("Afficher plus") |

Response 200:

```json
{
  "data": {
    "total": 60, "limite": 100, "decalage": 0,
    "entrees": [
      { "id": 88, "dateHeure": "2026-11-14T19:52:10Z", "bandeId": 1, "bandeNom": "Existante",
        "module": "employes", "action": "modification", "entiteId": 3,
        "description": "Employé modifié (Ahmed Alaoui) : salaire journalier 100,00 DH → 110,00 DH",
        "avant": { "salaireJournalier": 100, "…": "…" }, "apres": { "salaireJournalier": 110, "…": "…" } }
    ]
  }
}
```

Newest first. Errors: 400 `VALIDATION` on bad filters, 404 if `bande` isn't a valid id.

### DELETE /historique/:id

Deletes one line. Body: `{ "motDePasse": "…" }`. Response 200: `{ "data": { "supprimees": 1 } }`.
Errors: 400 `VALIDATION` on `motDePasse`, 404 `INTROUVABLE`. Nothing is written about it.

### POST /historique/effacer

Clears the history of one Bande (`bande` given) or the whole history (no `bande`), whatever the filters on
screen. Body: `{ "motDePasse": "…", "bande": 12 }`. Response 200: `{ "data": { "supprimees": 47 } }`.
One line is then written so a trace remains: "Historique effacé : 47 opérations supprimées"
(module `parametres`) or "Historique de la bande « … » effacé : 13 opérations supprimées" (module `bandes`).

## Phase 7b — Ventes

Birds sold to a customer. Sold birds leave the flock: they are taken from the **healthy** birds of each sex
group, and the flock checks (coherence, day by day) count a sale like a death of healthy birds. The view
`mouvement_troupeau` (migration 011) reads health declarations and sales together.

Every sale gets an invoice number `V<année>-<n°>` (`V2026-0001`, …), numbered per year of the sale date and
**never given twice**, even after the sale or its Bande is deleted (table `compteur_facture`).

The Bande object now also has `sante.*.vendus` and `sante.total.vendus`; `vivants` means still on the farm and
`effectifActuel = recus − morts − vendus`.

### GET /bandes/:bandeId/ventes

```json
{
  "data": {
    "bande": { "id": 12, "…": "…" },
    "ventes": [
      { "id": 3, "numero": "V2026-0003", "date": "2026-11-14", "client": "Ferme Atlas SARL", "typeClient": "societe",
        "males": 300, "femelles": 200, "nonSexes": 0, "oiseaux": 500,
        "poidsTotalKg": 1275.5, "prixTotal": 19132.5,
        "poidsMoyenKg": 2.551, "prixParOiseau": 38.27, "prixParKg": 15,
        "description": "Payé par chèque", "creeLe": "…", "modifieLe": null }
    ],
    "resume": {
      "nombre": 1, "oiseaux": 500, "poidsKg": 1275.5, "total": 19132.5,
      "poidsMoyenKg": 2.551, "prixMoyenKg": 15, "prixMoyenOiseau": 38.27,
      "coutTotal": 21000, "resultat": -1867.5
    }
  }
}
```

`coutTotal` is the Charges `coutTotal` (chicks + charges + workers); `resultat = total − coutTotal`.
Per-bird weight and price are estimations (totals ÷ birds).

### POST /bandes/:bandeId/ventes · PUT /bandes/:bandeId/ventes/:id

Body:

```json
{ "date": "2026-11-14", "client": "Ferme Atlas SARL", "typeClient": "societe",
  "males": 300, "femelles": 200, "nonSexes": 0,
  "poidsTotalKg": "1 275,5 kg", "prixTotal": "19 132,50", "description": "" }
```

- `typeClient`: `particulier` or `societe`. Counts: integers ≥ 0, at least one bird.
- `poidsTotalKg` > 0: number, or text with `kg` (default), `g` or `t`. `prixTotal` ≥ 0, required.
- Date between the Bande start and today. A client already known keeps its first spelling.

Response (201 / 200): the same object as GET plus `"vente": { … }` (the sale just saved, for its invoice).
Errors: 400 `VALIDATION` (fields), 409 `CONFLIT` when there aren't enough healthy birds
("Pas assez de mâles en bonne santé au 14/11/2026 : il en manquerait 12."), 404 `INTROUVABLE`.

### DELETE /bandes/:bandeId/ventes/:id

Body `{ "motDePasse": "…" }`. The birds come back to the flock; the number is not reused.
Response 200: same object as GET.

### GET /ventes/clients

Customers of earlier sales (all Bandes), most frequent first:
`{ "data": [ { "client": "Ferme Atlas SARL", "typeClient": "societe" } ] }`

History (module `ventes`): "Vente n° V2026-0003 à Ferme Atlas SARL (société), le 14/11/2026 — 300 mâles et
200 femelles, 1 275,5 kg, 19 132,50 DH", "Vente n° … modifiée : prix … → …", "Vente supprimée : … (les oiseaux
reviennent dans le troupeau)".

## 0.11 — Ferme, avances, thème sombre

- Migration 012: the farm name becomes "Ferme Sidi Aidi" (only if it was still "Firme Sidi Aidi"); table
  `avance`; column `employe.avance_hebdo` removed (see Phase 6).
- Dark theme: `public/js/theme.js` (classic script in every page's `<head>`, before the CSS) sets
  `<html data-theme="clair|sombre">` from the choice kept in the browser (`localStorage["avicole-theme"]` =
  `clair`, `sombre` or `auto` = like Windows). `base.css` redefines the color variables for
  `[data-theme="sombre"]`, on screen only: printing always uses the light colors.

## 0.12 — Véhicules

Work cars of a Bande and their charges (oil change, tyres, fuel…). Migration 013: tables `vehicule`
(`nom`, `modele`, `matricule` — one plate once per Bande, spaces/dashes/case ignored) and `charge_vehicule`.
The charges of the cars count in the cost of the Bande: the Charges summary has `resume.vehicules =
{ nombre, nombreCharges, total }` and `coutTotal` = chicks + charges + workers + cars (so the sales
`resultat` too).

Every endpoint returns `{ "data": { "bande", "vehicules": [ … ], "resume": { nombre, nombreCharges, total } } }`
with a car:

```json
{ "id": 1, "nom": "Camion", "modele": "Isuzu NPR", "matricule": "12345-A-6", "creeLe": "…",
  "nombreCharges": 1, "totalCharges": 450,
  "charges": [ { "id": 3, "libelle": "Vidange", "date": "2026-11-15", "montant": 450, "description": "huile 15W40", "creeLe": "…" } ] }
```

| Endpoint | Body | Historique (module `vehicules`) |
| --- | --- | --- |
| `GET /bandes/:bandeId/vehicules` | — | no |
| `POST /bandes/:bandeId/vehicules` | `{ "nom", "modele", "matricule" }` (409 if the plate exists) | "Véhicule ajouté : Camion Isuzu NPR (12345-A-6)" |
| `DELETE /bandes/:bandeId/vehicules/:id` | `{ "motDePasse" }` — the car and its charges | "Véhicule supprimé : …, avec 2 charges (1 650,50 DH)" |
| `POST /bandes/:bandeId/vehicules/:id/charges` | `{ "libelle", "date" (not future), "montant" > 0, "description"? }` → 201 + `charge` | "Charge du véhicule … : Vidange, le 15/11/2026 — 450,00 DH" |
| `DELETE /bandes/:bandeId/vehicules/:id/charges/:chargeId` | `{ "motDePasse" }` | "Charge supprimée du véhicule … : …" |

## 0.13 — Construction de la nouvelle ferme

Charges of the new farm being built. **No link with the Bandes**: no `bande_id`, never counted in a Bande's
costs, page `/pages/construction.html` in the bottom menu ("Construction"). Migration 014: table
`charge_construction`. Two kinds, one list:

| Type | Fields | Total |
| --- | --- | --- |
| `grosse` | `nom`, `date`, `quantite` > 0, `montantTotal` > 0, `description`? | entered |
| `petite` | `nom`, `date`, `unite`, `quantite` > 0, `prixUnitaire` > 0, `description`? | `quantite × prixUnitaire`, calculated by the server, rounded to the centime in whole numbers (2,5 × 3,33 = 8,33) |

`date` defaults to today on screen and can't be in the future. Name and unit keep their first spelling.

| Endpoint | Body | Historique (module `construction`, no Bande) |
| --- | --- | --- |
| `GET /construction` | — | no |
| `POST /construction/charges` | see above, with `"type"` → 201 + `charge` | "Construction — petite charge : Ciment, le 17/11/2026 — 12 sac × 72,50 DH = 870,00 DH" |
| `DELETE /construction/charges/:id` | `{ "motDePasse" }` | "Construction — grosse charge supprimée : …" |

Response: `{ "data": { "charges": [ { id, type, date, nom, unite, quantite, prixUnitaire, montantTotal, description, creeLe } ],
"resume": { nombre, total, grosses: { nombre, total }, petites: { nombre, total } } } }`, newest first.

### 0.13.1 — charges générales / spécifiques

On screen `grosse` is now **charge générale** and `petite` **charge spécifique** (the stored `type` values don't
change). Migration 015: the quantity of a general charge is **free text** (`quantiteTexte`, 1–50 characters,
e.g. "30 m³", "1 lot"); `quantite` (number) is only for specific charges. Old general charges were converted
(30.000 → "30", 2.500 → "2,5"). Send the general quantity as text in `quantite`. A charge in the response now
also has `quantiteTexte`. The price field of a specific charge is labelled with its unit ("Prix par sac").

### 0.13.2 — modifier / imprimer une charge de construction

`PUT /construction/charges/:id` — same body as POST; the kind can't change (`type` ignored). Answers like POST
with `charge`. History: "Construction — charge générale modifiée (Béton) : quantité 30kg → 35 m³ ; total … → …".
On screen each charge has a "⋯" menu: Imprimer (one-charge sheet), Modifier, Supprimer (password).
Static files are now served with `Cache-Control: no-cache`, so an update is used without Ctrl+F5.

## 0.14 — Véhicules : vidange et documents

Migration 016: `charge_vehicule.categorie` = `charge` (as before), `vidange`, or one of the 4 documents
`visite`, `vignette`, `assurance`, `carte_grise`; columns `kilometrage`, `intervalle_km` (vidange) and `duree_mois`
(documents). Everything still counts in the cost of the Bande. A document may cost 0 DH.

- `POST /bandes/:bandeId/vehicules/:id/charges` with `"vidange": true` also needs `kilometrage` (current mileage,
  "115 000 km" accepted) and `intervalleKm` (10 000 by default). Next vidange = kilometrage + intervalleKm.
- `POST /bandes/:bandeId/vehicules/:id/documents` `{ "document", "date", "dureeMois" (12 by default, 120 for the
  carte grise), "montant" ≥ 0, "description"? }` → 201 + `charge`. Expiry = date + dureeMois (PostgreSQL month
  arithmetic: 31/01 + 1 month = 28/02). History: "Document du véhicule … : Assurance, le …, valable 1 an (expire le …)".

A car now also has:

```json
"vidange": { "date": "2026-11-18", "kilometrage": 124800, "intervalleKm": 8000, "prochaineKm": 132800 },
"documents": { "visite": { …charge, "dureeMois": 12, "expireLe": "2026-10-14", "joursRestants": -35, "statut": "expire" },
               "vignette": { … }, "assurance": { … }, "carte_grise": null },
"alertes": [ { "document": "visite", "libelle": "Visite technique", "statut": "expire", "expireLe": "…", "joursRestants": -35 } ]
```

`documents` = the latest of each kind (by date); `statut` = `valide`, `bientot` (≤ 30 days left) or `expire`.
Charges carry `categorie`, plus `kilometrage`/`intervalleKm`/`prochaineKm` (vidange) or
`dureeMois`/`expireLe`/`joursRestants`/`statut` (documents).

### 0.14.1 — modifier une charge de véhicule

`PUT /bandes/:bandeId/vehicules/:id/charges/:chargeId` — same body as when it was declared: a charge or vidange
(`"vidange": true/false`, so one can become the other), or a document (`date`, `dureeMois`, `montant`,
`description`; its kind can't change). Answers like POST, with `charge`. History lists the changes
("kilométrage 115 000 km → 116 000 km ; validité 1 an → 6 mois"). On screen every charge has a "⋯" menu
(Modifier / Supprimer) in "Charges des véhicules" and in the car's sheet.

## 0.15 — Sauvegarde et restauration (Paramètres)

A backup file (`.avicole`) holds **all the farm data**: every table except `utilisateur`, `session` and
`schema_migrations` (no password hash leaves the PC). Format: gzip of

- line 1: JSON header `{ format: "plateforme-avicole-sauvegarde", version: 1, application, creeLe, nomExploitation,
  migrations: ["001_init.sql", …], nombres: { "<table>": n }, empreinte }`
- then: JSON object `{ "<table>": [ rows ], … }` — `empreinte` = SHA-256 of this text (a damaged file is refused).

| Endpoint | | |
| --- | --- | --- |
| `GET /sauvegarde` | `{ derniereSauvegarde: ISO \| null, derniereRestauration: { le, sauvegardeDu, application, enregistrements } \| null }` | — |
| `GET /sauvegarde/fichier` | the file (`Content-Disposition: attachment; filename="sauvegarde-ferme-sidi-aidi-2026-11-18-14h32.avicole"`) | history: "Sauvegarde téléchargée : …" |
| `POST /sauvegarde/restaurer` | body = the file (`application/octet-stream`, ≤ 500 MB), password in header `X-Mot-De-Passe` (URI-encoded) → `{ restauration, nombres }` | history: "Données restaurées depuis la sauvegarde du … : N enregistrements" |

Restore = ONE transaction (any error → nothing changes): password → keep the account and sessions (the farmer
stays logged in with his current password) → drop every table and view → recreate them with the migrations the
backup was made with → insert the rows (parents first, `jsonb_populate_recordset`) → reset the id counters →
apply the newer migrations of this version (an old backup is upgraded) → put back the account and sessions.
A backup from a newer version (unknown migrations) is refused with a clear message.

`server/db/migrations.js` now exports `listeMigrations()` and `appliquerFichiers(client, fichiers)` for this.
The "Les bandes" page shows a reminder when no backup was downloaded for 7 days.

## 0.16 — Sauvegardes automatiques + installateur Windows (phase 8)

Automatic backups (`server/modules/sauvegarde/automatique.js`): checked 2 minutes after start, then every hour.
If today's file doesn't exist, `<données>/sauvegardes/sauvegarde-auto-YYYY-MM-DD.avicole` is written (same
format as the manual download). The 30 most recent are kept; other files in the folder are never touched.
If a copy folder is set, the file is copied there too (30 kept there as well). A failed copy (disk unplugged…)
never prevents the local backup; it is recorded and shown in Paramètres and on "Les bandes".
These settings of the PC (`dossier_copie`, `derniere_copie`, `derniere_sauvegarde_auto`) survive a restore.

| Endpoint | |
| --- | --- |
| `GET /sauvegarde` | now also `automatique: { dossierLocal, aGarder, fichiers: [{ nom, jour, taille, modifieLe }], derniereAuto, dossierCopie, derniereCopie: { dossier, le, fichier, ok? , erreur? } }` |
| `POST /sauvegarde/automatiques` | makes one now (and copies it) → 201 `{ fait, automatique }` |
| `GET /sauvegarde/automatiques/:nom` | downloads one (name strictly `sauvegarde-auto-YYYY-MM-DD.avicole`) |
| `POST /sauvegarde/automatiques/:nom/restaurer` | restores one; password in `X-Mot-De-Passe`, like `/restaurer` |
| `PUT /sauvegarde/dossier-copie` | `{ "dossier": "D:\\Sauvegardes ferme" }`: must be absolute and writable (checked by writing a test file), then the latest backup is copied there. `""` = no copy. |

The Windows installer writes the folder chosen during installation in `<données>/dossier-copie.txt`; the server
applies it at start and deletes the file. The initial credentials file is now UTF-8 with BOM and CRLF.
Installer: see `installateur/README.md`.

## 0.17 — Impressions (frontend only, no API change)

- Charges: the "Afficher" filter (prices to enter) is replaced by a "Produit" filter: the products of the chosen
  type (or every product, grouped by type). With a type or product chosen, the list shows its purchases,
  total quantity per unit, total amount and, for one product, the average price per unit. Computed in the page
  from `GET /bandes/:id/charges`.
- New prints: one charge (Charges), one vehicle charge or document (⋯ → Imprimer), the employee fiche
  (Voir les informations → Imprimer la fiche), and any section of any page ("Imprimer" next to its title).
- Lighter paper: no explanation lines under the tiles, no creation dates, compact Bande fiche (2 pages instead of 3).
