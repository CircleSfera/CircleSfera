import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { probeVideoDuration } from '../constants/uploadLimits';
import { useUIStore } from '../stores/uiStore';
import { renderWithProviders } from '../test/test-utils';
import { useCreatePost } from './useCreatePost';

vi.mock('../constants/uploadLimits', async (original) => ({
  ...(await original<typeof import('../constants/uploadLimits')>()),
  probeVideoDuration: vi.fn(),
}));

type Composer = ReturnType<typeof useCreatePost>;

function Probe({ onRender }: { onRender: (c: Composer) => void }) {
  onRender(useCreatePost());
  return null;
}

describe('useCreatePost', () => {
  it('discarding a story lets everything of it go, its song and place too, back to the camera', () => {
    let c = {} as Composer;
    renderWithProviders(<Probe onRender={(v) => (c = v)} />);
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    act(() => {
      c.setMode('STORY');
      c.setMediaFiles([{ file, url: 'blob:p', type: 'image' }]);
      c.setOriginalStoryMedia({ file, url: 'blob:p', type: 'image' });
      c.setStoryElements([
        { id: 't', type: 'text', content: 'Hola', x: 0, y: 0 } as never,
      ]);
      c.setStoryBgStyle('linear-gradient(red, blue)');
      c.setSelectedAudio({ id: 'a', title: 'Canción' } as never);
      c.setAudioStartMs(3000);
      c.setLocation('Valencia');
      c.setSelectedPlace({ name: 'Valencia' } as never);
      c.setIsComposed(true);
      c.setStep('edit');
    });

    act(() => c.discardStory());

    expect(c.mediaFiles).toEqual([]);
    expect(c.originalStoryMedia).toBeNull();
    expect(c.storyElements).toEqual([]);
    expect(c.storyBgStyle).toBe('');
    expect(c.storyOverlay).toBeNull();
    expect(c.selectedAudio).toBeNull();
    expect(c.audioStartMs).toBe(0);
    expect(c.location).toBe('');
    expect(c.selectedPlace).toBeNull();
    expect(c.isComposed).toBe(false);
    expect(c.step).toBe('upload');
  });

  describe('a video handed over from the Studio', () => {
    async function handOver(seconds: number, scheduledAt?: string) {
      vi.mocked(probeVideoDuration).mockResolvedValue(seconds);
      useUIStore.getState().setEditedMediaForPost({
        file: new File(['v'], 'export.mp4', { type: 'video/mp4' }),
        scheduledAt,
      });
      let c = {} as Composer;
      renderWithProviders(<Probe onRender={(v) => (c = v)} />);
      await vi.waitFor(() => expect(c.mediaFiles).toHaveLength(1));
      return () => c;
    }

    it('carries its length, so sharing it as a Frame can check it', async () => {
      const c = await handOver(40, '2026-12-01T10:00');
      expect(c().mediaFiles[0].videoData).toEqual({
        startTime: 0,
        endTime: 40,
        muted: false,
      });
      expect(c().frameSourceDurationSec).toBe(40);
      expect(c().step).toBe('caption');
      expect(c().scheduledAt).toBe('2026-12-01T10:00');
      expect(useUIStore.getState().editedMediaForPost).toBeNull();
    });

    it('longer than a Frame, it opens the trim at the longest window', async () => {
      const c = await handOver(200);
      expect(c().mediaFiles[0].videoData).toMatchObject({
        startTime: 0,
        endTime: 90,
      });
      expect(c().showFrameTrim).toBe(true);
      expect(c().step).toBe('edit');
    });
  });
});
