import { AlertTriangle, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api';
import { useE2EStore } from '../../stores/e2eStore';
import { useSocketStore } from '../../stores/socketStore';
import { E2EService } from '../../utils/e2e';
import { Button } from '../ui';

export default function E2ERecoveryModal() {
  const { status, setStatus, setSyncKeyPair, encryptedPrivateKeyPayload } =
    useE2EStore();
  const socket = useSocketStore((state) => state.socket);

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasAttemptedSync, setHasAttemptedSync] = useState(false);

  useEffect(() => {
    if (status === 'NEEDS_RECOVERY' && !hasAttemptedSync && socket?.connected) {
      setHasAttemptedSync(true);
      setStatus('SYNCING');

      const initiateSync = async () => {
        try {
          const keyPair = await E2EService.generateKeyPair();
          setSyncKeyPair(keyPair);

          const publicKeyB64 = await E2EService.exportPublicKey(
            keyPair.publicKey,
          );
          socket.emit('e2e:request_sync', { syncPublicKey: publicKeyB64 });

          // Timeout to fallback if no other devices answer
          setTimeout(() => {
            if (useE2EStore.getState().status === 'SYNCING') {
              setStatus('NEEDS_RECOVERY');
            }
          }, 5000);
        } catch (err) {
          console.error('Error initiating sync', err);
          setStatus('NEEDS_RECOVERY');
        }
      };

      initiateSync();
    }
  }, [status, hasAttemptedSync, socket, setStatus, setSyncKeyPair]);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    if (!encryptedPrivateKeyPayload) {
      setError('No hay claves de respaldo disponibles.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 1. Decrypt private key from server using the password
      const privateKeyB64 = await E2EService.decryptPrivateKeyWithPassword(
        encryptedPrivateKeyPayload,
        password,
      );

      // 2. We need the public key as well to store locally. We can re-fetch it or extract it.
      const res = await apiClient.get<{ publicKey: string }>(
        '/users/me/e2e-keys',
      );
      const publicKeyB64 = res.data.publicKey;

      // 3. Store both keys locally for this new device
      localStorage.setItem('e2e_public_key', publicKeyB64);
      localStorage.setItem('e2e_private_key', privateKeyB64);

      setStatus('READY');
    } catch (err: unknown) {
      console.error(err);
      setError('Contraseña incorrecta o error al descifrar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        'Si restableces tus claves, perderás el acceso a todos tus mensajes anteriores. ¿Estás seguro?',
      )
    ) {
      return;
    }
    // Si olvidaron la contraseña, generamos unas claves nuevas desde cero (Setup)
    setStatus('NEEDS_SETUP');
  };

  if (status === 'SYNCING') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 text-center shadow-2xl">
          <div className="flex justify-center mb-6 mt-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Sincronizando claves...
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Buscando otros dispositivos activos para restaurar tus chats
            automáticamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full mb-4 mx-auto">
            <KeyRound size={24} />
          </div>
          <h2 className="text-xl font-bold text-white text-center mb-2">
            Recuperar Claves de Chat
          </h2>
          <p className="text-gray-400 text-sm text-center mb-6">
            Detectamos que tus chats están cifrados y este es un dispositivo
            nuevo. Introduce tu <strong>Contraseña de Respaldo</strong> para
            restaurar tu acceso.
          </p>

          <form onSubmit={handleRecover} className="space-y-4">
            <div>
              <div className="relative">
                <KeyRound
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña de respaldo"
                  className="w-full bg-black border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 text-red-400 rounded-lg text-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold"
              isLoading={isSubmitting}
            >
              Desbloquear Mis Chats
            </Button>

            <button
              type="button"
              onClick={handleReset}
              className="w-full text-center text-sm text-gray-500 hover:text-white transition-colors mt-4"
            >
              ¿Olvidaste tu contraseña? Restablecer claves (Pierde historial)
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
