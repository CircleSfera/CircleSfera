# Feature: Verification System (CircleSfera)

CircleSfera implements a tiered trust and verification system to highlight authentic and professional accounts.

## 1. Verification Levels

| Level | Badge Icon | Description |
| :--- | :--- | :--- |
| `BASIC` | None | Standard user account. |
| `VERIFIED` | Blue Shield | Authenticated individual or content creator. |
| `BUSINESS` | Gold Shield | Verified company or professional entity. |
| `ELITE` | Purple Shield | Top-tier creators or official partners. |

## 2. UI Integration
The **[VerificationBadge](../../circlesfera-frontend/src/components/VerificationBadge.tsx)** component automatically renders the correct shield based on the user's `verificationLevel`.

### Placements
- **Profiles**: Next to the username in the profile header.
- **Feed/Stories**: Next to the username on each post/story entry.
- **Admin Panel**: Visible in the users list for management.
- **Suggestions**: Shown in the "People to Follow" list.

## 3. Backend Implementation
- **Schema**: Managed via the `User` and `Profile` models in Prisma.
- **API**: The `verificationLevel` field is explicitly selected in relevant queries (e.g., `UsersService.getSuggestions`, `AdminService.getUsers`) to ensure it propagates to the frontend.
