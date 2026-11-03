/**
 * How the nightly sweep deletes the stored files no row uses. Shared with the
 * read-only report, so it counts what the sweep would delete.
 */

/**
 * A file used by no row is deleted only after this long on the disk: an
 * upload in progress, a draft being written or a job still working on it
 * names it well before then.
 */
export const ORPHAN_GRACE_HOURS = 7 * 24;

/**
 * The most files one night deletes, the oldest first. What is left waits for
 * the next night, so a mistake costs at most this many files.
 */
export const ORPHAN_DELETIONS_PER_NIGHT = 300;

/**
 * Past this share of the recent files on the disk, the sweep deletes
 * nothing: so many unused files means the references were misread, not that
 * they are waste. The owner looks before anything goes.
 */
export const ORPHAN_MAX_SHARE = 0.5;

/**
 * How far back the share is measured, in days. A misread shows in what was
 * stored lately; files left over from long ago do not hold the sweep back.
 */
export const ORPHAN_SHARE_WINDOW_DAYS = 90;
