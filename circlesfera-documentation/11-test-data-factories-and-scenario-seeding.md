# Test Data Factories and Scenario Seeding — CircleSfera

This document defines the architecture, design principles, entity factories, and scenario seeding framework used across backend unit, integration, and end-to-end (E2E) test suites in CircleSfera.

---

## 1. Scope and Core Principles

CircleSfera requires deterministic, reproducible test environments to validate complex social graph interactions, financial transactions, and content moderation pipelines. Manual database mocks or ad-hoc SQL seeds introduce state pollution, cross-worker test flakiness, and maintenance overhead.

The CircleSfera test factory suite addresses this with five foundational principles:

1. **Strict ADR-0015 Identity Split Compliance**:
   - `User` records represent identity credentials, authentication, security settings, and billing accounts.
   - `Profile` records represent social actors, handles, biographies, avatars, and interaction nodes.
   - Factories strictly enforce this boundary: posts, comments, likes, follows, blocks, and conversations attach exclusively to `Profile.id`, never directly to `User.id`.
2. **Process-Isolated Uniqueness**:
   - Random identifiers incorporate the active worker process ID (`process.pid`) and cryptographic entropy (`randomBytes`) to guarantee collision-free execution across parallel Vitest and Playwright test workers sharing a PostgreSQL instance.
3. **Optimized Cryptographic Performance**:
   - Password hashing with Argon2 is computationally intensive by design. The test factory suite computes and caches standard password hashes (`Password123!`), eliminating CPU bottlenecks during bulk entity instantiation while preserving authentic verification behavior.
4. **Autonomous, Scoped Teardown Callbacks**:
   - Global `TRUNCATE` or unrestricted `DELETE FROM` statements destroy parallel worker isolation.
   - Every scenario seeder tracks exactly the primary keys generated during its run and returns an atomic, asynchronous `cleanup()` callback that removes only its own records in reverse dependency order.
5. **Zero-Dependency Binary Fixtures**:
   - Stable media upload and streaming tests rely on embedded, RFC-compliant binary buffers (PNG, JPEG, MP4) rather than external URLs or filesystem artifacts.

---

## 2. Directory Structure and Workspace Organization

```text
circlesfera-backend/test/
├── factories/
│   ├── binary-fixtures.ts      # Immutable 1x1 PNG/JPEG and MP4 buffers; Multer mocks
│   ├── user.factory.ts         # User attribute builders, argon2 caching, unique generators
│   ├── profile.factory.ts      # Profile builders and atomic user-with-profile pairs
│   ├── post.factory.ts         # Post, media items, and hashtag builders
│   ├── social.factory.ts       # Follow, block, close friends, like, and comment creators
│   ├── monetization.factory.ts # Platform plans, subscriptions, post unlocks, transactions
│   ├── chat.factory.ts         # Direct conversations and chat messages
│   ├── scenario-seeder.ts      # Composite scenario orchestrator with scoped cleanups
│   ├── factories.spec.ts       # Comprehensive unit and integration verification suite
│   └── index.ts                # Public barrel export
e2e/helpers/
└── factories.ts                # Playwright E2E account and post payload builders
```

---

## 3. Entity Factories Reference

### 3.1 Binary Fixtures (`binary-fixtures.ts`)

Self-contained binary buffers provide immediate fixtures for file upload endpoints and media processing pipelines without filesystem I/O:

- `TINY_PNG_BUFFER`: 67-byte valid transparent 1x1 PNG image with standard magic header (`0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`).
- `TINY_JPEG_BUFFER`: Valid 1x1 JPEG image with Start of Image marker (`0xFF 0xD8 0xFF`).
- `TINY_MP4_BUFFER`: Minimal valid ISO Base Media File Format container header with `ftyp` box.
- `createMockMulterFile(options?)`: Produces an `Express.Multer.File` payload with customizable filename, mimetype, and buffer for direct controller/service unit tests.

### 3.2 User and Profile Factories (`user.factory.ts`, `profile.factory.ts`)

```typescript
import { createUser, createUserWithProfile } from './factories/index.js';

// Create a standalone authenticated user with default settings
const user = await createUser(prisma, {
  role: 'USER',
  emailVerified: new Date(),
});

// Create an atomic User + Profile pair (ADR-0015 compliant)
const { user, profile } = await createUserWithProfile(prisma, {
  user: { email: 'creator@example.test' },
  profile: {
    accountType: 'CREATOR',
    verificationLevel: 'VERIFIED',
    fullName: 'Verified Creator',
  },
});
```

