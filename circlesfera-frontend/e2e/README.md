# Frontend Playwright (`circlesfera-frontend/e2e`)

SPA journeys against the Vite app. The UI, i18n catalogs, and fixtures are real. Nest is not —
`helpers/session.ts` stubs `**/api/v1/**` (plus CSRF). This is the same isolation as the composer
slice, not the repo-root `e2e/` suite (that one hits Postgres).

| Spec | Journey |
| --- | --- |
| `smoke.spec.ts` | Guest `/` loads (`#root`, title). |
| `login.spec.ts` | Guest submits `/accounts/login` → Home nav. |
| `composer-smoke.spec.ts` / `composer-visual.spec.ts` | Post/Frame composer. [COMPOSER_QA.md](./COMPOSER_QA.md) |
| `feed.spec.ts` | Post composer → caption visible on Home. |
| `profile.spec.ts` | Own profile → Settings → bio save → bio on profile. |
| `search.spec.ts` | Explore grid pin + people search (`es` placeholder). |
| `messages.spec.ts` | Inbox thread → send text. |
| `stripe.spec.ts` | Creator `/creator/monetization` → `Conectar Stripe` → Connect URL. |

Locale is `es` (`i18nextLng`). Viewport for feed/composer is **390×844**; other specs use the
Playwright project default (Desktop Chrome).

```bash
npm run test:e2e              # all specs in this folder
npm run test:e2e:composer     # composer smoke + visual only
```
