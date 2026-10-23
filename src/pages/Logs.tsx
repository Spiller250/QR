import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, ListChecks, Search, SearchX } from 'lucide-react';
import type { VerificationEvent } from '../../shared/types';
import { api } from '../api/client';
import { useLogs } from '../api/hooks';
import { RepeatBadge, ResultBadge } from '../components/badges';
import { EventDetailDrawer, sourceLabel } from '../components/EventDetail';
import { useToast } from '../components/toast';
import { EmptyState, ErrorState, LoadingBlock, PageHead, Pagination, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import { downloadUrl } from '../lib/qr';

export function LogsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<VerificationEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const query = {
    q: params.get('q') ?? undefined,
    result: params.get('result') ?? undefined,
    flagged: params.get('flagged') ?? undefined,
    source: params.get('source') ?? undefined,
    productId: params.get('productId') ?? undefined,
    page: Number(params.get('page') ?? 1),
    pageSize: 25,
  };
  const { data, isLoading, error, refetch, isFetching } = useLogs(query, { refetchInterval: 10_000 });

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || undefined });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function exportCsv() {
    setExporting(true);
    try {
      const { page: _page, pageSize: _size, ...filters } = query;
      const res = await api.raw('/verification-logs/export.csv', filters);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `veriq-verification-log-${new Date().toISOString().slice(0, 10)}.csv`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast({ tone: 'error', title: 'Export failed', body: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  }

  const filtered = Boolean(query.q || query.result || query.flagged || query.source || query.productId);

  return (
    <div className="stack">
      <PageHead
        title="Verification Logs"
        description="Every verification attempt — successful, flagged, invalid and revoked. Raw tokens are never logged; attempts are correlated by a short HMAC fingerprint."
        actions={
          <button className="btn" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Spinner /> : <Download size={16} />} Export CSV
          </button>
        }
      />
      <section className="card">
        <div className="toolbar">
          <div className="input-icon search">
            <Search size={16} />
            <input className="input" placeholder="Search product, public ID, client app, scanner, location, reason" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search logs" />
          </div>
          <select className="select" value={query.result ?? ''} onChange={(e) => update({ result: e.target.value || undefined })} aria-label="Result">
            <option value="">All results</option>
            <option value="authentic">Authentic</option>
            <option value="suspicious">Suspicious</option>
            <option value="invalid">Invalid</option>
            <option value="revoked">Revoked</option>
            <option value="copy_suspected">Copy suspected</option>
            <option value="unreadable">Unreadable photo</option>
          </select>
          <select className="select" value={query.flagged ?? ''} onChange={(e) => update({ flagged: e.target.value || undefined })} aria-label="Repeat-scan warning">
            <option value="">Any warning state</option>
            <option value="true">Repeat-scan warning</option>
            <option value="false">No warning</option>
          </select>
          <select className="select" value={query.source ?? ''} onChange={(e) => update({ source: e.target.value || undefined })} aria-label="Source">
            <option value="">All sources</option>
            {['simulator', 'camera', 'manual', 'public_page', 'seed'].map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </select>
          {query.productId && (
            <button className="btn btn-sm" onClick={() => update({ productId: undefined })}>
              Product filter ✕
            </button>
          )}
        </div>
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="card-body">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No events match your filters"
              action={
                <button
                  className="btn"
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState icon={ListChecks} title="No verification attempts yet">
              Events appear here as soon as a label is scanned.
            </EmptyState>
          )
        ) : (
          <div className="table-wrap" style={{ opacity: isFetching ? 0.75 : 1, transition: 'opacity .15s' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Product</th>
                  <th>Result</th>
                  <th>Reason</th>
                  <th>Client app</th>
                  <th>Scanner / device</th>
                  <th>Location</th>
                  <th>Repeat-scan</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className={`clickable${selected?.id === e.id ? ' selected' : ''}`} onClick={() => setSelected(e)}>
                    <td className="nowrap">{fmtDateTime(e.createdAt)}</td>
                    <td style={{ minWidth: 180 }}>
                      {e.productName ? (
                        <>
                          <div className="cell-title">{e.productName}</div>
                          <div className="cell-sub mono">{e.productPublicId}</div>
                        </>
                      ) : (
                        <>
                          <div className="muted">Unrecognised code</div>
                          <div className="cell-sub mono">fp {e.tokenFingerprint}</div>
                        </>
                      )}
                    </td>
                    <td>
                      <ResultBadge result={e.result} />
                      {e.checkType === 'physical' && (
                        <div className="cell-sub">
                          Photo check{e.cdpScore !== null ? ` · ${e.cdpScore.toFixed(2)} / ${e.cdpThreshold?.toFixed(2)}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="mono small nowrap">{e.reasonCode}</td>
                    <td className="mono small nowrap">{e.appClient ?? '—'}</td>
                    <td className="mono small nowrap">{e.scannerId}</td>
                    <td className="nowrap">{e.location ?? '—'}</td>
                    <td>
                      <RepeatBadge flagged={e.flagged} repeat={e.repeatScan} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="card-foot">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: String(p) })} />
          </div>
        )}
      </section>
      {selected && <EventDetailDrawer event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
