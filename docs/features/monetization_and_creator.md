# Feature: Monetization & Creator Tools (Absolute Detail)

This document provides a technical and financial breakdown of the monetization engine in CircleSfera.

## 1. Stripe Connect Modes
- **Standard Accounts**: For individual creators. They maintain full control over their Stripe dashboard.
- **Express Accounts**: For platform-managed payments. CircleSfera handles the payout scheduling.

## 2. Order Processing Logic

### PPV Purchase Flow
1.  **Creation**: A pending `Order` is created with a `PLATFORM_OWNED` status.
2.  **Payment Intent**: Stripe returns a `pi_...` ID.
3.  **Completion**: Upon webhook confirmation:
    - Order status moves to `SUCCEEDED`.
    - Access is granted to the buyer.
    - Funds are split between the **Creator** and the **Platform**.

### Earnings Calculation
- **Gross Amount**: The price set by the creator.
- **Platform Fee**: Calculated via `Gross * STRIPE_PLATFORM_FEE`.
- **Creator Net**: `Gross - Platform Fee - Stripe Processing Fees`.

## 3. Creator Payouts
- **Thresholds**: Minimum payout amount is $1.00 USD.
- **Schedule**: Handled according to the Stripe Connect configuration (Daily/Weekly/Monthly).
- **Tax Documentation**: Standard tax forms (e.g., 1099-K) are issued by Stripe once the IRS threshold is met.

## 4. Promotion & Boosting
Creators can pay to "Boost" their content.
- **Mechanism**: Creates a `Promotion` record linked to a `Post`.
- **Impact**: The post is injected into the "Discovery" feed of users who do not follow the creator.
- **Reach Tracking**: Real-time tracking of impressions (`reach`) and clicks.

## 5. Security for Paid Content
- **Signed URLs**: All media for paid posts is served via Cloudinary **Signed URLs** with a short TTL (5 minutes) to prevent URL sharing.
- **Anti-Scraping**: High-frequency requests for paid content are flagged by the Rate Limiter.
