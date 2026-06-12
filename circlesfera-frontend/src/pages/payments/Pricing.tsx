import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles, Star, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { paymentsApi } from '../../services/payments.service';
import { useAuthStore } from '../../stores/authStore';

const formatFeature = (feature: string) => {
  if (!feature) return '';
  const text = feature.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export default function Pricing() {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  // Load plans from backend
  const { data, isLoading, isError } = useQuery({
    queryKey: ['platformPlans'],
    queryFn: () => paymentsApi.getPlans(),
  });

  // React Query data is directly the array of plans because paymentsApi returns response.data
  const plans = Array.isArray(data) ? data : data?.data || [];

  const handleSubscribe = async (planId: string) => {
    if (!isAuthenticated) {
      toast.error('Inicia sesión para poder suscribirte.');
      navigate('/login');
      return;
    }

    try {
      setIsProcessing(planId);
      const response = await paymentsApi.createSubscriptionCheckout(planId);
      if (response?.url) {
        window.location.href = response.url;
      }
    } catch (error) {
      console.error(error);
      toast.error(
        'Ocurrió un error al procesar tu solicitud. Inténtalo de nuevo.',
      );
    } finally {
      setIsProcessing(null);
    }
  };

  const getPlanIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('business'))
      return <Zap className="text-blue-400" size={20} />;
    if (lower.includes('elite'))
      return <Star className="text-purple-400" size={20} />;
    return <Sparkles className="text-amber-400" size={20} />;
  };

  const getPlanGlow = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('business'))
      return 'hover:shadow-[0_0_40px_rgba(59,130,246,0.2)] border-blue-500/20 hover:border-blue-500/50';
    if (lower.includes('elite'))
      return 'hover:shadow-[0_0_40px_rgba(168,85,247,0.2)] border-purple-500/20 hover:border-purple-500/50 scale-105 z-10 bg-gradient-to-b from-white/5 to-purple-500/5';
    return 'hover:shadow-[0_0_40px_rgba(251,191,36,0.2)] border-amber-500/20 hover:border-amber-500/50';
  };

  const getButtonColor = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('business'))
      return 'bg-blue-500 hover:bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]';
    if (lower.includes('elite'))
      return 'bg-purple-500 hover:bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]';
    return 'bg-amber-500 hover:bg-amber-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.5)]';
  };

  return (
    <div className="pt-16 md:pt-24 pb-24 relative overflow-hidden flex flex-col items-center">
      {/* Background gradients removed to match project style */}

      <div className="w-full max-w-5xl px-4 md:px-8 relative z-10">
        <div className="text-center space-y-4 mb-16 md:mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-blue-400 mb-4"
          >
            <Sparkles size={14} />
            Desbloquea tu potencial
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-3xl font-black text-white tracking-tighter"
          >
            Suscripciones CircleSfera
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed"
          >
            Mejora tu visibilidad, accede a herramientas profesionales y
            construye tu audiencia con los planes exclusivos para creadores y
            marcas.
          </motion.p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-purple-500" size={48} />
          </div>
        ) : isError || !plans.length ? (
          <div className="text-center p-12 bg-white/5 border border-white/10 rounded-3xl max-w-2xl mx-auto">
            <p className="text-gray-400 text-lg">
              No se pudieron cargar los planes de suscripción en este momento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10 items-start w-full mx-auto">
            {plans.map((plan: any, index: number) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className={`relative flex flex-col p-6 lg:p-8 rounded-3xl bg-zinc-950/80 backdrop-blur-xl border transition-all duration-500 ${getPlanGlow(plan.name)}`}
              >
                {plan.name.toLowerCase().includes('elite') && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-linear-to-r from-purple-500 to-blue-500 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
                    Más Popular
                  </div>
                )}

                <div className="mb-6">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    {getPlanIcon(plan.name)}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {plan.name}
                  </h3>
                  <div className="flex items-end gap-1 mb-3">
                    <span className="text-2xl font-black text-white">
                      {plan.price}€
                    </span>
                    <span className="text-gray-400 text-sm font-medium pb-0.5">
                      / mes
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed min-h-[32px]">
                    {plan.description || 'Eleva tu presencia en la plataforma.'}
                  </p>
                </div>

                <div className="space-y-3 flex-1 mb-6">
                  {plan.features?.map((feature: string) => (
                    <div key={feature} className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                      <span className="text-xs text-gray-300 leading-relaxed">
                        {formatFeature(feature)}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isProcessing === plan.id}
                  className={`w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${getButtonColor(plan.name)} disabled:opacity-50 disabled:grayscale`}
                >
                  {isProcessing === plan.id ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 size={18} className="animate-spin" />
                      <span>Procesando...</span>
                    </div>
                  ) : (
                    'Comenzar Ahora'
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
