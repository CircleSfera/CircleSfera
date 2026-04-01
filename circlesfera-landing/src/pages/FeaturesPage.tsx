import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Camera, MessageCircle, Users, Globe, Play, Compass, Bookmark, BarChart3, Image, Shield, Eye, Scale, DollarSign, Database, Heart } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import SharedNav from '../components/SharedNav';
import SharedFooter from '../components/SharedFooter';

const FeaturesPage = () => {
  const { t } = useLanguage();
  const location = useLocation();

  const diffIcons = [
    <Scale className="w-5 h-5" />,
    <Eye className="w-5 h-5" />,
    <Globe className="w-5 h-5" />,
    <DollarSign className="w-5 h-5" />,
    <Shield className="w-5 h-5" />,
    <Database className="w-5 h-5" />
  ];

  const featureAssets = [
    { id: 'visual-feed', icon: <Image className="w-6 h-6" />, color: 'from-brand-secondary to-orange-600' },
    { id: 'stories', icon: <Camera className="w-6 h-6" />, color: 'from-brand-primary to-purple-600' },
    { id: 'frames', icon: <Play className="w-6 h-6" />, color: 'from-brand-blue to-blue-600' },
    { id: 'chat', icon: <MessageCircle className="w-6 h-6" />, color: 'from-emerald-500 to-teal-600' },
    { id: 'circles', icon: <Users className="w-6 h-6" />, color: 'from-brand-accent to-amber-600' },
    { id: 'explore', icon: <Compass className="w-6 h-6" />, color: 'from-cyan-500 to-blue-500' },
    { id: 'creator-studio', icon: <BarChart3 className="w-6 h-6" />, color: 'from-violet-500 to-purple-600' },
    { id: 'collections', icon: <Bookmark className="w-6 h-6" />, color: 'from-pink-500 to-rose-600' },
  ];

  // Smooth scroll to anchor on load
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.hash]);

  return (
    <div className="min-h-screen relative overflow-hidden text-white font-sans selection:bg-brand-primary/30">
      {/* Background */}
      <div className="fixed inset-0 z-[-1] bg-[#030303]">
        <div className="mesh-gradient-bg opacity-100" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 brightness-100 contrast-150 pointer-events-none mix-blend-overlay"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-brand-primary/20 rounded-full blur-[120px] animate-blob filter mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-brand-blue/20 rounded-full blur-[120px] animate-blob animation-delay-2000 filter mix-blend-screen"></div>
      </div>

      <SharedNav />

      {/* Hero */}
      <header className="max-w-4xl mx-auto px-6 pt-28 pb-10 md:pt-32 md:pb-12 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border border-white/10 mb-6 animate-float shadow-lg">
          <span className="text-[10px] font-black tracking-[0.3em] uppercase text-brand-primary">{t.featuresPage.label}</span>
        </div>
        <h1 className="text-2xl md:text-4xl font-black tracking-tighter mb-4 leading-[0.85] drop-shadow-2xl">
          {t.featuresPage.title} <br className="hidden md:block" />
          <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">{t.featuresPage.titleAccent}</span>
        </h1>
        <p className="max-w-xl mx-auto text-sm md:text-base text-white/30 leading-relaxed font-light italic">
          {t.featuresPage.subtitle}
        </p>
      </header>

      {/* About — Differentiators */}
      <section className="max-w-4xl mx-auto px-6 pb-16 relative z-10">
        <div className="text-center mb-12">
          <span className="text-brand-accent font-black text-[10px] tracking-[0.4em] uppercase mb-3 block opacity-60 animate-pulse">{t.featuresPage.diffLabel}</span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tighter mb-4 drop-shadow-lg">{t.featuresPage.diffTitle}</h2>
          <p className="text-base text-white/30 max-w-xl mx-auto font-light leading-relaxed italic">{t.featuresPage.diffSubtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {t.featuresPage.differentiators.map((d: { title: string; desc: string }, i: number) => {
            const glowColors = [
                'from-blue-500/20 via-blue-500/5 to-transparent',
                'from-brand-secondary/20 via-brand-secondary/5 to-transparent',
                'from-brand-blue/20 via-brand-blue/5 to-transparent',
                'from-brand-accent/20 via-brand-accent/5 to-transparent',
                'from-brand-primary/20 via-brand-primary/5 to-transparent',
                'from-emerald-500/20 via-emerald-500/5 to-transparent'
            ];
            const borderGlows = [
                'group-hover:border-blue-500/50',
                'group-hover:border-brand-secondary/50',
                'group-hover:border-brand-blue/50',
                'group-hover:border-brand-accent/50',
                'group-hover:border-brand-primary/50',
                'group-hover:border-emerald-500/50'
            ];
            const iconGlows = [
                'text-blue-400',
                'text-brand-secondary',
                'text-brand-blue',
                'text-brand-accent',
                'text-brand-primary',
                'text-emerald-400'
            ];
            
            return (
              <div key={d.title} className={`glass-panel p-6 rounded-3xl border border-white/5 transition-all duration-700 group hover:bg-white/4 relative overflow-hidden flex flex-col justify-end min-h-[220px] ${borderGlows[i]}`}>
                <div className={`absolute -top-20 -right-20 w-48 h-48 bg-linear-to-br ${glowColors[i]} rounded-full blur-[60px] group-hover:scale-125 transition-transform duration-1000`}></div>
                <div className="relative z-10">
                  <div className={`mb-4 transform group-hover:scale-105 transition-all duration-500 ease-out ${iconGlows[i]}`}>
                    {diffIcons[i]}
                  </div>
                  <h3 className="text-lg font-black mb-2 tracking-tighter text-white">{d.title}</h3>
                  <p className="text-xs text-white/30 leading-relaxed font-light line-clamp-2 group-hover:text-white/50 transition-colors">{d.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px w-full bg-white/5"></div>
      </div>

      {/* Feature Sections */}
      <section className="max-w-4xl mx-auto px-6 py-10 relative z-10">
        <div className="text-center mb-10">
          <span className="text-brand-primary font-bold text-[10px] tracking-[0.3em] uppercase mb-2 block opacity-60">{t.featuresPage.featLabel}</span>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t.featuresPage.featTitle}</h2>
        </div>

        <div className="space-y-8">
          {t.featuresPage.features.map((f: { title: string; subtitle: string; desc: string; details: string[] }, index: number) => {
            const asset = featureAssets[index];
            const color = asset.color;
            const icon = asset.icon;
            const id = asset.id;
            
            return (
              <div
                key={id}
                id={id}
                className="glass-panel rounded-4xl border border-white/5 overflow-hidden hover:border-white/10 transition-all duration-700 group scroll-mt-24 bg-white/1"
              >
                <div className={`h-1 bg-linear-to-r ${color} shadow-[0_0_20px_rgba(255,255,255,0.1)]`}></div>
                <div className={`p-5 md:p-6 flex flex-col ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} gap-6 items-center`}>
                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 mb-5">
                      <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${color} flex items-center justify-center text-white shadow-2xl transform group-hover:scale-105 transition-transform duration-500`}>
                        {icon}
                      </div>
                      <div>
                        <h3 className="text-xl font-black tracking-tighter">{f.title}</h3>
                        <p className="text-[10px] text-white/40 font-light italic tracking-widest uppercase">{f.subtitle}</p>
                      </div>
                    </div>
                    <p className="text-base text-white/40 leading-relaxed mb-6 font-light italic">{f.desc}</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {f.details.map((d: string) => (
                        <li key={d} className="flex items-start gap-2 p-2.5 rounded-xl bg-white/3 border border-white/5 transition-colors hover:bg-white/5">
                          <Heart className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-secondary fill-brand-secondary/50 group-hover:animate-pulse" />
                          <span className="text-[11px] text-white/30 leading-relaxed font-light">{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Visual preview */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className={`w-full aspect-square md:aspect-16/10 rounded-3xl bg-black/40 border border-white/5 relative overflow-hidden shadow-2xl transition-shadow duration-700`}>
                      {/* Ambient Glow */}
                      <div className={`absolute -inset-10 bg-linear-to-br ${color} opacity-10 blur-3xl`}></div>
                      {/* Grid pattern */}
                       <div className="absolute inset-0 opacity-5">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-size-[40px_40px]"></div>
                      </div>
                      {/* Feature-specific mockup */}
                      <div className="absolute inset-0 flex items-center justify-center p-6 scale-90 md:scale-100">
                        <FeatureMockup featureId={id} color={color} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-brand-primary/10 pointer-events-none"></div>
        <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-2xl md:text-4xl font-bold mb-4 tracking-tight">{t.featuresPage.ctaTitle}</h2>
          <p className="text-base text-white/40 mb-8 max-w-md mx-auto font-light">
            {t.featuresPage.ctaSubtitle}
          </p>
          <a href="/#whitelist" className="inline-flex items-center justify-center px-7 py-3.5 bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue text-white font-bold text-base rounded-full shadow-[0_0_30px_rgba(131,58,180,0.35)] hover:scale-105 transition-all border border-white/10 backdrop-blur-lg">
            {t.featuresPage.ctaButton}
          </a>
        </div>
      </section>

      <SharedFooter />
    </div>
  );
};

// Mini visual mockups for each feature section
const FeatureMockup = ({ featureId, color }: { featureId: string; color: string }) => {
  const { t } = useLanguage();
  
  const mockups: Record<string, React.ReactNode> = {
    'visual-feed': (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-white/10 animate-pulse"></div>
          <div className="h-2.5 w-20 bg-white/10 rounded-full"></div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 rounded-lg overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`aspect-square bg-linear-to-br ${i === 0 ? color : 'from-white/5 to-white/10'} rounded-sm ${i === 0 ? 'opacity-80' : 'opacity-30'}`}></div>
          ))}
        </div>
        <div className="flex gap-4 pt-1">
          <Heart className="w-4 h-4 text-white/20" />
          <MessageCircle className="w-4 h-4 text-white/20" />
          <Bookmark className="w-4 h-4 text-white/20 ml-auto" />
        </div>
      </div>
    ),
    'stories': (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <div className="flex gap-4 mb-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className={`w-12 h-12 rounded-full ${i === 0 ? `bg-linear-to-br ${color} shadow-[0_0_15px_rgba(131,58,180,0.3)]` : 'bg-white/10'} ${i === 0 ? 'ring-2 ring-brand-primary' : 'ring-1 ring-white/10'}`}></div>
              <div className="h-1.5 w-8 bg-white/10 rounded-full"></div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-white/20 uppercase tracking-widest">{t.mockups.tapToView}</div>
      </div>
    ),
    'frames': (
      <div className="p-4 flex items-center justify-center h-full relative">
        <div className="w-28 h-44 bg-white/5 rounded-xl border border-white/10 relative overflow-hidden">
          <div className={`absolute inset-0 bg-linear-to-b ${color} opacity-20`}></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
          <div className="absolute bottom-2 left-2 right-2">
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full w-1/3 bg-linear-to-r ${color} rounded-full`}></div>
            </div>
          </div>
        </div>
      </div>
    ),
    'chat': (
      <div className="p-4 space-y-3 flex flex-col justify-end h-full">
        <div className="flex justify-start"><div className="px-3 py-2 bg-white/5 rounded-xl rounded-bl-sm text-[10px] text-white/40 max-w-[60%]">{t.mockups.chat.msg1}</div></div>
        <div className="flex justify-end"><div className={`px-3 py-2 bg-linear-to-r ${color} rounded-xl rounded-br-sm text-[10px] text-white/80 max-w-[60%]`}>{t.mockups.chat.msg2}</div></div>
        <div className="flex justify-start"><div className="px-3 py-2 bg-white/5 rounded-xl rounded-bl-sm text-[10px] text-white/40 max-w-[60%]">{t.mockups.chat.msg3}</div></div>
        <div className="flex gap-2 mt-1">
          <div className="flex-1 h-8 bg-white/5 rounded-full border border-white/10"></div>
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10"></div>
        </div>
      </div>
    ),
    'circles': (
      <div className="p-4 space-y-2">
        {[
          { name: t.mockups.circles.photography, count: 340 },
          { name: t.mockups.circles.musicProduction, count: 680 },
          { name: t.mockups.circles.digitalArt, count: 1020 }
        ].map((circle, i) => (
          <div key={circle.name} className={`flex items-center gap-3 p-2.5 rounded-xl ${i === 0 ? 'bg-white/5 border border-white/10' : ''}`}>
            <div className={`w-9 h-9 rounded-lg ${i === 0 ? `bg-linear-to-br ${color}` : 'bg-white/10'} flex items-center justify-center shrink-0`}>
              <Users className="w-4 h-4 text-white/60" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-white/60">{circle.name}</div>
              <div className="text-[9px] text-white/20">{circle.count} {t.mockups.circles.members}</div>
            </div>
          </div>
        ))}
      </div>
    ),
    'explore': (
      <div className="p-3">
        <div className="grid grid-cols-3 gap-1.5">
          {[...Array(9)].map((_, i) => (
            <div key={i} className={`aspect-square rounded-sm ${i === 4 ? `bg-linear-to-br ${color} opacity-60 col-span-1 row-span-1` : 'bg-white/5'}`}></div>
          ))}
        </div>
      </div>
    ),
    'creator-studio': (
      <div className="p-4 space-y-3">
        <div className="flex items-end gap-1 h-20">
          {[30, 45, 35, 60, 50, 75, 65, 80, 70, 90, 85, 95].map((h, i) => (
            <div key={i} className={`flex-1 rounded-t-sm ${i >= 10 ? `bg-linear-to-t ${color} opacity-80` : 'bg-white/10'}`} style={{ height: `${h}%` }}></div>
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-white/20">
          <span>{t.mockups.months.jan}</span><span>{t.mockups.months.jun}</span><span>{t.mockups.months.dec}</span>
        </div>
      </div>
    ),
    'collections': (
      <div className="p-4 grid grid-cols-2 gap-2">
        {[
          t.mockups.collections.inspiration,
          t.mockups.collections.travel,
          t.mockups.collections.art,
          t.mockups.collections.music
        ].map((name, i) => (
          <div key={name} className={`aspect-4/3 rounded-lg ${i === 0 ? `bg-linear-to-br ${color} opacity-60` : 'bg-white/5'} flex items-end p-2`}>
            <span className="text-[9px] font-bold text-white/50">{name}</span>
          </div>
        ))}
      </div>
    ),
  };

  return mockups[featureId] || null;
};

export default FeaturesPage;
