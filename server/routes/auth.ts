import { Router, type RequestHandler } from 'express';
import { loginSchema } from '../../shared/schemas';
import type { AppContext } from '../app';
import { generateSessionToken, safeEqual, sha256 } from '../lib/crypto';
import { bearerToken } from '../middleware/auth';
import { HttpError, parse } from '../middleware/errors';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function authRoutes({ config, store }: AppContext, limiter: RequestHandler): Router {
  const r = Router();

  r.post('/login', limiter, (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const emailOk = safeEqual(email.toLowerCase(), config.adminEmail.toLowerCase());
    const passwordOk = safeEqual(password, config.adminPassword);
    if (!emailOk || !passwordOk) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const token = generateSessionToken();
    store.createSession(sha256(token), config.adminEmail, SESSION_TTL_MS);
    res.json({ token, operator: { email: config.adminEmail, role: 'Demo Operator' }, expiresInSeconds: SESSION_TTL_MS / 1000 });
  });

  r.post('/logout', (req, res) => {
    const token = bearerToken(req.headers.authorization);
    if (token) store.deleteSession(sha256(token));
    res.status(204).end();
  });

  r.get('/me', (req, res) => {
    const token = bearerToken(req.headers.authorization);
    const session = token ? store.findSession(sha256(token)) : null;
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Operator sign-in required.');
    res.json({ operator: { email: session.email, role: 'Demo Operator' } });
  });

  return r;
}
