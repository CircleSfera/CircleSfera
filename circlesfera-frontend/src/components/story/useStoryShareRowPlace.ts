import { type RefObject, useLayoutEffect, useState } from 'react';
import {
  type StoryShareRowPlace,
  storyShareRowFitsBand,
} from './storyComposer.layout';

/**
 * Where the share row goes at rest: in the band under the story when that
 * band, without the bottom safe area, has room for it, and over the bottom of
 * the story when it has not. The band is measured as the screen changes, as
 * when the browser's toolbars come and go.
 */
export function useStoryShareRowPlace(
  bandRef: RefObject<HTMLElement | null>,
  panelOpen: boolean,
): StoryShareRowPlace {
  const [fits, setFits] = useState(false);

  useLayoutEffect(() => {
    const band = bandRef.current;
    if (panelOpen || !band) return;
    const measure = () => {
      const safeBottom =
        Number.parseFloat(getComputedStyle(band).paddingBottom) || 0;
      setFits(storyShareRowFitsBand(band.clientHeight - safeBottom));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(band);
    return () => observer.disconnect();
  }, [bandRef, panelOpen]);

  if (panelOpen) return 'panel';
  return fits ? 'band' : 'over';
}
