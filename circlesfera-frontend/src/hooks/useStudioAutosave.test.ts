import { act, renderHook } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editsService } from '../services/edits.service';
import { useStudioStore } from '../stores/studioStore';
import type { StudioProject } from '../types/studio';
import { saveLocalStudioDraft } from '../utils/studioLocalDraft';
import { useStudioAutosave } from './useStudioAutosave';

vi.mock('../services/edits.service', () => ({
  editsService: { updateProjectState: vi.fn(), createProject: vi.fn() },
}));
vi.mock('../utils/studioLocalDraft', () => ({
  saveLocalStudioDraft: vi.fn(),
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(editsService);
const local = vi.mocked(saveLocalStudioDraft);
const project = (clips: object[] = [], over: object = {}) =>
  ({
    id: 'pr-1',
    name: 'My edit',
    duration: 10,
    fps: 30,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tracks: [{ id: 't-1', clips }],
    ...over,
  }) as unknown as StudioProject;
const remote = { id: 'c-1', type: 'video', fileUrl: 'https://cdn.test/a.mp4' };
const onDevice = { id: 'c-2', type: 'video', fileUrl: 'blob:local' };
const text = { id: 'c-3', type: 'text', text: 'Hello' };
const open = (state: object) =>
  act(() => {
    useStudioStore.setState(state);
  });
const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const status = () => useStudioStore.getState().saveStatus;
const leave = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('useStudioAutosave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useStudioStore.setState({
      project: null,
      cloudProjectId: null,
      saveStatus: 'idle',
    });
    api.updateProjectState.mockResolvedValue({} as never);
    api.createProject.mockResolvedValue({ id: 'cloud-new' } as never);
    local.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('does nothing while no project is open', async () => {
    const { result } = renderHook(() => useStudioAutosave());

    await pass(5000);
    await act(() => result.current.saveNow());

    expect(local).not.toHaveBeenCalled();
    expect(api.updateProjectState).not.toHaveBeenCalled();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it('keeps a copy on the device shortly after a change, once for a burst of them', async () => {
    renderHook(() => useStudioAutosave());

    open({ project: project([onDevice]) });
    await pass(400);
    open({ project: project([onDevice], { name: 'Renamed' }) });
    await pass(799);
    expect(local).not.toHaveBeenCalled();
    await pass(1);

    expect(local).toHaveBeenCalledTimes(1);
    expect(local.mock.calls[0][0].name).toBe('Renamed');
    expect(local.mock.calls[0][1]).toBeNull();
    // Media still on the device only: nothing to save in the cloud yet.
    await pass(5000);
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it('saves a project that has a cloud draft a little after the last change', async () => {
    renderHook(() => useStudioAutosave());

    open({ project: project([remote]), cloudProjectId: 'cloud-1' });
    await pass(2499);
    expect(api.updateProjectState).not.toHaveBeenCalled();
    await pass(1);

    expect(api.updateProjectState).toHaveBeenCalledWith('cloud-1', {
      version: 3,
      studio: expect.objectContaining({ id: 'pr-1', name: 'My edit' }),
    });
    expect(status()).toBe('saved');
    // The copy on the device follows the cloud save, with its id.
    expect(local).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'pr-1' }),
      'cloud-1',
    );
  });

  it('does not save again what is already saved', async () => {
    const { result } = renderHook(() => useStudioAutosave());
    open({ project: project([remote]), cloudProjectId: 'cloud-1' });
    await pass(2500);
    expect(api.updateProjectState).toHaveBeenCalledTimes(1);

    // Later, with nothing changed.
    await pass(60_000);
    await act(() => result.current.saveNow());

    expect(api.updateProjectState).toHaveBeenCalledTimes(1);
  });

  it('creates the cloud draft on demand once some media is uploaded, and keeps its id', async () => {
    const { result } = renderHook(() => useStudioAutosave());
    open({ project: project([text, onDevice, remote]) });

    await act(() => result.current.saveNow());

    expect(api.createProject).toHaveBeenCalledWith(
      'https://cdn.test/a.mp4',
      'video',
      { version: 3, studio: expect.objectContaining({ id: 'pr-1' }) },
      'My edit',
    );
    expect(useStudioStore.getState().cloudProjectId).toBe('cloud-new');
    expect(status()).toBe('saved');
    expect(local).toHaveBeenLastCalledWith(expect.anything(), 'cloud-new');
  });

  it('saves nothing in the cloud while every clip is still on the device', async () => {
    const { result } = renderHook(() => useStudioAutosave());
    open({ project: project([onDevice, text]) });

    await act(() => result.current.saveNow());

    expect(api.createProject).not.toHaveBeenCalled();
    expect(status()).toBe('idle');
  });

  it('says so when the save fails, and tries again on the next change', async () => {
    api.updateProjectState.mockRejectedValueOnce(new Error('down'));
    renderHook(() => useStudioAutosave());
    open({ project: project([remote]), cloudProjectId: 'cloud-1' });

    await pass(2500);
    expect(status()).toBe('error');
    expect(toast.error).toHaveBeenCalledWith('Could not save draft');

    open({ project: project([remote], { name: 'Again' }) });
    await pass(2500);
    expect(api.updateProjectState).toHaveBeenCalledTimes(2);
    expect(status()).toBe('saved');
  });

  it('shows the save as under way while it is', async () => {
    let done: (value: unknown) => void = () => {};
    api.updateProjectState.mockReturnValue(
      new Promise((resolve) => {
        done = resolve;
      }) as never,
    );
    renderHook(() => useStudioAutosave());
    open({ project: project([remote]), cloudProjectId: 'cloud-1' });

    await pass(2500);
    expect(status()).toBe('saving');

    await act(async () => done({}));
    expect(status()).toBe('saved');
  });

  it('lets the person leave freely with nothing open or nothing on the timeline', () => {
    renderHook(() => useStudioAutosave());

    expect(leave().defaultPrevented).toBe(false);
    open({ project: project([]), saveStatus: 'error' });
    expect(leave().defaultPrevented).toBe(false);
    expect(local).not.toHaveBeenCalled();
  });

  it('keeps a copy on the device when the person leaves with clips, without holding them', () => {
    renderHook(() => useStudioAutosave());
    open({ project: project([onDevice]), cloudProjectId: 'cloud-1' });
    local.mockClear();

    const event = leave();

    expect(local).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pr-1' }),
      'cloud-1',
    );
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(['saving', 'error'] as const)(
    'asks before leaving while the save is %s',
    (saveStatus) => {
      renderHook(() => useStudioAutosave());
      open({ project: project([remote]), saveStatus });

      expect(leave().defaultPrevented).toBe(true);
    },
  );

  it('stops saving and asking once the editor is closed', async () => {
    const { unmount } = renderHook(() => useStudioAutosave());
    open({
      project: project([remote]),
      cloudProjectId: 'cloud-1',
      saveStatus: 'error',
    });

    unmount();
    await pass(5000);

    expect(api.updateProjectState).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
    expect(leave().defaultPrevented).toBe(false);
  });
});
