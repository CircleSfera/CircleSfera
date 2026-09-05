import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditProject } from '../../../services/edits.service';
import { editsService } from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';
import { renderWithProviders } from '../../../test/test-utils';
import type { StudioProject } from '../../../types/studio';
import DraftsModal from './DraftsModal';

vi.mock('../../../services/edits.service', () => ({
  editsService: {
    getProjects: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const studio: StudioProject = {
  id: 'studio-1',
  name: 'Beach cut',
  duration: 10,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks: [
    {
      id: 'v1',
      type: 'video',
      name: 'Video',
      clips: [],
      muted: false,
      hidden: false,
      locked: false,
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const validDraft: EditProject = {
  id: 'draft-1',
  userId: 'user-1',
  name: 'Beach cut',
  mediaUrl: 'https://cdn.example.com/a.mp4',
  mediaType: 'video',
  state: { version: 3, studio },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const legacyDraft: EditProject = {
  ...validDraft,
  id: 'draft-legacy',
  name: 'Old editor',
  state: { filter: 'none', adjustments: {} },
};

describe('DraftsModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useStudioStore.setState({
      project: null,
      cloudProjectId: null,
    });
    vi.mocked(editsService.getProjects).mockResolvedValue([]);
    vi.mocked(editsService.deleteProject).mockResolvedValue(undefined);
  });

  it('shows the empty state after load', async () => {
    renderWithProviders(<DraftsModal onClose={onClose} />);

    expect(screen.getByText('My drafts')).toBeInTheDocument();
    expect(await screen.findByText('No saved drafts yet')).toBeInTheDocument();
  });

  it('shows an error when drafts fail to load', async () => {
    vi.mocked(editsService.getProjects).mockRejectedValueOnce(
      new Error('fail'),
    );

    renderWithProviders(<DraftsModal onClose={onClose} />);

    expect(
      await screen.findByText('Could not load drafts'),
    ).toBeInTheDocument();
  });

  it('opens a v3 draft and ignores legacy editor projects', async () => {
    vi.mocked(editsService.getProjects).mockResolvedValue([
      legacyDraft,
      validDraft,
    ]);

    renderWithProviders(<DraftsModal onClose={onClose} />);

    expect(await screen.findByText('Beach cut')).toBeInTheDocument();
    expect(screen.queryByText('Old editor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /beach cut/i }));

    expect(useStudioStore.getState().project).toEqual(studio);
    expect(useStudioStore.getState().cloudProjectId).toBe('draft-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the dialog X without deleting', async () => {
    vi.mocked(editsService.getProjects).mockResolvedValue([validDraft]);

    renderWithProviders(<DraftsModal onClose={onClose} />);
    await screen.findByText('Beach cut');

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(editsService.deleteProject).not.toHaveBeenCalled();
  });

  it('deletes a draft after confirm and clears the open cloud id', async () => {
    useStudioStore.setState({ cloudProjectId: 'draft-1' });
    vi.mocked(editsService.getProjects).mockResolvedValue([validDraft]);

    renderWithProviders(<DraftsModal onClose={onClose} />);
    await screen.findByText('Beach cut');

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Delete this draft permanently?',
    );
    await waitFor(() => {
      expect(editsService.deleteProject).toHaveBeenCalledWith('draft-1');
    });
    await waitFor(() => {
      expect(useStudioStore.getState().cloudProjectId).toBeNull();
    });
    expect(toast.success).toHaveBeenCalledWith('Draft deleted');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not delete when confirm is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    vi.mocked(editsService.getProjects).mockResolvedValue([validDraft]);

    renderWithProviders(<DraftsModal onClose={onClose} />);
    await screen.findByText('Beach cut');

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));

    expect(editsService.deleteProject).not.toHaveBeenCalled();
  });
});
