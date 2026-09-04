import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router-dom';
import ConversationList from '../components/chat/ConversationList';
import SEO from '../components/common/SEO';
import { useSocketStore } from '../stores/socketStore';

export default function Messages() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { connect } = useSocketStore();

  // Socket connection is now handled globally in AuthGuard/Layout
  // We only ensure it's connected here as a fallback
  useEffect(() => {
    connect();
  }, [connect]);

  const isThreadView = Boolean(id);

  return (
    <div
      className={`w-full flex flex-col overflow-hidden bg-transparent max-md:fixed max-md:inset-x-0 max-md:z-30 ${
        isThreadView
          ? 'max-md:top-0 max-md:bottom-[calc(var(--nav-bottom-height)+env(safe-area-inset-bottom,0px))]'
          : 'max-md:top-[calc(var(--nav-top-height)+env(safe-area-inset-top,0px))] max-md:bottom-[calc(var(--nav-bottom-height)+env(safe-area-inset-bottom,0px))]'
      } md:relative md:inset-auto md:flex-1 md:min-h-0 md:h-full md:items-center md:justify-center md:px-6 lg:px-10 md:py-8`}
    >
      <SEO title={t('chat.messages')} />
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 h-full w-full max-w-6xl mx-auto overflow-hidden md:h-[min(900px,calc(100dvh-4rem))] md:min-h-[680px] md:flex-none md:glass-panel md:rounded-2xl md:border md:border-white/10 md:shadow-[0_16px_56px_rgba(0,0,0,0.45)]">
        {/* Conversation List - Smart visibility on mobile */}
        <div
          className={`w-full lg:w-[360px] xl:w-[400px] shrink-0 border-r border-white/10 bg-zinc-950/20 backdrop-blur-2xl ${isThreadView ? 'hidden lg:flex lg:flex-col lg:min-h-0' : 'flex flex-col flex-1 min-h-0 h-full'}`}
        >
          <ConversationList />
        </div>

        {/* Chat Area - Smart visibility on mobile */}
        <div
          className={`flex flex-1 flex-col min-h-0 min-w-0 h-full bg-zinc-950/40 backdrop-blur-md ${isThreadView ? 'flex' : 'hidden lg:flex'}`}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
