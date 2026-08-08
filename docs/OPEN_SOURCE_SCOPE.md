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
