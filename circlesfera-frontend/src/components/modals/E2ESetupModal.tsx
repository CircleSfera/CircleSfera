import { AlertTriangle, Lock, Shield } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '../../services/api';
import { useE2EStore } from '../../stores/e2eStore';
import { E2EService } from '../../utils/e2e';
import { Button } from '../ui';

export default function E2ESetupModal() {
  const setStatus = useE2EStore((state) => state.setStatus);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 1. Generate new RSA-OAEP keys
      const keyPair = await E2EService.generateKeyPair();
      const publicKeyB64 = await E2EService.exportPublicKey(keyPair.publicKey);
      const privateKeyB64 = await E2EService.exportPrivateKey(
        keyPair.privateKey,
      );

      // 2. Encrypt the private key using the backup password
      const encryptedPrivateKey =
        await E2EService.encryptPrivateKeyWithPassword(privateKeyB64, password);

      // 3. Upload to backend
      await apiClient.put('/users/me/e2e-keys', {
        publicKey: publicKeyB64,
        privateKeyEncrypted: encryptedPrivateKey,
      });

      // 4. Store unencrypted keys locally for current device
      localStorage.setItem('e2e_public_key', publicKeyB64);
      localStorage.setItem('e2e_private_key', privateKeyB64);

      // 5. Complete
      setStatus('READY');
    } catch (err: any) {
      setError(err.message || 'Error al configurar el cifrado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 bg-purple-500/20 text-purple-400 rounded-full mb-4 mx-auto">
            <Shield size={24} />
          </div>
          <h2 className="text-xl font-bold text-white text-center mb-2">
            Chats Privados (E2EE)
          </h2>
          <p className="text-gray-400 text-sm text-center mb-6">
            Para poder leer tus chats en otros dispositivos si cambias de móvil,
            necesitas configurar una <strong>Contraseña de Respaldo</strong>. El
            servidor no conocerá esta contraseña.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="backup-password"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Contraseña de Respaldo
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  id="backup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full bg-black border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Repetir Contraseña
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetir contraseña"
                  className="w-full bg-black border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white focus:ring-2 focus:ring-purple-500 outline-none"
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
              className="w-full py-2.5 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl font-semibold"
              isLoading={isSubmitting}
            >
              Proteger mis Chats
            </Button>

            <p className="text-xs text-center text-gray-500 mt-2">
              ¡Asegúrate de no olvidarla! Sin ella, no podrás recuperar mensajes
              antiguos en nuevos dispositivos.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
