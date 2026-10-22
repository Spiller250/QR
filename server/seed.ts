import { DEMO_SCANNERS } from '../shared/constants';
import { DEFAULT_RULES, type ProductInput } from '../shared/schemas';
import type { Store } from './store';
import { createLabelService } from './services/labels';
import { createVerificationService } from './services/verification';
import { buildQrPayload, generateVerificationToken } from './lib/crypto';
import type { Secrets } from './config';

/** All brands, products and events below are fictional demonstration data. */
const PRODUCTS: (ProductInput & { daysAgo: number })[] = [
  { name: 'Meridian Chronograph 42 mm', sku: 'AUR-MER-42-SLV', manufacturer: 'Aurelle Horlogerie (fictional)', category: 'Watches', batchNumber: 'B-2026-0917', productionDate: '2026-09-17', status: 'active', daysAgo: 1 },
  { name: 'Solstice Automatic 38 mm', sku: 'AUR-SOL-38-GLD', manufacturer: 'Aurelle Horlogerie (fictional)', category: 'Watches', batchNumber: 'B-2026-0802', productionDate: '2026-08-02', status: 'active', daysAgo: 20 },
  { name: 'Contour Weekender Bag — Cognac', sku: 'MVL-CWB-COG', manufacturer: 'Maison Velline (fictional)', category: 'Luxury Leather Goods', batchNumber: 'L-26-114', productionDate: '2026-07-11', status: 'active', daysAgo: 19 },
  { name: 'Atelier Card Holder — Noir', sku: 'MVL-ACH-NOR', manufacturer: 'Maison Velline (fictional)', category: 'Luxury Leather Goods', batchNumber: 'L-26-121', productionDate: '2026-08-20', status: 'active', daysAgo: 18 },
  { name: 'Lumen Renewal Serum 30 ml', sku: 'OST-LRS-30', manufacturer: 'Ostara Skin Lab (fictional)', category: 'Cosmetics', batchNumber: 'C-0926-A', productionDate: '2026-09-26', status: 'active', daysAgo: 17 },
  { name: 'Velvet Matte Lip Color — Rosewood', sku: 'OST-VML-RSW', manufacturer: 'Ostara Skin Lab (fictional)', category: 'Cosmetics', batchNumber: 'C-0904-C', productionDate: '2026-09-04', status: 'active', daysAgo: 16 },
  { name: 'Highland Reserve Single Malt 18 Y', sku: 'GLB-HR18-70', manufacturer: 'Glenbrae Distillers (fictional)', category: 'Wine & Spirits', batchNumber: 'CASK-1187', productionDate: '2026-05-30', status: 'active', daysAgo: 15 },
  { name: 'Côte Varenne Grand Cru 2019', sku: 'DVR-CVG-19', manufacturer: 'Domaine Varenne (fictional)', category: 'Wine & Spirits', batchNumber: 'V19-0342', productionDate: '2026-03-14', status: 'active', daysAgo: 15 },
  { name: 'Pulse ANC Wireless Earbuds', sku: 'NVA-PLS-ANC', manufacturer: 'Northvale Audio (fictional)', category: 'Consumer Electronics', batchNumber: 'E-26W38-07', productionDate: '2026-09-19', status: 'active', daysAgo: 14 },
  { name: 'Studio 65 W GaN Charger', sku: 'NVA-S65-GAN', manufacturer: 'Northvale Audio (fictional)', category: 'Consumer Electronics', batchNumber: 'E-26W30-02', productionDate: '2026-07-24', status: 'recalled', daysAgo: 13 },
  { name: 'Ceramic Brake Pad Set — Front', sku: 'KTR-CBP-F220', manufacturer: 'Kestrel Torque Parts (fictional)', category: 'Automotive Parts', batchNumber: 'AP-77-3310', productionDate: '2026-06-02', status: 'active', daysAgo: 12 },
  { name: 'High-Flow Oil Filter HF-14', sku: 'KTR-OF-HF14', manufacturer: 'Kestrel Torque Parts (fictional)', category: 'Automotive Parts', batchNumber: 'AP-77-3402', productionDate: '2026-08-15', status: 'active', daysAgo: 11 },
  { name: 'Omega-3 Marine Complex 90 caps', sku: 'VTN-O3M-90', manufacturer: 'Vitanora Labs (fictional)', category: 'Health Supplements', batchNumber: 'HS-2608-19', productionDate: '2026-08-19', status: 'active', daysAgo: 10 },
  { name: 'Pro Carbon Tennis Racket 300 g', sku: 'ALT-PCR-300', manufacturer: 'Altura Sport (fictional)', category: 'Sporting Goods', batchNumber: 'SG-26-551', productionDate: '2026-07-07', status: 'active', daysAgo: 9 },
  { name: 'Trail Runner GTX — Size 43', sku: 'ALT-TRG-43', manufacturer: 'Altura Sport (fictional)', category: 'Sporting Goods', batchNumber: 'SG-26-602', productionDate: '2026-08-28', status: 'inactive', daysAgo: 8 },
  { name: 'Nocturne Eau de Parfum 50 ml', sku: 'OST-NEP-50', manufacturer: 'Ostara Skin Lab (fictional)', category: 'Cosmetics', batchNumber: 'C-1002-B', productionDate: '2026-10-02', status: 'active', daysAgo: 3 },
];

export const LIVE_DEMO_SKU = 'AUR-MER-42-SLV';

