# Feature: Chat & Real-time (Absolute Detail)

This document provides a technical specification for the bidirectional real-time messaging system in CircleSfera.

## 1. Gateway Infrastructure (`AppGateway`)

Managed via **Socket.io** with a Redis Pub/Sub adapter for horizontal scalability.

### Handshake Authentication
The gateway supports dual authentication strategies during the initial connection:
1.  **HTTP-only Cookie**: Extracts the `access_token` from the client's cookies.
2.  **Authorization Header**: Falls back to `Bearer <token>` if cookies are unavailable.
**Failure**: If no valid token is found, the connection is rejected.

### Room Management
- **Isolation**: Every conversation has a unique ID used as the Socket.io Room name (`chat_<id>`).
- **Security**: The server verifies that the `userId` is a member of the conversation before allowing them to `join` the room.

## 2. Event Specification

### Client-to-Server (Emitters)
- `join_room(chatId)`: Attaches the socket to a conversation.
- `send_message(payload)`: Emits `{ chatId, content, mediaUrls?, tempId }`.
- `typing_start(chatId)` / `typing_stop(chatId)`: Triggers real-time composition alerts.
- `message_read(chatId, messageId)`: Updates the read receipt.

### Server-to-Client (Broadcasts)
- `new_message`: Receives the fully persisted `Message` object.
- `user_typing`: Notifies others that a participant is typing.
- `message_status_update`: Confirmation of sent/read status.

## 3. Message Persistence Flow

1.  **Emit**: Client sends `send_message`.
2.  **Validate**: Server checks for room membership and payload integrity.
3.  **Persist**: The message is written to PostgreSQL (associated with `Chat` and `User`).
4.  **Confirm**: The server emits an acknowledgment to the sender with the database ID.
5.  **Broadcast**: The server broadcasts `new_message` to all other participants in the `chat_<id>` room.

## 4. Scalability with Redis
Since the system is containerized, Redis ensures that a user connected to `Instance A` can send a message to a user connected to `Instance B` seamlessly via the Pub/Sub adapter.
