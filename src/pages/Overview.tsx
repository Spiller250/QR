import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, Ban, Boxes, CheckCircle2, FlaskConical, QrCode, ShieldX } from 'lucide-react';
import type { AuthState, VerificationEvent } from '../../shared/types';
import { useOverview } from '../api/hooks';
import { ActivityChart, SERIES } from '../components/ActivityChart';
import { AUTH_STATE_META, ResultBadge } from '../components/badges';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHead } from '../components/ui';
import { fmtNumber, fmtRelative } from '../lib/format';

export function ActivityIcon({ e }: { e: VerificationEvent }) {
  if (e.result === 'authentic')
    return (
      <span className="ico ok">
        <CheckCircle2 size={15} />
      </span>
    );
  if (e.result === 'suspicious')
    return (
      <span className="ico warn">
        <AlertTriangle size={15} />
      </span>
    );
  if (e.result === 'revoked')
    return (
      <span className="ico bad">
        <Ban size={15} />
      </span>
    );
  return (
    <span className="ico bad">
      <ShieldX size={15} />
    </span>
  );
}

export function OverviewPage() {
  const { data, isLoading, error, refetch } = useOverview();
  const navigate = useNavigate();
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const totalAuth = Object.values(data.authStateBreakdown).reduce((a, b) => a + b, 0) || 1;
  const states: AuthState[] = ['verified', 'not_scanned', 'flagged', 'no_active_label'];
  const last14 = data.daily.reduce((a, d) => a + d.authentic + d.suspicious + d.invalid + d.revoked, 0);

  return (
    <div className="stack">
      <PageHead
        title="Overview"
        description="Registered products, issued labels and verification activity across your catalogue."
        actions={
          <Link className="btn" to="/products">
            <Boxes size={16} /> Manage products
          </Link>
        }
      />

      <div className="cta-card">
        <div>
          <span className="badge badge-dark" style={{ marginBottom: 10 }}>
            Interactive demonstration
          </span>
          <h2>See a verification end to end</h2>
          <p>Scan a registered label, repeat it, tamper with it, revoke it and copy it — and see exactly what the server can and cannot tell.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/demo')}>
          <FlaskConical size={17} /> Launch Interactive Demo
        </button>
      </div>

      <div className="grid grid-4">
        <Stat icon={<Boxes size={17} />} label="Registered products" value={data.totalProducts} foot={`${data.authStateBreakdown.verified} verified at least once`} />
        <Stat icon={<QrCode size={17} />} tone="neutral" label="QR labels issued" value={data.labelsIssued} foot={`${data.activeLabels} active · ${data.labelsIssued - data.activeLabels} revoked`} />
        <Stat icon={<Activity size={17} />} tone="ok" label="Verification attempts" value={data.totalVerifications} foot={`${data.invalidAttempts} invalid · ${data.revokedAttempts} revoked-label attempts`} />
        <Stat icon={<AlertTriangle size={17} />} tone="warn" label="Suspicious repeat scans" value={data.suspiciousScans} foot={`Across ${data.authStateBreakdown.flagged} flagged product(s)`} />
      </div>

      <div className="grid grid-main-side">
        <Card
          title="Verification activity"
          sub={`Last 14 days · ${fmtNumber(last14)} attempts`}
          actions={
            <div className="legend">
              {SERIES.map((s) => (
                <span key={s.key}>
                  <i style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          }
        >
          <ActivityChart data={data.daily} />
        </Card>

        <Card title="Authentication status" sub="Current state of each product's active label">
          {states.map((s) => {
            const n = data.authStateBreakdown[s];
            return (
              <div className="breakdown-row" key={s}>
                <span className="row small" style={{ gap: 8 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: AUTH_STATE_META[s].color, display: 'inline-block' }} />
                  {AUTH_STATE_META[s].label}
                </span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(n / totalAuth) * 100}%`, background: AUTH_STATE_META[s].color }} />
                </div>
                <span className="num strong">{n}</span>
              </div>
            );
          })}
          <div className="mt-16" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div className="tag">Results, all time</div>
            <div className="row-wrap mt-8">
              {(['authentic', 'suspicious', 'invalid', 'revoked'] as const).map((r) => (
                <span key={r} className="row small" style={{ gap: 6 }}>
                  <ResultBadge result={r} /> <span className="strong">{data.resultBreakdown[r]}</span>
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Recent verification activity"
        sub="Updates automatically as scans arrive"
        bodyClass="tight"
        actions={
          <Link className="btn btn-sm" to="/logs">
            View all logs <ArrowRight size={14} />
          </Link>
        }
      >
        {data.recentEvents.length === 0 ? (
          <EmptyState icon={Activity} title="No verification attempts yet">
            Run a scenario in the Live Demo to generate the first events.
          </EmptyState>
        ) : (
          <ul className="activity">
            {data.recentEvents.map((e) => (
              <li key={e.id}>
                <ActivityIcon e={e} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-wrap between">
                    <span className="strong truncate">{e.productName ?? 'Unrecognised code'}</span>
                    <span className="small subtle nowrap">{fmtRelative(e.createdAt)}</span>
                  </div>
                  <div className="small muted">
                    <ResultBadge result={e.result} /> <span className="mono">{e.scannerId}</span>
                    {e.location ? ` · ${e.location}` : ''} · {e.reasonCode}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, foot, tone }: { icon: ReactNode; label: string; value: number; foot: string; tone?: 'warn' | 'ok' | 'neutral' }) {
  return (
    <div className="card stat">
      <div className="stat-top">
        {label}
        <span className={`stat-icon ${tone ?? ''}`}>{icon}</span>
      </div>
      <div className="stat-value">{fmtNumber(value)}</div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
