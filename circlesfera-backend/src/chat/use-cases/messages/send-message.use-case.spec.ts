import { ErrorCode } from '@circlesfera/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import { assertCanAccessPost } from '../../../common/policies/post-access.policy.js';
import { assertCanAccessStory } from '../../../common/policies/story-access.policy.js';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import {
  AUTHOR_ID,
  BUYER_ID,
  expectClosed,
  expectWhole,
  FULL_URL,
  inlinePaidMedia,
  PAID_POST_ID,
  paidPost,
  realPaywall,
  STRANGER_ID,
} from '../../../common/testing/paid-posts.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { PushService } from '../../../push/push.service.js';
import { SendMessageUseCase } from './send-message.use-case.js';

vi.mock('../../../common/policies/post-access.policy.js', () => ({
  assertCanAccessPost: vi.fn(),
}));
vi.mock('../../../common/policies/story-access.policy.js', () => ({
  assertCanAccessStory: vi.fn(),
}));

describe('SendMessageUseCase', () => {
  let useCase: SendMessageUseCase;
  // GIPHY as the server sees it: on, and knowing one GIF.
  const GIF = {
    id: 'abc123',
    title: 'Party',
    url: 'https://media.giphy.com/media/abc123/200.webp',
    width: 200,
    height: 150,
  };
  const giphy = { available: vi.fn(), byId: vi.fn() };
  let mockPrisma: any;
  let mockTx: any;
  // Every file here is the sender's own unless a test says so.
  const storedFiles = { assertOwnedBy: vi.fn().mockResolvedValue(undefined) };
  // No one hides any word unless a test says so.
  const hiddenWords = { hides: vi.fn().mockResolvedValue(false) };
  let mockCryptoService: {
    encrypt: ReturnType<typeof vi.fn>;
  };
  let mockPushService: {
    sendNotification: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTx = {
      conversation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ kind: 'USER' }),
      },
      participant: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
      media: {
        create: vi.fn().mockResolvedValue({ id: 'media-1' }),
      },
      follow: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      // Everyone takes message requests unless a test says otherwise.
      profile: {
        findUnique: vi.fn().mockResolvedValue({ messageRequests: true }),
      },
    };

    mockPrisma = {
      $transaction: vi.fn(async (cb: any) => cb(mockTx)),
      profile: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      // Nobody restricts anyone unless a test says so.
      restriction: { findMany: vi.fn().mockResolvedValue([]) },
    };

    mockCryptoService = {
      encrypt: vi.fn((c: string) => `encrypted_${c}`),
    };

    mockPushService = {
      sendNotification: vi.fn().mockResolvedValue(true),
    };

    mockEventEmitter = {
      emit: vi.fn(),
    };

    useCase = new SendMessageUseCase(
      mockPrisma as unknown as PrismaService,
      mockCryptoService as unknown as CryptoService,
      mockPushService as unknown as PushService,
      mockEventEmitter as unknown as EventEmitter2,
      {
        consume: vi.fn().mockResolvedValue(undefined),
        trackWrite: vi.fn().mockResolvedValue(undefined),
        recordText: vi.fn().mockResolvedValue(undefined),
      } as never,
      storedFiles as never,
      realPaywall(),
      hiddenWords as never,
      giphy as never,
    );
    hiddenWords.hides.mockReset().mockResolvedValue(false);
    giphy.available.mockReset().mockReturnValue(true);
    giphy.byId.mockReset().mockResolvedValue(GIF);
  });

  it("refuses another Profile's stored file before anything else", async () => {
    storedFiles.assertOwnedBy.mockRejectedValueOnce(
      new Error('FILE_NOT_OWNED'),
    );

    await expect(
      useCase.execute(
        'sender-1',
        'recipient-1',
        'Hi',
        '/uploads/theirs.jpg',
        'image',
      ),
    ).rejects.toThrow('FILE_NOT_OWNED');
    expect(storedFiles.assertOwnedBy).toHaveBeenCalledWith('sender-1', [
      '/uploads/theirs.jpg',
      undefined,
    ]);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws BadRequest when neither conversationId nor recipientId is provided', async () => {
    await expect(
      useCase.execute('sender-1', undefined, 'Hello'),
    ).rejects.toThrow(AppException);
  });

  it('throws NotFound if conversationId does not exist', async () => {
    mockTx.conversation.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-nonexistent',
      ),
    ).rejects.toThrow(AppException);
  });

  it('throws Forbidden if sender is not participant in conversation', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants: [
        { profileId: 'other-user', profile: { id: 'other-user' } },
      ],
    });

    await expect(
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('refuses, as a non-member, someone who declined the group', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'group-1',
      isGroup: true,
      participants: [
        {
          profileId: 'sender-1',
          deletedAt: new Date(),
          profile: { id: 'sender-1' },
        },
        { profileId: 'member-1', deletedAt: null, profile: { id: 'member-1' } },
      ],
    });

    await expect(
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'group-1',
      ),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN_ACCESS', status: 403 });
    expect(mockTx.message.create).not.toHaveBeenCalled();
    expect(mockTx.participant.updateMany).not.toHaveBeenCalled();
  });

  it('still lets a pending invitee write in the group', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'group-1',
      isGroup: true,
      participants: [
        {
          profileId: 'sender-1',
          hasAccepted: false,
          deletedAt: null,
          profile: { id: 'sender-1' },
        },
        { profileId: 'member-1', deletedAt: null, profile: { id: 'member-1' } },
      ],
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-1',
      content: 'encrypted_Hello',
      senderId: 'sender-1',
      conversationId: 'group-1',
    });

    await useCase.execute(
      'sender-1',
      undefined,
      'Hello',
      undefined,
      undefined,
      'group-1',
    );
    expect(mockTx.message.create).toHaveBeenCalled();
  });

  it('never brings back into a group anyone who declined it', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'group-1',
      isGroup: true,
      participants: [
        { profileId: 'sender-1', deletedAt: null, profile: { id: 'sender-1' } },
        {
          profileId: 'declined-1',
          deletedAt: new Date(),
          profile: { id: 'declined-1' },
        },
      ],
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-1',
      content: 'encrypted_Hello',
      senderId: 'sender-1',
      conversationId: 'group-1',
    });

    await useCase.execute(
      'sender-1',
      undefined,
      'Hello',
      undefined,
      undefined,
      'group-1',
    );

    expect(mockTx.message.create).toHaveBeenCalled();
    expect(mockTx.participant.updateMany).not.toHaveBeenCalled();
  });

  it('lets someone write in a 1:1 chat they removed, and brings it back', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      isGroup: false,
      participants: [
        {
          profileId: 'sender-1',
          deletedAt: new Date(),
          profile: { id: 'sender-1' },
        },
        {
          profileId: 'recipient-1',
          deletedAt: null,
          profile: { id: 'recipient-1' },
        },
      ],
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-1',
      content: 'encrypted_Hello',
      senderId: 'sender-1',
      conversationId: 'conv-1',
    });

    await useCase.execute(
      'sender-1',
      undefined,
      'Hello',
      undefined,
      undefined,
      'conv-1',
    );

    expect(mockTx.participant.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', deletedAt: { not: null } },
      data: { deletedAt: null },
    });
  });

  it('throws Forbidden if participant is blocked or blocks sender', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants: [
        { profileId: 'sender-1', profile: { id: 'sender-1' } },
        { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
      ],
    });
    mockTx.block.findMany.mockResolvedValue([{ id: 'block-1' }]);

    await expect(
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-1',
      ),
    ).rejects.toThrow(AppException);
  });

  describe('replying', () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
      { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
    ];
    const send = (replyToId: string) =>
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-1',
        undefined,
        undefined,
        undefined,
        replyToId,
      );

    beforeEach(() => {
      mockTx.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participants,
      });
      mockTx.message.create.mockResolvedValue({
        id: 'msg-2',
        content: 'encrypted_Hello',
        senderId: 'sender-1',
        conversationId: 'conv-1',
        sender: { id: 'sender-1', username: 'sender_user' },
      });
    });

    it('replies to a message a member wrote', async () => {
      await expect(send('msg-1')).resolves.toMatchObject({ id: 'msg-2' });
      expect(mockTx.message.findUnique).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        select: { kind: true },
      });
      expect(mockTx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ replyToId: 'msg-1' }),
        }),
      );
    });

    it('refuses a reply to a notice from the app, and sends nothing', async () => {
      mockTx.message.findUnique.mockResolvedValue({ kind: 'ADMIN_GRANTED' });

      await expect(send('notice-1')).rejects.toMatchObject({
        errorCode: 'MESSAGE_IS_NOTICE',
        status: 400,
      });
      expect(mockTx.message.create).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('sends a reply to a message that is gone as a plain message', async () => {
      mockTx.message.findUnique.mockResolvedValue(null);

      await expect(send('gone-1')).resolves.toMatchObject({ id: 'msg-2' });
      expect(mockTx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ replyToId: undefined }),
        }),
      );
    });
  });
  it('sends no push to a recipient who restricts the sender, but still delivers the message', async () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
      { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
    ];
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      isGroup: false,
      participants,
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-1',
      content: 'encrypted_Hello',
      senderId: 'sender-1',
      conversationId: 'conv-1',
      sender: { id: 'sender-1', username: 'sender_user' },
    });
    mockPrisma.restriction.findMany.mockResolvedValue([
      { restricterId: 'recipient-1' },
    ]);

    await useCase.execute(
      'sender-1',
      undefined,
      'Hello',
      undefined,
      undefined,
      'conv-1',
    );

    expect(mockPrisma.restriction.findMany).toHaveBeenCalledWith({
      where: {
        restrictedId: 'sender-1',
        restricterId: { in: ['recipient-1'] },
      },
      select: { restricterId: true },
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.message.sent',
      expect.objectContaining({ participants }),
    );
    expect(mockPushService.sendNotification).not.toHaveBeenCalled();
  });

  it('sends message to existing conversation with push notification to recipient', async () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
      { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
    ];
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants,
    });
    const createdMsg = {
      id: 'msg-1',
      content: 'encrypted_Hello',
      senderId: 'sender-1',
      conversationId: 'conv-1',
      sender: { id: 'sender-1', username: 'sender_user' },
    };
    mockTx.message.create.mockResolvedValue(createdMsg);

    const result = await useCase.execute(
      'sender-1',
      undefined,
      'Hello',
      'https://media.jpg',
      'image',
      'conv-1',
      'temp-123',
    );

    expect(result).toMatchObject({
      id: 'msg-1',
      content: 'Hello',
      tempId: 'temp-123',
    });
    expect(mockCryptoService.encrypt).toHaveBeenCalledWith('Hello');
    expect(mockTx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'encrypted_Hello',
          senderId: 'sender-1',
          conversationId: 'conv-1',
          url: 'https://media.jpg',
          mediaType: 'image',
        }),
      }),
    );
    expect(mockTx.participant.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conv-1',
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('chat.message.sent', {
      participants,
      payload: expect.objectContaining({
        content: 'Hello',
        tempId: 'temp-123',
      }),
    });
    // With no language known for the recipient, the default one.
    expect(mockPushService.sendNotification).toHaveBeenCalledWith(
      'recipient-1',
      expect.objectContaining({
        title: 'Nuevo mensaje',
        data: { url: '/chat/conv-1', type: 'chat' },
      }),
      'messages',
    );
  });

  it("writes the push in each recipient's language, naming the sender, never the message", async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants: [
        { profileId: 'sender-1', profile: { id: 'sender-1' } },
        { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
      ],
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-1',
      content: 'encrypted_secret words',
      senderId: 'sender-1',
      conversationId: 'conv-1',
      sender: { id: 'sender-1', username: 'alice' },
    });
    mockPrisma.profile.findMany.mockResolvedValue([
      { id: 'recipient-1', user: { locale: 'en' } },
    ]);

    await useCase.execute(
      'sender-1',
      undefined,
      'secret words',
      undefined,
      undefined,
      'conv-1',
      'temp-1',
    );

    expect(mockPrisma.profile.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['recipient-1'] } },
      select: { id: true, user: { select: { locale: true } } },
    });
    expect(mockPushService.sendNotification).toHaveBeenCalledWith(
      'recipient-1',
      {
        title: 'New message',
        body: '@alice sent you a message',
        data: { url: '/chat/conv-1', type: 'chat' },
      },
      'messages',
    );
  });

  it('creates linked Media rows for image and voice attachments, and links their ids', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants: [{ profileId: 'sender-1', profile: { id: 'sender-1' } }],
    });
    mockTx.media.create
      .mockResolvedValueOnce({ id: 'media-image-1' })
      .mockResolvedValueOnce({ id: 'media-voice-1' });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-with-media',
      senderId: 'sender-1',
      conversationId: 'conv-1',
      sender: { id: 'sender-1', username: 'sender_user' },
      media: {
        url: 'https://media.jpg',
        standardUrl: null,
        thumbnailUrl: null,
        status: 'READY',
      },
      voiceMedia: { url: 'https://media-voice.m4a' },
    });

    await useCase.execute(
      'sender-1',
      undefined,
      'Hello',
      'https://media.jpg',
      'image',
      'conv-1',
      undefined,
      undefined,
      undefined,
      undefined,
      'https://media-voice.m4a',
      3000,
      [1, 2, 3],
    );

    expect(mockTx.media.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'IMAGE',
        status: 'READY',
        url: 'https://media.jpg',
      }),
    });
    expect(mockTx.media.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'AUDIO',
        status: 'READY',
        url: 'https://media-voice.m4a',
      }),
    });
    expect(mockTx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaId: 'media-image-1',
          voiceMediaId: 'media-voice-1',
        }),
      }),
    );
  });

  it('refuses a first message to someone who takes no message requests, and writes nothing', async () => {
    mockTx.conversation.findFirst.mockResolvedValue(null);
    mockTx.follow.findFirst.mockResolvedValue(null);
    mockTx.profile.findUnique.mockResolvedValue({ messageRequests: false });

    await expect(
      useCase.execute('sender-1', 'recipient-2', 'Hola'),
    ).rejects.toMatchObject({
      response: { errorCode: 'MESSAGE_REQUESTS_OFF' },
    });
    expect(mockTx.profile.findUnique).toHaveBeenCalledWith({
      where: { id: 'recipient-2' },
      select: { messageRequests: true },
    });
    expect(mockTx.conversation.create).not.toHaveBeenCalled();
    expect(mockTx.message.create).not.toHaveBeenCalled();
  });

  it('lets someone the recipient follows reach them with requests off', async () => {
    mockTx.conversation.findFirst.mockResolvedValue(null);
    mockTx.follow.findFirst.mockResolvedValue({ id: 'f-1' });
    mockTx.profile.findUnique.mockResolvedValue({ messageRequests: false });
    mockTx.conversation.create.mockResolvedValue({
      id: 'conv-created',
      participants: [
        { profileId: 'sender-1', hasAccepted: true },
        { profileId: 'recipient-2', hasAccepted: true },
      ],
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-2',
      content: 'encrypted_Hola',
      senderId: 'sender-1',
      conversationId: 'conv-created',
      sender: { id: 'sender-1', username: 'direct_sender' },
    });

    await useCase.execute('sender-1', 'recipient-2', 'Hola');

    expect(mockTx.profile.findUnique).not.toHaveBeenCalled();
    expect(mockTx.message.create).toHaveBeenCalled();
  });

  it('sends message creating direct conversation when not found', async () => {
    mockTx.conversation.findFirst.mockResolvedValue(null);
    mockTx.follow.findFirst.mockResolvedValue(null);
    const newConv = {
      id: 'conv-created',
      participants: [
        { profileId: 'sender-1', hasAccepted: true },
        { profileId: 'recipient-2', hasAccepted: false },
      ],
    };
    mockTx.conversation.create.mockResolvedValue(newConv);
    mockTx.message.create.mockResolvedValue({
      id: 'msg-2',
      content: 'encrypted_Direct',
      senderId: 'sender-1',
      conversationId: 'conv-created',
      sender: { id: 'sender-1', username: 'direct_sender' },
    });

    const result = await useCase.execute('sender-1', 'recipient-2', 'Direct');

    expect(mockTx.conversation.create).toHaveBeenCalledWith({
      data: {
        isGroup: false,
        participants: {
          create: [
            { profileId: 'sender-1', hasAccepted: true },
            { profileId: 'recipient-2', hasAccepted: false },
          ],
        },
      },
      include: {
        participants: {
          include: {
            profile: { select: { id: true } },
          },
        },
      },
    });
    expect(result.content).toBe('Direct');
    // Push notification must NOT be sent to recipient if hasAccepted is false
    expect(mockPushService.sendNotification).not.toHaveBeenCalled();
  });

  describe('a GIF', () => {
    const direct = () => {
      mockTx.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        isGroup: false,
        participants: [
          { profileId: 'sender-1', hasAccepted: true },
          { profileId: 'recipient-2', hasAccepted: true },
        ],
      });
      mockTx.message.create.mockResolvedValue({
        id: 'msg-gif',
        content: 'encrypted_',
        senderId: 'sender-1',
        conversationId: 'conv-1',
        sender: { id: 'sender-1', username: 'sender_user' },
      });
    };
    const sendGif = (over: { url?: string; postId?: string } = {}) =>
      useCase.execute(
        'sender-1',
        'recipient-2',
        '',
        over.url,
        undefined,
        undefined,
        undefined,
        over.postId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'abc123',
      );

    it('keeps the GIF as GIPHY describes it, asked by its id', async () => {
      direct();

      await sendGif();

      expect(giphy.byId).toHaveBeenCalledWith('abc123');
      expect(mockTx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gif: GIF, url: undefined }),
        }),
      );
    });

    it('is sent on its own, never with a photo, video or shared post', async () => {
      direct();

      await expect(sendGif({ postId: 'post-1' })).rejects.toMatchObject({
        response: { errorCode: 'BAD_REQUEST' },
      });
      expect(giphy.byId).not.toHaveBeenCalled();
      expect(mockTx.message.create).not.toHaveBeenCalled();
    });

    it('is refused when GIFs are off, or GIPHY does not know it', async () => {
      direct();
      giphy.available.mockReturnValueOnce(false);
      await expect(sendGif()).rejects.toMatchObject({
        response: { errorCode: 'GIFS_UNAVAILABLE' },
      });

      giphy.byId.mockResolvedValueOnce(null);
      await expect(sendGif()).rejects.toMatchObject({
        response: { errorCode: 'GIF_NOT_FOUND' },
      });
      expect(mockTx.message.create).not.toHaveBeenCalled();
    });

    it('asks GIPHY nothing for a message without a GIF', async () => {
      direct();

      await useCase.execute('sender-1', 'recipient-2', 'Hello');

      expect(giphy.byId).not.toHaveBeenCalled();
      expect(mockTx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ gif: expect.anything() }),
        }),
      );
    });
  });

  describe('a request with one of the recipient hidden words', () => {
    const request = (over: object = {}) => {
      mockTx.conversation.findFirst.mockResolvedValue(null);
      mockTx.follow.findFirst.mockResolvedValue(null);
      mockTx.conversation.create.mockResolvedValue({
        id: 'conv-created',
        isGroup: false,
        participants: [
          { id: 'part-s', profileId: 'sender-1', hasAccepted: true },
          {
            id: 'part-r',
            profileId: 'recipient-2',
            hasAccepted: false,
            ...over,
          },
        ],
      });
      mockTx.message.create.mockResolvedValue({
        id: 'msg-2',
        senderId: 'sender-1',
        conversationId: 'conv-created',
        sender: { id: 'sender-1', username: 'someone' },
      });
    };

    it('goes to Hidden requests, in the same transaction as the message', async () => {
      request();
      hiddenWords.hides.mockResolvedValue(true);

      await useCase.execute('sender-1', 'recipient-2', 'qué feo');

      expect(hiddenWords.hides).toHaveBeenCalledWith('recipient-2', 'qué feo');
      expect(hiddenWords.hides).toHaveBeenCalledTimes(1);
      expect(mockTx.participant.update).toHaveBeenCalledWith({
        where: { id: 'part-r' },
        data: { requestHiddenByWords: true },
      });
    });

    it('stays in Requests when it has none of them', async () => {
      request();

      await useCase.execute('sender-1', 'recipient-2', 'hola');

      expect(mockTx.participant.update).not.toHaveBeenCalled();
    });

    it('is not checked again once hidden, nor once accepted, nor without text', async () => {
      hiddenWords.hides.mockResolvedValue(true);
      request({ requestHiddenByWords: true });
      await useCase.execute('sender-1', 'recipient-2', 'qué feo');
      request({ hasAccepted: true });
      await useCase.execute('sender-1', 'recipient-2', 'qué feo');
      request();
      await useCase.execute('sender-1', 'recipient-2', '');

      expect(hiddenWords.hides).not.toHaveBeenCalled();
      expect(mockTx.participant.update).not.toHaveBeenCalled();
    });
  });

  it('sends push notification when recipient follows sender and has accepted', async () => {
    mockTx.conversation.findFirst.mockResolvedValue(null);
    mockTx.follow.findFirst.mockResolvedValue({ id: 'follow-1' });
    const newConv = {
      id: 'conv-created',
      participants: [
        { profileId: 'sender-1', hasAccepted: true },
        { profileId: 'recipient-2', hasAccepted: true },
      ],
    };
    mockTx.conversation.create.mockResolvedValue(newConv);
    mockTx.message.create.mockResolvedValue({
      id: 'msg-2',
      content: 'encrypted_Direct',
      senderId: 'sender-1',
      conversationId: 'conv-created',
      sender: { id: 'sender-1', username: 'direct_sender' },
    });

    await useCase.execute('sender-1', 'recipient-2', 'Direct');

    expect(mockTx.conversation.create).toHaveBeenCalledWith({
      data: {
        isGroup: false,
        participants: {
          create: [
            { profileId: 'sender-1', hasAccepted: true },
            { profileId: 'recipient-2', hasAccepted: true },
          ],
        },
      },
      include: {
        participants: {
          include: {
            profile: { select: { id: true } },
          },
        },
      },
    });
    expect(mockPushService.sendNotification).toHaveBeenCalledWith(
      'recipient-2',
      expect.objectContaining({
        title: 'Nuevo mensaje',
      }),
      'messages',
    );
  });

  it('sends message finding direct conversation when it exists', async () => {
    const existingConv = {
      id: 'conv-existing',
      participants: [
        { profileId: 'sender-1', profile: { id: 'sender-1' } },
        { profileId: 'recipient-2', profile: { id: 'recipient-2' } },
      ],
    };
    mockTx.conversation.findFirst.mockResolvedValue(existingConv);
    mockTx.message.create.mockResolvedValue({
      id: 'msg-3',
      content: 'encrypted_Hi',
      senderId: 'sender-1',
      conversationId: 'conv-existing',
      sender: { id: 'sender-1' },
    });

    const result = await useCase.execute(
      'sender-1',
      'recipient-2',
      'Hi',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'voice.mp3',
      12,
      [0.1, 0.5, 0.9],
    );

    expect(mockTx.conversation.create).not.toHaveBeenCalled();
    expect(result.content).toBe('Hi');
  });

  it('handles push error gracefully without failing message send', async () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
      { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
    ];
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants,
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-4',
      content: 'encrypted_Test',
      senderId: 'sender-1',
      sender: { id: 'sender-1', username: 'sender' },
    });
    mockPushService.sendNotification.mockRejectedValue(
      new Error('Push token expired'),
    );

    const result = await useCase.execute(
      'sender-1',
      undefined,
      'Test',
      undefined,
      undefined,
      'conv-1',
    );

    expect(result.content).toBe('Test');
  });

  it('handles socket emit exception gracefully', async () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
    ];
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants,
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-5',
      content: 'encrypted_Test',
      senderId: 'sender-1',
      sender: { id: 'sender-1' },
    });
    mockEventEmitter.emit.mockImplementation(() => {
      throw new Error('Socket failure');
    });

    const result = await useCase.execute(
      'sender-1',
      undefined,
      'Test',
      undefined,
      undefined,
      'conv-1',
    );

    expect(result.content).toBe('Test');
  });

  describe('paid messages', () => {
    // Messages are no longer sold: one with a price is refused before the
    // conversation is touched, whoever sends it.
    const send = (isLocked?: boolean, priceCents?: number) =>
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-1',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        isLocked,
        priceCents,
      );

    it.each([
      ['marked as locked', true, 500],
      ['marked as locked, with no price', true, undefined],
      ['with only a price', undefined, 500],
    ])('refuses a message %s', async (_case, isLocked, priceCents) => {
      await expect(send(isLocked, priceCents)).rejects.toMatchObject({
        errorCode: ErrorCode.PAID_MESSAGES_UNAVAILABLE,
      });
      expect(mockTx.conversation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('sharing a post or story', () => {
    const conversation = {
      id: 'conv-1',
      participants: [
        { profileId: 'sender-1', profile: { id: 'sender-1' } },
        { profileId: 'friend-1', profile: { id: 'friend-1' } },
        { profileId: 'friend-2', profile: { id: 'friend-2' } },
      ],
    };
    const share = (shared: { postId?: string; storyId?: string }) =>
      useCase.execute(
        'sender-1',
        undefined,
        'Look',
        undefined,
        undefined,
        'conv-1',
        undefined,
        shared.postId,
        shared.storyId,
      );

    beforeEach(() => {
      vi.mocked(assertCanAccessPost)
        .mockReset()
        .mockResolvedValue({} as never);
      vi.mocked(assertCanAccessStory)
        .mockReset()
        .mockResolvedValue({} as never);
      mockTx.conversation.findUnique.mockResolvedValue(conversation);
    });

    it('checks that the sender and every other participant can see the post', async () => {
      mockTx.message.create.mockResolvedValue({ id: 'm1' });
      await share({ postId: 'post-1' }).catch(() => undefined);

      expect(
        vi.mocked(assertCanAccessPost).mock.calls.map((c) => c[2]),
      ).toEqual(['sender-1', 'friend-1', 'friend-2']);
      expect(assertCanAccessStory).not.toHaveBeenCalled();
    });

    it('refuses, as not found, a post the sender cannot see', async () => {
      vi.mocked(assertCanAccessPost).mockRejectedValueOnce(
        new Error('Post not found'),
      );

      await expect(share({ postId: 'post-1' })).rejects.toThrow(
        'Post not found',
      );
      expect(mockTx.message.create).not.toHaveBeenCalled();
    });

    it('refuses a story someone in the conversation cannot see, without saying who', async () => {
      vi.mocked(assertCanAccessStory)
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new Error('Story not found'));

      const error = await share({ storyId: 'story-1' }).catch((e) => e);

      expect(error).toBeInstanceOf(AppException);
      expect(String(error.message)).toContain('Someone in this conversation');
      expect(String(error.message)).not.toContain('friend-1');
      expect(mockTx.message.create).not.toHaveBeenCalled();
    });

    const sentBy = (sender: string) =>
      mockTx.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participants: [
          { profileId: sender, profile: { id: sender } },
          { profileId: 'friend-1', profile: { id: 'friend-1' } },
        ],
      });

    it('gives a paid post back closed to a sender who has not unlocked it', async () => {
      sentBy(STRANGER_ID);
      mockTx.message.create.mockResolvedValue({
        id: 'm1',
        sender: { id: STRANGER_ID, username: 's' },
        post: paidPost([inlinePaidMedia()]),
      });
      const sent = await useCase.execute(
        STRANGER_ID,
        undefined,
        'Look',
        undefined,
        undefined,
        'conv-1',
        undefined,
        PAID_POST_ID,
      );

      expectClosed((sent as any).post);
      // Every member gets the post from the socket, as each may see it.
      const event = mockEventEmitter.emit.mock.calls.find(
        ([name]) => name === 'chat.message.sent',
      )?.[1];
      expect(JSON.stringify(event.payload.post)).toContain(FULL_URL);
    });

    it('gives a paid post back whole to its author and to a sender who unlocked it', async () => {
      for (const sender of [AUTHOR_ID, BUYER_ID]) {
        sentBy(sender);
        mockTx.message.create.mockResolvedValueOnce({
          id: 'm1',
          sender: { id: sender, username: 's' },
          post: paidPost([inlinePaidMedia()]),
        });
        const sent = await useCase.execute(
          sender,
          undefined,
          'Look',
          undefined,
          undefined,
          'conv-1',
          undefined,
          PAID_POST_ID,
        );
        expectWhole((sent as any).post);
      }
    });

    it('checks nothing for a message that shares nothing', async () => {
      mockTx.message.create.mockResolvedValue({ id: 'm1' });
      await share({}).catch(() => undefined);

      expect(assertCanAccessPost).not.toHaveBeenCalled();
      expect(assertCanAccessStory).not.toHaveBeenCalled();
    });
  });
});
