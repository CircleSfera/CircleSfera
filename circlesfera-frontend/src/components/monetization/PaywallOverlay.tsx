import { Lock } from 'lucide-react';

interface PaywallOverlayProps {
  price: number;
  onUnlock: () => void;
  isLoading?: boolean;
}

export default function PaywallOverlay({
  price,
  onUnlock,
  isLoading,
}: PaywallOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-black/60 backdrop-blur-xl">
      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4 border border-white/20 shadow-2xl">
        <Lock className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-black text-white mb-2 text-center tracking-tight">
        Contenido Exclusivo
      </h3>
      <p className="text-gray-300 text-sm text-center mb-6 max-w-xs">
        Este post es premium. Desbloquéalo con tokens o suscríbete al creador
        para ver todo su contenido.
      </p>

      <button
        type="button"
        onClick={onUnlock}
        disabled={isLoading}
        className="px-8 py-3 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Desbloqueando...' : `Desbloquear por ${price} Tokens`}
      </button>
    </div>
  );
}
