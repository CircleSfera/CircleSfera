/** How often the app asks whether its Frame is put together. */
export const FRAME_ASSEMBLY_POLL_MS = 2000;

/**
 * How long the app waits for its Frame: the server may take up to ten
 * minutes for one try, and tries twice.
 */
export const FRAME_ASSEMBLY_WAIT_MS = 21 * 60 * 1000;
