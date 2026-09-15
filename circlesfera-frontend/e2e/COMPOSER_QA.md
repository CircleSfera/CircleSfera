# Composer QA (ADR-0018)

Product coverage for the Post/Frame stepped composer. The UI under test is always the real React
composer (`ContentComposerPage` / `ComposerChrome`). This file is the composer slice of the repo
pyramid in [`.ai/core/quality.md`](../../.ai/core/quality.md) — not a second architecture.

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

| File | Spec |
| --- | --- |
| `e2e/fixtures/post-4x5.jpg` | 800×1000, synthetic scene (gradient + shapes + “CS”) |
| `e2e/fixtures/frame-20s.mp4` | 360×640 (9:16), 20s, `testsrc2` motion pattern |

Regenerate (requires `ffmpeg`, no npm deps):

```bash
# Post still (4:5)
ffmpeg -y -f lavfi -i "color=c=0x1a2744:s=800x1000:d=1" \
  -f lavfi -i "color=c=0x3d7ea6:s=800x1000:d=1" \
  -filter_complex "[0][1]blend=all_expr='A*(1-T/1)+B*(T/1)',\
    drawbox=x=80:y=120:w=280:h=280:color=0xf2c94c@0.9:t=fill,\
    drawbox=x=420:y=480:w=260:h=360:color=0xe85d4c@0.85:t=fill,\
    drawtext=text='CS':fontsize=120:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
  -frames:v 1 -update 1 e2e/fixtures/post-4x5.jpg

# Frame video (9:16, ≥15s)
ffmpeg -y -f lavfi -i "testsrc2=size=360x640:rate=10" -t 20 \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  e2e/fixtures/frame-20s.mp4
```

Other SPA Playwright specs (`feed`, `login`, `profile`, `search`, `messages`, `stripe`, `smoke`) share `e2e/helpers/session.ts` and the Post still `e2e/fixtures/post-4x5.jpg`. See `e2e/README.md`.

## Commands

```bash
npm run test:e2e:composer          # smoke + visual
npm run test:e2e:composer:update   # regenerate PNG baselines
```

Scripts prefix `env -u NO_COLOR FORCE_COLOR=0` so Node does not warn when Cursor sets both.

## Notes

- Frame smoke/visual stop before Share (FFmpeg wasm export is too heavy for CI).
- Snapshot filenames are OS-suffixed (`*-chromium-darwin.png`). Regenerate on the same OS as CI when enabling in pipeline.
- Visual `maxDiffPixelRatio` is ~0.04; media must paint before screenshot (`waitEditPreviewReady`).
