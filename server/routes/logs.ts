import { Router } from 'express';
import { logListQuerySchema } from '../../shared/schemas';
import type { AppContext } from '../app';
import { HttpError, parse } from '../middleware/errors';

const CSV_HEADER = [
  'event_id',
  'timestamp_utc',
  'result',
  'reason_code',
  'product_public_id',
  'product_name',
  'scanner_id',
  'location',
  'source',
  'app_client',
  'scan_number',
  'repeat_scan',
  'flagged',
  'rules_triggered',
  'token_fingerprint',
  'check_type',
  'cdp_score',
  'cdp_threshold',
];

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function logRoutes({ store }: AppContext): Router {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(store.listEvents(parse(logListQuerySchema, req.query)));
  });

  r.get('/export.csv', (req, res) => {
    const query = parse(logListQuerySchema, { ...req.query, page: 1, pageSize: 200 });
    const lines = [CSV_HEADER.join(',')];
    for (let page = 1; ; page++) {
      const batch = store.listEvents({ ...query, page });
      for (const e of batch.items) {
        const row = [
          e.id,
          e.createdAt,
          e.result,
          e.reasonCode,
          e.productPublicId,
          e.productName,
          e.scannerId,
          e.location,
          e.source,
          e.appClient,
          e.scanNumber,
          e.repeatScan,
          e.flagged,
          e.rulesTriggered.join('|'),
          e.tokenFingerprint,
          e.checkType,
          e.cdpScore,
          e.cdpThreshold,
        ];
        lines.push(row.map(csvCell).join(','));
      }
      if (page * query.pageSize >= batch.total) break;
    }
    const filename = `veriq-verification-log-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${filename}"`).send(lines.join('\r\n'));
  });

  r.get('/:id', (req, res) => {
    const event = store.getEvent(req.params.id);
    if (!event) throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found.');
    res.json(event);
  });

  return r;
}
