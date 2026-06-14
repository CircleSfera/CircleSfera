import {
  BarChart3,
  Bookmark,
  Camera,
  ChevronDown,
  Compass,
  Globe,
  Heart,
  Image,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Play,
  Send,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SharedFooter from '../components/SharedFooter';
import SharedNav from '../components/SharedNav';
import { useLanguage } from '../hooks/useLanguage';

const LandingPage = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/whitelist/signup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t.whitelist.errorSomethingWrong);
      }

      setStatus('success');
      setEmail('');
      setName('');
    } catch (err: unknown) {
      console.error(err);
      setStatus('error');
      const message =
        err instanceof Error ? err.message : t.whitelist.errorUnknown;
      setErrorMessage(message);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden text-white font-sans selection:bg-brand-primary/30">
      {/* Background */}
      <div className="fixed inset-0 z-[-1] bg-[#030303]">
        <div className="mesh-gradient-bg opacity-100" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 brightness-100 contrast-150 pointer-events-none mix-blend-overlay"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-brand-primary/20 rounded-full blur-[120px] animate-blob filter mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-brand-blue/20 rounded-full blur-[120px] animate-blob animation-delay-2000 filter mix-blend-screen"></div>
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] bg-brand-secondary/15 rounded-full blur-[100px] animate-blob animation-delay-4000 filter mix-blend-screen"></div>
      </div>

      <SharedNav />

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 pt-28 pb-10 md:pt-32 md:pb-20 flex flex-col items-center text-center relative z-10">
        <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full glass-panel border border-white/20 mb-6 animate-float shadow-[0_0_20px_rgba(255,255,255,0.05)]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-secondary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-secondary"></span>
          </span>
          <span className="text-[10px] font-black tracking-[0.3em] uppercase text-white/90">
            {t.hero.badge}
          </span>
        </div>

        <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-5 leading-[0.85] drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
          {t.hero.titleLine1} <br className="hidden md:block" />
          <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto] inline-block mt-2">
            {t.hero.titleLine2}
          </span>
        </h1>

        <p className="max-w-lg text-sm md:text-base text-white/40 mb-8 leading-relaxed font-light tracking-wide italic">
          {t.hero.subtitle}
        </p>

        <a
          href="#whitelist"
          className="group relative px-8 py-4 bg-white text-black text-xs font-black rounded-2xl overflow-hidden transition-all hover:shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:scale-[1.05] active:scale-95 shadow-2xl"
        >
          <span className="relative z-10 flex items-center gap-3 uppercase tracking-widest">
            {t.nav.joinWhitelist}
            <Zap className="w-4 h-4 fill-black group-hover:animate-bounce" />
          </span>
        </a>

        {/* Dynamic Mockup */}
        <div className="mt-12 relative w-full max-w-3xl aspect-video glass-panel rounded-4xl border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden group perspective-1000">
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/80 z-10"></div>

          <div className="absolute inset-0 flex items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity duration-1000 scale-[0.8] group-hover:scale-100 ease-out backdrop-blur-[2px] group-hover:backdrop-blur-0">
            <div className="grid grid-cols-4 gap-6 p-10 w-full h-full transform group-hover:rotate-x-2 transition-transform duration-1000 ease-out">
              <div className="col-span-1 space-y-6 pt-12">
                <div className="glass-panel h-52 rounded-3xl w-full bg-white/5 border-white/10 shadow-lg animate-pulse-slow"></div>
                <div className="glass-panel h-64 rounded-3xl w-full bg-white/5 border-white/10 shadow-lg animation-delay-2000 animate-pulse-slow"></div>
              </div>
              <div className="col-span-1 space-y-8">
                <div className="glass-panel h-full rounded-3xl w-full border border-brand-primary/40 shadow-[0_0_50px_rgba(131,58,180,0.2)] bg-linear-to-b from-brand-primary/20 to-transparent relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary animate-pulse"></div>
                  <div className="p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10"></div>
                      <div className="space-y-2">
                        <div className="h-3 w-28 bg-white/20 rounded-full"></div>
                        <div className="h-2 w-16 bg-white/10 rounded-full"></div>
                      </div>
                    </div>
                    <div className="space-y-2 mt-4">
                      <div className="h-2 w-full bg-white/5 rounded-full"></div>
                      <div className="h-2 w-[80%] bg-white/5 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-span-1 space-y-8 pt-24">
                <div className="glass-panel h-72 rounded-3xl w-full bg-white/5 border-white/10 shadow-lg animate-pulse-slow animation-delay-4000"></div>
                <div className="glass-panel h-40 rounded-3xl w-full bg-white/5 border-white/10 shadow-lg animate-pulse-slow"></div>
              </div>
              <div className="col-span-1 space-y-8 pt-8">
                <div className="glass-panel h-60 rounded-3xl w-full bg-white/5 border-white/10 shadow-lg animate-pulse-slow animation-delay-2000"></div>
                <div className="glass-panel h-full rounded-3xl w-full bg-white/5 border-white/10 shadow-lg animate-pulse-slow"></div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-12 z-20 text-left bg-linear-to-t from-black via-black/60 to-transparent">
            <div className="flex items-center gap-4 mb-4">
              <Sparkles className="w-6 h-6 text-brand-accent animate-pulse" />
              <h3 className="text-3xl font-black tracking-tighter">
                {t.mockup.title}
              </h3>
            </div>
            <p className="text-white/40 max-w-lg text-base leading-relaxed font-light italic">
              {t.mockup.subtitle}
            </p>
          </div>
        </div>
      </main>

      {/* Marquee Section */}
      <section className="py-12 border-y border-white/5 bg-black/40 backdrop-blur-3xl overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 w-48 bg-linear-to-r from-black to-transparent z-10"></div>
        <div className="absolute inset-y-0 right-0 w-48 bg-linear-to-l from-black to-transparent z-10"></div>
        <div className="flex gap-20 animate-marquee whitespace-nowrap items-center">
          {[1, 2, 3, 4, 5, 6].map((id) => (
            <React.Fragment key={`marquee-${id}`}>
              <span className="text-2xl font-black text-white/5 tracking-[0.3em] uppercase transition-all hover:text-brand-primary hover:scale-110 duration-700 cursor-default">
                {t.marquee.community}
              </span>
              <span className="text-xl font-bold text-white/5">•</span>
              <span className="text-2xl font-black text-white/5 tracking-[0.3em] uppercase transition-all hover:text-brand-secondary hover:scale-110 duration-700 cursor-default">
                {t.marquee.creativity}
              </span>
              <span className="text-xl font-bold text-white/5">•</span>
              <span className="text-2xl font-black text-white/5 tracking-[0.3em] uppercase transition-all hover:text-brand-blue hover:scale-110 duration-700 cursor-default">
                {t.marquee.connection}
              </span>
              <span className="text-xl font-bold text-white/5">•</span>
              <span className="text-2xl font-black text-white/5 tracking-[0.3em] uppercase transition-all hover:text-brand-accent hover:scale-110 duration-700 cursor-default">
                {t.marquee.innovation}
              </span>
              <span className="text-xl font-bold text-white/5">•</span>
            </React.Fragment>
          ))}
        </div>
      </section>

      <InteractiveFeatures />

      <FeaturesShowcase />

      {/* FAQ Section */}
      <section className="py-10 relative bg-white/1">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-brand-accent font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">
              {t.faq.label}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              {t.faq.title}
            </h2>
          </div>
          <div className="space-y-4">
            {t.faq.items.map((item: { q: string; a: string }) => (
              <FAQItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Whitelist / CTA Section */}
      <section className="py-12 relative overflow-hidden">
        <div id="whitelist" className="scroll-mt-32" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-brand-primary/10 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 relative z-10 flex flex-col items-center">
          <div className="w-full max-w-lg glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden bg-black/40 backdrop-blur-2xl">
            <div className="absolute inset-0 bg-linear-to-br from-brand-primary/10 to-transparent pointer-events-none"></div>

            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-black mb-2 tracking-tighter">
                {t.whitelist.title}
              </h2>
              <p className="text-sm text-white/50">{t.whitelist.subtitle}</p>
            </div>

            {status === 'success' ? (
              <div className="py-8 text-center relative z-10">
                <div className="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(131,58,180,0.5)]">
                  <Send className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">
                  {t.whitelist.successTitle}
                </h3>
                <p className="text-sm text-white/50 mb-6">
                  {t.whitelist.successMessage}
                </p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="text-sm text-brand-primary font-bold hover:underline uppercase tracking-widest"
                >
                  {t.whitelist.addAnother}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                <div className="grid grid-cols-1 gap-4">
                  <div className="text-left">
                    <label
                      htmlFor="name"
                      className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5 ml-1 block"
                    >
                      {t.whitelist.nameLabel}
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.whitelist.namePlaceholder}
                      className="w-full px-5 py-3.5 text-sm bg-white/5 border border-white/10 rounded-2xl focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all placeholder:text-white/20"
                    />
                  </div>
                  <div className="text-left">
                    <label
                      htmlFor="email"
                      className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5 ml-1 block"
                    >
                      {t.whitelist.emailLabel}
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input
                        type="email"
                        id="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t.whitelist.emailPlaceholder}
                        className="w-full pl-11 pr-5 py-3.5 text-sm bg-white/5 border border-white/10 rounded-2xl focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all placeholder:text-white/20"
                      />
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <p className="text-red-400 text-xs mt-2 px-1">
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full group relative mt-4 px-8 py-4 bg-white text-black text-sm font-black rounded-2xl overflow-hidden transition-all hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {status === 'loading' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t.whitelist.submitting}
                      </>
                    ) : (
                      <>
                        {t.whitelist.submitButton}
                        <Zap className="w-4 h-4 fill-black group-hover:rotate-12 transition-transform" />
                      </>
                    )}
                  </span>
                </button>
                <p className="text-[10px] text-white/20 text-center uppercase tracking-[0.2em] font-medium mt-4">
                  {t.whitelist.reserveSpot}
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      <SharedFooter />
    </div>
  );
};

