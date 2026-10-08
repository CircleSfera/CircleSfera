/**
 * The shared look of everything that creates content: posts, frames,
 * stories, the editors and the live.
 *
 * - The content is the protagonist; controls float over it as dark glass.
 * - The purple to blue gradient is kept for the one main action of a screen.
 * - Coral is for what is destructive or on air.
 * - Actions are pills, panels have a 24 px radius, tiles and fields 16 px.
 * - Text is never under 12 px; controls are 44 px, main actions 48 px.
 *
 * Every value comes from the design tokens in `index.css`.
 */

const focus =
  'outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50';

/** The one main action of a screen. */
export const CREATE_PRIMARY = `min-h-12 px-6 inline-flex items-center justify-center gap-2 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white text-sm font-bold shadow-lg shadow-brand-primary/25 active:scale-[0.98] transition-transform disabled:opacity-40 ${focus}`;

/** Any other action next to it. */
export const CREATE_SECONDARY = `min-h-12 px-6 inline-flex items-center justify-center gap-2 rounded-full bg-white/8 border border-white/10 text-white text-sm font-semibold hover:bg-white/12 active:scale-[0.98] transition-all ${focus}`;

/** A round control floating over the content. */
export const CREATE_GLASS_ICON = `w-11 h-11 inline-flex items-center justify-center rounded-full bg-black/55 backdrop-blur-md border border-white/12 text-white shadow-lg active:scale-95 transition-transform ${focus}`;

/** A small label floating over the content. */
export const CREATE_GLASS_CHIP =
  'min-h-7 px-2.5 inline-flex items-center rounded-full bg-black/55 backdrop-blur-md border border-white/12 text-xs font-semibold text-white/85';

/** A panel that groups controls. */
export const CREATE_PANEL = 'rounded-3xl bg-white/4 border border-white/8';

/** One tool of a tool rail: an icon over its name. */
export const CREATE_TOOL = `flex-1 min-w-0 min-h-14 flex flex-col items-center justify-center gap-1 rounded-2xl text-white/75 hover:text-white hover:bg-white/8 active:scale-[0.97] transition-all text-xs font-semibold ${focus}`;

/**
 * A small preview: a thumbnail of the edit step, the preview of the alt text
 * screen, a filter, a story background or a template. One size and shape
 * everywhere: 56 px high, at least 44 px wide, in the shape of the format,
 * with 12 px corners.
 */
export const CREATE_THUMB =
  'h-14 w-auto min-w-11 shrink-0 rounded-md overflow-hidden border-2';

/** The shape of a small preview for what is being created. */
export const createThumbRatio = (mode: 'POST' | 'FRAME' | 'STORY') =>
  mode === 'POST' ? '4 / 5' : '9 / 16';

/**
 * A full-window editor (photo editor, frame trim, story composer). On a phone
 * it takes the whole screen in black. From tablet width it starts where the
 * sidebar ends, so the navigation stays in view, and it shows the app
 * background (see `BrandAmbientBackground` with `placement="editor"`).
 */
export const CREATE_FULL_SCREEN =
  'beside-sidebar fixed inset-0 z-50 overflow-hidden bg-black';
