import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useCreatePostState } from './useCreatePostState';

const at = (address: string) =>
  renderHook(() => useCreatePostState(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[address]}>{children}</MemoryRouter>
    ),
  });

describe('useCreatePostState', () => {
  it.each([
    ['/create', 'POST', false],
    ['/create?mode=story', 'STORY', false],
    ['/create?mode=frame', 'FRAME', false],
    ['/create?mode=anything', 'POST', false],
    // A story for close friends only.
    ['/create?mode=circle', 'STORY', true],
    ['/create?mode=story&circle=1', 'STORY', true],
  ])(
    'opens %s as %s (close friends only: %s)',
    (address, mode, closeFriends) => {
      const { result } = at(address);

      expect(result.current.mode).toBe(mode);
      expect(result.current.isCloseFriendsOnly).toBe(closeFriends);
    },
  );

  it('starts on the upload step, with nothing written or chosen', () => {
    const { result } = at('/create');

    expect(result.current).toMatchObject({
      step: 'upload',
      subScreen: 'none',
      showFrameTrim: false,
      showDiscardConfirm: false,
      caption: '',
      location: '',
      selectedPlace: null,
      hideLikes: false,
      turnOffComments: false,
      isSensitive: false,
      selectedAudio: null,
      audioStartMs: 0,
      isPremium: false,
      price: 0,
      scheduledAt: '',
      interactiveDraft: null,
      storyElements: [],
      storyBgStyle: '',
      isComposed: false,
      originalStoryMedia: null,
    });
  });

  it('keeps what the person writes and chooses', () => {
    const { result } = at('/create');

    act(() => {
      result.current.setMode('FRAME');
      result.current.setStep('caption');
      result.current.setSubScreen('music');
      result.current.setCaption('A day out');
      result.current.setIsPremium(true);
      result.current.setPrice(300);
      result.current.setInteractiveDraft({ kind: 'qna', prompt: 'Ask me' });
      result.current.setIsCloseFriendsOnly(true);
    });

    expect(result.current).toMatchObject({
      mode: 'FRAME',
      step: 'caption',
      subScreen: 'music',
      caption: 'A day out',
      isPremium: true,
      price: 300,
      interactiveDraft: { kind: 'qna', prompt: 'Ask me' },
      isCloseFriendsOnly: true,
    });
  });
});
