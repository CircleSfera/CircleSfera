import type { Dispatch, SetStateAction } from 'react';
import type { MediaFile } from '../../hooks/useCreatePost';
import type { Audio } from '../../types';
import AccessibilitySubScreen from './AccessibilitySubScreen';
import AdvancedSettingsSubScreen from './AdvancedSettingsSubScreen';
import CloseFriendsSubScreen from './CloseFriendsSubScreen';
import InteractiveSubScreen, {
  type InteractiveDraft,
} from './InteractiveSubScreen';
import LocationSubScreen from './LocationSubScreen';
import MonetizationSubScreen from './MonetizationSubScreen';
import MusicSubScreen, { type AudioSelection } from './MusicSubScreen';
import TagPeopleSubScreen from './TagPeopleSubScreen';

/** Routes caption sub-screens for the stepped Post/Frame composer. */

interface SubScreenRouterProps {
  subScreen:
    | 'none'
    | 'location'
    | 'accessibility'
    | 'advanced'
    | 'tags'
    | 'monetization'
    | 'interactive'
    | 'music'
    | 'close_friends';
  setSubScreen: (
    screen:
      | 'none'
      | 'location'
      | 'accessibility'
      | 'advanced'
      | 'tags'
      | 'monetization'
      | 'interactive'
      | 'music'
      | 'close_friends',
  ) => void;
  mediaFiles: MediaFile[];
  altTextMap: Record<number, string>;
  setAltTextMap: Dispatch<SetStateAction<Record<number, string>>>;
  tagsMap: Record<number, any>;
  setTagsMap: Dispatch<SetStateAction<Record<number, any>>>;
  handleRemoveFile: (index: number) => void;
  hideLikes: boolean;
  setHideLikes: (val: boolean) => void;
  turnOffComments: boolean;
  setTurnOffComments: (val: boolean) => void;
  isSensitive: boolean;
  setIsSensitive: (val: boolean) => void;
  showSensitiveToggle: boolean;
  setLocation: (loc: string) => void;
  location: string;
  setSelectedPlace: (
    place: {
      mapboxId: string;
      name: string;
      fullName?: string;
      latitude: number;
      longitude: number;
      country?: string;
      region?: string;
      locality?: string;
    } | null,
  ) => void;
  onGenerateAltText: (index: number) => Promise<void>;
  isPremium?: boolean;
  setIsPremium?: (val: boolean) => void;
  price?: number;
  setPrice?: (val: number) => void;
  scheduledAt?: string;
  setScheduledAt?: (val: string) => void;
  interactiveDraft?: InteractiveDraft;
  setInteractiveDraft?: (val: InteractiveDraft) => void;
  selectedAudio?: Audio | null;
  setSelectedAudio?: (val: AudioSelection | null) => void;
  audioStartMs?: number;
  clipWindowMs?: number;
}

export default function SubScreenRouter({
  subScreen,
  setSubScreen,
  mediaFiles,
  altTextMap,
  setAltTextMap,
  tagsMap,
  setTagsMap,
  handleRemoveFile,
  hideLikes,
  setHideLikes,
  turnOffComments,
  setTurnOffComments,
  isSensitive,
  setIsSensitive,
  showSensitiveToggle,
  setLocation,
  location,
  setSelectedPlace,
  onGenerateAltText,
  isPremium,
  setIsPremium,
  price,
  setPrice,
  scheduledAt = '',
  setScheduledAt,
  interactiveDraft = null,
  setInteractiveDraft,
  selectedAudio,
  setSelectedAudio,
  audioStartMs,
  clipWindowMs,
}: SubScreenRouterProps) {
  if (subScreen === 'location') {
    return (
      <LocationSubScreen
        currentLocation={location}
        onClose={() => setSubScreen('none')}
        onSelect={(selection) => {
          setLocation(selection.location);
          setSelectedPlace(selection.place);
          setSubScreen('none');
        }}
        onClear={() => {
          setLocation('');
          setSelectedPlace(null);
          setSubScreen('none');
        }}
      />
    );
  }

  if (subScreen === 'accessibility') {
    return (
      <AccessibilitySubScreen
        mediaFiles={mediaFiles}
        altTextMap={altTextMap}
        setAltTextMap={setAltTextMap}
        onRemoveFile={handleRemoveFile}
        onClose={() => setSubScreen('none')}
        onGenerateAltText={onGenerateAltText}
      />
    );
  }

  if (subScreen === 'advanced') {
    return (
      <AdvancedSettingsSubScreen
        hideLikes={hideLikes}
        setHideLikes={setHideLikes}
        turnOffComments={turnOffComments}
        setTurnOffComments={setTurnOffComments}
        isSensitive={isSensitive}
        setIsSensitive={setIsSensitive}
        showSensitiveToggle={showSensitiveToggle}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt || (() => undefined)}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'tags') {
    return (
      <TagPeopleSubScreen
        mediaFiles={mediaFiles}
        tagsMap={tagsMap}
        setTagsMap={setTagsMap}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'monetization') {
    return (
      <MonetizationSubScreen
        isPremium={isPremium!}
        setIsPremium={setIsPremium!}
        price={price!}
        setPrice={setPrice!}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'interactive' && setInteractiveDraft) {
    return (
      <InteractiveSubScreen
        value={interactiveDraft}
        onChange={setInteractiveDraft}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'music' && setSelectedAudio) {
    return (
      <MusicSubScreen
        selectedAudioId={selectedAudio?.id}
        selectedAudioStartMs={audioStartMs}
        clipWindowMs={clipWindowMs}
        onSelectAudio={setSelectedAudio}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'close_friends') {
    return <CloseFriendsSubScreen onClose={() => setSubScreen('none')} />;
  }

  return null;
}
