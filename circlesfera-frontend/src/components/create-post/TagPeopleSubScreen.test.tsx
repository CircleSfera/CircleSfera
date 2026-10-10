import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile, PostTagData } from '../../hooks/useCreatePost';
import { searchApi } from '../../services/search.service';
import { renderWithProviders } from '../../test/test-utils';
import TagPeopleSubScreen from './TagPeopleSubScreen';

vi.mock('../../services/search.service', () => ({
  searchApi: { searchUsers: vi.fn() },
}));
// The search runs on what was typed, with no wait.
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
}));

const api = vi.mocked(searchApi);
const onClose = vi.fn();
const photo = (url: string, over: object = {}) =>
  ({ url, type: 'image', ...over }) as unknown as MediaFile;
const clip = (url: string) => ({ url, type: 'video' }) as unknown as MediaFile;
const person = (username: string, over: object = {}) => ({
  id: `id-${username}`,
  username,
  fullName: null,
  avatar: null,
  ...over,
});

let tags: Record<number, PostTagData[]> = {};
function Screen({
  media,
  start,
}: {
  media: MediaFile[];
  start: Record<number, PostTagData[]>;
}) {
  const [tagsMap, setTagsMap] = useState(start);
  tags = tagsMap;
  return (
    <TagPeopleSubScreen
      mediaFiles={media}
      tagsMap={tagsMap}
      setTagsMap={setTagsMap}
      onClose={onClose}
    />
  );
}
const show = (
  media: MediaFile[] = [photo('https://cdn.test/one.jpg')],
  start: Record<number, PostTagData[]> = {},
) => renderWithProviders(<Screen media={media} start={start} />);

const picture = () =>
  document.querySelector('img.cursor-crosshair') as HTMLImageElement;
// The photo measures 200 by 100 and starts at 10, 20.
const tapAt = (clientX: number, clientY: number) => {
  vi.spyOn(picture(), 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    width: 200,
    height: 100,
  } as DOMRect);
  fireEvent.click(picture(), { clientX, clientY });
};
const search = () => screen.getByRole('textbox', { name: 'Search user...' });
const typeName = (value: string) =>
  fireEvent.change(search(), { target: { value } });

