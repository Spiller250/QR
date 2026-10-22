import { useEffect } from 'react';
import { ScanLine, Smartphone } from 'lucide-react';
import { BrandMark } from '../components/Layout';

/**
 * Shown when someone opens a retired URL-format label (…/v/<token>) in a browser.
 * Verification is only available through authorized VERIQ applications, so this page
 * deliberately does not call the API or reveal anything about the code.
 */
export function LegacyLabelPage() {
  useEffect(() => {
    document.title = 'Use the official app · VERIQ';
  }, []);

  return (
    <div className="public-page">
      <div className="public-head">
        <div className="row" style={{ gap: 10 }}>
          <div style={{ background: 'var(--navy-900)', borderRadius: 8 }}>
            <BrandMark />
          </div>
          <div>
            <div className="strong" style={{ letterSpacing: '0.06em' }}>
              VERIQ
            </div>
            <div className="small muted">Product verification</div>
          </div>
        </div>
      </div>
      <div className="card public-card">
        <div className="card-body stack" style={{ alignItems: 'center', textAlign: 'center', padding: '36px 24px' }}>
          <div className="stat-icon" style={{ width: 52, height: 52, borderRadius: 12 }}>
            <Smartphone size={26} />
          </div>
          <h1 style={{ fontSize: 20 }}>Scan this label with the official VERIQ app</h1>
          <p className="muted" style={{ maxWidth: 400 }}>
            Product labels can only be verified with an authorized VERIQ application. Web links, regular camera apps and third-party scanners cannot verify a
            product.
          </p>
          <div className="callout small" style={{ textAlign: 'left' }}>
            <ScanLine size={16} className="muted" />
            <div>Open the VERIQ app, choose “Scan label” and point the camera at the QR code on the product.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
