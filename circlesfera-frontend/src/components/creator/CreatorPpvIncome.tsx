import { ArrowRight, Loader2, Lock, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '../ui';

interface Props {
  isConnecting: boolean;
  onConnect: () => void;
  showConnect?: boolean;
}

// How PPV earnings work. Connect CTA only when Stripe is not linked.
export default function CreatorPpvIncome({
  isConnecting,
  onConnect,
  showConnect = true,
}: Props) {
  const { t } = useTranslation();

  return (
    <Card variant="glass" className="p-4 sm:p-5 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white tracking-tight">
          {t('creator.ppv.title')}
        </h2>
        <p className="text-sm text-white/50 mt-1 leading-relaxed">
          {t('creator.ppv.description')}
        </p>
      </div>

      <ul className="space-y-3 text-sm text-white/70">
        <li className="flex items-start gap-2.5">
          <Lock
            size={16}
            className="text-brand-primary shrink-0 mt-0.5"
            aria-hidden
          />
          <span>{t('creator.ppv.lock_rule')}</span>
        </li>
        <li className="flex items-start gap-2.5">
          <Wallet
            size={16}
            className="text-brand-primary shrink-0 mt-0.5"
            aria-hidden
          />
          <span>{t('creator.ppv.split')}</span>
        </li>
      </ul>

      {showConnect ? (
        <Button
          variant="primary"
          className="w-full min-h-11 gap-2"
          disabled={isConnecting}
          onClick={onConnect}
        >
          {isConnecting ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <>
              {t('creator.ppv.connect')}
              <ArrowRight size={15} aria-hidden />
            </>
          )}
        </Button>
      ) : null}
    </Card>
  );
}
