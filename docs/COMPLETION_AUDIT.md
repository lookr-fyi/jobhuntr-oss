# JobHuntr OSS completion audit

This audit maps the original open-source objective to current, verifiable repository evidence. JobHuntr v2 was used as a product reference; private implementation and infrastructure were not copied into this history.

## Original requirements

| Requirement                                          | Evidence                                                                                                                                                                                                                                                                          | Result |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| New public repository under lookr-fyi                | [`lookr-fyi/jobhuntr-oss`](https://github.com/lookr-fyi/jobhuntr-oss) reports `PUBLIC`, with `main` as its default branch and AGPL-3.0 recognized by GitHub.                                                                                                                      | Proven |
| Build the product from scratch using v2 as reference | [`OPEN_SOURCE_SCOPE.md`](OPEN_SOURCE_SCOPE.md) records each observed v2 surface and its independently built OSS equivalent. Public history begins with the clean local-first implementation rather than a v2 source import.                                                       | Proven |
| Frontend and backend are both included               | React/Vite frontend under `src/`; Express API, persistence, scoring, rendering, and audit engines under `server/`. Production build serves both from one process.                                                                                                                 | Proven |
| User can build and run in one line                   | Executable `./run.sh` installs locked dependencies when absent, builds, starts the app, and opens `127.0.0.1:8787`. `tests/one-line.test.mjs` validates the launcher. CI's `clean-one-line-launch` job runs that exact command from a checkout with no `node_modules`.            | Proven |
| No cloud storage or resources are required           | Local JSON storage and recovery backup live in ignored `./data`. `tests/local-first.test.mjs` enforces the runtime dependency allowlist and rejects cloud/auth/payment/database/telemetry SDKs. The server binds to loopback by default.                                          | Proven |
| No sensitive JobHuntr v2 data is leaked              | `.env*` and `data/` are ignored; only `.env.example` is tracked. `npm run secret:scan` scans both the working tree and every reachable Git blob for private keys, common tokens, JWTs, suspicious credential filenames, and private env files. CI blocks publication regressions. | Proven |

## Product parity audit

| Product capability               | Local OSS evidence                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview                         | Weekly goals, funnel and response metrics, priorities, stale opportunities, gig metrics, and activity audit                                      |
| Job tracker                      | Searchable Kanban/list views, status history, notes, dated tasks, contacts, fit scoring, and safe cascading deletion                             |
| Job board                        | Bundled offline catalog, role/location search, profile scoring, and URL deduplication                                                            |
| Submission queue                 | Resume/letter packets, mandatory human checklist, and local submitted-status recording                                                           |
| ATS templates and resume history | Three transparent templates, named versions, ATS keyword/impact checks, sanitized print preview, and PDF-ready browser output                    |
| Cover letters                    | Deterministic generation, persistent editing/history, sanitized print preview, and PDF-ready output                                              |
| Infinite Hunt / agent runs       | Real role/location/required/excluded keyword filtering, thresholds, preview, reasons, presets, deduplication, and run history                    |
| AI Coach / About Me              | Persistent interview answers, notes, research progress, STAR story vault, evidence matching, and session history                                 |
| Outreach                         | Editable local drafts and draft/sent/replied/archived lifecycle without automatic sending                                                        |
| LinkedIn audit                   | Paste-only deterministic professional-profile audit with visible rubric and local history; no login, cookie access, or scraping                  |
| Gigs                             | Lead-to-delivery Kanban, proposals, deadlines, budgets, earnings, and command-center rollups                                                     |
| User settings                    | Local identity, role/skill targets, locations, salary, remote preference, and weekly goal                                                        |
| Data portability                 | Full JSON backup/restore, automatic corruption recovery, CSV export/import, bounded imports, and schema migration                                |
| Privacy controls                 | Localhost-only default, no account, no telemetry, restrictive headers, ignored personal data, dependency guard, and history-wide secret scanning |

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

GitHub Actions repeats the gate and independently launches `./run.sh` from a dependency-free checkout. `npm audit --omit=dev` is also expected to report zero production vulnerabilities at release time.