const FeaturesShowcase = () => {
  const { t } = useLanguage();
  const featureData = [
    {
      id: 'visual-feed',
      icon: <Image className="w-5 h-5" />,
      color: 'from-brand-secondary to-orange-600',
      span: 'md:col-span-2',
    },
    {
      id: 'stories',
      icon: <Camera className="w-5 h-5" />,
      color: 'from-brand-primary to-purple-600',
      span: '',
    },
    {
      id: 'frames',
      icon: <Play className="w-5 h-5" />,
      color: 'from-brand-blue to-blue-600',
      span: '',
    },
    {
      id: 'chat',
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'from-emerald-500 to-teal-600',
      span: 'md:col-span-2',
    },
    {
      id: 'circles',
      icon: <Users className="w-5 h-5" />,
      color: 'from-brand-accent to-amber-600',
      span: '',
    },
    {
      id: 'explore',
      icon: <Compass className="w-5 h-5" />,
      color: 'from-cyan-500 to-blue-500',
      span: '',
    },
    {
      id: 'creator-studio',
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'from-violet-500 to-purple-600',
      span: '',
    },
    {
      id: 'collections',
      icon: <Bookmark className="w-5 h-5" />,
      color: 'from-pink-500 to-rose-600',
      span: '',
    },
  ];

  return (
    <section className="py-10 relative">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-10">
          <span className="text-brand-accent font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">
            {t.showcase.label}
          </span>
          <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
            {t.showcase.title}
          </h2>
          <p className="text-sm text-white/30 max-w-md mx-auto font-light italic">
            {t.showcase.subtitle}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {t.showcase.features.map(
            (f: { title: string; desc: string }, i: number) => (
              <Link
                key={featureData[i].id}
                to={`/features#${featureData[i].id}`}
                className={`glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-500 group hover:-translate-y-1 hover:bg-white/5 relative overflow-hidden block no-underline ${featureData[i].span}`}
              >
                <div
                  className={`absolute top-0 left-0 w-full h-0.5 bg-linear-to-r ${featureData[i].color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                ></div>

                <div className="flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg bg-linear-to-br ${featureData[i].color} flex items-center justify-center shrink-0 text-white shadow-lg group-hover:scale-110 transition-transform duration-500`}
                  >
                    {featureData[i].icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold mb-1 tracking-tight group-hover:text-white transition-colors">
                      {f.title}
                    </h3>
                    <p className="text-xs text-white/30 leading-relaxed font-light">
                      {f.desc}
                    </p>
                    <span className="text-[10px] text-brand-primary font-semibold mt-2 inline-block opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {t.showcase.learnMore}
                    </span>
                  </div>
                </div>
              </Link>
            ),
          )}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 text-white/20">
          <Lock className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
            {t.showcase.securityBadge}
          </span>
          <Heart className="w-3.5 h-3.5" />
        </div>
      </div>
    </section>
  );
};

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
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('connect');

  const tabIcons = {
    connect: <Globe className="w-4 h-4" />,
    create: <Sparkles className="w-4 h-4" />,
    share: <Shield className="w-4 h-4" />,
  };

  const tabKeys = ['connect', 'create', 'share'] as const;

  return (
    <section className="py-10 max-w-5xl mx-auto px-6">
      <div className="text-center mb-10">
        <span className="text-brand-primary font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">
          {t.interactive.label}
        </span>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
          {t.interactive.title}
        </h2>
      </div>
      <div className="glass-panel rounded-2xl p-1.5 border border-white/5 max-w-4xl mx-auto flex flex-col lg:flex-row overflow-hidden min-h-[450px] md:min-h-[380px] shadow-2xl">
        {/* Sidebar / Tabs */}
        <div className="w-full lg:w-1/3 p-4 flex flex-row lg:flex-col gap-2 md:gap-3 border-b lg:border-b-0 lg:border-r border-white/5 relative z-20 overflow-x-auto no-scrollbar">
          <h3 className="hidden lg:block font-bold mb-2 text-white/30 uppercase tracking-[0.3em] text-[10px]">
            {t.interactive.navLabel}
          </h3>
          {tabKeys.map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => setActiveTab(id)}
              className={`p-2.5 md:p-3 rounded-xl text-left transition-all duration-500 flex items-center gap-2 md:gap-3 group relative overflow-hidden shrink-0 ${activeTab === id ? 'bg-white/10 shadow-xl scale-[1.02]' : 'hover:bg-white/2'}`}
            >
              {activeTab === id && (
                <div className="absolute left-0 lg:left-0 top-0 lg:top-0 bottom-0 lg:bottom-0 w-1 lg:w-1 h-0.5 lg:h-full bg-brand-primary"></div>
              )}
              <div
                className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all duration-500 ${activeTab === id ? 'bg-brand-primary text-white shadow-[0_0_15px_rgba(131,58,180,0.35)]' : 'bg-white/5 text-gray-500 group-hover:text-white group-hover:scale-110'}`}
              >
                {tabIcons[id]}
              </div>
              <div>
                <span
                  className={`block font-black text-xs md:text-sm transition-colors ${activeTab === id ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}
                >
                  {t.interactive.tabs[id].label}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="w-full lg:w-2/3 flex-1 min-h-[280px] p-6 md:p-10 relative flex items-center justify-center bg-black/20 overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] bg-size-[40px_40px]"></div>
          </div>
          {tabKeys.map((id) => (
            <div
              key={id}
              className={`absolute inset-0 p-6 md:p-10 flex flex-col justify-center transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${activeTab === id ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-12 scale-95 pointer-events-none'}`}
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-linear-to-br from-brand-primary via-brand-secondary to-brand-blue flex items-center justify-center mb-4 md:mb-6 shadow-lg">
                {tabIcons[id]}
              </div>
              <h2 className="text-2xl md:text-4xl font-black mb-3 md:mb-4 tracking-tighter leading-tight md:leading-none">
                {t.interactive.tabs[id].title}
              </h2>
              <p className="text-sm md:text-base text-white/40 leading-relaxed font-light italic">
                "{t.interactive.tabs[id].desc}"
              </p>

              <div className="mt-6 md:mt-8 h-1 w-full bg-white/5 rounded-full overflow-hidden">
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
