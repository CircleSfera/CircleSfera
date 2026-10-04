# ADR-0017: Content presentation shells

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** CircleSfera engineering
- **Scope:** frontend layout chrome | content create/consume UX

## Context

Posts, frames, stories, live, and highlights used inconsistent app chrome:

- `/create` and `/edits` hid TopNav/BottomNav and locked scroll.
- `/frames` kept nav with a vertical snap player.
- `/live/broadcast` and `/live/:id` kept the full app shell despite being full-bleed media.
- Stories opened via both `storyStore` (global) and a second `StoryViewer` mounted on Profile.

Create entry naming (`CreatePostModal`) implied a dialog while the surface is a full-screen route. Destacadas creation depended on `/profile?action=highlights` instead of a first-class create entry.

## Decision

CircleSfera uses a **content presentation shell** matrix on the SPA. Helper: `getContentShell(pathname)` in `circlesfera-frontend/src/layouts/contentShell.ts`.

| Shell | Routes | Chrome |
| --- | --- | --- |
| `create` | `/create`, `/edits` | No TopNav/BottomNav; document scroll locked; Sidebar stays on md+ for `/create`, hidden for `/edits` |
| `broadcast` | `/live/broadcast` | Same immersive chrome as `create` |
| `playback` | `/live/:streamId` (viewer); story overlay via portal | Immersive; own gestures |
| `vertical` | `/frames` | TopNav + BottomNav; viewport height locked; snap vertical |
| `stream` | Feed, profile, post detail, etc. | Full app shell |

**Story ownership:** only `useStoryStore` + one `StoryViewer` in `LayoutWrapper`. Profile / highlight flows call `openStories()`; they must not mount a second viewer.

**Create product:** `/create` is the **Content Composer** (Post / Frame / Story / Círculo). Live and Destacadas remain create-menu destinations; Destacadas opens `CreateHighlightModal` via `uiStore` (legacy `?action=highlights` deep-link preserved).

Does **not** change LiveKit media (ADR-0005), feed fan-out, or API contracts.

**Follow-on:** Content Composer dual-path IA (Story immersive vs Post/Frame stepped) and Mobile First create chrome are defined in [ADR-0018](./0018-content-composer-ia.md).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep ad-hoc pathname flags in LayoutWrapper | Shell rules already diverged (live not immersive) |
| Single shell for all media | Frames need BottomNav; create must not |
| Micro-frontend per surface | Violates modular monolith / SPA as-built |

## Consequences

- LayoutWrapper derives chrome from `getContentShell`, not scattered boolean routes.
- Follow-on consume work (InteractionRail, feed/frames layout) builds on the same matrix.
- Docs 13 (layout guidelines) should describe shells when updated.
- Visual identity (tokens, glass, dark) unchanged — shells are structure, not rebrand.

### Follow-on (shipped with consume phase)

| Surface | Shell | Interaction |
| --- | --- | --- |
| `/create`, `/edits` | `create` | ContentComposerPage / Studio |
| `/live/broadcast` | `broadcast` | LiveBroadcaster |
| `/live/:id`, StoryViewer overlay | `playback` | LiveViewer / StoryViewer via `storyStore` |
| `/frames` | `vertical` | FrameItem + InteractionRail (vertical) |
| `/`, `/:username`, `/p/:id` | `stream` | PostCard + InteractionRail (horizontal) |

Story ownership: Profile and HighlightViewer call `openStories()`; only LayoutWrapper mounts `StoryViewer`.

## References

- `.ai/playbooks/architecture.md`, `.ai/playbooks/ui-redesign.md`
- `circlesfera-frontend/src/layouts/contentShell.ts`
- `circlesfera-frontend/src/layouts/LayoutWrapper.tsx`
- `circlesfera-frontend/src/components/content/InteractionRail.tsx`
- `circlesfera-documentation/13-layout-guidelines.md` (shell map)
