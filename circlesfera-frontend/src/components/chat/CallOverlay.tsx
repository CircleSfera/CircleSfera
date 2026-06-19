import { AnimatePresence, motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { webrtcService } from '../../services/webrtc.service';
import { useCallStore } from '../../stores/useCallStore';

export const CallOverlay: React.FC = () => {
  const {
    status,
    remoteUser,
    callType,
    localStream,
    remoteStream,
    isScreenSharing,
    endCall,
  } = useCallStore();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const ringtoneRef = useRef<HTMLAudioElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (status === 'ringing' && ringtoneRef.current) {
      ringtoneRef.current
        .play()
        .catch((e) => console.error('Audio play blocked:', e));
    } else if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, [status]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current && callType === 'video') {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, callType]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream && callType === 'video') {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await webrtcService.stopScreenShare();
    } else {
      await webrtcService.startScreenShare();
    }
  };

  if (status !== 'active' && status !== 'ringing') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black flex flex-col md:flex-row overflow-hidden"
      >
        <audio ref={ringtoneRef} src="/ringtone.mp3" loop preload="auto">
          <track kind="captions" />
        </audio>
        <audio ref={remoteAudioRef} autoPlay playsInline>
          <track kind="captions" />
        </audio>
        {/* Main Background (Remote Video or Avatar) */}
        <div
          ref={constraintsRef}
          className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden"
        >
          {callType === 'video' && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            >
              <track kind="captions" />
            </video>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-white/10 p-2 shadow-2xl">
                <img
                  src={remoteUser?.profile.avatar || '/default-avatar.png'}
                  alt={remoteUser?.profile.username || t('chat.remote_user')}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-2">
                  {remoteUser?.profile.fullName || remoteUser?.profile.username}
                </h2>
                <p className="text-brand-primary animate-pulse font-medium">
                  {t('chat.in_call')}
                </p>
              </div>
            </div>
          )}

          {/* Local Video PIP (For Video Calls) */}
          {callType === 'video' && (
            <motion.div
              drag
              dragConstraints={constraintsRef}
              dragElastic={0.2}
              whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
              dragMomentum={true}
              className="absolute top-8 right-8 w-40 md:w-56 aspect-3/4 bg-zinc-900 rounded-lg overflow-hidden border border-white/20 shadow-2xl shadow-black z-10 cursor-grab ring-2 ring-black/50"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover mirror ${isVideoOff ? 'hidden' : ''}`}
              >
                <track kind="captions" />
              </video>
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-gray-500">
                  <VideoOff size={32} />
                </div>
              )}
            </motion.div>
          )}

          {/* Bottom Floating Controls */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 px-8 py-4 glass-panel rounded-[32px] border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-20">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className={`p-4 rounded-full transition-all duration-300 shadow-xl ${isMuted ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            {/* Video Toggle (Conditional) */}
            {callType === 'video' && (
              <>
                <button
                  type="button"
                  onClick={toggleVideo}
                  className={`p-4 rounded-full transition-all duration-300 shadow-xl ${isVideoOff ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>

                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`p-4 rounded-full transition-all duration-300 shadow-xl ${isScreenSharing ? 'bg-brand-primary text-white shadow-brand-primary/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  <MonitorUp size={24} />
                </button>
              </>
            )}

            {/* End Call Button */}
            <button
              type="button"
              onClick={endCall}
              className="p-5 rounded-full bg-red-600 text-white hover:bg-red-700 hover:scale-110 active:scale-95 transition-all duration-300 shadow-xl shadow-red-600/30"
            >
              <PhoneOff size={28} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
