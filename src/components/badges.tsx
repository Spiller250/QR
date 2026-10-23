import type { AuthState, ProductStatus, TokenStatus, VerificationResult } from '../../shared/types';

const RESULT: Record<VerificationResult, { cls: string; label: string }> = {
  authentic: { cls: 'badge-success', label: 'Authentic' },
  suspicious: { cls: 'badge-warning', label: 'Suspicious' },
  invalid: { cls: 'badge-danger', label: 'Invalid' },
  revoked: { cls: 'badge-danger', label: 'Revoked' },
  copy_suspected: { cls: 'badge-danger', label: 'Copy suspected' },
  unreadable: { cls: 'badge-neutral', label: 'Unreadable' },
};

export const RESULT_LABEL = (r: VerificationResult) => RESULT[r].label;

export function ResultBadge({ result }: { result: VerificationResult }) {
  const r = RESULT[result];
  return (
    <span className={`badge ${r.cls}`}>
      <span className="dot" />
      {r.label}
    </span>
  );
}

export const AUTH_STATE_META: Record<AuthState, { cls: string; label: string; color: string }> = {
  verified: { cls: 'badge-success', label: 'Verified', color: '#0f7a55' },
  not_scanned: { cls: 'badge-neutral', label: 'Not yet scanned', color: '#98a2b3' },
  flagged: { cls: 'badge-warning', label: 'Flagged', color: '#d97706' },
  no_active_label: { cls: 'badge-danger', label: 'No active label', color: '#b42318' },
};

export function AuthStateBadge({ state }: { state: AuthState }) {
  const m = AUTH_STATE_META[state];
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.label}
    </span>
  );
}

const STATUS: Record<ProductStatus, { cls: string; label: string }> = {
  active: { cls: 'badge-info', label: 'Active' },
  inactive: { cls: 'badge-neutral', label: 'Inactive' },
  recalled: { cls: 'badge-danger', label: 'Recalled' },
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <span className={`badge ${STATUS[status].cls}`}>{STATUS[status].label}</span>;
}

export function TokenStatusBadge({ status }: { status: TokenStatus }) {
  return status === 'active' ? (
    <span className="badge badge-success">
      <span className="dot" />
      Active
    </span>
  ) : (
    <span className="badge badge-neutral">Revoked</span>
  );
}

export function RepeatBadge({ flagged, repeat }: { flagged: boolean; repeat: boolean }) {
  if (flagged) return <span className="badge badge-warning">Warning</span>;
  if (repeat) return <span className="badge badge-neutral">Repeat</span>;
  return <span className="subtle">—</span>;
}
