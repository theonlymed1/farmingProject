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
