# Frontend Playwright (`circlesfera-frontend/e2e`)

SPA journeys against the Vite app. The UI, i18n catalogs, and fixtures are real. Nest is not —
`helpers/session.ts` stubs `**/api/v1/**` (plus CSRF). This is the same isolation as the composer
slice, not the repo-root `e2e/` suite (that one hits Postgres).

| Spec | Journey |
| --- | --- |
| `smoke.spec.ts` | Guest `/` loads (`#root`, title). |
| `login.spec.ts` | Guest submits `/accounts/login` → Home nav. |
| `composer-smoke.spec.ts` / `composer-visual.spec.ts` | Post/Frame composer. [COMPOSER_QA.md](./COMPOSER_QA.md) |
| `editor-control-sizes.spec.ts` | Every screen of the content editor at 390×844: no button under 44 px, no text field under 48 px. Runs in CI on every pull request. |
| `feed.spec.ts` | Post composer → caption visible on Home. |
| `profile.spec.ts` | Own profile → Settings → bio save → bio on profile. |
| `search.spec.ts` | Explore grid pin + people search (`es` placeholder). |
| `messages.spec.ts` | Inbox thread → send text. |
| `restrict.spec.ts` | Restrict from a profile's menu, restrict from a comment, approve a comment waiting for approval, unrestrict in Settings, at 390×844 and 1280×800 (`RESTRICT_SHOTS=dir` saves captures). |
| `mention-tag-message-controls.spec.ts` | Choose who can mention, tag or message you in Settings → Privacy, approve a waiting tag and remove yourself from a post in Settings → Tags, and the notice when an account takes no message requests, at 390×844 and 1280×800 (`MENTION_TAG_SHOTS=dir` saves captures). |

Locale is `es` (`i18nextLng`). Viewport for feed/composer is **390×844**; other specs use the
Playwright project default (Desktop Chrome).

```bash
npm run test:e2e              # all specs in this folder
npm run test:e2e:composer     # composer smoke + visual only
npm run test:e2e:sizes        # control sizes of the content editor
```
