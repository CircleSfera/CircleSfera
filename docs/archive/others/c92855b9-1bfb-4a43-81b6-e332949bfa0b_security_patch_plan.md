# Security Patch: Dependency Upgrades

Address the remaining 22 vulnerabilities by manually upgrading core dependencies to versions that include security fixes, avoiding the dangerous downgrades suggested by `npm audit fix --force`.

## User Review Required

> [!CAUTION]
> I will be upgrading NestJS core packages to their latest stable versions. While this is generally safe within a major version, it may require a quick restart of the server to ensure everything is initialized correctly.

## Proposed Changes

### Backend Component (circlesfera-backend)

#### [MODIFY] [package.json](file:///Users/ShadyFeliu/Desktop/Projects/CircleSfera/circlesfera-backend/package.json)
- Upgrade `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, and `@nestjs/cli` to their latest stable versions.
- This will resolve vulnerabilities in nested dependencies like `multer` and `picomatch`.

## Verification Plan

### Automated Tests
- Run `npm audit` after upgrades to confirm the vulnerability count has decreased.
- Run `npm test` to ensure no regressions in the core functionality.

### Manual Verification
- Verify that the server starts correctly (`npm run dev`).
- Test file uploads (if applicable) to ensure the new `multer` version works.
