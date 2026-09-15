# 03 — API route catalog (generated)

> **Generated:** 2026-09-15 by `scripts/generate-api-inventory.mjs`.
> **Do not edit by hand.** Re-run `npm run docs:api-inventory`.
> Controllers under `circlesfera-backend/src/**/*.controller.ts` are the source of truth.
> Paths are relative to the global prefix `api/v1`.

Controllers scanned: **53**. Sections with routes: **52**.

### `(root)`

Source: `app.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/` |
| GET | `/csrf-token` |

### `(root)`

Source: `seo/seo.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/sitemap.xml` |
| GET | `/robots.txt` |
| GET | `/og` |
| GET | `/og-image/post/:id` |
| GET | `/og-image/profile/:username` |

### `/.well-known`

Source: `well-known/well-known.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/.well-known/apple-app-site-association` |
| GET | `/.well-known/assetlinks.json` |

### `/2fa`

Source: `auth/two-factor/two-factor.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/2fa/generate` |
| POST | `/2fa/turn-on` |
| POST | `/2fa/turn-off` |

### `/admin`

Source: `admin/admin-content.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/admin/posts/export` |
| GET | `/admin/posts` |
| DELETE | `/admin/posts/:id` |
| GET | `/admin/reports` |
| PATCH | `/admin/reports/:id` |
| POST | `/admin/reports/:id/claim` |
| POST | `/admin/reports/:id/unclaim` |
| POST | `/admin/reports/:id/reassign` |
| POST | `/admin/reports/:id/resolve-penalty` |
| POST | `/admin/reports/bulk` |
| GET | `/admin/hashtags` |
| GET | `/admin/comments` |
| DELETE | `/admin/comments/:id` |
| GET | `/admin/stories` |
| DELETE | `/admin/stories/:id` |
| GET | `/admin/promotions` |
| PATCH | `/admin/promotions/:id` |
| GET | `/admin/moderation/queue` |
| PATCH | `/admin/moderation/:type/:id` |
| GET | `/admin/trust/queue` |
| GET | `/admin/live` |
| POST | `/admin/live/:id/end` |

### `/admin`

Source: `admin/admin-media.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/admin/audio` |
| POST | `/admin/audio` |
| PATCH | `/admin/audio/:id` |
| DELETE | `/admin/audio/:id` |

### `/admin`

Source: `admin/admin-ops.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/admin/firewall` |
| POST | `/admin/firewall` |
| DELETE | `/admin/firewall/:id` |
| GET | `/admin/experiments/users` |
| POST | `/admin/experiments/users` |
| DELETE | `/admin/experiments/users/:id` |
| GET | `/admin/support/tickets` |
| PATCH | `/admin/support/tickets/:id` |
| GET | `/admin/feature-flags` |
| PUT | `/admin/feature-flags/:key` |
| DELETE | `/admin/feature-flags/:key` |
| GET | `/admin/webhooks` |
| GET | `/admin/webhooks/:id` |
| POST | `/admin/webhooks/:id/replay` |

### `/admin`

Source: `admin/admin-stats.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/admin/stats/enhanced` |
| GET | `/admin/audit-logs` |
| GET | `/admin/stats/activity-chart` |
| GET | `/admin/stats/top-users` |
| GET | `/admin/analytics/monetization` |
| GET | `/admin/payouts/stats` |
| GET | `/admin/payouts` |
| GET | `/admin/transactions` |

### `/admin`

Source: `admin/admin-system.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/admin/stats` |
| GET | `/admin/health` |
| GET | `/admin/firewall/rules` |
| POST | `/admin/firewall/rules` |
| PATCH | `/admin/firewall/rules/:id` |
| DELETE | `/admin/firewall/rules/:id` |
| GET | `/admin/settings` |
| PATCH | `/admin/settings` |

### `/admin`

