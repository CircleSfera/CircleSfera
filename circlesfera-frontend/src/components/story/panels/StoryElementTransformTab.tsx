import { Eye, RotateCw, ZoomIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import SliderControl from '../SliderControl';
import { isPollElement, isQnaElement } from '../storyInteractive';

export interface StoryElementTransformTabProps {
  selectedElementId: string;
  selectedElement: StoryElement;
  onUpdateElement: (id: string, updates: Partial<StoryElement>) => void;
}

export default function StoryElementTransformTab({
  selectedElementId,
  selectedElement,
  onUpdateElement,
}: StoryElementTransformTabProps) {
  const { t } = useTranslation();
  const isInteractive =
    isPollElement(selectedElement) || isQnaElement(selectedElement);

  return (
    <div className="space-y-3 animate-slide-up pb-2">
      {isInteractive && (
        <>
          <p className="text-[11px] text-white/40 leading-relaxed px-0.5">
            {t('createPost.storyComposer.interactive_size_hint')}
          </p>
          <div className="pb-2 border-b border-white/5">
            <SliderControl
              icon={ZoomIn}
              label={t('createPost.storyComposer.size')}
              value={selectedElement.scale}
              min={0.5}
              max={1.35}
              step={0.01}
              unit=""
              format={(v) => `${v.toFixed(2)}×`}
              centerValue={1}
              onChange={(v) =>
                onUpdateElement(selectedElementId, {
                  scale: v,
                  opacity: 1,
                })
              }
              onDoubleClick={() =>
                onUpdateElement(selectedElementId, {
                  scale: 1,
                  opacity: 1,
                })
              }
            />
          </div>
          <div className="pb-2 border-b border-white/5">
            <SliderControl
              icon={RotateCw}
              label={t('createPost.storyComposer.rotation')}
              value={selectedElement.rotation}
              min={-180}
              max={180}
              step={1}
              unit="°"
              centerValue={0}
              onChange={(v) =>
                onUpdateElement(selectedElementId, {
                  rotation: v,
                })
              }
              onDoubleClick={() =>
                onUpdateElement(selectedElementId, {
                  rotation: 0,
                })
              }
            />
          </div>
        </>
      )}
      {!isInteractive && (
        <>
          <div className="pb-2 border-b border-white/5">
            <SliderControl
              icon={ZoomIn}
              label={t('createPost.storyComposer.size')}
              value={selectedElement.scale}
              min={0.1}
              max={8}
              step={0.01}
              unit=""
              format={(v) => `${v.toFixed(2)}×`}
              centerValue={1}
              onChange={(v) =>
                onUpdateElement(selectedElementId, {
                  scale: v,
                })
              }
              onDoubleClick={() =>
                onUpdateElement(selectedElementId, {
                  scale: 1,
                })
              }
            />
          </div>
          <div className="pb-2 border-b border-white/5">
            <SliderControl
              icon={RotateCw}
              label={t('createPost.storyComposer.rotation')}
              value={selectedElement.rotation}
              min={-180}
              max={180}
              step={1}
              unit="°"
              centerValue={0}
              onChange={(v) =>
                onUpdateElement(selectedElementId, {
                  rotation: v,
                })
              }
              onDoubleClick={() =>
                onUpdateElement(selectedElementId, {
                  rotation: 0,
                })
              }
            />
          </div>
          <div className="pb-2 border-b border-white/5">
            <SliderControl
              icon={Eye}
              label={t('createPost.storyComposer.opacity')}
              value={Math.round((selectedElement.opacity ?? 1) * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              centerValue={100}
              onChange={(v) =>
                onUpdateElement(selectedElementId, {
                  opacity: v / 100,
                })
              }
              onDoubleClick={() =>
                onUpdateElement(selectedElementId, {
                  opacity: 1,
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
