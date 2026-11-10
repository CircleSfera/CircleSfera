import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SendMessageDto } from './send-message.dto.js';

const errorsOf = (body: object) =>
  validateSync(plainToInstance(SendMessageDto, body)).map((e) => e.property);

describe('SendMessageDto', () => {
  it('needs text unless the message is a GIF', () => {
    expect(errorsOf({ recipientId: 'r', content: '' })).toContain('content');
    expect(
      errorsOf({ recipientId: 'r', content: '', gifId: 'abc123' }),
    ).toEqual([]);
    expect(
      errorsOf({ recipientId: 'r', content: 'hi', gifId: 'abc123' }),
    ).toEqual([]);
  });

  it('takes only a GIPHY id made of letters and digits', () => {
    expect(
      errorsOf({ recipientId: 'r', content: '', gifId: '../x' }),
    ).toContain('gifId');
    expect(
      errorsOf({ recipientId: 'r', content: '', gifId: 'a'.repeat(65) }),
    ).toContain('gifId');
  });
});
