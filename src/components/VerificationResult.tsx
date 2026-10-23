import { AlertTriangle, Ban, CheckCircle2, ShieldX } from 'lucide-react';
import type { VerifyResponse } from '../../shared/types';
import { fmtDate, fmtDateTime } from '../lib/format';

export function resultTitle(r: VerifyResponse): string {
  switch (r.result) {
    case 'authentic':
      if (r.reasonCode === 'PRODUCT_RECALLED') return 'Registered label — product recalled';
      if (r.reasonCode === 'PRODUCT_INACTIVE') return 'Registered label — product inactive';
      return r.scan?.repeatScan ? `Registered label — verification #${r.scan.scanNumber}` : 'Registered label — first verification';
    case 'suspicious':
      return 'Registered label — unusual scan pattern';
    case 'revoked':
      return 'Not verified — label revoked';
    default:
      if (r.reasonCode === 'BAD_SIGNATURE') return 'Not verified — signature check failed';
      if (r.reasonCode === 'LEGACY_FORMAT') return 'Not verified — retired label format';
      return 'Not verified — unrecognised code';
  }
}

const ICON: Record<VerifyResponse['result'], typeof CheckCircle2> = {
  authentic: CheckCircle2,
  suspicious: AlertTriangle,
  invalid: ShieldX,
  revoked: Ban,
  copy_suspected: ShieldX,
  unreadable: AlertTriangle,
};

export function ResultHero({ response }: { response: VerifyResponse }) {
  const Icon = ICON[response.result];
  return (
    <div className={`result-hero ${response.result}`} role="status">
      <div className="big-ico">
        <Icon size={22} />
      </div>
      <div style={{ minWidth: 0 }}>
        <h3>{resultTitle(response)}</h3>
        <p>{response.message}</p>
      </div>
    </div>
  );
}

export function VerificationDetails({ response }: { response: VerifyResponse }) {
  const p = response.product;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ResultHero response={response} />
      {p ? (
        <dl className="dl">
          <dt>Product</dt>
          <dd>{p.name}</dd>
          <dt>Manufacturer</dt>
          <dd>{p.manufacturer}</dd>
          <dt>Public product ID</dt>
          <dd className="mono">{p.publicId}</dd>
          <dt>Category</dt>
          <dd>{p.category}</dd>
          <dt>Batch / production</dt>
          <dd>
            {p.batchNumber} · {fmtDate(p.productionDate)}
          </dd>
          {response.scan && (
            <>
              <dt>Verification count</dt>
              <dd>
                {response.scan.scanNumber} {response.scan.scanNumber === 1 ? '(first scan)' : ''}
              </dd>
              <dt>First verified</dt>
              <dd>{fmtDateTime(response.scan.firstVerifiedAt)}</dd>
            </>
          )}
        </dl>
      ) : (
        <div className="callout small">
          <ShieldX size={16} className="muted" />
          <div>No product information is disclosed for unrecognised or revoked codes. The attempt has been recorded in the verification log.</div>
        </div>
      )}
      {response.scan && response.scan.rulesTriggered.length > 0 && (
        <div className="callout warn small">
          <AlertTriangle size={16} />
          <div>
            <strong>Repeat-scan rules matched: {response.scan.rulesTriggered.join(', ')}</strong>
            This is a risk signal, not proof of counterfeiting. The server only sees the token — it cannot tell an original label from a copy.
          </div>
        </div>
      )}
    </div>
  );
}