/** Deterministic PRNG so that seeded activity looks the same after every reset. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedDemoData(store: Store, secrets: Secrets): void {
  const labels = createLabelService(store, secrets.tokenHashSecret);
  const verifier = createVerificationService(store, secrets);
  const rand = mulberry32(20261022);
  const now = Date.now();
  const daysAgo = (d: number, hour = 10) => {
    const date = new Date(now - d * 86_400_000);
    date.setUTCHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
    return date;
  };
  const scanner = (i: number) => DEMO_SCANNERS[i % DEMO_SCANNERS.length];
  type Who = (typeof DEMO_SCANNERS)[number] | { id: string; location: string };
  // Supply-chain scanners (SCN-*) use the Flutter app; consumer installs of the official app are APP-*.
  const scanRaw = (payload: string, at: Date, s: Who) =>
    verifier.verify({ payload, scannerId: s.id, location: s.location, source: 'seed', now: at, userAgent: 'seed-generator', appClient: 'flutter-app' });
  const scan = (token: string, at: Date, s: Who) => scanRaw(buildQrPayload(token, secrets.qrSigningSecret), at, s);
  const consumer = (n: number) => ({ id: `APP-${(1000 + n).toString(16).toUpperCase()}`, location: ['Munich, DE', 'Vienna, AT', 'Paris, FR', 'Zurich, CH', 'Lyon, FR'][n % 5] });

  store.setRules(DEFAULT_RULES);
  const tokens = new Map<string, string>();

  for (const p of PRODUCTS) {
    const { daysAgo: age, ...input } = p;
    const created = new Date(now - age * 86_400_000).toISOString();
    const id = store.insertProduct(input, { isDemo: true, now: created });
    const { token } = labels.issue(id, created);
    tokens.set(p.sku, token);
  }

  // Normal supply-chain and consumer activity spread across the past 13 days.
  const regular = PRODUCTS.filter((p) => !['AUR-MER-42-SLV', 'OST-NEP-50', 'ALT-TRG-43', 'KTR-OF-HF14'].includes(p.sku));
  regular.forEach((p, idx) => {
    const token = tokens.get(p.sku)!;
    const start = Math.min(p.daysAgo - 1, 13);
    // Distribution centre receipt, then retail check-in a day or two later.
    scan(token, daysAgo(start, 8), DEMO_SCANNERS[0]);
    scan(token, daysAgo(Math.max(start - 2, 0), 11), DEMO_SCANNERS[1]);
    // Consumers re-checking their purchase from the same browser.
    const consumerScans = Math.floor(rand() * 3);
    for (let i = 0; i < consumerScans; i++) {
      scan(token, daysAgo(Math.max(start - 4 - i, 0), 14 + i), consumer(idx));
    }
  });

  // A cloned label: the same token surfaces in several cities within hours.
  const cloned = tokens.get('MVL-CWB-COG')!;
  scan(cloned, daysAgo(2, 9), DEMO_SCANNERS[3]);
  scan(cloned, daysAgo(2, 12), DEMO_SCANNERS[4]);
  scan(cloned, daysAgo(1, 7), { id: 'APP-7F3A', location: 'Istanbul, TR' });
  scan(cloned, daysAgo(1, 8), { id: 'APP-91C2', location: 'Bangkok, TH' });

  // Heavy rescans of a popular serum label (could be a shop demo unit — or a copied label).
  const serum = tokens.get('OST-LRS-30')!;
  for (let i = 0; i < 4; i++) scan(serum, daysAgo(0, 9 + i), consumer(7));

  // Recalled charger still scanned by consumers.
  scan(tokens.get('NVA-S65-GAN')!, daysAgo(1, 16), consumer(3));

  // Product whose label was reported lost: revoked, then someone tries the old label.
  const filterId = store.listProducts({ q: 'KTR-OF-HF14', sort: 'created_desc', page: 1, pageSize: 1 }).items[0].id;
  const filterToken = tokens.get('KTR-OF-HF14')!;
  scan(filterToken, daysAgo(9, 8), DEMO_SCANNERS[0]);
  labels.reissue(filterId, 'Label batch reported stolen from print vendor (demo)', daysAgo(6, 10).toISOString());
  scan(filterToken, daysAgo(4, 15), { id: 'APP-3B11', location: 'Warsaw, PL' });
  scan(filterToken, daysAgo(0, 8), { id: 'APP-3B11', location: 'Warsaw, PL' });

  // Discontinued product whose label was revoked without a replacement.
  const shoeId = store.listProducts({ q: 'ALT-TRG-43', sort: 'created_desc', page: 1, pageSize: 1 }).items[0].id;
  labels.revoke(shoeId, 'Product discontinued (demo)', daysAgo(5, 9).toISOString());

  // Forged payloads: correct format, but signed without the real QR signing secret.
  for (let i = 0; i < 6; i++) {
    const forged = buildQrPayload(generateVerificationToken(), 'attacker-guessed-secret');
    scanRaw(forged, daysAgo(Math.floor(rand() * 12), 9 + i), scanner(i + 2));
  }
  // Validly signed token whose label no longer exists in the registry (e.g. a destroyed test print run).
  scan(generateVerificationToken(), daysAgo(7, 10), DEMO_SCANNERS[2]);
  // A retired URL-format label, and an unrelated barcode payload.
  scanRaw('https://verify.example/v/' + generateVerificationToken(), daysAgo(3, 13), consumer(2));
  scanRaw('SN-4471-COPY', daysAgo(6, 17), DEMO_SCANNERS[3]);
}
