import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Eye, EyeOff, FlaskConical, KeyRound, Pencil, QrCode, RefreshCw, Tag } from 'lucide-react';
import type { ProductDetail, VerificationEvent } from '../../shared/types';
import { useProduct, useTokenAction, useUpdateProduct } from '../api/hooks';
import { AuthStateBadge, ProductStatusBadge, RepeatBadge, ResultBadge, TokenStatusBadge } from '../components/badges';
import { EventDetailDrawer } from '../components/EventDetail';
import { ProductFormModal } from '../components/ProductForm';
import { CdpLabelActions, CdpLabelImage } from '../components/cdp';
import { useToast } from '../components/toast';
import { Card, ConfirmModal, EmptyState, ErrorState, Field, LoadingBlock } from '../components/ui';
import { fmtDate, fmtDateTime, fmtRelative } from '../lib/format';
import { parsePayload } from '../../shared/token';

export function ProductDetailPage() {
  const { id } = useParams();
  const { data: product, isLoading, error, refetch } = useProduct(id);
  const [editing, setEditing] = useState(false);
  const [event, setEvent] = useState<VerificationEvent | null>(null);
  const update = useUpdateProduct(id ?? '');
  const toast = useToast();

  if (isLoading) return <LoadingBlock />;
  if (error || !product) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="stack">
      <div>
        <Link to="/products" className="row small muted" style={{ gap: 4, display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Products
        </Link>
      </div>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="row-wrap">
            <h1>{product.name}</h1>
            <ProductStatusBadge status={product.status} />
            <AuthStateBadge state={product.authState} />
            {product.isDemo && <span className="badge badge-neutral">Demo data</span>}
          </div>
          <p>
            {product.manufacturer} · <span className="mono">{product.sku}</span>
          </p>
        </div>
        <div className="actions">
          <Link className="btn" to={`/demo?product=${product.id}`}>
            <FlaskConical size={16} /> Test in Live Demo
          </Link>
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil size={15} /> Edit
          </button>
        </div>
      </div>

      <div className="grid grid-main-side">
        <div className="stack">
          <Card title="Product details">
            <dl className="dl">
              <dt>Public product ID</dt>
              <dd className="mono">{product.publicId}</dd>
              <dt>Internal ID</dt>
              <dd className="mono small">{product.id}</dd>
              <dt>SKU</dt>
              <dd className="mono">{product.sku}</dd>
              <dt>Manufacturer</dt>
              <dd>{product.manufacturer}</dd>
              <dt>Category</dt>
              <dd>{product.category}</dd>
              <dt>Batch number</dt>
              <dd>{product.batchNumber}</dd>
              <dt>Production date</dt>
              <dd>{fmtDate(product.productionDate)}</dd>
              <dt>Registered</dt>
              <dd>{fmtDateTime(product.createdAt)}</dd>
              <dt>Verifications</dt>
              <dd>
                {product.scanCount} successful lookups · {product.flaggedCount} flagged · last {fmtRelative(product.lastScanAt)}
              </dd>
            </dl>
          </Card>

          <IdentifierExplainer product={product} />

          <Card title="Label history" sub="Every token ever issued for this product. Revoked tokens are rejected by the API." bodyClass="tight">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Label ID</th>
                    <th>Token</th>
                    <th>Status</th>
                    <th>Issued</th>
                    <th>Revoked</th>
                    <th className="num">Scans</th>
                  </tr>
                </thead>
                <tbody>
                  {product.labelHistory.map((l) => (
                    <tr key={l.tokenId}>
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
          </Card>

          <Card title="Recent verification events" sub="Latest 20 attempts that resolved to this product" bodyClass="tight" actions={<Link className="btn btn-sm" to={`/logs?productId=${product.id}`}>Open in logs</Link>}>
            {product.recentEvents.length === 0 ? (
              <EmptyState icon={QrCode} title="No verifications yet">
                Scan this product's label in the Live Demo or the scanner to record the first event.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Result</th>
                      <th>Scanner</th>
                      <th>Location</th>
                      <th>#</th>
                      <th>Warning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.recentEvents.map((e) => (
                      <tr key={e.id} className="clickable" onClick={() => setEvent(e)}>
                        <td className="nowrap">{fmtDateTime(e.createdAt)}</td>
                        <td>
                          <ResultBadge result={e.result} />
                        </td>
                        <td className="mono small">{e.scannerId}</td>
                        <td className="nowrap">{e.location ?? '—'}</td>
                        <td>{e.scanNumber ?? '—'}</td>
                        <td>
                          <RepeatBadge flagged={e.flagged} repeat={e.repeatScan} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <LabelPanel product={product} />
      </div>

      {editing && (
        <ProductFormModal
          title="Edit product"
          submitLabel="Save changes"
          initial={product}
          onClose={() => setEditing(false)}
          onSubmit={async (input) => {
            await update.mutateAsync(input);
            setEditing(false);
            toast({ tone: 'success', title: 'Product updated' });
          }}
        />
      )}
      {event && <EventDetailDrawer event={event} onClose={() => setEvent(null)} />}
    </div>
  );
}

function IdentifierExplainer({ product }: { product: ProductDetail }) {
  const [reveal, setReveal] = useState(false);
  const url = product.activeLabel?.qrPayload;
  const parsed = url ? parsePayload(url) : null;
  const secret = parsed?.kind === 'vq1' ? parsed.token : '';
  return (
    <Card title="Identifiers" sub="Public identifier vs. secret verification token">
      <div className="id-pair">
        <div className="id-card">
          <div className="tag">
            <Tag size={13} /> Public product ID
          </div>
          <div className="val">{product.publicId}</div>
          <p>Safe to print, share with support, or show to customers. Knowing it does not allow anyone to pass verification.</p>
        </div>
        <div className="id-card secret">
          <div className="tag" style={{ color: 'var(--warning)' }}>
            <KeyRound size={13} /> Secret verification token
          </div>
          <div className="val">{url ? (reveal ? secret : `•••••••••••••••••• ${product.activeLabel?.tokenPreview}`) : 'No active token'}</div>
          <p>128-bit random value carried only inside the signed QR payload. Looked up server-side by HMAC; never returned by the verification API.</p>
          {url && (
            <button className="btn btn-sm btn-ghost mt-4" onClick={() => setReveal((r) => !r)} style={{ paddingLeft: 0 }}>
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />} {reveal ? 'Hide' : 'Reveal (operator only)'}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function LabelPanel({ product }: { product: ProductDetail }) {
  const action = useTokenAction();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'reissue' | 'revoke' | null>(null);
  const [reason, setReason] = useState('');
  const label = product.activeLabel;

  async function run(kind: 'reissue' | 'revoke' | 'issue') {
    try {
      await action.mutateAsync({ id: product.id, action: kind, reason: reason.trim() || undefined });
      toast({
        tone: kind === 'revoke' ? 'warning' : 'success',
        title: kind === 'revoke' ? 'Label revoked' : kind === 'reissue' ? 'New label issued' : 'Label issued',
        body: kind === 'issue' ? undefined : 'The previous token is now rejected by the verification API.',
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Action failed', body: err instanceof Error ? err.message : undefined });
    } finally {
      setConfirm(null);
      setReason('');
    }
  }

  return (
    <div className="stack">
      <Card title="Active QR label" sub={label ? `Issued ${fmtDateTime(label.issuedAt)}` : 'This product cannot currently be verified'}>
        {label?.qrPayload ? (
          <div className="stack" style={{ gap: 16 }}>
            <div className="qr-frame">
              <CdpLabelImage productId={product.id} version={label.tokenId} alt={`Print label for ${product.name}`} style={{ width: '100%', maxWidth: 240 }} />
            </div>
            <div>
              <div className="tag">Encoded QR payload (plain text, not a URL)</div>
              <div className="token-box mt-4">
                VQ1.<span style={{ color: 'var(--warning)' }}>‹secret token›</span>.<span style={{ color: 'var(--accent)' }}>‹signature›</span>
              </div>
              <p className="small muted mt-4">Regular camera apps show this as text only. Verification requires an authorized VERIQ app.</p>
            </div>
            <div className="row-wrap between">
              <span className="small muted">
                {label.scanCount} verification{label.scanCount === 1 ? '' : 's'} on this label
              </span>
              <TokenStatusBadge status={label.status} />
            </div>
            <CdpLabelActions productId={product.id} publicId={product.publicId} version={label.tokenId} />
            <div className="row-wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="btn btn-sm" onClick={() => setConfirm('reissue')}>
                <RefreshCw size={14} /> Reissue token
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirm('revoke')}>
                <Ban size={14} /> Revoke
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={QrCode}
            title="No active label"
            action={
              <button className="btn btn-primary" onClick={() => run('issue')} disabled={action.isPending}>
                Issue new label
              </button>
            }
          >
            All previous tokens for this product have been revoked. Issue a new label to make it verifiable again.
          </EmptyState>
        )}
      </Card>
      {label?.qrPayload && (
        <Card title="Copy detection pattern" sub="40 × 40 random cells, 0.15 mm each — derived from the label token">
          <div className="cdp-zoom">
            <CdpLabelImage productId={product.id} version={label.tokenId} variant="pattern" alt="Zoomed copy detection pattern" />
          </div>
          <p className="small muted mt-12">
            This pattern sits in the centre of the QR code (about 6 mm square). A first-generation laser print keeps the tiny cells crisp; photocopies, re-prints of a
            photo and photos of a screen blur or alias them, which lowers the score in <strong>/api/verify-physical</strong>.
          </p>
        </Card>
      )}
      <div className="callout info small">
        <div>
          <strong>Reissue vs. revoke</strong>
          Reissue atomically revokes the current token and issues a new one (e.g. a damaged or leaked label). Revoke disables verification without a replacement.
        </div>
      </div>
      <button className="btn" onClick={() => navigate(`/demo?product=${product.id}`)}>
        <FlaskConical size={16} /> Run verification scenarios for this product
      </button>

      {confirm && (
        <ConfirmModal
          title={confirm === 'reissue' ? 'Reissue verification token?' : 'Revoke label?'}
          body={
            confirm === 'reissue'
              ? 'The current token will be revoked immediately and a new QR label generated. Physical labels already printed with the old code will fail verification.'
              : 'The current token will be revoked. Scans of this label will be rejected and the product will have no verifiable label until a new one is issued.'
          }
          confirmLabel={confirm === 'reissue' ? 'Reissue token' : 'Revoke label'}
          danger={confirm === 'revoke'}
          busy={action.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        >
          <Field label="Reason (recorded in label history)" className="mt-16">
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Label damaged in transit" maxLength={200} />
          </Field>
        </ConfirmModal>
      )}
    </div>
  );
}
