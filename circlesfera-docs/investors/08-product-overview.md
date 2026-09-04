# CircleSfera
## Product overview

**Your World, Connected.**  
August 2026

---

## Summary

CircleSfera is a multi-format social platform in production. Public users: none. This document inventories what ships today and what this raise finishes. Present tense means shipped. "In development" means not yet available to the public.

---

## Social and content (shipped)

| Surface | Description |
| --- | --- |
| Posts | Permanent feed content with media, polls, Q&A |
| Frames | Short-form video |
| Stories | Ephemeral content with highlights for persistence |
| Collections | Saved posts |
| Profiles | Public social identity separate from account credentials |
| Follow / block / mute | Explicit social graph controls |
| Comments and reactions | On posts and Frames |
| Search and discovery | Hybrid home feed |
| Feed preferences | Hide post, hide author, mute keyword — persisted server-side |
| Share previews | Open Graph images for external sharing |

**Principle mapping:** User control (feed preferences, follow/mute); algorithmic transparency (declared feed signals).

---

## Creation (shipped)

| Surface | Description |
| --- | --- |
| Composer | Create posts, Frames, and stories |
| Editing studio | In-browser timeline, export, captions |
| Live streaming | Real-time video with LiveKit |
| Live gifts | Server-priced catalog; billed through Stripe; 20% platform fee |

**In development:** Next creation surfaces beyond composer and studio — part of this raise. Do not treat unannounced formats as committed.

**Principle mapping:** User-centric design; continuous innovation (company value).

---

## Messaging (shipped)

| Surface | Description |
| --- | --- |
| Private chat | Conversations and messages |
| Encryption | Messages encrypted at rest; key rotation supported |
| Calls | WebRTC signaling |

**Principle mapping:** Responsible data handling.

---

## Monetization (shipped)

| Line | Description |
| --- | --- |
| Platform plans | €9.99 / €19.99 / €49.99 per month; one active plan per user |
| Creator VIP | Creator subscription; price set server-side |
| Pay-per-view | Unlock post, story, or message |
| Tips | Direct payment to creator |
| Live gifts | During live stream; prices server-side |
| Promotions | Creator pays for feed injection; pause, cancel, proportional refund |
| Stripe Connect | Express accounts; 80% creator / 20% platform on commerce |
| Identity gate | KYC required before creator commerce |

Payouts: creators use the Stripe Express dashboard. No in-app withdraw.

**Principle mapping:** No dark-pattern monetizer (published fee; server-side amounts); trust by design (identity before money).

---

## Trust and safety (shipped)

| Surface | Description |
| --- | --- |
| Reporting | Users can report content and accounts |
| Moderation | Warn, suspend, restore; author notification where appropriate |
| Appeals | User-facing appeals in Settings |
| Admin Panel | Separate host, separate identities, MFA mandatory |
| Anti-shadowban | Policy label in moderation flows; no silent reach reduction |
| Age gate | 16+ on registration, client and server |
| GDPR | Data export; account deletion with grace period |
| Cookie consent | Telemetry gated |

**Principle mapping:** Strict and explicit moderation; no hidden suppression; responsible data handling.

---

## Authentication (shipped)

| Surface | Description |
| --- | --- |
| Email and password | With email verification gate |
| Passkeys | WebAuthn support |
| Session | HttpOnly cookies with CSRF protection |
| Device signals | Hashed clustering for abuse detection; trust score does not cut reach |

**Principle mapping:** Trust by design; plan badge ≠ identity verification.

---

## Client (shipped)

| Surface | Description |
| --- | --- |
| Web SPA | React application |
| PWA | Installable; offline-capable shell |
| Languages | English and Spanish |
| Mobile-first density | Designed for phone viewport first |

---

## Growth rails (shipped)

| Surface | Description |
| --- | --- |
| Registration gate | Configurable open/closed registration |
| Invite codes | Optional require-invite mode |
| Invites per account | Three invites |
| Whitelist | Email list (not the register gate) |

---

## In development (this raise)

| Workstream | Status |
| --- | --- |
| Native iOS and Android | Shells exist; not in app stores |
| Promotions at scale | Billing and feed injection ship; volume, pacing, warehouse reporting open |
| ClickHouse Cloud | Nightly export job ships; Cloud service and Grafana not provisioned |
| Next creation tools | Raise work on top of composer and studio |

---

## Out of scope (not in this raise)

Communities / forums · B2B Business Manager · public OAuth / third-party developer platform · SSR indexable profiles · subscriber badges as a product surface · SOC2 certification · public bug bounty program.

---

## Infrastructure today

Production runs on an OVH VPS with Docker Compose and continuous deployment. Adequate for early use; scaling architecture is future work.

CircleSfera  
Your World, Connected.
