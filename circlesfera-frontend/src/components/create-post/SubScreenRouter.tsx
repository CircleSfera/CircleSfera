import type { Dispatch, SetStateAction } from 'react';
import type { MediaFile } from '../../hooks/useCreatePost';
import AccessibilitySubScreen from './AccessibilitySubScreen';
import AdvancedSettingsSubScreen from './AdvancedSettingsSubScreen';
import InteractiveSubScreen, {
  type InteractiveDraft,
} from './InteractiveSubScreen';
import LocationSubScreen from './LocationSubScreen';
import MonetizationSubScreen from './MonetizationSubScreen';
import TagPeopleSubScreen from './TagPeopleSubScreen';

interface SubScreenRouterProps {
  subScreen:
    | 'none'
    | 'location'
    | 'accessibility'
    | 'advanced'
    | 'tags'
    | 'monetization'
    | 'interactive';
  setSubScreen: (
    screen:
      | 'none'
      | 'location'
      | 'accessibility'
      | 'advanced'
      | 'tags'
      | 'monetization'
      | 'interactive',
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
  setLocation: (loc: string) => void;
  location: string;
  onGenerateAltText: (index: number) => Promise<void>;
  isPremium?: boolean;
  setIsPremium?: (val: boolean) => void;
  price?: number;
  setPrice?: (val: number) => void;
  scheduledAt?: string;
  setScheduledAt?: (val: string) => void;
  interactiveDraft?: InteractiveDraft;
  setInteractiveDraft?: (val: InteractiveDraft) => void;
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
  setLocation,
  location,
  onGenerateAltText,
  isPremium,
  setIsPremium,
  price,
  setPrice,
  scheduledAt = '',
  setScheduledAt,
  interactiveDraft = null,
  setInteractiveDraft,
}: SubScreenRouterProps) {
  if (subScreen === 'location') {
    return (
      <LocationSubScreen
        currentLocation={location}
        onClose={() => setSubScreen('none')}
        onSelect={(loc) => {
          setLocation(loc);
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

  return null;
}
