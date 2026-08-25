import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditStep, { fitAspectBox } from './EditStep';

vi.mock('../Carousel', () => ({
  default: () => <div data-testid="carousel" />,
}));

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
const mediaFiles = [
  { file, url: 'blob:photo-1', type: 'image' as const },
  { file, url: 'blob:photo-2', type: 'image' as const },
];

describe('fitAspectBox', () => {
  it('fits a 9:16 frame inside a wide host by height', () => {
    const box = fitAspectBox(800, 400, 9, 16);
    expect(box.height).toBe(400);
    expect(box.width).toBe(Math.floor((400 * 9) / 16));
  });

  it('fits a 9:16 frame inside a tall host by width', () => {
    const box = fitAspectBox(390, 700, 9, 16);
    expect(box.width).toBe(390);
    expect(box.height).toBe(Math.floor((390 * 16) / 9));
  });

  it('fits a 4:5 post frame inside a square host', () => {
    const box = fitAspectBox(500, 500, 4, 5);
    expect(box.width).toBe(400);
    expect(box.height).toBe(500);
  });
});

describe('EditStep', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows edit and remove controls without requiring hover', () => {
    const setCurrentEditIndex = vi.fn();
    const handleRemoveFile = vi.fn();
    const fileInputRef = { current: null };

    render(
      <EditStep
        mediaFiles={mediaFiles}
        mode="POST"
        setMode={vi.fn()}
        setCurrentEditIndex={setCurrentEditIndex}
        handleRemoveFile={handleRemoveFile}
        fileInputRef={fileInputRef}
      />,
    );

    expect(screen.getByText('4:5')).toBeInTheDocument();
    expect(screen.getByTestId('edit-preview-frame')).toHaveAttribute(
      'data-aspect',
      '4:5',
    );

    const editButtons = screen.getAllByRole('button', {
      name: /createPost\.edit\.edit_media/,
    });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(editButtons[0]);
    expect(setCurrentEditIndex).toHaveBeenCalledWith(0);

    const removeButtons = screen.getAllByRole('button', {
      name: /createPost\.edit\.remove_media/,
    });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[1]);
    expect(handleRemoveFile).toHaveBeenCalledWith(1);
  });

  it('sizes the Frame preview to a measured 9:16 box', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 390;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 520;
      },
    });

    render(
      <EditStep
        mediaFiles={[mediaFiles[0]]}
        mode="FRAME"
        setMode={vi.fn()}
        setCurrentEditIndex={vi.fn()}
        handleRemoveFile={vi.fn()}
        fileInputRef={{ current: null }}
      />,
    );

    const frame = screen.getByTestId('edit-preview-frame');
    expect(frame).toHaveAttribute('data-aspect', '9:16');
    expect(screen.getByText('9:16')).toBeInTheDocument();

    const expected = fitAspectBox(390, 520, 9, 16);
    expect(frame).toHaveStyle({
      width: `${expected.width}px`,
      height: `${expected.height}px`,
    });
  });
});
