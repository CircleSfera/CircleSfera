import { apiClient } from './api';

export type BusinessStatKind =
  | 'visit'
  | 'email'
  | 'call'
  | 'address'
  | 'website';

export interface BusinessStatTotals {
  visits: number;
  emailTaps: number;
  callTaps: number;
  addressTaps: number;
  websiteTaps: number;
}

export interface BusinessStats {
  days: number;
  totals: BusinessStatTotals;
  daily: ({ day: string } & BusinessStatTotals)[];
  countries: { country: string; visits: number }[];
  otherCountriesVisits: number;
  /** Views of the Profile's posts by UTC hour, over the last 28 days. */
  viewsByHour: number[];
}

export const businessStatsApi = {
  /** Counts a visit or a tap; nothing is said back, and a failure is ignored. */
  record: (profileId: string, kind: BusinessStatKind) =>
    apiClient
      .post(`business-stats/${profileId}/events`, { kind })
      .then(() => undefined)
      .catch(() => undefined),

  read: (days: number) =>
    apiClient
      .get<BusinessStats>('business-stats', { params: { days } })
      .then((r) => r.data),
};

// The visits already sent in this tab: the server counts a person once a
// day anyway, this only spares asking again on every render.
const visited = new Set<string>();

/** Counts a visit to a Business Profile, once per tab. */
export function recordBusinessVisit(profileId: string) {
  if (visited.has(profileId)) return;
  visited.add(profileId);
  void businessStatsApi.record(profileId, 'visit');
}
