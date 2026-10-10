import React, { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  Shield,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2
} from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  email?: string;
  password?: string;
}

interface AdminLoginModalProps {
  onNavigate: (view: string, param?: string) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ onNavigate }) => {
  const { adminLogin, closeAdminLoginModal, isAdminLoginOpen } = useAuth();
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
        closeAdminLoginModal();
        onNavigate('admin');
      } else {
        setFormError(result.error || 'Invalid email or password.');
      }
    } catch {
      setFormError('Unable to reach the server. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    setEmail('');
    setPassword('');
    setFieldErrors({});
    setFormError(null);
    setShowPassword(false);
  }, [isAdminLoginOpen]);

  return (
    <Modal
      isOpen={isAdminLoginOpen}
      onClose={closeAdminLoginModal}
      title="Admin Login"
      maxWidth="max-w-md"
    >
      <div className="space-y-5">
        <div className="text-center mb-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-rose-600 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-600/20">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-slate-900 tracking-tight">
            Kinetix <span className="text-rose-600">Administration</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Enter your administrator credentials to access the platform control panel.
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="mb-2 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-rose-700 leading-relaxed">{formError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="admin-email-modal"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="admin-email-modal"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'admin-email-modal-error' : undefined}
                className={`w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 transition-all ${
                  fieldErrors.email
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-200 focus:border-rose-500'
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p id="admin-email-modal-error" className="mt-1.5 text-xs font-medium text-rose-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="admin-password-modal"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="admin-password-modal"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'admin-password-modal-error' : undefined}
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
              <p id="admin-password-modal-error" className="mt-1.5 text-xs font-medium text-rose-600">
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
                <span>Verifying\u2026</span>
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
    </Modal>
  );
};