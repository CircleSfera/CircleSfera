import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import { HashtagSticker } from './HashtagSticker';
import { QuizWidget } from './QuizWidget';
import { SliderWidget } from './SliderWidget';

vi.mock('../../services/api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

const quiz = (mine: number | null, withAnswer: boolean) => ({
  data: {
    id: 'qz',
    kind: 'QUIZ',
    settings: {
      question: 'Capital?',
      options: ['Rome', 'Madrid'],
      ...(withAnswer ? { correctIndex: 1 } : {}),
    },
    totalResponses: mine === null ? 3 : 4,
    myResponse: mine === null ? null : { optionIndex: mine, value: null },
    options: [
      { index: 0, text: 'Rome', votes: mine === 0 ? 2 : 1, percentage: 0 },
      { index: 1, text: 'Madrid', votes: 2, percentage: 0 },
    ],
  },
});

describe('QuizWidget', () => {
  it('takes one answer and then shows the right one and the wrong pick', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(quiz(null, false));
    vi.mocked(apiClient.post).mockResolvedValue(quiz(0, true));
    renderWithProviders(<QuizWidget stickerId="qz" />);
    await screen.findByText('Capital?');

    fireEvent.click(screen.getByRole('button', { name: 'Answer A: Rome' }));

    expect(
      await screen.findByText('Not this one: the right answer is marked'),
    ).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(
      'stories/stickers/qz/responses',
      {
        optionIndex: 0,
      },
    );
    expect(
      screen.getByRole('button', { name: 'Answer A: Rome' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Answer B: Madrid' }).className,
    ).toContain('border-green-500');
    expect(
      screen.getByRole('button', { name: 'Answer A: Rome' }).className,
    ).toContain('border-red-500');
    // One border colour each: the plain one would cover the right and the wrong.
    for (const name of ['Answer A: Rome', 'Answer B: Madrid']) {
      expect(screen.getByRole('button', { name }).className).not.toContain(
        'border-white/15',
      );
    }
  });

  it('says so when the answer is right', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(quiz(1, true));
    renderWithProviders(<QuizWidget stickerId="qz" />);

    expect(await screen.findByText('✓ Right answer')).toBeInTheDocument();
  });
});

describe('SliderWidget', () => {
  it('sends the value when the slider is let go, and shows the average', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        id: 'sl',
        kind: 'SLIDER',
        settings: { question: 'How much?', emoji: '🔥' },
        totalResponses: 0,
        myResponse: null,
        average: null,
      },
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        id: 'sl',
        kind: 'SLIDER',
        settings: { question: 'How much?', emoji: '🔥' },
        totalResponses: 2,
        myResponse: { optionIndex: null, value: 0.8 },
        average: 0.6,
      },
    });
    renderWithProviders(<SliderWidget stickerId="sl" />);
    const slider = await screen.findByRole('slider', {
      name: 'Slide to answer',
    });

    fireEvent.change(slider, { target: { value: '0.8' } });
    fireEvent.pointerUp(slider);

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        'stories/stickers/sl/responses',
        { value: 0.8 },
      ),
    );
    expect(await screen.findByText('Average: 60%')).toBeInTheDocument();
  });
});

describe('HashtagSticker', () => {
  it('opens the page of its hashtag', () => {
    renderWithProviders(<HashtagSticker tag="verano" />);

    expect(screen.getByRole('link', { name: 'Open #verano' })).toHaveAttribute(
      'href',
      '/explore/tags/verano',
    );
  });
});
