import { motion } from 'framer-motion';
import { MapPin, Navigation, Search, X } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui';

interface LocationSubScreenProps {
  onClose: () => void;
  onSelect: (location: string) => void;
  currentLocation?: string;
}

export default function LocationSubScreen({
  onClose,
  onSelect,
  currentLocation = '',
}: LocationSubScreenProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = React.useState('');

  const locations = [
    'New York, USA',
    'London, UK',
    'Paris, France',
    'Tokyo, Japan',
    'Dubai, UAE',
    'Los Angeles, CA',
    'Miami, FL',
    'Bali, Indonesia',
  ];

  const filteredLocations = locations.filter((loc) =>
    loc.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="absolute inset-0 z-50 bg-surface-base flex flex-col">
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-full h-full bg-surface-base flex flex-col relative"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 px-2 h-(--nav-top-height,52px) bg-surface-elevated border-b border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 flex items-center justify-center text-white hover:bg-white/8 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            aria-label={t('createPost.header.back')}
          >
            <X size={22} strokeWidth={2} />
          </button>
          <h2 className="font-bold text-base tracking-tight text-white">
            {t('createPost.location.title')}
          </h2>
        </div>

        <div className="p-4 relative z-10">
          <div className="relative">
            <Input
              type="text"
              placeholder={t('createPost.location.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search size={18} className="text-white/40" />}
            />
          </div>

          <button
            type="button"
            className="w-full mt-4 flex items-center gap-3 px-2 py-1 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 transition-all"
          >
            <Navigation size={18} />
            <span className="text-sm font-semibold">
              {t('createPost.location.use_current')}
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 relative z-10">
          {filteredLocations.length > 0 ? (
            filteredLocations.map((loc, idx) => {
              const isSelected = currentLocation === loc;
              return (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  type="button"
                  key={loc}
                  onClick={() => onSelect(loc)}
                  className={`w-full flex items-center gap-4 px-2 py-1.5 rounded-lg transition-all duration-200 group ${
                    isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-brand-primary text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                        : 'bg-white/5 text-white/50 group-hover:bg-white/10 group-hover:text-white/80'
                    }`}
                  >
                    <MapPin size={18} />
                  </div>
                  <div className="text-left flex-1 border-b border-white/5 group-hover:border-transparent pb-3 pt-3 -my-3">
                    <div
                      className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-white/80 group-hover:text-white'}`}
                    >
                      {loc}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {t('createPost.location.suggested')}
                    </div>
                  </div>
                </motion.button>
              );
            })
          ) : (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <MapPin size={24} className="text-white/20" />
              </div>
              <p className="text-sm font-medium text-white/60">
                {t('createPost.location.not_found')}
              </p>
              <p className="text-xs text-white/30 mt-1">
                {t('createPost.location.try_different')}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
