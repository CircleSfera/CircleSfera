import Cropper from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import CanvasOverlay from '../CanvasOverlay';
import type { PhotoEditorState } from './usePhotoEditor';

export default function PhotoEditorPreview({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { t } = useTranslation();
  const {
    isVideo,
    videoRef,
    previewUrl,
    selectedFilter,
    computedStyle,
    videoData,
    activeTab,
    crop,
    zoom,
    rotation,
    aspect,
    setCrop,
    setZoom,
    setRotation,
    onCropComplete,
    imageRef,
    adjustments,
    imageDims,
    stageRef,
    overlays,
    setOverlays,
    drawMode,
    brushColor,
    brushSize,
    selectedOverlayId,
    setSelectedOverlayId,
  } = editor;

  return (
    <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-zinc-950 min-h-0">
      <div className="absolute inset-0 bg-radial-[at_50%_50%] from-white/1 via-transparent to-transparent pointer-events-none" />
      <div className="relative w-full h-full flex items-center justify-center p-4">
        {isVideo ? (
          <video
            ref={videoRef}
            src={previewUrl || undefined}
            className={`max-w-full max-h-full object-contain rounded-lg ${selectedFilter.class}`}
            style={computedStyle}
            controls={false}
            playsInline
            loop
            autoPlay
            muted={videoData.muted}
          />
        ) : activeTab === 'CROP' ? (
          <div className="absolute inset-0">
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: { background: 'transparent' },
                mediaStyle: computedStyle,
              }}
            />
          </div>
        ) : (
          <img
            ref={imageRef}
            src={previewUrl || undefined}
            alt={t('common.alt.upload')}
            className={`max-w-full max-h-full object-contain rounded-lg ${selectedFilter.class} shadow-2xl`}
            style={computedStyle}
          />
        )}

        {/* PRO Adjustments Overlays */}
        {activeTab !== 'CROP' && (
          <>
            {/* Temperature Overlay */}
            {adjustments.temperature !== 100 && (
              <div
                className="absolute inset-0 pointer-events-none rounded-lg mix-blend-color"
                style={{
                  backgroundColor:
                    adjustments.temperature > 100 ? '#ff8c00' : '#0077ff',
                  opacity: Math.abs(adjustments.temperature - 100) / 300,
                }}
              />
            )}
            {/* Vignette Overlay */}
            {adjustments.vignette > 0 && (
              <div
                className="absolute inset-0 pointer-events-none rounded-lg"
                style={{
                  background:
                    'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 120%)',
                  opacity: adjustments.vignette / 100,
                }}
              />
            )}
            {/* Noise Overlay */}
            {adjustments.noise > 0 && (
              <div
                className="absolute inset-0 pointer-events-none rounded-lg mix-blend-overlay"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`,
                  opacity: adjustments.noise / 100,
                }}
              />
            )}

            {/* Canvas Overlay for drawing/text */}
            <div
              className="absolute"
              style={{ width: imageDims.width, height: imageDims.height }}
            >
              <CanvasOverlay
                stageRef={stageRef}
                width={imageDims.width}
                height={imageDims.height}
                overlays={overlays}
                onChange={(newOverlays) => setOverlays(newOverlays)}
                drawMode={drawMode}
                brushColor={brushColor}
                brushSize={brushSize}
                selectedOverlayId={selectedOverlayId}
                onSelectOverlay={setSelectedOverlayId}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
