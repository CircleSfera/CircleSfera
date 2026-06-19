import { motion } from 'framer-motion';
import {
  ArrowRight,
  Calculator,
  Coins,
  Loader2,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  isConnecting: boolean;
  onConnect: () => void;
}

export default function CreatorSandbox({ isConnecting, onConnect }: Props) {
  const { t } = useTranslation();

  // State for the interactive simulator
  const [subscribers, setSubscribers] = useState(500);
  const [price, setPrice] = useState(10); // $10 per month

  // Calculate estimated earnings (80% revenue share)
  const estimatedGross = subscribers * price;
  const estimatedNet = estimatedGross * 0.8;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 glass-panel rounded-lg border border-brand-primary/20 bg-linear-to-br from-brand-primary/10 via-brand-secondary/5 to-transparent relative overflow-hidden"
    >
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
        <Sparkles size={200} className="text-brand-primary" />
      </div>
      <div className="absolute bottom-0 left-10 w-64 h-64 bg-brand-primary/20 blur-[100px] pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-brand-primary/20 flex items-center justify-center border border-brand-primary/30 shadow-[0_0_15px_rgba(var(--brand-primary),0.3)]">
            <Calculator size={24} className="text-brand-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black text-brand-primary uppercase tracking-wide">
              {t('creator.sandbox.title', 'Creator Sandbox')}
            </h3>
            <p className="text-white/60 text-xs">
              {t(
                'creator.sandbox.description',
                'Simula tus ingresos potenciales antes de configurar Stripe.',
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Controls Side */}
          <div className="space-y-4">
            {/* Subscribers Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="subscribers"
                  className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wide"
                >
                  <Users size={16} className="text-brand-accent" />
                  {t('creator.sandbox.fans', 'Fans Suscritos')}
                </label>
                <span className="text-2xl font-black text-brand-accent font-mono">
                  {subscribers.toLocaleString()}
                </span>
              </div>
              <input
                id="subscribers"
                type="range"
                min="10"
                max="10000"
                step="10"
                value={subscribers}
                onChange={(e) => setSubscribers(Number(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent"
              />
              <div className="flex justify-between text-xs text-white/40 font-bold uppercase tracking-wide">
                <span>10</span>
                <span>10K</span>
              </div>
            </div>

            {/* Price Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="price"
                  className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wide"
                >
                  <Coins size={16} className="text-emerald-400" />
                  {t('creator.sandbox.price', 'Precio de Suscripción')}
                </label>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  ${price}
                </span>
              </div>
              <input
                id="price"
                type="range"
                min="1"
                max="100"
                step="1"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <div className="flex justify-between text-xs text-white/40 font-bold uppercase tracking-wide">
                <span>$1</span>
                <span>$100</span>
              </div>
            </div>
          </div>

          {/* Results Side */}
          <div className="bg-black/40 backdrop-blur-md rounded-lg p-8 border border-white/5 relative">
            <div className="absolute -top-4 -right-4 bg-brand-primary text-black text-xs font-black uppercase tracking-wide px-4 py-2 rounded-full rotate-12 shadow-lg">
              {t('creator.sandbox.badge', '80% Para ti')}
            </div>

            <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-2 flex items-center gap-2">
              <TrendingUp size={14} />
              {t('creator.sandbox.estimated', 'Ingresos Mensuales Estimados')}
            </p>

            <div className="flex items-end gap-2 mb-6">
              <h2 className="text-6xl font-black text-white tracking-tighter">
                $
                {estimatedNet.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h2>
              <span className="text-xl pb-2 font-bold opacity-50 uppercase">
                USD / {t('common.month', 'mes')}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs text-white/40 border-t border-white/10 pt-4 mb-8">
              <span>
                {t('creator.sandbox.gross', 'Ingreso Bruto')}: $
                {estimatedGross.toLocaleString()}
              </span>
              <span>{t('creator.sandbox.fee', 'Tarifa Plataforma')}: 20%</span>
            </div>

            <button
              type="button"
              disabled={isConnecting}
              onClick={onConnect}
              className="w-full py-4 bg-white text-black font-black rounded-lg text-xs uppercase tracking-wide hover:scale-[1.02] transition-transform disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-white/10 group"
            >
              {isConnecting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Wallet size={18} className="text-brand-primary" />
                  {t('creator.sandbox.connect', 'Conectar Stripe y Empezar')}
                  <ArrowRight
                    size={18}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </>
              )}
            </button>
            <p className="text-center mt-4 text-xs text-white/40 uppercase tracking-wide">
              {t(
                'creator.sandbox.secure',
                'Configuración segura a través de Stripe Connect',
              )}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
