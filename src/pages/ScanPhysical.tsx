import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ImageUp, RotateCcw, ShieldX, Sun, Target, ZoomIn } from 'lucide-react';
import type { PhysicalVerifyResponse } from '../../shared/types';
import { APP_KEY, ApiError, upload } from '../api/client';
import { BrandMark } from '../components/Layout';
import { Spinner } from '../components/ui';
import { fmtDate } from '../lib/format';

/** Stable anonymous ID per browser install, so repeat scans from the same phone are recognised. */
function scannerId(): string {
  const key = 'veriq.phone-scanner-id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `PHONE-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16).toUpperCase().padStart(8, '0')}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'PHONE-ANON';
  }
}

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; file: File; preview: string }
  | { kind: 'done'; file: File; preview: string; response: PhysicalVerifyResponse }
  | { kind: 'error'; file: File | null; preview: string | null; message: string };

const TIPS = [
  { icon: ZoomIn, text: 'Hold the phone 8–12 cm from the label — the QR code should fill about a third of the screen.' },
  { icon: Target, text: 'Centre the QR code and keep the phone parallel to the label.' },
  { icon: Camera, text: 'Tap the label on screen to focus, then hold still while the photo is taken.' },
  { icon: Sun, text: 'Use even light. Avoid glare, shadows and flash reflections on the label.' },
];

