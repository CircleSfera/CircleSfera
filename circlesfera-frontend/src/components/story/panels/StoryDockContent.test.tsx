import { DEFAULT_POST_SHAPE } from '@circlesfera/shared';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryDockContent, {
  type StoryDockContentProps,
} from './StoryDockContent';

const { tray } = vi.hoisted(() => ({ tray: vi.fn() }));
vi.mock('./StoryStickersPanel', () => ({
  default: (props: { interactive?: boolean }) => {
    tray(props);
    return null;
  },
}));

// Only what the sticker tray reads; the rest of the dock stays closed.
function dock(extra: Partial<StoryDockContentProps>) {
  const props = {
    selectedElementId: null,
    activeTab: 'stickers',
    elements: [],
    ...extra,
  } as unknown as StoryDockContentProps;
  render(<StoryDockContent {...props} />);
  return tray.mock.calls.at(-1)?.[0] as { interactive?: boolean };
}

describe('StoryDockContent sticker tray', () => {
  beforeEach(() => tray.mockClear());

  it('offers the interactive stickers on a story', () => {
    expect(dock({}).interactive).toBe(true);
  });

  it('offers only emoji stickers over the video of a Frame', () => {
    expect(dock({ paintOnly: true }).interactive).toBe(false);
  });

  it('offers only emoji stickers on a post', () => {
    expect(dock({ frame: DEFAULT_POST_SHAPE }).interactive).toBe(false);
  });
});
