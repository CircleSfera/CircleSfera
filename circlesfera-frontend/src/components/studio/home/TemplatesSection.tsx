import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type EditProject,
  editsService,
} from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';
import type { StudioProject } from '../../../types/studio';
import { readMediaDuration } from '../../../utils/mediaDuration';
import {
  BUILT_IN_TEMPLATES,
  projectFromTemplate,
  type StudioTemplate,
  type TemplatePick,
  templateLength,
  templateOfState,
} from '../../../utils/studioTemplates';
import ConfirmModal from '../../modals/ConfirmModal';
import { Input } from '../../ui';
import { formatClock } from '../editor/EditorTimeline';

interface Listed {
  id: string;
  name: string;
  template: StudioTemplate;
  /** Saved by the person, so it can be renamed and deleted. */
  own: boolean;
}

/** The slots of a template as a strip, each as wide as it lasts. */
function SlotStrip({ template }: { template: StudioTemplate }) {
  return (
    <span
      className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
      aria-hidden
    >
      {template.slots.map((slot, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: slots have no id of their own
          key={i}
          className="h-full rounded-full bg-brand-primary/70"
          style={{ flexGrow: slot.duration }}
        />
      ))}
    </span>
  );
}

interface TemplatesSectionProps {
  drafts: EditProject[] | undefined;
  onOpen: (project: StudioProject) => void;
}

/**
 * The templates: CircleSfera's and the person's own. Using one asks for
 * as many videos or photos as it has slots and opens the project made.
 */
export default function TemplatesSection({
  drafts,
  onOpen,
}: TemplatesSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [using, setUsing] = useState<Listed | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );

  const own: Listed[] = (drafts ?? []).flatMap((draft) => {
    const template = templateOfState(draft.state);
    return template
      ? [
          {
            id: draft.id,
            name: draft.name || template.name,
            template,
            own: true,
          },
        ]
      : [];
  });
  const builtIn: Listed[] = BUILT_IN_TEMPLATES.map((b) => ({
    id: b.id,
    name: t(b.nameKey),
    template: b.template,
    own: false,
  }));

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['studioDrafts'] });
  const remove = useMutation({
    mutationFn: (id: string) => editsService.deleteProject(id),
    onSuccess: () => {
      void refresh();
      toast.success(t('studio.templates.deleted'));
    },
    onError: () => toast.error(t('studio.templates.error')),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      editsService.renameProject(id, name),
    onSuccess: () => {
      setRenaming(null);
      void refresh();
    },
    onError: () => toast.error(t('studio.templates.error')),
  });

  // The files chosen fill the slots in order, each from its start.
  const fill = async (files: File[]) => {
    if (!using || !files.length) return;
    const picks: TemplatePick[] = [];
    for (const file of files.slice(0, using.template.slots.length)) {
      const isVideo = file.type.startsWith('video');
      const url = URL.createObjectURL(file);
      const sourceDuration = isVideo
        ? await readMediaDuration(url, 'video').catch(() => undefined)
        : undefined;
      picks.push({
        file,
        url,
        type: isVideo ? 'video' : 'image',
        sourceDuration,
      });
    }
    const project = projectFromTemplate(using.template, picks, using.name, t);
    useStudioStore
      .getState()
      .setPendingUploads(
        picks.map((p) => ({ file: p.file as File, localUrl: p.url })),
      );
    setUsing(null);
    onOpen(project);
  };

  const row = (item: Listed) => (
    <li
      key={item.id}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
    >
      {renaming?.id === item.id ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = renaming.name.trim();
            if (name) rename.mutate({ id: item.id, name });
          }}
        >
          <div className="min-w-48 flex-1">
            <Input
              label={t('studio.templates.name')}
              value={renaming.name}
              maxLength={80}
              onChange={(e) =>
                setRenaming({ id: item.id, name: e.target.value })
              }
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-black"
          >
            {t('common.save')}
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {item.name}
            </p>
            <p className="text-xs text-white/50">
              {t('studio.templates.summary', {
                count: item.template.slots.length,
                length: formatClock(templateLength(item.template)),
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {item.own && (
              <>
                <button
                  type="button"
                  onClick={() => setRenaming({ id: item.id, name: item.name })}
                  aria-label={t('studio.templates.rename', { name: item.name })}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setToDelete(item.id)}
                  aria-label={t('studio.templates.delete', { name: item.name })}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-brand-secondary hover:bg-white/10"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setUsing(item);
                input.current?.click();
              }}
              aria-label={t('studio.templates.use', { name: item.name })}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-black"
            >
              {t('studio.templates.use_short')}
            </button>
          </div>
        </div>
      )}
      <SlotStrip template={item.template} />
    </li>
  );

  return (
    <section aria-labelledby="studio-templates-title" className="mb-8">
      <h2
        id="studio-templates-title"
        className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/50"
      >
        <LayoutTemplate size={16} aria-hidden />
        {t('studio.templates.title')}
      </h2>
      <p className="mb-3 text-sm text-white/60">{t('studio.templates.hint')}</p>
      {own.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-bold text-white/50">
            {t('studio.templates.mine')}
          </h3>
          <ul className="mb-4 grid gap-3 md:grid-cols-2">{own.map(row)}</ul>
        </>
      )}
      <h3 className="mb-2 text-xs font-bold text-white/50">
        {t('studio.templates.circlesfera')}
      </h3>
      <ul className="grid gap-3 md:grid-cols-2">{builtIn.map(row)}</ul>
      <input
        ref={input}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        data-testid="studio-template-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void fill(files);
        }}
      />
      <ConfirmModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete);
          setToDelete(null);
        }}
        title={t('studio.templates.delete_title')}
        message={t('studio.templates.delete_confirm')}
        isDestructive
      />
    </section>
  );
}