export function ScanPhysicalPage() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [details, setDetails] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Scan label · VERIQ';
  }, []);

  useEffect(() => {
    const preview = state.kind !== 'idle' ? state.preview : null;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [state]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setDetails(false);
    setState({ kind: 'uploading', file, preview });
    // The original File is uploaded as-is: no canvas, no resizing, no recompression.
    const form = new FormData();
    form.append('scannerId', scannerId());
    form.append('source', 'camera');
    form.append('image', file, file.name || 'capture.jpg');
    try {
      const response = await upload<PhysicalVerifyResponse>('/verify-physical', form, { appKey: true });
      setState({ kind: 'done', file, preview, response });
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Verification failed.';
      if (err instanceof ApiError && err.status === 401) message = 'This scanner is not authorized (app key rejected). Check VITE_APP_KEY / APP_KEYS.';
      if (err instanceof ApiError && err.status === 503) message = 'The copy-detection service is not running on the server. Start cdp-service\\run-cdp.ps1 and try again.';
      setState({ kind: 'error', file, preview, message });
    }
  }

  const reset = () => setState({ kind: 'idle' });

  return (
    <div className="scan-page">
      <header className="scan-head">
        <div className="row" style={{ gap: 10 }}>
          <div style={{ background: 'var(--navy-900)', borderRadius: 8 }}>
            <BrandMark />
          </div>
          <div>
            <div className="strong" style={{ letterSpacing: '0.06em' }}>
              VERIQ
            </div>
            <div className="small muted">Physical label check</div>
          </div>
        </div>
        <span className="demo-chip">POC</span>
      </header>

      {!APP_KEY && (
        <div className="callout danger small">
          <div>
            <strong>VITE_APP_KEY is not configured</strong>This page cannot authenticate to the verification API.
          </div>
        </div>
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile} />

      {state.kind === 'idle' && (
        <>
          <button className="scan-cta" onClick={() => cameraInput.current?.click()}>
            <Camera size={40} />
            <span>Take photo of label</span>
            <small>Opens the phone camera</small>
          </button>
          <button className="btn btn-block" onClick={() => galleryInput.current?.click()}>
            <ImageUp size={16} /> Choose an existing photo
          </button>
          <Tips />
        </>
      )}

      {state.kind === 'uploading' && (
        <div className="scan-card">
          <img src={state.preview} alt="Captured label" className="scan-preview" />
          <div className="row" style={{ gap: 10, justifyContent: 'center', padding: 18 }}>
            <Spinner />
            <span>
              Analysing full-resolution photo ({(state.file.size / 1024 / 1024).toFixed(1)} MB)…
            </span>
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="scan-result neutral">
          <AlertTriangle size={44} />
          <h1>Could not verify</h1>
          <p>{state.message}</p>
          <button className="btn btn-lg btn-block" onClick={reset}>
            <RotateCcw size={17} /> Try again
          </button>
        </div>
      )}

      {state.kind === 'done' && <Result response={state.response} preview={state.preview} details={details} onDetails={() => setDetails((d) => !d)} onReset={reset} />}
    </div>
  );
}

function Tips() {
  return (
    <div className="scan-card scan-tips">
      <div className="tag">Capture tips</div>
      <ul>
        {TIPS.map((t) => (
          <li key={t.text}>
            <t.icon size={18} />
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Result({ response: r, preview, details, onDetails, onReset }: { response: PhysicalVerifyResponse; preview: string; details: boolean; onDetails: () => void; onReset: () => void }) {
  const view = {
    authentic: { cls: 'ok', icon: CheckCircle2, title: 'Original product', text: 'The copy-detection pattern matches a first-generation print.' },
    copy_suspected: { cls: 'bad', icon: ShieldX, title: 'Copy suspected', text: 'This label appears to be a reproduction (photocopy, re-print or screen).' },
    unreadable: { cls: 'neutral', icon: RotateCcw, title: 'Retake photo', text: r.message },
    invalid: { cls: 'bad', icon: ShieldX, title: 'Invalid code', text: r.message },
  }[r.result];
  const Icon = view.icon;
  return (
    <>
      <div className={`scan-result ${view.cls}`} role="status">
        <Icon size={48} />
        <h1>{view.title}</h1>
        <p>{view.text}</p>
        {r.product && r.result === 'authentic' && (
          <dl className="scan-facts">
            <dt>Product</dt>
            <dd>{r.product.name}</dd>
            <dt>Manufacturer</dt>
            <dd>{r.product.manufacturer}</dd>
            <dt>Batch</dt>
            <dd>
              {r.product.batchNumber} · {fmtDate(r.product.productionDate)}
            </dd>
            {r.scan && (
              <>
                <dt>Scan number</dt>
                <dd>{r.scan.scanNumber}</dd>
              </>
            )}
          </dl>
        )}
        <div className="scan-score">
          {r.score !== null ? (
            <>
              Score <b>{r.score.toFixed(2)}</b> · threshold {r.threshold.toFixed(2)}
            </>
          ) : (
            <>No score · {r.reasonCode}</>
          )}
        </div>
      </div>
      {r.result === 'unreadable' && <Tips />}
      <div className="scan-actions">
        <button className="btn btn-primary btn-lg" onClick={onReset}>
          <Camera size={17} /> Scan again
        </button>
        <button className="btn btn-lg" onClick={onDetails}>
          {details ? 'Hide details' : 'Details'}
        </button>
      </div>
      {details && (
        <div className="scan-card">
          <img src={preview} alt="Captured label" className="scan-preview" />
          <dl className="scan-facts small" style={{ padding: 14 }}>
            <dt>Result</dt>
            <dd className="mono">
              {r.result} / {r.reasonCode}
            </dd>
            <dt>Pixels per cell</dt>
            <dd>{r.diagnostics.pixelsPerCell ?? '—'}</dd>
            <dt>Sharpness</dt>
            <dd>
              {r.diagnostics.sharpness ?? '—'} (blur {r.diagnostics.blurCells ?? '—'} cells)
            </dd>
            <dt>Image</dt>
            <dd>
              {r.diagnostics.imageWidth ?? '?'} × {r.diagnostics.imageHeight ?? '?'} px · {r.diagnostics.bytes ? `${(r.diagnostics.bytes / 1024 / 1024).toFixed(1)} MB` : '—'}
            </dd>
            {r.components && (
              <>
                <dt>Components</dt>
                <dd className="mono">
                  {Object.entries(r.components)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' · ')}
                </dd>
              </>
            )}
            <dt>Event</dt>
            <dd className="mono">{r.eventId ?? '—'}</dd>
          </dl>
        </div>
      )}
    </>
  );
}
