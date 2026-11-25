import { apiClient } from './api';

export type FoundingCreatorStatus = 'PENDING' | 'APPROVED' | 'DECLINED';
export type FoundingCreatorDeclineReason =
  | 'LINKS_UNREACHABLE'
  | 'NOT_VIDEO_WORK'
  | 'OUTSIDE_LAUNCH_AREA'
  | 'PROGRAM_FULL'
  | 'OTHER';

// Where the free year of an approved application stands (BD-034): given,
// waiting for the identity to be verified, not given because the Profile
// holds a plan, or ready to start.
export type FreeYearState = 'STARTED' | 'NEEDS_IDENTITY' | 'HAS_PLAN' | 'READY';

export interface FoundingCreatorApplication {
  id: string;
  status: FoundingCreatorStatus;
  links: string[];
  city: string;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  declineReason: FoundingCreatorDeclineReason | null;
  declineNote: string | null;
  // False when the year ends at its end because no VAT can be worked out
  // for the person's address; null until it starts.
  freeYearTaxable: boolean | null;
  platformSubscription: {
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}

export interface FoundingCreatorView {
  isOwner: boolean;
  isCreator: boolean;
  identityVerified: boolean;
  application: FoundingCreatorApplication | null;
  freeYear: FreeYearState | null;
  // The day a year started now would end (READY only), for its terms.
  freeYearEndsAt: string | null;
}

export interface FoundingCreatorRequest {
  links: string[];
  city: string;
  note?: string;
}

const BASE = '/founding-creators';

// The founding creator application of the Creator Profile in use, by its
// owner.
export const foundingCreatorsApi = {
  async status(): Promise<FoundingCreatorView> {
    const { data } = await apiClient.get(BASE);
    return data;
  },
  async apply(request: FoundingCreatorRequest): Promise<FoundingCreatorView> {
    const { data } = await apiClient.post(BASE, request);
    return data;
  },
  // Starts the free year, the person accepting the terms shown with it.
  async startFreeYear(): Promise<FoundingCreatorView> {
    const { data } = await apiClient.post(`${BASE}/free-year`, {
      accept: true,
    });
    return data;
  },
};

// What staff see of an application in the Backoffice.
export interface StaffFoundingCreatorApplication {
  id: string;
  status: FoundingCreatorStatus;
  links: string[];
  city: string;
  note: string | null;
  createdAt: string;
  platformSubscriptionId: string | null;
  profile: {
    id: string;
    username: string;
    accountType: string;
    verificationLevel: string;
    user: { identityVerifiedAt: string | null } | null;
  };
}

export interface FoundingCreatorDecision {
  approve: boolean;
  reason?: FoundingCreatorDeclineReason;
  note?: string;
}

const STAFF = 'admin/founding-creators';

// Staff with the founding-creators permission, in the Backoffice.
export const foundingCreatorsStaffApi = {
  async queue(): Promise<{
    items: StaffFoundingCreatorApplication[];
    total: number;
  }> {
    const { data } = await apiClient.get(STAFF);
    return data;
  },
  // The decision. An approval gives nothing by itself: the person starts the
  // year from the app, accepting its terms.
  async decide(
    id: string,
    decision: FoundingCreatorDecision,
  ): Promise<StaffFoundingCreatorApplication> {
    const { data } = await apiClient.post(`${STAFF}/${id}/decision`, decision);
    return data;
  },
};
