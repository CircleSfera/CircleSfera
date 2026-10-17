import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateSettingsDto } from './update-settings.dto.js';

const errorsFor = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateSettingsDto, body))).map(
    (e) => e.property,
  );

describe('UpdateSettingsDto: country', () => {
  it('takes a country of the closed list, whatever its case', async () => {
    expect(await errorsFor({ country: 'es' })).toEqual([]);
    expect(plainToInstance(UpdateSettingsDto, { country: 'es' }).country).toBe(
      'ES',
    );
  });

  it('takes null, which goes back to the country of the network', async () => {
    expect(await errorsFor({ country: null })).toEqual([]);
  });

  it.each(['Spain', 'XY', 'ESP', ''])('refuses %s', async (country) => {
    expect(await errorsFor({ country })).toEqual(['country']);
  });
});
