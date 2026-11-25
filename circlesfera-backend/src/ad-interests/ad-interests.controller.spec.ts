import { AD_INTEREST_TOPICS, AD_INTERESTS_MAX } from '@circlesfera/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { isCsrfExempt } from '../common/config/csrf.config.js';
import {
  AdInterestsController,
  ChooseAdInterestsDto,
} from './ad-interests.controller.js';

const user = {
  userId: 'u1',
  profileId: 'p1',
  email: 'a@example.com',
  role: 'USER' as const,
  isTestAccount: false,
};

const errorsOf = (body: object) =>
  validate(plainToInstance(ChooseAdInterestsDto, body));

describe('AdInterestsController', () => {
  const service = { status: vi.fn(), choose: vi.fn() };
  let controller: AdInterestsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AdInterestsController(service as never);
  });

  it('reads and writes the interests of the session’s person (User), never another’s', async () => {
    await controller.status(user);
    await controller.choose(user, { topics: ['travel'] });

    expect(service.status).toHaveBeenCalledWith('u1');
    expect(service.choose).toHaveBeenCalledWith('u1', ['travel']);
  });

  it('is only for a signed-in session, and the write needs the CSRF token like every other', () => {
    expect(Reflect.getMetadata('__guards__', AdInterestsController)).toEqual([
      JwtAuthGuard,
    ]);
    expect(isCsrfExempt('/api/v1/users/me/ad-interests')).toBe(false);
  });

  describe('the set it takes', () => {
    it('takes topics of the list up to the most, and an empty set', async () => {
      expect(await errorsOf({ topics: [] })).toHaveLength(0);
      expect(await errorsOf({ topics: ['travel', 'music'] })).toHaveLength(0);
      expect(
        await errorsOf({
          topics: AD_INTEREST_TOPICS.slice(0, AD_INTERESTS_MAX),
        }),
      ).toHaveLength(0);
    });

    it.each([
      ['no set', {}],
      ['a set that is not a list', { topics: 'travel' }],
      ['an unknown key', { topics: ['politics'] }],
      ['`other`', { topics: ['other'] }],
      ['a repeated topic', { topics: ['travel', 'travel'] }],
      [
        'more than the most',
        { topics: AD_INTEREST_TOPICS.slice(0, AD_INTERESTS_MAX + 1) },
      ],
    ])('refuses %s', async (_case, body) => {
      expect(await errorsOf(body)).not.toHaveLength(0);
    });
  });
});
