import { useEffect, useState } from 'react';
import { Database, Fingerprint, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { RULE_DESCRIPTIONS } from '../../shared/constants';
import { DEFAULT_RULES, rulesSchema, type RepeatScanRules } from '../../shared/schemas';
import type { RuleCode } from '../../shared/types';
import { useResetDemo, useSaveCdpThreshold, useSaveRules, useSettings } from '../api/hooks';
import type { SettingsPayload } from '../../shared/types';
import { Link } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Card, ConfirmModal, ErrorState, LoadingBlock, PageHead, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

const RULE_FIELDS: { code: RuleCode; label: string; field: keyof RepeatScanRules; unit: string }[] = [
  { code: 'HIGH_SCAN_COUNT', label: 'Maximum verifications per token', field: 'scanCountThreshold', unit: 'scans' },
  { code: 'MULTIPLE_DEVICES', label: 'Maximum distinct scanners in window', field: 'distinctDeviceThreshold', unit: 'scanners' },
  { code: 'MULTIPLE_LOCATIONS', label: 'Maximum distinct locations in window', field: 'distinctLocationThreshold', unit: 'locations' },
  { code: 'RAPID_DEVICE_SWITCH', label: 'Different-scanner interval', field: 'rapidSwitchMinutes', unit: 'minutes' },
];

export function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings();
  const save = useSaveRules();
  const reset = useResetDemo();
  const toast = useToast();
  const { operator, logout } = useAuth();
  const [rules, setRules] = useState<RepeatScanRules | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);

  useEffect(() => {
    if (data) setRules(data.rules);
  }, [data]);

  if (isLoading || (!rules && !error)) return <LoadingBlock />;
  if (error || !data || !rules) return <ErrorState error={error} onRetry={() => refetch()} />;

  const dirty = JSON.stringify(rules) !== JSON.stringify(data.rules);
  const setNum = (field: keyof RepeatScanRules, v: string) => setRules({ ...rules, [field]: v === '' ? ('' as unknown as number) : Number(v) });

  async function onSave() {
    const parsed = rulesSchema.safeParse(rules);
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Invalid value');
      return;
    }
    setInvalid(null);
    await save.mutateAsync(parsed.data);
    toast({ tone: 'success', title: 'Rules saved', body: 'New scans are evaluated with the updated thresholds.' });
  }

  return (
    <div className="stack">
      <PageHead title="Settings" description="Configure repeat-scan rules and manage the demonstration environment." />

      <Card
        title={
          <span className="row" style={{ gap: 8 }}>
            <SlidersHorizontal size={16} /> Repeat-scan rules
          </span>
        }
        sub="A scan is flagged as suspicious when any enabled rule exceeds its limit. Flags are review signals — never automatic counterfeit verdicts."
        footer={
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => setRules(DEFAULT_RULES)}>
              Restore defaults
            </button>
            <button className="btn btn-primary" onClick={onSave} disabled={!dirty || save.isPending}>
              {save.isPending ? <Spinner light /> : <Save size={15} />} Save rules
            </button>
          </>
        }
      >
        <div className="stack">
          {RULE_FIELDS.map((r) => (
            <div key={r.code} className="row-wrap between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, gap: 16 }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <label className="row strong" style={{ gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rules.enabled[r.code]}
                    onChange={(e) => setRules({ ...rules, enabled: { ...rules.enabled, [r.code]: e.target.checked } })}
                  />
                  {r.label}
                  <span className="mono small muted">{r.code}</span>
                </label>
                <p className="small muted mt-4" style={{ paddingLeft: 24 }}>
                  {RULE_DESCRIPTIONS[r.code]}
                </p>
              </div>
              <div className="row" style={{ width: 200 }}>
                <input
                  className="input"
                  type="number"
                  min={r.field === 'rapidSwitchMinutes' ? 0 : 1}
                  value={rules[r.field] as number}
                  onChange={(e) => setNum(r.field, e.target.value)}
                  disabled={!rules.enabled[r.code]}
                  aria-label={r.label}
                />
                <span className="small muted" style={{ width: 70 }}>
                  {r.unit}
                </span>
              </div>
            </div>
          ))}
          <div className="row-wrap between" style={{ gap: 16 }}>
            <div style={{ flex: '1 1 320px' }}>
              <div className="strong">Evaluation window</div>
              <p className="small muted mt-4">Scanner and location rules consider scans within this many hours before the current scan.</p>
            </div>
            <div className="row" style={{ width: 200 }}>
              <input className="input" type="number" min={1} value={rules.windowHours} onChange={(e) => setNum('windowHours', e.target.value)} aria-label="Evaluation window" />
              <span className="small muted" style={{ width: 70 }}>
                hours
              </span>
            </div>
          </div>
          {invalid && <div className="callout danger small">{invalid}</div>}
        </div>
      </Card>

      <CdpSettingsCard settings={data} />

      <div className="grid grid-2">
        <Card
          title={
            <span className="row" style={{ gap: 8 }}>
              <Database size={16} /> Environment
            </span>
          }
          sub="Read-only. Configure via .env and restart the API."
        >
          <dl className="dl">
            <dt>QR payload format</dt>
            <dd className="mono small">{data.payloadFormat}</dd>
            <dt>Authorized apps</dt>
            <dd className="row-wrap">
              {data.appClients.length ? data.appClients.map((c) => <span key={c} className="badge badge-info mono">{c}</span>) : <span className="muted">None — all verification is blocked</span>}
            </dd>
            <dt>Verify rate limit</dt>
            <dd>{data.rateLimitPerMinute} requests / minute / IP</dd>
            <dt>Database</dt>
            <dd className="mono small">{data.databasePath}</dd>
            <dt>Signed in as</dt>
            <dd>
              {operator?.email} <span className="badge badge-warning">Demo-only auth</span>
            </dd>
          </dl>
          <button className="btn mt-16" onClick={() => logout()}>
            Sign out
          </button>
        </Card>
        <Card
          title={
            <span className="row" style={{ gap: 8 }}>
              <RotateCcw size={16} /> Demo data
            </span>
          }
          sub="Restore the fictional sample catalogue and scan history"
        >
          <p className="muted">
            Deletes all products, labels and verification events, restores the default rules, and re-seeds the fictional demo dataset. All previously issued QR codes
            become invalid. Equivalent to running <code>npm run reset</code>.
          </p>
          <button className="btn btn-danger mt-16" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={15} /> Reset demo data
          </button>
        </Card>
      </div>

      {confirmReset && (
        <ConfirmModal
          title="Reset all demo data?"
          body="This permanently replaces every product, label and verification event with a freshly generated fictional dataset."
          confirmLabel="Reset data"
          danger
          busy={reset.isPending}
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await reset.mutateAsync();
            setConfirmReset(false);
            toast({ tone: 'success', title: 'Demo data reset', body: 'A fresh fictional dataset has been seeded.' });
          }}
        />
      )}
    </div>
  );
}

