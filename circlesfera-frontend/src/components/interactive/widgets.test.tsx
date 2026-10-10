import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import { PollWidget } from './PollWidget';
import { QnaWidget } from './QnaWidget';

vi.mock('../../services/api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }));

const poll = (userVoteIndex: number | null, votes = [3, 1]) => {
  const total = votes[0] + votes[1];
  return {
    id: 'poll-1',
    question: 'Sea or mountain?',
    totalVotes: total,
    userVoteIndex,
    options: ['Sea', 'Mountain'].map((text, index) => ({
      index,
      text,
      votes: votes[index],
      percentage: total ? Math.round((votes[index] / total) * 100) : 0,
    })),
  };
};

beforeEach(() => vi.clearAllMocks());

describe('PollWidget', () => {
  const option = (name: RegExp) => screen.getByRole('button', { name });

  it('says it is loading, then shows the question and its options', async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(apiClient.get).mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    renderWithProviders(<PollWidget pollId="poll-1" />);

    expect(screen.getByText('Loading poll…')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('interactive/poll/poll-1');

    finish({ data: poll(null) });
    expect(await screen.findByText('Sea or mountain?')).toBeInTheDocument();
    expect(option(/Sea/)).toHaveAttribute('aria-pressed', 'false');
    expect(option(/Mountain/)).toBeInTheDocument();
  });

  it('keeps the results out of sight until the person has voted', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: poll(null) });
    renderWithProviders(<PollWidget pollId="poll-1" />);
    await screen.findByText('Sea or mountain?');

    expect(screen.queryByText('75%')).not.toBeInTheDocument();
    expect(screen.queryByText('✓ Vote recorded')).not.toBeInTheDocument();
    expect(screen.getByText('4 votes')).toBeInTheDocument();
  });

  it('records the vote and shows the results with the chosen option marked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: poll(null) });
    vi.mocked(apiClient.post).mockResolvedValue({ data: poll(1, [3, 2]) });
    const { container } = renderWithProviders(<PollWidget pollId="poll-1" />);
    await screen.findByText('Sea or mountain?');

    fireEvent.click(option(/Mountain/));

    expect(await screen.findByText('✓ Vote recorded')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('interactive/poll/vote', {
      pollId: 'poll-1',
      optionIndex: 1,
    });
    expect(option(/Mountain/)).toHaveAttribute('aria-pressed', 'true');
    expect(option(/Sea/)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('5 votes')).toBeInTheDocument();
    const bars = [
      ...container.querySelectorAll<HTMLElement>('.bg-accent-blue\\/20'),
    ];
    expect(bars.map((bar) => bar.style.width)).toEqual(['60%', '40%']);
  });

  it('shows the results at once to someone who voted before', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: poll(0) });
    renderWithProviders(<PollWidget pollId="poll-1" />);

    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(option(/Sea/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('takes no second press while a vote is on its way', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: poll(null) });
    vi.mocked(apiClient.post).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<PollWidget pollId="poll-1" />);
    await screen.findByText('Sea or mountain?');

    fireEvent.click(option(/Sea/));

    expect(option(/Sea/)).toBeDisabled();
    expect(option(/Mountain/)).toBeDisabled();
  });

  it('says the vote did not count when it fails, and lets the person try again', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: poll(null) });
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('down'));
    renderWithProviders(<PollWidget pollId="poll-1" />);
    await screen.findByText('Sea or mountain?');

    fireEvent.click(option(/Sea/));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your vote could not be recorded. Try again.',
    );
    expect(option(/Sea/)).toBeEnabled();
    expect(option(/Sea/)).toHaveAttribute('aria-pressed', 'false');

    vi.mocked(apiClient.post).mockResolvedValue({ data: poll(0, [4, 1]) });
    fireEvent.click(option(/Sea/));
    expect(await screen.findByText('✓ Vote recorded')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows nothing when the poll cannot be loaded', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('gone'));
    const { container } = renderWithProviders(<PollWidget pollId="poll-1" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('loads the other poll when the post changes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: poll(null) });
    const { rerender } = renderWithProviders(<PollWidget pollId="poll-1" />);
    await screen.findByText('Sea or mountain?');

    rerender(<PollWidget pollId="poll-2" />);

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenLastCalledWith('interactive/poll/poll-2'),
    );
  });
});

