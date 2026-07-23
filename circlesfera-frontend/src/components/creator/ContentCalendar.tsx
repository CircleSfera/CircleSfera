import { Calendar, Clock, Sparkles } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface ScheduledPostItem {
  id: string;
  caption: string;
  scheduledAt: string;
  peakHourSuggested: boolean;
}

/** @deprecated Mock-only calendar. Not wired to Creator Studio — do not mount in production flows. */
export const ContentCalendar: React.FC = () => {
  const [scheduledPosts] = useState<ScheduledPostItem[]>([
    {
      id: 'sch-1',
      caption: 'Lanzamiento exclusivo de nuevo vídeo',
      scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      peakHourSuggested: true,
    },
    {
      id: 'sch-2',
      caption: 'Behind the scenes: Sesión de fotos',
      scheduledAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      peakHourSuggested: false,
    },
  ]);

  return (
    <div className="p-5 bg-white/5 border border-white/5 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-accent-blue" />
          <h3 className="text-sm font-bold text-white tracking-tight">
            Calendario de Contenidos & Programación Inteligente
          </h3>
        </div>

        <span className="px-2.5 py-1 bg-accent-blue/10 text-accent-blue text-xs font-bold rounded-lg flex items-center space-x-1">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Sugerencia: 20:00 UTC</span>
        </span>
      </div>

      <div className="space-y-3 pt-1">
        {scheduledPosts.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">
            No tienes publicaciones agendadas.
          </p>
        ) : (
          scheduledPosts.map((post) => (
            <div
              key={post.id}
              className="flex items-center justify-between p-3.5 bg-black/40 border border-white/10 rounded-xl"
            >
              <div className="space-y-1">
                <p className="text-xs font-semibold text-white">
                  {post.caption}
                </p>
                <div className="flex items-center space-x-2 text-[11px] text-gray-400">
                  <Clock className="w-3.5 h-3.5 text-accent-blue" />
                  <span>{new Date(post.scheduledAt).toLocaleString()}</span>
                  {post.peakHourSuggested && (
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">
                      Hora Pico Optimizada
                    </span>
                  )}
                </div>
              </div>

              <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold rounded-lg">
                Agendado
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
