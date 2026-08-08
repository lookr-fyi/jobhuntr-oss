# JobHuntr OSS

A self-contained, open-source rebuild of JobHuntr inspired by JobHuntr v2: job search CRM, local job board, resume/cover-letter assistant, and an autonomous hunt simulator.

## One-line local run

```bash
./run.sh
```

or, equivalently:

```bash
npm run jobhuntr
```

That command installs locked dependencies on first run, builds the frontend, starts the local backend, and opens the complete app at:

- App: <http://127.0.0.1:8787>
- Health check: <http://127.0.0.1:8787/api/health>

No account, hosted database, cloud storage, analytics, object store, or third-party API key is required.

## What is included

- **Application tracker**: CRUD jobs, status history, fit scores, notes, tasks, and contacts.
- **Local job board**: seed jobs and local search without scraping or external services.
- **Resume studio**: reusable ATS templates, named resume versions, keyword analysis, and quantified-impact checks.
- **Cover letters**: offline editable first drafts.
- **Autonomous hunt**: deterministic, explainable workflow with thresholds, run steps, and action history.
- **Profile and preferences**: target roles, skills, locations, remote preference, and minimum salary.
- **Submission queue**: assemble resume/letter packets, enforce a review checklist, and record applications without external account automation.
- **Interview coach and outreach**: role-specific practice plans, talking points, research checklists, and editable messages generated offline.
- **Import/export**: one-click JSON backup/restore, CSV job export, and bulk job import API.
- **Public-repo safety**: `.gitignore`, `.env.example`, and `npm run secret:scan`.

## Data model and storage

All user data is stored locally in:

```text
./data/jobhuntr.json
```

Delete `./data` to reset. Back up `/api/export` before deleting if you need your data.

Writes are atomic and serialized. JobHuntr also maintains `./data/jobhuntr.backup.json`; if the primary JSON file becomes malformed, the server automatically restores the last readable backup and preserves the damaged file for inspection.

## Developer commands

```bash
npm run dev          # local API + Vite frontend
npm run build        # build frontend into dist/public
npm start            # serve API; also serves built frontend if present
npm test             # backend API smoke tests
npm run secret:scan  # scan repository for obvious secrets before publishing
npm run verify       # secret scan + tests + production build
```

The server binds to `127.0.0.1` by default so other devices on the network cannot access personal job-search data. Set `HOST` explicitly only if you understand the exposure.

## Why this is not a direct v2 source dump

JobHuntr v2 contains private infrastructure, deployment scripts, paid-service integrations, env files, and cloud-specific resources. This repository intentionally rebuilds the product as local-first OSS instead of copying private implementation wholesale.

See [`docs/OPEN_SOURCE_SCOPE.md`](docs/OPEN_SOURCE_SCOPE.md) and [`docs/SECURITY.md`](docs/SECURITY.md).

## Contributing and license

Contributions are welcome under the privacy and local-first requirements in [`CONTRIBUTING.md`](CONTRIBUTING.md). JobHuntr OSS is licensed under the [GNU Affero General Public License v3.0](LICENSE).
