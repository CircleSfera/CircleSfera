import { fireEvent, screen } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import UploadStep from './UploadStep';

vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

const platform = vi.hoisted(() => ({ name: 'web', galleryShown: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.name !== 'web',
    getPlatform: () => platform.name,
  },
  registerPlugin: () => ({}),
}));
vi.mock('./gallery/DeviceGallery', () => ({
  default: (props: {
    videosOnly: boolean;
    single: boolean;
    ratio: string;
    fallback: (reason: 'denied') => React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div
      data-testid="device-gallery"
      data-videos-only={String(props.videosOnly)}
      data-single={String(props.single)}
      data-ratio={props.ratio}
    >
      {platform.galleryShown ? props.footer : props.fallback('denied')}
    </div>
  ),
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {},
  CameraResultType: {},
  CameraSource: {},
}));

describe('UploadStep density', () => {
  it('uses 48 px for the main action and 44 px for the mode tabs', () => {
    const fileInputRef = { current: null };
    renderWithProviders(
      <UploadStep
        fileInputRef={fileInputRef}
        handleFileSelect={vi.fn()}
        mode="FRAME"
        setMode={vi.fn()}
        allowModeSwitch
      />,
      { lng: 'es' },
    );

    const selectVideo = screen.getByRole('button', {
      name: 'Seleccionar video',
    });
    expect(selectVideo.className).toMatch(/min-h-12/);

    const frameTab = screen.getByRole('tab', { name: /Frame/i });
    expect(frameTab.className).toMatch(/min-h-11/);
  });
});

describe('UploadStep', () => {
  const picked = (name: string, type: string) =>
    new File(['x'], name, { type });
  /** The page's own file input, with what a drop leaves in it. */
  let input: HTMLInputElement;
  let dispatched: ReturnType<typeof vi.spyOn>;
  let clicked: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // The browser's own carrier of dropped files.
    vi.stubGlobal(
      'DataTransfer',
      class {
        files: File[] = [];
        items = { add: (file: File) => this.files.push(file) };
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function show(mode: 'POST' | 'STORY' | 'FRAME' = 'POST', more = {}) {
    const props = {
      fileInputRef: { current: null as HTMLInputElement | null },
      handleFileSelect: vi.fn(),
      setMode: vi.fn(),
      onTextStory: vi.fn(),
    };
    renderWithProviders(<UploadStep mode={mode} {...props} {...more} />);
    input = props.fileInputRef.current as HTMLInputElement;
    // The test environment only lets a real file list be put in an input.
    Object.defineProperty(input, 'files', { writable: true, value: null });
    dispatched = vi.spyOn(input, 'dispatchEvent');
    clicked = vi.spyOn(input, 'click').mockImplementation(() => {});
    const zone = document.querySelector('[role="presentation"]') as HTMLElement;
    const drop = (...files: File[]) =>
      fireEvent.drop(zone, { dataTransfer: { files, items: files } });
    return { ...props, zone, drop };
  }

  it('limits the file dialog to what the kind of content accepts', () => {
    show('FRAME');
    expect(input.accept).toBe('video/*');
  });

  it('opens the file dialog from its main button', () => {
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Select from device' }));

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('takes dropped photos and videos as if they had been picked', () => {
    const { drop } = show();
    const files = [picked('a.jpg', 'image/jpeg'), picked('b.mp4', 'video/mp4')];

    drop(...files);

    expect(input.files).toEqual(files);
    expect(dispatched).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not take a dropped file that is neither a photo nor a video', () => {
    const { drop } = show();

    drop(picked('contract.pdf', 'application/pdf'));

    expect(input.files).toBeNull();
    expect(dispatched).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Only photos and videos can be added.',
    );
  });

  it('takes the usable files of a mixed drop and says the others were left out', () => {
    const { drop } = show();
    const photo = picked('a.jpg', 'image/jpeg');

    drop(photo, picked('notes.zip', 'application/zip'));

    expect(input.files).toEqual([photo]);
    expect(toast.error).toHaveBeenCalledWith(
      'Only photos and videos can be added.',
    );
  });

  it('takes a phone photo that comes with no type, by its extension', () => {
    const { drop } = show();
    const heic = picked('IMG_0001.HEIC', '');

    drop(heic, picked('readme', ''));

    expect(input.files).toEqual([heic]);
  });

  it('takes only the first video dropped on a frame', () => {
    const { drop } = show('FRAME');
    const first = picked('a.mp4', 'video/mp4');

    drop(
      picked('cover.jpg', 'image/jpeg'),
      first,
      picked('b.mp4', 'video/mp4'),
    );

    expect(input.files).toEqual([first]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says that frames only accept video when none was dropped', () => {
    const { drop } = show('FRAME');

    drop(picked('cover.jpg', 'image/jpeg'));

    expect(input.files).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Frames only accept video.');
  });

  it('shows where to drop while files are dragged over it', () => {
    const { zone } = show();
    expect(screen.queryByText('Drop files here')).toBeNull();

    fireEvent.dragEnter(zone, { dataTransfer: { items: [{}] } });
    expect(screen.getByText('Drop files here')).toBeInTheDocument();

    fireEvent.dragLeave(zone);
    expect(screen.queryByText('Drop files here')).toBeNull();
  });

  it('offers a text story only for stories', () => {
    const story = show('STORY');
    fireEvent.click(screen.getByRole('button', { name: /Create Text Story/ }));
    expect(story.onTextStory).toHaveBeenCalledTimes(1);
  });

  it('does not offer a text story for a post', () => {
    show('POST');
    expect(
      screen.queryByRole('button', { name: /Create Text Story/ }),
    ).toBeNull();
  });

  it('changes the kind of content from its tabs, unless it was chosen on the way in', () => {
    const open = show('POST');
    fireEvent.click(screen.getByRole('tab', { name: /Story/ }));
    expect(open.setMode).toHaveBeenCalledWith('STORY');
  });

  it('hides the tabs when the kind was chosen on the way in', () => {
    show('POST', { allowModeSwitch: false });
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('UploadStep in the iOS app', () => {
  const show = (mode: 'POST' | 'STORY' | 'FRAME') =>
    renderWithProviders(
      <UploadStep
        fileInputRef={{ current: null }}
        handleFileSelect={vi.fn()}
        mode={mode}
        setMode={vi.fn()}
        onContinueChange={vi.fn()}
        onTextStory={vi.fn()}
      />,
      { lng: 'es' },
    );

  beforeEach(() => {
    platform.name = 'ios';
  });
  afterEach(() => {
    platform.name = 'web';
  });

  it('shows the photos of the device in the shape of a post', () => {
    show('POST');

    const gallery = screen.getByTestId('device-gallery');
    expect(gallery).toHaveAttribute('data-ratio', '4 / 5');
    expect(gallery).toHaveAttribute('data-single', 'false');
  });

  it('takes one video for a frame', () => {
    show('FRAME');

    const gallery = screen.getByTestId('device-gallery');
    expect(gallery).toHaveAttribute('data-videos-only', 'true');
    expect(gallery).toHaveAttribute('data-single', 'true');
    expect(gallery).toHaveAttribute('data-ratio', '9 / 16');
  });

  it('keeps the text story of a story beside the gallery', () => {
    platform.galleryShown = true;
    show('STORY');
    platform.galleryShown = false;

    expect(
      screen.getByRole('button', { name: /Crear Historia de Texto/ }),
    ).toBeInTheDocument();
  });

  it('offers the text story once when the gallery gives way to picking files', () => {
    show('STORY');

    expect(
      screen.getAllByRole('button', { name: /Crear Historia de Texto/ }),
    ).toHaveLength(1);
  });

  it('falls back to picking files, and says why, when photos cannot be listed', () => {
    show('POST');

    expect(
      screen.getByText(
        'Permite el acceso a tus fotos en Ajustes para verlas aquí.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Seleccionar del dispositivo' }),
    ).toBeInTheDocument();
  });

  it('is not shown on the web', () => {
    platform.name = 'web';
    show('POST');

    expect(screen.queryByTestId('device-gallery')).not.toBeInTheDocument();
  });
});
