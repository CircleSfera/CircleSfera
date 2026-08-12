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

  // State for interactive simulator
  const [subscribers, setSubscribers] = useState(500);
  const [price, setPrice] = useState(10);

  // 80% revenue share
  const estimatedGross = subscribers * price;
  const estimatedNet = estimatedGross * 0.8;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/80 backdrop-blur-xl p-4 sm:p-6 shadow-xl"
    >
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
        <Sparkles size={160} className="text-brand-primary" />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/15 flex items-center justify-center border border-brand-primary/25 text-brand-primary shrink-0">
            <Calculator size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t(
                'creator.sandbox.title',
                'Simulador de Ingresos (Creator Sandbox)',
              )}
            </h3>
            <p className="text-xs text-gray-400">
              {t(
                'creator.sandbox.description',
                'Calcula tus ingresos estimativos antes de vincular tu cuenta de Stripe.',
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Controls Side (7 cols on desktop) */}
          <div className="lg:col-span-7 bg-white/2 p-4 sm:p-5 rounded-xl border border-white/5 space-y-5 flex flex-col justify-center">
            {/* Fans Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="subscribers"
                  className="flex items-center gap-2 text-xs font-semibold text-gray-300 uppercase tracking-wider"
                >
                  <Users size={14} className="text-brand-primary" />
                  {t('creator.sandbox.fans', 'Fans Suscritos')}
                </label>
                <span className="px-2.5 py-0.5 rounded-lg bg-brand-primary/15 border border-brand-primary/30 text-brand-primary text-sm font-bold font-mono">
                  {subscribers.toLocaleString()}
                </span>
              </div>

              <div className="relative py-1">
                <input
                  id="subscribers"
                  type="range"
                  min="10"
                  max="10000"
                  step="10"
                  value={subscribers}
                  onChange={(e) => setSubscribers(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-primary focus:outline-none"
                  style={{
                    background: `linear-gradient(to right, #8c52ff 0%, #8c52ff ${
                      (subscribers / 10000) * 100
                    }%, #27272a ${(subscribers / 10000) * 100}%, #27272a 100%)`,
                  }}
                />
              </div>

              <div className="flex justify-between text-[11px] font-medium text-gray-500">
                <span>10 fans</span>
                <span>10,000 fans</span>
              </div>
            </div>

            {/* Price Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="price"
                  className="flex items-center gap-2 text-xs font-semibold text-gray-300 uppercase tracking-wider"
                >
                  <Coins size={14} className="text-emerald-400" />
                  {t('creator.sandbox.price', 'Precio de Suscripción')}
                </label>
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-bold font-mono">
                  ${price}/mes
                </span>
              </div>

              <div className="relative py-1">
                <input
                  id="price"
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${
                      (price / 100) * 100
                    }%, #27272a ${(price / 100) * 100}%, #27272a 100%)`,
                  }}
                />
              </div>

              <div className="flex justify-between text-[11px] font-medium text-gray-500">
                <span>$1 / mes</span>
                <span>$100 / mes</span>
              </div>
            </div>
          </div>

          {/* Results Side (5 cols on desktop) */}
          <div className="lg:col-span-5 bg-linear-to-b from-brand-primary/10 via-white/2 to-transparent p-4 sm:p-5 rounded-xl border border-white/10 flex flex-col justify-between space-y-4 relative">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <TrendingUp size={13} className="text-emerald-400" />
                {t('creator.sandbox.estimated', 'Ingreso Neto Estimado')}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wide">
                80% para ti
              </span>
            </div>

            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">
                  $
                  {estimatedNet.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  USD / mes
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/8 text-[11px]">
                <div>
                  <p className="text-gray-500 font-medium">Ingreso Bruto</p>
                  <p className="text-gray-300 font-bold font-mono">
                    ${estimatedGross.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Tarifa Plataforma</p>
                  <p className="text-gray-400 font-bold">20%</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isConnecting}
              onClick={onConnect}
              className="w-full min-h-11 px-4 rounded-xl bg-brand-primary text-white font-bold text-xs uppercase tracking-wider hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/20 disabled:opacity-50 group"
            >
              {isConnecting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <Wallet size={16} />
                  <span>{t('creator.sandbox.connect', 'Conectar Stripe')}</span>
                  <ArrowRight
                    size={15}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