Source: `admin/admin-users.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/admin/broadcast` |
| GET | `/admin/users/export` |
| GET | `/admin/users` |
| GET | `/admin/users/kyc/stats` |
| PATCH | `/admin/users/:id/ban` |
| PATCH | `/admin/users/:id/unban` |
| PATCH | `/admin/users/:id/role` |
| PATCH | `/admin/users/:id/status` |
| POST | `/admin/users/:id/revoke-kyc` |
| POST | `/admin/users/:id/sync-kyc` |
| DELETE | `/admin/users/:id` |
| GET | `/admin/whitelist` |
| POST | `/admin/whitelist` |
| PATCH | `/admin/whitelist/:id` |
| DELETE | `/admin/whitelist/:id` |
| PATCH | `/admin/users/:id/warn` |
| PATCH | `/admin/users/:id/suspend` |
| PATCH | `/admin/users/:id/restore` |
| GET | `/admin/users/:id/detail` |
| GET | `/admin/users/:id/linked-accounts` |
| GET | `/admin/users/:id/trust-score` |
| POST | `/admin/users/:id/bot-label` |
| DELETE | `/admin/users/:id/bot-label` |
| GET | `/admin/trust/funnel` |

### `/admin-auth`

Source: `admin-auth/admin-auth.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/admin-auth/login` |
| POST | `/admin-auth/mfa/verify` |
| POST | `/admin-auth/refresh` |
| POST | `/admin-auth/logout` |
| GET | `/admin-auth/me` |
| GET | `/admin-auth/sessions` |
| DELETE | `/admin-auth/sessions/:id` |
| POST | `/admin-auth/step-up` |

### `/admin/operators`

Source: `admin/admin-operators.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/admin/operators/roles` |
| GET | `/admin/operators` |
| GET | `/admin/operators/:id` |
| POST | `/admin/operators` |
| PATCH | `/admin/operators/:id/status` |
| PUT | `/admin/operators/:id/roles` |
| POST | `/admin/operators/:id/reset-mfa` |
| POST | `/admin/operators/:id/reset-password` |

### `/ai`

Source: `ai/ai.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/ai/alt-text` |

### `/analytics`

Source: `analytics/analytics.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/analytics/events` |
| GET | `/analytics/dashboard` |
| POST | `/analytics/post/:id/view` |
| POST | `/analytics/post/:id/loop` |
| POST | `/analytics/post/:id/watch` |
| GET | `/analytics/post/:id/insights` |
| POST | `/analytics/debug/aggregate` |

### `/appeals`

Source: `appeals/appeals.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/appeals` |
| GET | `/appeals/my-appeals` |
| GET | `/appeals/admin` |
| PATCH | `/appeals/admin/:id` |

### `/audio`

Source: `audio/audio.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/audio` |
| GET | `/audio` |
| GET | `/audio/search` |
| GET | `/audio/trending` |
| GET | `/audio/:id` |
| GET | `/audio/:id/posts` |

### `/auth`

Source: `auth/auth.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/auth/register` |
| POST | `/auth/login` |
| POST | `/auth/refresh` |
| POST | `/auth/logout` |
| POST | `/auth/verify-email` |
| POST | `/auth/resend-verification` |
| POST | `/auth/request-reset` |
| POST | `/auth/reset-password` |
| GET | `/auth/sessions` |
| DELETE | `/auth/sessions/other` |
| DELETE | `/auth/sessions/:id` |

### `/auth/passkey`

Source: `auth/passkey/passkey.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/auth/passkey` |
| POST | `/auth/passkey/register-options` |
| POST | `/auth/passkey/register-verify` |
| POST | `/auth/passkey/login-options` |
| POST | `/auth/passkey/login-verify` |
| DELETE | `/auth/passkey/:id` |

### `/bookmarks`

Source: `bookmarks/bookmarks.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/bookmarks/:postId` |
| PATCH | `/bookmarks/:postId/collection` |
| GET | `/bookmarks` |
| GET | `/bookmarks/:postId/check` |

### `/chat`

Source: `chat/chat.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/chat/conversations` |
| GET | `/chat/conversations/unread-count` |
| GET | `/chat/conversations/:id/messages` |
| POST | `/chat/conversations` |
| POST | `/chat/messages` |
| PUT | `/chat/conversations/:id/read` |
| DELETE | `/chat/conversations/:id` |
| PUT | `/chat/conversations/:id/group` |
| DELETE | `/chat/conversations/:id/participants/:profileId` |
| DELETE | `/chat/conversations/:id/leave` |
| PUT | `/chat/messages/:id` |
| DELETE | `/chat/messages/:id` |

### `/close-friends`