### 3.3 Post and Content Factories (`post.factory.ts`)

Supports feed posts, pay-per-view (PPV) content, attached media records, and automatic hashtag relational linkage:

```typescript
import { createPost } from './factories/index.js';

const post = await createPost(prisma, profile.id, {
  caption: 'Exclusive backstage photos #summer #vip',
  isPremium: true,
  priceCents: 499,
  hashtags: ['summer', 'vip'],
  media: [
    { url: 'https://cdn.circlesfera.com/test-1.jpg', type: 'image', order: 0 },
    { url: 'https://cdn.circlesfera.com/test-2.jpg', type: 'image', order: 1 },
  ],
});
```

### 3.4 Social Graph Factories (`social.factory.ts`)

Provides idempotent upsert helpers for bi-directional social relationships:

- `createFollow(prisma, followerProfileId, followingProfileId, status?)`: Establishes follower relationship (`ACCEPTED` or `PENDING`).
- `createBlock(prisma, blockerProfileId, blockedProfileId)`: Restricts visibility and interaction.
- `createCloseFriend(prisma, profileId, friendProfileId)`: Grants close-friends visibility.
- `createLike(prisma, profileId, postId)`: Registers content engagement.
- `createComment(prisma, profileId, postId, content?)`: Appends discussion thread.

### 3.5 Monetization and Financial Factories (`monetization.factory.ts`)

Enforces backend catalog constraints and ledger integrity:

- `createPlatformPlan(prisma, overrides?)`: Seeds subscription tier with Stripe product/price IDs.
- `createPlatformSubscription(prisma, userId, planId, options?)`: Creates user subscription.
- `createPostUnlock(prisma, userId, postId, pricePaid?)`: Unlocks PPV post.
- `createTransaction(prisma, senderId, receiverId, options?)`: Records ledger transaction.

---

## 4. Scenario Seeding Engine (`ScenarioSeeder`)

The `ScenarioSeeder` combines individual factories into realistic multi-user scenarios, generating isolated data graphs and returning targeted cleanup handles:

### 4.1 Social Graph Network Scenario
Seeds an interconnected cluster of profiles with mutual follow relationships:

```typescript
const seeder = new ScenarioSeeder(prisma);
const { entities, cleanup } = await seeder.seedSocialGraph({
  usersCount: 5,
  mutualFollows: true,
});

try {
  // Execute test assertions against social graph
} finally {
  await cleanup(); // Deletes only the 5 generated users and cascading relations
}
```

### 4.2 Creator with Active Subscribers Scenario
Seeds a verified creator, a tiered subscription plan, and active paying subscribers:

```typescript
const { creator, subscribers, plan, cleanup } = await seeder.seedCreatorWithSubscribers({
  subscriberCount: 3,
  planPriceCents: 1500,
});

try {
  // Execute test assertions against subscription access control
} finally {
  await cleanup(); // Deletes subscribers, creator, and platform plan
}
```

### 4.3 Feed with Categorized Posts Scenario
Seeds an author profile with multiple media posts and searchable hashtags:

```typescript
const { author, posts, cleanup } = await seeder.seedFeedWithPosts({
  postCount: 5,
  hashtags: ['announcement', 'creator'],
});

try {
  // Execute timeline ranking, feed caching, or search tests
} finally {
  await cleanup();
}
```

### 4.4 Direct Messaging Conversation Scenario
Seeds a 1-to-1 conversation between two users with pre-populated message history:

```typescript
const { userA, userB, conversation, messages, cleanup } = await seeder.seedConversation({
  messageCount: 10,
});

try {
  // Execute WebSocket real-time delivery or inbox synchronization tests
} finally {
  await cleanup();
}
```

---

## 5. Playwright E2E Integration (`e2e/helpers/factories.ts`)

For browser-based Playwright suites running against the live frontend and backend services, `e2e/helpers/factories.ts` provides lightweight account and payload builders:

- `buildE2eAccount(prefix?, overrides?)`: Returns deterministic credentials (`email`, `username`, `password`, `fullName`, `dateOfBirth`) with process-safe unique suffixes.
- `buildCreatorAccount(overrides?)`: Returns specialized creator account credentials.
- `buildE2ePostData(overrides?)`: Generates post payload suitable for composer UI testing.

---

## 6. Verification and Execution

### Running Factory Unit Tests
```bash
# In circlesfera-backend
npm test -- test/factories/factories.spec.ts
```

### Running Workspace Linting & Type Checks
```bash
# In root workspace
npm run check
```
