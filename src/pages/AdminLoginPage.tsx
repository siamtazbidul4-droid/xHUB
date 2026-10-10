import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Shield,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface AdminLoginPageProps {
  onNavigate: (view: string, param?: string) => void;
  redirectTo?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  email?: string;
  password?: string;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onNavigate,
  redirectTo
}) => {
  const { adminLogin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!email.trim()) {
      next.email = 'Email is required.';
    } else if (!EMAIL_REGEX.test(email.trim())) {
      next.email = 'Please enter a valid email address.';
    }

    if (!password) {
      next.password = 'Password is required.';
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const result = await adminLogin(email.trim(), password);
      if (result.success) {
        // Only ever land back on an internal admin destination.
        const isInternalAdmin =
          typeof redirectTo === 'string' &&
          redirectTo.startsWith('/admin') &&
          !redirectTo.startsWith('/admin/login');
        onNavigate('admin', isInternalAdmin ? redirectTo : '');
      } else {
        // Generic message — never reveal whether email or password was wrong.
        setFormError(result.error || 'Invalid email or password.');
      }
    } catch {
      setFormError('Unable to reach the server. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-10">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-rose-600 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-600/20">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-slate-900 tracking-tight">
            Kinetix <span className="text-rose-600">Administration</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Sign in with your administrator credentials to access the platform control panel.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs p-6 sm:p-8">
          {/* Form-level error */}
          {formError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-rose-700 leading-relaxed">{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'admin-email-error' : undefined}
                  className={`w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 transition-all ${
                    fieldErrors.email
                      ? 'border-rose-400 focus:border-rose-500'
                      : 'border-slate-200 focus:border-rose-500'
                  }`}
                />
              </div>
              {fieldErrors.email && (
                <p id="admin-email-error" className="mt-1.5 text-xs font-medium text-rose-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'admin-password-error' : undefined}
                  className={`w-full pl-10 pr-11 py-2.5 bg-slate-50/50 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 transition-all ${
                    fieldErrors.password
                      ? 'border-rose-400 focus:border-rose-500'
                      : 'border-slate-200 focus:border-rose-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="admin-password-error" className="mt-1.5 text-xs font-medium text-rose-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold rounded-xl text-sm shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying…</span>
                </>
              ) : (
                <>
                  <span>Admin Login</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Back to site */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 rounded-lg px-2 py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Kinetix</span>
          </button>
        </div>
      </div>
    </div>
  );
};
