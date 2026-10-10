import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioTrack,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import StudioToolDock from './StudioToolDock';
import StudioToolSheet from './StudioToolSheet';
import StudioTopbar from './StudioTopbar';

const navigate = vi.fn();
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const store = () => useStudioStore.getState();
const open = (state: Parameters<typeof openStudioProject>[1] = {}) =>
  openStudioProject([studioTrack('v1', 'video', [mediaClip('clip')])], state);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StudioTopbar', () => {
  const handlers = () => ({
    onOpenDrafts: vi.fn(),
    onExport: vi.fn(),
    onSave: vi.fn(),
  });
  const show = (isExporting = false) => {
    const given = handlers();
    renderWithProviders(<StudioTopbar {...given} isExporting={isExporting} />);
    return given;
  };

  it('leaves the studio to where the person came from', () => {
    open();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Exit Studio' }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  describe('the name of the project', () => {
    const field = () => screen.getByRole('textbox', { name: 'Project name' });

    it('shows the name and renames as it is typed', () => {
      open();
      show();
      expect(field()).toHaveValue('Edit');

      fireEvent.change(field(), { target: { value: 'Summer trip' } });

      expect(store().project?.name).toBe('Summer trip');
      expect(field()).toHaveValue('Summer trip');
    });

    it('can be emptied to type a new one', () => {
      open();
      show();

      fireEvent.change(field(), { target: { value: '' } });

      expect(field()).toHaveValue('');
      expect(field()).toHaveAttribute('placeholder', 'New Project');
    });

    it.each(['', '   '])(
      'goes back to the default name when left as "%s"',
      (left) => {
        open();
        show();

        fireEvent.change(field(), { target: { value: left } });
        fireEvent.blur(field());

        expect(store().project?.name).toBe('New Project');
      },
    );

    it('keeps a typed name when the field is left', () => {
      open();
      show();

      fireEvent.change(field(), { target: { value: 'Summer trip' } });
      fireEvent.blur(field());

      expect(store().project?.name).toBe('Summer trip');
    });

    it('is empty while there is no project', () => {
      useStudioStore.setState({ project: null });
      show();
      expect(field()).toHaveValue('');
    });
  });

  describe('undo and redo', () => {
    it('are off when there is nothing to undo or redo', () => {
      open();
      show();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    });

    it('take a change back and bring it again', () => {
      open();
      show();
      fireEvent.click(screen.getByRole('button', { name: '1:1' }));
      expect(store().project?.aspectRatio).toBe('1:1');

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(store().project?.aspectRatio).toBe('9:16');

      fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
      expect(store().project?.aspectRatio).toBe('1:1');
    });
  });

  describe('the shape of the canvas', () => {
    it('marks the shape in use, the upright one when there is no project', () => {
      useStudioStore.setState({ project: null });
      show();
      expect(screen.getByRole('button', { name: '9:16' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it.each([
      ['16:9', 1920, 1080],
      ['1:1', 1080, 1080],
      ['4:5', 1080, 1350],
    ])('changes to %s with its size', (shape, width, height) => {
      open();
      show();

      fireEvent.click(screen.getByRole('button', { name: shape }));

      expect(store().project).toMatchObject({
        aspectRatio: shape,
        resolution: { width, height },
      });
      expect(screen.getByRole('button', { name: shape })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: '9:16' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('drafts, saving and export', () => {
    it('opens the drafts and asks to export', () => {
      open();
      const given = show();

      fireEvent.click(screen.getByRole('button', { name: 'Open drafts' }));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect(given.onOpenDrafts).toHaveBeenCalledTimes(1);
      expect(given.onExport).toHaveBeenCalledTimes(1);
    });

    it('does not offer a second export while one is running', () => {
      open();
      show(true);
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    });

    it.each([
      ['idle', 'Save'],
      ['saving', 'Saving…'],
      ['saved', 'Saved'],
      ['error', 'Save failed'],
    ] as const)(
      'says how saving is going when it is %s, and saves on request',
      (saveStatus, label) => {
        open({ saveStatus });
        const given = show();

        fireEvent.click(screen.getByRole('button', { name: label }));

        expect(given.onSave).toHaveBeenCalledTimes(1);
      },
    );
  });
});

describe('StudioToolDock', () => {
  const tool = (name: string) => screen.getByRole('button', { name });

  it('offers the five tools, with the last one used marked', () => {
    open({ activeTab: 'text' });
    renderWithProviders(<StudioToolDock />);

    const dock = screen.getByRole('navigation', { name: 'Studio tools' });
    expect(
      within(dock)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Media', 'Text', 'Audio', 'Filters', 'Captions']);
    expect(tool('Text')).toHaveAttribute('aria-pressed', 'true');
    expect(tool('Media')).toHaveAttribute('aria-pressed', 'false');
  });

  it.each([
    ['Media', 'media'],
    ['Text', 'text'],
    ['Audio', 'audio'],
    ['Filters', 'filters'],
    ['Captions', 'subtitles'],
  ])('opens the panel of %s', (name, id) => {
    open({ activeTab: 'media' });
    renderWithProviders(<StudioToolDock />);

    fireEvent.click(tool(name));

    expect(store()).toMatchObject({ activeTab: id, openSheet: id });
  });

  it('closes the panel when its own tool is pressed again', () => {
    open({ activeTab: 'audio', openSheet: 'audio' });
    renderWithProviders(<StudioToolDock />);

    fireEvent.click(tool('Audio'));

    expect(store().openSheet).toBeNull();
    expect(store().activeTab).toBe('audio');
  });

  it('changes panel when another tool is pressed', () => {
    open({ activeTab: 'audio', openSheet: 'audio' });
    renderWithProviders(<StudioToolDock />);

    fireEvent.click(tool('Filters'));

    expect(store().openSheet).toBe('filters');
  });
});

describe('StudioToolSheet', () => {
  const show = (state: Parameters<typeof openStudioProject>[1]) => {
    open(state);
    const given = { onAddMediaFile: vi.fn(), onAddAudioFile: vi.fn() };
    const view = renderWithProviders(<StudioToolSheet {...given} />);
    return { ...given, ...view };
  };

  it('is not there while no panel is open', () => {
    const { container } = show({ openSheet: null });
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['media', 'Media', 'Import video or image'],
    ['text', 'Text', 'Text templates'],
    ['audio', 'Audio', 'Upload audio from device'],
    ['filters', 'Filters', 'Visual filters'],
    ['subtitles', 'Captions', 'Add caption at playhead'],
  ] as const)(
    'shows the %s panel under its title',
    (openSheet, title, content) => {
      show({ openSheet });

      const sheet = screen.getByRole('dialog', { name: title });
      expect(within(sheet).getByText(content)).toBeInTheDocument();
    },
  );

  it('shows the properties of the selected clip', () => {
    show({ openSheet: 'properties', selectedClipId: 'clip' });

    const sheet = screen.getByRole('dialog', { name: 'Properties' });
    expect(
      within(sheet).getByRole('slider', { name: 'Scale' }),
    ).toBeInTheDocument();
  });

  it('asks for a clip when the properties are open with none selected', () => {
    show({ openSheet: 'properties', selectedClipId: null });

    expect(
      screen.getByText('Select a clip to view its properties'),
    ).toBeInTheDocument();
  });

  it('hands the chosen files to the studio', () => {
    const media = show({ openSheet: 'media' });
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.change(
      media.container.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [file] } },
    );
    expect(media.onAddMediaFile).toHaveBeenCalledWith(file);
    media.unmount();

    const audio = show({ openSheet: 'audio' });
    const song = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    fireEvent.change(
      audio.container.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [song] } },
    );
    expect(audio.onAddAudioFile).toHaveBeenCalledWith(song);
  });

  it.each([
    ['the backdrop', 0],
    ['its button', 1],
  ])('closes from %s', (_what, index) => {
    show({ openSheet: 'text' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[index]);

    expect(store().openSheet).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with Escape', () => {
    show({ openSheet: 'text' });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(store().openSheet).toBeNull();
  });
});
