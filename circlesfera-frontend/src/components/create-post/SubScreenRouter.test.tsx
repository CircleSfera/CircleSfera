import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInComposer } from '../../test/composer';
import { renderWithProviders } from '../../test/test-utils';
import SubScreenRouter from './SubScreenRouter';

type Props = Record<string, any>;

/** The props the screen on show last received. */
const seen = vi.hoisted(() => ({ props: {} as Record<string, any> }));
const { screenOf } = vi.hoisted(() => ({
  screenOf: (name: string) => ({
    default: (props: Record<string, any>) => {
      seen.props = props;
      return <div data-testid={name} />;
    },
  }),
}));

vi.mock('./LocationSubScreen', () => screenOf('location'));
vi.mock('./AccessibilitySubScreen', () => screenOf('accessibility'));
vi.mock('./AdvancedSettingsSubScreen', () => screenOf('advanced'));
vi.mock('./TagPeopleSubScreen', () => screenOf('tags'));
vi.mock('./MonetizationSubScreen', () => screenOf('monetization'));
vi.mock('./InteractiveSubScreen', () => screenOf('interactive'));
vi.mock('./MusicSubScreen', () => screenOf('music'));
vi.mock('./CloseFriendsSubScreen', () => screenOf('close_friends'));
vi.mock('./CoverSubScreen', () => screenOf('cover'));

/** The composer on the given screen, and what it holds. */
function show(
  subScreen: string,
  more: Props = {},
  clipWindowMs: number | undefined = 15_000,
) {
  const composer = {
    mode: 'POST',
    subScreen,
    setSubScreen: vi.fn(),
    mediaFiles: [],
    altTextMap: {},
    setAltTextMap: vi.fn(),
    tagsMap: {},
    setTagsMap: vi.fn(),
    hideLikes: false,
    setHideLikes: vi.fn(),
    turnOffComments: false,
    setTurnOffComments: vi.fn(),
    coverTimeMs: null,
    setCoverTimeMs: vi.fn(),
    isSensitive: false,
    setIsSensitive: vi.fn(),
    setLocation: vi.fn(),
    location: 'Madrid',
    setSelectedPlace: vi.fn(),
    generateAltTextForIndex: vi.fn(),
    isPremium: false,
    setIsPremium: vi.fn(),
    price: 3,
    setPrice: vi.fn(),
    scheduledAt: '',
    setScheduledAt: vi.fn(),
    interactiveDraft: null,
    setInteractiveDraft: vi.fn(),
    selectedAudio: null,
    setSelectedAudio: vi.fn(),
    audioStartMs: 0,
    setAudioStartMs: vi.fn(),
    ...more,
  };
  const view = renderInComposer(
    <SubScreenRouter clipWindowMs={clipWindowMs} />,
    composer,
  );
  return { ...composer, ...view };
}

describe('SubScreenRouter', () => {
  beforeEach(() => {
    seen.props = {};
  });

  it.each([
    'location',
    'accessibility',
    'advanced',
    'tags',
    'monetization',
    'interactive',
    'music',
    'cover',
    'close_friends',
  ])('shows the %s screen and goes back to the caption from it', (name) => {
    const props = show(name);

    expect(screen.getByTestId(name)).toBeInTheDocument();
    seen.props.onClose();
    expect(props.setSubScreen).toHaveBeenCalledWith('none');
  });

  it('shows nothing on the caption step itself', () => {
    const { container } = show('none');

    expect(container).toBeEmptyDOMElement();
  });

  it('cannot be shown outside a composer', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderWithProviders(<SubScreenRouter />)).toThrow(
      'This screen is shown outside the composer',
    );
    quiet.mockRestore();
  });

  it('keeps the place chosen, with its name, and goes back', () => {
    const props = show('location');
    const place = { mapboxId: 'm1', name: 'Sevilla' };

    seen.props.onSelect({ location: 'Sevilla', place });

    expect(seen.props.currentLocation).toBe('Madrid');
    expect(props.setLocation).toHaveBeenCalledWith('Sevilla');
    expect(props.setSelectedPlace).toHaveBeenCalledWith(place);
    expect(props.setSubScreen).toHaveBeenCalledWith('none');
  });

  it('takes the place off, with its name, and goes back', () => {
    const props = show('location');

    seen.props.onClear();

    expect(props.setLocation).toHaveBeenCalledWith('');
    expect(props.setSelectedPlace).toHaveBeenCalledWith(null);
    expect(props.setSubScreen).toHaveBeenCalledWith('none');
  });

  it('hands the music screen the track in use, where it starts and how much fits', () => {
    show(
      'music',
      { selectedAudio: { id: 'track-1' }, audioStartMs: 4000 },
      9000,
    );

    expect(seen.props).toMatchObject({
      selectedAudioId: 'track-1',
      selectedAudioStartMs: 4000,
      clipWindowMs: 9000,
    });
  });

  it('keeps the track chosen with the moment it starts, and clears both when it is taken off', () => {
    const composer = show('music');
    const audio = { id: 'track-2' };

    seen.props.onSelectAudio({ audio, audioStartMs: 2500 });
    expect(composer.setSelectedAudio).toHaveBeenLastCalledWith(audio);
    expect(composer.setAudioStartMs).toHaveBeenLastCalledWith(2500);

    seen.props.onSelectAudio(null);
    expect(composer.setSelectedAudio).toHaveBeenLastCalledWith(null);
    expect(composer.setAudioStartMs).toHaveBeenLastCalledWith(0);
  });

  it.each([
    ['a post', 'POST', true],
    ['a frame', 'FRAME', true],
    ['a story', 'STORY', false],
  ])('offers to mark %s as sensitive: %s', (_what, mode, offered) => {
    show('advanced', { mode });

    expect(seen.props.showSensitiveToggle).toBe(offered);
  });

  it('hands the cover screen the moment chosen and how to change it', () => {
    const composer = show('cover', { coverTimeMs: 1500 });

    expect(seen.props.coverTimeMs).toBe(1500);
    expect(seen.props.setCoverTimeMs).toBe(composer.setCoverTimeMs);
  });

  it('hands each screen what the composer holds for it', () => {
    const composer = show('accessibility', { mode: 'FRAME' });
    expect(seen.props).toMatchObject({
      mode: 'FRAME',
      altTextMap: composer.altTextMap,
      onGenerateAltText: composer.generateAltTextForIndex,
    });
  });
});
