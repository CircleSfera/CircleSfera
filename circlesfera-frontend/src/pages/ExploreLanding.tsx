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
import { MarketingPage } from '../components/marketing';

export default function ExploreLanding() {
  const { t } = useTranslation();

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
    <MarketingPage atmosphere>
      <SEO
        title={t('explore.landing.title')}
        description={t('explore.landing.desc')}
      />

      <main className="flex-1 max-w-5xl mx-auto px-6 w-full flex flex-col items-center pb-20">
        <section className="w-full pt-12 md:pt-20 pb-12 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md"
          >
            <Compass size={14} className="text-brand-primary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">
              {t('explore.landing.the_platform')}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-6 leading-tight"
          >
            {t('explore.landing.discover_new')}{' '}
            <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue">
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

        <section className="w-full py-12 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="bg-white/5 p-6 md:p-8 rounded-3xl border border-white/10 hover:border-white/20 transition-all duration-500 group relative overflow-hidden backdrop-blur-3xl"
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 bg-linear-to-br ${feature.color} text-white shadow-lg shadow-black/20 group-hover:scale-110 transition-transform duration-500`}
                >
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-3 text-white">
                  {feature.title}
                </h3>
                <p className="text-white/50 text-sm md:text-base font-medium leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="w-full py-20 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="bg-white/5 rounded-3xl p-8 md:p-12 border border-white/10 relative overflow-hidden backdrop-blur-3xl"
          >
            <div className="relative z-10 max-w-2xl mx-auto">
              <div className="w-16 h-16 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                <Users size={28} className="text-white/80" />
              </div>

              <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-4">
                {t('explore.landing.join_title')}
              </h2>

              <p className="text-white/50 mb-10 text-sm md:text-base max-w-md mx-auto">
                {t('explore.landing.join_desc')}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/accounts/emailsignup"
                  className="flex items-center justify-center h-12 w-full sm:w-auto px-8 bg-white text-black font-black text-[13px] uppercase tracking-wide rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10"
                >
                  {t('explore.landing.create_account')}
                </Link>
                <Link
                  to="/pricing"
                  className="flex items-center justify-center h-12 w-full sm:w-auto px-8 bg-transparent text-white font-bold text-[13px] uppercase tracking-wide rounded-full hover:bg-white/10 transition-all border border-white/20"
                >
                  {t('explore.landing.view_monetization')}
                </Link>
              </div>
            </div>
          </motion.div>
        </section>
      </main>
    </MarketingPage>
  );
}
