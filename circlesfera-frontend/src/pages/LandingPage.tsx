import {
  Camera,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  MessageCircle,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { paymentsApi } from '../services/payments.service';
import { useAuthStore } from '../stores/authStore';
import logoSrc from '../assets/logo.png';

const LandingPage = () => {
  return (
    <div className="min-h-screen relative overflow-hidden text-white font-sans selection:bg-brand-primary/30">
      <SEO
        title="CircleSfera - Social Reimagined"
        description="Experience the next generation of social media. An immersive visual storytelling platform for authentic connections and distinct creativity."
      />
      {/* Background with higher quality mesh and noise */}
      <div className="fixed inset-0 z-[-1] bg-[#030303]">
        <div className="mesh-gradient-bg opacity-100" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 brightness-100 contrast-150 pointer-events-none mix-blend-overlay"></div>
        {/* Animated Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-brand-primary/20 rounded-full blur-[120px] animate-blob filter mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-brand-blue/20 rounded-full blur-[120px] animate-blob animation-delay-2000 filter mix-blend-screen"></div>
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] bg-brand-secondary/15 rounded-full blur-[100px] animate-blob animation-delay-4000 filter mix-blend-screen"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5 px-6 py-3 flex justify-between items-center backdrop-blur-xl bg-black/20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-linear-to-tr from-brand-primary via-brand-secondary to-brand-accent flex items-center justify-center shadow-lg shadow-brand-primary/20 rotate-3 hover:rotate-0 transition-transform duration-300">
            <img src={logoSrc} alt="CircleSfera" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
            CircleSfera
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link
            to="/accounts/login"
            className="text-xs font-semibold text-white/70 hover:text-white transition-colors tracking-wide uppercase"
          >
            Log In
          </Link>
          <Link
            to="/accounts/emailsignup"
            className="px-5 py-2 text-xs font-bold bg-white text-black rounded-full hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            Sign Up
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
            Social Reimagined
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-6 leading-[0.9] drop-shadow-2xl">
          Share Your <br className="hidden md:block" />
          <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">
            Universe
          </span>
        </h1>

        <p className="max-w-md text-base md:text-lg text-white/50 mb-10 leading-relaxed font-light tracking-wide italic">
          Connect with friends, share your moments, and explore a world of
          creativity. Experience a social platform designed for distinct visual
          storytelling.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link
            to="/accounts/emailsignup"
            className="group relative px-6 py-3 bg-white text-black font-bold text-sm rounded-full transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95"
          >
            <span className="flex items-center justify-center gap-2">
              Get Started
              <Zap className="w-4 h-4 fill-black group-hover:rotate-12 transition-transform" />
            </span>
          </Link>
          <Link
            to="/explore"
            className="px-6 py-3 glass-panel rounded-full text-white text-sm font-bold hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border border-white/5"
          >
            Explore Demo
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
              Immersive Visuals
            </h3>
            <p className="text-white/50 max-w-md text-sm leading-relaxed">
              Experience a social interaction layer that prioritizes content
              depth.
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
                Community
              </span>
              <span className="text-lg font-bold text-white/5">•</span>
              <span className="text-xl font-black text-white/15 tracking-[0.25em] uppercase transition-colors hover:text-brand-secondary duration-500 cursor-default">
                Creativity
              </span>
              <span className="text-lg font-bold text-white/5">•</span>
              <span className="text-xl font-black text-white/15 tracking-[0.25em] uppercase transition-colors hover:text-brand-blue duration-500 cursor-default">
                Connection
              </span>
              <span className="text-lg font-bold text-white/5">•</span>
              <span className="text-xl font-black text-white/15 tracking-[0.25em] uppercase transition-colors hover:text-brand-accent duration-500 cursor-default">
                Innovation
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
              Everything you need
            </h2>
            <p className="text-sm text-white/30 max-w-md mx-auto font-light italic">
              Built for the next generation of visual storytellers.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Camera className="w-6 h-6 text-brand-secondary" />}
              title="Capture"
              description="High definition sharing. Advanced filters and storytelling tools designed for visual depth."
            />
            <FeatureCard
              icon={<Users className="w-6 h-6 text-brand-primary" />}
              title="Community"
              description="Create your own Circles, join immersive groups, and connect with minds that inspire you."
            />
            <FeatureCard
              icon={<MessageCircle className="w-6 h-6 text-brand-blue" />}
              title="Real-time"
              description="Stay in touch with secure, encrypted instant messaging that feels as smooth as the feed."
            />
          </div>
        </div>
      </section>

      <PricingSection />

      {/* FAQ Section */}
      <section className="py-16 relative bg-white/1">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-brand-accent font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">
              General Knowledge
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Questions
            </h2>
          </div>
          <div className="space-y-4">
            <FAQItem
              question="Is CircleSfera free to use?"
              answer="CircleSfera offers a comprehensive free tier for all users. For creators and businesses looking for advanced tools, verification badges, and deeper analytics, we offer specialized subscription tiers."
            />
            <FAQItem
              question="How do I verify my account?"
              answer="Verification is currently rolled out selectively to active creators and public figures to maintain authenticity across the platform."
            />
            <FAQItem
              question="Is my data secure?"
              answer="Security is our foundation. We use state-of-the-art encryption and never sell your personal data. You have full ownership and control."
            />
            <FAQItem
              question="Will there be a mobile app?"
              answer="We are building native iOS and Android experiences that will mirror the desktop's signature glassmorphic feel, launching later this year."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-brand-primary/10 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-2xl md:text-4xl font-bold mb-4 tracking-tight">
            Ready to join?
          </h2>
          <p className="text-base text-white/40 mb-8 max-w-md mx-auto font-light">
            Thousands of creators are already shaping the next generation. Claim
            your space today.
          </p>
          <Link
            to="/accounts/emailsignup"
            className="inline-flex items-center justify-center px-7 py-3.5 bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue text-white font-bold text-base rounded-full shadow-[0_0_30px_rgba(131,58,180,0.35)] hover:scale-105 transition-all border border-white/10 backdrop-blur-lg"
          >
            Create Account
            <Zap className="w-4 h-4 ml-2 fill-white" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-14 border-t border-white/5 bg-black text-sm relative">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 text-white/40 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 flex items-center justify-center">
                <img src={logoSrc} alt="CircleSfera" className="w-full h-full object-contain" />
              </div>
              <span className="font-black text-lg text-white/80 tracking-tight">
                CircleSfera
              </span>
            </div>
            <p className="max-w-xs leading-relaxed text-sm">
              A refined social layer built for those who value visual depth and
              authentic connection.
            </p>
          </div>
          <div>
            <h4 className="text-white/80 font-bold uppercase tracking-widest text-[10px] mb-5">
              Platform
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/explore"
                  className="hover:text-white transition-colors"
                >
                  Explore
                </Link>
              </li>
              <li>
                <Link
                  to="/accounts/login"
                  className="hover:text-white transition-colors"
                >
                  Log In
                </Link>
              </li>
              <li>
                <Link
                  to="/accounts/emailsignup"
                  className="hover:text-white transition-colors"
                >
                  Sign Up
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white/80 font-bold uppercase tracking-widest text-[10px] mb-5">
              Legal
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/privacy"
                  className="hover:text-white transition-colors"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="hover:text-white transition-colors"
                >
                  Terms
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  className="hover:text-white transition-colors text-left"
                >
                  Guidelines
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-xs opacity-50">
          <p>&copy; 2026 CircleSfera Social. All rights reserved.</p>
          <p className="mt-3 md:mt-0">
            Designed for the next generation of creators.
          </p>
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
  const [activeTab, setActiveTab] = useState('connect');

  const tabs = [
    {
      id: 'connect',
      label: 'Connect',
      icon: <Globe className="w-4 h-4" />,
      title: 'Global Network',
      desc: 'Instantly connect with creators from around the world without geographical borders or content silos.',
    },
    {
      id: 'create',
      label: 'Create',
      icon: <Sparkles className="w-4 h-4" />,
      title: 'Artistic Expression',
      desc: 'Our built-in engine favors depth and texture, giving your stories a unique cinematic quality.',
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Shield className="w-4 h-4" />,
      title: 'Private Spheres',
      desc: 'Granular control over who sees your content, from specific Circles to the entire Universe.',
    },
  ];

  return (
    <section className="py-16 max-w-5xl mx-auto px-6">
      <div className="text-center mb-10">
        <span className="text-brand-primary font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">
          The Platform
        </span>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
          Engineered for depth
        </h2>
      </div>
      <div className="glass-panel rounded-2xl p-1.5 border border-white/5 max-w-4xl mx-auto flex flex-col lg:flex-row overflow-hidden min-h-[380px] shadow-2xl">
        {/* Sidebar / Tabs */}
        <div className="w-full lg:w-1/3 p-4 flex flex-col gap-3 border-b lg:border-b-0 lg:border-r border-white/5 relative z-20">
          <h3 className="font-bold mb-2 text-white/30 uppercase tracking-[0.3em] text-[10px]">
            Navigation System
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
        <div className="w-full lg:w-2/3 p-6 md:p-10 relative flex items-center justify-center bg-black/20 overflow-hidden">
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

const PricingSection = () => {
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
    <section id="pricing" className="py-24 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="text-brand-primary font-bold text-[10px] tracking-[0.3em] uppercase mb-4 block opacity-80">
            Pricing Plans
          </span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-6">
            Choose your{' '}
            <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary to-brand-primary">
              Experience
            </span>
          </h2>
          <p className="text-white/40 max-w-lg mx-auto font-light">
            Select the plan that fits your creative needs. From individual
            creators to global brands.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`glass-panel rounded-3xl p-8 border transition-all duration-500 flex flex-col relative group hover:-translate-y-2 ${
                tier.popular
                  ? 'border-brand-primary/40 bg-white/5 ring-1 ring-brand-primary/20 scale-105 z-20'
                  : 'border-white/5 hover:border-white/10'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-brand-primary rounded-full text-[10px] font-black tracking-widest uppercase shadow-xl shadow-brand-primary/20">
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-black tracking-tight mb-2">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">€{tier.price}</span>
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
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  tier.buttonText
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Background Accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-primary/5 rounded-full blur-[150px] pointer-events-none"></div>
    </section>
  );
};

export default LandingPage;
