# JobHuntr OSS

A self-contained, open-source rebuild of JobHuntr inspired by JobHuntr v2: job search CRM, local job board, resume/cover-letter assistant, and an autonomous hunt simulator.

## One-line local run

```bash
npm run jobhuntr
```

That command installs dependencies on first run, starts the local API and frontend, and opens the app at:

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:8787/api/health>

No account, hosted database, cloud storage, analytics, object store, or third-party API key is required.

## What is included

- **Application tracker**: CRUD jobs, statuses, fit scores, notes, tasks.
- **Local job board**: seed jobs and local search without scraping or external services.
- **Resume tools**: local profile/resume storage and role-fit scoring.
- **Cover letters**: offline editable first drafts.
- **Autonomous hunt simulator**: deterministic local workflow inspired by JobHuntr v2 Infinite Hunt.
- **Import/export**: JSON backup from `/api/export` and restore via `/api/import`.
- **Public-repo safety**: `.gitignore`, `.env.example`, and `npm run secret:scan`.

## Data model and storage

All user data is stored locally in:

```text
./data/jobhuntr.json
```

Delete `./data` to reset. Back up `/api/export` before deleting if you need your data.

## Developer commands

```bash
npm run dev          # local API + Vite frontend
npm run build        # build frontend into dist/public
npm start            # serve API; also serves built frontend if present
npm test             # backend API smoke tests
npm run secret:scan  # scan repository for obvious secrets before publishing
npm run verify       # secret scan + tests + production build
```

## Why this is not a direct v2 source dump

JobHuntr v2 contains private infrastructure, deployment scripts, paid-service integrations, env files, and cloud-specific resources. This repository intentionally rebuilds the product as local-first OSS instead of copying private implementation wholesale.

See [`docs/OPEN_SOURCE_SCOPE.md`](docs/OPEN_SOURCE_SCOPE.md) and [`docs/SECURITY.md`](docs/SECURITY.md).
