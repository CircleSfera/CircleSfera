import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import CaptionStep from './CaptionStep';

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (sel: (s: { profile: { username: string } }) => unknown) =>
    sel({ profile: { username: 'tester' } }),
}));

vi.mock('../UserAvatar', () => ({
  default: () => <div data-testid="avatar" />,
}));

vi.mock('./InteractiveMediaPreview', () => ({
  default: () => <div data-testid="media-preview" />,
}));

const imageFile = {
  file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
  url: 'blob:img',
  type: 'image' as const,
};

const videoFile = {
  file: new File(['x'], 'a.mp4', { type: 'video/mp4' }),
  url: 'blob:vid',
  type: 'video' as const,
};

const baseProps = {
  caption: '',
  setCaption: vi.fn(),
  location: '',
  setSubScreen: vi.fn(),
  selectedAudio: null,
  onClearAudio: vi.fn(),
  onOpenMusic: vi.fn(),
};

describe('CaptionStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides Tag People on Frame and surfaces music first', () => {
    const { i18n } = renderWithProviders(
      <CaptionStep {...baseProps} mediaFiles={[videoFile]} mode="FRAME" />,
      { lng: 'es' },
    );

    expect(
      screen.queryByText(i18n!.t('createPost.caption.tag_people')),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('createPost.caption.add_music')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('createPost.caption.add_location')),
    ).toBeInTheDocument();
  });

  it('shows Tag People on Post when media includes an image', () => {
    const { i18n } = renderWithProviders(
      <CaptionStep {...baseProps} mediaFiles={[imageFile]} mode="POST" />,
      { lng: 'es' },
    );

    expect(
      screen.getByText(i18n!.t('createPost.caption.tag_people')),
    ).toBeInTheDocument();
  });

  it('uses dense option rows without truncating labels to a single ellipsis line', () => {
    const { i18n } = renderWithProviders(
      <CaptionStep {...baseProps} mediaFiles={[imageFile]} mode="POST" />,
      { lng: 'es' },
    );

    const locationBtn = screen
      .getByText(i18n!.t('createPost.caption.add_location'))
      .closest('button');
    expect(locationBtn?.className).toMatch(/min-h-11/);

    const label = screen.getByText(i18n!.t('createPost.caption.add_location'));
    expect(label.className).toMatch(/line-clamp-2/);
    expect(label.className).not.toMatch(/(?:^|\s)truncate(?:\s|$)/);
  });
});
