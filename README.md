# Plateforme avicole

Offline, single-user web platform for managing a poultry farm (Bandes, poussins, charges,
employés, croissance, historique). Node.js + Express + embedded PostgreSQL + vanilla HTML/CSS/JS.
The interface is entirely in French.

## Getting started (developers)

Requirements: **Node.js 20 or later** and Git. You do **not** install PostgreSQL: it comes
with the `embedded-postgres` package and starts by itself.

```bash
npm install        # also downloads the PostgreSQL binaries for your OS
npm run dev        # starts PostgreSQL + the server, restarts the server when server/ changes
```

Open <http://localhost:3000>. The dashboard should show **Statut : ok** and the PostgreSQL version.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development: server restarts on every change in `server/` |
| `npm start` | Runs once, like on the farmer's PC |
| `npm run db:stop` | Stops a PostgreSQL left running (e.g. after closing the terminal) |

Database files live in `.donnees/` (git-ignored). To start from an empty database:
stop everything (`npm run db:stop`), delete `.donnees/`, run `npm run dev` again.

### Frontend without the backend

Open any page with `?mode=mock`, e.g. <http://localhost:3000/pages/tableau-de-bord.html?mode=mock>.
Answers then come from `public/js/mock/`. An orange **MODE SIMULATION** badge shows in the top bar.
`?mode=reel` switches back. The choice is remembered in your browser.

## Who owns what

| Folder | Owner | Rule |
| --- | --- | --- |
| `server/`, `scripts/`, `installer/` | Mohamed | Yazid doesn't edit |
| `public/` | Yazid | Mohamed doesn't edit |
| `docs/api.md` | Both | Change by pull request, approved by the other |

## Git workflow

- `main` always runs. No direct pushes.
- One branch per task: `back/bandes-api`, `front/bandes-page`.
- Pull request for every merge; the other person reviews.
- Merge small and often (at least every two days).

## Adding a feature (pattern)

**Backend (Mohamed)**

1. New migration `server/db/migrations/00N_feature.sql`. Never edit an already-applied migration.
2. New folder `server/modules/<feature>/` with `routes.js`, `service.js`, `validation.js`.
3. Every write goes through `transaction()` and calls `journaliser()` with the same client.
4. Mount the router in `server/app.js`.

**Frontend (Yazid)**

1. Copy `public/pages/tableau-de-bord.html` as the page template.
2. Add the mock answers in `public/js/mock/index.js` from the contract examples.
3. Page script in `public/js/pages/`, calls only `api.get/post/put/supprimer`.
4. Escape all data with `echapper()` before `innerHTML`; format with `format.js`.
5. Set `disponible: true` for the page in the `MENU` list of `public/js/layout.js`.

## Phase 0 checklist

**Mohamed**

- [ ] Create the Git repository from this starter, add Yazid, protect `main`.
- [ ] `npm install` + `npm run dev` on your PC → dashboard shows `ok` with the real database.
- [ ] Packaging spike on a **clean Windows PC** (or a VM) with nothing installed:
  - Copy a portable `node.exe` (Node 22 LTS zip) + the project folder **with** `node_modules`.
  - Run `node.exe server\index.js` and open `http://localhost:3000`.
  - If PostgreSQL fails to start, check whether the Visual C++ Redistributable is needed.
  - Test from an **elevated (administrator)** prompt too: PostgreSQL refuses to run with
    admin rights. This decides which account the Windows service uses in phase 9.
- [ ] Report the spike result before phase 1 starts.

**Yazid**

- [ ] `npm install` + `npm run dev` on your PC → same result.
- [ ] Check `?mode=mock` works.
- [ ] Adjust the visual identity in `public/css/base.css` (colors, sizes) if you want.
- [ ] Print the dashboard (Ctrl+P): only the content and the print header should appear.
- [ ] Prepare the login page layout for phase 1 (mock only).

**Both**

- [ ] Read `docs/api.md` conventions and agree on them.
- [ ] Answer the open questions in the roadmap (Windows version, overlapping Bandes, …).
