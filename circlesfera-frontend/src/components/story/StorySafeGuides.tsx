/** Consumption safe-zone guides — visible only while dragging a layer. */
export const STORY_SAFE_GUIDE_TOP_PCT = 14;
export const STORY_SAFE_GUIDE_BOTTOM_PCT = 20;

const GUIDE_LINE =
  'absolute inset-x-0 h-0.5 bg-[#ff00ea] shadow-[0_0_15px_rgba(255,0,234,0.8)]';

interface StorySafeGuidesProps {
  visible: boolean;
}

/** Top/bottom safe edges as hairlines (same language as center snap guides). */
export default function StorySafeGuides({ visible }: StorySafeGuidesProps) {
  if (!visible) return null;

  return (
    <div
      className="story-safe-guides absolute inset-0 z-[90] pointer-events-none transition-opacity duration-150"
      data-export-ignore="true"
      aria-hidden
    >
      <div
        className={GUIDE_LINE}
        style={{ top: `${STORY_SAFE_GUIDE_TOP_PCT}%` }}
      />
      <div
        className={GUIDE_LINE}
        style={{ bottom: `${STORY_SAFE_GUIDE_BOTTOM_PCT}%` }}
      />
    </div>
  );
}
