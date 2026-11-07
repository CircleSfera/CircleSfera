import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutTemplate,
  type LucideIcon,
  RectangleHorizontal,
  RectangleVertical,
  Square,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { studioTemplatesApi } from '../../../services/studioTemplates.service';
import { useStudioStore } from '../../../stores/studioStore';
import type { AspectRatioType } from '../../../types/studio';
import { ducksUnderVoice } from '../../../utils/studioAudio';
import { templateOf } from '../../../utils/studioTemplates';
import { mainClips } from '../../../utils/studioTimeline';
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
  const queryClient = useQueryClient();
  const [templateName, setTemplateName] = useState<string | null>(null);
  // Its timing and look, without its media, voice or text.
  const save = useMutation({
    mutationFn: (name: string) => {
      const current = useStudioStore.getState().project;
      if (!current) throw new Error('no project');
      return studioTemplatesApi.create({
        name,
        structure: templateOf(current, name),
      });
    },
    onSuccess: () => {
      setTemplateName(null);
      void queryClient.invalidateQueries({ queryKey: ['studioTemplates'] });
      toast.success(t('studio.templates.saved'));
    },
    onError: () => toast.error(t('studio.templates.error')),
  });
  if (!project) return null;
  const hasSlots = mainClips(project).length > 0;

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
      <div className="flex flex-col items-start gap-2 border-t border-white/10 pt-4">
        <p className="text-xs text-white/50">
          {t('studio.templates.save_hint')}
        </p>
        {templateName === null ? (
          <button
            type="button"
            disabled={!hasSlots}
            onClick={() => setTemplateName(project.name)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40"
          >
            <LayoutTemplate size={16} aria-hidden />
            {t('studio.templates.save')}
          </button>
        ) : (
          <form
            className="flex w-full flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = templateName.trim();
              if (name && !save.isPending) save.mutate(name);
            }}
          >
            <div className="min-w-48 flex-1">
              <Input
                label={t('studio.templates.name')}
                value={templateName}
                maxLength={80}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={!templateName.trim() || save.isPending}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-black disabled:opacity-40"
            >
              {t('common.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