describe('QnaWidget', () => {
  const field = () =>
    screen.getByRole('textbox', { name: 'Write your answer…' });
  const send = () => screen.getByRole('button', { name: 'Send answer' });

  describe('for someone answering', () => {
    it('shows the question it is given and asks the server for nothing', () => {
      renderWithProviders(
        <QnaWidget qnaBoxId="box-1" prompt="Where should I go next?" />,
      );

      expect(screen.getByText('Where should I go next?')).toBeInTheDocument();
      expect(apiClient.get).not.toHaveBeenCalled();
      expect(send()).toBeDisabled();
    });

    it('shows a general invitation when it is given no question', () => {
      renderWithProviders(<QnaWidget qnaBoxId="box-1" />);
      expect(screen.getByText('Ask me anything…')).toBeInTheDocument();
    });

    it('sends the answer and says it was sent', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
      renderWithProviders(<QnaWidget qnaBoxId="box-1" />);

      fireEvent.change(field(), { target: { value: 'Lisbon' } });
      fireEvent.click(send());

      expect(
        await screen.findByText('Answer sent to the creator!'),
      ).toBeInTheDocument();
      expect(apiClient.post).toHaveBeenCalledWith('interactive/qna/answer', {
        qnaBoxId: 'box-1',
        answerText: 'Lisbon',
      });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('does not send an empty answer', () => {
      renderWithProviders(<QnaWidget qnaBoxId="box-1" />);

      fireEvent.change(field(), { target: { value: '   ' } });
      fireEvent.submit(field());

      expect(send()).toBeDisabled();
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('takes no second press while the answer is on its way', () => {
      vi.mocked(apiClient.post).mockReturnValue(new Promise(() => {}));
      renderWithProviders(<QnaWidget qnaBoxId="box-1" />);

      fireEvent.change(field(), { target: { value: 'Lisbon' } });
      fireEvent.click(send());

      expect(send()).toBeDisabled();
    });

    it('says the answer was not sent when it fails, and keeps what was written', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('down'));
      renderWithProviders(<QnaWidget qnaBoxId="box-1" />);

      fireEvent.change(field(), { target: { value: 'Lisbon' } });
      fireEvent.click(send());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Your answer could not be sent. Try again.',
      );
      expect(field()).toHaveValue('Lisbon');
      expect(
        screen.queryByText('Answer sent to the creator!'),
      ).not.toBeInTheDocument();

      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
      fireEvent.click(send());
      expect(
        await screen.findByText('Answer sent to the creator!'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('for the creator', () => {
    const box = {
      id: 'box-1',
      prompt: 'Where should I go next?',
      totalAnswers: 2,
      answers: [
        {
          id: 'a1',
          answerText: 'Lisbon',
          createdAt: '',
          user: { id: 'u1', username: 'ana' },
        },
        {
          id: 'a2',
          answerText: 'Kyoto',
          createdAt: '',
          user: { id: 'u2', username: 'ben' },
        },
      ],
    };

    it('lists the answers with who gave each, and no field to answer', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: box });
      renderWithProviders(<QnaWidget qnaBoxId="box-1" isOwner />);

      expect(screen.getByText('Loading answers…')).toBeInTheDocument();
      expect(await screen.findByText('Lisbon')).toBeInTheDocument();
      expect(apiClient.get).toHaveBeenCalledWith('interactive/qna/box-1');
      expect(screen.getByText('@ana')).toBeInTheDocument();
      expect(screen.getByText('@ben')).toBeInTheDocument();
      expect(screen.getByText('2 answers')).toBeInTheDocument();
      expect(screen.getByText('Where should I go next?')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('says there are no answers yet', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { ...box, totalAnswers: 0, answers: [] },
      });
      renderWithProviders(<QnaWidget qnaBoxId="box-1" isOwner />);

      expect(await screen.findByText('No answers yet.')).toBeInTheDocument();
      expect(screen.getByText('0 answers')).toBeInTheDocument();
    });

    it('shows an empty list when the answers cannot be loaded', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('down'));
      renderWithProviders(<QnaWidget qnaBoxId="box-1" isOwner />);

      expect(await screen.findByText('No answers yet.')).toBeInTheDocument();
      expect(screen.getByText('Ask me anything…')).toBeInTheDocument();
    });
  });
});
