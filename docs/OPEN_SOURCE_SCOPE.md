# Open-source scope

This repo uses JobHuntr v2 as product reference, not as a direct public dump.

Observed v2 product areas:

- Electron/Vite frontend with pages for overview, job tracker, job board, run pages, ATS templates, cover letters, LinkedIn audit, AI coach, gigs, and user settings.
- FastAPI backend with bot run controls, activity polling, PDF export, LinkedIn utilities, auth token persistence, and platform-specific integrations.
- Service gateway and cloud integrations for Supabase, Clerk, Stripe, Vercel/Railway, Langfuse, analytics, and release distribution.

OSS replacement decisions:

- Replace cloud auth with a single local profile.
- Replace Supabase/cloud storage with `./data/jobhuntr.json`.
- Replace external job-board automation with a deterministic local seed board and manual job entry.
- Replace paid LLM-dependent generation with transparent local templates/scoring.
- Keep core user value: plan the search, track applications, prepare resumes/cover letters, and run an autonomous local hunt workflow.

## Current parity map

| v2 product area | Local OSS implementation |
| --- | --- |
| Overview and pipeline | Command center, funnel, weekly application/interview metrics, tasks, activity audit |
| Job tracker | Draggable Kanban/list views, filters, status history, notes, tasks, contacts, scoring, manual entry |
| Job board | Bundled offline board with profile-based scoring |
| ATS templates | Three transparent templates, named history, keyword/impact analysis, secure print preview and PDF-ready export |
| Cover letters | Editable deterministic drafts, persistent history, print preview and PDF-ready export |
| Submission queue | Local application packets, attachment visibility, mandatory review, submission history |
| AI coach / About Me | Persistent interview answers, research progress, private notes, session history, and reusable STAR evidence vault |
| Outreach | Local editable LinkedIn/email-style drafts with draft/sent/replied/archive workflow; no automatic sending |
| Infinite Hunt | Offline previews, role/location/keyword rules, exclusions, fit thresholding, presets, match explanations, deduplication, and run history |
| User settings | Local profile, role/skill criteria, locations, remote and salary preferences |
| Data portability | Full JSON backup/restore, CSV jobs export, bulk JSON jobs import |

External account automation, scraping, billing, hosted authentication, and cloud AI are intentionally not bundled. They would violate the requirement that a fresh checkout run without accounts or cloud resources.
