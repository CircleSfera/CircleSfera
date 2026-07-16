import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Globe,
  Hash,
  Megaphone,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { Post } from '../../types';
import { Button } from '../ui';

interface Props {
  post: CreatorPost | Post;
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function PromoteModal({ post, onClose, onToast }: Props) {
  const queryClient = useQueryClient();

  const [objective, setObjective] = useState('PROFILE_VISITS');
  const [dailyBudget, setDailyBudget] = useState(5);
  const [durationDays, setDurationDays] = useState(3);
  const [countries, setCountries] = useState('');
  const [interests, setInterests] = useState('');

  const totalBudget = dailyBudget * durationDays;

  const mutation = useMutation({
    mutationFn: () =>
      creatorApi.createPromotion({
        targetType: (post.type || 'POST').toLowerCase(),
        targetId: post.id,
        dailyBudget,
        durationDays,
        currency: 'EUR',
        objective,
        countries: countries.trim(),
        interests: interests.trim(),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      onToast('Redirigiendo a pago seguro...', 'success');
      const { url } = response.data;
      if (url) {
        window.location.href = url;
      }
    },
    onError: () => onToast('Error al crear promoción', 'error'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="glass-panel rounded-xl border border-white/10 w-full max-w-md overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Megaphone size={20} className="text-brand-primary" />
            <h2 className="text-white font-black text-lg">Promocionar</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} className="text-gray-400" />
          </Button>
        </div>

        {/* Content Preview */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-white/5 overflow-hidden shrink-0">
              {post.media?.[0] ? (
                <img
                  src={post.media[0].url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  <Sparkles size={24} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-bold truncate">
                {post.caption || 'Sin caption'}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">
                {post.type} · {post._count?.likes || 0} likes ·{' '}
                {post._count?.comments || 0} comentarios
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Objective Selection */}
          <div>
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1">
              <Target size={14} /> Objetivo de la Campaña
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'PROFILE_VISITS', label: 'Visitas al Perfil' },
                { id: 'FOLLOWS', label: 'Conseguir Seguidores' },
                { id: 'TIER_CONVERSIONS', label: 'Conversiones a Suscripción' },
              ].map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setObjective(obj.id)}
                  className={`p-3 text-left rounded-xl border transition-all text-sm font-bold ${
                    objective === obj.id
                      ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                      : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/15'
                  }`}
                  type="button"
                >
                  {obj.label}
                </button>
              ))}
            </div>
          </div>

          {/* Budget & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="dailyBudgetInput"
                className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block"
              >
                Presupuesto Diario (€)
              </label>
              <input
                id="dailyBudgetInput"
                type="number"
                min="1"
                max="1000"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div>
              <label
                htmlFor="durationDaysInput"
                className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block"
              >
                Duración (Días)
              </label>
              <input
                id="durationDaysInput"
                type="number"
                min="1"
                max="30"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Segmentation */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="countriesInput"
                className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1"
              >
                <Globe size={14} /> Países (Ej. ES, MX, US)
              </label>
              <input
                id="countriesInput"
                type="text"
                placeholder="Todos los países"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div>
              <label
                htmlFor="interestsInput"
                className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1"
              >
                <Hash size={14} /> Intereses (Ej. Música, Moda)
              </label>
              <input
                id="interestsInput"
                type="text"
                placeholder="Todos los intereses"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="px-5 pb-5">
          <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-brand-primary/80">
                <DollarSign size={14} /> Presupuesto Total
              </span>
              <span className="text-white font-black text-lg">
                €{totalBudget}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-brand-primary/60">
              <span>
                €{dailyBudget}/día durante {durationDays} días
              </span>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="p-5 pt-0">
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            className="w-full"
            disabled={totalBudget <= 0}
          >
            <Megaphone size={16} className="mr-2" /> Promocionar Campaña
          </Button>
          <p className="text-center text-gray-600 text-xs mt-3">
            Al promocionar, aceptas nuestras condiciones de uso y publicidad.
          </p>
        </div>
      </div>
    </div>
  );
}
