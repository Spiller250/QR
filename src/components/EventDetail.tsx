import { Link } from 'react-router-dom';
import { RULE_DESCRIPTIONS } from '../../shared/constants';
import type { VerificationEvent } from '../../shared/types';
import { fmtDateTime } from '../lib/format';
import { ResultBadge } from './badges';
import { Drawer } from './ui';

const SOURCE_LABEL: Record<string, string> = {
  simulator: 'Live demo simulator',
  camera: 'Browser camera scanner',
  manual: 'Manual token entry',
  public_page: 'Public web page (retired)',
  seed: 'Seeded demo history',
};

export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

export function EventDetailDrawer({ event, onClose }: { event: VerificationEvent; onClose: () => void }) {
  return (
    <Drawer title="Verification event" sub={<span className="mono">{event.id}</span>} onClose={onClose}>
      <div className="stack">
        <div className="row-wrap">
          <ResultBadge result={event.result} />
          {event.flagged && <span className="badge badge-warning">Repeat-scan warning</span>}
          {event.repeatScan && !event.flagged && <span className="badge badge-neutral">Repeat scan</span>}
        </div>
        <div className={`callout ${event.result === 'authentic' ? 'success' : event.result === 'suspicious' ? 'warn' : 'danger'} small`}>
          <div>
            <strong>{event.reasonCode}</strong>
            {event.reason}
          </div>
        </div>
        <dl className="dl">
          <dt>Timestamp</dt>
          <dd>{fmtDateTime(event.createdAt)}</dd>
          <dt>Product</dt>
          <dd>
            {event.productId && event.productName ? (
              <Link to={`/products/${event.productId}`} onClick={onClose}>
                {event.productName}
              </Link>
            ) : (
              <span className="muted">Not resolved — no product disclosed</span>
            )}
            {event.productPublicId && <div className="cell-sub mono">{event.productPublicId}</div>}
          </dd>
          <dt>Scanner / device</dt>
          <dd className="mono">{event.scannerId}</dd>
          <dt>Location (reported)</dt>
          <dd>{event.location ?? '—'}</dd>
          <dt>Client app</dt>
          <dd className="mono">{event.appClient ?? '—'}</dd>
          <dt>Source</dt>
          <dd>{sourceLabel(event.source)}</dd>
          <dt>Check type</dt>
          <dd>{event.checkType === 'physical' ? 'Photo + copy-detection pattern' : 'QR payload'}</dd>
          {event.checkType === 'physical' && (
            <>
              <dt>CDP score</dt>
              <dd>
                {event.cdpScore !== null ? event.cdpScore.toFixed(3) : '—'} (threshold {event.cdpThreshold?.toFixed(2) ?? '—'})
              </dd>
            </>
          )}
          <dt>Scan number</dt>
          <dd>{event.scanNumber ?? '—'}</dd>
          <dt>Token fingerprint</dt>
          <dd className="mono">{event.tokenFingerprint}</dd>
          <dt>Label ID</dt>
          <dd className="mono">{event.tokenId ?? '—'}</dd>
          <dt>User agent</dt>
          <dd className="small muted">{event.userAgent ?? '—'}</dd>
        </dl>
        {event.rulesTriggered.length > 0 && (
          <div>
            <div className="tag">Rules triggered</div>
            <ul className="stack-sm mt-8" style={{ paddingLeft: 18, margin: 0 }}>
              {event.rulesTriggered.map((r) => (
                <li key={r}>
                  <span className="mono strong">{r}</span> — <span className="muted">{RULE_DESCRIPTIONS[r]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="small subtle">
          The token fingerprint is a truncated HMAC of the presented code. Raw payloads are never written to the log. The client app is derived from the
          X-App-Key header; scanner IDs and locations are self-reported by that client in this POC.
        </p>
      </div>
    </Drawer>
  );
}
