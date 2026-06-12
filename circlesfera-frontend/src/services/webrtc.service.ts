import { useSocketStore } from '../stores/socketStore';
import { useCallStore } from '../stores/useCallStore';
import { logger } from '../utils/logger';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;

  async startCall(userId: string, type: 'audio' | 'video') {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.setupListeners(userId);

    // Get media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    });

    useCallStore.getState().setLocalStream(this.localStream);

    // Add tracks to PC
    this.localStream.getTracks().forEach((track) => {
      this.pc?.addTrack(track, this.localStream!);
    });

    // Create offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Send offer
    useSocketStore.getState().socket?.emit('call:signal', {
      targetId: userId,
      signal: { type: 'offer', sdp: offer.sdp },
    });
  }

  async handleOffer(offer: RTCSessionDescriptionInit, fromId: string) {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.setupListeners(fromId);

    // Get media
    const callType = useCallStore.getState().callType;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });

    useCallStore.getState().setLocalStream(this.localStream);

    this.localStream.getTracks().forEach((track) => {
      this.pc?.addTrack(track, this.localStream!);
    });

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    useSocketStore.getState().socket?.emit('call:signal', {
      targetId: fromId,
      signal: { type: 'answer', sdp: answer.sdp },
    });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      logger.error('Error adding ICE candidate', e);
    }
  }

  private setupListeners(targetId: string) {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        useSocketStore.getState().socket?.emit('call:signal', {
          targetId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        useCallStore.getState().setRemoteStream(event.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      logger.log('WebRTC connection state:', this.pc?.connectionState);
      if (
        this.pc?.connectionState === 'disconnected' ||
        this.pc?.connectionState === 'failed'
      ) {
        useCallStore.getState().resetCall();
      }
    };
  }

  cleanup() {
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => {
      t.stop();
    });
    this.localStream = null;
  }
}

export const webrtcService = new WebRTCService();
