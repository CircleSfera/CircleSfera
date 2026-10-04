// Price limits shown in the app. The backend enforces the same values
// (circlesfera-backend/src/common/constants/monetization.constants.ts);
// keep both in sync.

// Pay-per-view price for posts, stories and messages, in euros.
export const MIN_PPV_PRICE_EUR = 3;
export const MAX_PPV_PRICE_EUR = 500;

// Smallest tip, in euros (CircleSfera absorbs the Stripe fee).
export const MIN_TIP_EUR = 2;
