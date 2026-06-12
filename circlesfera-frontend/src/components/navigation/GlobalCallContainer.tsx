import type React from 'react';
import { useCallListeners } from '../../hooks/useCallListeners';
import { CallOverlay } from '../chat/CallOverlay';
import { IncomingCallModal } from '../chat/IncomingCallModal';

export const GlobalCallContainer: React.FC = () => {
  // Initialize global socket listeners for calls
  useCallListeners();

  return (
    <>
      <IncomingCallModal />
      <CallOverlay />
    </>
  );
};
