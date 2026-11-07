import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editsService } from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioTrack,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { MediaClip } from '../../../types/studio';
import { readMediaDuration } from '../../../utils/mediaDuration';
import { mainClips } from '../../../utils/studioTimeline';
import ProjectSettingsPanel from '../panels/ProjectSettingsPanel';
import TemplatesSection from './TemplatesSection';

vi.mock('../../../services/edits.service', () => ({
  editsService: {
    createProject: vi.fn().mockResolvedValue({ id: 't-1' }),
    renameProject: vi.fn().mockResolvedValue({}),
    deleteProject: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../../utils/mediaDuration', () => ({
  readMediaDuration: vi.fn().mockResolvedValue(0.5),
}));

const mine = {
  id: 'd-9',
  userId: 'u',
  name: 'My rhythm',
  mediaUrl: '',
  mediaType: 'template',
  createdAt: '',
  updatedAt: '',
  state: {
    kind: 'template' as const,
    template: {
      version: 1 as const,
      name: 'My rhythm',
      aspectRatio: '9:16' as const,
      slots: [
        { duration: 1, speed: 1 },
        { duration: 2, speed: 1 },
      ],
      effects: [],
    },
  },
};

describe('the templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`);
    useStudioStore.setState({ pendingUploads: [] });
  });

  it('lists the person’s own and CircleSfera’s, with how many clips and how long', () => {
    renderWithProviders(<TemplatesSection drafts={[mine]} onOpen={vi.fn()} />);
    expect(screen.getByText('Yours')).toBeInTheDocument();
    expect(screen.getByText('My rhythm')).toBeInTheDocument();
    expect(screen.getByText('2 clips · 0:03')).toBeInTheDocument();
    for (const name of [
      'Quick cuts',
      'Soft story',
      'Before and after',
      'Trip',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Only the person's own can be renamed or deleted.
    expect(
      screen.queryByRole('button', { name: 'Delete Quick cuts' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete My rhythm' }),
    ).toBeInTheDocument();
  });

  it('hides the person’s section when they have none', () => {
    renderWithProviders(
      <TemplatesSection drafts={undefined} onOpen={vi.fn()} />,
    );
    expect(screen.queryByText('Yours')).not.toBeInTheDocument();
  });

  it('fills a template’s slots with the files chosen and opens the project, to upload them', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<TemplatesSection drafts={[mine]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use My rhythm' }));
    const files = [
      new File(['v'], 'a.mp4', { type: 'video/mp4' }),
      new File(['p'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'extra.jpg', { type: 'image/jpeg' }),
    ];
    fireEvent.change(screen.getByTestId('studio-template-input'), {
      target: { files },
    });
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    const project = onOpen.mock.calls[0][0];
    expect(project.name).toBe('My rhythm');
    const clips = mainClips(project) as MediaClip[];
    expect(clips.map((c) => [c.fileUrl, c.duration])).toEqual([
      ['blob:a.mp4', 0.5],
      ['blob:b.jpg', 2],
    ]);
    expect(readMediaDuration).toHaveBeenCalledTimes(1);
    expect(
      useStudioStore.getState().pendingUploads.map((p) => p.localUrl),
    ).toEqual(['blob:a.mp4', 'blob:b.jpg']);
  });

  it('does nothing when no file is chosen', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<TemplatesSection drafts={[]} onOpen={onOpen} />);
    fireEvent.click(
      screen.getByRole('button', { name: `Use ${'Quick cuts'}` }),
    );
    fireEvent.change(screen.getByTestId('studio-template-input'), {
      target: { files: [] },
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renames and deletes the person’s own', async () => {
    renderWithProviders(<TemplatesSection drafts={[mine]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename My rhythm' }));
    const field = screen.getByLabelText('Template name');
    fireEvent.change(field, { target: { value: '  Fast  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(editsService.renameProject).toHaveBeenCalledWith('d-9', 'Fast'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete My rhythm' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Delete|Confirm/ }),
    );
    await waitFor(() =>
      expect(editsService.deleteProject).toHaveBeenCalledWith('d-9'),
    );
  });
});

describe('saving a project as a template', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves its timing and look under a name, without its media', async () => {
    openStudioProject([
      studioTrack('v1', 'video', [mediaClip('a', { startAt: 0, duration: 2 })]),
    ]);
    renderWithProviders(<ProjectSettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(editsService.createProject).toHaveBeenCalled());
    const [url, type, state, name] = vi.mocked(editsService.createProject).mock
      .calls[0];
    expect([url, type, name]).toEqual(['', 'template', 'Mine']);
    expect(state).toMatchObject({
      kind: 'template',
      template: { name: 'Mine', slots: [{ duration: 2 }] },
    });
    expect(JSON.stringify(state)).not.toContain('cdn.example.com');
  });

  it('cannot save a project with no clips yet', () => {
    openStudioProject([studioTrack('v1', 'video', [])]);
    renderWithProviders(<ProjectSettingsPanel />);
    expect(
      screen.getByRole('button', { name: 'Save as template' }),
    ).toBeDisabled();
  });
});
