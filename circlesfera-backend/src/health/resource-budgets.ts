/**
 * The ALERT thresholds of ADR-0024 for the resources the health check
 * watches: the health check fails past them, and the Operations alert job
 * tells the team when one is crossed between deploys.
 */

/** The filesystem the disk budget is measured on. */
export const DISK_BUDGET_PATH = '/';

/** Share of the disk in use past which the disk is out of budget. */
export const DISK_ALERT_RATIO = 0.9;

/** The Node process heap in use past which it is out of budget (1 GB). */
export const HEAP_ALERT_BYTES = 1024 * 1024 * 1024;

/** The Node process resident memory past which it is out of budget (1 GB). */
export const RSS_ALERT_BYTES = 1024 * 1024 * 1024;
