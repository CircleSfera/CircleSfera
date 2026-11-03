# ADR-0030: One Create screen and one full-screen editor for every format

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** CircleSfera owner, CircleSfera engineering
- **Scope:** frontend | product | content create UX
- **Supersedes:** [ADR-0018](./0018-content-composer-ia.md)

## Context

ADR-0018 split creation into two paths. Stories used a full-screen canvas. Posts and Frames went
Upload → Edit → Caption inside a card (`ComposerChrome`), with editing in panels and sliders
(`PhotoEditor`). Its "Revisiting" section said to supersede it if camera capture became the main
entry.

That has happened for stories. The story redesign built:

- a camera-first capture screen (`story/capture/StoryCapture.tsx`, `useStoryCamera`);
- a full-screen 9:16 editor with finger gestures (`storyGesture.ts`, `useStoryGestures`) and a filter
  swipe (`storyPhoto.ts`);
- text written in place, a sticker tray, brushes and readable tools;
- sharing from the editor;
- a painted layer joined to the video on the server (`video.processor.ts`).

The owner decided that Posts, Frames and Lives get the same redesign (PD-048). Lives start from the
`broadcast` shell and today have a setup screen with a title only.

## Decision

1. **One Create screen.** Creation opens on one screen, built from the story capture screen, with the
   modes Post, Story, Frame and Live along the bottom. The mode comes from the entry
   (`CreateBottomSheet` → `/create?mode=*`) and can be changed on the screen. Live mode leads to the
   broadcast shell once the host goes live.
2. **One full-screen editor.** Posts and Frames are edited in the story editor's shell, not in a
   card. On a phone the item fills the width, with the tools column at the top right, gestures on the
   media, the filter swipe, and text and stickers in place. On desktop it sits in a frame over the
   brand's background.
   - **Story and Frame** use a 9:16 frame.
   - **Post** uses its shape: 1:1, 4:5 or 1.91:1, one per post (PD-049).
3. **Shared pieces, not shared screens.** The gestures, filter swipe, text editor, sticker tray, brushes,
   tools column and camera hook are shared modules. What only one format has stays with that format:
   - Post: the carousel tray, the caption screen, tagging people.
   - Story: interactive stickers, sharing to Your story or Close friends.
   - Frame: clips, trim, cover.
   - Live: the setup rail, audience, guest.
4. **One camera hook.** Stories, Frames and the live preview use one camera hook. Live's
   `useCameraPreview` is merged into it.
5. **Video is made on the server.** A Frame's clips, trim, filter and painted layer are joined by the
   server with FFmpeg, as story videos already are. The device stops re-encoding with ffmpeg.wasm.
6. **Posts keep a caption screen.** It comes after the editor, as on Instagram. Caption, people,
   place, music, audience and advanced settings live there. A Story shares from the editor, as today.

ADR-0017's shells are unchanged. Mobile First at 390×844 stays a hard constraint. Every control is
44 px or larger and has a name for screen readers.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep ADR-0018 (stepped Post and Frame in a card) | Two editing regimes. Posts and Frames would keep slider editing and a 4:5 preview that ignores the crop. The owner chose one canvas. |
| One generic editor component with a mode switch inside | It mixes the rules of four formats in one module. Shared modules plus a shell per format keep each one small and testable. |
| Keep ffmpeg.wasm for Frames | Heavy on phones, and a second video path besides the story join on the server. |

## Consequences

- **Data and API.** Each change comes with its own confirmation:
  - a shape on `Post` and sizes on `PostMedia` (PD-049);
  - Frames of up to 180 s (PD-050);
  - an audience on `LiveStream` (PD-051);
  - a Frame create that accepts clips and a painted layer.
- **Order.** The work goes in phases behind browser tests of today's flows, so nothing that works
  today is lost. `ContentComposerPage` and `components/create-post/` are replaced step by step, never
  in one change.
- **Tests.** The composer smoke and visual tests move to the new screens as each phase lands.

## Implementation anchors

- `circlesfera-frontend/src/components/story/` — capture, editor shell, gestures, text, stickers,
  brushes
- `circlesfera-frontend/src/components/ContentComposerPage.tsx`, `components/create-post/` — the
  stepped path being replaced
- `circlesfera-frontend/src/pages/Live/LiveBroadcaster.tsx`, `components/live/LiveCameraPreview.tsx`
  — live setup
- `circlesfera-backend/src/uploads/processors/video.processor.ts` — server-side video join
- Notion → Execution → Implementation Backlog: the story, post, frame and live creation redesigns

## Revisiting

Revisit if measured completion of post creation drops after the change, or if a format needs editing
the shared shell cannot express.
