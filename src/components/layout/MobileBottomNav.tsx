import React from 'react';
import { Home, Flame, Tv, Library } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface MobileBottomNavProps {
  currentView: string;
  currentParam?: string;
  onNavigate: (view: string, param?: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  currentParam,
  onNavigate
}) => {
  const isHomeActive = currentView === 'home' && (!currentParam || currentParam === 'All');
  const isTrendingActive = currentView === 'trending';
  const isSubsActive = currentView === 'library' && currentParam === 'subscriptions';
  const isLibraryActive = currentView === 'library' && currentParam !== 'subscriptions';

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 h-16 px-2 flex items-center justify-around">
      <button
        onClick={() => onNavigate('home')}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[10px] font-medium transition-colors ${
          isHomeActive ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        <Home className="w-5 h-5" />
        <span>Home</span>
      </button>

      <button
        onClick={() => onNavigate('trending')}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[10px] font-medium transition-colors ${
          isTrendingActive ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        <Flame className="w-5 h-5" />
        <span>Trending</span>
      </button>

      <button
        onClick={() => onNavigate('library', 'subscriptions')}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[10px] font-medium transition-colors ${
          isSubsActive ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        <Tv className="w-5 h-5" />
        <span>Follows</span>
      </button>

      <button
        onClick={() => onNavigate('library', 'history')}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[10px] font-medium transition-colors ${
          isLibraryActive ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        <Library className="w-5 h-5" />
        <span>Library</span>
      </button>
    </nav>
  );
};
