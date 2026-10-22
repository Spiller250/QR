import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Boxes, Plus, Search, SearchX } from 'lucide-react';
import { PRODUCT_CATEGORIES } from '../../shared/constants';
import { useCreateProduct, useProducts } from '../api/hooks';
import { AuthStateBadge, ProductStatusBadge } from '../components/badges';
import { ProductFormModal } from '../components/ProductForm';
import { useToast } from '../components/toast';
import { EmptyState, ErrorState, LoadingBlock, PageHead, Pagination } from '../components/ui';
import { fmtDate, fmtRelative } from '../lib/format';

const PAGE_SIZE = 10;

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateProduct();

  const query = {
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    status: params.get('status') ?? undefined,
    authState: params.get('authState') ?? undefined,
    sort: params.get('sort') ?? 'created_desc',
    page: Number(params.get('page') ?? 1),
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading, error, refetch, isFetching } = useProducts(query);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || undefined });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filtered = Boolean(query.q || query.category || query.status || query.authState);

  return (
    <div className="stack">
      <PageHead
        title="Products"
        description="Register products and manage their authentication labels. Every product receives a public ID and a separate secret verification token."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Add product
          </button>
        }
      />

      <section className="card">
        <div className="toolbar">
          <div className="input-icon search">
            <Search size={16} />
            <input className="input" placeholder="Search by name, public ID or SKU" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
          </div>
          <select className="select" value={query.category ?? ''} onChange={(e) => update({ category: e.target.value || undefined })} aria-label="Category">
            <option value="">All categories</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="select" value={query.authState ?? ''} onChange={(e) => update({ authState: e.target.value || undefined })} aria-label="Authentication status">
            <option value="">Any authentication status</option>
            <option value="verified">Verified</option>
            <option value="not_scanned">Not yet scanned</option>
            <option value="flagged">Flagged</option>
            <option value="no_active_label">No active label</option>
          </select>
          <select className="select" value={query.status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })} aria-label="Product status">
            <option value="">Any product status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="recalled">Recalled</option>
          </select>
          <select className="select" value={query.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="scans_desc">Most scanned</option>
          </select>
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
              title="No products match your filters"
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
            >
              Try a different name, SKU or public ID (for example “VQ-” or “AUR-”).
            </EmptyState>
          ) : (
            <EmptyState icon={Boxes} title="No products registered" action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Add your first product</button>}>
              Registered products and their QR labels will appear here.
            </EmptyState>
          )
        ) : (
          <div className="table-wrap" style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity .15s' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Authentication</th>
                  <th className="num">Scans</th>
                  <th>Last scan</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/products/${p.id}`)}>
                    <td style={{ minWidth: 220 }}>
                      <div className="cell-title">{p.name}</div>
                      <div className="cell-sub">
                        <span className="mono">{p.publicId}</span> · {p.manufacturer}
                      </div>
                    </td>
                    <td className="mono nowrap">{p.sku}</td>
                    <td className="nowrap">{p.category}</td>
                    <td className="nowrap">
                      {p.batchNumber}
                      <div className="cell-sub">{fmtDate(p.productionDate)}</div>
                    </td>
                    <td>
                      <ProductStatusBadge status={p.status} />
                    </td>
                    <td>
                      <AuthStateBadge state={p.authState} />
                    </td>
                    <td className="num">{p.scanCount}</td>
                    <td className="nowrap muted">{fmtRelative(p.lastScanAt)}</td>
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

      {creating && (
        <ProductFormModal
          title="Register product"
          submitLabel="Register & issue label"
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const product = await create.mutateAsync(input);
            setCreating(false);
            toast({ tone: 'success', title: 'Product registered', body: `${product.name} · ${product.publicId}. A unique QR label has been issued.` });
            navigate(`/products/${product.id}`);
          }}
        />
      )}
    </div>
  );
}
