import { Check, Sparkles, Star, Zap } from 'lucide-react';
import { useEffect } from 'react';
import SharedFooter from '../components/SharedFooter';
import SharedNav from '../components/SharedNav';
import { useLanguage } from '../hooks/useLanguage';

const PricingPage = () => {
  const { t } = useLanguage();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
      return 'hover:shadow-[0_0_40px_rgba(168,85,247,0.2)] border-purple-500/20 hover:border-purple-500/50 scale-[1.02] md:scale-105 z-10 bg-linear-to-b from-white/5 to-purple-500/5';
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

  // Hardcoded prices to match DB
  const prices = {
    premium: 9.99,
    elite: 19.99,
    business: 49.99,
  };

  return (
    <div className="min-h-screen relative overflow-hidden text-white font-sans selection:bg-brand-primary/30">
      {/* Background */}
      <div className="fixed inset-0 z-[-1] bg-[#030303]">
        <div className="mesh-gradient-bg opacity-100" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 brightness-100 contrast-150 pointer-events-none mix-blend-overlay"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-brand-primary/20 rounded-full blur-[120px] animate-blob filter mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-brand-blue/20 rounded-full blur-[120px] animate-blob animation-delay-2000 filter mix-blend-screen"></div>
      </div>

      <SharedNav />

      {/* Hero */}
      <header className="max-w-4xl mx-auto px-6 pt-28 pb-10 md:pt-32 md:pb-16 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border border-white/10 mb-6 animate-float shadow-lg">
          <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
          <span className="text-[10px] font-black tracking-[0.3em] uppercase text-brand-primary">
            {t.pricing.label}
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tighter mb-5 leading-[0.85] drop-shadow-2xl">
          {t.pricing.title}
        </h1>
        <p className="max-w-xl mx-auto text-sm md:text-base text-white/30 leading-relaxed font-light italic">
          {t.pricing.subtitle}
        </p>
      </header>

      {/* Pricing Cards */}
      <section className="max-w-6xl mx-auto px-6 pb-24 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10 items-start w-full mx-auto">
          {['premium', 'elite', 'business'].map((planKey) => {
            const plan = t.pricing.plans[planKey as keyof typeof t.pricing.plans];
            const price = prices[planKey as keyof typeof prices];
            const isElite = planKey === 'elite';

            return (
              <div
                key={planKey}
                className={`relative flex flex-col p-6 lg:p-8 rounded-3xl bg-black/40 backdrop-blur-xl border transition-all duration-500 ${getPlanGlow(plan.name)}`}
              >
                {isElite && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-linear-to-r from-purple-500 to-blue-500 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
                    {t.pricing.popularBadge}
                  </div>
                )}

                <div className="mb-6">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    {getPlanIcon(plan.name)}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1 tracking-tight">
                    {plan.name}
                  </h3>
                  <div className="flex items-end gap-1 mb-3">
                    <span className="text-3xl font-black text-white">
                      €{price}
                    </span>
                    <span className="text-white/40 text-sm font-medium pb-1">
                      {t.pricing.perMonth}
                    </span>
                  </div>
                  <p className="text-sm text-white/40 leading-relaxed min-h-[40px] font-light italic">
                    {plan.description}
                  </p>
                </div>

                <div className="space-y-3 flex-1 mb-8">
                  {plan.features.map((feature: string) => (
                    <div key={feature} className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                      <span className="text-xs text-white/60 leading-relaxed font-light">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                <a
                  href="/#whitelist"
                  className={`w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all text-center block ${getButtonColor(plan.name)}`}
                >
                  {t.pricing.subscribeBtn}
                </a>
              </div>
            );
          })}
        </div>
      </section>

      <SharedFooter />
    </div>
  );
};

export default PricingPage;
