import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { studioTemplatesApi } from '../../../services/studioTemplates.service';
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

vi.mock('../../../services/studioTemplates.service', () => ({
  studioTemplatesApi: {
    create: vi.fn().mockResolvedValue({ data: { id: 't-1' } }),
    mine: vi.fn(),
    update: vi.fn().mockResolvedValue({ data: {} }),
    remove: vi.fn().mockResolvedValue({}),
    ofPost: vi.fn(),
    use: vi.fn().mockResolvedValue({ data: { uses: 1 } }),
  },
}));
vi.mock('../../../utils/mediaDuration', () => ({
  readMediaDuration: vi.fn().mockResolvedValue(0.5),
}));

const rhythm = {
  version: 1 as const,
  name: 'My rhythm',
  aspectRatio: '9:16' as const,
  slots: [
    { duration: 1, speed: 1 },
    { duration: 2, speed: 1 },
  ],
  effects: [],
};
const mine = {
  id: 'd-9',
  name: 'My rhythm',
  structure: rhythm,
  postId: null,
  isPublic: false,
  uses: 0,
  createdAt: '',
  updatedAt: '',
};
const photo = () => new File(['p'], 'b.jpg', { type: 'image/jpeg' });
const choose = (files: File[]) =>
  fireEvent.change(screen.getByTestId('studio-template-input'), {
    target: { files },
  });

describe('the templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(studioTemplatesApi.mine).mockResolvedValue({
      data: [mine],
    } as never);
    vi.mocked(studioTemplatesApi.ofPost).mockRejectedValue(new Error('404'));
    URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`);
    useStudioStore.setState({ pendingUploads: [] });
  });

  it('lists the person’s own and CircleSfera’s, with how many clips and how long', async () => {
    renderWithProviders(<TemplatesSection onOpen={vi.fn()} />);
    expect(await screen.findByText('Yours')).toBeInTheDocument();
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

  it('hides the person’s section when they have none', async () => {
    vi.mocked(studioTemplatesApi.mine).mockResolvedValue({ data: [] } as never);
    renderWithProviders(<TemplatesSection onOpen={vi.fn()} />);
    await screen.findByText('Quick cuts');
    expect(screen.queryByText('Yours')).not.toBeInTheDocument();
  });

  it('fills a template’s slots with the files chosen and opens the project, to upload them', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<TemplatesSection onOpen={onOpen} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use My rhythm' }),
    );
    choose([
      new File(['v'], 'a.mp4', { type: 'video/mp4' }),
      photo(),
      new File(['x'], 'extra.jpg', { type: 'image/jpeg' }),
    ]);
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
    // The person's own template is neither counted nor credited.
    expect(studioTemplatesApi.use).not.toHaveBeenCalled();
    expect(project).not.toHaveProperty('templateId');
  });

  it('shows the template of the Frame the person came from, counts its use and credits it', async () => {
    vi.mocked(studioTemplatesApi.ofPost).mockResolvedValue({
      data: {
        id: 'c-1',
        name: 'Beach cuts',
        structure: rhythm,
        uses: 4,
        postId: 'post-1',
        author: { username: 'maker' },
      },
    } as never);
    const onOpen = vi.fn();
    renderWithProviders(
      <TemplatesSection fromPostId="post-1" onOpen={onOpen} />,
    );
    expect(
      await screen.findByText('From the Frame you came from'),
    ).toBeInTheDocument();
    expect(screen.getByText('Template by @maker')).toBeInTheDocument();
    expect(studioTemplatesApi.ofPost).toHaveBeenCalledWith('post-1');
    fireEvent.click(screen.getByRole('button', { name: 'Use Beach cuts' }));
    choose([photo()]);
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    expect(studioTemplatesApi.use).toHaveBeenCalledWith('c-1');
    expect(onOpen.mock.calls[0][0].templateId).toBe('c-1');
  });

  it('says when the Frame’s template is no longer there', async () => {
    renderWithProviders(
      <TemplatesSection fromPostId="gone" onOpen={vi.fn()} />,
    );
    expect(await screen.findByText(/no longer available/)).toBeInTheDocument();
  });

  it('does nothing when no file is chosen', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<TemplatesSection onOpen={onOpen} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use Quick cuts' }),
    );
    choose([]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renames and deletes the person’s own', async () => {
    renderWithProviders(<TemplatesSection onOpen={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Rename My rhythm' }),
    );
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: '  Fast  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(studioTemplatesApi.update).toHaveBeenCalledWith('d-9', {
        name: 'Fast',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete My rhythm' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Delete|Confirm/ }),
    );
    await waitFor(() =>
      expect(studioTemplatesApi.remove).toHaveBeenCalledWith('d-9'),
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
    await waitFor(() => expect(studioTemplatesApi.create).toHaveBeenCalled());
    const [body] = vi.mocked(studioTemplatesApi.create).mock.calls[0];
    expect(body).toMatchObject({
      name: 'Mine',
      structure: { name: 'Mine', slots: [{ duration: 2 }] },
    });
    expect(JSON.stringify(body)).not.toContain('cdn.example.com');
  });

  it('cannot save a project with no clips yet', () => {
    openStudioProject([studioTrack('v1', 'video', [])]);
    renderWithProviders(<ProjectSettingsPanel />);
    expect(
      screen.getByRole('button', { name: 'Save as template' }),
    ).toBeDisabled();
  });
});
