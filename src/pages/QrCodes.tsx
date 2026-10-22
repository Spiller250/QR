import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, QrCode, Search, Tag } from 'lucide-react';
import { useQrCodes } from '../api/hooks';
import { TokenStatusBadge } from '../components/badges';
import { QrImage } from '../components/qr';
import { EmptyState, ErrorState, LoadingBlock, PageHead } from '../components/ui';
import { fmtDateTime } from '../lib/format';

export function QrCodesPage() {
  const [status, setStatus] = useState<'' | 'active' | 'revoked'>('');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQrCodes({ status: status || undefined, q: q.trim() || undefined });
  const items = data?.items ?? [];
  const active = items.filter((i) => i.status === 'active').length;

  return (
    <div className="stack">
      <PageHead title="QR Codes" description="Every verification label issued, including revoked ones. Open a product to download, print, reissue or revoke its label." />

      <div className="grid grid-2">
        <div className="callout">
          <Tag size={18} className="muted" />
          <div>
            <strong>Public product ID</strong>
            <span className="muted">Human-readable identifier such as VQ-7K2M-QX9D. Printed in plain text on the label; not a credential.</span>
          </div>
        </div>
        <div className="callout warn">
          <KeyRound size={18} />
          <div>
            <strong>Secret verification token</strong>
            128 bits from a CSPRNG, carried inside a signed, non-URL QR payload (VQ1.token.signature). The server stores an HMAC for lookup and discards the plaintext on revocation.
          </div>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="input-icon search">
            <Search size={16} />
            <input className="input" placeholder="Search by product, SKU or public ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search labels" />
          </div>
          <div className="segmented" role="tablist">
            {(['', 'active', 'revoked'] as const).map((s) => (
              <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
                {s === '' ? 'All' : s === 'active' ? 'Active' : 'Revoked'}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="card-body">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={QrCode} title="No labels match">
            Adjust the search or status filter.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>QR</th>
                  <th>Product</th>
                  <th>Label ID</th>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>Revoked / reason</th>
                  <th className="num">Scans</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.tokenId} className="clickable" onClick={() => navigate(`/products/${l.productId}`)}>
                    <td>
                      {l.qrPayload ? (
                        <QrImage payload={l.qrPayload} alt="" className="qr-thumb" width={132} />
                      ) : (
                        <div className="qr-thumb" style={{ display: 'grid', placeItems: 'center', color: 'var(--subtle)' }}>
                          <QrCode size={18} />
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 200 }}>
                      <div className="cell-title">{l.productName}</div>
                      <div className="cell-sub mono">
                        {l.productPublicId} · {l.sku}
                      </div>
                    </td>
                    <td className="mono small">{l.tokenId}</td>
                    <td className="mono">{l.tokenPreview}</td>
                    <td>
                      <TokenStatusBadge status={l.status} />
                    </td>
                    <td className="nowrap">{fmtDateTime(l.issuedAt)}</td>
                    <td>
                      {l.revokedAt ? (
                        <>
                          <div className="nowrap">{fmtDateTime(l.revokedAt)}</div>
                          <div className="cell-sub">{l.revokeReason}</div>
                        </>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td className="num">{l.scanCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {items.length > 0 && (
          <div className="card-foot">
            <span>
              {items.length} label{items.length === 1 ? '' : 's'} · {active} active
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
