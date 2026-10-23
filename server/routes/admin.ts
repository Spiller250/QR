import os from 'node:os';
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

/** Private IPv4 addresses (RFC 1918) of this machine. */
function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => Boolean(i && i.family === 'IPv4' && !i.internal))
    .map((i) => i.address)
    .filter((a) => /^(10.|192.168.|172.(1[6-9]|2d|3[01]).)/.test(a));
}

export function adminRoutes({ store, config, sign, cdp }: AppContext): Router {
  const r = Router();

  const settings = async (): Promise<SettingsPayload> => ({
    rules: store.getRules(),
    payloadFormat: 'VQ1.<token>.<signature>',
    appClients: [...new Set(config.appKeys.values())],
    rateLimitPerMinute: config.verifyRateLimitPerMinute,
    databasePath: config.databasePath,
    cdp: {
      threshold: store.getCdpThreshold(config.cdp.defaultThreshold),
      defaultThreshold: config.cdp.defaultThreshold,
      gridSize: config.cdp.gridSize,
      cellMm: config.cdp.cellMm,
      patternMm: config.cdp.gridSize * config.cdp.cellMm,
      qrMm: config.cdp.qrMm,
      serviceUrl: config.cdp.serviceUrl,
      serviceOnline: (await cdp.health()).online,
    },
    lanAddresses: lanAddresses(),
  });

  r.get('/stats/overview', (_req, res) => {
    res.json(store.overview());
  });

  r.get('/qr-codes', (req, res) => {
    res.json({ items: store.listQrCodes(parse(qrListQuery, req.query), sign) });
  });

  r.get('/settings', async (_req, res, next) => {
    settings().then((s) => res.json(s), next);
  });

  r.put('/settings/rules', (req, res, next) => {
    store.setRules(parse(rulesSchema, req.body));
    settings().then((s) => res.json(s), next);
  });

  r.put('/settings/cdp', (req, res, next) => {
    const { threshold } = parse(z.object({ threshold: z.number().min(0).max(1) }), req.body);
    store.setCdpThreshold(Math.round(threshold * 1000) / 1000);
    settings().then((s) => res.json(s), next);
  });

  r.post('/admin/reset-demo', (_req, res) => {
    resetDemoData(store, config);
    res.json({ ok: true, resetAt: new Date().toISOString() });
  });

  return r;
}
