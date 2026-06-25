import { useE2EStore } from '../../stores/e2eStore';
import E2ERecoveryModal from '../modals/E2ERecoveryModal';
import E2ESetupModal from '../modals/E2ESetupModal';

export function GlobalE2EContainer() {
  const status = useE2EStore((state) => state.status);

  return (
    <>
      {status === 'NEEDS_SETUP' && <E2ESetupModal />}
      {status === 'NEEDS_RECOVERY' && <E2ERecoveryModal />}
    </>
  );
}
