import { motion } from 'framer-motion';
import {
  Compass,
  Eye,
  Image as ImageIcon,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { useAuthStore } from '../stores/authStore';

export default function ExploreLanding() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const features = [
    {
      icon: <ImageIcon size={20} />,
      title: t('explore.landing.feat1_title'),
      description: t('explore.landing.feat1_desc'),
      color: 'from-brand-blue to-blue-600',
    },
    {
      icon: <Sparkles size={20} />,
      title: t('explore.landing.feat2_title'),
      description: t('explore.landing.feat2_desc'),
      color: 'from-brand-primary to-purple-600',
    },
    {
      icon: <Eye size={20} />,
      title: t('explore.landing.feat3_title'),
      description: t('explore.landing.feat3_desc'),
      color: 'from-brand-secondary to-pink-600',
    },
    {
      icon: <Zap size={20} />,
      title: t('explore.landing.feat4_title'),
      description: t('explore.landing.feat4_desc'),
      color: 'from-brand-accent to-orange-500',
    },
  ];

  return (
    <div
      className={`min-h-dvh flex flex-col relative overflow-hidden bg-surface-base text-white font-sans selection:bg-brand-primary/30 ${!isAuthenticated ? 'pt-24' : ''}`}
    >
      <SEO
        title={t('explore.landing.title')}
        description={t('explore.landing.desc')}
      />

      {/* Background is now handled globally by LayoutWrapper */}

      <main className="flex-1 max-w-4xl mx-auto px-6 w-full flex flex-col items-center pb-24">
        {/* Hero Section */}
        <section className="w-full pt-12 md:pt-20 pb-16 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-white/10 mb-8 shadow-lg"
          >
            <Compass size={16} className="text-brand-primary" />
            <span className="text-xs font-bold uppercase tracking-wide text-white/80">
              {t('explore.landing.the_platform')}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl md:text-2xl lg:text-3xl font-black tracking-tighter mb-5 leading-tight"
          >
            {t('explore.landing.discover_new')}{' '}
            <br className="hidden md:block" />
            <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue">
              {t('explore.landing.dimension')}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm md:text-base text-white/50 max-w-lg mx-auto font-light leading-relaxed mb-10"
          >
            {t('explore.landing.intro_text')}
          </motion.p>
        </section>

        {/* Features Grid */}
        <section className="w-full py-16 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="glass-panel p-4 md:p-6 rounded-lg border border-white/5 hover:border-white/10 transition-all duration-500 group relative overflow-hidden"
              >
                {/* Subtle gradient hover effect */}
                <div
                  className={`absolute inset-0 bg-linear-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}
                ></div>

                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-linear-to-br ${feature.color} text-white shadow-lg shadow-black/20 group-hover:scale-110 transition-transform duration-500`}
                >
                  {feature.icon}
                </div>

                <h3 className="text-lg font-black tracking-tight mb-2 text-white">
                  {feature.title}
                </h3>

                <p className="text-white/40 text-sm font-light leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Global Network Section */}
        <section className="w-full py-20 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="glass-panel rounded-xl p-8 border border-white/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-brand-primary/10 via-transparent to-transparent opacity-50"></div>

            <div className="relative z-10 max-w-2xl mx-auto">
              <div className="w-14 h-14 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10 shadow-2xl">
                <Users size={24} className="text-brand-secondary" />
              </div>

              <h2 className="text-2xl md:text-xl font-black tracking-tighter mb-4">
                {t('explore.landing.join_title')}
              </h2>

              <p className="text-white/40 mb-8 text-sm max-w-md mx-auto">
                {t('explore.landing.join_desc')}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/accounts/emailsignup"
                  className="px-5 py-2 bg-white text-black font-black text-xs uppercase tracking-wide rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                >
                  {t('explore.landing.create_account')}
                </Link>
                <Link
                  to="/pricing"
                  className="px-5 py-2 glass-panel text-white font-bold text-xs uppercase tracking-wide rounded-full hover:bg-white/10 transition-all border border-white/10"
                >
                  {t('explore.landing.view_monetization')}
                </Link>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer will be automatically handled by layout if we do this right, but for Landing/Privacy it has the standard footer. 
          We'll add the standard footer manually since this acts as a landing page. */}
      <footer className="py-14 border-t border-white/5 bg-black text-sm relative mt-auto z-10">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 text-white/40 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="font-black text-lg text-white/80 tracking-tight">
                CircleSfera
              </span>
            </div>
            <p className="max-w-xs leading-relaxed text-sm">
              {t('common.footer.desc')}
            </p>
          </div>
          <div>
            <h4 className="text-white/80 font-bold uppercase tracking-wide text-xs mb-5">
              {t('common.footer.platform')}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/explore"
                  className="hover:text-white transition-colors"
                >
                  {t('common.footer.explore')}
                </Link>
              </li>
              <li>
                <Link
                  to="/pricing"
                  className="hover:text-white transition-colors"
                >
                  {t('common.footer.pricing')}
                </Link>
              </li>
              <li>
                <Link
                  to="/accounts/login"
                  className="hover:text-white transition-colors"
                >
                  {t('common.footer.login')}
                </Link>
              </li>
              <li>
                <Link
                  to="/accounts/emailsignup"
                  className="hover:text-white transition-colors"
                >
                  {t('common.footer.signup')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white/80 font-bold uppercase tracking-wide text-xs mb-5">
              {t('common.footer.legal')}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/privacy"
                  className="hover:text-white transition-colors"
                >
                  {t('common.footer.privacy')}
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="hover:text-white transition-colors"
                >
                  {t('common.footer.terms')}
                </Link>
              </li>
              <li>
                <Link
                  to="/guidelines"
                  className="hover:text-white transition-colors text-left"
                >
                  {t('common.footer.guidelines')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-xs opacity-50">
          <p>{t('common.footer.copyright')}</p>
          <p className="mt-3 md:mt-0">{t('common.footer.designed_for')}</p>
        </div>
      </footer>
    </div>
  );
}
