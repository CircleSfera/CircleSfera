# Master Plan and Global Roadmap: Strategy, Product, and Scalability

CircleSfera already has a solid social core (feed, profiles, posts, frames, stories, chat, payment integrations). This document serves as the project's **Master Plan**: a corporate-level blueprint detailing the multiplatform strategy, launch tactics, legal/financial operations, and technical evolution under the **Now / Next / Later** time frame.

*(For specific commercial details, refer to the Monetization Strategy in `10-roadmap-monetization.md`)*.

---

## 1. Multiplatform Strategy and Global Expansion

### 1.1 Multiplatform Support
*   **Initial Phase (Web-First / PWA):** Launch as a responsive Progressive Web App (PWA), iterating quickly without App Store blockers.
*   **Native Phase (App Stores):** Transition to native mobile apps (React Native / Swift / Kotlin) to capitalize on Native Push Notifications and biometric APIs (Passkeys integrated in the OS).

### 1.2 Internationalization (i18n)
*   **Multi-Language and Currency Support:** Dynamic frontend architecture; localized payments (natively supported via Stripe).
*   **Global Distribution (CDN):** Edge routing for low multimedia latency worldwide.

---

## 2. Go-To-Market (GTM) and Organic Growth

### 2.1 Staged Launch
*   **Private Alpha (Invite-Only):** Restricted access for seed creators. Focus on discovering bugs and generating FOMO.
*   **Public Beta (Referrals):** Controlled opening via a referral program (e.g., 3 invitations per user).
*   **General Availability (GA):** Full opening and mass marketing support.

### 2.2 SEO and Virality Strategy
*   **Indexable Profiles (SSR):** Server-side rendering so Google indexes creator profiles and their public posts.
*   **Dynamic Open Graph (OG):** Automatic generation of preview images (thumbnails with title and avatar) when a CircleSfera link is shared on Twitter, WhatsApp, or iMessage.

---

## 3. Privacy, Security (InfoSec), and Legal Compliance

### 3.1 Regulatory Compliance (GDPR / CCPA)
*   **Data Export (Portability):** Automated tool for users to download their full history.
*   **Right to Be Forgotten:** Workflow where "Soft delete" (`deletedAt`) becomes irreversible physical deletion after a legal period (e.g., 30 days).
*   **Consent Management:** Modular management of cookies and advertising tracking.

### 3.2 Advanced Security and Audits
*   **Penetration Testing:** Annual engagement of external agencies (Red Teams) to audit security.
*   **Bug Bounty Program:** Rewards for ethical hackers who report vulnerabilities.
*   **SOC2 Certification:** Preparing the platform for SOC2 Type II compliance, a requirement for corporate B2B expansion (Phase 6).

---

## 4. Operations, Support, and Technical Finance (FinOps)

### 4.1 Universal Accessibility (a11y) and Support
*   **WCAG 2.1 Compliance:** Native support for screen readers, high contrast, and reduced motion for sensitive users.
*   **Tiered Customer Support:** Ticketing integration (e.g., Zendesk) with priority SLAs for high-MRR creators or brand accounts.

### 4.2 FinOps and Infrastructure Efficiency
*   **Storage Lifecycle (Cold Storage):** Automatic policies to move old or low-engagement videos (e.g., +90 days) to economical storage (AWS Glacier) to save costs.
*   **Cost Management:** Cloud billing alarms and DB usage quotas to prevent inefficient code from spiking the bill.

---

## 5. Data, BI, and Experimentation Infrastructure

*   **Data Warehouse and ETL:** Periodic migration of PostgreSQL data to an analytical environment (ClickHouse/BigQuery) without impacting transactional performance.
*   **Internal BI Dashboards:** Tools for leadership measuring LTV (Life-Time Value), CAC, MRR, and retention cohorts.
*   **A/B Testing and Feature Flags:** Infrastructure to turn features on/off (e.g., the feed algorithm) for 20% of users without redeploying code, minimizing risk.

---

## 6. Phase Map (Horizons) and Success Metrics

### Phase 1: Social Core Consolidation and Identity
*Horizon: **NOW** (In progress / Short Term)*

**Key Features:**
*   Identity (Passkeys), Multiformat (Posts/Stories/Frames), and Interaction (1-to-1 Chat, `lastReadAt`, `Bookmarks`).
**Success Metrics (KPIs):**
*   Uptime > 99.9%, latency (p95) < 200ms. Sustained DAU/MAU.

### Phase 2: Discovery Engine, Ranking, and Analytics
*Horizon: **NEXT** (Medium Term)*

**Key Features:**
*   Vector search (`pgvector`), Telemetry batching (`dwell_time`), Analytics on BullMQ, and A/B testing of the new feed.
**Success Metrics (KPIs):**
*   Increase in time on screen (Dwell Time) and conversions in the `Explore` tab.

### Phase 3: Creator Economy and Platform
*Horizon: **NEXT** (Medium Term)*

**Key Features:**
*   Stripe Connect integration, Subscriptions (Tiers), Pay-Per-View (PPV), and Creator Dashboard.
**Success Metrics (KPIs):**
*   Global MRR, free-to-paid conversion %, and controlled chargeback rate (< 1%).

### Phase 4: Trust & Safety, Moderation, and Operations
*Horizon: **LATER** (Long Term)*

**Key Features:**
*   Moderation queues, persisted Appeals, Account Center, and automated Hard Deletes.
**Success Metrics (KPIs):**
*   Mean Time to Resolution (MTTR) of support tickets and spam reduction.

### Phase 5: Scale and Media Infrastructure
*Horizon: **Continuous / Cross-cutting***

**Key Architecture:**
*   Asynchronous HLS transcoding, Redis Pub/Sub for chat, and Feed Fan-out on write ("Thundering Herd" mitigation).
**Success Metrics (KPIs):**
*   Optimal video processing times; efficient CPU consumption under high concurrency.

### Phase 6: Community Expansion, B2B, and Public APIs
*Horizon: **LATER** (Long-Term Vision)*

**Key Features:**
*   **Communities (Forums), Business Manager (B2B)**, and **Public APIs (OAuth)** for third-party integrations (Zapier, bots).
**Success Metrics (KPIs):**
*   Active B2B investment and number of third-party apps using the API ecosystem.
