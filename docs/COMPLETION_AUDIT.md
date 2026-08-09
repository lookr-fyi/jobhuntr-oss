# JobHuntr OSS completion audit

This audit maps the original open-source objective to current, verifiable repository evidence. The authorized Electron JobHuntr v2 frontend is the product and visual reference; the public implementation remains independently local-first and excludes private infrastructure and credentials.

## Original requirements

| Requirement                                          | Evidence                                                                                                                                                                                                                                                                                                                                          | Result |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| New public repository under lookr-fyi                | [`lookr-fyi/jobhuntr-oss`](https://github.com/lookr-fyi/jobhuntr-oss) reports `PUBLIC`, with `main` as its default branch and AGPL-3.0 recognized by GitHub.                                                                                                                                                                                      | Proven |
| Build the product from scratch using v2 as reference | [`OPEN_SOURCE_SCOPE.md`](OPEN_SOURCE_SCOPE.md) records each observed v2 surface and its independently built OSS equivalent. Public history begins with the clean local-first implementation rather than a v2 source import.                                                                                                                       | Proven |
| Frontend and backend are both included               | React/Vite frontend under `src/`; Express API, persistence, scoring, rendering, and audit engines under `server/`. Production build serves both from one process.                                                                                                                                                                                 | Proven |
| Electron desktop experience                          | `electron/main.mjs` launches the built app and private loopback service in a native window. Source-runtime and packaged-artifact E2E launch real Electron, complete user flows, verify persistence, window restoration, and renderer security boundaries.                                                                                         | Proven |
| Desktop distributables                               | Electron Builder produces macOS DMG/ZIP, Windows NSIS, and Linux AppImage/DEB installers. CI builds, launches, smoke-tests, and retains the native artifacts on every platform; release signing remains certificate-dependent.                                                                                                                    | Proven |
| User can build and run in one line                   | `npm start` installs locked dependencies when absent, builds, and opens the Electron app (`npm run desktop` remains an explicit alias). Executable `./run.sh` provides the equivalent one-command browser-local option. `tests/one-line.test.mjs` validates both launch plans, and CI launches `./run.sh` from a checkout with no `node_modules`. | Proven |
| No cloud storage or resources are required           | Local JSON storage and recovery backup live in ignored `./data`. `tests/local-first.test.mjs` enforces the runtime dependency allowlist and rejects cloud/auth/payment/database/telemetry SDKs. The server binds to loopback by default.                                                                                                          | Proven |
| No sensitive JobHuntr v2 data is leaked              | `.env*` and `data/` are ignored; only `.env.example` is tracked. `npm run secret:scan` scans both the working tree and every reachable Git blob for private keys, common tokens, JWTs, suspicious credential filenames, and private env files. CI blocks publication regressions.                                                                 | Proven |

## Product parity audit

| Product capability               | Local OSS evidence                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                         | Weekly goals, funnel and response metrics, priorities, stale opportunities, gig metrics, and activity audit                                                                                                               |
| Job tracker                      | Searchable v2-style Kanban, full queue/application lifecycle, status history, notes, dated tasks, contacts, fit scoring, and safe cascading deletion                                                                      |
| Job board                        | Bundled offline catalog, role/location and advanced filters, profile scoring, chronology/applicant/contributor metadata, privacy-safe leaderboard, and URL deduplication                                                  |
| Submission queue                 | Resume/letter packets, mandatory human checklist, and local submitted-status recording                                                                                                                                    |
| ATS templates and resume history | Three transparent templates, named versions, ATS keyword/impact checks, sanitized print preview, and PDF-ready browser output                                                                                             |
| Cover letters                    | Five-step v2 wizard, all 16 v2 template choices, deterministic generation, persistent editing/history, sanitized print preview, and PDF-ready output                                                                      |
| Infinite Hunt / agent runs       | Real role/location/required/excluded keyword filtering, ordered multi-workflow loops, ATS packet preparation, thresholds, preview, reasons, presets, deduplication, session details, and searchable paginated run history |
| AI Coach / About Me              | Persistent local coaching chat, interview answers, notes, research progress, STAR story vault, evidence matching, and session history                                                                                     |
| Outreach                         | Editable local drafts and draft/sent/replied/archived lifecycle without automatic sending                                                                                                                                 |
| LinkedIn audit                   | Paste-only deterministic professional-profile audit with visible rubric and local history; no login, cookie access, or scraping                                                                                           |
| Gigs                             | Available campaign cards plus lead-to-delivery Kanban, proposals, deadlines, budgets, earnings, and command-center rollups                                                                                                |
| User settings                    | Local identity, role/skill targets, locations, salary, remote preference, and weekly goal                                                                                                                                 |
| Data portability                 | Full JSON backup/restore, automatic corruption recovery, CSV export/import, bounded imports, and schema migration                                                                                                         |
| Privacy controls                 | Localhost-only default, no account, no telemetry, restrictive headers, ignored personal data, dependency guard, and history-wide secret scanning                                                                          |

## Intentional local-first replacements

The following v2 mechanisms are deliberately not reproduced because they conflict with the objective's no-cloud and privacy constraints:

- Hosted authentication, billing, analytics, databases, object storage, and deployment infrastructure.
- Browser-cookie reuse, LinkedIn login automation, third-party job-site scraping, or automatic external submissions.
- Required paid LLM calls or opaque model decisions.
- Auto-update distribution and platform release signing.

Their user-facing value is replaced with local profiles, deterministic scoring/generation, paste/import workflows, human-reviewed queues, transparent run logs, browser-native document export, and portable local backups.

## Verification gate

`npm run verify` must pass all of the following:

1. Working-tree and complete-Git-history secret scan.
2. Prettier format check.
3. ESLint and React Hooks checks with zero warnings.
4. API, persistence, concurrency, recovery, rendering, scoring, import/export, local-first architecture, and one-line-launch tests.
5. Production frontend build.
6. A no-mock Chrome journey covering onboarding, hunting, run history, ATS resume, submission, cover letter, tracker, profile audit, outreach, AI Coach, Gigs, settings, persistence, and mobile layout. Axe scans enforce no serious or critical WCAG 2 A/AA violations across every visited product surface.
7. Real Electron source-runtime and packaged-distributable launch tests that verify user flows, persistence, window restoration, and renderer security boundaries.

GitHub Actions runs the browser and Electron gate under Xvfb, smoke-tests the actual Linux, macOS, and Windows packaged artifacts, and independently launches `./run.sh` from a dependency-free checkout. `npm audit --omit=dev` is also expected to report zero production vulnerabilities at release time.
