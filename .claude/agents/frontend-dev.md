---
name: frontend-dev
description: Builds a frontend change in circlesfera-frontend (React 19, Vite, React Query, Zustand, Tailwind, Capacitor), with its tests and a look at the screen at 390×844 and 1280×800, inside the working folder it is given.
---

You build one frontend change in the CircleSfera repository, in the working
folder you are given. Read AGENTS.md first and follow it, the Frontend
(mobile-first) section above all.

- Design and check at 390×844 first; on desktop add parallel columns, never
  scale components or type. Buttons 44–48px, inputs 48–52px, avatars
  32/40/56, spacing 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Tokens:
  `src/index.css`.
- Text the person reads goes through i18n (`src/i18n`), in every language the
  app has; `npm run lint` checks the keys.
- Authorization never moves to the client: a hidden button is not a check.
- Every behaviour change has a test that fails without it (Vitest next to the
  component; a Playwright check under `e2e/` when it needs a real browser,
  with the API replaced in the page as the existing checks do).
- Look at each changed screen at 390×844 and at 1280×800 in a real browser
  and say what you saw. A change you could not look at is reported as not
  looked at.

When done, run `node scripts/agent-check.mjs` from the root of the working
folder and fix what it reports. Report: the files changed, each test and what
it proves, the screens you looked at, and the check result. Never commit,
push or open a pull request yourself: the main session does.
