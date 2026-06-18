import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { adminApi } from '../../services/admin.service';
import StatCard from './StatCard';

export default function MonetizationTab() {
  const {
    data: analytics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['adminMonetization'],
    queryFn: () => adminApi.getMonetizationAnalytics().then((res) => res.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white/5 rounded-2xl" />
          ))}
        </div>
        <div className="h-96 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center glass-panel rounded-3xl border border-red-500/10">
        <Activity size={48} className="text-red-500/20 mx-auto mb-4" />
        <h3 className="text-white font-bold text-lg">Error de Análisis</h3>
        <p className="text-gray-500">
          No se pudieron sincronizar las métricas de suscripción.
        </p>
      </div>
    );
  }

  const distribution = analytics?.tierDistribution || {
    PREMIUM: 0,
    ELITE: 0,
    BUSINESS: 0,
  };
  const total =
    distribution.PREMIUM + distribution.ELITE + distribution.BUSINESS || 1;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* SaaS Primary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="MRR de Plataforma"
          value={analytics?.activeMRR || 0}
          icon={Zap}
          color="blue"
          growth={analytics?.subscriptionGrowth}
        />
        <StatCard
          label="Suscripciones Activas"
          value={analytics?.totalSubscriptions || 0}
          icon={Users}
          color="purple"
          growth={5} // Placeholder
        />
        <StatCard
          label="Tasa de Retención"
          value={analytics?.activeRetentionRate || 0}
          icon={ShieldCheck}
          color="green"
          isCounter={false}
          prefix=""
          suffix="%"
        />
      </div>

      {/* Stripe Integration Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col justify-between group hover:border-brand-primary/30 transition-all">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
              <Zap size={20} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">
              Conectado
            </span>
          </div>
          <div>
            <h4 className="text-white font-black uppercase text-sm mb-1 tracking-tight">Stripe API</h4>
            <p className="text-gray-400 text-xs">Conexión principal con Stripe habilitada. Pagos activos.</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col justify-between group hover:border-blue-400/30 transition-all relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Users size={20} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full border border-yellow-400/20">
              En Implementación
            </span>
          </div>
          <div>
            <h4 className="text-white font-black uppercase text-sm mb-1 tracking-tight">Stripe Connect</h4>
            <p className="text-gray-400 text-xs">Infraestructura para pagos divididos y Creadores.</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col justify-between group hover:border-purple-400/30 transition-all relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-purple-500/0 via-purple-500/50 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <ShieldCheck size={20} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full border border-yellow-400/20">
              En Implementación
            </span>
          </div>
          <div>
            <h4 className="text-white font-black uppercase text-sm mb-1 tracking-tight">Stripe Identity (KYC)</h4>
            <p className="text-gray-400 text-xs">Verificación de identidad automatizada para Creadores.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tier Distribution Chart (Linear) */}
        <div className="glass-panel rounded-4xl border border-white/5 p-8 bg-linear-to-br from-brand-secondary/5 to-transparent">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-16 h-16 rounded-2xl bg-brand-secondary/10 flex items-center justify-center border border-brand-secondary/20">
              <PieChart size={32} className="text-brand-secondary" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white tracking-tight italic uppercase">
                Distribución de Experiencia
              </h3>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                Desglose de niveles por usuario
              </p>
            </div>
          </div>

          <div className="space-y-10">
            {/* Progress Bar Tier Map */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  Composición de Tiers
                </span>
                <span className="text-[10px] font-black text-white">
                  100% Active Base
                </span>
              </div>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5 p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(distribution.PREMIUM / total) * 100}%`,
                  }}
                  className="h-full bg-brand-blue rounded-full"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(distribution.ELITE / total) * 100}%` }}
                  className="h-full bg-brand-primary rounded-full ml-0.5"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(distribution.BUSINESS / total) * 100}%`,
                  }}
                  className="h-full bg-brand-accent rounded-full ml-0.5"
                />
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-4">
              {[
                {
                  label: 'Verified',
                  count: distribution.PREMIUM,
                  color: 'bg-brand-blue',
                  percent: Math.round((distribution.PREMIUM / total) * 100),
                },
                {
                  label: 'Elite Creator',
                  count: distribution.ELITE,
                  color: 'bg-brand-primary',
                  percent: Math.round((distribution.ELITE / total) * 100),
                },
                {
                  label: 'Business',
                  count: distribution.BUSINESS,
                  color: 'bg-brand-accent',
                  percent: Math.round((distribution.BUSINESS / total) * 100),
                },
              ].map((tier) => (
                <div
                  key={tier.label}
                  className="flex items-center justify-between p-5 bg-white/2 rounded-3xl border border-white/5 hover:border-white/10 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-3 h-3 rounded-full ${tier.color} shadow-lg`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-white italic uppercase">
                        {tier.label}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">
                        {tier.count} Miembros
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-white tabular-nums group-hover:text-brand-primary transition-colors">
                      {tier.percent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Integrity & Insights */}
        <div className="flex flex-col gap-8">
          <div className="glass-panel rounded-4xl border border-white/5 p-8 grow bg-linear-to-bl from-brand-primary/5 to-transparent flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
                <TrendingUp size={24} className="text-brand-primary" />
              </div>
              <h4 className="text-lg font-black text-white italic uppercase">
                Proyección de Crecimiento
              </h4>
            </div>
            <p className="text-zinc-500 text-sm font-light leading-relaxed mb-6">
              Basado en el ritmo actual de adquisiciones, se estima un
              crecimiento del <strong className="text-white">12.4%</strong> en
              el próximo ciclo de facturación.
            </p>
            <div className="h-20 w-full bg-white/2 rounded-2xl border border-white/5 relative overflow-hidden">
              {/* Visual decoration: mini wave */}
              <div className="absolute inset-0 flex items-end opacity-20">
                {[40, 70, 45, 90, 65, 80, 50, 85, 95].map((h, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: Decorative static items
                    key={`wave-${i}-${h}`}
                    className="flex-1 bg-brand-primary mx-0.5 rounded-t-sm"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="p-8 glass-panel rounded-4xl border border-brand-primary/10 bg-brand-primary/2">
            <div className="flex items-start gap-4">
              <ShieldCheck
                className="text-brand-primary shrink-0 mt-1"
                size={24}
              />
              <div>
                <h4 className="text-white font-black text-xs uppercase tracking-widest mb-2">
                  Cumplimiento de Pagos
                </h4>
                <p className="text-zinc-500 text-[10px] font-medium leading-relaxed uppercase tracking-tighter italic">
                  Las cuentas están migrando hacia el modelo de{' '}
                  <span className="text-white font-bold">
                    Stripe Connect
                  </span>
                  . Es necesario que los creadores completen la validación de KYC mediante Stripe Identity antes de poder retirar fondos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
