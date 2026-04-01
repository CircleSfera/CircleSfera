# Infrastructure: API Specification (Absolute Detail)

This document provides a highly granular technical mapping of every endpoint in the CircleSfera v1 API.

## 1. Authentication (`/api/v1/auth`)

### POST `/register`
Creates a new user and sets session cookies.
- **Body**: `{ email, username, password, name? }`
- **Response**: `201 Created` - Sets `access_token` and `refresh_token` cookies.

### POST `/login`
Authenticates existing users.
- **Body**: `{ email, password }` (or username)
- **Response**: `200 OK` - Sets session cookies.

### POST `/logout`
Invalidates the current session.
- **Req**: Requires valid `access_token` cookie.
- **Response**: `204 No Content`.

## 2. Content Management (`/api/v1/posts`)

### GET `/posts`
Lists public content for search/explore.
- **Query**: `page`, `limit`, `sort` (`latest`, `trending`).
- **Response**: `200 OK` - `{ data: Post[], meta: PaginationMeta }`.

### POST `/posts`
Creates a multimedia post.
- **Auth**: `JwtAuthGuard`.
- **Body**: `{ content, mediaUrls, type, isPaid?, price?, visibility? }`
- **Response**: `201 Created`.

### GET `/posts/feed`
Retrieves a personalized chronological feed.
- **Auth**: `JwtAuthGuard`.
- **Query**: `page`, `limit`.
- **Logic**: Filters by followed users.

## 3. Social Interaction (`/api/v1/follows`, `/api/v1/likes`)

### POST `/follows/:userId`
Toggles the follow status for a user.
- **Response**: `200 OK` - `{ followed: boolean }`.

### POST `/likes/:targetId`
Likes or unlikes a post or comment.
- **Response**: `200 OK` - `{ liked: boolean, count: number }`.

## 4. Real-time Messaging (`/api/v1/chat`)

### GET `/chat`
Retrieves the user's conversation list.
- **Auth**: `JwtAuthGuard`.
- **Response**: `200 OK` - Array of `Chat` objects with last message preview.

### POST `/chat`
Initiates a 1:1 or Group conversation.
- **Body**: `{ participants: string[], type: "ONE_TO_ONE" | "GROUP", name? }`.

## 5. Administrative Controls (`/api/v1/admin`)

### PATCH `/users/:id/ban`
Suspends a user account.
- **Auth**: `AdminGuard`.
- **Response**: `200 OK`.

### DELETE `/posts/:id/admin`
Removes content globally.
- **Auth**: `AdminGuard`.
- **Response**: `204 No Content`.

## 6. Real-time Gateway (WebSocket)
The platform uses **Socket.io** under the `/socket.io` path.

### Client Emitters
- `joinRoom`: `{ chatId }`.
- `sendMessage`: `{ chatId, content, mediaUrls? }`.
- `typingStart`: `{ chatId }`.

### Server Listeners
- `newMessage`: Broadcasts content to room participants.
- `typingUpdate`: Transmits typing status to others.
- `notificationInbound`: Trigger for desktop/mobile notifications.

## 7. Error Handling Standard
The API returns structured errors:
- **400 Bad Request**: Validation failure (details in `message[]`).
- **401 Unauthorized**: Missing or expired session cookies.
- **403 Forbidden**: Role or CSRF mismatch.
- **500 Critical Failure**: Internal server error (logged via `AllExceptionsFilter`).
