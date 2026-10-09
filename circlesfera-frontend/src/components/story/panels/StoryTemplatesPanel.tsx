import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CREATE_THUMB, createThumbRatio } from '../../create-post/createStyles';
import { type StoryTemplate, TEMPLATES } from '../storyComposer.constants';

export interface StoryTemplatesPanelProps {
  onApplyTemplate: (template: StoryTemplate) => void;
}

export default function StoryTemplatesPanel({
  onApplyTemplate,
}: StoryTemplatesPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      key="templates-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3"
    >
      <span className="text-xs font-bold text-white/40 uppercase tracking-[0.14em]">
        {t('createPost.storyComposer.templates')}
      </span>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {TEMPLATES.map((tmpl) => (
          <button
            type="button"
            key={tmpl.name}
            onClick={() => onApplyTemplate(tmpl)}
            className="shrink-0 min-w-14 flex flex-col items-center gap-2 group outline-none focus-visible:ring-2 focus-visible:ring-white/25 rounded-md"
          >
            <div
              className={`${CREATE_THUMB} border-white/10 group-hover:border-white/30 transition-all shadow-md shadow-black/30`}
              style={{
                aspectRatio: createThumbRatio('STORY'),
                ...(tmpl.bg.startsWith('linear-gradient')
                  ? { backgroundImage: tmpl.bg }
                  : { backgroundColor: tmpl.bg }),
              }}
            >
              <div className="w-full h-full flex items-center justify-center text-white/65 text-xs font-bold">
                {tmpl.elements[0]?.type === 'sticker' ? (
                  <span className="text-xl">{tmpl.elements[0].content}</span>
                ) : (
                  'Aa'
                )}
              </div>
            </div>
            <span className="text-xs font-semibold text-white/45 group-hover:text-white/80 transition-colors">
              {tmpl.name}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
