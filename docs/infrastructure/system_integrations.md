# Infrastructure: System Integrations (Absolute Detail)

This document provides a highly technical mapping of all third-party and distributed service integrations within the CircleSfera platform.

## 1. Fast Cache & Pub/Sub (Redis)

Redis is utilized for low-latency data retrieval and as the message broker for real-time operations.

### Key-Value Storage
- **User Sessions**: `user:session:<id>` (TTL: 24h) - Stores basic user metadata to avoid DB hits on every request.
- **Verification Tokens**: `auth:verify:<token>` (TTL: 1h) - Temporary tokens for email validation.
- **Rate Limit Buckets**: `throttler:<key>` - Tracks API request counts.

### Socket.io Pub/Sub
- **Mechanism**: Redis is the adapter that allows multiple backend instances to broadcast messages to the correct socket rooms.
- **Events**: `room:join`, `room:leave`, `message:broadcast`.

## 2. Background Task Queues (BullMQ)

The platform uses **BullMQ** (powered by Redis) to handle asynchronous and high-latency tasks.

### `notifications` Queue
- **Job Name**: `send-email` - Standard transactional emails (Auth, Orders).
- **Job Name**: `push-notification` - Real-time push for likes, follows, and messages.

### `media-processing` Queue
- **Job Name**: `generate-thumbnail` - Triggered after a video upload to Cloudinary.
- **Job Name**: `vtt-generation` - Generates subtitles/transcript for videos.

### `cleanup` Queue (Cron)
- **Schedule**: Daily at 03:00 AM.
- **Job Name**: `delete-expired-stories` - Permanently removes story records from the database using the `expiresAt` field.

## 3. Media CDN (Cloudinary)

All multimedia assets are offloaded to Cloudinary for optimized delivery.

### Asset Hierarchy
- `/profiles`: Avatar and cover images.
- `/posts`: Multimedia content attached to user posts.
- `/stories`: Ephemeral visual media.
- `/temp`: Staging area for multi-step uploads (cleaned periodically).

## 4. Payment Gateway (Stripe)

Integration occurs via the `Stripe-Node` SDK and a dedicated webhook listener.

### Critical Webhook Events
- `checkout.session.completed`: Trigger for provisioning PPV content access.
- `account.updated`: Syncs the creator's Stripe Connect status with the platform.
- `payment_intent.payment_failed`: Logs failures for administrative review and user notification.

## 5. Communications (SMTP)
- **Provider**: Agnostic SMTP configuration via `Nodemailer`.
- **Standards**: All templates are responsive HTML formatted.
- **Deliverability**: Uses specialized queues to ensure 100% delivery reliability even under high peak loads.
