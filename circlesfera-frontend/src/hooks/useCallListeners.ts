import { useEffect } from 'react';
import { webrtcService } from '../services/webrtc.service';
import { useSocketStore } from '../stores/socketStore';
import type { CallType, CallUser } from '../stores/useCallStore';
import { useCallStore } from '../stores/useCallStore';
import { logger } from '../utils/logger';

export const useCallListeners = () => {
  const socket = useSocketStore((state) => state.socket);
  const { setIncomingCall, resetCall } = useCallStore();

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = ({
      caller,
      type,
    }: {
      caller: CallUser;
      type: CallType;
    }) => {
      const currentStatus = useCallStore.getState().status;
      if (currentStatus !== 'idle') return;
      logger.log('Incoming call from:', caller.profile.username);
      setIncomingCall(caller, type);
    };

    const handleAccepted = async ({ receiverId }: { receiverId: string }) => {
      logger.log('Call accepted by:', receiverId);
      const currentCallType = useCallStore.getState().callType;
      useCallStore.setState({ status: 'active' }); // Update caller to active
      await webrtcService.startCall(receiverId, currentCallType!);
    };

    const handleSignal = async ({
      signal,
      fromId,
    }: {
      signal: { type: string; sdp?: string; candidate?: RTCIceCandidateInit };
      fromId: string;
    }) => {
      if (signal.type === 'offer' && signal.sdp) {
        await webrtcService.handleOffer(
          { type: 'offer', sdp: signal.sdp },
          fromId,
        );
      } else if (signal.type === 'answer' && signal.sdp) {
        await webrtcService.handleAnswer({ type: 'answer', sdp: signal.sdp });
      } else if (signal.type === 'candidate' && signal.candidate) {
        await webrtcService.addIceCandidate(signal.candidate);
      }
    };

    const handleEnded = () => {
      logger.log('Call ended by peer');
      webrtcService.cleanup();
      resetCall();
    };

    const handleDeclined = () => {
      logger.log('Call declined by peer');
      webrtcService.cleanup();
      resetCall();
    };

    socket.on('call:incoming', handleIncoming);
    socket.on('call:accepted', handleAccepted);
    socket.on('call:signal', handleSignal);
    socket.on('call:ended', handleEnded);
    socket.on('call:declined', handleDeclined);

    return () => {
      socket.off('call:incoming', handleIncoming);
      socket.off('call:accepted', handleAccepted);
      socket.off('call:signal', handleSignal);
      socket.off('call:ended', handleEnded);
      socket.off('call:declined', handleDeclined);
    };
  }, [socket, setIncomingCall, resetCall]);
};
