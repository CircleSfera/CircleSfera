import { create } from 'zustand';
import { useSocketStore } from './socketStore';

export type CallType = 'audio' | 'video';
export type CallStatus =
  | 'idle'
  | 'ringing'
  | 'incoming'
  | 'active'
  | 'ended'
  | 'declined';

export interface CallUser {
  id: string;
  profile: {
    username: string;
    fullName?: string;
    avatar?: string | null;
  };
}

export interface CallState {
  status: CallStatus;
  remoteUser: CallUser | null;
  callType: CallType | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isScreenSharing: boolean;
  connectionStatus: RTCPeerConnectionState;

  setIncomingCall: (user: CallUser, type: CallType) => void;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  initiateCall: (
    targetUserId: string,
    type: CallType,
    remoteUser: CallUser,
  ) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setIsScreenSharing: (isScreenSharing: boolean) => void;
  setConnectionStatus: (status: RTCPeerConnectionState) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  status: 'idle',
  callType: null,
  remoteUser: null,
  localStream: null,
  remoteStream: null,
  isScreenSharing: false,
  connectionStatus: 'new' as RTCPeerConnectionState,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  initiateCall: (targetUserId, type, remoteUser) => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    set({ status: 'ringing', callType: type, remoteUser });
    socket.emit('call:invite', { recipientId: targetUserId, type });
  },

  setIncomingCall: (caller, type) => {
    // If already in a call, auto-decline or handle busy
    if (get().status !== 'idle') {
      const socket = useSocketStore.getState().socket;
      socket?.emit('call:decline', { callerId: caller.id });
      return;
    }
    set({ status: 'incoming', remoteUser: caller, callType: type });
  },

  acceptCall: () => {
    const socket = useSocketStore.getState().socket;
    const { remoteUser } = get();
    if (socket && remoteUser) {
      set({ status: 'active' });
      socket.emit('call:accept', { callerId: remoteUser.id });
    }
  },

  declineCall: () => {
    const socket = useSocketStore.getState().socket;
    const { remoteUser } = get();
    if (socket && remoteUser) {
      socket.emit('call:decline', { callerId: remoteUser.id });
    }
    get().resetCall();
  },

  endCall: () => {
    const socket = useSocketStore.getState().socket;
    const { remoteUser } = get();
    if (socket && remoteUser) {
      socket.emit('call:hangup', { targetId: remoteUser.id });
    }
    get().resetCall();
  },

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setIsScreenSharing: (isScreenSharing) => set({ isScreenSharing }),

  resetCall: () => {
    // Stop all tracks
    const { localStream } = get();
    localStream?.getTracks().forEach((track) => {
      track.stop();
    });

    set({
      status: 'idle',
      callType: null,
      remoteUser: null,
      localStream: null,
      remoteStream: null,
      isScreenSharing: false,
      connectionStatus: 'new' as RTCPeerConnectionState,
    });
  },
}));