Source: `close-friends/close-friends.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/close-friends` |
| POST | `/close-friends/:friendId` |

### `/collections`

Source: `collections/collections.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/collections` |
| GET | `/collections` |
| GET | `/collections/:id` |
| PATCH | `/collections/:id` |
| DELETE | `/collections/:id` |

### `/creator`

Source: `creator/creator.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/creator/stats` |
| GET | `/creator/activity-chart` |
| GET | `/creator/posts` |
| GET | `/creator/stories` |
| GET | `/creator/promotions` |
| POST | `/creator/promotions` |
| POST | `/creator/promotions/:id/view` |
| DELETE | `/creator/promotions/:id` |
| POST | `/creator/promotions/:id/pause` |
| POST | `/creator/promotions/:id/resume` |
| POST | `/creator/promotions/:id/click` |
| PATCH | `/creator/promotions/:id` |
| GET | `/creator/analytics/revenue` |
| GET | `/creator/analytics/retention` |
| GET | `/creator/analytics/top-posts` |
| GET | `/creator/analytics/export` |

### `/csrf-token`

Source: `common/csrf/csrf.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/csrf-token` |

### `/edits`

Source: `edits/edits.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/edits` |
| GET | `/edits` |
| POST | `/edits/:id/captions` |
| GET | `/edits/:id/captions/:jobId` |
| GET | `/edits/:id` |
| PUT | `/edits/:id` |
| DELETE | `/edits/:id` |

### `/experiments`

Source: `experiments/experiments.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/experiments/my-flags` |

### `/feed`

Source: `feed/feed.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/feed/foryou` |
| GET | `/feed/following` |

### `/feed/preferences`

Source: `feed/feed-preferences.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/feed/preferences` |
| POST | `/feed/preferences/hide-post/:postId` |
| DELETE | `/feed/preferences/hide-post/:postId` |
| POST | `/feed/preferences/hide-author/:authorId` |
| DELETE | `/feed/preferences/hide-author/:authorId` |
| POST | `/feed/preferences/mute-keyword` |
| DELETE | `/feed/preferences/mute-keyword/:keyword` |

### `/health`

Source: `health/health.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/health` |

### `/highlights`

Source: `highlights/highlights.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/highlights` |
| PATCH | `/highlights/:id` |
| GET | `/highlights/profile/:profileId` |
| GET | `/highlights/user/:profileId` |
| GET | `/highlights/:id` |
| DELETE | `/highlights/:id` |

### `/interactive`

Source: `interactive/interactive.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/interactive/poll` |
| GET | `/interactive/poll/:id` |
| POST | `/interactive/poll/vote` |
| POST | `/interactive/qna` |
| GET | `/interactive/qna/:id` |
| POST | `/interactive/qna/answer` |

### `/live`

Source: `live/live.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/live/start` |
| POST | `/live/end` |
| GET | `/live/active` |
| GET | `/live/:streamId` |
| GET | `/live/join/:streamId` |
| POST | `/live/:streamId/cohost/invite` |
| POST | `/live/:streamId/cohost/accept` |
| DELETE | `/live/:streamId/cohost` |
| POST | `/live/:streamId/gift` |

### `/media`

Source: `media/media.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/media/auth-check` |
| GET | `/media/teaser/:mediaId/*file` |

### `/monetization`

Source: `monetization/monetization.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/monetization` |
| GET | `/monetization/transactions` |
| GET | `/monetization/status` |
| POST | `/monetization/connect` |
| POST | `/monetization/tip` |
| POST | `/monetization/unlock` |
| POST | `/monetization/unlock-story` |
| POST | `/monetization/unlock-message` |
| GET | `/monetization/dashboard` |
| GET | `/monetization/payouts` |
| GET | `/monetization/analytics/income` |
| GET | `/monetization/analytics/summary` |

### `/notifications`

Source: `notifications/notifications.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/notifications` |
| GET | `/notifications/unread-count` |
| PUT | `/notifications/:id/read` |
| PUT | `/notifications/read-all` |

### `/payments`

Source: `payments/payments.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/payments/plans` |
| POST | `/payments/checkout` |
| GET | `/payments/portal` |
| GET | `/payments/status` |
| GET | `/payments/ledger` |
| GET | `/payments/admin/ledger` |
| POST | `/payments/webhook` |

