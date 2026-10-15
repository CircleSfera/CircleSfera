import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import {
  CREATE_PRIMARY,
  CREATE_SECONDARY,
} from '../../create-post/createStyles';
import { buildLocationElement } from '../storyComposer.append';
import { LocationStickerPreview } from '../storyInteractive';
import { StoryStickerSetup } from './StoryStickerSetup';

/**
 * Sets up the location sticker, which is the place of the story: with no
 * place yet it opens the place picker, and adds the sticker once one is
 * chosen.
 */
export default function StoryLocationPanel({
  placeName,
  onOpenPlace,
  onStory,
  onAdd,
}: {
  placeName: string | null;
  onOpenPlace: () => void;
  /** The story already shows its place. */
  onStory: boolean;
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [awaitingPlace, setAwaitingPlace] = useState(false);

  useEffect(() => {
    if (awaitingPlace && placeName) {
      setAwaitingPlace(false);
      onAdd(buildLocationElement(placeName));
    }
  }, [awaitingPlace, placeName, onAdd]);

  const choose = () => {
    if (!onStory) setAwaitingPlace(true);
    onOpenPlace();
  };

  return (
    <StoryStickerSetup
      panelKey="location-tab"
      icon={MapPin}
      title={t('createPost.storyComposer.tool_location')}
      hint={t('createPost.storyComposer.location_create_hint')}
    >
      <div className="flex justify-center py-1">
        <LocationStickerPreview
          name={placeName ?? t('createPost.storyComposer.location_placeholder')}
        />
      </div>
      {onStory ? (
        <p className="text-sm text-white/60 text-center">
          {t('createPost.storyComposer.location_on_story')}
        </p>
      ) : null}
      {placeName && !onStory ? (
        <button
          type="button"
          onClick={() => onAdd(buildLocationElement(placeName))}
          className={`button-alone ${CREATE_PRIMARY}`}
        >
          {t('createPost.storyComposer.add_location_sticker')}
        </button>
      ) : null}
      <button
        type="button"
        onClick={choose}
        className={`button-alone ${placeName ? CREATE_SECONDARY : CREATE_PRIMARY}`}
      >
        {t(
          placeName
            ? 'createPost.storyComposer.location_change'
            : 'createPost.storyComposer.location_choose',
        )}
      </button>
    </StoryStickerSetup>
  );
}
