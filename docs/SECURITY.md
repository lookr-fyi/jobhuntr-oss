# Security and privacy

## Local-first guarantee

The default app does not send user data to any cloud service. It uses a local Express API and writes JSON to `./data/jobhuntr.json`.

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
