import { api } from '../services';
import { useSocketStore } from '../stores/socketStore';
import { useCallStore } from '../stores/useCallStore';
import { logger } from '../utils/logger';

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  private async fetchIceServers() {
    try {
      const response = await api.get('/webrtc/ice-servers');
      if (response.data && response.data.length > 0) {
        this.rtcConfig.iceServers = response.data;
        logger.log('Loaded TURN/STUN servers from backend');
      }
    } catch (error) {
      logger.error('Failed to fetch ICE servers, using fallback', error);
    }
  }

  async startCall(userId: string, type: 'audio' | 'video') {
    try {
      await this.fetchIceServers();
      this.pc = new RTCPeerConnection(this.rtcConfig);
      this.setupListeners(userId);

      // Get media with error handling
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
    } catch (error) {
      logger.error('Failed to start call (Hardware/Permission issue):', error);

      // Clean up and notify the other party
      this.cleanup();
      useCallStore.getState().resetCall();

      // Notify the backend that the call has been aborted
      useSocketStore.getState().socket?.emit('call:hangup', {
        targetId: userId,
      });

      throw error;
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit, fromId: string) {
    try {
      await this.fetchIceServers();
      this.pc = new RTCPeerConnection(this.rtcConfig);
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
      this.processIceCandidateQueue();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      useSocketStore.getState().socket?.emit('call:signal', {
        targetId: fromId,
        signal: { type: 'answer', sdp: answer.sdp },
      });
    } catch (error) {
      logger.error('Failed to answer call (Hardware/Permission issue):', error);

      this.cleanup();
      useCallStore.getState().resetCall();

      // Tell caller we declined/failed to answer so they don't hang
      useSocketStore.getState().socket?.emit('call:decline', {
        callerId: fromId,
      });
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.processIceCandidateQueue();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    if (!this.pc.remoteDescription?.type) {
      logger.log('Queuing ICE candidate (waiting for remote description)');
      this.iceCandidateQueue.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      logger.error('Error adding ICE candidate', e);
    }
  }

  private async processIceCandidateQueue() {
    if (this.iceCandidateQueue.length > 0) {
      logger.log(`Processing ${this.iceCandidateQueue.length} queued ICE candidates`);
      for (const candidate of this.iceCandidateQueue) {
        try {
          await this.pc?.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          logger.error('Error adding queued ICE candidate', e);
        }
      }
      this.iceCandidateQueue = [];
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
      const stream = event.streams?.[0];
      if (stream) {
        // Clone the stream to force a new object reference in Zustand/React
        // so that adding a second track (e.g. video) triggers a UI update.
        const updatedStream = new MediaStream(stream.getTracks());
        useCallStore.getState().setRemoteStream(updatedStream);
      } else {
        // Fallback if event.streams is empty
        const currentStream = useCallStore.getState().remoteStream || new MediaStream();
        currentStream.addTrack(event.track);
        useCallStore.getState().setRemoteStream(new MediaStream(currentStream.getTracks()));
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      logger.log('WebRTC connection state:', this.pc.connectionState);
      useCallStore.getState().setConnectionStatus(this.pc.connectionState);

      if (
        this.pc.connectionState === 'disconnected' ||
        this.pc.connectionState === 'failed' ||
        this.pc.connectionState === 'closed'
      ) {
        useCallStore.getState().resetCall();
      }
    };
  }

  async startScreenShare() {
    if (!this.pc || !this.localStream) return;

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      const screenVideoTrack = this.screenStream.getVideoTracks()[0];
      const sender = this.pc
        .getSenders()
        .find((s) => s.track?.kind === 'video');

      if (sender && screenVideoTrack) {
        await sender.replaceTrack(screenVideoTrack);

        // Listen for browser "stop sharing" button
        screenVideoTrack.onended = () => {
          this.stopScreenShare();
        };

        useCallStore.getState().setIsScreenSharing(true);
        // Replace video in local UI
        const newLocalStream = new MediaStream([
          screenVideoTrack,
          ...this.localStream.getAudioTracks(),
        ]);
        useCallStore.getState().setLocalStream(newLocalStream);
      }
    } catch (error) {
      logger.error('Error starting screen share', error);
    }
  }

  async stopScreenShare() {
    if (!this.pc || !this.localStream || !this.screenStream) return;

    const localVideoTrack = this.localStream.getVideoTracks()[0];
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');

    if (sender && localVideoTrack) {
      await sender.replaceTrack(localVideoTrack);

      this.screenStream.getTracks().forEach((t) => {
        t.stop();
      });
      this.screenStream = null;

      useCallStore.getState().setIsScreenSharing(false);
      // Restore video in local UI
      useCallStore.getState().setLocalStream(this.localStream);
    }
  }

  cleanup() {
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => {
      t.stop();
    });
    this.screenStream?.getTracks().forEach((t) => {
      t.stop();
    });
    this.localStream = null;
    this.screenStream = null;
    this.iceCandidateQueue = [];
  }
}

export const webrtcService = new WebRTCService();
