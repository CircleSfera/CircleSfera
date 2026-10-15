import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import { StickerResultsCard } from './StickerResultsCard';

vi.mock('../../services/api', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('../UserAvatar', () => ({ default: () => null }));

const at = { x: 0, y: 0, scale: 1, rotation: 0 };
const person = (id: string) => ({
  id,
  username: id,
  fullName: null,
  avatar: null,
});
const answers = (data: object) =>
  vi.mocked(apiClient.get).mockResolvedValue({ data } as never);

beforeEach(() => vi.clearAllMocks());

describe('StickerResultsCard', () => {
  it('shows each option of a quiz with its votes, the right one, and who chose it', async () => {
    answers({
      id: 'qz',
      kind: 'QUIZ',
      settings: {
        question: 'Capital?',
        options: ['Roma', 'Madrid'],
        correctIndex: 1,
      },
      totalResponses: 3,
      myResponse: null,
      options: [
        { index: 0, text: 'Roma', votes: 1, percentage: 33.3 },
        { index: 1, text: 'Madrid', votes: 2, percentage: 66.7 },
      ],
      responders: [
        { optionIndex: 1, value: null, createdAt: '', profile: person('ana') },
        { optionIndex: 0, value: null, createdAt: '', profile: person('luis') },
        { optionIndex: 1, value: null, createdAt: '', profile: person('eva') },
      ],
    });
    renderWithProviders(
      <StickerResultsCard
        sticker={{ id: 'qz', kind: 'QUIZ', settings: {}, ...at }}
      />,
    );

    const card = await screen.findByRole('region', { name: 'Capital?' });
    expect(card).toHaveTextContent('3 responses');
    expect(screen.getByText('1 vote · 33 %')).toBeInTheDocument();
    expect(screen.getByText('2 votes · 67 %')).toBeInTheDocument();
    expect(screen.getAllByText('Right')).toHaveLength(1);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items.join('|')).toMatch(/Roma.*luis.*Madrid.*ana.*eva/);
  });

  it('shows the average of a slider and where each person left it', async () => {
    answers({
      id: 'sl',
      kind: 'SLIDER',
      settings: { question: '¿Te gusta?', emoji: '🔥' },
      totalResponses: 2,
      myResponse: null,
      average: 0.5,
      responders: [
        {
          optionIndex: null,
          value: 0.8,
          createdAt: '',
          profile: person('ana'),
        },
        {
          optionIndex: null,
          value: 0.2,
          createdAt: '',
          profile: person('luis'),
        },
      ],
    });
    renderWithProviders(
      <StickerResultsCard
        sticker={{ id: 'sl', kind: 'SLIDER', settings: {}, ...at }}
      />,
    );

    expect(await screen.findByText('Average: 50 %')).toBeInTheDocument();
    expect(screen.getByText('80 %')).toBeInTheDocument();
    expect(screen.getByText('20 %')).toBeInTheDocument();
  });

  it('lists the answers to a question, and says when there are none', async () => {
    answers({
      id: 'q',
      kind: 'QUESTION',
      settings: { prompt: 'Ask me' },
      totalResponses: 1,
      answers: [
        { id: 'a1', text: 'Why?', createdAt: '', profile: person('ana') },
      ],
    });
    const { unmount } = renderWithProviders(
      <StickerResultsCard
        sticker={{ id: 'q', kind: 'QUESTION', settings: {}, ...at }}
      />,
    );
    expect(await screen.findByText('Why?')).toBeInTheDocument();
    expect(screen.getByText('ana')).toBeInTheDocument();
    unmount();

    answers({
      id: 'q2',
      kind: 'QUESTION',
      settings: { prompt: 'P' },
      totalResponses: 0,
      answers: [],
    });
    renderWithProviders(
      <StickerResultsCard
        sticker={{ id: 'q2', kind: 'QUESTION', settings: {}, ...at }}
      />,
    );
    expect(await screen.findByText('No responses yet')).toBeInTheDocument();
  });

  it('says so when the results cannot be read', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('offline'));
    renderWithProviders(
      <StickerResultsCard
        sticker={{ id: 'x', kind: 'POLL', settings: {}, ...at }}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The responses could not be loaded.',
    );
    expect(screen.getByRole('region', { name: 'Poll' })).toBeInTheDocument();
  });
});
