import { useState, useEffect, type FormEvent, type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { Truck, User, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Sparkles, Loader, KeyRound } from '../components/Icons';

interface FromState {
  from?: string;
}

const SAVED_EMP_KEY = 'driver_admin_saved_employee_id';

export function LoginPage(): ReactElement {
  const { status, login } = useAuth();
  const location = useLocation();
  
  const [employeeId, setEmployeeId] = useState(() => localStorage.getItem(SAVED_EMP_KEY) || '');
  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem(SAVED_EMP_KEY)));
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (rememberMe && employeeId) {
      localStorage.setItem(SAVED_EMP_KEY, employeeId.trim());
    } else if (!rememberMe) {
      localStorage.removeItem(SAVED_EMP_KEY);
    }
  }, [rememberMe, employeeId]);

  if (status === 'loading') {
    return (
      <div className="login-loading-container">
        <div className="login-spinner-glow">
          <Loader size={36} color="var(--accent, #2563eb)" />
        </div>
        <p className="centered-note">Authenticating session…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    const from = (location.state as FromState | null)?.from;
    return <Navigate to={from ?? '/complaints'} replace />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!employeeId.trim()) return;

    setError(null);
    setSubmitting(true);

    if (rememberMe) {
      localStorage.setItem(SAVED_EMP_KEY, employeeId.trim());
    } else {
      localStorage.removeItem(SAVED_EMP_KEY);
    }

    login(employeeId.trim(), pin).then(
      () => {
        // Redirect handled by status change above
      },
      (err: unknown) => {
        setError(err);
        setSubmitting(false);
      },
    );
  };

  const handleQuickFill = (empId: string, defaultPin: string = '2468') => {
    setEmployeeId(empId);
    setPin(defaultPin);
    setError(null);
  };

  return (
    <div className="login-page-container">
      {/* Background glowing effects */}
      <div className="ambient-bg-glow glow-1" />
      <div className="ambient-bg-glow glow-2" />
      <div className="bg-grid-pattern" />

      <div className="login-card-shell">
        {/* Left Branding / Hero Panel */}
        <div className="login-hero-panel">
          <div className="hero-brand">
            <div className="brand-icon-wrapper">
              <Truck size={32} color="#ffffff" />
            </div>
            <div className="brand-titles">
              <h2>Driver Care</h2>
              <span className="brand-badge">Admin Workspace</span>
            </div>
          </div>

          <div className="hero-content">
            <h1>Intelligent Driver Complaint & Fleet Operations Command</h1>
            <p>
              Streamline resolutions, manage driver feedback in real time, and monitor system-wide logistics complaints with enterprise security.
            </p>

            <div className="feature-highlights">
              <div className="feature-pill">
                <ShieldCheck size={18} color="#60a5fa" />
                <span>Role-Based Access Control</span>
              </div>
              <div className="feature-pill">
                <Sparkles size={18} color="#34d399" />
                <span>Real-Time Incident Dispatch</span>
              </div>
              <div className="feature-pill">
                <KeyRound size={18} color="#f59e0b" />
                <span>Encrypted Audit Logs</span>
              </div>
            </div>
          </div>

          <div className="hero-footer">
            <div className="system-status">
              <span className="status-dot" />
              <span>System Online & Operational</span>
            </div>
            <span className="version-tag">v2.4.0 • Enterprise</span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="login-form-panel">
          <div className="form-header">
            <h3>Sign in to Dashboard</h3>
            <p className="muted">Enter your employee credentials to continue</p>
          </div>

          <ErrorBanner error={error} />

          {/* Dev / Quick Fill Demo Account Pills */}
          <div className="demo-accounts-box">
            <div className="demo-box-label">
              <Sparkles size={13} color="var(--accent)" />
              <span>Quick Demo Accounts</span>
            </div>
            <div className="demo-pills-row">
              <button
                type="button"
                className="demo-pill"
                onClick={() => handleQuickFill('E0001', '2468')}
                title="Fill Super Admin Credentials (E0001 / 2468)"
              >
                <span className="pill-role">Super Admin</span>
                <span className="pill-id">E0001</span>
              </button>
              <button
                type="button"
                className="demo-pill"
                onClick={() => handleQuickFill('E0002', '2468')}
                title="Fill Ops Admin Credentials (E0002 / 2468)"
              >
                <span className="pill-role">Ops Admin</span>
                <span className="pill-id">E0002</span>
              </button>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-field-group">
              <label htmlFor="employeeId">Employee ID</label>
              <div className="input-icon-wrapper">
                <span className="field-icon">
                  <User size={18} />
                </span>
                <input
                  id="employeeId"
                  name="employeeId"
                  type="text"
                  placeholder="e.g. E0001"
                  autoComplete="username"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                  autoFocus={!employeeId}
                  className="login-input"
                />
              </div>
            </div>

            <div className="form-field-group">
              <label htmlFor="pin">
                <span>Security PIN</span>
                <span className="field-hint">4–8 digits</span>
              </label>
              <div className="input-icon-wrapper">
                <span className="field-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="pin"
                  name="pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  placeholder="••••"
                  autoComplete="current-password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  className="login-input pin-input"
                />
                <button
                  type="button"
                  className="pin-toggle-btn"
                  onClick={() => setShowPin(!showPin)}
                  tabIndex={-1}
                  aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                >
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-options-row">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="checkmark" />
                <span className="checkbox-label">Remember Employee ID</span>
              </label>
            </div>

            <button type="submit" className="login-submit-btn" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader size={18} color="#ffffff" />
                  <span>Verifying Credentials…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="login-form-footer">
            <p className="muted-footer-text">
              Need assistance logging in? Contact your system administrator or IT Support desk.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

