# Infrastructure: Database Reference (Absolute Detail)

This document provides a granular data dictionary for the CircleSfera production database, managed via Prisma ORM.

## 1. Core Identity & Authentication

### `User` Model
The central authority for authentication and account status.

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `String (UUID)` | Unique internal identifier. | `@id` |
| `email` | `String` | User's primary email address. | `@unique` |
| `username` | `String` | Unique public handle. | `@unique` |
| `password` | `String` | Argon2-hashed password. | |
| `role` | `enum (Role)` | Access level: `USER` or `ADMIN`. | `default: USER` |
| `verificationLevel` | `enum` | Trust tier: `BASIC`, `VERIFIED`, `BUSINESS`, `ELITE`. | `default: BASIC` |
| `isBanned` | `Boolean` | Administrative suspension status. | `default: false` |
| `isVerified` | `Boolean` | Email verification status. | `default: false` |
| `isPrivate` | `Boolean` | If true, only followers can view content. | `default: false` |
| `accountType` | `enum` | `PERSONAL`, `CREATOR`, `BUSINESS`. | `default: PERSONAL` |
| `createdAt` | `DateTime` | Timestamp of registration. | `default: now()` |

### `Profile` Model
Public-facing user metadata, separated for performance optimization.

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `String (UUID)` | unique identifier. | `@id` |
| `userId` | `String (FK)` | Links to the `User` model. | `@unique`, `onDelete: Cascade` |
| `name` | `String?` | Display/Full name. | |
| `bio` | `String?` | Short user description (max 160 chars). | |
| `avatar` | `String?` | URL to the profile picture. | |
| `coverImage` | `String?` | URL to the profile cover. | |
| `location` | `String?` | User defined location. | |
| `website` | `String?` | External link. | |

### `Follow` Model
Self-referential join table for the social graph.
- **`followerId`**: User who initiated the follow.
- **`followingId`**: User being followed.
- **Indices**: Composite index on `[followerId, followingId]`.

## 2. Content & Media Governance

### `Post` Model
Primary user-generated content.

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `String (UUID)` | Primary key. | `@id` |
| `userId` | `String (FK)` | Author of the post. | `onDelete: Cascade` |
| `content` | `String?` | Textual description/caption. | |
| `mediaUrls` | `String[]` | Array of URLs to Cloudinary assets. | |
| `type` | `enum` | `IMAGE`, `VIDEO`, `TEXT`, `ALBUM`. | |
| `isPaid` | `Boolean` | Monetization flag (PPV). | `default: false` |
| `price` | `Float?` | Cost to unlock the post. | |
| `visibility` | `String` | `PUBLIC`, `FOLLOWERS`, `PRIVATE`. | `default: PUBLIC` |

### `Story` Model
Ephemeral media (expires in 24h).

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `String (UUID)` | Primary key. | `@id` |
| `userId` | `String (FK)` | Author. | `onDelete: Cascade` |
| `mediaUrl` | `String` | URL to the story asset. | |
| `views` | `Int` | Counter of unique views. | `default: 0` |
| `expiresAt` | `DateTime` | Expiration timestamp. | |

### `Comment` Model
Threaded engagement on posts.

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `String (UUID)` | Primary key. | `@id` |
| `postId` | `String (FK)` | Parent post. | `onDelete: Cascade` |
| `userId` | `String (FK)` | Author. | `onDelete: Cascade` |
| `parentId` | `String? (FK)`| Self-link for nested replies. | |
| `content` | `String`| Comment text. | |

## 3. Real-time Messaging

### `Chat` Model
- **`type`**: `ONE_TO_ONE` or `GROUP`.
- **Participants**: Many-to-Many relationship with `User`.

### `Message` Model
- **`userId`**: Sender.
- **`chatId`**: Conversation.
- **`content`**: Text or system message.
- **`mediaUrls`**: Optional attachments.
- **`readBy`**: Array of user IDs who have seen the message.

## 4. Monetization & Security

### `Order` Model
- **`buyerId` / `sellerId`**: Transaction participants.
- **`postId`**: Targeted content.
- **`status`**: `PENDING`, `SUCCEEDED`, `FAILED`.

### `Credential` Model (WebAuthn)
- **`publicKey`**: RAW binary data for biometric auth.
- **`counter`**: Prevent replay attacks.

## 5. Global Enumerations
- **`Role`**: `USER`, `ADMIN`
- **`VerificationLevel`**: `BASIC`, `VERIFIED`, `BUSINESS`, `ELITE`
- **`PostType`**: `IMAGE`, `VIDEO`, `TEXT`, `ALBUM`
- **`AccountType`**: `PERSONAL`, `CREATOR`, `BUSINESS`
