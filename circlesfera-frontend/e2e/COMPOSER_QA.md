# Composer QA

Product coverage for the Post/Frame stepped composer. The UI under test is always the real React
composer (`ContentComposerPage` / `ComposerChrome`). This file is the composer slice of the repo
pyramid in Notion → Quality → [Test Architecture](https://app.notion.com/p/3e9dfa08f2f5810a86b9c59354278d0a) — not a
second architecture.

| Layer | Command | What it catches |
| --- | --- | --- |
| Unit | `npx vitest run src/components/create-post/` | Density, Tag People rules, trim presets, sensitive copy. Locale **es** via real catalog (`renderWithProviders`; i18n unmocked). |
| Visual | `npm run test:e2e:composer` | Screenshots of `[data-testid=content-composer]` at **390×844** after media is painted. |
| Smoke | same command (`composer-smoke.spec.ts`) | Post: upload → edit → caption → share. Frame: upload → trim → edit → caption. |

## Pyramid (this slice)

| | Real | Isolated |
| --- | --- | --- |
| **Vitest** | Component + `locales/es.json` | No API. `File` / `blob:` is enough. |
| **Composer Playwright** | Vite SPA, chrome, i18n, fixtures with visible media | `prepareComposerSession` stubs `**/api/v1/**` (uploads/posts/me/config typed; catch-all fallback). Auth + cookie consent + `i18nextLng=es` in `localStorage`. |
| **Root Playwright / backend e2e** | Login → publish → feed against Nest + Postgres | Not this suite. Do not stub the Nest API there. |

Stubbing **our** API is correct here (no backend, no FFmpeg wasm in CI). Stubbing **UI or i18n** is
not. Design-preview HTML is a human measure sheet only — never a snapshot source.

Shared page-object: `e2e/helpers/composer.ts` (`openComposer`, `uploadFixture`, `confirmFrameTrim`,
`waitEditPreviewReady`, `goToCaption`, …). Smoke and visual only orchestrate those steps.

Locale is fixed to **es** so roles stay stable (`Siguiente` / `Compartir` / `Listo` / `Seleccionar video`).

## Fixtures (visible media, not solid color)

Illustrated scenes in the brand's purple, pink and blue colours. None of them has text, so no
letters or logo show up in a capture.

| File | What it shows |
| --- | --- |
| `e2e/fixtures/post-4x5.jpg` | 1080×1350 (4:5), sunset over the sea, the sun above the mountains |
| `e2e/fixtures/post-4x5-city.jpg` | 1080×1350 (4:5), a city at night under the moon |
| `e2e/fixtures/post-4x5-coffee.jpg` | 1080×1350 (4:5), a cup of coffee by a window |
| `e2e/fixtures/frame-20s.mp4` | 720×1280 (9:16), 20 s, an aurora over mountains while the view pans down; no audio |

`FIXTURES.postImage` is the sunset; `FIXTURES.postImages` holds the three photos, for posts with
several items (`composer-carousel.spec.ts` uploads one of each).

Regenerate them all from `circlesfera-frontend` (needs `ffmpeg` on the `PATH`, and the frontend's
installed `sharp`):

```bash
node e2e/fixtures/make-fixtures.mjs
```

The script draws each scene as SVG; `sharp` turns the photos into JPEG files and `ffmpeg` makes
the video from a taller scene that pans down.
After regenerating, update the captures that show them (see Notes).

Other SPA Playwright specs (`feed`, `login`, `profile`, `search`, `messages`, `stripe`, `smoke`) share `e2e/helpers/session.ts` and the Post still `e2e/fixtures/post-4x5.jpg` (the sunset). See `e2e/README.md`.

## Commands

```bash
npm run test:e2e:composer          # smoke + visual
npm run test:e2e:composer:update   # regenerate PNG baselines
```

Scripts prefix `env -u NO_COLOR FORCE_COLOR=0` so Node does not warn when Cursor sets both.

## Notes

- Smoke and visual run on every pull request (Pull Request CI → Playwright E2E, step "Check the composer and its captures").
- Frame smoke/visual stop before Share (FFmpeg wasm export is too heavy for CI).
- Snapshot filenames are OS-suffixed. CI compares the `*-chromium-linux.png` files; `*-chromium-darwin.png` are for local runs on a Mac. After a visual change, regenerate both: on the Mac with `npm run test:e2e:composer:update`, and the Linux ones inside the same Playwright image CI uses (`mcr.microsoft.com/playwright:v<version>-noble`, version from `package.json`) with the frontend dev server running and `npx playwright test e2e/composer-visual.spec.ts --update-snapshots`.
- Visual `maxDiffPixelRatio` is 0.06; media must paint before screenshot (`waitEditPreviewReady`), and videos are stopped on their first picture so two runs show the same frame.
