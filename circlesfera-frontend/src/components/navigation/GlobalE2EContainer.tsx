import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useE2EStore } from '../../stores/e2eStore';
import { useSocketStore } from '../../stores/socketStore';
import { E2EService } from '../../utils/e2e';
import { logger } from '../../utils/logger';
import E2ERecoveryModal from '../modals/E2ERecoveryModal';
import E2ESetupModal from '../modals/E2ESetupModal';

export function GlobalE2EContainer() {
  const { status, setStatus, setSyncKeyPair } = useE2EStore();
  const socket = useSocketStore((state) => state.socket);
  const [pendingSyncs, setPendingSyncs] = useState<
    Array<{ syncPublicKey: string; requesterSocketId: string }>
  >([]);

  useEffect(() => {
    if (!socket) return;

    const handleSyncRequested = async (payload: {
      syncPublicKey: string;
      requesterSocketId: string;
    }) => {
      if (useE2EStore.getState().status === 'READY') {
        setPendingSyncs((prev) => [...prev, payload]);
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
          const profile = useAuthStore.getState().profile;
          if (profile?.id) {
            localStorage.setItem(`e2e_private_key_${profile.id}`, masterPrivateKeyBase64);
          } else {
            localStorage.setItem('e2e_private_key', masterPrivateKeyBase64);
          }

          // Clean up ephemeral keys
          setSyncKeyPair(null);

          // Fetch the public key from the backend to ensure we have it locally
          const { apiClient } = await import('../../services/api');
          const res = await apiClient.get<{ publicKey: string }>(
            '/users/me/e2e-keys',
          );
          if (profile?.id) {
            localStorage.setItem(`e2e_public_key_${profile.id}`, res.data.publicKey);
          } else {
            localStorage.setItem('e2e_public_key', res.data.publicKey);
          }

          // Switch to ready!
          setStatus('READY');
          logger.log(
            'E2E: Successfully synced master key from another device!',
          );
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

    const handleApproveSync = async (payload: {
      syncPublicKey: string;
      requesterSocketId: string;
    }) => {
      try {
        const profile = useAuthStore.getState().profile;
        const privateKey = profile?.id
          ? localStorage.getItem(`e2e_private_key_${profile.id}`)
          : localStorage.getItem('e2e_private_key');
        if (!privateKey || !socket) return;

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
    } finally {
      setPendingSyncs((prev) =>
        prev.filter((p) => p.requesterSocketId !== payload.requesterSocketId),
      );
    }
  };

  const handleRejectSync = (requesterSocketId: string) => {
    setPendingSyncs((prev) =>
      prev.filter((p) => p.requesterSocketId !== requesterSocketId),
    );
  };

  return (
    <>
      {status === 'NEEDS_SETUP' && <E2ESetupModal />}
      {(status === 'NEEDS_RECOVERY' || status === 'SYNCING') && (
        <E2ERecoveryModal />
      )}
      {pendingSyncs.length > 0 && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 text-center shadow-2xl">
            <div className="flex justify-center mb-4 mt-2">
              <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                  aria-label="Lock icon"
                >
                  <title>Lock</title>
                  <rect
                    x="3"
                    y="11"
                    width="18"
                    height="11"
                    rx="2"
                    ry="2"
                  ></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Nuevo dispositivo detectado
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              ¿Quieres transferir tus claves de chat a este dispositivo para que
              pueda leer tus mensajes privados?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  handleRejectSync(pendingSyncs[0].requesterSocketId)
                }
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-semibold transition-colors"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => handleApproveSync(pendingSyncs[0])}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
              >
                Aprobar Transferencia
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
