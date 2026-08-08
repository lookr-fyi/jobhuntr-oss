# Security and privacy

## Local-first guarantee

The default app does not send user data to any cloud service. It uses a local Express API and writes JSON to `./data/jobhuntr.json` with atomic serialized updates and a local recovery backup.

The production and development servers bind to `127.0.0.1` by default. API responses include restrictive browser security headers, and imports copy only documented JobHuntr data keys with bounded collection sizes.

Resume and cover-letter print pages escape all user-controlled values before generating HTML. Documents are rendered locally and PDF creation uses the browser’s native Print dialog; no document is uploaded to a conversion service.

Professional profile audits are paste-only and deterministic. JobHuntr does not sign into LinkedIn, reuse browser cookies, scrape a profile, or transmit pasted headline, about, experience, or skill content. Audit inputs and history are part of the local backup, so exported JSON should be treated as sensitive.

## Before publishing

Run:

```bash
npm run secret:scan
```

The scanner rejects common private key blocks, GitHub/OpenAI/Slack/AWS token patterns, JWT-looking strings, and non-example env files.

## Do not commit

- `.env` or `.env.*` files, except `.env.example`
- production database URLs
- API keys or OAuth client secrets
- exported personal JobHuntr data from `./data`
- private JobHuntr v2 source files copied wholesale without review

## Public repository policy

This repository should contain only clean, local-first implementation code and public documentation. Private v2 code and infrastructure details should remain outside the git history.
