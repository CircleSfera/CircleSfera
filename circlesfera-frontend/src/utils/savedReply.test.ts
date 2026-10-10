import { describe, expect, it } from 'vitest';
import {
  addToDraft,
  fillSavedReply,
  requesterGreetingName,
} from './savedReply';

describe('saved replies', () => {
  const ticket = { name: 'Ana', subject: 'My payout', reference: 1042 };

  it('fills the name, the subject and the number of the request', () => {
    expect(
      fillSavedReply(
        'Hello {{name}}, about "{{subject}}" (request #{{reference}}).',
        ticket,
      ),
    ).toBe('Hello Ana, about "My payout" (request #1042).');
  });

  it('accepts spaces and capitals inside the braces, and fills every occurrence', () => {
    expect(fillSavedReply('{{ Name }} / {{NAME}} / {{name}}', ticket)).toBe(
      'Ana / Ana / Ana',
    );
  });

  it('leaves an unknown placeholder exactly as written', () => {
    expect(fillSavedReply('Your plan is {{plan}}, {{name}}.', ticket)).toBe(
      'Your plan is {{plan}}, Ana.',
    );
  });

  it('leaves a placeholder whose value is not known as written', () => {
    expect(
      fillSavedReply('Hello {{name}}, request #{{reference}}: {{subject}}', {
        name: '  ',
        subject: null,
      }),
    ).toBe('Hello {{name}}, request #{{reference}}: {{subject}}');
  });

  it('does not treat what a requester wrote as a placeholder to fill again', () => {
    expect(
      fillSavedReply('About {{subject}}', { subject: 'I typed {{name}}' }),
    ).toBe('About I typed {{name}}');
  });

  it('leaves other braces alone', () => {
    expect(fillSavedReply('{name} {{}} {{ }} {{a b}}', ticket)).toBe(
      '{name} {{}} {{ }} {{a b}}',
    );
  });

  it('puts the text alone in an empty box and after a blank line otherwise', () => {
    expect(addToDraft('', 'Saved')).toBe('Saved');
    expect(addToDraft('  \n', 'Saved')).toBe('Saved');
    expect(addToDraft('Written first.\n', 'Saved')).toBe(
      'Written first.\n\nSaved',
    );
  });

  it('greets by the first name, then by the username, and by nothing when neither is known', () => {
    expect(
      requesterGreetingName({ fullName: ' Ana María López ', username: 'ana' }),
    ).toBe('Ana');
    expect(requesterGreetingName({ fullName: '', username: 'ana' })).toBe(
      'ana',
    );
    expect(requesterGreetingName({ fullName: null })).toBeUndefined();
    expect(requesterGreetingName(null)).toBeUndefined();
  });
});
