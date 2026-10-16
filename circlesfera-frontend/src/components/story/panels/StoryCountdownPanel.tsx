import { Timer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import { CREATE_PRIMARY } from '../../create-post/createStyles';
import {
  buildCountdownElement,
  COUNTDOWN_TITLE_MAX,
} from '../storyComposer.append';
import { SETUP_INPUT, StoryStickerSetup } from './StoryStickerSetup';

/** A countdown ends at most 30 days ahead. */
const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

/** A moment as a date-and-time field takes it, in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Tomorrow at the next whole hour. */
function defaultEnd(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** Sets up a countdown: a title and the day and time it ends. */
export default function StoryCountdownPanel({
  onAdd,
}: {
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [ends, setEnds] = useState(() => toLocalInput(defaultEnd()));
  const endsAt = new Date(ends);
  const ahead = endsAt.getTime() - Date.now();
  const inRange = ahead >= 60_000 && ahead <= MAX_AHEAD_MS;

  return (
    <StoryStickerSetup
      panelKey="countdown-tab"
      icon={Timer}
      title={t('createPost.storyComposer.tool_countdown')}
      hint={t('createPost.storyComposer.countdown_create_hint')}
    >
      <input
        type="text"
        value={title}
        maxLength={COUNTDOWN_TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('createPost.storyComposer.countdown_title_ph')}
        aria-label={t('createPost.storyComposer.countdown_title')}
        className={SETUP_INPUT}
      />
      <input
        type="datetime-local"
        value={ends}
        min={toLocalInput(new Date(Date.now() + 60_000))}
        max={toLocalInput(new Date(Date.now() + MAX_AHEAD_MS))}
        onChange={(e) => setEnds(e.target.value)}
        aria-label={t('createPost.storyComposer.countdown_ends')}
        className={`${SETUP_INPUT} [color-scheme:dark]`}
      />
      {!inRange ? (
        <p role="alert" className="text-xs font-medium text-white/70">
          {t('createPost.storyComposer.countdown_range')}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!title.trim() || !inRange}
        onClick={() => {
          const el = buildCountdownElement({ title, endsAt });
          if (el) onAdd(el);
        }}
        className={`button-alone ${CREATE_PRIMARY} disabled:opacity-50`}
      >
        {t('createPost.storyComposer.add_countdown')}
      </button>
    </StoryStickerSetup>
  );
}
