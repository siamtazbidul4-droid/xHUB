import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { NotificationItem } from '../../types/index.js';
import {
  Search,
  Upload,
  Bell,
  Menu,
  X,
  PlaySquare,
  Shield,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Video as VideoIcon,
  Check,
  Settings
} from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onNavigate: (view: string, param?: string) => void;
  currentSearchQuery?: string;
  onOpenEditChannel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarOpen,
  onNavigate,
  currentSearchQuery = '',
  onOpenEditChannel
}) => {
  const { user, channel, logout, openAuthModal, openAdminLoginModal } = useAuth();
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // User menu dropdown state
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Keep search input synced with prop
  useEffect(() => {
    setSearchQuery(currentSearchQuery);
  }, [currentSearchQuery]);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions([]);
      setIsSuggestionsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest<{ suggestions: string[] }>(
          `/api/videos/suggestions?q=${encodeURIComponent(searchQuery.trim())}`
        );
        setSuggestions(data.suggestions || []);
        setIsSuggestionsOpen((data.suggestions || []).length > 0);
      } catch (err) {
        // Silently handle
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch notifications
  const loadNotifications = async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      // Silently handle
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 15000);
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSuggestionsOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSuggestionsOpen(false);
      setIsMobileSearchOpen(false);
      onNavigate('search', searchQuery.trim());
    }
  };

  const handleSuggestionClick = (text: string) => {
    setSearchQuery(text);
    setIsSuggestionsOpen(false);
    setIsMobileSearchOpen(false);
    onNavigate('search', text);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!isSuggestionsOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[activeSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setIsSuggestionsOpen(false);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      // Handle error
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    try {
      await apiRequest(`/api/notifications/${notif._id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      setIsNotificationsOpen(false);
      if (notif.link) {
        if (notif.link.startsWith('/watch/')) {
          onNavigate('watch', notif.link.replace('/watch/', ''));
        } else if (notif.link.startsWith('/channel/')) {
          onNavigate('channel', notif.link.replace('/channel/', ''));
        }
      }
    } catch (err) {
      // Handle error
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 h-16 px-3 sm:px-6 flex items-center justify-between">
        {/* Left: Hamburger & Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            data-sidebar-trigger
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
            aria-label="Toggle navigation menu"
            aria-expanded={isSidebarOpen}
            aria-controls="app-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            {/* Brand mark */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-500 flex items-center justify-center text-white">
              <PlaySquare className="w-5 h-5 fill-white/20 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              xHUB<span className="text-rose-600">.</span>
            </span>
          </div>
        </div>

        {/* Middle: Desktop Search bar with debounced suggestions */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-xl mx-4 hidden md:block">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setIsSuggestionsOpen(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search videos, creators, or topics..."
              className="w-full pl-11 pr-10 py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-slate-200/80 focus:border-rose-500 rounded-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-3 focus:ring-rose-500/15 transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />

            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 absolute right-3 rounded-full hover:bg-slate-200/50"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Suggestions dropdown - rendered as overlay to avoid document flow disruption */}
          {isSuggestionsOpen && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] overflow-hidden z-[100] animate-in fade-in-100 zoom-in-95 duration-150">
              <ul className="py-1.5 max-h-60 overflow-y-auto">
                {suggestions.map((item, idx) => (
                  <li key={`${item}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handleSuggestionClick(item)}
                      onMouseEnter={() => setActiveSuggestionIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                        idx === activeSuggestionIndex
                          ? 'bg-rose-50 text-rose-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{item}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Search Toggle Button */}
          <button
            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl"
            aria-label="Toggle mobile search"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Notifications Popover */}
          {user && (
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl relative transition-colors"
                aria-label="View notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white font-bold text-[10px] rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900">Notifications</h4>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n._id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors flex gap-3 ${
                            !n.read ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" style={{ opacity: n.read ? 0 : 1 }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Account / Profile */}
          {user ? (
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 p-1 pl-1.5 pr-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <img
                  src={user.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=user'}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover"
                />
                <span className="text-xs font-semibold text-slate-800 max-w-[90px] truncate hidden md:inline">
                  {user.name}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50">
                  <div className="p-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('upload');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span>Upload Video</span>
                    </button>

                    {channel && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('channel', channel._id);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-slate-400" />
                        <span>My Channel</span>
                      </button>
                    )}

                    {onOpenEditChannel && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenEditChannel();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span>Channel Settings</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('library', 'my-videos');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <VideoIcon className="w-4 h-4 text-slate-400" />
                      <span>Creator Studio</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('library', 'history');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <PlaySquare className="w-4 h-4 text-slate-400" />
                      <span>Watch History</span>
                    </button>

                    {user && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          openAdminLoginModal();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      >
                        <Shield className="w-4 h-4 text-rose-600" />
                        <span>Admin Portal</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => openAuthModal('login')}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Mobile Expandable Search Bar */}
      {isMobileSearchOpen && (
        <div ref={mobileSearchRef} className="md:hidden sticky top-16 z-35 bg-white border-b border-slate-200 p-3 shadow-md animate-in slide-in-from-top-2">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search videos, creators..."
              className="w-full pl-10 pr-9 py-2 bg-slate-100 border border-slate-200 rounded-full text-xs text-slate-900 focus:outline-hidden focus:border-rose-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 absolute right-3"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>

          {suggestions.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] animate-in fade-in-100 zoom-in-95 duration-150">
              {suggestions.map((item, idx) => (
                <li key={`${item}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(item)}
                    className="w-full text-left py-2 px-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 truncate first:rounded-t-xl last:rounded-b-xl"
                  >
                    <Search className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{item}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
};
