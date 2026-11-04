import {
  Archive,
  Bookmark,
  CirclePlus,
  Flag,
  Info,
  Megaphone,
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
  onClose,
}: FrameMenuActions & { isOwner: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div className="px-2 pb-2 space-y-0.5">
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
