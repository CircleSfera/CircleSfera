# Feature: Media Governance & Moderation

CircleSfera maintains a safe and professional community through a combination of user reports and administrative moderation tools.

## 1. Moderation Workflow
1.  **Reporting**: Users flag content (Posts, Stories, Comments) or accounts using the report feature.
2.  **Surfacing**: Reports are aggregated and prioritized in the **Admin Moderation Queue** (`/admin/reports`).
3.  **Review**: Admins inspect the reported content and context.
4.  **Action**: Admins can Resolve (no action), Hide Content, or Ban the User.

## 2. Report Categories
- **Spam**: Repetitive or commercial spamming.
- **Harassment**: Direct attacks or hate speech.
- **Inappropriate Content**: Content violating platform visual guidelines.
- **Impersonation**: Accounts pretending to be verified users or brands.

## 3. Administrative Authorities
Admins have elevated permissions across the stack:
- **Content Override**: Ability to delete any post or comment regardless of authorship.
- **Account Suspension**: Instant banning of users, which revokes their JWT sessions and prevents re-login.
- **Verification Granting**: Exclusive authority to upgrade account verification levels (Verified, Business, Elite).

## 4. Content Visibility States
- **Public**: Visible to everyone.
- **Private**: Visible to followers only (Requires user setting).
- **Hidden**: Removed from feeds by moderators, but potentially preserved for legal review.
- **Paid (PPV)**: Content that requires a successful `Order` transaction to be viewed.
