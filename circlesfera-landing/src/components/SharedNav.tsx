import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { Globe } from 'lucide-react';

const SharedNav = () => {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const isFeatures = location.pathname === '/features';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5 px-4 md:px-6 py-3 flex justify-between items-center backdrop-blur-xl bg-black/20">
      <div className="flex items-center gap-2">
        <Link 
          to="/" 
          onClick={(e) => {
            if (location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          className="flex items-center gap-2 group"
        >
          <div className="w-8 h-8 flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform duration-300">
            <img src="/logo.png" alt="CircleSfera" className="w-full h-full object-contain" />
          </div>
          <span className="hidden sm:block text-xl font-black tracking-tight bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">CircleSfera</span>
        </Link>
      </div>
      <div className="flex items-center gap-2 md:gap-6">
        <div className="hidden md:flex items-center gap-5">
          <Link 
            to="/features" 
            className={`text-xs font-semibold transition-colors tracking-wide uppercase ${isFeatures ? 'text-white' : 'text-white/50 hover:text-white'}`}
          >
            {t.nav.features}
          </Link>
        </div>

        {/* Language Switcher */}
        <div className="flex items-center gap-1 glass-panel px-1.5 py-1 rounded-full border border-white/5">
          <Globe className="w-3 h-3 text-white/30 hidden xs:block" />
          <button 
            onClick={() => setLanguage('en')}
            className={`text-[9px] md:text-[10px] font-bold px-1.5 transition-colors ${language === 'en' ? 'text-brand-primary' : 'text-white/30 hover:text-white'}`}
          >
            EN
          </button>
          <div className="w-px h-2 bg-white/10"></div>
          <button 
            onClick={() => setLanguage('es')}
            className={`text-[9px] md:text-[10px] font-bold px-1.5 transition-colors ${language === 'es' ? 'text-brand-primary' : 'text-white/30 hover:text-white'}`}
          >
            ES
          </button>
        </div>

        <a 
          href={isFeatures ? '/#whitelist' : '#whitelist'} 
          onClick={(e) => {
            if (!isFeatures) {
              e.preventDefault();
              document.getElementById('whitelist')?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="px-3 md:px-5 py-2 text-[10px] md:text-xs font-bold bg-white text-black rounded-full hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)] whitespace-nowrap"
        >
          {t.nav.joinWhitelist}
        </a>
      </div>
    </nav>
  );
};

export default SharedNav;
