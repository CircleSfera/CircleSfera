import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { ChatController } from './chat.controller.js';
import { CreateGroupUseCase } from './use-cases/groups/create-group.use-case.js';
import { DeleteConversationUseCase } from './use-cases/groups/delete-conversation.use-case.js';
import { LeaveGroupUseCase } from './use-cases/groups/leave-group.use-case.js';
import { RemoveParticipantUseCase } from './use-cases/groups/remove-participant.use-case.js';
import { UpdateGroupUseCase } from './use-cases/groups/update-group.use-case.js';
import { DeleteMessageUseCase } from './use-cases/messages/delete-message.use-case.js';
import { EditMessageUseCase } from './use-cases/messages/edit-message.use-case.js';
import { MarkAsReadUseCase } from './use-cases/messages/mark-as-read.use-case.js';
import { SendMessageUseCase } from './use-cases/messages/send-message.use-case.js';
import { GetConversationsQuery } from './use-cases/queries/get-conversations.query.js';
import { GetMessagesQuery } from './use-cases/queries/get-messages.query.js';
import { GetUnreadCountQuery } from './use-cases/queries/get-unread-count.query.js';

describe('ChatController', () => {
  let app: INestApplication;

  const mockGetConversationsQuery = { execute: vi.fn() };
  const mockGetMessagesQuery = { execute: vi.fn() };
  const mockGetUnreadCountQuery = { execute: vi.fn() };
  const mockSendMessageUseCase = { execute: vi.fn() };
  const mockEditMessageUseCase = { execute: vi.fn() };
  const mockDeleteMessageUseCase = { execute: vi.fn() };
  const mockMarkAsReadUseCase = { execute: vi.fn() };
  const mockCreateGroupUseCase = { execute: vi.fn() };
  const mockUpdateGroupUseCase = { execute: vi.fn() };
  const mockRemoveParticipantUseCase = { execute: vi.fn() };
  const mockLeaveGroupUseCase = { execute: vi.fn() };
  const mockDeleteConversationUseCase = { execute: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [ChatController],
      providers: [
        { provide: GetConversationsQuery, useValue: mockGetConversationsQuery },
        { provide: GetMessagesQuery, useValue: mockGetMessagesQuery },
        { provide: GetUnreadCountQuery, useValue: mockGetUnreadCountQuery },
        { provide: SendMessageUseCase, useValue: mockSendMessageUseCase },
        { provide: EditMessageUseCase, useValue: mockEditMessageUseCase },
        { provide: DeleteMessageUseCase, useValue: mockDeleteMessageUseCase },
        { provide: MarkAsReadUseCase, useValue: mockMarkAsReadUseCase },
        { provide: CreateGroupUseCase, useValue: mockCreateGroupUseCase },
        { provide: UpdateGroupUseCase, useValue: mockUpdateGroupUseCase },
        {
          provide: RemoveParticipantUseCase,
          useValue: mockRemoveParticipantUseCase,
        },
        { provide: LeaveGroupUseCase, useValue: mockLeaveGroupUseCase },
        {
          provide: DeleteConversationUseCase,
          useValue: mockDeleteConversationUseCase,
        },
      ],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects conversations without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/chat/conversations')
      .expect(401);

    expect(mockGetConversationsQuery.execute).not.toHaveBeenCalled();
  });

  it('rejects send with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set(BEARER)
      .send({
        recipientId: 'profile-2',
        content: 'Hello',
        senderId: 'attacker',
      })
      .expect(400);

    expect(mockSendMessageUseCase.execute).not.toHaveBeenCalled();
  });

  it('lists conversations as the session profileId', async () => {
    const conversations = [{ id: 'conv-1' }];
    mockGetConversationsQuery.execute.mockResolvedValue(conversations);

    const res = await request(app.getHttpServer())
      .get('/api/v1/chat/conversations')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual(conversations);
    expect(mockGetConversationsQuery.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
  });

  it('returns unread count for the session profile', async () => {
    mockGetUnreadCountQuery.execute.mockResolvedValue(3);

    const res = await request(app.getHttpServer())
      .get('/api/v1/chat/conversations/unread-count')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ count: 3 });
    expect(mockGetUnreadCountQuery.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
  });

  it('lists messages as the session profileId', async () => {
    const messages = [{ id: 'msg-1' }];
    mockGetMessagesQuery.execute.mockResolvedValue(messages);

    const res = await request(app.getHttpServer())
      .get('/api/v1/chat/conversations/conv-1/messages')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual(messages);
    expect(mockGetMessagesQuery.execute).toHaveBeenCalledWith(
      'conv-1',
      50,
      TEST_USER.profileId,
    );
  });

  it('sends a message as the session profileId', async () => {
    const message = { id: 'msg-1', content: 'Hello' };
    mockSendMessageUseCase.execute.mockResolvedValue(message);

    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set(BEARER)
      .send({
        recipientId: 'profile-2',
        content: 'Hello',
        conversationId: 'conv-1',
        tempId: 'temp-1',
      })
      .expect(201);

    expect(res.body).toEqual(message);
    expect(mockSendMessageUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'profile-2',
      'Hello',
      undefined,
      undefined,
      'conv-1',
      'temp-1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('sends a locked (PPV) message as the session profileId', async () => {
    const message = { id: 'msg-locked', content: 'Unlock me', isLocked: true };
    mockSendMessageUseCase.execute.mockResolvedValue(message);

    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set(BEARER)
      .send({
        recipientId: 'profile-2',
        content: 'Unlock me',
        isLocked: true,
        priceCents: 999,
      })
      .expect(201);

    expect(res.body).toEqual(message);
    expect(mockSendMessageUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'profile-2',
      'Unlock me',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      999,
    );
  });

  it('marks a conversation as read as the session profile', async () => {
    mockMarkAsReadUseCase.execute.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .put('/api/v1/chat/conversations/conv-1/read')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(mockMarkAsReadUseCase.execute).toHaveBeenCalledWith(
      'conv-1',
      TEST_USER.profileId,
    );
  });

  it('edits a message as the session profile', async () => {
    const updated = { id: 'msg-1', content: 'Updated' };
    mockEditMessageUseCase.execute.mockResolvedValue(updated);

    const res = await request(app.getHttpServer())
      .put('/api/v1/chat/messages/msg-1')
      .set(BEARER)
      .send({ content: 'Updated' })
      .expect(200);

    expect(res.body).toEqual(updated);
    expect(mockEditMessageUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'msg-1',
      'Updated',
    );
  });

  it('deletes a message as the session profile', async () => {
    mockDeleteMessageUseCase.execute.mockResolvedValue({ success: true });

    const res = await request(app.getHttpServer())
      .delete('/api/v1/chat/messages/msg-1')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(mockDeleteMessageUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'msg-1',
    );
  });

  it('creates a group as the session profile', async () => {
    const group = { id: 'conv-1', name: 'Team' };
    mockCreateGroupUseCase.execute.mockResolvedValue(group);

    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/conversations')
      .set(BEARER)
      .send({
        participantIds: ['profile-2', 'profile-3'],
        name: 'Team',
      })
      .expect(201);

    expect(res.body).toEqual(group);
    expect(mockCreateGroupUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      ['profile-2', 'profile-3'],
      'Team',
    );
  });

  it('deletes a conversation ignoring the mode query param', async () => {
    mockDeleteConversationUseCase.execute.mockResolvedValue({
      success: true,
    });

    const res = await request(app.getHttpServer())
      .delete('/api/v1/chat/conversations/conv-1')
      .query({ mode: 'both' })
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(mockDeleteConversationUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'conv-1',
    );
  });

  it('updates a group conversation as the session profile', async () => {
    const updated = { id: 'conv-1', name: 'New Group Name' };
    mockUpdateGroupUseCase.execute.mockResolvedValue(updated);

    const res = await request(app.getHttpServer())
      .put('/api/v1/chat/conversations/conv-1/group')
      .set(BEARER)
      .send({ name: 'New Group Name', avatarUrl: 'https://cdn/avatar.jpg' })
      .expect(200);

    expect(res.body).toEqual(updated);
    expect(mockUpdateGroupUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'conv-1',
      'New Group Name',
      'https://cdn/avatar.jpg',
    );
  });

  it('removes a participant from a group conversation', async () => {
    mockRemoveParticipantUseCase.execute.mockResolvedValue({ success: true });

    const res = await request(app.getHttpServer())
      .delete('/api/v1/chat/conversations/conv-1/participants/prof-target')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(mockRemoveParticipantUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'conv-1',
      'prof-target',
    );
  });

  it('leaves a group conversation as the session profile', async () => {
    mockLeaveGroupUseCase.execute.mockResolvedValue({ success: true });

    const res = await request(app.getHttpServer())
      .delete('/api/v1/chat/conversations/conv-1/leave')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(mockLeaveGroupUseCase.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'conv-1',
    );
  });
});
