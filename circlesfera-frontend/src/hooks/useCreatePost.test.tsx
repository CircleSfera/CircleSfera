import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import { useCreatePost } from './useCreatePost';

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
});
