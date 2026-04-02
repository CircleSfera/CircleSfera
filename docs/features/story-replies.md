# Instagram-Style Story Replies

This feature enables users to respond directly to stories, creating a rich communication flow where the chat message includes an interactive preview of the original story content.

## Architecture Overview

The system is split into a robust global state manager on the frontend and an extended database schema on the backend.

### 🔭 Frontend Architecture

- **Global State (`storyStore.ts`)**: A Zustand managed store that controls the state of the `StoryViewer` (isOpen, currentStories, currentIndex). This allows the viewer to be triggered from any part of the app (Home stories, Profile stories, or Chat thumbnails).
- **Global Viewer Component (`StoryViewer.tsx`)**: Mounted in the `LayoutWrapper` to ensure it is always accessible. It handles the reply input and sends the `storyId` to the chat service.
- **Interactive Chat Bubbles (`MessageBubble.tsx`)**: Messages containing a `storyId` render a vertical glassmorphic thumbnail. Clicking this thumbnail re-opens the original story in the global viewer.

### 📡 Backend Integration

- **Validation Schema (`SendMessageDto.ts`)**: The `SendMessageDto` has been extended to include an optional `storyId`.
- **Service Logic (`ChatService.ts`)**: The `sendMessage` method now accepts and persists the `storyId`. The returned message object includes a nested `story` relation with media and user details for real-time rendering.
- **Database Model (`Prisma`)**:
    - **Message**: Added `storyId` field and a relation to the `Story` model.
    - **Story**: Added reverse relation `sharedInMessages`.
    - **Indices**: Performance indexes added on `Message(storyId)` and `Story(userId, expiresAt)` for O(1) retrieval during chat loading.

## Technical Configuration

### Database Migration
The database was updated using a non-destructive migration strategy:
1. `npx prisma db push` was used for rapid prototyping of the sync.
2. `20260402000000_final_db_optimization` migration was created to settle the official history and add database-level indexes.

### Environment Stability
The `prisma.config.ts` was updated to include `dotenv.config()`, ensuring that `DATABASE_URL` is automatically loaded for all Prisma CLI tools (migrate, generate, studio).

## User Flow

1. **Viewing a Story**: User opens the global Story Viewer.
2. **Replying**: User types in the "Hey!" input and clicks send. The frontend sends `recipientId`, `content`, and `storyId`.
3. **Receiving**: The recipient sees a cinematic notification in their chat bubble saying "Respondió a tu historia" above a vertical thumbnail of the story.
4. **Interaction**: Clicking the thumbnail opens the original story viewer at the exact story being replied to.
