import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { reloadIfAppUpdated } from '../utils/appUpdates';

// Screens that open with what the last one handed over in memory (a video
// from Edits, a picture to start a story with): loading the page there would
// drop it, so the new version waits for the next screen.
const OPENS_WITH_HANDOVER = ['/create', '/edits'];

/**
 * A newer version that took over while the app was open is loaded when the
 * person moves to another screen: what they were doing on the last one is
 * already left behind, so nothing half done is lost.
 */
export function AppUpdateOnNavigation() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (OPENS_WITH_HANDOVER.includes(pathname)) return;
    reloadIfAppUpdated();
  }, [pathname]);
  return null;
}
