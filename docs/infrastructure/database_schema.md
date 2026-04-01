# Infrastructure: Database Schema (CircleSfera)

CircleSfera uses PostgreSQL with Prisma ORM for data persistence.

## 1. Core Models

### `User`
- Central identity and auth model.
- Contains `verificationLevel` and `accountType`.

### `Profile`
- Contains public-facing info (username, avatar, bio).
- 1:1 relationship with `User`.

### `Post` & `Story`
- Main content models.
- Linked to the creator's `User` via `userId`.

### `Report`
- Tracks reported content or users.

## 2. Key Relationships
- **Content**: `User` has many `Post`, `Story`, `Comment`.
- **Engagement**: `User` has many `Like`.
- **Social**: `User` has many `Followers` and `Following` (self-referential join table).

## 3. Vector Search
- The database includes the **pgvector** extension for similarity-based searches and content recommendations.
