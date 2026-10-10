import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Channel } from '../types/index.js';
import { getToken, setToken, removeToken, apiRequest, onUnauthorized } from '../api/client.js';
import { useToast } from './ToastContext.js';

interface AuthContextType {
  user: User | null;
  channel: Channel | null;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
  isAdminLoginOpen: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  adminLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string, handle?: string) => Promise<boolean>;
  logout: () => void;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  openAdminLoginModal: () => void;
  closeAdminLoginModal: () => void;
  refreshUser: () => Promise<void>;
  updateProfile: (data: { name?: string; avatar?: string; banner?: string; description?: string; handle?: string }) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const toast = useToast();

  const fetchCurrentUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setChannel(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await apiRequest<{ user: User; channel: Channel }>('/api/auth/me');
      setUser(data.user);
      setChannel(data.channel);
    } catch (err) {
      console.warn('Session expired or invalid, logging out.');
      removeToken();
      setUser(null);
      setChannel(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // When any request receives a 401, apiRequest has already removed the token.
  // Mirror that here so React state (user/channel) cannot disagree with storage
  // — otherwise the UI would remain "signed in" while every request fails
  // (AUD-011). No toast/redirect is triggered to avoid notification loops.
  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null);
      setChannel(null);
    });
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const data = await apiRequest<{ token: string; user: User; channel: Channel }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setToken(data.token);
      setUser(data.user);
      setChannel(data.channel);
      setIsAuthModalOpen(false);
      toast.success(`Welcome back, ${data.user.name}!`);
      return true;
    } catch (err: any) {
      toast.error('Sign In Failed', err.message || 'Please check your email and password.');
      return false;
    }
  };

  const adminLogin = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await apiRequest<{ token: string; user: User; channel: Channel | null }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setToken(data.token);
      setUser(data.user);
      setChannel(data.channel || null);
      return { success: true };
    } catch (err: any) {
      // The server returns a generic message for invalid credentials.
      // Surface it without revealing whether the email or password was wrong.
      return { success: false, error: err.message || 'Invalid email or password.' };
    }
  };

  const register = async (name: string, email: string, password: string, handle?: string): Promise<boolean> => {
    try {
      const data = await apiRequest<{ token: string; user: User; channel: Channel }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, handle })
      });

      setToken(data.token);
      setUser(data.user);
      setChannel(data.channel);
      setIsAuthModalOpen(false);
      toast.success(`Account created! Welcome, ${data.user.name}.`);
      return true;
    } catch (err: any) {
      toast.error('Registration Failed', err.message || 'Please check your information.');
      return false;
    }
  };

  const logout = () => {
    removeToken();
    setUser(null);
    setChannel(null);
    toast.info('Signed out', 'You have been signed out successfully.');
  };

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const openAdminLoginModal = () => {
    setIsAdminLoginOpen(true);
  };

  const closeAdminLoginModal = () => {
    setIsAdminLoginOpen(false);
  };

  const updateProfile = async (data: { name?: string; avatar?: string; banner?: string; description?: string; handle?: string }) => {
    try {
      const res = await apiRequest<{ user: User; channel: Channel }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      setUser(res.user);
      setChannel(res.channel);
      toast.success('Profile updated successfully');
      return true;
    } catch (err: any) {
      toast.error('Profile Update Failed', err.message);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        channel,
        isLoading,
        isAuthModalOpen,
        authModalMode,
        isAdminLoginOpen,
        login,
        adminLogin,
        register,
        logout,
        openAuthModal,
        closeAuthModal,
        openAdminLoginModal,
        closeAdminLoginModal,
        refreshUser: fetchCurrentUser,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
