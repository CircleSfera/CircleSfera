import { AD_CONSENT_TEXT_VERSION } from '@circlesfera/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdsConsentController,
  AnswerAdConsentDto,
} from './ads-consent.controller.js';

const user = {
  userId: 'u1',
  profileId: 'p1',
  email: 'a@example.com',
  role: 'USER' as const,
  isTestAccount: false,
};

describe('AdsConsentController', () => {
  const service = { status: vi.fn(), answer: vi.fn() };
  let controller: AdsConsentController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AdsConsentController(service as never);
  });

  it('reads and answers for the person (User), not the Profile in use', async () => {
    const body = {
      choice: 'GENERAL' as const,
      textVersion: AD_CONSENT_TEXT_VERSION,
      locale: 'es' as const,
      source: 'SETTINGS' as const,
    };
    await controller.status(user);
    await controller.answer(user, body);

    expect(service.status).toHaveBeenCalledWith('u1');
    expect(service.answer).toHaveBeenCalledWith('u1', body);
  });

  it('takes no answer without an explicit choice of the two', async () => {
    const valid = {
      choice: 'PERSONALISED',
      textVersion: AD_CONSENT_TEXT_VERSION,
      locale: 'en',
      source: 'PROMPT',
    };
    const errorsOf = (body: object) =>
      validate(plainToInstance(AnswerAdConsentDto, body));

    expect(await errorsOf(valid)).toHaveLength(0);
    const { choice: _omitted, ...withoutChoice } = valid;
    expect(await errorsOf(withoutChoice)).not.toHaveLength(0);
    expect(await errorsOf({ ...valid, choice: 'BOTH' })).not.toHaveLength(0);
    expect(await errorsOf({ ...valid, locale: 'fr' })).not.toHaveLength(0);
    expect(await errorsOf({ ...valid, source: 'ADMIN' })).not.toHaveLength(0);
  });
});
