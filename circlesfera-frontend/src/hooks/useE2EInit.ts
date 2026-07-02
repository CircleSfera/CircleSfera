import { useEffect, useRef } from 'react';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useE2EStore } from '../stores/e2eStore';

/**
 * Hook to initialize E2EE keys when the user logs in.
 * Checks localStorage for the private key and validates with backend.
 */
export function useE2EInit() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const profile = useAuthStore((state) => state.profile);
  const setStatus = useE2EStore((state) => state.setStatus);
  const setEncryptedPayload = useE2EStore((state) => state.setEncryptedPayload);
  const initialized = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !profile || initialized.current) return;

    const initKeys = async () => {
      initialized.current = true;
      try {
        const privateKeyName = `e2e_private_key_${profile.id}`;
        const publicKeyName = `e2e_public_key_${profile.id}`;

        let storedPrivateKey = localStorage.getItem(privateKeyName);
        let storedPublicKey = localStorage.getItem(publicKeyName);

        // Migration from old keys
        if (!storedPrivateKey && localStorage.getItem('e2e_private_key')) {
          storedPrivateKey = localStorage.getItem('e2e_private_key');
          localStorage.setItem(privateKeyName, storedPrivateKey!);
          localStorage.removeItem('e2e_private_key');
        }
        if (!storedPublicKey && localStorage.getItem('e2e_public_key')) {
          storedPublicKey = localStorage.getItem('e2e_public_key');
          localStorage.setItem(publicKeyName, storedPublicKey!);
          localStorage.removeItem('e2e_public_key');
        }

        // Check what the backend has
        const res = await apiClient.get<{
          publicKey: string | null;
          privateKeyEncrypted: string | null;
        }>('/users/me/e2e-keys');

        const { publicKey, privateKeyEncrypted } = res.data;

        if (storedPrivateKey && storedPublicKey) {
          // We have keys locally. Do we need to upload them?
          if (!publicKey) {
            setStatus('NEEDS_SETUP');
          } else {
            setStatus('READY');
          }
          return;
        }

        if (publicKey && privateKeyEncrypted) {
          // Backend has keys, but we don't. We need to recover them.
          setEncryptedPayload(privateKeyEncrypted);
          setStatus('NEEDS_RECOVERY');
        } else {
          // Neither we nor the backend have keys.
          setStatus('NEEDS_SETUP');
        }
      } catch (error) {
        console.error('Failed to initialize E2E keys', error);
        // Fallback to avoid breaking app if endpoint fails
        setStatus('READY');
      }
    };

    initKeys();
  }, [isAuthenticated, profile, setStatus, setEncryptedPayload]);
}
