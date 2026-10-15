import { Hash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import { CREATE_PRIMARY } from '../../create-post/createStyles';
import { buildHashtagElement, cleanHashtag } from '../storyComposer.append';
import { HASHTAG_MAX } from '../storyComposer.constants';
import { HashtagStickerPreview } from '../storyInteractive';
import { SETUP_INPUT, StoryStickerSetup } from './StoryStickerSetup';

/** Sets up a hashtag: letters, numbers and _, without spaces. */
export default function StoryHashtagPanel({
  onAdd,
}: {
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState('');
  const tag = cleanHashtag(raw);
  const invalid = raw.trim() !== '' && raw.trim() !== '#' && !tag;

  return (
    <StoryStickerSetup
      panelKey="hashtag-tab"
      icon={Hash}
      title={t('createPost.storyComposer.tool_hashtag')}
      hint={t('createPost.storyComposer.hashtag_create_hint')}
    >
      <div className="flex justify-center py-1">
        <HashtagStickerPreview
          tag={tag ?? t('createPost.storyComposer.hashtag_ph')}
        />
      </div>
      <input
        type="text"
        value={raw}
        maxLength={HASHTAG_MAX + 1}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={`#${t('createPost.storyComposer.hashtag_ph')}`}
        aria-label={t('createPost.storyComposer.tool_hashtag')}
        aria-invalid={invalid || undefined}
        className={SETUP_INPUT}
      />
      {invalid ? (
        <p role="alert" className="text-xs text-white/70">
          {t('createPost.storyComposer.hashtag_invalid')}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          const el = buildHashtagElement(raw);
          if (el) onAdd(el);
        }}
        disabled={!tag}
        className={`button-alone ${CREATE_PRIMARY}`}
      >
        {t('createPost.storyComposer.add_hashtag')}
      </button>
    </StoryStickerSetup>
  );
}
