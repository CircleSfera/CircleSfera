import { CHAT_FORWARD_MAX, ErrorCode } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { ForwardMessageUseCase } from './forward-message.use-case.js';
import type { SendMessageUseCase } from './send-message.use-case.js';

// Forwarding: a copy of a member's text or shared post goes to up to
// CHAT_FORWARD_MAX of the forwarder's chats, each through the normal send.

const sentAt = new Date('2026-11-09T10:00:00.000Z');

function textMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    conversationId: 'c-src',
    content: 'enc:hola',
    kind: 'USER',
    isDeleted: false,
    isLocked: false,
    url: null,
    voiceUrl: null,
    storyId: null,
    postId: null,
    createdAt: sentAt,
    ...overrides,
  };
}

describe('ForwardMessageUseCase', () => {
  let prisma: {
    message: { findUnique: ReturnType<typeof vi.fn> };
    participant: { findFirst: ReturnType<typeof vi.fn> };
  };
  let crypto: { decrypt: ReturnType<typeof vi.fn> };
  let send: { execute: ReturnType<typeof vi.fn> };
  let useCase: ForwardMessageUseCase;

  beforeEach(() => {
    prisma = {
      message: { findUnique: vi.fn().mockResolvedValue(textMessage()) },
      participant: {
        findFirst: vi.fn().mockResolvedValue({ clearedAt: null }),
      },
    };
    crypto = {
      decrypt: vi.fn((value: string) => value.replace(/^enc:/, '')),
    };
    send = { execute: vi.fn().mockResolvedValue({ id: 'new' }) };
    useCase = new ForwardMessageUseCase(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      send as unknown as SendMessageUseCase,
    );
  });

  it('sends the decrypted text to each chat once, marked as forwarded', async () => {
    const result = await useCase.execute('me', 'm-1', ['c-a', 'c-b', 'c-a']);

    expect(result).toEqual({ sent: ['c-a', 'c-b'], failed: [] });
    expect(send.execute).toHaveBeenCalledTimes(2);
    const args = send.execute.mock.calls[0];
    expect(args[0]).toBe('me');
    expect(args[1]).toBeUndefined();
    expect(args[2]).toBe('hola');
    expect(args[5]).toBe('c-a');
    expect(args[15]).toEqual({ forwarded: true });
  });

  it('forwards a shared post with its post', async () => {
    prisma.message.findUnique.mockResolvedValue(
      textMessage({ content: null, postId: 'p-1' }),
    );

    await useCase.execute('me', 'm-1', ['c-a']);

    const args = send.execute.mock.calls[0];
    expect(args[2]).toBe('');
    expect(args[7]).toBe('p-1');
  });

  it('refuses no chats and more than the limit', async () => {
    await expect(useCase.execute('me', 'm-1', [])).rejects.toMatchObject({
      status: 400,
    });
    const tooMany = Array.from(
      { length: CHAT_FORWARD_MAX + 1 },
      (_, i) => `c-${i}`,
    );
    await expect(useCase.execute('me', 'm-1', tooMany)).rejects.toMatchObject({
      status: 400,
    });
    expect(send.execute).not.toHaveBeenCalled();
  });

  it('hides a message the Profile cannot read', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);
    await expect(useCase.execute('me', 'm-1', ['c-a'])).rejects.toMatchObject({
      status: 404,
    });

    prisma.participant.findFirst.mockResolvedValue({
      clearedAt: new Date('2026-11-09T11:00:00.000Z'),
    });
    await expect(useCase.execute('me', 'm-1', ['c-a'])).rejects.toMatchObject({
      status: 404,
    });

    prisma.message.findUnique.mockResolvedValue(null);
    await expect(useCase.execute('me', 'm-x', ['c-a'])).rejects.toMatchObject({
      status: 404,
    });
    expect(send.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['a notice', { kind: 'SYSTEM' }],
    ['a deleted message', { isDeleted: true }],
    ['a paid message', { isLocked: true }],
    ['a file', { url: 'https://cdn/x.jpg' }],
    ['a voice note', { voiceUrl: 'https://cdn/x.m4a' }],
    ['a story', { storyId: 's-1' }],
    ['an empty message', { content: null }],
  ])('refuses %s', async (_name, overrides) => {
    prisma.message.findUnique.mockResolvedValue(textMessage(overrides));

    await expect(useCase.execute('me', 'm-1', ['c-a'])).rejects.toMatchObject({
      status: 400,
      errorCode: ErrorCode.MESSAGE_NOT_FORWARDABLE,
    });
    expect(send.execute).not.toHaveBeenCalled();
  });

  it('keeps going when one chat refuses, and says which', async () => {
    send.execute
      .mockRejectedValueOnce(
        Object.assign(new Error('blocked'), { errorCode: 'USER_BLOCKED' }),
      )
      .mockResolvedValueOnce({ id: 'new' });

    const result = await useCase.execute('me', 'm-1', ['c-a', 'c-b']);

    expect(result).toEqual({
      sent: ['c-b'],
      failed: [{ conversationId: 'c-a', errorCode: 'USER_BLOCKED' }],
    });
  });
});
