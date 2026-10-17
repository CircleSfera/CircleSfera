import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RegisterDto } from '../auth/dto/register.dto.js';
import { SendMessageDto } from '../chat/dto/send-message.dto.js';
import { CreateCommentDto } from '../comments/dto/create-comment.dto.js';
import { UpdateProfileDto } from '../profiles/dto/update-profile.dto.js';

// One limit per field, the same when writing and when editing.
async function refused(
  dto: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body));
  return errors.map((error) => error.property);
}

const registration = {
  email: 'new@example.com',
  password: 'a-long-password',
  username: 'new.person_1',
  dateOfBirth: '2000-01-01',
};

describe('input limits', () => {
  it('accepts a registration within every limit', async () => {
    expect(await refused(RegisterDto, registration)).toEqual([]);
  });

  it.each(['ab', 'a'.repeat(31), 'with space', 'acentuación', 'bad-dash'])(
    'refuses the username %s at registration, as when renaming',
    async (username) => {
      expect(await refused(RegisterDto, { ...registration, username })).toEqual(
        ['username'],
      );
    },
  );

  it('refuses a name over 50 characters at registration and when edited', async () => {
    const fullName = 'a'.repeat(51);
    expect(await refused(RegisterDto, { ...registration, fullName })).toEqual([
      'fullName',
    ]);
    expect(await refused(UpdateProfileDto, { fullName })).toEqual(['fullName']);
    expect(
      await refused(UpdateProfileDto, { fullName: 'a'.repeat(50) }),
    ).toEqual([]);
  });

  it('refuses a bio over 300 characters when edited', async () => {
    expect(await refused(UpdateProfileDto, { bio: 'a'.repeat(301) })).toEqual([
      'bio',
    ]);
    expect(await refused(UpdateProfileDto, { bio: 'a'.repeat(300) })).toEqual(
      [],
    );
  });

  it('refuses a comment over 1,000 characters when written', async () => {
    expect(
      await refused(CreateCommentDto, { content: 'a'.repeat(1001) }),
    ).toEqual(['content']);
    expect(
      await refused(CreateCommentDto, { content: 'a'.repeat(1000) }),
    ).toEqual([]);
  });

  it('refuses a message over 5,000 characters when sent', async () => {
    expect(
      await refused(SendMessageDto, { content: 'a'.repeat(5001) }),
    ).toEqual(['content']);
    expect(
      await refused(SendMessageDto, { content: 'a'.repeat(5000) }),
    ).toEqual([]);
  });
});
