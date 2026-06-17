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
        <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5 px-6 py-3 flex justify-between items-center backdrop-blur-xl bg-transparent">
          <div className="flex items-center gap-2.5">
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
        <main className="max-w-6xl mx-auto px-6 pt-28 pb-16 md:pt-36 md:pb-20 flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border border-white/10 mb-8 animate-float shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-secondary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-secondary"></span>
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/80">
              {t('landing.hero.badge')}
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-6 leading-[0.9] drop-shadow-2xl">
            {t('landing.hero.title_part1')} <br className="hidden md:block" />
            <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">
              {t('landing.hero.title_part2')}
            </span>
          </h1>

          <p className="max-w-md text-base md:text-lg text-white/50 mb-10 leading-relaxed font-light tracking-wide italic">
            {t('landing.hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Link
              to="/accounts/emailsignup"
              className="group relative px-6 py-3 bg-white text-black font-bold text-sm rounded-full transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95"
            >
              <span className="flex items-center justify-center gap-2">
                {t('landing.hero.get_started')}
                <Zap className="w-4 h-4 fill-black group-hover:rotate-12 transition-transform" />
              </span>
            </Link>
            <Link
              to="/explore"
              className="px-6 py-3 glass-panel rounded-full text-white text-sm font-bold hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border border-white/5"
            >
              {t('landing.hero.explore_demo')}
            </Link>
          </div>

          {/* Dynamic Mockup Section */}
          <div className="mt-14 relative w-full max-w-3xl aspect-video glass-panel rounded-2xl border border-white/5 shadow-2xl overflow-hidden group">
            <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black z-10"></div>

            {/* Animated Grid simulating feed */}
            <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity duration-1000">
              <div className="grid grid-cols-4 gap-4 p-6 w-full h-full transform group-hover:scale-105 transition-transform duration-1000 ease-out">
                <div className="col-span-1 space-y-4 pt-8">
                  <div className="glass-panel h-44 rounded-2xl w-full bg-white/5 border-white/10 shadow-lg"></div>
                  <div className="glass-panel h-56 rounded-2xl w-full bg-white/5 border-white/10 shadow-lg"></div>
                </div>
                <div className="col-span-1 space-y-6">
                  <div className="glass-panel h-full rounded-2xl w-full border border-brand-primary/30 shadow-[0_0_40px_rgba(131,58,180,0.15)] bg-linear-to-b from-brand-primary/10 to-transparent">
                    <div className="p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 animate-pulse"></div>
                      <div className="h-3 w-24 bg-white/10 rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 space-y-6 pt-20">
                  <div className="glass-panel h-64 rounded-2xl w-full bg-white/5 border-white/10 shadow-lg"></div>
                  <div className="glass-panel h-32 rounded-2xl w-full bg-white/5 border-white/10 shadow-lg"></div>
                </div>
                <div className="col-span-1 space-y-6 pt-6">
                  <div className="glass-panel h-52 rounded-2xl w-full bg-white/5 border-white/10 shadow-lg"></div>
                  <div className="glass-panel h-full rounded-2xl w-full bg-white/5 border-white/10 shadow-lg"></div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 z-20 text-left bg-linear-to-t from-black to-transparent">
              <h3 className="text-2xl font-black mb-1 tracking-tighter">
                {t('landing.hero.mockup.title')}
              </h3>
              <p className="text-white/50 max-w-md text-sm leading-relaxed">
                {t('landing.hero.mockup.desc')}
              </p>
            </div>
          </div>
        </main>

        {/* Marquee Section */}
        <section className="py-12 border-y border-white/5 bg-black/60 backdrop-blur-xl overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-32 bg-linear-to-r from-black to-transparent z-10"></div>
          <div className="absolute inset-y-0 right-0 w-32 bg-linear-to-l from-black to-transparent z-10"></div>
          <div className="flex gap-16 animate-marquee whitespace-nowrap items-center">
            {['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((m) => (
              <React.Fragment key={m}>
                <span className="text-xl font-black text-white/15 tracking-[0.25em] uppercase transition-colors hover:text-brand-primary duration-500 cursor-default">
                  {t('landing.marquee.community')}
                </span>
                <span className="text-lg font-bold text-white/5">•</span>
                <span className="text-xl font-black text-white/15 tracking-[0.25em] uppercase transition-colors hover:text-brand-secondary duration-500 cursor-default">
                  {t('landing.marquee.creativity')}
                </span>
                <span className="text-lg font-bold text-white/5">•</span>
                <span className="text-xl font-black text-white/15 tracking-[0.25em] uppercase transition-colors hover:text-brand-blue duration-500 cursor-default">
                  {t('landing.marquee.connection')}
                </span>
                <span className="text-lg font-bold text-white/5">•</span>
                <span className="text-xl font-black text-white/15 tracking-[0.25em] uppercase transition-colors hover:text-brand-accent duration-500 cursor-default">
                  {t('landing.marquee.innovation')}
                </span>
                <span className="text-lg font-bold text-white/5">•</span>
              </React.Fragment>
            ))}
          </div>
        </section>

        <InteractiveFeatures />

        {/* Features Grid */}
        <section className="py-16 relative">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
                {t('landing.features.title')}
              </h2>
              <p className="text-sm text-white/30 max-w-md mx-auto font-light italic">
                {t('landing.features.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FeatureCard
                icon={<Camera className="w-6 h-6 text-brand-secondary" />}
                title={t('landing.features.items.capture.title')}
                description={t('landing.features.items.capture.desc')}
              />
              <FeatureCard
                icon={<Users className="w-6 h-6 text-brand-primary" />}
                title={t('landing.features.items.community.title')}
                description={t('landing.features.items.community.desc')}
              />
              <FeatureCard
                icon={<MessageCircle className="w-6 h-6 text-brand-blue" />}
                title={t('landing.features.items.realtime.title')}
                description={t('landing.features.items.realtime.desc')}
              />
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 relative bg-white/1">
          <div className="max-w-2xl mx-auto px-6">
            <div className="text-center mb-10">
              <span className="text-brand-accent font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">
                {t('landing.faq.badge')}
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                {t('landing.faq.title')}
              </h2>
            </div>
            <div className="space-y-4">
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
        <section className="py-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-brand-primary/10 pointer-events-none"></div>
          <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl md:text-4xl font-bold mb-4 tracking-tight">
              {t('landing.cta.title')}
            </h2>
            <p className="text-base text-white/40 mb-8 max-w-md mx-auto font-light">
              {t('landing.cta.subtitle')}
            </p>
            <Link
              to="/accounts/emailsignup"
              className="inline-flex items-center justify-center px-7 py-3.5 bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue text-white font-bold text-base rounded-full shadow-[0_0_30px_rgba(131,58,180,0.35)] hover:scale-105 transition-all border border-white/10 backdrop-blur-lg"
            >
              {t('landing.cta.button')}
              <Zap className="w-4 h-4 ml-2 fill-white" />
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="py-14 border-t border-white/5 bg-black text-sm relative mt-auto">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 text-white/40 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-5">
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
            <h4 className="text-white/80 font-bold uppercase tracking-widest text-[10px] mb-5">
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
            <h4 className="text-white/80 font-bold uppercase tracking-widest text-[10px] mb-5">
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
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-brand-primary/20 transition-all duration-500 group hover:-translate-y-1 hover:bg-white/5 backdrop-blur-2xl">
    <div className="w-11 h-11 rounded-lg bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500 group-hover:bg-brand-primary/20">
      {icon}
    </div>
    <h3 className="text-lg font-bold mb-3 group-hover:text-brand-primary transition-colors tracking-tight">
      {title}
    </h3>
    <p className="text-white/30 text-sm leading-relaxed font-light">
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
    <div className="glass-panel rounded-xl overflow-hidden border border-white/5 transition-all duration-500 bg-white/1 hover:bg-white/2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 text-left flex justify-between items-center transition-colors group"
      >
        <span className="font-bold text-base group-hover:text-white/90 transition-colors tracking-tight">
          {question}
        </span>
        <div
          className={`w-7 h-7 rounded-full bg-white/5 flex items-center justify-center transition-all duration-500 shrink-0 ml-4 ${isOpen ? 'rotate-180 bg-brand-primary shadow-lg' : ''}`}
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-colors ${isOpen ? 'text-white' : 'text-gray-500'}`}
          />
        </div>
      </button>
      <div
        className={`px-6 transition-all duration-500 ease-in-out overflow-hidden ${isOpen ? 'max-h-[500px] pb-6 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}
      >
        <div className="h-px w-full bg-white/5 mb-4"></div>
        <p className="text-sm text-white/30 leading-relaxed font-light italic">
          "{answer}"
        </p>
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
        <span className="text-brand-primary font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">
          {t('landing.interactive.badge')}
        </span>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
          {t('landing.interactive.title')}
        </h2>
      </div>
      <div className="w-full glass-panel rounded-2xl p-1.5 border border-white/5 max-w-4xl mx-auto flex flex-col lg:flex-row overflow-hidden min-h-[380px] shadow-2xl">
        {/* Sidebar / Tabs */}
        <div className="w-full lg:w-1/3 p-4 flex flex-col gap-3 border-b lg:border-b-0 lg:border-r border-white/5 relative z-20">
          <h3 className="font-bold mb-2 text-white/30 uppercase tracking-[0.3em] text-[10px]">
            {t('landing.interactive.tabs_header')}
          </h3>
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-3 rounded-xl text-left transition-all duration-500 flex items-center gap-3 group relative overflow-hidden ${activeTab === tab.id ? 'bg-white/10 shadow-xl scale-[1.02]' : 'hover:bg-white/2'}`}
            >
              {activeTab === tab.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary"></div>
              )}
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-500 ${activeTab === tab.id ? 'bg-brand-primary text-white shadow-[0_0_15px_rgba(131,58,180,0.35)]' : 'bg-white/5 text-gray-500 group-hover:text-white group-hover:scale-110'}`}
              >
                {tab.icon}
              </div>
              <div>
                <span
                  className={`block font-black text-sm transition-colors ${activeTab === tab.id ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}
                >
                  {tab.label}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="w-full lg:w-2/3 flex-1 min-h-[280px] p-6 md:p-10 relative flex items-center justify-center bg-black/20 overflow-hidden">
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
              <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tighter leading-none">
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