### `/places`

Source: `places/places.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/places/map` |
| GET | `/places/:id` |
| GET | `/places/:id/posts` |

### `/posts`

Source: `posts/posts.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/posts` |
| GET | `/posts` |
| GET | `/posts/frames` |
| GET | `/posts/user/:username` |
| GET | `/posts/user/:username/tagged` |
| GET | `/posts/tags/:tag` |
| GET | `/posts/:id` |
| PUT | `/posts/:id` |
| DELETE | `/posts/:id` |
| DELETE | `/posts/:id/admin` |

### `/posts/:postId/comments`

Source: `comments/comments.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/posts/:postId/comments` |
| GET | `/posts/:postId/comments` |
| DELETE | `/posts/:postId/comments/:id` |
| POST | `/posts/:postId/comments/:id/like` |
| DELETE | `/posts/:postId/comments/:id/like` |

### `/posts/:postId/likes`

Source: `likes/likes.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/posts/:postId/likes/toggle` |
| GET | `/posts/:postId/likes/check` |

### `/profiles`

Source: `profiles/profiles.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/profiles/search` |
| GET | `/profiles/me/referrals` |
| GET | `/profiles/me` |
| GET | `/profiles/check-username/:username` |
| GET | `/profiles/:username` |
| PUT | `/profiles/me` |
| POST | `/profiles/me/deactivate` |
| DELETE | `/profiles/me` |

### `/push`

Source: `push/push.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/push/public-key` |
| POST | `/push/subscribe` |
| DELETE | `/push/unsubscribe` |

### `/reports`

Source: `reports/reports.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/reports` |
| GET | `/reports/me` |
| GET | `/reports` |
| PATCH | `/reports/:id` |

### `/search`

Source: `search/search.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/search` |
| GET | `/search/trending` |
| GET | `/search/posts` |
| GET | `/search/ai` |
| GET | `/search/ai/profiles` |
| GET | `/search/users` |
| GET | `/search/history` |
| DELETE | `/search/history` |

### `/slack`

Source: `slack/slack.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/slack/commands` |
| POST | `/slack/interactions` |

### `/stories`

Source: `stories/stories.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/stories` |
| GET | `/stories` |
| GET | `/stories/user/:username` |
| GET | `/stories/archive` |
| DELETE | `/stories/:id` |
| POST | `/stories/:id/view` |
| GET | `/stories/:id/views` |
| POST | `/stories/:id/react` |
| GET | `/stories/:id/reactions` |

### `/support`

Source: `support/support.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/support/tickets` |

### `/uploads`

Source: `uploads/uploads.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/uploads` |

### `/users`

Source: `follows/follows.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/users/:username/follow/toggle` |
| GET | `/users/:username/follow/check` |
| GET | `/users/:username/follow/followers` |
| GET | `/users/:username/follow/following` |
| POST | `/users/:username/follow/block` |
| POST | `/users/:username/follow/unblock` |
| POST | `/users/:username/follow/mute` |
| POST | `/users/:username/follow/unmute` |
| GET | `/users/me/follow/muted` |
| GET | `/users/me/follow/blocked` |
| GET | `/users/me/follow/pending` |
| POST | `/users/:username/follow/accept` |
| POST | `/users/:username/follow/reject` |

### `/users`

Source: `users/users.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/users/suggestions` |
| PATCH | `/users/:id/ban` |
| PATCH | `/users/:id/unban` |
| GET | `/users/gdpr/export` |
| GET | `/users/gdpr/exports` |
| GET | `/users/gdpr/exports/:id/download` |
| DELETE | `/users/gdpr/account` |
| DELETE | `/users/me` |
| POST | `/users/me/restore` |
| GET | `/users/me/settings` |
| PUT | `/users/me/settings` |
| POST | `/users/identity-session` |
| POST | `/users/identity-session/sync` |

### `/webrtc`

Source: `webrtc/webrtc.controller.ts`

| Method | Path |
| --- | --- |
| GET | `/webrtc/ice-servers` |

### `/whitelist`

Source: `whitelist/whitelist.controller.ts`

| Method | Path |
| --- | --- |
| POST | `/whitelist/signup` |

---

**Total routes emitted:** 331

