import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { editsService } from '../services/edits.service';
import { useStudioStore } from '../stores/studioStore';
import { saveLocalStudioDraft } from '../utils/studioLocalDraft';
import {
  getPrimaryMediaUrl,
  serializeStudioProject,
} from '../utils/studioProject';

const AUTOSAVE_MS = 2500;
const LOCAL_SAVE_MS = 800;

/**
 * Debounced cloud autosave + local IndexedDB buffer + beforeunload guard.
 */
export function useStudioAutosave() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const cloudProjectId = useStudioStore((s) => s.cloudProjectId);
  const setSaveStatus = useStudioStore((s) => s.setSaveStatus);
  const setCloudProjectId = useStudioStore((s) => s.setCloudProjectId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string>('');

  const saveNow = useCallback(async () => {
    const state = useStudioStore.getState();
    if (!state.project) return;

    const serialized = serializeStudioProject(state.project);
    const payload = JSON.stringify(serialized);
    if (payload === lastSerializedRef.current) return;

    const mediaUrl = getPrimaryMediaUrl(serialized);
    if (!mediaUrl && !state.cloudProjectId) return;

    setSaveStatus('saving');
    try {
      if (state.cloudProjectId) {
        await editsService.updateProjectState(state.cloudProjectId, {
          version: 3,
          studio: serialized,
        });
      } else if (mediaUrl) {
        const created = await editsService.createProject(
          mediaUrl,
          'video',
          { version: 3, studio: serialized },
          serialized.name,
        );
        setCloudProjectId(created.id);
      } else {
        setSaveStatus('idle');
        return;
      }
      lastSerializedRef.current = payload;
      setSaveStatus('saved');
      await saveLocalStudioDraft(
        serialized,
        useStudioStore.getState().cloudProjectId,
      );
    } catch {
      setSaveStatus('error');
      toast.error(t('studio.save_error'));
    }
  }, [setCloudProjectId, setSaveStatus, t]);

  // Local IndexedDB buffer (works with blob: URLs)
  useEffect(() => {
    if (!project) return;
    if (localTimerRef.current) clearTimeout(localTimerRef.current);
    localTimerRef.current = setTimeout(() => {
      void saveLocalStudioDraft(project, cloudProjectId);
    }, LOCAL_SAVE_MS);
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
    };
  }, [project, cloudProjectId]);

  // Cloud autosave once a draft id exists
  useEffect(() => {
    if (!project || !cloudProjectId) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveNow();
    }, AUTOSAVE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [project, cloudProjectId, saveNow]);

  // Warn on unload when there are clips and last cloud save may be stale
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = useStudioStore.getState();
      if (!state.project) return;
      const hasClips = state.project.tracks.some((tr) => tr.clips.length > 0);
      if (!hasClips) return;
      void saveLocalStudioDraft(state.project, state.cloudProjectId);
      if (state.saveStatus === 'saving' || state.saveStatus === 'error') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return { saveNow };
}
