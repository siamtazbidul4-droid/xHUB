import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import {
  Home,
  Flame,
  Tv,
  History,
  ThumbsUp,
  Clock,
  Video,
  Layers,
  Shield,
  Film,
  Sparkles,
  Gamepad2,
  Music,
  GraduationCap,
  Trophy,
  Plane,
  Dumbbell,
  Compass,
  X
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  currentView: string;
  currentParam?: string;
  onNavigate: (view: string, param?: string) => void;
}

/**
 * Navigation model
 * ----------------
 * One state (`isOpen`) drives both surfaces:
 *  - Desktop (lg+): a fixed, floating panel anchored below the 4rem header.
 *    It animates only its own transform/opacity and never moves page content.
 *    The content area in App.tsx reserves a synchronized gutter while open.
 *  - Mobile (<lg): an overlay drawer with backdrop, Escape-to-close, and
 *    focus restoration. It never affects document layout.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onCloseMobile,
  currentView,
  currentParam,
  onNavigate
}) => {
  const { user } = useAuth();
  const drawerPanelRef = useRef<HTMLDivElement>(null);

// Escape closes the mobile drawer and restores focus to the header trigger
  // so keyboard users are not stranded. Focus moves BEFORE the state change
  // to avoid "aria-hidden on focused descendant" warnings.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const trigger = document.querySelector('[data-sidebar-trigger]') as HTMLElement | null;
        trigger?.focus();
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCloseMobile]);

  // Close the drawer without stranding focus inside it. Browsers block
  // aria-hidden on an ancestor of a focused element, so when the active
  // element sits inside the drawer or the desktop panel, focus moves to
  // the header trigger — the same destination Escape already restores to.
  // Focus restoration runs BEFORE the state change so the trigger holds
  // focus when React commits the closed (aria-hidden / inert) state.
  const closeDrawer = () => {
    const active = document.activeElement as HTMLElement | null;
    const focusInside =
      !!active &&
      (drawerPanelRef.current?.contains(active) ||
        document.getElementById('app-sidebar')?.contains(active));

    if (focusInside) {
      const trigger = document.querySelector('[data-sidebar-trigger]') as HTMLElement | null;
      trigger?.focus();
    }

    onCloseMobile();
  };

  const navItem = (
    label: string,
    view: string,
    param?: string,
    icon: React.ReactNode = null,
    badge?: string
  ) => {
    const isActive = currentView === view && (!param || currentParam === param);

    return (
      <button
        type="button"
        onClick={() => {
          onNavigate(view, param);
          closeDrawer();
        }}
        className={`group/nav relative w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 ${
          isActive
            ? 'bg-rose-50 text-rose-600 font-semibold'
            : 'text-slate-600 font-medium hover:text-slate-900 hover:bg-slate-100/80'
        }`}
        aria-current={isActive ? 'page' : undefined}
      >
        {/* Active accent bar */}
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-rose-500 transition-opacity duration-150 ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
        <div className="flex items-center gap-3 truncate">
          <span className={`shrink-0 transition-colors ${isActive ? 'text-rose-600' : 'text-slate-400 group-hover/nav:text-slate-600'}`}>
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700">
            {badge}
          </span>
        )}
      </button>
    );
  };

  const content = (
    <nav aria-label="Main navigation" className="h-full overflow-y-auto px-3 py-4 space-y-6 text-slate-800 scrollbar-thin">
      {/* Primary Discovery */}
      <div className="space-y-1">
        {navItem('Home', 'home', undefined, <Home className="w-4 h-4" />)}
        {navItem('Trending', 'trending', undefined, <Flame className="w-4 h-4" />, 'Hot')}
        {navItem('Subscriptions', 'library', 'subscriptions', <Tv className="w-4 h-4" />)}
      </div>

      <hr className="border-slate-100" />

      {/* Library */}
      <div className="space-y-1">
        <p className="px-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Library
        </p>
        {navItem('History', 'library', 'history', <History className="w-4 h-4" />)}
        {navItem('Liked Videos', 'library', 'liked', <ThumbsUp className="w-4 h-4" />)}
        {navItem('Watch Later', 'library', 'watch-later', <Clock className="w-4 h-4" />)}
        {user && navItem('My Videos', 'library', 'my-videos', <Video className="w-4 h-4" />)}
      </div>

      <hr className="border-slate-100" />

      {/* Explore Categories */}
      <div className="space-y-1">
        <p className="px-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Categories
        </p>
        {navItem('Technology', 'home', 'Technology', <Layers className="w-4 h-4" />)}
        {navItem('Documentary', 'home', 'Documentary', <Film className="w-4 h-4" />)}
        {navItem('Gaming', 'home', 'Gaming', <Gamepad2 className="w-4 h-4" />)}
        {navItem('Entertainment', 'home', 'Entertainment', <Sparkles className="w-4 h-4" />)}
        {navItem('Music', 'home', 'Music', <Music className="w-4 h-4" />)}
        {navItem('Education', 'home', 'Education', <GraduationCap className="w-4 h-4" />)}
        {navItem('Sports', 'home', 'Sports', <Trophy className="w-4 h-4" />)}
        {navItem('Travel', 'home', 'Travel', <Plane className="w-4 h-4" />)}
        {navItem('Fitness', 'home', 'Fitness', <Dumbbell className="w-4 h-4" />)}
      </div>

      {/* Admin section if applicable */}
      {user && (
        <>
          <hr className="border-slate-100" />
          <div className="space-y-1">
            <p className="px-3.5 text-[11px] font-bold text-rose-500 uppercase tracking-wider mb-2">
              Management
            </p>
            {navItem('Admin Portal', 'adminLogin', undefined, <Shield className="w-4 h-4 text-rose-500" />)}
          </div>
        </>
      )}

      {/* Footer Branding */}
      <div className="pt-4 px-3 text-[11px] text-slate-400 leading-relaxed">
        <p className="font-semibold text-slate-600">KINETIX Video Platform</p>
        <p className="mt-1">Production-Grade Video & Creator Network</p>
        <p className="mt-2 text-slate-300">© 2026 Kinetix Inc.</p>
      </div>
    </nav>
  );

  return (
    <>
      {/* ---------- Desktop: fixed, floating panel (lg+) ---------- */}
      {/* Excluded from the accessibility tree while closed. Animates only
          transform/opacity, does not participate in document flow, so the
          homepage content never moves because of it. */}
      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`hidden lg:block fixed top-16 bottom-0 left-0 z-30 w-60 bg-white border-r border-slate-200/80 overflow-y-auto scrollbar-thin transition-all duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'
        }`}
      >
        {content}
      </aside>

      {/* ---------- Mobile: overlay drawer (<lg) ---------- */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 motion-reduce:transition-none ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        {/* Backdrop */}
        <div
          onClick={closeDrawer}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
          aria-hidden="true"
        />

        {/* Drawer Panel */}
        <div
          ref={drawerPanelRef}
          className={`absolute top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out motion-reduce:transition-none ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <span className="font-bold text-lg tracking-tight text-slate-900">
              KINETIX<span className="text-rose-600">.</span>
            </span>
            <button
              onClick={closeDrawer}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0">{content}</div>
        </div>
      </div>
    </>
  );
};
