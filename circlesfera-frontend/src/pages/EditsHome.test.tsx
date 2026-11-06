import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editsService } from '../services/edits.service';
import { useStudioStore } from '../stores/studioStore';
import { mediaClip, studioTrack } from '../test/studio-fixtures';
import { renderWithProviders } from '../test/test-utils';
import type { StudioProject } from '../types/studio';
import {
  clearLocalStudioDraft,
  loadLocalStudioDraft,
} from '../utils/studioLocalDraft';
import EditsHome, { EDITOR_PATH, studioOf } from './EditsHome';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../components/common/SEO', () => ({ default: () => null }));
vi.mock('../services/edits.service', () => ({
  editsService: { getProjects: vi.fn(), deleteProject: vi.fn() },
}));
vi.mock('../utils/studioLocalDraft', () => ({
  loadLocalStudioDraft: vi.fn(),
  clearLocalStudioDraft: vi.fn(),
}));

const studio = (name: string, seconds = 12): StudioProject => ({
  id: name,
  name,
  duration: seconds,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks: [
    studioTrack('v1', 'video', [
      mediaClip('c', { trackId: 'v1', startAt: 0, duration: seconds }),
    ]),
  ],
  createdAt: '',
  updatedAt: '',
});

const saved = (
  id: string,
  name: string,
  mediaUrl: string,
  mediaType = 'video',
) => ({
  id,
  userId: 'u',
  name,
  mediaUrl,
  mediaType,
  state: { version: 3, studio: studio(name) },
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
});

describe('EditsHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({ project: null, cloudProjectId: null });
    vi.mocked(loadLocalStudioDraft).mockResolvedValue(null);
    vi.mocked(clearLocalStudioDraft).mockResolvedValue();
    vi.mocked(editsService.getProjects).mockResolvedValue([] as never);
  });

  it('tells a studio project apart from an edit of one photo', () => {
    expect(studioOf(saved('a', 'A', 'x') as never)).toMatchObject({
      name: 'A',
    });
    expect(
      studioOf({
        ...saved('b', 'B', 'x'),
        state: { filter: '', adjustments: {} },
      } as never),
    ).toBeNull();
  });

  it('says there are no projects yet', async () => {
    renderWithProviders(<EditsHome />);
    expect(
      await screen.findByText('You have no projects yet.'),
    ).toBeInTheDocument();
  });

  it('says when the projects cannot be loaded', async () => {
    vi.mocked(editsService.getProjects).mockRejectedValue(new Error('down'));
    renderWithProviders(<EditsHome />);
    expect(await screen.findByText(/load/i)).toBeInTheDocument();
  });

  it('starts a new project and opens the editor', async () => {
    renderWithProviders(<EditsHome />);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(EDITOR_PATH));
    expect(clearLocalStudioDraft).toHaveBeenCalled();
    expect(useStudioStore.getState().project).toMatchObject({
      aspectRatio: '9:16',
      duration: 0,
    });
    expect(useStudioStore.getState().cloudProjectId).toBeNull();
  });

  it('lists the projects kept, with a picture and length, and opens one', async () => {
    vi.mocked(editsService.getProjects).mockResolvedValue([
      saved('p1', 'Trip', 'https://cdn/trip.mp4'),
      saved('p2', 'Food', 'https://cdn/food.jpg', 'image'),
      {
        ...saved('p3', 'Photo edit', 'https://cdn/x.jpg'),
        state: { filter: '', adjustments: {} },
      },
    ] as never);
    const { container } = renderWithProviders(<EditsHome />);
    expect(await screen.findByText('Trip')).toBeInTheDocument();
    expect(screen.queryByText('Photo edit')).not.toBeInTheDocument();
    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      'https://cdn/trip.mp4#t=0.1',
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn/food.jpg',
    );
    expect(screen.getAllByText('0:12')).toHaveLength(2);

    fireEvent.click(screen.getByText('Trip'));
    expect(useStudioStore.getState().cloudProjectId).toBe('p1');
    expect(useStudioStore.getState().project?.name).toBe('Trip');
    expect(navigate).toHaveBeenCalledWith(EDITOR_PATH);
  });

  it('deletes a project after asking, forgetting it if it was open', async () => {
    vi.mocked(editsService.getProjects).mockResolvedValue([
      saved('p1', 'Trip', 'https://cdn/trip.mp4'),
    ] as never);
    vi.mocked(editsService.deleteProject).mockResolvedValue();
    useStudioStore.setState({ cloudProjectId: 'p1' });
    renderWithProviders(<EditsHome />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for Trip' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Delete|Confirm/,
        hidden: false,
      }),
    );
    await waitFor(() =>
      expect(editsService.deleteProject).toHaveBeenCalledWith('p1'),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(useStudioStore.getState().cloudProjectId).toBeNull();
    expect(clearLocalStudioDraft).toHaveBeenCalled();
  });

  it('says so when a project cannot be deleted', async () => {
    vi.mocked(editsService.getProjects).mockResolvedValue([
      saved('p1', 'Trip', 'https://cdn/trip.mp4'),
    ] as never);
    vi.mocked(editsService.deleteProject).mockRejectedValue(new Error('no'));
    renderWithProviders(<EditsHome />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for Trip' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Delete|Confirm/ }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('offers the project left on this device before it reached the cloud', async () => {
    vi.mocked(loadLocalStudioDraft).mockResolvedValue({
      project: studio('Unsaved'),
      cloudProjectId: null,
    } as never);
    renderWithProviders(<EditsHome />);
    fireEvent.click(await screen.findByText('Unsaved'));
    expect(screen.getByText('Not saved to the cloud')).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith(EDITOR_PATH);
    expect(useStudioStore.getState().project?.name).toBe('Unsaved');
  });

  it('does not offer an empty one, or one already in the cloud', async () => {
    vi.mocked(loadLocalStudioDraft).mockResolvedValue({
      project: studio('Kept'),
      cloudProjectId: 'p9',
    } as never);
    renderWithProviders(<EditsHome />);
    expect(
      await screen.findByText('You have no projects yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Kept')).not.toBeInTheDocument();
  });
});
