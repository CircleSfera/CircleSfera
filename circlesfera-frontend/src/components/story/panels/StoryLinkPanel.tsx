import { Link } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import { CREATE_PRIMARY } from '../../create-post/createStyles';
import {
  buildLinkElement,
  cleanLink,
  LINK_LABEL_MAX,
} from '../storyComposer.append';
import { SETUP_INPUT, StoryStickerSetup } from './StoryStickerSetup';

/**
 * Sets up a link: its address and, if wanted, a short text shown instead of
 * the domain. The server checks the address again before the story goes up.
 */
export default function StoryLinkPanel({
  onAdd,
}: {
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const link = cleanLink(address);

  return (
    <StoryStickerSetup
      panelKey="link-tab"
      icon={Link}
      title={t('createPost.storyComposer.tool_link')}
      hint={t('createPost.storyComposer.link_create_hint')}
    >
      <input
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={address}
        maxLength={2048}
        onChange={(e) => setAddress(e.target.value)}
        placeholder={t('createPost.storyComposer.link_url_ph')}
        aria-label={t('createPost.storyComposer.link_url')}
        className={SETUP_INPUT}
      />
      {address.trim() && (link === null || link === 'http') ? (
        <p role="alert" className="text-xs font-medium text-white/70">
          {t(
            link === 'http'
              ? 'createPost.storyComposer.link_http'
              : 'createPost.storyComposer.link_invalid',
          )}
        </p>
      ) : null}
      <input
        type="text"
        value={label}
        maxLength={LINK_LABEL_MAX}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={
          link && link !== 'http'
            ? link.domain
            : t('createPost.storyComposer.link_label_ph')
        }
        aria-label={t('createPost.storyComposer.link_label')}
        className={SETUP_INPUT}
      />
      <button
        type="button"
        disabled={!link || link === 'http'}
        onClick={() => {
          const el = buildLinkElement({ url: address, label });
          if (el) onAdd(el);
        }}
        className={`button-alone ${CREATE_PRIMARY} disabled:opacity-50`}
      >
        {t('createPost.storyComposer.add_link')}
      </button>
    </StoryStickerSetup>
  );
}
