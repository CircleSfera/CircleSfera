import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PushController } from '../push.controller.js';
import { SubscribePushDto } from './subscribe.dto.js';

describe('SubscribePushDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = (body: unknown) =>
    pipe.transform(body, {
      type: 'body',
      metatype: SubscribePushDto,
    });

  it('accepts a browser PushSubscriptionJSON including expirationTime', async () => {
    const result = await transform({
      endpoint: 'https://push.example.com/abc',
      expirationTime: null,
      keys: { p256dh: 'p', auth: 'a' },
    });

    expect(result).toMatchObject({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('rejects unknown top-level fields', async () => {
    await expect(
      transform({
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p', auth: 'a' },
        extra: true,
      }),
    ).rejects.toBeTruthy();
  });
});

describe('PushController subscribe metadata', () => {
  it('keeps SubscribePushDto as a runtime Body metatype', () => {
    const types = Reflect.getMetadata(
      'design:paramtypes',
      PushController.prototype,
      'subscribe',
    ) as unknown[] | undefined;
    expect(types?.[1]).toBe(SubscribePushDto);
  });
});
