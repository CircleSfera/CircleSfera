import type { Dispatch, SetStateAction } from 'react';
import type { MediaFile } from '../../hooks/useCreatePost';
import AccessibilitySubScreen from './AccessibilitySubScreen';
import AdvancedSettingsSubScreen from './AdvancedSettingsSubScreen';
import LocationSubScreen from './LocationSubScreen';
import TagPeopleSubScreen from './TagPeopleSubScreen';

interface SubScreenRouterProps {
  subScreen: 'none' | 'location' | 'accessibility' | 'advanced' | 'tags';
  setSubScreen: (
    screen: 'none' | 'location' | 'accessibility' | 'advanced' | 'tags',
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

  return null;
}
