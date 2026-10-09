import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateProfileDto } from './update-profile.dto.js';

const errorsFor = (body: Record<string, unknown>) =>
  validate(plainToInstance(UpdateProfileDto, body));

describe('UpdateProfileDto: profile colour', () => {
  it('accepts a colour of the closed list', async () => {
    expect(await errorsFor({ accentColor: 'teal' })).toEqual([]);
  });

  it('accepts null, which goes back to the colour of the app', async () => {
    expect(await errorsFor({ accentColor: null })).toEqual([]);
  });

  it.each(['#ff5757', 'coral', 'red', ''])(
    'refuses %s, which is not on the list',
    async (accentColor) => {
      const errors = await errorsFor({ accentColor });
      expect(errors.map((error) => error.property)).toEqual(['accentColor']);
    },
  );
});
