import React, { useState, useEffect } from 'react';
import { ToastProvider } from './context/ToastContext.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Header } from './components/layout/Header.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { MobileBottomNav } from './components/layout/MobileBottomNav.js';
import { AuthModal } from './components/auth/AuthModal.js';
import { AdminLoginModal } from './components/auth/AdminLoginModal.js';
import { EditChannelModal } from './components/channel/EditChannelModal.js';

import { HomePage } from './pages/HomePage.js';
import { WatchPage } from './pages/WatchPage.js';
import { SearchPage } from './pages/SearchPage.js';
import { ChannelPage } from './pages/ChannelPage.js';
import { UploadPage } from './pages/UploadPage.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { AdminLoginPage } from './pages/AdminLoginPage.js';

type ViewMode = 'home' | 'watch' | 'search' | 'channel' | 'upload' | 'library' | 'admin' | 'adminLogin' | 'trending';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [viewParam, setViewParam] = useState<string>('');
  // Single navigation state. True = desktop sidebar visible / mobile drawer open.
  // Initialized from viewport so mobile users don't start with the drawer open.
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  const [isEditChannelOpen, setIsEditChannelOpen] = useState(false);

  // Keep state sane across viewport changes: a drawer must never be stuck open
  // after resizing down from desktop; a closed sidebar stays closed going up.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setIsSidebarOpen(false);
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Parse URL on initial load if query or path present
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace(/^#/, '');
      const [path, queryString] = hash.split('?');
      const params = new URLSearchParams(queryString || '');

      if (path.startsWith('/watch/')) {
        setCurrentView('watch');
        setViewParam(hash.replace('/watch/', '').split('?')[0]);
      } else if (path.startsWith('/channel/')) {
        setCurrentView('channel');
        setViewParam(hash.replace('/channel/', '').split('?')[0]);
      } else if (path.startsWith('/search/')) {
        setCurrentView('search');
        setViewParam(decodeURIComponent(hash.replace('/search/', '').split('?')[0]));
      } else if (path === '/upload') {
        setCurrentView('upload');
      } else if (path.startsWith('/library/')) {
        setCurrentView('library');
        setViewParam(hash.replace('/library/', '').split('?')[0]);
      } else if (path === '/admin/login') {
        setCurrentView('adminLogin');
        setViewParam(params.get('next') || '');
      } else if (path === '/admin') {
        setCurrentView('admin');
      } else if (path === '/trending') {
        setCurrentView('trending');
      } else {
        setCurrentView('home');
        setViewParam('');
      }
    };

    handlePopState();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (view: string, param: string = '') => {
    setCurrentView(view as ViewMode);
    setViewParam(param);

    // Update browser URL hash for friendly navigation / reload resilience
    let newHash = '';
    if (view === 'watch') newHash = `/watch/${param}`;
    else if (view === 'channel') newHash = `/channel/${param}`;
    else if (view === 'search') newHash = `/search/${encodeURIComponent(param)}`;
    else if (view === 'upload') newHash = `/upload`;
    else if (view === 'library') newHash = `/library/${param || 'history'}`;
    else if (view === 'admin') newHash = `/admin`;
    else if (view === 'adminLogin') newHash = param ? `/admin/login?next=${encodeURIComponent(param)}` : `/admin/login`;
    else if (view === 'trending') newHash = `/trending`;
    else newHash = param ? `/?category=${encodeURIComponent(param)}` : '/';

    window.history.pushState(null, '', `#${newHash}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Protect admin routes: an authenticated administrator session is
  // required. The role is server-authoritative (JWT role claim matched
  // against the platform admin identity), so a browser refresh or a
  // /api/auth/me re-fetch cannot silently drop admin access the way a
  // client-only flag could. Unauthenticated or non-admin visitors are
  // redirected to the dedicated admin login screen.
  useEffect(() => {
    if (currentView === 'admin' && !isLoading && user?.role !== 'admin') {
      navigate('adminLogin', '/admin');
    }
  }, [currentView, user, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans antialiased selection:bg-rose-500 selection:text-white">
      {/* Top Header */}
      <Header
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
        onNavigate={navigate}
        currentSearchQuery={currentView === 'search' ? viewParam : ''}
        onOpenEditChannel={() => setIsEditChannelOpen(true)}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          isOpen={isSidebarOpen}
          onCloseMobile={() => setIsSidebarOpen(false)}
          currentView={currentView}
          currentParam={viewParam}
          onNavigate={navigate}
        />

        {/* Content Container — gutter transition is synchronized with the
            sidebar's width transition (same duration), so toggling produces
            one smooth, stable reflow: no clipping, no negative margins. */}
        <main
          className={`flex-1 overflow-y-auto px-4 sm:px-6 pt-1.5 sm:pt-2 pb-24 lg:pb-10 bg-white transition-[padding] duration-300 ease-out ${
            isSidebarOpen ? 'lg:pl-64 lg:pr-8' : 'lg:px-8'
          }`}
        >
          <div className="w-full max-w-[1600px] mx-auto">
          {currentView === 'home' && (
            <HomePage
              onSelectVideo={(id) => navigate('watch', id)}
              onSelectChannel={(id) => navigate('channel', id)}
              selectedCategory={viewParam || 'All'}
            />
          )}

          {currentView === 'trending' && (
            <HomePage
              onSelectVideo={(id) => navigate('watch', id)}
              onSelectChannel={(id) => navigate('channel', id)}
              selectedCategory="All"
              initialTab="trending"
            />
          )}

          {currentView === 'watch' && (
            <WatchPage
              videoId={viewParam}
              onSelectVideo={(id) => navigate('watch', id)}
              onSelectChannel={(id) => navigate('channel', id)}
            />
          )}

          {currentView === 'search' && (
            <SearchPage
              query={viewParam}
              onSelectVideo={(id) => navigate('watch', id)}
              onSelectChannel={(id) => navigate('channel', id)}
            />
          )}

          {currentView === 'channel' && (
            <ChannelPage
              channelId={viewParam}
              onSelectVideo={(id) => navigate('watch', id)}
              onSelectChannel={(id) => navigate('channel', id)}
            />
          )}

          {currentView === 'upload' && (
            <UploadPage
              onVideoPublished={(newId) => navigate('watch', newId)}
            />
          )}

          {currentView === 'library' && (
            <LibraryPage
              initialTab={viewParam || 'history'}
              onSelectVideo={(id) => navigate('watch', id)}
              onSelectChannel={(id) => navigate('channel', id)}
            />
          )}

          {currentView === 'admin' && (
            <AdminPage
              onSelectVideo={(id) => navigate('watch', id)}
              onSelectChannel={(id) => navigate('channel', id)}
            />
          )}

          {currentView === 'adminLogin' && (
            <AdminLoginPage
              onNavigate={navigate}
              redirectTo={viewParam}
            />
          )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        currentView={currentView}
        currentParam={viewParam}
        onNavigate={navigate}
      />

      {/* Global Auth Modal */}
      <AuthModal />

      {/* Admin Login Modal */}
      <AdminLoginModal onNavigate={navigate} />

      {/* Creator Channel Settings Modal */}
      <EditChannelModal
        isOpen={isEditChannelOpen}
        onClose={() => setIsEditChannelOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
}
