import AccessibilitySubScreen from './AccessibilitySubScreen';
import AdvancedSettingsSubScreen from './AdvancedSettingsSubScreen';
import CloseFriendsSubScreen from './CloseFriendsSubScreen';
import { useComposer } from './ComposerContext';
import CoverSubScreen from './CoverSubScreen';
import InteractiveSubScreen from './InteractiveSubScreen';
import LocationSubScreen from './LocationSubScreen';
import MonetizationSubScreen from './MonetizationSubScreen';
import MusicSubScreen from './MusicSubScreen';
import TagPeopleSubScreen from './TagPeopleSubScreen';

/** Routes caption sub-screens for the stepped Post/Frame composer. */

interface SubScreenRouterProps {
  /** How much of a track fits what is being created. */
  clipWindowMs?: number;
}

export default function SubScreenRouter({
  clipWindowMs,
}: SubScreenRouterProps) {
  const {
    mode,
    subScreen,
    setSubScreen,
    mediaFiles,
    altTextMap,
    setAltTextMap,
    tagsMap,
    setTagsMap,
    hideLikes,
    setHideLikes,
    turnOffComments,
    setTurnOffComments,
    coverTimeMs,
    setCoverTimeMs,
    isSensitive,
    setIsSensitive,
    setLocation,
    location,
    setSelectedPlace,
    generateAltTextForIndex,
    isPremium,
    setIsPremium,
    price,
    setPrice,
    scheduledAt,
    setScheduledAt,
    interactiveDraft,
    setInteractiveDraft,
    selectedAudio,
    setSelectedAudio,
    audioStartMs,
    setAudioStartMs,
  } = useComposer();

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
        onClose={() => setSubScreen('none')}
        onGenerateAltText={generateAltTextForIndex}
        mode={mode}
      />
    );
  }

  if (subScreen === 'cover') {
    return (
      <CoverSubScreen
        mediaFiles={mediaFiles}
        coverTimeMs={coverTimeMs}
        setCoverTimeMs={setCoverTimeMs}
        onClose={() => setSubScreen('none')}
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
        showSensitiveToggle={mode !== 'STORY'}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
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
        isPremium={isPremium}
        setIsPremium={setIsPremium}
        price={price}
        setPrice={setPrice}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'interactive') {
    return (
      <InteractiveSubScreen
        value={interactiveDraft}
        onChange={setInteractiveDraft}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'music') {
    return (
      <MusicSubScreen
        selectedAudioId={selectedAudio?.id}
        selectedAudioStartMs={audioStartMs}
        clipWindowMs={clipWindowMs}
        onSelectAudio={(selection) => {
          // A track comes with the moment it starts; taking it off clears both.
          setSelectedAudio(selection?.audio ?? null);
          setAudioStartMs(selection?.audioStartMs ?? 0);
        }}
        onClose={() => setSubScreen('none')}
      />
    );
  }

  if (subScreen === 'close_friends') {
    return <CloseFriendsSubScreen onClose={() => setSubScreen('none')} />;
  }

  return null;
}
