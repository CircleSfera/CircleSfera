import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import CaptionStep from './CaptionStep';

const session = vi.hoisted(() => ({
  profile: { username: 'tester' } as { username: string; memberRole?: string },
}));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof session) => unknown) => sel(session),
}));

vi.mock('../UserAvatar', () => ({
  default: () => <div data-testid="avatar" />,
}));

const suggest = vi.hoisted(() => ({
  props: null as null | Record<string, any>,
}));
vi.mock('./CaptionSuggestions', () => ({
  default: (props: Record<string, any>) => {
    suggest.props = props;
    return props.token ? <div data-testid="suggestions" /> : props.children;
  },
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
    session.profile = { username: 'tester' };
  });

  it('offers to share the post to the story of its author only when it may be', () => {
    const onChange = vi.fn();
    const shown = renderWithProviders(
      <CaptionStep
        {...baseProps}
        mediaFiles={[imageFile]}
        mode="POST"
        shareToStory={{ on: false, onChange }}
      />,
    );
    const label = shown.i18n!.t('createPost.caption.share_to_story');
    const toggle = screen.getByRole('switch', { name: label });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    shown.unmount();

    renderWithProviders(
      <CaptionStep {...baseProps} mediaFiles={[imageFile]} mode="POST" />,
    );
    expect(screen.queryByRole('switch', { name: label })).toBeNull();
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

  it('offers the cover on a Frame only, and opens its screen', () => {
    const view = renderWithProviders(
      <CaptionStep {...baseProps} mediaFiles={[videoFile]} mode="FRAME" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose cover' }));
    expect(baseProps.setSubScreen).toHaveBeenCalledWith('cover');
    view.unmount();

    renderWithProviders(
      <CaptionStep {...baseProps} mediaFiles={[videoFile]} mode="POST" />,
    );
    expect(
      screen.queryByRole('button', { name: 'Choose cover' }),
    ).not.toBeInTheDocument();
  });

  it('says so on a Frame whose cover is already chosen', () => {
    renderWithProviders(
      <CaptionStep
        {...baseProps}
        mediaFiles={[videoFile]}
        mode="FRAME"
        hasChosenCover
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Cover chosen' }),
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

  it('uses 56 px option rows without truncating labels to a single ellipsis line', () => {
    const { i18n } = renderWithProviders(
      <CaptionStep {...baseProps} mediaFiles={[imageFile]} mode="POST" />,
      { lng: 'es' },
    );

    const locationBtn = screen
      .getByText(i18n!.t('createPost.caption.add_location'))
      .closest('button');
    expect(locationBtn?.className).toMatch(/min-h-14/);

    const label = screen.getByText(i18n!.t('createPost.caption.add_location'));
    expect(label.className).toMatch(/line-clamp-2/);
    expect(label.className).not.toMatch(/(?:^|\s)truncate(?:\s|$)/);
  });

  it('suggests for the mention being written and puts the one chosen in', () => {
    function Controlled() {
      const [caption, setCaption] = useState('');
      return (
        <CaptionStep
          {...baseProps}
          caption={caption}
          setCaption={setCaption}
          mediaFiles={[imageFile]}
          mode="POST"
        />
      );
    }
    renderWithProviders(<Controlled />, { lng: 'es' });
    const field = screen.getByRole('textbox');
    fireEvent.focus(field);
    fireEvent.change(field, {
      target: { value: 'Hola @an', selectionStart: 8 },
    });

    expect(screen.getByTestId('suggestions')).toBeInTheDocument();
    expect(suggest.props?.token).toMatchObject({
      kind: 'mention',
      query: 'an',
    });

    act(() => suggest.props?.onPick('ana'));
    expect(field).toHaveValue('Hola @ana ');
  });
});
