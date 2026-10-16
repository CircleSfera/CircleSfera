import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraFacing = 'user' | 'environment';
/** Starting, showing, refused by the person, or there is no camera. */
export type CameraState = 'starting' | 'on' | 'refused' | 'none';

/** The longest video a story takes, in seconds. */
export const STORY_RECORD_MAX_SEC = 60;

/** The format the device records in, as the server takes both. */
export function recordingType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of [
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

/**
 * The camera of the story capture screen: the preview, switching cameras,
 * the light where the camera has one, a photo as seen and a video with sound.
 * The camera stops when the screen is left or hidden.
 */
export function useStoryCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // Let go of while the microphone was still being asked for.
  const stopAskedRef = useRef(false);
  // The microphone and the time limit of the video being recorded.
  const soundRef = useRef<MediaStream | null>(null);
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Grows each time the camera stops: a recording started before is dropped.
  const sessionRef = useRef(0);
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [state, setState] = useState<CameraState>('starting');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [visible, setVisible] = useState(
    typeof document === 'undefined' || !document.hidden,
  );

  /**
   * Drops a video being recorded, or about to be: nothing is handed over,
   * and the microphone and its time limit stop with it.
   */
  const abortRecording = useCallback(() => {
    sessionRef.current += 1;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    for (const track of soundRef.current?.getTracks() ?? []) track.stop();
    soundRef.current = null;
    if (limitRef.current) clearTimeout(limitRef.current);
    limitRef.current = null;
    setRecording(false);
  }, []);

  const stopStream = useCallback(() => {
    abortRecording();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [abortRecording]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!visible) {
      stopStream();
      return;
    }
    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) {
      setState('none');
      return;
    }
    let gone = false;
    setState('starting');
    devices
      .getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      })
      .then((stream) => {
        if (gone) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        stopStream();
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        const [track] = stream.getVideoTracks();
        const capabilities = track?.getCapabilities?.() as
          | TorchCapabilities
          | undefined;
        setHasTorch(Boolean(capabilities?.torch));
        setTorchOn(false);
        setState('on');
      })
      .catch((err: { name?: string }) => {
        if (gone) return;
        setState(
          err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError'
            ? 'none'
            : 'refused',
        );
      });
    return () => {
      gone = true;
      stopStream();
    };
  }, [facing, visible, stopStream]);

  const switchCamera = () =>
    setFacing((f) => (f === 'user' ? 'environment' : 'user'));

  const toggleTorch = async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setHasTorch(false);
    }
  };

  /** The preview as it is seen, as a JPEG file. */
  const takePhoto = async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video) return null;
    // A tap right as the camera opens waits for its first picture.
    if (!video.videoWidth) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, 2000);
        video.addEventListener('loadeddata', done, { once: true });
      });
    }
    if (!video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // The front camera is seen as a mirror shows it, and kept so.
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    );
    return blob
      ? new File([blob], `story_${Date.now()}.jpg`, { type: 'image/jpeg' })
      : null;
  };

  /**
   * Records a video with sound until `stopRecording`, or the longest a story
   * takes. The microphone is asked for here, so photos never ask for it.
   */
  const startRecording = async (onDone: (file: File | null) => void) => {
    const video = streamRef.current;
    const type = recordingType();
    if (!video || !type || recorderRef.current) {
      onDone(null);
      return;
    }
    stopAskedRef.current = false;
    const session = sessionRef.current;
    let sound: MediaStream | null = null;
    try {
      sound = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Without the microphone the video goes without sound.
    }
    // The camera stopped while the microphone was being asked for.
    if (session !== sessionRef.current || !streamRef.current) {
      for (const track of sound?.getTracks() ?? []) track.stop();
      onDone(null);
      return;
    }
    soundRef.current = sound;
    const stream = new MediaStream([
      ...video.getVideoTracks(),
      ...(sound?.getAudioTracks() ?? []),
    ]);
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const parts: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    limitRef.current = setTimeout(
      () => recorder.state === 'recording' && recorder.stop(),
      STORY_RECORD_MAX_SEC * 1000,
    );
    recorder.onstop = () => {
      if (limitRef.current) clearTimeout(limitRef.current);
      limitRef.current = null;
      for (const track of sound?.getTracks() ?? []) track.stop();
      soundRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      const base = type.split(';')[0];
      const blob = new Blob(parts, { type: base });
      onDone(
        blob.size > 0
          ? new File(
              [blob],
              `story_${Date.now()}.${base === 'video/mp4' ? 'mp4' : 'webm'}`,
              { type: base },
            )
          : null,
      );
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
    if (stopAskedRef.current) recorder.stop();
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
    else stopAskedRef.current = true;
  };

  return {
    videoRef,
    facing,
    state,
    hasTorch,
    torchOn,
    recording,
    switchCamera,
    toggleTorch,
    takePhoto,
    startRecording,
    stopRecording,
  };
}
