import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Info,
  KeyRound,
  ListChecks,
  Lock,
  RefreshCw,
  ScanLine,
  ShieldX,
  Smartphone,
  X,
} from 'lucide-react';
import { DEMO_SCANNERS } from '../../../shared/constants';
import { maskPayload, parsePayload } from '../../../shared/token';
import type { ProductDetail, VerificationResult, VerifyResponse } from '../../../shared/types';
import { api, APP_KEY, verifyWithoutAppKey } from '../../api/client';
import { useProduct, useTokenAction, useVerify } from '../../api/hooks';
import { explain, type Point, type ScenarioKey } from '../../lib/explain';
import { fmtTime } from '../../lib/format';
import { decodeQr, qrDataUrl, simulateCopy, tamperToken } from '../../lib/qr';
import { ResultBadge, TokenStatusBadge } from '../badges';
import { ProductLabel } from '../qr';
import { useToast } from '../toast';
import { Card, EmptyState, LoadingBlock, Spinner } from '../ui';
import { VerificationDetails } from '../VerificationResult';
import { JsonView } from './JsonView';

type Scanner = { id: string; label: string; location: string };
const RETAIL = DEMO_SCANNERS[1];
const REMOTE = DEMO_SCANNERS[3];

const SCENARIOS: { key: ScenarioKey; title: string; desc: string }[] = [
  { key: 'A', title: 'First scan', desc: 'Verify a fresh, active label for the first time.' },
  { key: 'B', title: 'Repeated scan', desc: 'Scan the same label again from the same scanner.' },
  { key: 'C', title: 'Modified QR', desc: 'Change one character of the payload, then scan.' },
  { key: 'D', title: 'Revoked QR', desc: 'Reissue the label, then scan the old one.' },
  { key: 'E', title: 'Copied QR', desc: 'Scan a photocopy of the label in another city.' },
  { key: 'F', title: 'Regular camera', desc: 'Scan with a phone camera app or third-party scanner.' },
];

const STEPS = [
  'Capture label image',
  'Decode QR payload (in authorized app)',
  'Send payload + X-App-Key to /api/verify',
  'Check app key, signature, registry & rules',
  'Return result to scanner',
];
const CAMERA_STEPS = [
  'Capture label image',
  'Decode QR with a generic camera app',
  'Show content: plain text, no link to open',
  'Third-party client calls /api/verify without app key',
  'Rejected — 401 unauthorized client',
];

interface Rejection {
  status: number;
  body: unknown;
  text: string;
}

