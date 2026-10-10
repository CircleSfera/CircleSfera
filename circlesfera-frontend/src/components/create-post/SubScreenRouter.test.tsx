import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import SubScreenRouter from './SubScreenRouter';

type Props = Record<string, any>;
type RouterProps = ComponentProps<typeof SubScreenRouter>;

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

function show(subScreen: string, more: Props = {}) {
  const props = {
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
    isSensitive: false,
    setIsSensitive: vi.fn(),
    showSensitiveToggle: true,
    setLocation: vi.fn(),
    location: 'Madrid',
    setSelectedPlace: vi.fn(),
    onGenerateAltText: vi.fn(),
    isPremium: false,
    setIsPremium: vi.fn(),
    price: 3,
    setPrice: vi.fn(),
    setInteractiveDraft: vi.fn(),
    setSelectedAudio: vi.fn(),
    audioStartMs: 0,
    clipWindowMs: 15_000,
    ...more,
  };
  renderWithProviders(
    <SubScreenRouter
      {...({ ...props, subScreen } as unknown as RouterProps)}
    />,
  );
  return props;
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
    'close_friends',
  ])('shows the %s screen and goes back to the caption from it', (name) => {
    const props = show(name);

    expect(screen.getByTestId(name)).toBeInTheDocument();
    seen.props.onClose();
    expect(props.setSubScreen).toHaveBeenCalledWith('none');
  });

  it('shows nothing on the caption step itself', () => {
    const { container } = renderWithProviders(
      <SubScreenRouter
        {...({ subScreen: 'none' } as unknown as RouterProps)}
      />,
    );

    expect(container).toBeEmptyDOMElement();
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
    show('music', {
      selectedAudio: { id: 'track-1' },
      audioStartMs: 4000,
      clipWindowMs: 9000,
    });

    expect(seen.props).toMatchObject({
      selectedAudioId: 'track-1',
      selectedAudioStartMs: 4000,
      clipWindowMs: 9000,
    });
  });

  it.each([
    [
      'the poll or questions screen',
      'interactive',
      { setInteractiveDraft: undefined },
    ],
    ['the music screen', 'music', { setSelectedAudio: undefined }],
  ])(
    'does not show %s to a composer that cannot keep its result',
    (_what, name, missing) => {
      show(name, missing);

      expect(screen.queryByTestId(name)).toBeNull();
    },
  );
});
