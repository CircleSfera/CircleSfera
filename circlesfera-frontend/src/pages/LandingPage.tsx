import {
  Camera,
  ChevronDown,
  Globe,
  MessageCircle,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/logo.png';
import SEO from '../components/common/SEO';

const LandingPage = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh relative overflow-hidden text-white font-sans selection:bg-brand-primary/30 flex flex-col justify-between">
      <SEO
        title={t('landing.seo.title')}
        description={t('landing.seo.description')}
      />
      {/* Background is now handled globally by LayoutWrapper */}

      <div className="w-full flex-1 block relative z-10 pb-16">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5 px-5 py-2 flex justify-between items-center backdrop-blur-xl bg-transparent">
          <div className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="CircleSfera"
              className="h-8 w-auto object-contain"
            />
            <span className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
              CircleSfera
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link
              to="/accounts/login"
              className="text-xs font-semibold text-white/70 hover:text-white transition-colors tracking-wide uppercase"
            >
              {t('landing.nav.log_in')}
            </Link>
            <Link
              to="/accounts/emailsignup"
              className="px-5 py-2 text-xs font-bold bg-white text-black rounded-full hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
              {t('landing.nav.sign_up')}
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <main className="max-w-3xl mx-auto px-6 pt-16 pb-8 md:pt-18 md:pb-8 flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border border-white/10 mb-3 shadow-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-secondary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-secondary"></span>
            </span>
            <span className="text-[9px] font-bold tracking-wider uppercase text-white/80">
              {t('landing.hero.badge')}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black tracking-tight mb-3 leading-snug drop-shadow-lg">
            {t('landing.hero.title_part1')} <br className="hidden md:block" />
            <span className="bg-clip-text text-transparent bg-linear-to-r from-[#ff5757] to-[#8c52ff] drop-shadow-[0_4px_16px_rgba(255,87,87,0.25)]">
              {t('landing.hero.title_part2')}
            </span>
          </h1>

          <p className="max-w-sm text-xs md:text-sm text-white/70 mb-5 leading-relaxed font-light tracking-wide italic">
            {t('landing.hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Link
              to="/accounts/emailsignup"
              className="group relative px-4 py-2 bg-white text-black font-bold text-[11px] rounded-full transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95"
            >
              <span className="flex items-center justify-center gap-2">
                {t('landing.hero.get_started')}
                <Zap className="w-3 h-3 fill-black group-hover:rotate-12 transition-transform" />
              </span>
            </Link>
            <Link
              to="/explore"
              className="px-4 py-2 glass-panel rounded-full text-white text-[11px] font-bold hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border border-white/8"
            >
              {t('landing.hero.explore_demo')}
            </Link>
          </div>

          {/* Dynamic Mockup Section */}
          <div className="mt-6 relative w-full max-w-xl aspect-video glass-panel rounded-xl border border-white/8 shadow-xl overflow-hidden group">
            <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/80 z-10"></div>

            {/* Animated Grid simulating feed */}
            <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity duration-1000">
              <div className="grid grid-cols-4 gap-3 p-3 w-full h-full transform group-hover:scale-105 transition-transform duration-1000 ease-out">
                <div className="col-span-1 space-y-2 pt-4">
                  <div className="glass-panel h-24 rounded-md w-full bg-white/5 border-white/10 shadow-lg"></div>
                  <div className="glass-panel h-32 rounded-md w-full bg-white/5 border-white/10 shadow-lg"></div>
                </div>
                <div className="col-span-1 space-y-2">
                  <div className="glass-panel h-full rounded-md w-full border border-brand-primary/30 shadow-[0_0_24px_rgba(140,82,255,0.15)] bg-linear-to-b from-brand-primary/10 to-transparent">
                    <div className="p-2 flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-md bg-white/10 animate-pulse"></div>
                      <div className="h-2 w-16 bg-white/10 rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 space-y-2 pt-10">
                  <div className="glass-panel h-36 rounded-md w-full bg-white/5 border-white/10 shadow-lg"></div>
                  <div className="glass-panel h-16 rounded-md w-full bg-white/5 border-white/10 shadow-lg"></div>
                </div>
                <div className="col-span-1 space-y-2 pt-3">
                  <div className="glass-panel h-28 rounded-md w-full bg-white/5 border-white/10 shadow-lg"></div>
                  <div className="glass-panel h-full rounded-md w-full bg-white/5 border-white/10 shadow-lg"></div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 z-20 text-left bg-linear-to-t from-black to-transparent">
              <h3 className="text-base font-black mb-0.5 tracking-tight">
                {t('landing.hero.mockup.title')}
              </h3>
              <p className="text-white/60 max-w-xs text-[11px] leading-relaxed">
                {t('landing.hero.mockup.desc')}
              </p>
            </div>
          </div>
        </main>

        {/* Marquee Section */}
        <section className="py-4 border-y border-white/5 bg-black/60 backdrop-blur-xl overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-20 bg-linear-to-r from-black to-transparent z-10"></div>
          <div className="absolute inset-y-0 right-0 w-20 bg-linear-to-l from-black to-transparent z-10"></div>
          <div className="flex gap-8 animate-marquee whitespace-nowrap items-center">
            {['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((m) => (
              <React.Fragment key={m}>
                <span className="text-[11px] font-black text-white/20 tracking-[0.18em] uppercase transition-colors hover:text-brand-primary duration-500 cursor-default">
                  {t('landing.marquee.community')}
                </span>
                <span className="text-[10px] font-bold text-white/10">•</span>
                <span className="text-[11px] font-black text-white/20 tracking-[0.18em] uppercase transition-colors hover:text-brand-secondary duration-500 cursor-default">
                  {t('landing.marquee.creativity')}
                </span>
                <span className="text-[10px] font-bold text-white/10">•</span>
                <span className="text-[11px] font-black text-white/20 tracking-[0.18em] uppercase transition-colors hover:text-brand-blue duration-500 cursor-default">
                  {t('landing.marquee.connection')}
                </span>
                <span className="text-[10px] font-bold text-white/10">•</span>
                <span className="text-[11px] font-black text-white/20 tracking-[0.18em] uppercase transition-colors hover:text-brand-accent duration-500 cursor-default">
                  {t('landing.marquee.innovation')}
                </span>
                <span className="text-[10px] font-bold text-white/10">•</span>
              </React.Fragment>
            ))}
          </div>
        </section>

        <InteractiveFeatures />

        {/* Features Grid */}
        <section className="py-8 relative">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-6">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-2 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: 'rgba(140,82,255,0.12)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  color: 'rgba(167,139,250,0.9)',
                }}
              >
                <span className="w-1 h-1 rounded-full bg-purple-400" />
                {t('landing.features.title')}
              </div>
              <p className="text-[11px] text-white/40 max-w-xs mx-auto font-light italic">
                {t('landing.features.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FeatureCard
                icon={<Camera className="w-4 h-4" />}
                iconGradient="linear-gradient(135deg, #ff5757, #8c52ff)"
                title={t('landing.features.items.capture.title')}
                description={t('landing.features.items.capture.desc')}
              />
              <FeatureCard
                icon={<Users className="w-4 h-4" />}
                iconGradient="linear-gradient(135deg, #8c52ff, #5271ff)"
                title={t('landing.features.items.community.title')}
                description={t('landing.features.items.community.desc')}
              />
              <FeatureCard
                icon={<MessageCircle className="w-4 h-4" />}
                iconGradient="linear-gradient(135deg, #5271ff, #06b6d4)"
                title={t('landing.features.items.realtime.title')}
                description={t('landing.features.items.realtime.desc')}
              />
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-8 relative">
          <div className="max-w-xl mx-auto px-6">
            <div className="text-center mb-6">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-2 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: 'rgba(255,87,87,0.1)',
                  border: '1px solid rgba(255,87,87,0.2)',
                  color: 'rgba(255,87,87,0.85)',
                }}
              >
                <span className="w-1 h-1 rounded-full bg-red-400" />
                {t('landing.faq.badge')}
              </div>
              <h2 className="text-lg md:text-xl font-black tracking-tight">
                {t('landing.faq.title')}
              </h2>
            </div>
            <div className="space-y-2">
              <FAQItem
                question={t('landing.faq.items.free.q')}
                answer={t('landing.faq.items.free.a')}
              />
              <FAQItem
                question={t('landing.faq.items.verify.q')}
                answer={t('landing.faq.items.verify.a')}
              />
              <FAQItem
                question={t('landing.faq.items.security.q')}
                answer={t('landing.faq.items.security.a')}
              />
              <FAQItem
                question={t('landing.faq.items.app.q')}
                answer={t('landing.faq.items.app.a')}
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-10 relative overflow-hidden">
          {/* Radial glow orb */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(140,82,255,0.15) 0%, rgba(255,87,87,0.08) 40%, transparent 70%)',
            }}
          />
          <div className="max-w-xl mx-auto px-6 text-center relative z-10">
            <h2
              className="text-xl md:text-2xl font-black mb-2 tracking-tight leading-tight"
              style={{
                background:
                  'linear-gradient(90deg, #ffffff 30%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('landing.cta.title')}
            </h2>
            <p className="text-[11px] md:text-xs text-white/50 mb-5 max-w-xs mx-auto leading-relaxed">
              {t('landing.cta.subtitle')}
            </p>
            <Link
              to="/accounts/emailsignup"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-white font-black text-[11px] rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(90deg, #ff5757 0%, #8c52ff 100%)',
                boxShadow:
                  '0 6px 24px rgba(140,82,255,0.35), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              {t('landing.cta.button')}
              <Zap className="w-3 h-3 fill-white" />
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="py-14 border-t border-white/5 bg-black text-sm relative mt-auto">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 text-white/40 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-7 h-7 flex items-center justify-center">
                <img
                  src={logoSrc}
                  alt="CircleSfera"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-black text-lg text-white/80 tracking-tight">
                CircleSfera
              </span>
            </div>
            <p className="max-w-xs leading-relaxed text-sm">
              {t('landing.footer.desc')}
            </p>
          </div>
          <div>
            <h4 className="text-white/80 font-bold uppercase tracking-wide text-xs mb-5">
              {t('landing.footer.platform')}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/explore"
                  className="hover:text-white transition-colors"
                >
                  {t('landing.footer.explore')}
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
                  {t('landing.nav.log_in')}
                </Link>
              </li>
              <li>
                <Link
                  to="/accounts/emailsignup"
                  className="hover:text-white transition-colors"
                >
                  {t('landing.nav.sign_up')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white/80 font-bold uppercase tracking-wide text-xs mb-5">
              {t('landing.footer.legal')}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/privacy"
                  className="hover:text-white transition-colors"
                >
                  {t('landing.footer.privacy')}
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="hover:text-white transition-colors"
                >
                  {t('landing.footer.terms')}
                </Link>
              </li>
              <li>
                <Link
                  to="/guidelines"
                  className="hover:text-white transition-colors"
                >
                  {t('landing.footer.guidelines')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-xs opacity-50">
          <p>{t('landing.footer.rights')}</p>
          <p className="mt-3 md:mt-0">{t('landing.footer.tagline')}</p>
        </div>
      </footer>
    </div>
  );
};

// Sub-components

const FeatureCard = ({
  icon,
  iconGradient,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconGradient?: string;
  title: string;
  description: string;
}) => (
  <div
    className="relative p-4 rounded-xl border border-white/7 transition-all duration-400 group hover:-translate-y-1 hover:border-brand-primary/25 overflow-hidden cursor-default"
    style={{
      background:
        'linear-gradient(160deg, rgba(18,12,30,0.7) 0%, rgba(10,8,20,0.8) 100%)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    }}
  >
    {/* Shimmer sweep */}
    <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/3 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 text-white transition-transform duration-400 group-hover:scale-110"
      style={{
        background: iconGradient || 'rgba(140,82,255,0.2)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      {icon}
    </div>
    <h3 className="text-xs font-bold mb-1.5 tracking-tight text-white transition-colors">
      {title}
    </h3>
    <p className="text-[11px] text-white/50 leading-relaxed font-light">
      {description}
    </p>
  </div>
);

const FAQItem = ({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-300"
      style={{
        background: isOpen
          ? 'linear-gradient(160deg, rgba(18,10,30,0.8) 0%, rgba(10,7,20,0.9) 100%)'
          : 'rgba(255,255,255,0.025)',
        border: isOpen
          ? '1px solid rgba(140,82,255,0.2)'
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isOpen ? '0 4px 20px rgba(140,82,255,0.1)' : 'none',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 text-left flex justify-between items-center transition-colors group"
      >
        <span className="font-bold text-xs text-white/85 group-hover:text-white transition-colors tracking-tight pr-3">
          {question}
        </span>
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all duration-300 shrink-0"
          style={{
            background: isOpen
              ? 'linear-gradient(90deg, #ff5757, #8c52ff)'
              : 'rgba(255,255,255,0.06)',
            boxShadow: isOpen ? '0 2px 12px rgba(140,82,255,0.4)' : 'none',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-colors ${isOpen ? 'text-white' : 'text-gray-500'}`}
          />
        </div>
      </button>
      <div
        className={`px-5 transition-all duration-400 ease-in-out overflow-hidden ${isOpen ? 'max-h-125 pb-5 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}
      >
        <div
          className="h-px w-full mb-4"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,87,87,0.4), rgba(140,82,255,0.4), transparent)',
          }}
        />
        <p className="text-sm text-white/40 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
};

const InteractiveFeatures = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('connect');

  const tabs = [
    {
      id: 'connect',
      label: t('landing.interactive.tabs.connect.label'),
      icon: <Globe className="w-4 h-4" />,
      title: t('landing.interactive.tabs.connect.title'),
      desc: t('landing.interactive.tabs.connect.desc'),
    },
    {
      id: 'create',
      label: t('landing.interactive.tabs.create.label'),
      icon: <Sparkles className="w-4 h-4" />,
      title: t('landing.interactive.tabs.create.title'),
      desc: t('landing.interactive.tabs.create.desc'),
    },
    {
      id: 'share',
      label: t('landing.interactive.tabs.share.label'),
      icon: <Shield className="w-4 h-4" />,
      title: t('landing.interactive.tabs.share.title'),
      desc: t('landing.interactive.tabs.share.desc'),
    },
  ];

  return (
    <section className="py-16 w-full max-w-5xl mx-auto px-6">
      <div className="text-center mb-10">
        <span className="text-brand-primary font-bold text-xs tracking-wide uppercase mb-2 block opacity-60">
          {t('landing.interactive.badge')}
        </span>
        <h2 className="text-2xl md:text-xl font-bold tracking-tight">
          {t('landing.interactive.title')}
        </h2>
      </div>
      <div className="w-full glass-panel rounded-lg p-1 border border-white/5 max-w-4xl mx-auto flex flex-col lg:flex-row overflow-hidden min-h-95 shadow-2xl">
        {/* Sidebar / Tabs */}
        <div className="w-full lg:w-1/3 p-4 flex flex-col gap-3 border-b lg:border-b-0 lg:border-r border-white/5 relative z-20">
          <h3 className="font-bold mb-2 text-white/30 uppercase tracking-wide text-xs">
            {t('landing.interactive.tabs_header')}
          </h3>
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-3 rounded-xl text-left transition-all duration-300 flex items-center gap-3 group relative overflow-hidden active:scale-95 ${
                activeTab === tab.id ? 'scale-[1.02]' : 'hover:bg-white/3'
              }`}
              style={
                activeTab === tab.id
                  ? {
                      background:
                        'linear-gradient(135deg, rgba(140,82,255,0.15), rgba(255,87,87,0.08))',
                      border: '1px solid rgba(140,82,255,0.25)',
                      boxShadow: '0 4px 16px rgba(140,82,255,0.12)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              {activeTab === tab.id && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                  style={{
                    background: 'linear-gradient(180deg, #ff5757, #8c52ff)',
                    boxShadow: '0 0 6px rgba(140,82,255,0.6)',
                  }}
                />
              )}
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 ml-1 ${
                  activeTab !== tab.id ? 'group-hover:scale-110' : ''
                }`}
                style={
                  activeTab === tab.id
                    ? {
                        background: 'linear-gradient(90deg, #ff5757, #8c52ff)',
                        boxShadow: '0 4px 16px rgba(140,82,255,0.4)',
                        color: 'white',
                      }
                    : {
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(156,163,175,0.8)',
                      }
                }
              >
                {tab.icon}
              </div>
              <div>
                <span
                  className={`block font-black text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'text-white'
                      : 'text-gray-500 group-hover:text-white/80'
                  }`}
                >
                  {tab.label}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="w-full lg:w-2/3 flex-1 min-h-70 p-6 md:p-10 relative flex items-center justify-center bg-black/20 overflow-hidden">
          {/* Animated grid background for content */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] bg-size-[40px_40px]"></div>
          </div>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`absolute inset-0 p-6 md:p-10 flex flex-col justify-center transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${activeTab === tab.id ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-12 scale-95 pointer-events-none'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-linear-to-br from-brand-primary via-brand-secondary to-brand-blue flex items-center justify-center mb-6 shadow-lg">
                {tab.id === 'connect' ? (
                  <Globe className="w-6 h-6 text-white" />
                ) : tab.id === 'create' ? (
                  <Sparkles className="w-6 h-6 text-white" />
                ) : (
                  <Shield className="w-6 h-6 text-white" />
                )}
              </div>
              <h2 className="text-xl md:text-2xl font-black mb-4 tracking-tighter leading-none">
                {tab.title}
              </h2>
              <p className="text-base text-white/40 leading-relaxed font-light italic">
                "{tab.desc}"
              </p>

              <div className="mt-8 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-linear-to-r ${activeTab === 'connect' ? 'from-blue-500' : activeTab === 'create' ? 'from-purple-500' : 'from-pink-500'} to-transparent transition-all duration-1000 w-full animate-pulse`}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LandingPage;
