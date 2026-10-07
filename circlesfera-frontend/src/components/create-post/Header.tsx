import { useTranslation } from 'react-i18next';
import EditorHeader, { EditorHeaderAction } from './EditorHeader';

interface HeaderProps {
  onBack: () => void;
  onNext: () => void;
  title: string;
  nextLabel: string | null;
  isPending: boolean;
  canNext: boolean;
}

/** Top bar of the composer steps: back, the step title and next or share. */
export default function Header({
  onBack,
  onNext,
  title,
  nextLabel,
  isPending,
  canNext,
}: HeaderProps) {
  const { t } = useTranslation();
  const isShare = nextLabel === t('createPost.header.share');

  return (
    <EditorHeader
      leading="back"
      leadingLabel={t('createPost.header.back')}
      onLeading={onBack}
      title={title}
      titleId="create-composer-title"
      trailing={
        nextLabel ? (
          <EditorHeaderAction
            label={nextLabel}
            onClick={onNext}
            kind={isShare ? 'final' : 'step'}
            disabled={!canNext}
            isPending={isPending}
          />
        ) : null
      }
    />
  );
}
