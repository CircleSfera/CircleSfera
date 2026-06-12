import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { paymentsApi } from '../../services/payments.service';
import { useAuthStore } from '../../stores/authStore';

export default function Pricing() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleTierClick = async (tierName: string) => {
    if (!isAuthenticated) {
      navigate('/accounts/emailsignup');
      return;
    }

    try {
      setLoadingTier(tierName);
      // Map tier names to plan IDs (from seed)
      const planMap: Record<string, string> = {
        Premium: 'prod_premium',
        'Elite Creator': 'prod_elite',
        Business: 'prod_business',
      };

      const response = await paymentsApi.createSubscriptionCheckout(
        planMap[tierName] || 'prod_premium',
      );
      if (response.url) {
        window.location.href = response.url;
      }
    } catch {
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoadingTier(null);
    }
  };

  const tiers = [
    {
      name: 'Verified',
      price: '9.99',
      description: 'Elevate your identity and presence.',
      features: [
        'Verified Badge',
        'Basic Analytics',
        'Priority Support',
        'Ad-free experience',
        'Custom themes',
      ],
      buttonText: 'Upgrade Experience',
      popular: false,
      color: 'from-brand-blue to-brand-secondary',
    },
    {
      name: 'Elite Creator',
      price: '19.99',
      description: 'Professional tools for growing creators.',
      features: [
        'Everything in Verified',
        'Pro Growth Tools',
        'Advanced Audience Insights',
        'Early Access to features',
        'Profile Spotlight',
      ],
      buttonText: 'Become Elite',
      popular: true,
      color: 'from-brand-primary via-brand-secondary to-brand-accent',
    },
    {
      name: 'Business',
      price: '49.99',
      description: 'Maximum impact for brands and teams.',
      features: [
        'Everything in Elite',
        'Business Verification',
        'Multi-account management',
        'Dedicated 24/7 Support',
        'API Access (Beta)',
      ],
      buttonText: 'Start Business',
      popular: false,
      color: 'from-brand-accent to-white/10',
    },
  ];

  return (
    <div className="pt-16 md:pt-24 pb-24 relative overflow-hidden flex flex-col items-center">
      <div className="w-full max-w-6xl px-4 md:px-6 relative z-10">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-brand-primary mb-4"
          >
            <Sparkles size={14} />
            Pricing Plans
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-black tracking-tighter mb-6 text-white"
          >
            Choose your{' '}
            <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary to-brand-primary">
              Experience
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/40 max-w-lg mx-auto font-light"
          >
            Select the plan that fits your creative needs. From individual creators to global brands.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {tiers.map((tier, index) => (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              key={tier.name}
              className={`glass-panel rounded-3xl p-8 border transition-all duration-500 flex flex-col relative group hover:-translate-y-2 ${
                tier.popular
                  ? 'border-brand-primary/40 bg-white/5 ring-1 ring-brand-primary/20 scale-105 z-20'
                  : 'border-white/5 hover:border-white/10'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-brand-primary rounded-full text-[10px] font-black tracking-widest uppercase shadow-xl shadow-brand-primary/20 text-white">
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-black tracking-tight mb-2 text-white">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">€{tier.price}</span>
                  <span className="text-white/30 text-sm">/month</span>
                </div>
                <p className="text-white/40 text-sm mt-4 font-light italic leading-relaxed">
                  "{tier.description}"
                </p>
              </div>

              <div className="space-y-4 mb-10 grow">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-brand-primary/20 transition-colors">
                      <Check className="w-3 h-3 text-brand-primary" />
                    </div>
                    <span className="text-sm text-white/60 font-medium tracking-tight">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleTierClick(tier.name)}
                disabled={loadingTier !== null}
                className={`w-full py-4 rounded-2xl font-black text-sm tracking-tighter transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 ${
                  tier.popular
                    ? 'bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue text-white shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/40'
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20'
                }`}
              >
                {loadingTier === tier.name ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  tier.buttonText
                )}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Background Accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-primary/5 rounded-full blur-[150px] pointer-events-none"></div>
    </div>
  );
}
