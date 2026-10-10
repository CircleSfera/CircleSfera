import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile, PostTagData } from '../../hooks/useCreatePost';
import { searchApi } from '../../services/search.service';
import { renderWithProviders } from '../../test/test-utils';
import TagPeopleSubScreen from './TagPeopleSubScreen';

vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);
vi.mock('../../services/search.service', () => ({
  searchApi: { searchUsers: vi.fn() },
}));

const file = (url: string, type: 'image' | 'video' = 'image'): MediaFile => ({
  file: new File(['x'], 'a'),
  url,
  type,
});

function Screen({
  media,
  initial = {},
  onClose = () => {},
  seen,
}: {
  media: MediaFile[];
  initial?: Record<number, PostTagData[]>;
  onClose?: () => void;
  seen: { tags: Record<number, PostTagData[]> };
}) {
  const [tags, setTags] = useState(initial);
  seen.tags = tags;
  return (
    <TagPeopleSubScreen
      mediaFiles={media}
      tagsMap={tags}
      setTagsMap={setTags}
      onClose={onClose}
    />
  );
}

function show(media: MediaFile[], initial: Record<number, PostTagData[]> = {}) {
  const seen = { tags: initial };
  const onClose = vi.fn();
  const view = renderWithProviders(
    <Screen media={media} initial={initial} onClose={onClose} seen={seen} />,
  );
  return { seen, onClose, ...view };
}

const photo = () =>
  document.querySelector('img.cursor-crosshair') as HTMLElement;
/** A tap on the photo at a point given as a share of its size. */
const tapAt = (x: number, y: number) => {
  photo().getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  fireEvent.click(photo(), { clientX: x * 200, clientY: y * 100 });
};
const search = async (text: string) => {
  fireEvent.change(screen.getByPlaceholderText('Search user...'), {
    target: { value: text },
  });
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
};

describe('TagPeopleSubScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(searchApi.searchUsers).mockResolvedValue({
      data: [
        { id: 'p1', username: 'ana', fullName: 'Ana Ruiz' },
        { id: 'p2', username: 'luis' },
      ],
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks who is at the point that was tapped', () => {
    show([file('blob:a')]);
    expect(screen.queryByPlaceholderText('Search user...')).toBeNull();

    tapAt(0.25, 0.5);

    expect(screen.getByPlaceholderText('Search user...')).toBeInTheDocument();
    expect(screen.getByText('Type to search')).toBeInTheDocument();
  });

  it('tags the chosen person where the photo was tapped', async () => {
    const { seen } = show([file('blob:a')]);
    tapAt(0.25, 0.5);

    await search('an');
    fireEvent.click(await screen.findByRole('button', { name: /ana/ }));

    expect(searchApi.searchUsers).toHaveBeenCalledWith('an');
    expect(seen.tags).toEqual({
      0: [{ profileId: 'p1', username: 'ana', x: 0.25, y: 0.5 }],
    });
    expect(screen.getByText('@ana')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Search user...')).toBeNull(),
    );
  });

  it('does not search for a single letter', async () => {
    show([file('blob:a')]);
    tapAt(0.5, 0.5);

    await search('a');

    expect(searchApi.searchUsers).not.toHaveBeenCalled();
    expect(screen.getByText('Type to search')).toBeInTheDocument();
  });

  it('says so when nobody is found, and offers to try again when the search fails', async () => {
    vi.mocked(searchApi.searchUsers).mockResolvedValueOnce({
      data: [],
    } as never);
    show([file('blob:a')]);
    tapAt(0.5, 0.5);

    await search('zz');
    expect(await screen.findByText('No users found')).toBeInTheDocument();

    vi.mocked(searchApi.searchUsers).mockRejectedValueOnce(new Error('down'));
    await search('zzz');
    expect(
      await screen.findByText('Could not search for people.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(
      await screen.findByRole('button', { name: /ana/ }),
    ).toBeInTheDocument();
  });

  it('does not tag the same person twice on a photo', async () => {
    const { seen } = show([file('blob:a')], {
      0: [{ profileId: 'p1', username: 'ana', x: 0.1, y: 0.1 }],
    });
    tapAt(0.8, 0.8);

    await search('an');
    fireEvent.click(await screen.findByRole('button', { name: /Ana Ruiz/ }));

    expect(seen.tags[0]).toHaveLength(1);
    expect(seen.tags[0][0]).toMatchObject({ x: 0.1, y: 0.1 });
  });

  it('removes a tag', () => {
    const { seen } = show([file('blob:a')], {
      0: [
        { profileId: 'p1', username: 'ana', x: 0.1, y: 0.1 },
        { profileId: 'p2', username: 'luis', x: 0.5, y: 0.5 },
      ],
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(seen.tags[0].map((tag) => tag.username)).toEqual(['luis']);
  });

  it('lets go of the point on a second tap or on cancel', async () => {
    show([file('blob:a')]);

    tapAt(0.5, 0.5);
    tapAt(0.2, 0.2);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Search user...')).toBeNull(),
    );

    tapAt(0.5, 0.5);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Search user...')).toBeNull(),
    );
  });

  it('keeps the tags of each photo of a carousel apart', async () => {
    const { seen } = show([file('blob:a'), file('blob:b')], {
      0: [{ profileId: 'p2', username: 'luis', x: 0.5, y: 0.5 }],
    });
    expect(screen.getByText('@luis')).toBeInTheDocument();

    // The second thumbnail of the strip under the photo.
    const thumbs = screen
      .getAllByRole('button')
      .filter((button) => button.querySelector('img[src="blob:b"]'));
    fireEvent.click(thumbs[0]);

    expect(screen.queryByText('@luis')).toBeNull();
    expect(
      screen.getByText('No tags yet. Tap the photo to add tags.'),
    ).toBeInTheDocument();

    tapAt(0.3, 0.3);
    await search('an');
    fireEvent.click(await screen.findByRole('button', { name: /ana/ }));

    expect(seen.tags[1]).toEqual([
      { profileId: 'p1', username: 'ana', x: 0.3, y: 0.3 },
    ]);
    expect(seen.tags[0]).toHaveLength(1);
  });

  it('says a video cannot be tagged', () => {
    show([file('blob:v', 'video')]);

    expect(
      screen.getByText('Tagging is only supported on images.'),
    ).toBeInTheDocument();
  });

  it('goes back from the arrow and from Done', async () => {
    const { onClose } = show([file('blob:a')]);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });
});
