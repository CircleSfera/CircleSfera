import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import { CREATE_PRIMARY } from '../../create-post/createStyles';
import { buildSliderElement } from '../storyComposer.append';
import { POLL_QUESTION_MAX, SLIDER_EMOJIS } from '../storyComposer.constants';
import { SliderStickerPreview } from '../storyInteractive';
import { SETUP_INPUT, StoryStickerSetup } from './StoryStickerSetup';

/** Sets up a slider: a question, which may be empty, and its emoji. */
export default function StorySliderPanel({
  onAdd,
}: {
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [emoji, setEmoji] = useState(SLIDER_EMOJIS[0]);

  return (
    <StoryStickerSetup
      panelKey="slider-tab"
      icon={SlidersHorizontal}
      title={t('createPost.storyComposer.tool_slider')}
      hint={t('createPost.storyComposer.slider_create_hint')}
    >
      <div className="flex justify-center py-1">
        <SliderStickerPreview
          variant="panel"
          label={t('createPost.storyComposer.tool_slider')}
          slider={{
            question:
              question.trim() ||
              t('createPost.storyComposer.slider_question_ph'),
            emoji,
          }}
        />
      </div>
      <input
        type="text"
        value={question}
        maxLength={POLL_QUESTION_MAX}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('createPost.storyComposer.slider_question_ph')}
        aria-label={t('createPost.storyComposer.poll_question')}
        className={SETUP_INPUT}
      />
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {SLIDER_EMOJIS.map((e) => (
          <button
            type="button"
            key={e}
            onClick={() => setEmoji(e)}
            aria-pressed={emoji === e}
            aria-label={t('createPost.storyComposer.slider_emoji', {
              emoji: e,
            })}
            className={`w-12 h-12 shrink-0 rounded-xl text-2xl ${
              emoji === e ? 'bg-white/18 ring-2 ring-white/60' : 'bg-white/6'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const el = buildSliderElement({ question, emoji });
          if (el) onAdd(el);
        }}
        className={`button-alone ${CREATE_PRIMARY}`}
      >
        {t('createPost.storyComposer.add_slider')}
      </button>
    </StoryStickerSetup>
  );
}
