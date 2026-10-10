import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import InteractiveSubScreen, {
  type InteractiveDraft,
} from './InteractiveSubScreen';

function show(value: InteractiveDraft = null) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <InteractiveSubScreen
      value={value}
      onChange={onChange}
      onClose={onClose}
    />,
  );
  const type = (placeholder: string, text: string) =>
    fireEvent.change(screen.getByPlaceholderText(placeholder), {
      target: { value: text },
    });
  const save = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  return { onChange, onClose, type, save };
}

describe('InteractiveSubScreen', () => {
  it('saves a poll with its question and two answers, trimmed', () => {
    const { onChange, onClose, type, save } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Poll' }));
    // The two answers start as yes and no.
    expect(screen.getByPlaceholderText('Option A')).toHaveValue('Yes');
    expect(screen.getByPlaceholderText('Option B')).toHaveValue('No');

    type('Ask a question…', '  Beach or mountain?  ');
    type('Option A', ' Beach ');
    type('Option B', 'Mountain');
    save();

    expect(onChange).toHaveBeenCalledWith({
      kind: 'poll',
      question: 'Beach or mountain?',
      options: ['Beach', 'Mountain'],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no question', { 'Ask a question…': '   ' }],
    ['an empty answer', { 'Ask a question…': 'Which?', 'Option B': ' ' }],
  ])('does not save a poll with %s, and stays open', (_what, fields) => {
    const { onChange, onClose, type, save } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Poll' }));

    for (const [placeholder, text] of Object.entries(fields)) {
      type(placeholder, text);
    }
    save();

    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves a question box with its prompt', () => {
    const { onChange, type, save } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));

    type('Ask me anything…', ' Ask about the trip ');
    save();

    expect(onChange).toHaveBeenCalledWith({
      kind: 'qna',
      prompt: 'Ask about the trip',
    });
  });

  it('does not save a question box with no prompt', () => {
    const { onChange, save } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));

    save();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens on what was attached before', () => {
    show({ kind: 'poll', question: 'Tea?', options: ['Sure', 'Never'] });

    expect(screen.getByPlaceholderText('Ask a question…')).toHaveValue('Tea?');
    expect(screen.getByPlaceholderText('Option A')).toHaveValue('Sure');
    expect(screen.getByPlaceholderText('Option B')).toHaveValue('Never');
  });

  it('takes the poll or the question box off with None', () => {
    const { onChange, onClose, save } = show({ kind: 'qna', prompt: 'Ask' });
    expect(screen.getByPlaceholderText('Ask me anything…')).toHaveValue('Ask');

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    save();

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when left with the back arrow', () => {
    const { onChange, onClose } = show();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
