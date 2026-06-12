# CircleSfera: Project Documentation Index

Welcome to the official documentation for the CircleSfera platform. This directory contains all technical designs, deployment protocols, and historical audits of the project.

## 🌟 Features Documentation
Detailed guides on the platform's core functional systems.
- **[Admin Panel](./features/admin_panel.md)**: Navigation, moderation, and responsive design.
- **[Social Core](./features/social_core.md)**: Posts, Stories, Likes, Comments, and Feed architecture.
- **[Chat & Real-time](./features/chat_and_realtime.md)**: Direct Messaging and Socket.io integration.
- **[SaaS & Subscription Model](./features/monetization_and_creator.md)**: Platform plans, Stripe billing, and user tiers.
- **[AI & Content Discovery](./features/ai_and_search.md)**: Vector search (pgvector) and recommendation engines.
- **[Verification System](./features/verification_system.md)**: Trust levels and badge integration.

## ⚙️ Infrastructure
Technical specifications of the underlying systems.
- **[System Architecture](./architecture.md)**: Service interactions and proxy routing.
- **[API Specification](./infrastructure/api_specification.md)**: Technical reference for all v1 endpoints.
- **[Security & Authentication](./infrastructure/security_and_auth.md)**: JWT, CSRF, WebAuthn, and RBAC.
- **[Database Reference](./infrastructure/database_reference.md)**: Prisma models and core data relationships.
- **[System Integrations](./infrastructure/system_integrations.md)**: Redis, BullMQ, Cloudinary, Stripe, and Email.
- **[Environment Configuration](./infrastructure/environment_configuration.md)**: Master map of all `.env` requirements.
- **[Deployment Protocol](./deployment.md)**: Operations, troubleshooting, and rollback.

## 🛠️ Engineering Intelligence
Technical process logs, strategic audits, and architectural roadmaps.
- **[Engineering Session: Story Replies](./engineering/sessions/2026-04-02-story-replies.md)**: Logic for the latest social core enhancements.
- **[Security Audit & Remediation](./engineering/audits/2026-02-security-audit.md)**: Vulnerability analysis and hardening path.
- **[Architectural Roadmap](./engineering/audits/2026-02-architecture-roadmap.md)**: Current system health and strategic technical priorities.

## 📝 Project History & Archive
- **[Latest Changes](./changelog.md)**: Recent updates and session successes.
- **[Historical Archive](./archive/)**: Over 110 documents across all project phases.

## 📂 Documentation Archive

### 🔍 Historical Audits
Over 25 technical reviews covering security, performance, UX, and infrastructure (from Feb 2026 onwards).
- **[Initial Audit (Feb 2026)](./archive/audits/initial_audit_feb2026.md)**
- **[Full Audit Directory](./archive/audits/)**

### 📝 Project Evolution
A comprehensive collection of over 100 historical documents from previous development sessions:
- **[Historical Walkthroughs](./archive/walkthroughs/)**: Detailed reports of past milestones and stabilization.
- **[Implementation Plans](./archive/plans/)**: Technical roadmaps used for major feature builds.
- **[Past Task Logs](./archive/tasks/)**: Session-by-session checklists tracking the project's journey.
- **[Other Technical Notes](./archive/others/)**: Analysis on Instagram gaps, security patches, resilience strategies, and more.

---
*Note: This documentation is maintained by Antigravity as a permanent knowledge base for CircleSfera.*
