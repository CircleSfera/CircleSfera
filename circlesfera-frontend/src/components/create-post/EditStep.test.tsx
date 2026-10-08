import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
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

    renderWithProviders(
      <EditStep
        mediaFiles={mediaFiles}
        mode="POST"
        setMode={vi.fn()}
        setCurrentEditIndex={setCurrentEditIndex}
        handleRemoveFile={handleRemoveFile}
        fileInputRef={fileInputRef}
      />,
      { lng: 'es' },
    );

    expect(screen.getByText('4:5')).toBeInTheDocument();
    expect(screen.getByTestId('edit-preview-frame')).toHaveAttribute(
      'data-aspect',
      '4:5',
    );

    // The tools are on screen, one tap away, and each opens the editor.
    const tools = within(screen.getByRole('toolbar', { name: 'Editar Medio' }));
    expect(
      tools.getAllByRole('button').map((tool) => tool.textContent),
    ).toEqual(['Filtros', 'Ajustar', 'Recorte', 'Capa']);
    fireEvent.click(tools.getByRole('button', { name: 'Filtros' }));
    expect(setCurrentEditIndex).toHaveBeenCalledWith(0);

    // One delete button, for the item on show.
    const remove = screen.getByRole('button', { name: 'Eliminar medio' });
    fireEvent.click(remove);
    expect(handleRemoveFile).toHaveBeenLastCalledWith(0);

    fireEvent.click(
      screen.getByRole('button', {
        name: `Elemento 2 de ${mediaFiles.length}`,
      }),
    );
    fireEvent.click(remove);
    expect(handleRemoveFile).toHaveBeenLastCalledWith(1);
  });

  it('names each thumbnail by its position, with one set of tools', () => {
    renderWithProviders(
      <EditStep
        mediaFiles={mediaFiles}
        mode="POST"
        setMode={vi.fn()}
        setCurrentEditIndex={vi.fn()}
        handleRemoveFile={vi.fn()}
        fileInputRef={{ current: null }}
      />,
      { lng: 'es' },
    );

    expect(
      screen.getByRole('button', {
        name: `Elemento 1 de ${mediaFiles.length}`,
      }),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', {
        name: `Elemento 2 de ${mediaFiles.length}`,
      }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getAllByRole('toolbar', { name: 'Editar Medio' }),
    ).toHaveLength(1);
  });

  it('opens the editor on the tab of the tool that was pressed', () => {
    const setCurrentEditIndex = vi.fn();
    const onChooseEditorTab = vi.fn();
    renderWithProviders(
      <EditStep
        mediaFiles={mediaFiles}
        mode="POST"
        setMode={vi.fn()}
        setCurrentEditIndex={setCurrentEditIndex}
        onChooseEditorTab={onChooseEditorTab}
        handleRemoveFile={vi.fn()}
        fileInputRef={{ current: null }}
      />,
      { lng: 'es' },
    );
    const tools = within(screen.getByRole('toolbar', { name: 'Editar Medio' }));

    fireEvent.click(tools.getByRole('button', { name: 'Recorte' }));
    expect(onChooseEditorTab).toHaveBeenLastCalledWith('CROP');
    expect(setCurrentEditIndex).toHaveBeenLastCalledWith(0);

    fireEvent.click(
      screen.getByRole('button', {
        name: `Elemento 2 de ${mediaFiles.length}`,
      }),
    );
    fireEvent.click(tools.getByRole('button', { name: 'Ajustar' }));
    expect(onChooseEditorTab).toHaveBeenLastCalledWith('ADJUST');
    expect(setCurrentEditIndex).toHaveBeenLastCalledWith(1);
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

    renderWithProviders(
      <EditStep
        mediaFiles={[mediaFiles[0]]}
        mode="FRAME"
        setMode={vi.fn()}
        setCurrentEditIndex={vi.fn()}
        handleRemoveFile={vi.fn()}
        fileInputRef={{ current: null }}
      />,
      { lng: 'es' },
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

  describe('the order of a carousel', () => {
    function renderStep(onMoveFile = vi.fn()) {
      renderWithProviders(
        <EditStep
          mediaFiles={mediaFiles}
          mode="POST"
          setMode={vi.fn()}
          setCurrentEditIndex={vi.fn()}
          handleRemoveFile={vi.fn()}
          onMoveFile={onMoveFile}
          fileInputRef={{ current: null }}
        />,
        { lng: 'es' },
      );
      return onMoveFile;
    }
    const earlier = () =>
      screen.getByRole('button', { name: 'Mover antes en el carrusel' });
    const later = () =>
      screen.getByRole('button', { name: 'Mover después en el carrusel' });

    it('moves the item on show one place later, and keeps it on show', () => {
      const onMoveFile = renderStep();

      expect(earlier()).toBeDisabled();
      fireEvent.click(later());

      expect(onMoveFile).toHaveBeenCalledWith(0, 1);
      expect(
        screen.getByRole('button', {
          name: `Elemento 2 de ${mediaFiles.length}`,
        }),
      ).toHaveAttribute('aria-current', 'true');
    });

    it('cannot move the last item later', () => {
      const onMoveFile = renderStep();

      fireEvent.click(
        screen.getByRole('button', {
          name: `Elemento ${mediaFiles.length} de ${mediaFiles.length}`,
        }),
      );

      expect(later()).toBeDisabled();
      fireEvent.click(earlier());
      expect(onMoveFile).toHaveBeenCalledWith(
        mediaFiles.length - 1,
        mediaFiles.length - 2,
      );
    });

    it('offers no reordering for a single item', () => {
      renderWithProviders(
        <EditStep
          mediaFiles={[mediaFiles[0]]}
          mode="POST"
          setMode={vi.fn()}
          setCurrentEditIndex={vi.fn()}
          handleRemoveFile={vi.fn()}
          onMoveFile={vi.fn()}
          fileInputRef={{ current: null }}
        />,
        { lng: 'es' },
      );

      expect(
        screen.queryByRole('button', { name: 'Mover antes en el carrusel' }),
      ).not.toBeInTheDocument();
    });
  });
});
