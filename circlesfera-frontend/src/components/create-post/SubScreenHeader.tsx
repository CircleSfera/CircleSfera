import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import EditorHeader from './EditorHeader';

interface SubScreenHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  trailing?: ReactNode;
}

/**
 * Top bar of the caption sub-screens. Every sub-screen returns to the caption
 * step, so they all leave with the back arrow.
 */
export default function SubScreenHeader({
  title,
  subtitle,
  onClose,
  trailing,
}: SubScreenHeaderProps) {
  const { t } = useTranslation();

  return (
    <EditorHeader
      leading="back"
      leadingLabel={t('createPost.header.back')}
      onLeading={onClose}
      title={title}
      subtitle={subtitle}
      trailing={trailing}
      sticky
    />
  );
}
