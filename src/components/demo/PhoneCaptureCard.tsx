import { ExternalLink, Smartphone } from 'lucide-react';
import { useSettings } from '../../api/hooks';
import { QrImage } from '../qr';
import { Card } from '../ui';

/** Link + QR to open the phone capture page (/scan-physical) on a phone on the same Wi-Fi. */
export function PhoneCaptureCard() {
  const { data } = useSettings();
  const port = window.location.port ? `:${window.location.port}` : '';
  const local = /^(localhost|127\.)/.test(window.location.hostname);
  const lanHost = local ? data?.lanAddresses[0] : window.location.hostname;
  const url = lanHost ? `${window.location.protocol}//${lanHost}${port}/scan-physical` : null;
  const online = data?.cdp.serviceOnline;

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          <Smartphone size={16} /> Physical label check (copy detection)
        </span>
      }
      sub="Photograph a printed label with a phone; the server checks the copy-detection pattern"
      actions={
        <a className="btn btn-sm" href="/scan-physical" target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Open capture page
        </a>
      }
    >
      <div className="row-wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
        {url && <QrImage payload={url} alt="Link to the phone capture page" className="qr-link" width={240} />}
        <div className="stack-sm" style={{ flex: '1 1 280px' }}>
          {url ? (
            <div>
              <div className="tag">On a phone on the same Wi-Fi, open</div>
              <div className="token-box mt-4">{url}</div>
              <p className="small muted mt-4">Scan this QR with the phone camera to open the page (it is a normal link to the capture page, not a product label).</p>
            </div>
          ) : (
            <p className="small muted">No LAN address detected. Start the web app with <code>npm run dev:lan</code> and open it via the PC's Wi-Fi IP.</p>
          )}
          <div className="row-wrap small">
            Analysis service:
            {online === undefined ? <span className="muted">checking…</span> : online ? <span className="badge badge-success">online</span> : <span className="badge badge-danger">offline — run cdp-service\run-cdp.ps1</span>}
            {data && <span className="muted">threshold {data.cdp.threshold.toFixed(2)}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
