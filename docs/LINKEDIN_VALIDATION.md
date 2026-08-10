# LinkedIn validation record

This record separates live-site observations from capabilities that the open-source app actually provides. It contains no account credentials, contact details, resume contents, cookies, or other private application data.

## 2026-08-09 live smoke test

- Environment: authenticated LinkedIn session in a persistent, user-controlled Chrome profile.
- Surface: a currently available United States software-engineering posting marked **Easy Apply**.
- Posting: Senior Software Engineer at RollCredits (LinkedIn job `4415115459`).
- Safe stopping rule: never enter an unverified personal claim and never press the final submit button.

The live flow was exercised through:

1. Easy Apply launch.
2. Contact-information review.
3. Existing-resume selection.
4. Optional top-choice step.
5. Additional questions at 75% progress.
6. Explicit discard of the draft.

The observed additional-question controls included required numeric/text answers and a required yes/no selection. No answers were guessed, no application was submitted, and the draft was discarded rather than saved.

## What this proves

- LinkedIn's current Easy Apply surface remains a multi-step form with contact, resume, optional, and additional-question stages.
- JobHuntr's local review model needs to preserve exact question wording, control type, options, answer verification, and attachment choice.
- A safe test can reach real questions without creating an application submission.

## What this does not prove

- The open-source app does **not** read the authenticated browser session, scrape LinkedIn, fill the live form, bypass CAPTCHA, or submit an application.
- Its reviewed application packets and submission records are local preparation and bookkeeping, not evidence of an external submission.
- Live submission remains unvalidated because no application should be sent without the account owner's explicit approval for that specific posting and final payload.

Automated local and packaged Electron coverage is tracked separately in [COMPLETION_AUDIT.md](COMPLETION_AUDIT.md).
