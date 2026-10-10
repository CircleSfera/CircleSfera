import { act, renderHook } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editsService } from '../services/edits.service';
import { useStudioStore } from '../stores/studioStore';
import type { StudioProject } from '../types/studio';
import { saveLocalStudioDraft } from '../utils/studioLocalDraft';
import { getPrimaryMediaUrl } from '../utils/studioProject';
import { useStudioAutosave } from './useStudioAutosave';

vi.mock('../services/edits.service', () => ({
  editsService: { updateProjectState: vi.fn(), createProject: vi.fn() },
}));
vi.mock('../utils/studioLocalDraft', () => ({
  saveLocalStudioDraft: vi.fn().mockResolvedValue(undefined),
}));
// The project is kept as given, so a test can tell one save from the next.
vi.mock('../utils/studioProject', () => ({
  serializeStudioProject: vi.fn((project: unknown) => project),
  getPrimaryMediaUrl: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

const project = (name = 'My edit', clips: unknown[] = [{ id: 'c-1' }]) =>
  ({
    id: 'p-1',
    name,
    tracks: [{ id: 't-1', clips }],
  }) as never as StudioProject;
const studio = () => useStudioStore.getState();
const open = (state: Partial<ReturnType<typeof studio>>) =>
  act(() => useStudioStore.setState(state as never));

describe('useStudioAutosave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useStudioStore.setState({
      project: null,
      cloudProjectId: null,
      saveStatus: 'idle',
    } as never);
    vi.mocked(getPrimaryMediaUrl).mockReturnValue('https://cdn/clip.mp4');
    vi.mocked(editsService.updateProjectState).mockResolvedValue({} as never);
    vi.mocked(editsService.createProject).mockResolvedValue({
      id: 'cloud-new',
    } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  it('keeps a local copy shortly after each change, with or without a cloud draft', async () => {
    renderHook(() => useStudioAutosave());
    const mine = project();
    open({ project: mine });

    await pass(700);
    expect(saveLocalStudioDraft).not.toHaveBeenCalled();
    await pass(200);
    expect(saveLocalStudioDraft).toHaveBeenCalledWith(mine, null);
    expect(editsService.updateProjectState).not.toHaveBeenCalled();
  });

  it('waits for the person to stop before saving: one save for several quick changes', async () => {
    renderHook(() => useStudioAutosave());
    open({ project: project('one'), cloudProjectId: 'cloud-1' });
    await pass(2000);
    open({ project: project('two') });
    await pass(2000);
    expect(editsService.updateProjectState).not.toHaveBeenCalled();

    await pass(600);
    expect(editsService.updateProjectState).toHaveBeenCalledTimes(1);
    expect(editsService.updateProjectState).toHaveBeenCalledWith('cloud-1', {
      version: 3,
      studio: expect.objectContaining({ name: 'two' }),
    });
    expect(studio().saveStatus).toBe('saved');
  });

  it('creates the cloud draft on the first save by hand, and remembers it', async () => {
    const { result } = renderHook(() => useStudioAutosave());
    const mine = project();
    open({ project: mine });

    await act(() => result.current.saveNow());

    expect(editsService.createProject).toHaveBeenCalledWith(
      'https://cdn/clip.mp4',
      'video',
      { version: 3, studio: mine },
      'My edit',
    );
    expect(studio().cloudProjectId).toBe('cloud-new');
    expect(studio().saveStatus).toBe('saved');
    expect(saveLocalStudioDraft).toHaveBeenCalledWith(mine, 'cloud-new');
  });

  it('does not save again what is already saved', async () => {
    const { result } = renderHook(() => useStudioAutosave());
    open({ project: project(), cloudProjectId: 'cloud-1' });

    await act(() => result.current.saveNow());
    await act(() => result.current.saveNow());

    expect(editsService.updateProjectState).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['there is no project', null, true],
    [
      'nothing in it is uploaded yet and it has no cloud draft',
      project(),
      false,
    ],
  ])('saves nothing to the cloud when %s', async (_case, mine, uploaded) => {
    if (!uploaded)
      vi.mocked(getPrimaryMediaUrl).mockReturnValue(undefined as never);
    const { result } = renderHook(() => useStudioAutosave());
    open({ project: mine });

    await act(() => result.current.saveNow());

    expect(editsService.createProject).not.toHaveBeenCalled();
    expect(editsService.updateProjectState).not.toHaveBeenCalled();
    expect(studio().saveStatus).toBe('idle');
  });

  it('says so when the save fails, and tries again on the next save', async () => {
    vi.mocked(editsService.updateProjectState).mockRejectedValueOnce(
      new Error('down'),
    );
    const { result } = renderHook(() => useStudioAutosave());
    open({ project: project(), cloudProjectId: 'cloud-1' });

    await act(() => result.current.saveNow());
    expect(studio().saveStatus).toBe('error');
    expect(toast.error).toHaveBeenCalledTimes(1);

    await act(() => result.current.saveNow());
    expect(studio().saveStatus).toBe('saved');
    expect(editsService.updateProjectState).toHaveBeenCalledTimes(2);
  });

  describe('leaving the page', () => {
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it.each([
      ['a save is under way', 'saving', true],
      ['the last save failed', 'error', true],
      ['everything is saved', 'saved', false],
    ] as const)(
      'when %s: asks before leaving = %s, and keeps a local copy either way',
      (_case, saveStatus, asks) => {
        renderHook(() => useStudioAutosave());
        const mine = project();
        open({ project: mine, cloudProjectId: 'cloud-1', saveStatus });
        vi.mocked(saveLocalStudioDraft).mockClear();

        expect(leave()).toBe(asks);
        expect(saveLocalStudioDraft).toHaveBeenCalledWith(mine, 'cloud-1');
      },
    );

    it.each([
      ['there is no project', null],
      ['the project has no clips', project('empty', [])],
    ])('lets the person go without asking when %s', (_case, mine) => {
      renderHook(() => useStudioAutosave());
      open({ project: mine, saveStatus: 'error' });
      vi.mocked(saveLocalStudioDraft).mockClear();

      expect(leave()).toBe(false);
      expect(saveLocalStudioDraft).not.toHaveBeenCalled();
    });

    it('stops asking once the studio is closed', () => {
      const { unmount } = renderHook(() => useStudioAutosave());
      open({ project: project(), saveStatus: 'error' });
      unmount();

      expect(leave()).toBe(false);
    });
  });
});