type SubjectKind = 'original' | 'tampered' | 'old' | 'copy';
interface Subject {
  kind: SubjectKind;
  image: string;
  caption: string;
}
interface TimelineItem {
  id: number;
  at: string;
  kind: 'scan' | 'admin' | 'info';
  title: string;
  detail: string;
  result?: VerificationResult;
  flagged?: boolean;
}
interface Compare {
  original: string;
  copy: string;
  same: boolean;
  preview: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mask = (payload: string) => `${maskPayload(payload)} (masked in UI)`;

const CAMERA_POINTS: Point[] = [
  {
    tone: 'info',
    text: 'A regular camera app decodes the QR code and finds plain text starting with “VQ1.”. It is not a URL, so there is no link to open and no website that could verify it.',
  },
  {
    tone: 'bad',
    text: 'A third-party scanner that forwards the payload to /api/verify without an authorized X-App-Key is rejected with 401 before the payload is even parsed.',
  },
  { tone: 'ok', text: 'No verification event is recorded and no product information is disclosed to the unauthorized client.' },
  {
    tone: 'warn',
    text: 'Limitation: the text itself can still be read and copied. App keys identify client apps but can be extracted from a web bundle or app binary — the production Flutter app should add platform attestation (Play Integrity / App Attest).',
  },
];

export function ScenarioSimulator({ productId }: { productId: string }) {
  const { data: product, isLoading } = useProduct(productId);
  const verify = useVerify();
  const tokenAction = useTokenAction();
  const toast = useToast();

  const deviceRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<ScenarioKey | null>(null);
  const [step, setStep] = useState(-1);
  const [stepFailed, setStepFailed] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [scanner, setScanner] = useState<Scanner>(RETAIL);
  const [response, setResponse] = useState<VerifyResponse | null>(null);
  const [request, setRequest] = useState<object | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [steps, setSteps] = useState<string[]>(STEPS);
  const [rejection, setRejection] = useState<Rejection | null>(null);

  const note = (kind: TimelineItem['kind'], title: string, detail: string, extra: Partial<TimelineItem> = {}) =>
    setTimeline((t) => [{ id: Date.now() + Math.random(), at: new Date().toISOString(), kind, title, detail, ...extra }, ...t].slice(0, 40));

  async function reissue(reason: string): Promise<ProductDetail> {
    const out = await tokenAction.mutateAsync({ id: productId, action: 'reissue', reason });
    return out.product;
  }

  async function scanImage(opts: { image: string; kind: SubjectKind; caption: string; by: Scanner; scenario?: ScenarioKey; fallbackPayload?: string }) {
    setSubject({ kind: opts.kind, image: opts.image, caption: opts.caption });
    setScanner(opts.by);
    setResponse(null);
    setRejection(null);
    setSteps(STEPS);
    setPoints([]);
    setRequest(null);
    setStepFailed(false);

    setStep(0);
    await sleep(550);
    setStep(1);
    let decoded: string;
    try {
      decoded = await decodeQr(opts.image);
    } catch {
      if (!opts.fallbackPayload) {
        setStepFailed(true);
        throw new Error('The QR code in the image could not be decoded.');
      }
      decoded = opts.fallbackPayload;
      note('info', 'Decoder fallback', 'Browser decoder could not read the simulated image; using the encoded payload.');
    }
    await sleep(450);
    setStep(2);
    const body = { payload: decoded, scannerId: opts.by.id, location: opts.by.location, source: 'simulator' as const };
    setRequest({
      method: 'POST',
      url: '/api/verify',
      headers: { 'Content-Type': 'application/json', 'X-App-Key': APP_KEY ? 'web-scanner key (VITE_APP_KEY, hidden)' : '(not configured)' },
      body: { ...body, payload: mask(decoded) },
    });
    const res = await verify.mutateAsync(body);
    await sleep(400);
    setStep(3);
    await sleep(500);
    setStep(4);
    setResponse(res);
    setPoints(explain(res, opts.scenario));
    note('scan', `${opts.caption} → ${opts.by.id}`, `${res.reasonCode}${res.scan ? ` · scan #${res.scan.scanNumber}` : ''}`, {
      result: res.result,
      flagged: res.scan?.flagged,
    });
    return res;
  }

  /** Scenario F: what a generic camera app / third-party scanner can do with the label. */
  async function scanWithRegularCamera(image: string) {
    setSubject({ kind: 'original', image, caption: 'Regular camera app' });
    setScanner({ id: 'CAMERA-APP', label: 'Phone camera / third-party scanner', location: 'Unknown' });
    setResponse(null);
    setRejection(null);
    setPoints([]);
    setRequest(null);
    setSteps(CAMERA_STEPS);
    setStepFailed(false);

    setStep(0);
    await sleep(550);
    setStep(1);
    const text = await decodeQr(image);
    await sleep(450);
    setStep(2);
    setRejection({ status: 0, body: null, text });
    note('info', 'Camera app decoded plain text', `“${maskPayload(text)}” — not a link; nothing to open.`);
    await sleep(1100);
    setStep(3);
    setRequest({ method: 'POST', url: '/api/verify', headers: { 'Content-Type': 'application/json', 'X-App-Key': '(none)' }, body: { payload: mask(text) } });
    const res = await verifyWithoutAppKey(text);
    await sleep(500);
    setStep(4);
    setStepFailed(true);
    setRejection({ status: res.status, body: res.body, text });
    setPoints(CAMERA_POINTS);
    const code = (res.body as { error?: { code?: string } } | null)?.error?.code ?? 'UNKNOWN';
    note('info', 'Third-party client → /api/verify', `HTTP ${res.status} · ${code} · no event recorded`);
  }

