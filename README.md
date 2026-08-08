# JobHuntr OSS

[![Verify](https://github.com/lookr-fyi/jobhuntr-oss/actions/workflows/verify.yml/badge.svg)](https://github.com/lookr-fyi/jobhuntr-oss/actions/workflows/verify.yml)

A self-contained, local-first Electron rebuild of the JobHuntr v2 experience: job search CRM, job board, resume/cover-letter studio, career coach, and explainable autonomous hunt engine.

## Electron desktop app

```bash
npm install
npm run desktop
```

This builds the frontend, starts the private loopback service, and opens JobHuntr in a native Electron window. The desktop shell uses context isolation, disables Node integration in the renderer, enables Chromium sandboxing, and stores workspace data under Electron's per-user application-data directory.

The browser-based local launcher remains available for contributors and users who prefer it.

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

- **Application tracker**: draggable Kanban and list views, search/status filters, status timeline, fit scores, notes, tasks, contacts, and cascading deletion.
- **Command center**: weekly application goals, pipeline conversion metrics, dated follow-ups, overdue/upcoming priorities, stale-opportunity detection, and activity history.
- **Local job board**: seed jobs and local search without scraping or external services.
- **Resume studio**: reusable ATS templates, named version history, keyword analysis, secure print previews, and browser-native PDF export.
- **Cover letters**: offline generation, persistent editing/history, print previews, and PDF-ready layouts.
- **Autonomous hunt**: truthful role/location filtering, required and excluded keywords, profile-fit thresholds, previews, reusable presets, deduplication, match explanations, and run history.
- **Profile and preferences**: target roles, skills, locations, remote preference, and minimum salary.
- **Submission queue**: assemble resume/letter packets, enforce a review checklist, and record applications without external account automation.
- **Interview coach and outreach**: persistent role-specific practice answers, research checklists, private notes, reusable STAR story evidence, session history, and editable outreach statuses—all offline.
- **Professional profile audit**: paste-only, deterministic headline/about/experience/skills scoring with visible checks, recommendations, target-term matching, and local history—without scraping or account access.
- **Freelance gigs**: local lead-to-delivery Kanban, proposal notes, deadlines, budgets, status history, pipeline value, and tracked earnings without marketplace integration.
- **Import/export**: one-click JSON backup/restore, CSV export, and user-facing CSV import with quoted-field support and URL deduplication.
- **Public-repo safety**: `.gitignore`, `.env.example`, and `npm run secret:scan`.

## Data model and storage

All user data is stored locally in:

```text
./data/jobhuntr.json
```

The Electron app uses its platform-specific JobHuntr user-data directory instead. Set `JOBHUNTR_DATA_DIR` to override either location.

Delete `./data` to reset. Back up `/api/export` before deleting if you need your data.

Writes are atomic and serialized. JobHuntr also maintains `./data/jobhuntr.backup.json`; if the primary JSON file becomes malformed, the server automatically restores the last readable backup and preserves the damaged file for inspection.

## Developer commands

```bash
npm run dev          # local API + Vite frontend
npm run desktop      # build and launch the Electron desktop app
npm run build        # build frontend into dist/public
npm start            # serve API; also serves built frontend if present
npm test             # backend API smoke tests
npm run test:e2e     # real Chrome and Electron user-journey tests
npm run lint         # static checks for browser, server, scripts, and tests
npm run format       # format JavaScript, JSX, CSS, JSON, Markdown, and workflows
npm run secret:scan  # scan repository for obvious secrets before publishing
npm run verify       # secret scan + formatting + lint + tests + production build
```

The server binds to `127.0.0.1` by default so other devices on the network cannot access personal job-search data. Set `HOST` explicitly only if you understand the exposure.

## Why this is not a direct v2 source dump

JobHuntr v2 contains private infrastructure, deployment scripts, paid-service integrations, env files, and cloud-specific resources. This repository intentionally rebuilds the product as local-first OSS instead of copying private implementation wholesale.

See [`docs/OPEN_SOURCE_SCOPE.md`](docs/OPEN_SOURCE_SCOPE.md) and [`docs/SECURITY.md`](docs/SECURITY.md).

## Contributing and license

Contributions are welcome under the privacy and local-first requirements in [`CONTRIBUTING.md`](CONTRIBUTING.md). JobHuntr OSS is licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Release evidence

See the requirement-by-requirement [`completion audit`](docs/COMPLETION_AUDIT.md) and [`CHANGELOG.md`](CHANGELOG.md).
