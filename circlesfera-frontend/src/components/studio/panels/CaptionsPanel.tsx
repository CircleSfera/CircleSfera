import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useExperimentsLoaded } from '../../../hooks/useFeatureFlag';
import { editsService } from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';
import { useExperimentStore } from '../../../stores/useExperimentStore';
import type { MediaClip, TextClip } from '../../../types/studio';
import { pollCaptionsJob } from '../../../utils/studioCaptions';
import {
  mapCaptionSegmentsToTimeline,
  STUDIO_DEFAULT_FONT_FAMILY,
} from '../../../utils/studioExportHelpers';
import { isRemoteMediaUrl } from '../../../utils/studioProject';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

export default function CaptionsPanel() {
  const { t } = useTranslation();
  const experimentsLoaded = useExperimentsLoaded();
  const flagValue = useExperimentStore((s) => s.flags.studio_ai_captions);
  const aiAllowed =
    !experimentsLoaded || flagValue === undefined || flagValue === true;

  const { project, cloudProjectId, selectedClipId, addClip, playhead } =
    useStudioStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selectedMedia = project?.tracks
    .flatMap((tr) => tr.clips)
    .find(
      (c) =>
        c.id === selectedClipId && (c.type === 'video' || c.type === 'audio'),
    ) as MediaClip | undefined;

  const canGenerateAi =
    Boolean(cloudProjectId) &&
    Boolean(selectedMedia) &&
    Boolean(selectedMedia && isRemoteMediaUrl(selectedMedia.fileUrl));

  const prerequisiteHint = !cloudProjectId
    ? t('studio.captions.need_save')
    : !selectedMedia
      ? t('studio.captions.need_clip')
      : selectedMedia && !isRemoteMediaUrl(selectedMedia.fileUrl)
        ? t('studio.captions.need_upload')
        : null;

  const addManualCue = () => {
    if (!project) return;
    const trackId =
      project.tracks.find((tr) => tr.type === 'text')?.id ||
      project.tracks[0].id;
    const clip: TextClip = {
      id: generateId(),
      trackId,
      type: 'text',
      content: t('studio.captions.default_cue'),
      startAt: playhead,
      duration: 2.5,
      style: {
        color: '#ffffff',
        fontSize: 28,
        fontFamily: STUDIO_DEFAULT_FONT_FAMILY,
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: 10,
        borderRadius: 12,
        textAlign: 'center',
        shadowColor: 'rgba(0,0,0,0.8)',
        shadowBlur: 10,
      },
      transform: { scale: 1, rotation: 0, x: 0, y: 350 },
    };
    addClip(trackId, clip);
    toast.success(t('studio.captions.cue_added'));
  };

  const cancelGeneration = () => {
    abortRef.current?.abort();
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!project || !cloudProjectId) {
        throw new Error('studio.captions.need_save');
      }
      if (!selectedMedia) {
        throw new Error('studio.captions.need_clip');
      }
      if (!isRemoteMediaUrl(selectedMedia.fileUrl)) {
        throw new Error('studio.captions.need_upload');
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setIsGenerating(true);
      const { jobId } = await editsService.startCaptions(
        cloudProjectId,
        selectedMedia.id,
      );
      return pollCaptionsJob(cloudProjectId, jobId, controller.signal);
    },
    onSuccess: (segments) => {
      if (!project || !selectedMedia) return;
      const trackId =
        project.tracks.find((tr) => tr.type === 'text')?.id ||
        project.tracks[0].id;
      const mapped = mapCaptionSegmentsToTimeline(segments, selectedMedia);
      for (const cue of mapped) {
        const clip: TextClip = {
          id: generateId(),
          trackId,
          type: 'text',
          content: cue.text,
          startAt: cue.startAt,
          duration: cue.duration,
          style: {
            color: '#ffffff',
            fontSize: 28,
            fontFamily: STUDIO_DEFAULT_FONT_FAMILY,
            backgroundColor: 'rgba(0,0,0,0.75)',
            padding: 10,
            borderRadius: 12,
            textAlign: 'center',
            shadowColor: 'rgba(0,0,0,0.8)',
            shadowBlur: 10,
          },
          transform: { scale: 1, rotation: 0, x: 0, y: 350 },
        };
        addClip(trackId, clip);
      }
      toast.success(t('studio.captions.generated', { count: mapped.length }));
    },
    onError: (err: Error) => {
      const key = err.message;
      if (key === 'studio.captions.cancelled') {
        toast(t('studio.captions.cancelled'));
        return;
      }
      toast.error(
        key.startsWith('studio.')
          ? t(key)
          : err.message || t('studio.captions.error'),
      );
    },
    onSettled: () => {
      setIsGenerating(false);
      abortRef.current = null;
    },
  });

  return (
    <div className="flex flex-col gap-4 text-center">
      <div className="w-12 h-12 bg-linear-to-br from-brand-primary to-brand-blue rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-brand-primary/25">
        <Sparkles size={24} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-white">
          {t('studio.captions.title')}
        </h3>
        <p className="text-xs text-white/50 mt-1">
          {t('studio.captions.description')}
        </p>
      </div>

      <button
        type="button"
        onClick={addManualCue}
        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3 px-4 rounded-xl transition-all text-xs min-h-11"
      >
        {t('studio.captions.add_manual')}
      </button>

      {aiAllowed ? (
        <>
          {prerequisiteHint && !isGenerating && (
            <p className="text-[11px] text-white/40 text-left px-1">
              {prerequisiteHint}
            </p>
          )}
          {isGenerating ? (
            <button
              type="button"
              onClick={cancelGeneration}
              className="w-full border border-white/15 hover:bg-white/5 text-white font-semibold py-3 px-4 rounded-xl transition-all text-xs min-h-11"
            >
              {t('studio.captions.cancel')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => generateMutation.mutate()}
              disabled={!canGenerateAi || generateMutation.isPending}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2 text-xs min-h-11 disabled:opacity-50"
            >
              <Sparkles size={16} />
              <span>{t('studio.captions.generate')}</span>
            </button>
          )}
          {isGenerating && (
            <p className="text-[11px] text-white/50">
              {t('studio.captions.generating')}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-white/40">{t('studio.captions.disabled')}</p>
      )}
    </div>
  );
}
