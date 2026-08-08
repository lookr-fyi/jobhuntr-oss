# Contributing to JobHuntr OSS

Thanks for helping improve a private, local-first job search tool.

## Local setup

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run verify
```

## Privacy requirements

- Never commit `.env` files, exports, resumes, notes, credentials, or production data.
- Do not copy private JobHuntr v2 implementation files into this repository.
- New integrations must remain optional; a fresh checkout must work without an account, API key, hosted database, or cloud storage.
- Keep personal data under the ignored `./data` directory.
- Add tests for persistence, import/export, or API behavior changes.

## Design principles

1. Local-first and inspectable by default.
2. One command from checkout to a working app.
3. Human review before any externally visible application action.
4. Deterministic offline behavior before optional AI enhancements.
