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
    <div className="absolute inset-0 z-50 bg-black flex flex-col">
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-full h-full bg-black flex flex-col relative"
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-radial-[at_50%_0%] from-brand-primary/10 via-transparent to-transparent pointer-events-none" />

        <div className="sticky top-0 z-10 flex items-center px-4 h-14 bg-black border-b border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-2 text-white/90 hover:text-white transition-colors"
          >
            <X size={24} strokeWidth={2} />
          </button>
          <h2 className="flex-1 text-center font-bold text-[15px] tracking-tight text-white pr-6">
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
