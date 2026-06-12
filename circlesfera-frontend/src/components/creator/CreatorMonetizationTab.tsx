import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Award,
  CheckCircle2,
  Loader2,
  Shield,
  Star,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { paymentsApi } from '../../services/payments.service';
import { useAuthStore } from '../../stores/authStore';
import type { PlatformPlanDto } from '../../types';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CreatorMonetizationTab({ onToast }: Props) {
  const { profile } = useAuthStore();
  const user = profile?.user;

  const currentLevel = user?.verificationLevel || 'BASIC';

  const { data: plans, isLoading } = useQuery<PlatformPlanDto[]>({
    queryKey: ['platform-plans'],
    queryFn: paymentsApi.getPlans,
  });

  const checkoutMutation = useMutation({
    mutationFn: (planId: string) =>
      paymentsApi.createSubscriptionCheckout(planId),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: Error) => {
      onToast(err.message || 'Error al iniciar el pago', 'error');
    },
  });

  const portalMutation = useMutation({
    mutationFn: paymentsApi.getBillingPortalUrl,
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: Error) => {
      onToast(err.message || 'Error al acceder al portal', 'error');
    },
  });

  const getTierIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('premium')) return <Star className="text-brand-blue" />;
    if (lower.includes('elite'))
      return <Award className="text-brand-primary" />;
    if (lower.includes('business'))
      return <Shield className="text-brand-accent" />;
    return <Zap className="text-brand-primary" />;
  };

  const isTierActive = (planName: string) => {
    const lower = planName.toLowerCase();
    if (lower.includes('premium')) return currentLevel === 'VERIFIED';
    if (lower.includes('elite')) return currentLevel === 'ELITE';
    if (lower.includes('business')) return currentLevel === 'BUSINESS';
    return false;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-brand-primary" size={40} />
        <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
          Cargando planes...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 glass-panel rounded-2xl border border-white/5 bg-linear-to-br from-brand-primary/10 via-transparent to-transparent relative overflow-hidden"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
              <Zap size={20} className="text-brand-primary" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] italic">
              Estatus de Suscripción
            </h3>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">
                Plan Actual
              </p>
              <h2 className="text-3xl font-bold text-white tracking-tight uppercase">
                {currentLevel === 'BASIC' ? 'Free Experience' : currentLevel}
              </h2>
            </div>
            <button
              type="button"
              disabled={portalMutation.isPending}
              onClick={() => {
                if (currentLevel === 'BASIC') {
                  onToast('Selecciona un plan abajo para comenzar.', 'success');
                } else {
                  portalMutation.mutate();
                }
              }}
              className="px-8 py-4 bg-white text-black font-black rounded-2xl text-xs uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-50"
            >
              {portalMutation.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                'Gestionar Suscripción'
              )}
            </button>
          </div>
        </div>

        <div className="absolute top-0 right-0 p-10 opacity-5">
          <Zap size={200} className="text-brand-primary" />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans?.map((plan) => {
          const displayName = plan.name === 'Premium' ? 'Verified' : plan.name;
          const active = isTierActive(plan.name);
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`p-6 glass-panel rounded-2xl border ${
                active
                  ? 'border-brand-primary/40 bg-brand-primary/5 shadow-xl shadow-brand-primary/10'
                  : 'border-white/5 hover:border-white/20 hover:bg-white/5'
              } transition-all group flex flex-col`}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                  {getTierIcon(plan.name)}
                </div>
                {active && (
                  <span className="px-3 py-1 rounded-full bg-brand-primary text-[8px] font-black uppercase tracking-widest text-white shadow-lg shadow-brand-primary/20">
                    Activo
                  </span>
                )}
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-bold text-white mb-1 tracking-tight">
                  {displayName}
                </h4>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white tracking-tighter">
                    {plan.price}
                    {plan.currency === 'EUR' ? '€' : plan.currency}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                    / {plan.interval === 'month' ? 'mes' : 'año'}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature: string) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wide"
                  >
                    <CheckCircle2 size={14} className="text-brand-primary" />
                    {feature.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>

              {!active && (
                <button
                  type="button"
                  disabled={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate(plan.id)}
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all disabled:opacity-50"
                >
                  {checkoutMutation.isPending ? (
                    <Loader2 className="animate-spin mx-auto" size={14} />
                  ) : (
                    'Upgrade Now'
                  )}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-6 glass-panel rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <TrendingUp size={20} className="text-indigo-400" />
            </div>
            <h3 className="text-white font-black uppercase text-xs tracking-widest">
              Analíticas de Crecimiento
            </h3>
          </div>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed italic">
            Descubre patrones de interacción y optimiza tu alcance con nuestras
            herramientas de IA propietarias.
          </p>
        </div>

        <div className="p-6 glass-panel rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Users size={20} className="text-emerald-400" />
            </div>
            <h3 className="text-white font-black uppercase text-xs tracking-widest">
              Comunidad VIP
            </h3>
          </div>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed italic">
            Acceso exclusivo a círculos de otros creadores certificados y
            prioridad en el descubrimiento global.
          </p>
        </div>
      </div>
    </div>
  );
}
