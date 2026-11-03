import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CREATE_THUMB } from '../create-post/createStyles';
import MediaThumb, {
  MEDIA_THUMB,
  postThumbShape,
  thumbRatio,
} from './MediaThumb';

describe('MediaThumb', () => {
  it('is one size and shape everywhere: the create flow’s thumbnail too', () => {
    expect(CREATE_THUMB).toBe(MEDIA_THUMB);
    expect(MEDIA_THUMB).toContain('h-14');
    expect(MEDIA_THUMB).toContain('rounded-md');
  });

  it('takes the shape of what it shows', () => {
    expect(thumbRatio('POST')).toBe('4 / 5');
    expect(thumbRatio('FRAME')).toBe('9 / 16');
    expect(thumbRatio('STORY')).toBe('9 / 16');
    expect(thumbRatio('LIVE')).toBe('9 / 16');
    expect(thumbRatio('SQUARE')).toBe('1 / 1');
    expect(postThumbShape('FRAME')).toBe('FRAME');
    expect(postThumbShape('POST')).toBe('POST');
    expect(postThumbShape(undefined)).toBe('POST');
  });

  it('shows a picture, a video’s first frame, or what stands in for none', () => {
    const { container, rerender } = render(
      <MediaThumb src="/a.jpg" shape="STORY" alt="a story" />,
    );
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.aspectRatio).toBe('9 / 16');
    expect(container.querySelector('img')).toHaveAttribute('alt', 'a story');

    rerender(<MediaThumb src="/a.mp4" video />);
    expect(container.querySelector('video')).toHaveAttribute('src', '/a.mp4');

    rerender(<MediaThumb src={null} fallback={<i data-testid="none" />} />);
    expect(container.querySelector('[data-testid="none"]')).not.toBeNull();
    expect(container.querySelector('img, video')).toBeNull();
  });
});
