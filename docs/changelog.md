# Project Change Log: CircleSfera

## [2026-04-02] - Story Replies & Database Optimization

### Added
- **Standard Story Replies**: 
    - Real-time interactive thumbnails in chat bubbles.
    - Global `storyStore` and `StoryViewer` integration for app-wide navigation.
    - Interactive "Open Story" flow from chat thumbnails.

### Improved
- **Database Performance**: 
    - Strategic indexing on `Message(storyId)` and `Story(userId, expiresAt)` for faster retrieval.
    - Updated `onDelete: SetNull` on story references to preserve chat history integrity.
- **Prisma Infrastructure**: 
    - Automated `.env` loading in `prisma.config.ts` for rock-solid CLI operations.

### Fixed
- **Messaging Logic**: Corrected recipient ID resolving in story responses.
- **API Consistency**: Resolved 400 Bad Request by aligning Backend DTOs with new Story fields.
- **Migration Drift**: Settle database history with non-destructive `mirror` migration strategy.
