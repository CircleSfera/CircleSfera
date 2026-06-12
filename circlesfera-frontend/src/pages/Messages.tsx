import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import ConversationList from '../components/chat/ConversationList';
import SEO from '../components/common/SEO';
import { useSocketStore } from '../stores/socketStore';

export default function Messages() {
  const { id } = useParams();
  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="h-full md:h-[calc(100vh-80px)] md:mt-8 px-0 md:px-4 max-w-6xl mx-auto overflow-hidden bg-transparent">
      <SEO title="Mensajes" />
      <div className="flex h-full md:glass-panel bg-transparent md:rounded-3xl overflow-hidden border-b md:border border-white/5 md:border-white/10">
        {/* Conversation List - Smart visibility on mobile */}
        <div
          className={`w-full lg:w-80 border-r border-white/10 bg-zinc-950/20 backdrop-blur-3xl ${id ? 'hidden lg:block' : 'block'}`}
        >
          <ConversationList />
        </div>

        {/* Chat Area - Smart visibility on mobile */}
        <div
          className={`flex-1 flex flex-col bg-zinc-950/40 backdrop-blur-md min-w-0 ${id ? 'block' : 'hidden lg:flex'}`}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
