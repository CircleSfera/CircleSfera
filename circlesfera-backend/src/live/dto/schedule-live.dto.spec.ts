import { LIVE_TITLE_MAX_LENGTH } from '@circlesfera/shared';
import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ScheduleLiveDto } from './schedule-live.dto.js';
import { ScheduledLivesQueryDto } from './scheduled-lives-query.dto.js';
import { StartStreamDto } from './start-stream.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const check = (metatype: new () => object, value: unknown, type = 'body') =>
  pipe.transform(value, { type: type as 'body', metatype });

const ID = '0b6c1a52-5f0e-4f1a-9d43-3f2b5d1c7a10';

describe('ScheduleLiveDto', () => {
  const valid = {
    title: 'Ensayo abierto',
    audience: 'CLOSE_FRIENDS',
    startsAt: '2026-12-01T20:00:00.000Z',
  };

  it('accepts a title, an audience and an ISO date and time, trimming the title', async () => {
    await expect(
      check(ScheduleLiveDto, { ...valid, title: '  Ensayo  ' }),
    ).resolves.toMatchObject({ ...valid, title: 'Ensayo' });
  });

  it('leaves the audience out when not given', async () => {
    const { audience: _, ...rest } = valid;
    const dto = (await check(ScheduleLiveDto, rest)) as ScheduleLiveDto;
    expect(dto.audience).toBeUndefined();
  });

  it('lets a practice through, for the service to refuse with its code', async () => {
    await expect(
      check(ScheduleLiveDto, { ...valid, audience: 'PRACTICE' }),
    ).resolves.toMatchObject({ audience: 'PRACTICE' });
  });

  it.each([
    ['no title', { title: undefined }],
    ['a blank title', { title: '   ' }],
    ['a title too long', { title: 'x'.repeat(LIVE_TITLE_MAX_LENGTH + 1) }],
    ['an unknown audience', { audience: 'FOLLOWERS' }],
    ['no time', { startsAt: undefined }],
    ['a time that is not a date', { startsAt: 'tomorrow' }],
    ['a time that does not exist', { startsAt: '2026-02-30T10:00:00Z' }],
    ['an unknown field', { hostId: ID }],
  ])('refuses %s', async (_name, change) => {
    await expect(
      check(ScheduleLiveDto, { ...valid, ...change }),
    ).rejects.toBeTruthy();
  });
});

describe('ScheduledLivesQueryDto', () => {
  it('asks for one Profile by its id', async () => {
    await expect(
      check(ScheduledLivesQueryDto, { profileId: ID }, 'query'),
    ).resolves.toMatchObject({ profileId: ID });
  });

  it.each([[{}], [{ profileId: 'me' }]])('refuses %j', async (query) => {
    await expect(
      check(ScheduledLivesQueryDto, query, 'query'),
    ).rejects.toBeTruthy();
  });
});

describe('StartStreamDto', () => {
  it('takes the id of a scheduled live to go live from', async () => {
    await expect(
      check(StartStreamDto, { scheduledLiveId: ID }),
    ).resolves.toMatchObject({ scheduledLiveId: ID });
  });

  it('refuses a scheduled live that is not an id', async () => {
    await expect(
      check(StartStreamDto, { scheduledLiveId: 'next-friday' }),
    ).rejects.toBeTruthy();
  });
});
