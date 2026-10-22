import type { RequestHandler } from 'express';
import { safeEqual } from '../lib/crypto';
import { HttpError } from './errors';

export const APP_KEY_HEADER = 'x-app-key';

/**
 * Only authorized client applications may call /api/verify. Each client has its own key
 * (APP_KEYS). Every configured key is compared in constant time so timing does not reveal
 * which key is closest. Note: a key shipped inside a web bundle or app binary is an
 * identifier, not a secret — production apps should add platform attestation.
 */
export function requireAppKey(appKeys: Map<string, string>): RequestHandler {
  return (req, res, next) => {
    const presented = req.get(APP_KEY_HEADER)?.trim();
    if (!presented) {
      next(new HttpError(401, 'APP_KEY_MISSING', 'Verification is only available through an authorized VERIQ application. The X-App-Key header is missing.'));
      return;
    }
    let client: string | null = null;
    for (const [key, id] of appKeys) {
      if (safeEqual(presented, key)) client = id;
    }
    if (!client) {
      next(new HttpError(401, 'APP_KEY_INVALID', 'Verification is only available through an authorized VERIQ application. The X-App-Key is not recognised.'));
      return;
    }
    res.locals.appClient = client;
    next();
  };
}