function CdpSettingsCard({ settings }: { settings: SettingsPayload }) {
  const cdp = settings.cdp;
  const save = useSaveCdpThreshold();
  const toast = useToast();
  const [value, setValue] = useState(cdp.threshold.toFixed(2));
  useEffect(() => setValue(cdp.threshold.toFixed(2)), [cdp.threshold]);
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          <Fingerprint size={16} /> Copy detection (physical labels)
        </span>
      }
      sub="Photos scored at or above the threshold are reported as Original; below it, Copy suspected."
      footer={
        <>
          <span className="small">
            Default from <code>CDP_THRESHOLD</code>: {cdp.defaultThreshold.toFixed(2)} · <Link to="/calibration">Calibrate with real photos</Link>
          </span>
          <button
            className="btn btn-primary"
            disabled={!valid || save.isPending || Math.abs(parsed - cdp.threshold) < 0.0005}
            onClick={async () => {
              await save.mutateAsync(parsed);
              toast({ tone: 'success', title: 'Threshold saved', body: `Physical checks now use ${parsed.toFixed(2)}.` });
            }}
          >
            {save.isPending ? <Spinner light /> : <Save size={15} />} Save threshold
          </button>
        </>
      }
    >
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="cdp-threshold">Decision threshold (0–1)</label>
          <input id="cdp-threshold" className={`input${valid ? '' : ' error'}`} type="number" min={0} max={1} step={0.01} value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 160 }} />
          <span className="hint">Set it between the scores of your original prints and your copies.</span>
        </div>
        <dl className="dl">
          <dt>Analysis service</dt>
          <dd>
            {cdp.serviceOnline ? <span className="badge badge-success">online</span> : <span className="badge badge-danger">offline</span>}{' '}
            <span className="mono small">{cdp.serviceUrl}</span>
          </dd>
          <dt>Pattern</dt>
          <dd>
            {cdp.gridSize} × {cdp.gridSize} cells · {cdp.cellMm} mm · {cdp.patternMm.toFixed(1)} mm square
          </dd>
          <dt>QR size</dt>
          <dd>{cdp.qrMm} mm (error correction H)</dd>
        </dl>
      </div>
    </Card>
  );
}
