import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../stores/useCallStore';
import { webrtcService } from '../../services/webrtc.service';

export const CallOverlay: React.FC = () => {
  const { status, remoteUser, callType, localStream, remoteStream, isScreenSharing, endCall } =
    useCallStore();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

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
        className="fixed inset-0 z-110 bg-black flex flex-col md:flex-row overflow-hidden"
      >
        {/* Main Background (Remote Video or Avatar) */}
        <div className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
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
            <div className="flex flex-col items-center gap-6">
              <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-white/10 p-2 shadow-2xl">
                <img
                  src={remoteUser?.profile.avatar || '/default-avatar.png'}
                  alt={remoteUser?.profile.username || t('chat.remote_user')}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-2">
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
              dragConstraints={{
                left: -300,
                right: 300,
                top: -500,
                bottom: 500,
              }}
              className="absolute top-8 right-8 w-40 md:w-56 aspect-3/4 bg-zinc-900 rounded-2xl overflow-hidden border border-white/20 shadow-2xl z-10 cursor-move ring-4 ring-black/30"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-gray-500">
                  <VideoOff size={32} />
                </div>
              )}
            </motion.div>
          )}

          {/* Bottom Floating Controls */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6 px-8 py-5 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 shadow-2xl z-20">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className={`p-4 rounded-full transition-all duration-300 ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            {/* Video Toggle (Conditional) */}
            {callType === 'video' && (
              <>
                <button
                  type="button"
                  onClick={toggleVideo}
                  className={`p-4 rounded-full transition-all duration-300 ${isVideoOff ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>

                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`p-4 rounded-full transition-all duration-300 ${isScreenSharing ? 'bg-brand-primary text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
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
