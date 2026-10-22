import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Fingerprint, History, QrCode, ShieldCheck, TriangleAlert } from 'lucide-react';
import { BrandMark } from '../components/Layout';
import { Field, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

// Defaults from .env.example. They are demo values and are shown on purpose.
const DEMO_EMAIL = 'operator@veriq.demo';
const DEMO_PASSWORD = 'veriq-demo-2026';

export function LoginPage() {
  const { operator, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (operator) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-side">
        <div className="row" style={{ gap: 10 }}>
          <BrandMark />
          <div>
            <div className="brand-name">VERIQ</div>
            <div className="brand-sub">Product Authentication</div>
          </div>
        </div>
        <div>
          <h1>Unique, revocable QR identities for every product you ship.</h1>
          <p>Register products, issue secret verification tokens, verify scans server-side and spot suspicious repeat-scan patterns.</p>
          <ul>
            <li>
              <QrCode size={17} /> Per-item QR labels with 128-bit secret tokens
            </li>
            <li>
              <Fingerprint size={17} /> Server-side validation, revocation and reissue
            </li>
            <li>
              <History size={17} /> Full scan history with repeat-scan anomaly rules
            </li>
            <li>
              <ShieldCheck size={17} /> Honest about what a printed QR code can and cannot prove
            </li>
          </ul>
        </div>
        <div className="small" style={{ color: '#7d8bb0' }}>
          Proof of concept · Fictional demonstration data
        </div>
      </div>
      <div className="auth-form-wrap">
        <form className="auth-form stack" onSubmit={submit}>
          <div>
            <h2>Operator sign-in</h2>
            <p className="muted mt-4">Access the brand-owner dashboard.</p>
          </div>
          <div className="callout warn small">
            <TriangleAlert size={16} />
            <div>
              <strong>Demo-only authentication</strong>A single operator account configured in <code>.env</code>. Production requires SSO, MFA and role-based access.
            </div>
          </div>
          {error && <div className="callout danger small">{error}</div>}
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Password" hint={`Demo password: ${DEMO_PASSWORD}`}>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy && <Spinner light />} Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
