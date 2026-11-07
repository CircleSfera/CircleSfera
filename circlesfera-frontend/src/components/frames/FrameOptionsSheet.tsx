import {
  Archive,
  Bookmark,
  CirclePlus,
  Flag,
  Heart,
  HeartOff,
  Info,
  LayoutTemplate,
  Megaphone,
  MessageCircle,
  MessageCircleOff,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { OptionRow, OptionsSheet } from '../sheets/OptionsSheet';
import FrameBottomSheet from './FrameBottomSheet';

export interface FrameMenuActions {
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onSave: () => void;
  onPromote?: () => void;
  // The author's: takes the frame off the profile, into their archive.
  onArchive?: () => void;
  // Share it to one's story as a card of the original.
  onAddToStory?: () => void;
  // Why the Frame is shown to the viewer.
  onWhy?: () => void;
  // The author's: comments and the like count, off or on at any time.
  onToggleComments?: () => void;
  commentsOff?: boolean;
  onToggleLikes?: () => void;
  likesHidden?: boolean;
  // The author's: whether others may use the Frame's Studio template.
  onToggleTemplate?: () => void;
  templateOffered?: boolean;
}

interface FrameOptionsSheetProps extends FrameMenuActions {
  isOpen: boolean;
  onClose: () => void;
  isOwner: boolean;
  presentation?: 'default' | 'frame';
}

function OptionsBody({
  isOwner,
  onEdit,
  onDelete,
  onReport,
  onSave,
  onPromote,
  onArchive,
  onAddToStory,
  onWhy,
  onToggleComments,
  commentsOff = false,
  onToggleLikes,
  likesHidden = false,
  onToggleTemplate,
  templateOffered = false,
  onClose,
}: FrameMenuActions & { isOwner: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    // Scrolls when the author's options outgrow the sheet.
    <div className="px-2 pb-2 space-y-0.5 min-h-0 overflow-y-auto">
      {isOwner ? (
        <>
          {onPromote && (
            <OptionRow
              icon={Megaphone}
              label={t('post.menu.promote')}
              onClick={() => run(onPromote)}
              variant="highlight"
            />
          )}
          <OptionRow
            icon={Pencil}
            label={t('post.menu.edit')}
            onClick={() => run(onEdit)}
          />
          {onArchive && (
            <OptionRow
              icon={Archive}
              label={t('post.menu.archive')}
              onClick={() => run(onArchive)}
            />
          )}
          {onToggleComments && (
            <OptionRow
              icon={commentsOff ? MessageCircle : MessageCircleOff}
              label={
                commentsOff
                  ? t('post.menu.turn_on_comments')
                  : t('post.menu.turn_off_comments')
              }
              onClick={() => run(onToggleComments)}
            />
          )}
          {onToggleLikes && (
            <OptionRow
              icon={likesHidden ? Heart : HeartOff}
              label={
                likesHidden
                  ? t('post.menu.show_like_count')
                  : t('post.menu.hide_like_count')
              }
              onClick={() => run(onToggleLikes)}
            />
          )}
          {onToggleTemplate && (
            <OptionRow
              icon={LayoutTemplate}
              label={
                templateOffered
                  ? t('post.menu.stop_offering_template')
                  : t('post.menu.offer_template')
              }
              onClick={() => run(onToggleTemplate)}
            />
          )}
          <OptionRow
            icon={Trash2}
            label={t('post.menu.delete')}
            onClick={() => run(onDelete)}
            variant="danger"
          />
        </>
      ) : (
        <>
          {onWhy && (
            <OptionRow
              icon={Info}
              label={t('post.why_seeing.open')}
              onClick={() => run(onWhy)}
            />
          )}
          <OptionRow
            icon={Flag}
            label={t('post.menu.report')}
            onClick={() => run(onReport)}
            variant="danger"
          />
        </>
      )}
      {onAddToStory && (
        <OptionRow
          icon={CirclePlus}
          label={t('post.menu.add_to_story')}
          onClick={() => run(onAddToStory)}
        />
      )}
      <OptionRow
        icon={Bookmark}
        label={t('post.menu.save')}
        onClick={() => run(onSave)}
      />
    </div>
  );
}

export default function FrameOptionsSheet({
  isOpen,
  onClose,
  isOwner,
  presentation = 'frame',
  onEdit,
  onDelete,
  onReport,
  onSave,
  onPromote,
  onArchive,
  onAddToStory,
  onWhy,
  onToggleComments,
  commentsOff,
  onToggleLikes,
  likesHidden,
  onToggleTemplate,
  templateOffered,
}: FrameOptionsSheetProps) {
  const { t } = useTranslation();
  const isFrame = presentation === 'frame';

  useEffect(() => {
    if (!isFrame && isOpen) {
      document.body.style.overflow = 'hidden';
    } else if (!isFrame) {
      document.body.style.overflow = 'unset';
    }
    return () => {
      if (!isFrame) {
        document.body.style.overflow = 'unset';
      }
    };
  }, [isOpen, isFrame]);

  if (!isOpen) return null;

  const bodyProps = {
    isOwner,
    onEdit,
    onDelete,
    onReport,
    onSave,
    onPromote,
    onArchive,
    onAddToStory,
    onWhy,
    onToggleComments,
    commentsOff,
    onToggleLikes,
    likesHidden,
    onToggleTemplate,
    templateOffered,
    onClose,
  };

  if (isFrame) {
    return (
      <FrameBottomSheet
        isOpen
        onClose={onClose}
        title={t('frames.options')}
        maxHeightClass="max-h-[min(70%,320px)]"
        align="center"
        showHandle={false}
      >
        <OptionsBody {...bodyProps} />
      </FrameBottomSheet>
    );
  }

  return (
    <OptionsSheet isOpen={isOpen} onClose={onClose} title={t('frames.options')}>
      <OptionsBody {...bodyProps} />
    </OptionsSheet>
  );
}
