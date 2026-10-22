import { Router } from 'express';
import { z } from 'zod';
import { rulesSchema } from '../../shared/schemas';
import type { SettingsPayload } from '../../shared/types';
import type { AppContext } from '../app';
import { parse } from '../middleware/errors';
import { resetDemoData } from '../scripts/resetData';

const qrListQuery = z.object({
  status: z.enum(['active', 'revoked']).optional(),
  q: z.string().trim().max(100).optional(),
});

export function adminRoutes({ store, config, sign }: AppContext): Router {
  const r = Router();

  const settings = (): SettingsPayload => ({
    rules: store.getRules(),
    payloadFormat: 'VQ1.<token>.<signature>',
    appClients: [...new Set(config.appKeys.values())],
    rateLimitPerMinute: config.verifyRateLimitPerMinute,
    databasePath: config.databasePath,
  });

  r.get('/stats/overview', (_req, res) => {
    res.json(store.overview());
  });

  r.get('/qr-codes', (req, res) => {
    res.json({ items: store.listQrCodes(parse(qrListQuery, req.query), sign) });
  });

  r.get('/settings', (_req, res) => {
    res.json(settings());
  });

  r.put('/settings/rules', (req, res) => {
    store.setRules(parse(rulesSchema, req.body));
    res.json(settings());
  });

  r.post('/admin/reset-demo', (_req, res) => {
    resetDemoData(store, config);
    res.json({ ok: true, resetAt: new Date().toISOString() });
  });

  return r;
}
