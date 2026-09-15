import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import CloseFriendsManager from '../close-friends/CloseFriendsManager';
import { Button } from '../ui';
import { SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

interface CloseFriendsSubScreenProps {
  onClose: () => void;
}

export default function CloseFriendsSubScreen({
  onClose,
}: CloseFriendsSubScreenProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0.5 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.5 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={SUBSCREEN_SHELL}
    >
      <SubScreenHeader
        title={t('settings.close_friends_modal.title')}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col no-scrollbar">
        <CloseFriendsManager enabled={true} />
        <div className="pt-4 mt-2 shrink-0 pb-safe flex justify-center">
          <Button
            onClick={onClose}
            variant="primary"
            className="w-auto px-12 min-h-11 font-bold rounded-full shadow-lg"
          >
            {t('settings.close_friends_modal.done')}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
