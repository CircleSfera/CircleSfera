import { motion } from 'framer-motion';
import {
  AtSign,
  ChevronRight,
  Database,
  Eye,
  Gavel,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/logo.png';
import SEO from '../components/common/SEO';
import { useAuthStore } from '../stores/authStore';

const sections = [
  {
    id: 'overview',
    title: '1. Overview',
    icon: Eye,
    content: `At CircleSfera, we value your privacy above all. This policy outlines how we collect, use, and protect your data as a provider of a refined social networking experience and creator tools. We are committed to transparency and security in every interaction.`,
    color: 'brand-blue',
  },
  {
    id: 'collection',
    title: '2. Data We Collect',
    icon: Database,
    content: `To provide our service, we collect Account Information (email, credentials), Profile Data (uploaded media, bios), and Billing Information. Billing details are processed securely by Stripe; CircleSfera never stores full card numbers on its servers.`,
    color: 'brand-primary',
  },
  {
    id: 'usage',
    title: '3. Data Usage',
    icon: Zap,
    content: `Your data is used exclusively to maintain your social experience and process subscriptions. Under our SaaS model, we do not facilitate peer-to-peer money transfers or third-party marketplace settlements, ensuring your data stays within our secure ecosystem.`,
    color: 'brand-accent',
  },
  {
    id: 'security',
    title: '4. Absolute Security',
    icon: ShieldCheck,
    content: `CircleSfera employs industry-standard encryption and security protocols to safeguard your universe. All financial transactions are handled by Stripe, a PCI-compliant payment provider, ensuring the highest level of trust.`,
    color: 'emerald-500',
  },
  {
    id: 'contact',
    title: '5. Legal Contact',
    icon: AtSign,
    content: `For any privacy concerns or data requests, our specialized legal team is ready to assist. Contact us directly at legal@circlesfera.com for comprehensive support regarding your digital rights.`,
    color: 'brand-secondary',
  },
];

export default function PrivacyPolicy() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const scrollTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white pt-24 pb-24 px-6 font-sans relative overflow-hidden selection:bg-brand-primary/30">
      <SEO title="Privacy Policy - CircleSfera" />

      {/* Immersive Background (Synced with LandingPage) */}
      <div className="fixed inset-0 z-[-1] bg-[#030303]">
        <div className="mesh-gradient-bg opacity-100" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E')] opacity-10 brightness-100 contrast-150 pointer-events-none mix-blend-overlay"></div>
        {/* Animated Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-brand-primary/20 rounded-full blur-[120px] animate-blob filter mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-brand-blue/20 rounded-full blur-[120px] animate-blob animation-delay-2000 filter mix-blend-screen"></div>
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] bg-brand-secondary/15 rounded-full blur-[100px] animate-blob animation-delay-4000 filter mix-blend-screen"></div>
      </div>

      {/* Guest Navigation (Only if not logged in) */}
      {!isAuthenticated && (
        <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5 px-6 py-3 flex justify-between items-center backdrop-blur-xl bg-black/20">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-linear-to-tr from-brand-primary via-brand-secondary to-brand-accent flex items-center justify-center shadow-lg shadow-brand-primary/20 rotate-3 hover:rotate-0 transition-transform duration-300">
              <img src={logoSrc} alt="CircleSfera" className="w-full h-full object-contain" />
            </div>
            <span className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
              CircleSfera
            </span>
          </Link>
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
      )}

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Sticky Navigation Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-28 space-y-6">
              <div>
                <span className="text-brand-primary font-black text-[9px] tracking-[0.3em] uppercase mb-3 block">
                  Privacy Hub
                </span>
                <h1 className="text-3xl font-black tracking-tighter italic uppercase leading-tight">
                  Data
                  <br />
                  Protection
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
                  Tu privacidad es la piedra angular de nuestro ecosistema
                  social. Implementamos arquitectura de seguridad de grado
                  militar para proteger cada bit.
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
                  Legal Center
                </span>
                <h1 className="text-4xl font-black tracking-tighter italic uppercase leading-tight">
                  Privacy
                  <br />
                  Policy
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
                  Last Updated: April 2026 • Tiered Data Protection •
                  CircleSfera Security Hub
                </p>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
