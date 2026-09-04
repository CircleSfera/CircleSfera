import { useTranslation } from 'react-i18next';
import CloseFriendsManager from '../close-friends/CloseFriendsManager';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

interface CloseFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CloseFriendsModal({
  isOpen,
  onClose,
}: CloseFriendsModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      className="max-h-[90vh]"
      title={t('settings.close_friends_modal.title')}
    >
      <div className="-mt-2 flex flex-col min-h-[360px]">
        <CloseFriendsManager enabled={isOpen} />
        <div className="pt-4 mt-2 border-t border-white/10 shrink-0">
          <Button
            onClick={onClose}
            variant="primary"
            className="w-full min-h-11 font-bold"
          >
            {t('settings.close_friends_modal.done')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
