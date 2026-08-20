import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/logo.png';
import SEO from '../components/common/SEO';
import { BentoFeatures } from '../components/landing/BentoFeatures';
import { HeroSection } from '../components/landing/HeroSection';
import { PublicFooter } from '../components/landing/PublicFooter';

const LandingPage = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh relative overflow-hidden bg-[#030303] text-white font-sans selection:bg-brand-primary/30 flex flex-col justify-between">
      <SEO
        title={t('landing.seo.title')}
        description={t('landing.seo.description')}
      />

      <div className="w-full flex-1 flex flex-col relative z-10">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 px-5 md:px-8 h-14 md:h-16 flex justify-between items-center bg-[#030303]/80 backdrop-blur-xl border-b border-white/5">
          <div className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="CircleSfera"
              className="h-7 md:h-8 w-auto object-contain"
            />
            <span className="text-lg font-black tracking-tight text-white">
              CircleSfera
            </span>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <Link
              to="/accounts/login"
              className="text-[13px] font-bold text-white/70 hover:text-white transition-colors tracking-wide uppercase"
            >
              {t('landing.nav.log_in', 'Log In')}
            </Link>
            <Link
              to="/accounts/emailsignup"
              className="flex items-center justify-center h-10 md:h-11 px-6 text-[12px] font-bold bg-white text-black rounded-full hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)] uppercase tracking-wide"
            >
              {t('landing.nav.sign_up', 'Sign Up')}
            </Link>
          </div>
        </nav>

        <main className="flex-1 w-full pt-14 md:pt-16">
          <HeroSection />
          <BentoFeatures />

          {/* Simple CTA before footer */}
          <section className="py-24 px-6 text-center border-t border-white/5 bg-linear-to-b from-transparent to-brand-primary/5">
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-6 text-white">
              {t('landing.cta.title', 'Ready to join?')}
            </h2>
            <Link
              to="/accounts/emailsignup"
              className="inline-flex items-center justify-center h-12 px-8 bg-brand-primary text-white font-black text-[13px] uppercase tracking-wide rounded-full transition-all hover:bg-brand-primary/90 active:scale-95 shadow-lg shadow-brand-primary/20"
            >
              {t('landing.cta.button', 'Create your account')}
            </Link>
          </section>
        </main>
      </div>

      <PublicFooter />
    </div>
  );
};

export default LandingPage;
