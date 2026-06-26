import { useEffect } from 'react';
import { useE2EStore } from '../../stores/e2eStore';
import { useSocketStore } from '../../stores/socketStore';
import { E2EService } from '../../utils/e2e';
import { logger } from '../../utils/logger';
import E2ERecoveryModal from '../modals/E2ERecoveryModal';
import E2ESetupModal from '../modals/E2ESetupModal';

export function GlobalE2EContainer() {
  const { status, setStatus, setSyncKeyPair } = useE2EStore();
  const socket = useSocketStore((state) => state.socket);

  useEffect(() => {
    if (!socket) return;

    const handleSyncRequested = async (payload: {
      syncPublicKey: string;
      requesterSocketId: string;
    }) => {
      // If we are READY, we have the decrypted private key locally.
      // We can securely share it with our other device.
      if (useE2EStore.getState().status === 'READY') {
        try {
          const privateKey = localStorage.getItem('e2e_private_key');
          if (!privateKey) return;

          const syncPayload = await E2EService.generateSyncPayload(
            privateKey,
            payload.syncPublicKey,
          );

          socket.emit('e2e:sync_response', {
            targetSocketId: payload.requesterSocketId,
            ...syncPayload,
          });
          logger.log('E2E: Sent master key to new device.');
        } catch (error) {
          logger.error('E2E: Error generating sync response', error);
        }
      }
    };

    const handleSyncResponse = async (payload: {
      wrappedAesKey: string;
      ciphertext: string;
      iv: string;
    }) => {
      // If we requested it, we are SYNCING and have a syncKeyPair
      const currentState = useE2EStore.getState();
      if (
        currentState.status === 'SYNCING' &&
        currentState.syncKeyPair?.privateKey
      ) {
        try {
          const masterPrivateKeyBase64 = await E2EService.decryptSyncPayload(
            payload.wrappedAesKey,
            payload.ciphertext,
            payload.iv,
            currentState.syncKeyPair.privateKey,
          );

          // Save the recovered master key
          localStorage.setItem('e2e_private_key', masterPrivateKeyBase64);
          
          // Clean up ephemeral keys
          setSyncKeyPair(null);
          
          // Switch to ready!
          setStatus('READY');
          logger.log('E2E: Successfully synced master key from another device!');
        } catch (error) {
          logger.error('E2E: Error decrypting synced master key', error);
        }
      }
    };

    socket.on('e2e:sync_requested', handleSyncRequested);
    socket.on('e2e:sync_response', handleSyncResponse);

    return () => {
      socket.off('e2e:sync_requested', handleSyncRequested);
      socket.off('e2e:sync_response', handleSyncResponse);
    };
  }, [socket, setStatus, setSyncKeyPair]);

  return (
    <>
      {status === 'NEEDS_SETUP' && <E2ESetupModal />}
      {(status === 'NEEDS_RECOVERY' || status === 'SYNCING') && (
        <E2ERecoveryModal />
      )}
    </>
  );
}
