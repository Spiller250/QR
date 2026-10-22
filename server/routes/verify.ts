import { Router } from 'express';
import { verifyRequestSchema } from '../../shared/schemas';
import type { AppContext } from '../app';
import { requireAppKey } from '../middleware/appKey';
import { parse } from '../middleware/errors';

/** Verification endpoint for authorized client applications only (X-App-Key). */
export function verifyRoutes({ verifier, config }: AppContext): Router {
  const r = Router();
  r.post('/', requireAppKey(config.appKeys), (req, res) => {
    const body = parse(verifyRequestSchema, req.body);
    const response = verifier.verify({ ...body, userAgent: req.get('user-agent') ?? null, appClient: res.locals.appClient as string });
    res.set('Cache-Control', 'no-store').json(response);
  });
  return r;
}
