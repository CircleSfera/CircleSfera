import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '../../hooks/useCreatePostState';
import { renderWithProviders } from '../../test/test-utils';
import { exportEditedImage } from '../../utils/imageExport';
import PostCanvasEditor from './PostCanvasEditor';

type Props = Record<string, any>;
const seen = vi.hoisted(() => ({ composer: {} as Record<string, any> }));

vi.mock('../story/StoryComposer', () => ({
  default: (props: Props) => {
    seen.composer = props;
    return <div data-testid="canvas" />;
  },
}));
vi.mock('../../utils/imageExport', () => ({
  exportEditedImage: vi.fn(),
}));

const photo = new File(['p'], 'beach.jpg', { type: 'image/jpeg' });
const item = (extra: Partial<MediaFile> = {}): MediaFile => ({
  file: photo,
  url: 'blob:beach',
  type: 'image',
  ...extra,
});

function open(media: MediaFile) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <PostCanvasEditor
      item={media}
      shape="SQUARE"
      onDone={onDone}
      onCancel={onCancel}
    />,
  );
  return { onDone, onCancel };
}

describe('PostCanvasEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seen.composer = {};
  });

  it('opens a photo with no edits as it is, in the shape of the post', async () => {
    open(item());

    await screen.findByTestId('canvas');
    expect(seen.composer.initialMedia).toBe(photo);
    expect(seen.composer.frame).toBe('SQUARE');
    expect(exportEditedImage).not.toHaveBeenCalled();
  });

  it('opens a photo with earlier edits with those edits in it', async () => {
    const edited = new File(['e'], 'edited.jpg', { type: 'image/jpeg' });
    vi.mocked(exportEditedImage).mockResolvedValue(edited);
    const filter = 'filter-class:moon__style:';

    open(item({ filter }));

    await screen.findByTestId('canvas');
    expect(exportEditedImage).toHaveBeenCalledWith(
      photo,
      filter,
      undefined,
      undefined,
    );
    expect(seen.composer.initialMedia).toBe(edited);
  });

  it('opens again where it was left: the same photo, what was on it, its place', async () => {
    const base = new File(['b'], 'base.jpg', { type: 'image/jpeg' });
    const elements = [{ id: 't', type: 'text', content: 'Hola' }];
    const where = { x: 0.1, y: 0, scale: 2, rotation: 0, filter: 1 };

    open(
      item({ canvasEdit: { base, elements: elements as never, photo: where } }),
    );

    await screen.findByTestId('canvas');
    expect(seen.composer.initialMedia).toBe(base);
    expect(seen.composer.elements).toEqual(elements);
    expect(seen.composer.initialPhoto).toEqual(where);
    expect(exportEditedImage).not.toHaveBeenCalled();
  });

  it('gives back the picture, named as the photo, with what it was made of', async () => {
    const { onDone } = open(item());
    await screen.findByTestId('canvas');
    const added = [{ id: 'e', type: 'emoji', content: '🌊' }];
    const where = { x: 0, y: 0, scale: 1.2, rotation: 0, filter: 0 };

    act(() => {
      seen.composer.onElementsChange(added);
      seen.composer.onPhotoChange(where);
      seen.composer.onPost(new Blob(['png'], { type: 'image/png' }));
    });

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [[file, edit]] = onDone.mock.calls;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('beach.png');
    expect(file.type).toBe('image/png');
    expect(edit).toEqual({ base: photo, elements: added, photo: where });
  });

  it('closing leaves the photo as it was', async () => {
    const { onCancel, onDone } = open(item());
    await screen.findByTestId('canvas');

    act(() => seen.composer.onClose());

    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
