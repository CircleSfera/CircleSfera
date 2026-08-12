import { useTranslation } from 'react-i18next';
import { EmptyState } from '../ErrorEmptyStates';

export default function SelectChat() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full bg-transparent relative overflow-hidden px-4">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[50%] h-[50%] bg-brand-primary/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>
      <EmptyState
        icon="comments"
        title={t('chat.your_messages')}
        message={t('chat.select_chat_desc')}
      />
    </div>
  );
}
