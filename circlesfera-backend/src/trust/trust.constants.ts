// Spam and bot protection policy (owner decision). The detector scores and
// proposes; staff decide. Per-Profile caps apply to everyone at all times.

export type LimitedAction = 'follow' | 'message_request' | 'comment';

export interface ActionWindow {
  name: string;
  seconds: number;
  // Cap for an established account; null = counted only, for the detector.
  limit: number | null;
}

// Fixed windows per Profile. Accounts younger than NEW_ACCOUNT_DAYS get half
// of each cap.
export const ACTION_WINDOWS: Record<LimitedAction, ActionWindow[]> = {
  follow: [
    { name: '10m', seconds: 600, limit: null },
    { name: '1h', seconds: 3600, limit: 120 },
    { name: '1d', seconds: 86_400, limit: 400 },
  ],
  message_request: [
    { name: '1h', seconds: 3600, limit: null },
    { name: '1d', seconds: 86_400, limit: 60 },
  ],
  comment: [
    { name: '10m', seconds: 600, limit: 60 },
    { name: '1d', seconds: 86_400, limit: 600 },
  ],
};

export const NEW_ACCOUNT_DAYS = 7;

// Daily caps while a Profile is under a protective restriction.
export const RESTRICTED_DAILY_LIMITS: Partial<Record<LimitedAction, number>> = {
  follow: 20,
  message_request: 5,
};

// Velocity that adds the velocity signal and triggers an evaluation.
export const VELOCITY_THRESHOLDS: Record<
  LimitedAction,
  { window: string; over: number }
> = {
  follow: { window: '10m', over: 40 },
  message_request: { window: '1h', over: 20 },
  comment: { window: '10m', over: 20 },
};

// Repeated text: only texts at least this long are fingerprinted.
export const MIN_FINGERPRINT_TEXT_LENGTH = 20;
export const SAME_TEXT_BY_PROFILE = 5; // within 24 h
export const SAME_TEXT_ACROSS_PROFILES = 3; // distinct Profiles within 1 h

// Scoring.
export const RISK_POINTS = {
  velocity: 25,
  repeatedText: 20,
  coordinatedText: 25,
  newAndHyperactive: 15,
  clusterSmall: 10, // 3–4 accounts share an IP or device
  clusterLarge: 20, // 5 or more
  followRatio: 15,
  reports: 15,
  identityVerified: -20,
} as const;

export const NEW_ACCOUNT_DAILY_WRITES = 100;
export const FOLLOW_RATIO_MIN_FOLLOWING = 500;
export const FOLLOW_RATIO_MAX = 0.05;
export const REPORTS_DISTINCT_REPORTERS = 3; // within 7 days
export const CLUSTER_SMALL = 3;
export const CLUSTER_LARGE = 5;

// A case opens at REVIEW_THRESHOLD; at RESTRICT_THRESHOLD the Profile gets
// the reduced caps until staff decide, for at most RESTRICTION_MAX_HOURS.
export const REVIEW_THRESHOLD = 50;
export const RESTRICT_THRESHOLD = 70;
export const RESTRICTION_MAX_HOURS = 72;
// A staff "restrict" decision keeps the reduced caps this long.
export const STAFF_RESTRICTION_DAYS = 7;
// A staff suspension from the review queue.
export const STAFF_SUSPENSION_DAYS = 7;

// Closed cases are deleted this long after they close.
export const CLOSED_CASE_RETENTION_DAYS = 365;

export interface RiskSignal {
  key: keyof typeof RISK_POINTS;
  points: number;
  // The measured value, for staff (counts and ratios only).
  value: number;
}

export function riskScore(signals: RiskSignal[]): number {
  const total = signals.reduce((sum, s) => sum + s.points, 0);
  return Math.max(0, Math.min(100, total));
}
