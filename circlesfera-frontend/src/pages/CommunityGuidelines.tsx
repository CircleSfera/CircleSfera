import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  Gavel,
  Heart,
  MessageCircle,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/logo.png';
import SEO from '../components/common/SEO';
import { useAuthStore } from '../stores/authStore';

export default function CommunityGuidelines() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const sections = [
    {
      id: 'overview',
      title: t('legal.community.sections.s1_title'),
      icon: Star,
      content: t('legal.community.sections.s1_content'),
      color: 'brand-primary',
    },
    {
      id: 'respect',
      title: t('legal.community.sections.s2_title'),
      icon: Heart,
      content: t('legal.community.sections.s2_content'),
      color: 'brand-secondary',
    },
    {
      id: 'content',
      title: t('legal.community.sections.s3_title'),
      icon: Eye,
      content: t('legal.community.sections.s3_content'),
      color: 'brand-blue',
    },
    {
      id: 'spam',
      title: t('legal.community.sections.s4_title'),
      icon: AlertTriangle,
      content: t('legal.community.sections.s4_content'),
      color: 'brand-accent',
    },
    {
      id: 'monetization',
      title: t('legal.community.sections.s5_title'),
      icon: MessageCircle,
      content: t('legal.community.sections.s5_content'),
      color: 'emerald-500',
    },
  ];

  const scrollTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white pt-24 pb-24 px-6 font-sans relative overflow-hidden selection:bg-brand-primary/30">
      <SEO title={t('legal.community.title')} />

      {/* Background is now handled globally by LayoutWrapper */}

      {/* Guest Navigation (Only if not logged in) */}
      {!isAuthenticated && (
        <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5 px-6 py-3 flex justify-between items-center backdrop-blur-xl bg-black/20">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={logoSrc}
              alt="CircleSfera"
              className="h-8 w-auto object-contain"
            />
            <span className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
              CircleSfera
            </span>
          </Link>
          <div className="flex items-center gap-5">
            <Link
              to="/accounts/login"
              className="text-xs font-semibold text-white/70 hover:text-white transition-colors tracking-wide uppercase"
            >
              {t('legal.nav.log_in')}
            </Link>
            <Link
              to="/accounts/emailsignup"
              className="px-5 py-2 text-xs font-bold bg-white text-black rounded-full hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
              {t('legal.nav.sign_up')}
            </Link>
          </div>
        </nav>
      )}

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Sticky Navigation Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-28 space-y-6">
              <div>
                <span className="text-brand-primary font-black text-[9px] tracking-[0.3em] uppercase mb-3 block">
                  {t('legal.badges.community_hub')}
                </span>
                <h1 className="text-3xl font-black tracking-tighter italic uppercase leading-tight">
                  {t('legal.community.header_title')}
                </h1>
              </div>

              <nav className="space-y-0.5">
                {sections.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    onClick={() => scrollTo(section.id)}
                    className="flex items-center gap-2.5 w-full p-3 rounded-xl hover:bg-white/5 transition-all group text-left border border-transparent hover:border-white/5"
                  >
                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                      <section.icon
                        size={14}
                        className="text-zinc-500 group-hover:text-white transition-colors"
                      />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-white transition-colors">
                      {section.title.split('. ')[1]}
                    </span>
                    <ChevronRight
                      size={12}
                      className="ml-auto opacity-0 group-hover:opacity-40 transition-opacity"
                    />
                  </button>
                ))}
              </nav>

              <div className="p-5 glass-panel rounded-2xl border border-white/5 bg-white/1">
                <Gavel className="text-brand-primary mb-2" size={20} />
                <p className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest leading-relaxed italic">
                  Mantener CircleSfera como un espacio seguro y premium es
                  responsabilidad de todos. No toleramos comportamientos que
                  degraden la experiencia de nuestra comunidad.
                </p>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 max-w-2xl">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              {/* Mobile Header (Hidden on LG) */}
              <div className="lg:hidden mb-8 text-center pt-8">
                <span className="text-brand-primary font-black text-[9px] tracking-[0.3em] uppercase mb-3 block">
                  {t('legal.badges.community_hub')}
                </span>
                <h1 className="text-4xl font-black tracking-tighter italic uppercase leading-tight">
                  {t('legal.community.header_title')}
                </h1>
              </div>

              {sections.map((section, index) => (
                <motion.section
                  id={section.id}
                  key={section.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10% 0px' }}
                  transition={{ delay: index * 0.05, duration: 0.5 }}
                  className="glass-panel p-6 md:p-8 rounded-4xl border border-white/5 relative group hover:border-white/10 transition-all overflow-hidden"
                >
                  <div
                    className={`absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none`}
                  >
                    <section.icon size={90} />
                  </div>

                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div
                        className={`w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shadow-lg`}
                      >
                        <section.icon
                          size={20}
                          className={`text-${section.color}`}
                        />
                      </div>
                      <h2 className="text-lg md:text-xl font-black text-white italic uppercase tracking-tight">
                        {section.title}
                      </h2>
                    </div>

                    <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-light">
                      {section.content}
                    </p>
                  </div>
                </motion.section>
              ))}

              <div className="pt-16 border-t border-white/5 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center mb-4">
                  <ShieldCheck
                    size={16}
                    className="text-brand-primary opacity-50"
                  />
                </div>
                <p className="text-zinc-500 text-[8px] uppercase font-black tracking-[0.2em] text-center italic">
                  Last Updated: April 2026 • Premium Environment • CircleSfera
                  Trust & Safety
                </p>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
