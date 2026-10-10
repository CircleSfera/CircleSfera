import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { useStoryStore } from '../stores/storyStore';
import { renderWithProviders } from '../test/test-utils';
import HighlightViewerPage from './HighlightViewerPage';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../services', () => ({
  highlightsApi: { getOne: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('../components/modals/CreateHighlightModal', () => ({
  default: (props: {
    isOpen: boolean;
    onClose: () => void;
    highlightId?: string;
    initialTitle: string;
    initialCoverUrl: string | null;
    initialStoryIds: string[];
  }) =>
    props.isOpen ? (
      <div role="dialog" aria-label="manage highlight">
        <span>
          {props.highlightId} | {props.initialTitle} |{' '}
          {props.initialCoverUrl ?? 'no cover'} |{' '}
          {props.initialStoryIds.join(',')}
        </span>
        <button type="button" onClick={props.onClose}>
          close manage
        </button>
      </div>
    ) : null,
}));

const highlight = (over: object = {}) => ({
  id: 'h1',
  profileId: 'me',
  title: 'Summer',
  coverUrl: 'cover.jpg',
  stories: [{ story: { id: 's1' } }, { story: { id: 's2' } }],
  ...over,
});

function visit(data: object | null = highlight()) {
  vi.mocked(highlightsApi.getOne).mockImplementation(() =>
    data
      ? Promise.resolve({ data } as never)
      : Promise.reject(new Error('404')),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/highlights/:id" element={<HighlightViewerPage />} />
    </Routes>,
    {
      routerProps: {
        initialEntries: ['/highlights/h1'],
        useTransitions: false,
      },
    },
  );
}
const viewer = () => useStoryStore.getState();

describe('HighlightViewerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ profile: { id: 'me' } as never });
    useStoryStore.setState({ isOpen: false, stories: [], initialIndex: 0 });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows it is loading, then opens the stories of the highlight from the first', async () => {
    const { container } = visit();
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    await waitFor(() => expect(viewer().isOpen).toBe(true));
    expect(highlightsApi.getOne).toHaveBeenCalledWith('h1');
    expect(viewer().stories.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(viewer().initialIndex).toBe(0);
  });

  it('says the highlight was not found and offers the way back', async () => {
    visit(null);

    fireEvent.click(await screen.findByRole('button', { name: 'Go Back' }));

    expect(screen.getByText('Highlight not found')).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith(-1);
    expect(viewer().isOpen).toBe(false);
  });

  it('opens nothing for a highlight with no stories', async () => {
    visit(highlight({ stories: [] }));
    await screen.findByRole('button', { name: 'Rename highlight' });
    expect(viewer().isOpen).toBe(false);
  });

  it('goes back when the story viewer is closed, and not before it opened', async () => {
    visit();
    await waitFor(() => expect(viewer().isOpen).toBe(true));
    expect(navigate).not.toHaveBeenCalled();

    useStoryStore.getState().closeStories();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(-1));
  });

  it('closes the story viewer when the page is left', async () => {
    const { unmount } = visit();
    await waitFor(() => expect(viewer().isOpen).toBe(true));

    unmount();

    expect(viewer().isOpen).toBe(false);
  });

  it('offers nothing to manage to someone who does not own the highlight', async () => {
    useAuthStore.setState({ profile: { id: 'someone-else' } as never });
    visit();

    await waitFor(() => expect(viewer().isOpen).toBe(true));
    expect(
      screen.queryByRole('button', { name: 'Edit highlight' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rename highlight' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete highlight' }),
    ).not.toBeInTheDocument();
  });

  describe('for its owner', () => {
    it('names each of its three controls differently', async () => {
      visit();
      await screen.findByRole('button', { name: 'Rename highlight' });
      expect(
        screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Edit highlight', 'Rename highlight', 'Delete highlight']);
    });

    const titleField = () =>
      screen.getByRole('textbox', { name: 'Rename highlight' });

    it('renames it and says so', async () => {
      vi.mocked(highlightsApi.update).mockResolvedValue({} as never);
      visit();

      fireEvent.click(
        await screen.findByRole('button', { name: 'Rename highlight' }),
      );
      expect(titleField()).toHaveValue('Summer');
      fireEvent.change(titleField(), { target: { value: '  Summer 2026  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Highlight updated'),
      );
      expect(highlightsApi.update).toHaveBeenCalledWith('h1', {
        title: 'Summer 2026',
      });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(highlightsApi.getOne).toHaveBeenCalledTimes(2);
    });

    it('does not save an empty title', async () => {
      visit(highlight({ title: null }));

      fireEvent.click(
        await screen.findByRole('button', { name: 'Rename highlight' }),
      );
      expect(titleField()).toHaveValue('');
      fireEvent.change(titleField(), { target: { value: '   ' } });
      fireEvent.submit(titleField());

      expect(highlightsApi.update).not.toHaveBeenCalled();
      expect(titleField()).toBeInTheDocument();
    });

    it('keeps the field open and says so when the rename fails', async () => {
      vi.mocked(highlightsApi.update).mockRejectedValue(new Error('down'));
      visit();

      fireEvent.click(
        await screen.findByRole('button', { name: 'Rename highlight' }),
      );
      fireEvent.change(titleField(), { target: { value: 'Autumn' } });
      fireEvent.submit(titleField());

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not update'),
      );
      expect(titleField()).toHaveValue('Autumn');
    });

    it('opens the dialog that changes its stories and cover, with what it has now', async () => {
      visit();

      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit highlight' }),
      );

      expect(
        await screen.findByText('h1 | Summer | cover.jpg | s1,s2'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'close manage' }));
      expect(
        screen.queryByRole('dialog', { name: 'manage highlight' }),
      ).not.toBeInTheDocument();
    });

    it('deletes it after asking, says so and goes back', async () => {
      vi.mocked(highlightsApi.delete).mockResolvedValue({} as never);
      const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
      visit();

      fireEvent.click(
        await screen.findByRole('button', { name: 'Delete highlight' }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Highlight deleted'),
      );
      expect(ask).toHaveBeenCalledWith('Delete this highlight?');
      expect(highlightsApi.delete).toHaveBeenCalledWith('h1');
      expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('deletes nothing when the answer is no', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      visit();

      fireEvent.click(
        await screen.findByRole('button', { name: 'Delete highlight' }),
      );

      expect(highlightsApi.delete).not.toHaveBeenCalled();
    });

    it('says so and stays when the highlight could not be deleted', async () => {
      vi.mocked(highlightsApi.delete).mockRejectedValue(new Error('down'));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      visit();
      await waitFor(() => expect(viewer().isOpen).toBe(true));

      fireEvent.click(screen.getByRole('button', { name: 'Delete highlight' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not delete'),
      );
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
