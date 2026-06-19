import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, DollarSign, Megaphone, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { Button } from '../ui';

const BUDGET_OPTIONS = [
  { value: 5, label: '€5', duration: 3 },
  { value: 10, label: '€10', duration: 7 },
  { value: 25, label: '€25', duration: 14 },
  { value: 50, label: '€50', duration: 30 },
];

interface Props {
  post: CreatorPost;
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function PromoteModal({ post, onClose, onToast }: Props) {
  const queryClient = useQueryClient();
  const [selectedIdx, setSelectedIdx] = useState(1); // default €10
  const selected = BUDGET_OPTIONS[selectedIdx];

  const mutation = useMutation({
    mutationFn: () =>
      creatorApi.createPromotion({
        targetType: post.type.toLowerCase(),
        targetId: post.id,
        budget: selected.value,
        durationDays: selected.duration,
        currency: 'EUR',
      }),
    onSuccess: (response) => {
      // Implement: Invalidate queries before redirecting
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-xl border border-white/10 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Megaphone size={20} className="text-brand-primary" />
            <h2 className="text-white font-black text-lg">Promocionar</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
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
                {post.type} · {post._count.likes} likes · {post._count.comments}{' '}
                comentarios
              </p>
            </div>
          </div>
        </div>

        {/* Budget Selection */}
        <div className="p-5">
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">
            Selecciona presupuesto
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {BUDGET_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedIdx === i
                    ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                    : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/15'
                }`}
              >
                <span className="block text-lg font-black">{opt.label}</span>
                <span className="block text-xs mt-0.5">
                  {opt.duration} días
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="px-5 pb-5">
          <div className="bg-white/5 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-gray-400">
                <DollarSign size={14} /> Presupuesto
              </span>
              <span className="text-white font-bold">{selected.label}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-gray-400">
                <Calendar size={14} /> Duración
              </span>
              <span className="text-white font-bold">
                {selected.duration} días
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
          >
            <Megaphone size={16} className="mr-2" /> Promocionar por {selected.label}
          </Button>
          <p className="text-center text-gray-600 text-xs mt-2">
            Al promocionar, aceptas nuestras condiciones de uso y publicidad.
          </p>
        </div>
      </div>
    </div>
  );
}
