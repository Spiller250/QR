import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, CameraOff, ImageUp, Keyboard, ScanLine, TriangleAlert } from 'lucide-react';
import { DEMO_SCANNERS } from '../../../shared/constants';
import type { ScanSource, VerifyResponse } from '../../../shared/types';
import { useVerify } from '../../api/hooks';
import { decodeQr, QrScanner } from '../../lib/qr';
import { ResultBadge } from '../badges';
import { Card, EmptyState, Field, Spinner } from '../ui';
import { VerificationDetails } from '../VerificationResult';
import { explain } from '../../lib/explain';

type Mode = 'camera' | 'upload' | 'manual';

export function AuthorizedScanner() {
  const [mode, setMode] = useState<Mode>('camera');
  const [scannerId, setScannerId] = useState<string>(DEMO_SCANNERS[1].id);
  const [response, setResponse] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const busyRef = useRef(false);
  const verify = useVerify();
  const device = DEMO_SCANNERS.find((s) => s.id === scannerId)!;

  async function submit(raw: string, source: Exclude<ScanSource, 'seed' | 'public_page'>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      const res = await verify.mutateAsync({ payload: raw.trim(), scannerId: device.id, location: device.location, source });
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      busyRef.current = false;
    }
  }

  function stopCamera() {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setCameraOn(false);
  }

  // Camera access is requested only after the operator presses "Start camera".
  async function startCamera() {
    if (!videoRef.current) return;
    setError(null);
    setStarting(true);
    try {
      if (!window.isSecureContext) throw new Error('Camera access requires HTTPS or localhost.');
      if (!(await QrScanner.hasCamera())) throw new Error('No camera was found on this device.');
      const s = new QrScanner(
        videoRef.current,
        (result) => {
          stopCamera();
          void submit(result.data, 'camera');
        },
        { returnDetailedScanResult: true, preferredCamera: 'environment', maxScansPerSecond: 6, highlightScanRegion: false },
      );
      scannerRef.current = s;
      await s.start();
      setCameraOn(true);
      setResponse(null);
    } catch (err) {
      stopCamera();
      const msg = err instanceof Error ? err.message : String(err);
      setError(/denied|NotAllowed/i.test(msg) ? 'Camera permission was denied. Use image upload or manual entry instead.' : `Camera unavailable: ${msg}`);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => () => stopCamera(), []);
  useEffect(() => {
    if (mode !== 'camera') stopCamera();
  }, [mode]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const data = await decodeQr(file);
      await submit(data, 'manual');
    } catch {
      setError('No QR code could be decoded from that image.');
    }
  }

  function onManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim()) void submit(manual, 'manual');
  }

  const viewState = !response ? 'idle' : response.result === 'authentic' ? 'success' : response.result === 'suspicious' ? 'warning' : 'failure';

  return (
    <div className="stack">
      <div className="callout warn">
        <TriangleAlert size={18} />
        <div>
          <strong>Browser-based scanner — proof of concept</strong>
          This web page is an authorized client (app ID “web-scanner”) and sends its app key with every request. It is not the dedicated Flutter
          application: its key is embedded in the web bundle and therefore not secret, there is no device attestation, offline mode or secure device
          enrolment, and scanner identifiers are self-reported.
        </div>
      </div>
      <div className="grid grid-2">
        <div className="stack">
          <div className="scanner-device">
            <div className="scanner-top">
              <span className="mono">{device.id}</span>
              <span className="truncate">{device.location}</span>
              <span className="live">
                <i /> {cameraOn ? 'Camera live' : 'Ready'}
              </span>
            </div>
            <div className={`viewport state-${viewState}`}>
              <video ref={videoRef} muted playsInline style={{ display: cameraOn ? 'block' : 'none' }} />
              {!cameraOn && (
                <div className="placeholder">
                  {mode === 'camera' ? <Camera size={28} /> : mode === 'upload' ? <ImageUp size={28} /> : <Keyboard size={28} />}
                  {mode === 'camera' ? 'Press “Start camera” and point it at a VERIQ label.' : mode === 'upload' ? 'Upload a photo or screenshot of a label.' : 'Paste a token or verification URL below.'}
                </div>
              )}
              <div className="reticle">
                <i />
                <i />
                <i />
                <i />
              </div>
              {cameraOn && <div className="scanline" />}
            </div>
            <div className="scanner-controls">
              <select className="select" value={scannerId} onChange={(e) => setScannerId(e.target.value)} aria-label="Scanner device" style={{ flex: 1 }}>
                {DEMO_SCANNERS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} — {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Card>
            <div className="segmented" style={{ marginBottom: 16 }}>
              <button className={mode === 'camera' ? 'active' : ''} onClick={() => setMode('camera')}>
                <Camera size={14} /> Camera
              </button>
              <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
                <ImageUp size={14} /> Image
              </button>
              <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>
                <Keyboard size={14} /> Manual
              </button>
            </div>
            {mode === 'camera' && (
              <div className="row-wrap">
                {cameraOn ? (
                  <button className="btn" onClick={stopCamera}>
                    <CameraOff size={16} /> Stop camera
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={startCamera} disabled={starting}>
                    {starting ? <Spinner light /> : <Camera size={16} />} Start camera
                  </button>
                )}
                <span className="small muted">The browser asks for camera permission only after you press the button.</span>
              </div>
            )}
            {mode === 'upload' && (
              <Field label="Label image" hint="PNG/JPG of a QR label — e.g. a PNG downloaded from a product page. Decoded locally in the browser.">
                <input className="input" type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} style={{ paddingTop: 6 }} />
              </Field>
            )}
            {mode === 'manual' && (
              <form onSubmit={onManual} className="stack-sm">
                <Field label="QR payload" hint="Fallback when no camera is available. Paste the label text (VQ1.<token>.<signature>).">
                  <input className="input mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="VQ1.xxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx" />
                </Field>
                <div>
                  <button className="btn btn-primary" disabled={verify.isPending || !manual.trim()}>
                    {verify.isPending ? <Spinner light /> : <ScanLine size={16} />} Verify
                  </button>
                </div>
              </form>
            )}
            {error && <div className="callout danger small mt-12">{error}</div>}
          </Card>
        </div>
        <div className="stack">
          <Card title="Verification result" sub={response ? <ResultBadge result={response.result} /> : 'Awaiting scan'}>
            {verify.isPending ? (
              <div className="loading-block">
                <Spinner />
              </div>
            ) : response ? (
              <div className="stack">
                <VerificationDetails response={response} />
                <ul className="explain">
                  {explain(response).map((p, i) => (
                    <li key={i} className="small">
                      • {p.text}
                    </li>
                  ))}
                </ul>
                {mode === 'camera' && (
                  <button className="btn" onClick={startCamera}>
                    <Camera size={16} /> Scan another label
                  </button>
                )}
              </div>
            ) : (
              <EmptyState icon={ScanLine} title="No scan yet">
                Scan a label from the Products or QR Codes page — for example on a second screen or a printed label.
              </EmptyState>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
