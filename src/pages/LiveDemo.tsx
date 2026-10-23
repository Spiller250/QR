import { useSearchParams } from 'react-router-dom';
import { FlaskConical, ScanLine } from 'lucide-react';
import { APP_KEY } from '../api/client';
import { useProducts } from '../api/hooks';
import { AuthorizedScanner } from '../components/demo/AuthorizedScanner';
import { ScenarioSimulator } from '../components/demo/ScenarioSimulator';
import { PhoneCaptureCard } from '../components/demo/PhoneCaptureCard';
import { EmptyState, LoadingBlock, PageHead } from '../components/ui';

const LIVE_DEMO_SKU = 'AUR-MER-42-SLV';

export function LiveDemoPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'scanner' ? 'scanner' : 'scenarios';
  const requested = params.get('product');
  const { data: all, isLoading } = useProducts({ pageSize: 100, sort: 'name_asc' });
  const products = all?.items ?? [];
  const productId = requested && products.some((p) => p.id === requested) ? requested : (products.find((p) => p.sku === LIVE_DEMO_SKU) ?? products[0])?.id;

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div className="stack">
      <PageHead
        title="Live Demo"
        description="Walk through real verification scenarios against the running API. Scans are made by the built-in web scanner, an authorized client, and are written to the verification log."
        actions={
          tab === 'scenarios' &&
          products.length > 0 && (
            <select className="select" style={{ width: 280 }} value={productId} onChange={(e) => set('product', e.target.value)} aria-label="Demo product">
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.publicId}
                </option>
              ))}
            </select>
          )
        }
      />
      {!APP_KEY && (
        <div className="callout danger">
          <div>
            <strong>VITE_APP_KEY is not configured</strong>
            The built-in scanner cannot authenticate to /api/verify. Set <code>VITE_APP_KEY</code> in <code>.env</code> to the key of the <code>web-scanner</code>{' '}
            entry in <code>APP_KEYS</code> and restart <code>npm run dev</code>.
          </div>
        </div>
      )}
      <div className="tabs" role="tablist">
        <button className={tab === 'scenarios' ? 'active' : ''} onClick={() => set('tab', 'scenarios')}>
          <FlaskConical size={15} /> Guided scenarios
        </button>
        <button className={tab === 'scanner' ? 'active' : ''} onClick={() => set('tab', 'scanner')}>
          <ScanLine size={15} /> Authorized scanner
        </button>
      </div>
      {tab === 'scanner' ? (
        <div className="stack">
          <PhoneCaptureCard />
          <AuthorizedScanner />
        </div>
      ) : isLoading ? (
        <LoadingBlock />
      ) : productId ? (
        <ScenarioSimulator key={productId} productId={productId} />
      ) : (
        <div className="card">
          <EmptyState icon={FlaskConical} title="No products available">
            Register a product or reset the demo data in Settings.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
