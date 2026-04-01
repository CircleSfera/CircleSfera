import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';

const SharedFooter = () => {
  const { t } = useLanguage();
  
  return (
    <footer className="py-12 border-t border-white/5 bg-black text-sm relative">
      <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-white/40 mb-10">
        <div className="col-span-1 md:col-span-2">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/logo.png" alt="CircleSfera" className="w-full h-full object-contain" />
            </div>
            <span className="font-black text-xl tracking-tight bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">CircleSfera</span>
          </div>
          <p className="max-w-xs leading-relaxed text-sm">{t.footer.description}</p>
        </div>
        <div>
          <h4 className="text-white/80 font-bold uppercase tracking-widest text-[10px] mb-5">{t.footer.platformLabel}</h4>
          <ul className="space-y-3">
            <li><a href="/#whitelist" className="hover:text-white transition-colors">{t.footer.joinWhitelist}</a></li>
            <li><Link to="/features" className="hover:text-white transition-colors">{t.footer.features}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white/80 font-bold uppercase tracking-widest text-[10px] mb-5">{t.footer.legalLabel}</h4>
          <ul className="space-y-3">
            <li><a href="#" className="hover:text-white transition-colors">{t.footer.privacy}</a></li>
            <li><a href="#" className="hover:text-white transition-colors">{t.footer.terms}</a></li>
            <li><a href="#" className="hover:text-white transition-colors">{t.footer.guidelines}</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-[10px] opacity-40">
        <p>&copy; 2026 CircleSfera Social. {t.footer.rightsReserved}</p>
        <p className="mt-3 md:mt-0">{t.footer.designedFor}</p>
      </div>
    </footer>
  );
};

export default SharedFooter;
