import { ExternalLink, Flag, Link as LinkIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../../services/reports.service';
import { logger } from '../../utils/logger';
import { PILL, PILL_TEXT } from '../story/storyInteractive';

export interface StoryLink {
  url: string;
  domain: string;
  label?: string;
}

/** A link on a story: a tap says where it leads before anything opens. */
export function LinkSticker({
  link,
  onOpen,
}: {
  link: StoryLink;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('story.link.open_label', { domain: link.domain })}
      className={`${PILL} min-h-11 max-w-[260px]`}
    >
      <LinkIcon
        size={18}
        strokeWidth={2.6}
        className="shrink-0 text-brand-primary"
        aria-hidden
      />
      <span className={`${PILL_TEXT} truncate`}>
        {(link.label ?? link.domain).toUpperCase()}
      </span>
    </button>
  );
}

/**
 * Before a link of a story opens: the viewer is told they are leaving
 * CircleSfera and where to, and can open it, report it or stay. The link
 * opens outside the app with nothing of CircleSfera passed to it.
 */
export function LinkLeaveSheet({
  link,
  storyId,
  onClose,
}: {
  link: StoryLink;
  storyId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [report, setReport] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const open = () => {
    window.open(link.url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const sendReport = async () => {
    setReport('sending');
    try {
      await reportsApi.create({
        targetType: 'STORY',
        targetId: storyId,
        reason: 'SCAM',
        details: `Link: ${link.domain}`,
      });
      setReport('sent');
    } catch (err) {
      logger.error('Failed to report a link:', err);
      setReport('failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 md:items-center">
      {/* A tap outside closes it; the Cancel button and Escape do so for
          the keyboard and screen readers. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        data-testid="link-sheet-backdrop"
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-t-3xl border border-white/10 bg-surface-raised px-4 pt-5 pb-[max(env(safe-area-inset-bottom),16px)] md:rounded-3xl md:pb-5"
      >
        <h2 id={titleId} className="text-lg font-bold text-white">
          {t('story.link.leaving_title')}
        </h2>
        <p className="mt-1 text-sm text-white/70">
          {t('story.link.leaving_body')}
        </p>
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base font-semibold text-white break-all">
          {link.domain}
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={open}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-black"
          >
            <ExternalLink size={18} aria-hidden />
            {t('story.link.open')}
          </button>
          <button
            type="button"
            onClick={sendReport}
            disabled={report === 'sending' || report === 'sent'}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/8 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Flag size={18} aria-hidden />
            {report === 'sent'
              ? t('story.link.reported')
              : t('story.link.report')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-2xl px-4 text-sm font-semibold text-white/70 hover:text-white"
          >
            {t('story.link.cancel')}
          </button>
        </div>
        {report === 'failed' ? (
          <p role="alert" className="mt-2 text-center text-xs text-white/70">
            {t('story.link.report_error')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
