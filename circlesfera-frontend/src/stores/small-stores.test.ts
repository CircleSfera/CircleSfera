import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  realtime: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
    markRead: vi.fn(),
  },
}));
vi.mock('../services/api', () => ({ apiClient: { get: mocks.get } }));
vi.mock('../services/realtime.service', () => ({
  realtimeService: mocks.realtime,
}));

import type { Story } from '../types';
import { useFrameStore } from './frameStore';
import { useSecurityStore } from './securityStore';
import { useSocketStore } from './socketStore';
import { useStoryStore } from './storyStore';
import { useUIStore } from './uiStore';
import { useExperimentStore } from './useExperimentStore';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the feature switches of the person', () => {
  beforeEach(() => useExperimentStore.setState({ flags: {}, isLoaded: false }));

  it('reads them from the server', async () => {
    mocks.get.mockResolvedValue({ data: { new_feed: true } });

    await useExperimentStore.getState().fetchFlags();

    expect(mocks.get).toHaveBeenCalledWith('/experiments/my-flags');
    expect(useExperimentStore.getState()).toMatchObject({
      flags: { new_feed: true },
      isLoaded: true,
    });
  });

  it('counts as read, with what it had, when the server cannot be reached', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    useExperimentStore.setState({ flags: { kept: true } });
    mocks.get.mockRejectedValue(new Error('offline'));

    await useExperimentStore.getState().fetchFlags();

    expect(useExperimentStore.getState()).toMatchObject({
      flags: { kept: true },
      isLoaded: true,
    });
    quiet.mockRestore();
  });

  it('can be given the switches directly', () => {
    useExperimentStore.getState().setFlags({ a: false });
    expect(useExperimentStore.getState()).toMatchObject({
      flags: { a: false },
      isLoaded: true,
    });
  });
});

describe('the sound of frames', () => {
  beforeEach(() => useFrameStore.setState({ isMuted: true }));

  it('starts silent, as browsers ask of a video that plays by itself', () => {
    expect(useFrameStore.getInitialState().isMuted).toBe(true);
  });

  it('switches and remembers the choice on this device', () => {
    useFrameStore.getState().toggleMute();
    expect(useFrameStore.getState().isMuted).toBe(false);
    expect(
      JSON.parse(localStorage.getItem('frame-storage') ?? '{}').state,
    ).toEqual({ isMuted: false });

    useFrameStore.getState().toggleMute();
    expect(useFrameStore.getState().isMuted).toBe(true);

    useFrameStore.getState().setMuted(false);
    expect(useFrameStore.getState().isMuted).toBe(false);
  });
});

describe('the create menu and the handover of an edited file', () => {
  beforeEach(() =>
    useUIStore.setState({
      isCreateMenuOpen: false,
      isCreateHighlightOpen: false,
      editedMediaForPost: null,
    }),
  );
  const ui = () => useUIStore.getState();

  it('opens, closes and switches the create menu', () => {
    ui().openCreateMenu();
    expect(ui().isCreateMenuOpen).toBe(true);
    ui().closeCreateMenu();
    expect(ui().isCreateMenuOpen).toBe(false);
    ui().toggleCreateMenu();
    expect(ui().isCreateMenuOpen).toBe(true);
    ui().toggleCreateMenu();
    expect(ui().isCreateMenuOpen).toBe(false);
  });

  it('closes the menu when the highlight dialog opens from it', () => {
    ui().openCreateMenu();
    ui().openCreateHighlight();
    expect(ui()).toMatchObject({
      isCreateMenuOpen: false,
      isCreateHighlightOpen: true,
    });

    ui().closeCreateHighlight();
    expect(ui().isCreateHighlightOpen).toBe(false);
  });

  it('keeps an edited file for the composer, with its date when it has one', () => {
    const file = new File(['x'], 'edit.mp4', { type: 'video/mp4' });

    ui().setEditedMediaForPost(file);
    expect(ui().editedMediaForPost).toEqual({ file });

    ui().setEditedMediaForPost({ file, scheduledAt: '2030-01-01T10:00' });
    expect(ui().editedMediaForPost).toEqual({
      file,
      scheduledAt: '2030-01-01T10:00',
    });

    ui().setEditedMediaForPost(null);
    expect(ui().editedMediaForPost).toBeNull();
  });
});

describe('the app lock', () => {
  beforeEach(() =>
    useSecurityStore.setState({ isBiometricEnabled: false, isLocked: false }),
  );
  const security = () => useSecurityStore.getState();
  const kept = () =>
    JSON.parse(localStorage.getItem('circlesfera-security-storage') ?? '{}')
      .state;

  it('locks at once when it is switched on, so the person proves who they are', () => {
    security().setBiometricEnabled(true);
    expect(security()).toMatchObject({
      isBiometricEnabled: true,
      isLocked: true,
    });
  });

  it('unlocks when it is switched off', () => {
    security().setBiometricEnabled(true);
    security().setBiometricEnabled(false);
    expect(security()).toMatchObject({
      isBiometricEnabled: false,
      isLocked: false,
    });
  });

  it('remembers that it is on, never whether it is locked', () => {
    security().setBiometricEnabled(true);
    security().setLocked(false);

    expect(security().isLocked).toBe(false);
    expect(kept()).toEqual({ isBiometricEnabled: true });
  });
});

describe('the story viewer', () => {
  const stories = [{ id: 's1' }, { id: 's2' }] as Story[];
  const viewer = () => useStoryStore.getState();

  it('opens on the first story, or on the one asked for', () => {
    viewer().openStories(stories);
    expect(viewer()).toMatchObject({ isOpen: true, stories, initialIndex: 0 });

    viewer().openStories(stories, 1);
    expect(viewer().initialIndex).toBe(1);
  });

  it('keeps nothing once closed', () => {
    viewer().openStories(stories, 1);
    viewer().closeStories();
    expect(viewer()).toMatchObject({
      isOpen: false,
      stories: [],
      initialIndex: 0,
    });
  });
});

describe('the live connection', () => {
  const socket = () => useSocketStore.getState();

  it('starts disconnected, with nobody typing or online', () => {
    expect(socket()).toMatchObject({
      socket: null,
      isConnected: false,
      typingUsers: {},
      userStatuses: {},
    });
  });

  it('hands every action to the realtime service', () => {
    socket().connect();
    socket().startTyping('c1', 'u2');
    socket().stopTyping('c1', 'u2');
    socket().markRead('c1', 'u2');
    socket().markRead('c1');
    socket().disconnect();

    expect(mocks.realtime.connect).toHaveBeenCalledTimes(1);
    expect(mocks.realtime.startTyping).toHaveBeenCalledWith('c1', 'u2');
    expect(mocks.realtime.stopTyping).toHaveBeenCalledWith('c1', 'u2');
    expect(mocks.realtime.markRead).toHaveBeenNthCalledWith(1, 'c1', 'u2');
    expect(mocks.realtime.markRead).toHaveBeenNthCalledWith(2, 'c1', undefined);
    expect(mocks.realtime.disconnect).toHaveBeenCalledTimes(1);
  });
});
