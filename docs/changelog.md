# Project Change Log: CircleSfera

## [2026-04-01] - UI Verification & Admin Overhaul

### Added
- Integrated `VerificationBadge` across the platform (suggested users, profiles, admin lists).
- Created official `docs/` folder and protocol documentation.

### Improved
- **Admin Panel Responsiveness**: 
    - Full mobile horizontal scroll for all tables.
    - Responsive sidebar (horizontal menu on mobile).
    - Valid HTML structure for all admin tables.
- **Deployment Stability**: Updated `docker-compose.prod.yml` with automated migrations and cleaner landing service mounts.

### Fixed
- JSX corruption in `UsersTab.tsx`.
- Missing `verificationLevel` in followers/suggested users API response.
- Nginx proxy mount conflict on production VPS.
- DevOps permission issues on VPS using automated cleanup scripts.
