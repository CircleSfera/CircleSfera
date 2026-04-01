# Feature: Social Core (Absolute Detail)

This document specifies the business rules and technical logic governing content and social interaction on CircleSfera.

## 1. Post Permissions & Visibility

| Visibility | Description | Access Rules |
| :--- | :--- | :--- |
| `PUBLIC` | Open content. | Accessible by any user or guest. |
| `FOLLOWERS`| Private content. | Accessible only if a `Follow` record exists where `followingId` = Author. |
| `PRIVATE` | Personal archive. | Accessible **only** by the author. |

### Pay-Per-View (PPV) Logic
If a post has `isPaid: true`:
1.  **Check Order**: Verification service checks if the requesting user has a `SUCCEEDED` order for this specific `postId`.
2.  **Bypass**: The author of the post always has full access.
3.  **Delivery**: The frontend receives a `mediaBlurred` flag if the order is not present, preventing asset leakage.

## 2. Story Lifecycle Mechanics
- **Exclusion**: Stories are automatically excluded from API responses once `expiresAt < now()`.
- **Aggregation**: Stories from all followed users are aggregated and sorted by the most recent active story first.
- **Views**: A unique view is counted once per user per story. Repeating views by the same user do not increment the `views` counter.

## 3. Comment Threading & Engagement
- **Depth**: The platform supports up to 2 levels of nesting (Comment -> Reply). Further replies are flattened under the parent reply.
- **Sorting**: Comments are sorted by `createdAt` in descending order by default.
- **Likes**: Liking a comment utilizes the same `Like` model but with `targetType: "COMMENT"`.

## 4. Follow System & Private Accounts
- **Auto-Follow**: Accounts with `isPrivate: false` automatically accept follow requests.
- **Approval Flow**: If `isPrivate: true`, a follow request creates a `PENDING` status (managed via `FollowRequest` model) until the target user approves.

## 5. Algorithmic Ranking Factors
Content shown in the "Discovery" and "Frames" feeds is ranked based on:
- **Recency (40%)**: Time since upload.
- **Engagement Density (30%)**: Likes and comments relative to view count.
- **Credibility (30%)**: Author's `verificationLevel` weight (Elite > Business > Verified > Basic).
