import type { RequestHandler } from 'express';
import { sha256 } from '../lib/crypto';
import type { Store } from '../store';
import { HttpError } from './errors';

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * DEMO-ONLY access control: a single operator account configured via environment
 * variables, with opaque bearer sessions stored (hashed) in SQLite. Not a substitute for
 * SSO, MFA, RBAC or audit logging in production.
 */
export function requireOperator(store: Store): RequestHandler {
  return (req, res, next) => {
    const token = bearerToken(req.headers.authorization);
    const session = token ? store.findSession(sha256(token)) : null;
    if (!session) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Operator sign-in required.'));
      return;
    }
    res.locals.operator = session.email;
    next();
  };
}
