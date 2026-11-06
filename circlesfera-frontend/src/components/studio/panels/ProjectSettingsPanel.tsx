import {
  type LucideIcon,
  RectangleHorizontal,
  RectangleVertical,
  Square,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { AspectRatioType } from '../../../types/studio';
import { ducksUnderVoice } from '../../../utils/studioAudio';
import { Input } from '../../ui';

const FORMATS: { value: AspectRatioType; icon: LucideIcon }[] = [
  { value: '9:16', icon: RectangleVertical },
  { value: '4:5', icon: RectangleVertical },
  { value: '1:1', icon: Square },
  { value: '16:9', icon: RectangleHorizontal },
];

/** The project's name and its format. Every project starts upright, 9:16. */
export default function ProjectSettingsPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const setProjectName = useStudioStore((s) => s.setProjectName);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const setDuckUnderVoice = useStudioStore((s) => s.setDuckUnderVoice);
  if (!project) return null;

  return (
    <div className="flex flex-col gap-4">
      <Input
        label={t('studio.settings.name')}
        value={project.name}
        maxLength={80}
        onChange={(e) => setProjectName(e.target.value)}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">
          {t('studio.settings.format')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={project.aspectRatio === value}
              onClick={() => setAspectRatio(value)}
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors ${
                project.aspectRatio === value
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              <Icon size={18} aria-hidden />
              {value}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/50">
          {t('studio.settings.format_hint')}
        </p>
      </fieldset>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold text-white">
            {t('studio.settings.duck')}
          </span>
          <span className="block text-xs text-white/50">
            {t('studio.settings.duck_hint')}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={ducksUnderVoice(project)}
          checked={ducksUnderVoice(project)}
          onChange={(e) => setDuckUnderVoice(e.target.checked)}
          className="h-6 w-11 shrink-0 accent-white"
        />
      </label>
    </div>
  );
}
