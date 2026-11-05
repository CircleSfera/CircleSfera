import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hiddenWordsApi } from '../../services/hiddenWords.service';
import { renderWithProviders } from '../../test/test-utils';
import HiddenWordsSettings from './HiddenWordsSettings';

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../services/hiddenWords.service', () => ({
  hiddenWordsApi: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
}));

const listed = (words: string[]) =>
  vi.mocked(hiddenWordsApi.list).mockResolvedValue({
    data: {
      words: words.map((word) => ({ word, createdAt: '2026-11-01' })),
      max: 500,
    },
  } as never);

describe('HiddenWordsSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the words with how many more fit, and says when there are none', async () => {
    listed([]);
    const { unmount } = renderWithProviders(<HiddenWordsSettings />);
    expect(
      await screen.findByText('You have not hidden any words yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0 of 500')).toBeInTheDocument();
    unmount();

    listed(['feo', '🐍']);
    renderWithProviders(<HiddenWordsSettings />);
    expect(await screen.findByText('feo')).toBeInTheDocument();
    expect(screen.getByText('🐍')).toBeInTheDocument();
    expect(screen.getByText('2 of 500')).toBeInTheDocument();
  });

  it('adds a word and empties the field', async () => {
    listed([]);
    vi.mocked(hiddenWordsApi.add).mockResolvedValue({} as never);
    renderWithProviders(<HiddenWordsSettings />);
    const field = await screen.findByRole('textbox', {
      name: 'Add a word, phrase or emoji',
    });

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '  pésimo ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(hiddenWordsApi.add).toHaveBeenCalledWith('pésimo'),
    );
    await waitFor(() => expect(field).toHaveValue(''));
    expect(toast.success).toHaveBeenCalledWith('Word hidden');
  });

  it('says why a word was refused', async () => {
    listed([]);
    vi.mocked(hiddenWordsApi.add).mockRejectedValue({
      response: { data: { errorCode: 'HIDDEN_WORDS_FULL' } },
    });
    renderWithProviders(<HiddenWordsSettings />);
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'otra' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'You have hidden as many words as you can. Remove one to add another.',
      ),
    );
  });

  it('removes a word', async () => {
    listed(['feo']);
    vi.mocked(hiddenWordsApi.remove).mockResolvedValue({} as never);
    renderWithProviders(<HiddenWordsSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove feo' }));
    await waitFor(() =>
      expect(hiddenWordsApi.remove).toHaveBeenCalledWith('feo'),
    );
  });

  it('offers to try again when the list did not load', async () => {
    vi.mocked(hiddenWordsApi.list).mockRejectedValue(new Error('down'));
    renderWithProviders(<HiddenWordsSettings />);
    expect(
      await screen.findByRole('button', { name: /try again|retry/i }),
    ).toBeInTheDocument();
  });
});