describe('TagPeopleSubScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tags = {};
    api.searchUsers.mockResolvedValue({
      data: [person('ana', { fullName: 'Ana Ruiz' }), person('leo')],
    } as never);
  });

  it('starts with the photo, the hint and no tags', () => {
    show();

    expect(picture()).toHaveAttribute('src', 'https://cdn.test/one.jpg');
    expect(screen.getByText('Tap photo to tag people')).toBeInTheDocument();
    expect(
      screen.getByText('No tags yet. Tap the photo to add tags.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the photo with the filter chosen for it', () => {
    show([photo('https://cdn.test/one.jpg', { filter: 'sepia(1)' })]);

    expect(picture().style.filter).toBe('sepia(1)');
  });

  it('opens the search where the photo was tapped, asking to type', () => {
    show();

    tapAt(110, 45);

    expect(search()).toHaveValue('');
    expect(screen.getByText('Type to search')).toBeInTheDocument();
    expect(api.searchUsers).not.toHaveBeenCalled();
  });

  it('does not search for a single letter', () => {
    show();
    tapAt(110, 45);

    typeName(' a ');

    expect(api.searchUsers).not.toHaveBeenCalled();
    expect(screen.getByText('Type to search')).toBeInTheDocument();
  });

  it('tags the person chosen at the point that was tapped', async () => {
    show();
    tapAt(110, 45);

    typeName('an');
    expect(screen.getByText('Searching...')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /ana/ }));

    expect(api.searchUsers).toHaveBeenCalledWith('an');
    expect(tags).toEqual({
      0: [{ profileId: 'id-ana', username: 'ana', x: 0.5, y: 0.25 }],
    });
    expect(screen.getByText('@ana')).toBeInTheDocument();
    // The search closes once the person is tagged.
    await waitFor(() =>
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument(),
    );
  });

  it('shows the full name under the username when there is one', async () => {
    show();
    tapAt(110, 45);

    typeName('an');

    const ana = await screen.findByRole('button', { name: /ana/ });
    expect(within(ana).getByText('Ana Ruiz')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: 'leo' })).queryByText(/Ruiz/),
    ).not.toBeInTheDocument();
  });

  it('does not tag the same person twice on one photo', async () => {
    show(undefined, {
      0: [{ profileId: 'id-ana', username: 'ana', x: 0.1, y: 0.1 }],
    });
    tapAt(110, 45);

    typeName('an');
    fireEvent.click(await screen.findByRole('button', { name: /Ana Ruiz/ }));

    expect(tags[0]).toEqual([
      { profileId: 'id-ana', username: 'ana', x: 0.1, y: 0.1 },
    ]);
  });

  it('says nobody was found', async () => {
    api.searchUsers.mockResolvedValue({ data: [] } as never);
    show();
    tapAt(110, 45);

    typeName('zz');

    expect(await screen.findByText('No users found')).toBeInTheDocument();
  });

  it('treats an answer that is not a list as nobody found', async () => {
    api.searchUsers.mockResolvedValue({ data: { users: [] } } as never);
    show();
    tapAt(110, 45);

    typeName('zz');

    expect(await screen.findByText('No users found')).toBeInTheDocument();
  });

  it('says the search failed and tries again when asked', async () => {
    api.searchUsers.mockRejectedValueOnce(new Error('down'));
    show();
    tapAt(110, 45);

    typeName('an');
    expect(
      await screen.findByText('Could not search for people.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(
      await screen.findByRole('button', { name: /ana/ }),
    ).toBeInTheDocument();
  });

  it('closes the search with Cancel, or by tapping the photo again, tagging nobody', async () => {
    show();

    tapAt(110, 45);
    typeName('an');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument(),
    );

    tapAt(110, 45);
    expect(search()).toHaveValue('');
    tapAt(50, 50);
    await waitFor(() =>
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument(),
    );
    expect(tags).toEqual({});
  });

  it('removes the tag the person asks to remove, and only that one', () => {
    show(undefined, {
      0: [
        { profileId: 'id-ana', username: 'ana', x: 0.1, y: 0.1 },
        { profileId: 'id-leo', username: 'leo', x: 0.6, y: 0.6 },
      ],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove the tag of ana' }),
    );

    expect(tags[0]).toEqual([
      { profileId: 'id-leo', username: 'leo', x: 0.6, y: 0.6 },
    ]);
    expect(screen.queryByText('@ana')).not.toBeInTheDocument();
    expect(screen.getByText('@leo')).toBeInTheDocument();
  });

  it('offers no way between items for a single photo', () => {
    show();

    expect(
      screen.queryByRole('button', { name: /Item 1 of/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the tags of each photo apart', async () => {
    show(
      [photo('https://cdn.test/one.jpg'), photo('https://cdn.test/two.jpg')],
      { 0: [{ profileId: 'id-ana', username: 'ana', x: 0.1, y: 0.1 }] },
    );
    expect(screen.getByRole('button', { name: 'Item 1 of 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    tapAt(110, 45);
    fireEvent.click(screen.getByRole('button', { name: 'Item 2 of 2' }));

    // Moving to another photo closes the search and shows that photo's tags.
    expect(picture()).toHaveAttribute('src', 'https://cdn.test/two.jpg');
    expect(screen.queryByText('@ana')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument(),
    );

    tapAt(210, 120);
    typeName('le');
    fireEvent.click(await screen.findByRole('button', { name: 'leo' }));

    expect(tags).toEqual({
      0: [{ profileId: 'id-ana', username: 'ana', x: 0.1, y: 0.1 }],
      1: [{ profileId: 'id-leo', username: 'leo', x: 1, y: 1 }],
    });
  });

  it('says a video cannot be tagged', () => {
    show([photo('https://cdn.test/one.jpg'), clip('https://cdn.test/v.mp4')]);

    fireEvent.click(screen.getByRole('button', { name: 'Item 2 of 2' }));

    expect(
      screen.getByText('Tagging is only supported on images.'),
    ).toBeInTheDocument();
    expect(document.querySelector('img.cursor-crosshair')).toBeNull();
  });

  it('leaves with Done and with the back arrow', () => {
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