  async function run(key: ScenarioKey) {
    setRunning(true);
    setActive(key);
    if (window.innerWidth < 900) deviceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCompare(null);
    try {
      let p = await api.get<ProductDetail>(`/products/${productId}`);
      if (!p.activeLabel?.qrPayload) {
        p = (await tokenAction.mutateAsync({ id: productId, action: 'issue' })).product;
        note('admin', 'Label issued', 'The product had no active label, so a new one was issued.');
      }
      const url = () => p.activeLabel!.qrPayload!;
      let original = await qrDataUrl(url(), 420);

      switch (key) {
        case 'A': {
          if ((p.activeLabel?.scanCount ?? 0) > 0) {
            const prior = p.activeLabel!.scanCount;
            p = await reissue('Live demo: fresh label for first-scan scenario');
            original = await qrDataUrl(url(), 420);
            note('admin', 'Fresh label issued', `The previous label already had ${prior} scan(s); it was revoked so this scan is truly the first.`);
          }
          await scanImage({ image: original, kind: 'original', caption: 'Original label', by: RETAIL, scenario: 'A' });
          break;
        }
        case 'B': {
          if ((p.activeLabel?.scanCount ?? 0) === 0) {
            note('info', 'Initial scan', 'This label had not been scanned yet, so a first scan runs before the repeat.');
            await scanImage({ image: original, kind: 'original', caption: 'Original label', by: RETAIL, scenario: 'A' });
            await sleep(700);
          }
          await scanImage({ image: original, kind: 'original', caption: 'Original label (again)', by: RETAIL, scenario: 'B' });
          break;
        }
        case 'C': {
          const parsed = parsePayload(url());
          if (parsed.kind !== 'vq1') throw new Error('Unexpected label payload format');
          const token = parsed.token;
          const tampered = tamperToken(token);
          const i = Math.floor(token.length / 2);
          note('info', 'QR modified', `Character ${i + 1} of the token changed from “${token[i]}” to “${tampered[i]}”. The original signature was kept.`);
          const image = await qrDataUrl(url().replace(token, tampered), 420);
          await scanImage({ image, kind: 'tampered', caption: 'Modified QR (1 character)', by: RETAIL, scenario: 'C' });
          break;
        }
        case 'D': {
          const oldImage = original;
          p = await reissue('Live demo: label revoked and replaced');
          note('admin', 'Label reissued', 'The old token was revoked and a new label issued. The old printed label is now scanned.');
          await sleep(400);
          await scanImage({ image: oldImage, kind: 'old', caption: 'Old (revoked) label', by: RETAIL, scenario: 'D' });
          break;
        }
        case 'E': {
          const copy = await simulateCopy(original);
          const [a, b] = await Promise.all([decodeQr(original), decodeQr(copy).catch(() => null)]);
          setCompare({ original, copy, same: b !== null && b.trim() === a.trim(), preview: maskPayload(a) });
          await scanImage({ image: original, kind: 'original', caption: 'Original label', by: RETAIL });
          await sleep(800);
          await scanImage({ image: copy, kind: 'copy', caption: 'Photocopied label', by: REMOTE, scenario: 'E', fallbackPayload: a });
          break;
        }
        case 'F': {
          await scanWithRegularCamera(original);
          break;
        }
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Scenario failed', body: err instanceof Error ? err.message : undefined });
    } finally {
      setRunning(false);
    }
  }

  async function resetLabel() {
    setRunning(true);
    try {
      await reissue('Live demo: label reset');
      note('admin', 'Label reset', 'A fresh label with zero scans was issued for the demo product.');
      setResponse(null);
      setSubject(null);
      setStep(-1);
      setCompare(null);
      setRejection(null);
    } finally {
      setRunning(false);
    }
  }

  if (isLoading || !product) return <LoadingBlock />;

  const rejected = Boolean(rejection?.status);
  const viewState = rejected
    ? 'failure'
    : !response
      ? running
        ? 'scanning'
        : 'idle'
      : response.result === 'authentic'
        ? 'success'
        : response.result === 'suspicious'
          ? 'warning'
          : 'failure';

  return (
    <div className="stack">
      <div className="scenario-bar" role="group" aria-label="Scenarios">
        {SCENARIOS.map((s) => (
          <button key={s.key} className={`scenario${active === s.key ? ' active' : ''}`} onClick={() => run(s.key)} disabled={running}>
            <span className="row" style={{ gap: 8 }}>
              <span className="s-key">{s.key}</span>
              <span className="s-title">{s.title}</span>
            </span>
            <span className="s-desc">{s.desc}</span>
          </button>
        ))}
      </div>

      <div className="demo-grid">
        {/* Column 1: the registered product and its label */}
        <div className="stack">
          <Card
            title="Registered product"
            sub="The physical label attached to the item"
            actions={
              <button className="btn btn-sm" onClick={resetLabel} disabled={running} title="Issue a fresh label with no scans">
                <RefreshCw size={14} /> Reset label
              </button>
            }
          >
            {product.activeLabel ? (
              <div className="stack" style={{ gap: 14 }}>
                <ProductLabel product={product} label={product.activeLabel} compact />
                <dl className="dl" style={{ gridTemplateColumns: '120px minmax(0,1fr)' }}>
                  <dt>Label status</dt>
                  <dd>
                    <TokenStatusBadge status={product.activeLabel.status} />
                  </dd>
                  <dt>Scans on label</dt>
                  <dd>{product.activeLabel.scanCount}</dd>
                  <dt>Token</dt>
                  <dd className="mono">{product.activeLabel.tokenPreview}</dd>
                  <dt>Labels issued</dt>
                  <dd>{product.labelHistory.length}</dd>
                </dl>
              </div>
            ) : (
              <EmptyState icon={KeyRound} title="No active label">
                Run any scenario and a label will be issued automatically.
              </EmptyState>
            )}
          </Card>
          {compare && (
            <Card title="Original vs. copy" sub="What the decoder extracts from each image">
              <div className="copy-compare">
                <div className="cc-item">
                  <img src={compare.original} alt="Original label QR" />
                  <div className="cc-cap">Original</div>
                </div>
                <Copy size={18} className="subtle" />
                <div className="cc-item">
                  <img src={compare.copy} alt="Simulated photocopy of the QR" />
                  <div className="cc-cap">Photocopy (simulated)</div>
                </div>
              </div>
              <div className={`callout ${compare.same ? 'warn' : ''} small mt-12`}>
                <div>
                  <strong>{compare.same ? 'Identical decoded payload' : 'Copy decoded with fallback'}</strong>
                  Both images carry the signed payload <span className="mono">{compare.preview}</span>. To the server, they are the same label.
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Column 2: the scanner */}
        <div className="stack">
          <div className="scanner-device" ref={deviceRef} style={{ scrollMarginTop: 72 }}>
            <div className="scanner-top">
              <span className="mono">{scanner.id}</span>
              <span className="truncate">{scanner.label}</span>
              <span className="live">
                <i style={scanner.id === 'CAMERA-APP' ? { background: '#f87171', boxShadow: '0 0 0 3px rgba(248,113,113,.2)' } : undefined} />{' '}
                {scanner.id === 'CAMERA-APP' ? 'Not authorized' : 'Online'}
              </span>
            </div>
            <div className={`viewport state-${viewState}`}>
              {subject ? (
                <div className="subject" key={subject.image}>
                  <img src={subject.image} alt={subject.caption} />
                </div>
              ) : (
                <div className="placeholder">
                  <ScanLine size={28} />
                  Choose a scenario above to start a simulated scan.
                </div>
              )}
              <div className="reticle">
                <i />
                <i />
                <i />
                <i />
              </div>
              {running && !response && !rejected && <div className="scanline" />}
            </div>
            <div className="scanner-status">
              {subject ? (
                <>
                  <div className="row between">
                    <span className="strong" style={{ color: '#fff' }}>
                      {subject.caption}
                    </span>
                    {response && <ResultBadge result={response.result} />}
                    {rejected && <span className="badge badge-danger">HTTP {rejection?.status}</span>}
                  </div>
                  <div className="small" style={{ color: 'var(--navy-300)', marginTop: 4 }}>
                    {response
                      ? response.message
                      : rejected
                        ? 'Rejected — this client is not an authorized VERIQ application.'
                        : step >= 0
                          ? steps[Math.min(step, steps.length - 1)] + '…'
                          : 'Ready'}
                  </div>
                </>
              ) : (
                <span style={{ color: 'var(--navy-300)' }}>Simulated authorized scanner · {scanner.location}</span>
              )}
            </div>
          </div>
          <Card title="Verification progress">
            <ol className="steps">
              {steps.map((label, i) => {
                const done = step > i || (step === i && i === steps.length - 1 && response);
                const failed = stepFailed && step === i;
                const cls = failed ? 'fail' : done ? 'done' : step === i ? 'active' : '';
                return (
                  <li key={label} className={cls}>
                    <span className="si">{failed ? <X size={12} /> : done ? <Check size={12} /> : step === i ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : null}</span>
                    {label}
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        {/* Column 3: result and explanation */}
        <div className="stack demo-col-3">
          <Card
            title={rejection ? 'What a regular camera sees' : 'Verification result'}
            sub={response ? `Event ${response.eventId} · ${fmtTime(response.checkedAt)}` : rejection ? 'Generic camera app / third-party scanner' : 'Awaiting scan'}
          >
            {rejection ? (
              <CameraAppView rejection={rejection} />
            ) : response ? (
              <VerificationDetails response={response} />
            ) : (
              <EmptyState icon={ScanLine} title="No result yet">
                The result returned by the verification API will appear here.
              </EmptyState>
            )}
          </Card>
          {points.length > 0 && (
            <Card title="Why this result?">
              <ul className="explain">
                {points.map((pt, i) => (
                  <li key={i}>
                    {pt.tone === 'ok' && <CheckCircle2 size={16} color="var(--success)" />}
                    {pt.tone === 'warn' && <AlertTriangle size={16} color="#d97706" />}
                    {pt.tone === 'bad' && <ShieldX size={16} color="var(--danger)" />}
                    {pt.tone === 'info' && <Info size={16} color="var(--accent)" />}
                    <span>{pt.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <Card title="Server exchange" sub="Request sent by the scanner and the API response (payload and key masked in the UI)">
          {request ? (
            <div className="stack-sm">
              <div className="tag">Request</div>
              <JsonView value={request} />
              {rejection?.status ? (
                <>
                  <div className="tag mt-8">Response · HTTP {rejection.status}</div>
                  <JsonView value={rejection.body} />
                </>
              ) : null}
              {response && (
                <>
                  <div className="tag mt-8">Response</div>
                  <JsonView value={response} />
                </>
              )}
            </div>
          ) : (
            <EmptyState icon={ArrowRight} title="No request yet" />
          )}
          {response?.scan && (
            <div className="table-wrap mt-16" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="table rule-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th className="num">Observed</th>
                    <th className="num">Limit</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {response.scan.rules.map((r) => (
                    <tr key={r.code}>
                      <td className="mono small">{r.code}</td>
                      <td className="num">{r.observed}</td>
                      <td className="num">{r.threshold}</td>
                      <td>{r.triggered ? <span className="badge badge-warning">Triggered</span> : <span className="badge badge-neutral">Pass</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card
          title="Scan timeline"
          sub="Events from this demo session — also recorded in the verification log"
          actions={
            <Link className="btn btn-sm" to={`/logs?productId=${productId}`}>
              <ListChecks size={14} /> Open log
            </Link>
          }
        >
          {timeline.length === 0 ? (
            <EmptyState icon={ListChecks} title="No events yet">
              Each scenario adds its scans and admin actions here.
            </EmptyState>
          ) : (
            <ul className="timeline">
              {timeline.map((t) => (
                <li key={t.id}>
                  <TimelineDot item={t} />
                  <div className="row-wrap between">
                    <span className="strong">{t.title}</span>
                    <span className="t-time">{fmtTime(t.at)}</span>
                  </div>
                  <div className="small muted row-wrap" style={{ gap: 6 }}>
                    {t.result && <ResultBadge result={t.result} />}
                    {t.flagged && <span className="badge badge-warning">Repeat-scan warning</span>}
                    <span className={t.kind === 'scan' ? 'mono' : ''}>{t.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function TimelineDot({ item }: { item: TimelineItem }) {
  if (item.kind === 'admin')
    return (
      <span className="t-dot ico info">
        <RefreshCw size={11} />
      </span>
    );
  if (item.kind === 'info')
    return (
      <span className="t-dot ico neutral">
        <Info size={11} />
      </span>
    );
  const cls = item.result === 'authentic' ? 'ok' : item.result === 'suspicious' ? 'warn' : 'bad';
  const Icon = item.result === 'authentic' ? Check : item.result === 'suspicious' ? AlertTriangle : item.result === 'revoked' ? Ban : X;
  return (
    <span className={`t-dot ico ${cls}`}>
      <Icon size={11} />
    </span>
  );
}

function CameraAppView({ rejection }: { rejection: Rejection }) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="camera-app">
        <div className="camera-app-head">
          <Smartphone size={14} /> Camera · QR code detected
        </div>
        <div className="camera-app-body">
          <div className="tag">Text</div>
          <div className="mono camera-app-text">{maskPayload(rejection.text)}</div>
          <div className="row-wrap small muted mt-8">
            <span className="badge badge-neutral">Copy text</span>
            <span className="badge badge-neutral">Search web</span>
            <span className="small">No link to open</span>
          </div>
        </div>
      </div>
      {rejection.status ? (
        <div className="result-hero invalid" role="status">
          <div className="big-ico">
            <Lock size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3>Rejected — not an authorized VERIQ app</h3>
            <p>
              HTTP {rejection.status} · {(rejection.body as { error?: { code?: string; message?: string } } | null)?.error?.code}. The verification API only
              answers requests that carry an authorized X-App-Key. No event was recorded and no product data was disclosed.
            </p>
          </div>
        </div>
      ) : (
        <div className="loading-block" style={{ padding: 24 }}>
          <Spinner />
        </div>
      )}
    </div>
  );
}
