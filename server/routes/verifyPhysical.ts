import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../app';
import { requireAppKey } from '../middleware/appKey';
import { parse } from '../middleware/errors';
import { singleImage } from '../middleware/upload';

const fields = z.object({
  scannerId: z.string().trim().max(64).optional(),
  location: z.string().trim().max(80).optional(),
  source: z.enum(['camera', 'manual', 'simulator']).optional(),
});

/** Photo-based verification with copy detection, for authorized client apps only (X-App-Key). */
export function verifyPhysicalRoutes({ physical, config }: AppContext): Router {
  const r = Router();
  // The app key is checked before the upload is parsed.
  r.post('/', requireAppKey(config.appKeys), singleImage(), async (req, res, next) => {
    try {
      const body = parse(fields, req.body ?? {});
      const file = req.file!;
      const { productId: _productId, ...response } = await physical.check({
        image: { buffer: file.buffer, mimetype: file.mimetype, filename: file.originalname },
        ...body,
        appClient: res.locals.appClient as string,
        userAgent: req.get('user-agent') ?? null,
        record: true,
      });
      res.set('Cache-Control', 'no-store').json(response);
    } catch (err) {
      next(err);
    }
  });
  return r;
}
