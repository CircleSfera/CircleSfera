import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightsApi } from '../services';
import { useStoryStore } from '../stores/storyStore';
import { renderWithProviders } from '../test/test-utils';
import HighlightViewerPage from './HighlightViewerPage';

const session = vi.hoisted(() => ({
  profile: { id: 'p-me' } as { id: string } | null,
}));
vi.mock('../services', () => ({
  highlightsApi: { getOne: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('../stores/authStore', () => ({
  useAuthStore: (pick: (state: typeof session) => unknown) => pick(session),
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});
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
      <div data-testid="manage">
        {props.highlightId}|{props.initialTitle}|{String(props.initialCoverUrl)}
        |{props.initialStoryIds.join(',')}
        <button type="button" onClick={props.onClose}>
          close manage
        </button>
      </div>
    ) : null,
}));

const api = vi.mocked(highlightsApi);
const highlight = (over: object = {}) => ({
  id: 'h-1',
  profileId: 'p-me',
  title: 'Summer',
  coverUrl: 'https://cdn.test/cover.jpg',
  stories: [{ story: { id: 's-1' } }, { story: { id: 's-2' } }],
  ...over,
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
}
const show = async (data: object | null = highlight()) => {
  api.getOne.mockResolvedValue({ data } as never);
  const view = renderWithProviders(
    <>
      <Routes>
        <Route path="/profile" element={<p>the profile</p>} />
        <Route path="/highlights/:id" element={<HighlightViewerPage />} />
      </Routes>
      <Where />
    </>,
    {
      routerProps: {
        useTransitions: false,
        initialEntries: ['/profile', '/highlights/h-1'],
      },
    },
  );
  await waitFor(() => expect(api.getOne).toHaveBeenCalledWith('h-1'));
  return view;
};
const where = () => screen.getByTestId('where').textContent;
const remove = () => screen.findByRole('button', { name: 'Delete highlight' });
const edits = () => screen.findAllByRole('button', { name: 'Edit highlight' });

describe('HighlightViewerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.profile = { id: 'p-me' };
    useStoryStore.setState({ isOpen: false, stories: [], initialIndex: 0 });
    api.update.mockResolvedValue({} as never);
    api.delete.mockResolvedValue({} as never);
  });

  it('opens the stories of the highlight in the viewer, from the first', async () => {
    await show();

    await waitFor(() => expect(useStoryStore.getState().isOpen).toBe(true));
    expect(useStoryStore.getState().stories).toEqual([
      { id: 's-1' },
      { id: 's-2' },
    ]);
    expect(useStoryStore.getState().initialIndex).toBe(0);
  });

  it('goes back when the viewer is closed', async () => {
    await show();
    await waitFor(() => expect(useStoryStore.getState().isOpen).toBe(true));

    act(() => useStoryStore.getState().closeStories());

    await waitFor(() => expect(where()).toBe('/profile'));
  });

  it('closes the viewer when the page is left', async () => {
    const { unmount } = await show();
    await waitFor(() => expect(useStoryStore.getState().isOpen).toBe(true));

    unmount();

    expect(useStoryStore.getState().isOpen).toBe(false);
  });

  it('says the highlight was not found, with a way back', async () => {
    await show(null);

    expect(await screen.findByText('Highlight not found')).toBeInTheDocument();
    expect(useStoryStore.getState().isOpen).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    await waitFor(() => expect(where()).toBe('/profile'));
  });

  it('opens no viewer for a highlight without stories', async () => {
    await show(highlight({ stories: [] }));

    await remove();
    expect(useStoryStore.getState().isOpen).toBe(false);
  });

  it('offers nothing to manage to someone else, or to a visitor', async () => {
    await show(highlight({ profileId: 'p-other' }));
    await waitFor(() => expect(useStoryStore.getState().isOpen).toBe(true));
    expect(
      screen.queryByRole('button', { name: 'Delete highlight' }),
    ).not.toBeInTheDocument();
  });

  it('offers nothing to manage without a session', async () => {
    session.profile = null;
    await show();
    await waitFor(() => expect(useStoryStore.getState().isOpen).toBe(true));

    expect(
      screen.queryByRole('button', { name: 'Edit highlight' }),
    ).not.toBeInTheDocument();
  });

  it('renames the highlight and says so', async () => {
    const { queryClient } = await show();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const [, renameButton] = await edits();

    fireEvent.click(renameButton);
    const field = screen.getByPlaceholderText('Summer');
    expect(field).toHaveValue('Summer');
    fireEvent.change(field, { target: { value: '  Winter ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('h-1', { title: 'Winter' }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Highlight updated'),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['highlight', 'h-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['highlights'] });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
    );
  });

  it('saves no empty title', async () => {
    await show(highlight({ title: null }));
    const [, renameButton] = await edits();

    fireEvent.click(renameButton);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.update).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('says so when the title could not be saved, and keeps the field', async () => {
    api.update.mockRejectedValue(new Error('down'));
    await show();
    const [, renameButton] = await edits();

    fireEvent.click(renameButton);
    fireEvent.change(screen.getByPlaceholderText('Summer'), {
      target: { value: 'Winter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not update'),
    );
    expect(screen.getByPlaceholderText('Summer')).toHaveValue('Winter');
  });

  it('opens the stories picker with what the highlight has, and closes it', async () => {
    await show();
    const [manageButton] = await edits();

    fireEvent.click(manageButton);

    const picker = await screen.findByTestId('manage');
    expect(picker).toHaveTextContent(
      'h-1|Summer|https://cdn.test/cover.jpg|s-1,s-2',
    );
    fireEvent.click(screen.getByRole('button', { name: 'close manage' }));
    await waitFor(() =>
      expect(screen.queryByTestId('manage')).not.toBeInTheDocument(),
    );
  });

  it('passes on no title, no cover and only the stories that still exist', async () => {
    await show(
      highlight({
        title: null,
        coverUrl: null,
        stories: [{ story: { id: 's-1' } }, { story: {} }],
      }),
    );
    const [manageButton] = await edits();

    fireEvent.click(manageButton);

    expect(await screen.findByTestId('manage')).toHaveTextContent(
      'h-1||null|s-1',
    );
  });

  it('deletes after the person confirms, says so and goes back', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { queryClient } = await show();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await remove());

    expect(confirm).toHaveBeenCalledWith('Delete this highlight?');
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('h-1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Highlight deleted'),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['highlights'] });
    await waitFor(() => expect(where()).toBe('/profile'));
  });

  it('deletes nothing when the person says no', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await show();

    fireEvent.click(await remove());

    expect(api.delete).not.toHaveBeenCalled();
  });

  it('says so when the delete fails, and stays', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockRejectedValue(new Error('down'));
    await show();

    fireEvent.click(await remove());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not delete'),
    );
    expect(where()).toBe('/highlights/h-1');
  });
});
