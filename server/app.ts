import express, { type Router } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from './config';
import type { Db } from './db';
import { Store, type PayloadSigner } from './store';
import { buildQrPayload } from './lib/crypto';
import { createLabelService } from './services/labels';
import { createVerificationService } from './services/verification';
import { errorHandler, notFound } from './middleware/errors';
import { requireOperator } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { verifyRoutes } from './routes/verify';
import { productRoutes } from './routes/products';
import { logRoutes } from './routes/logs';
import { adminRoutes } from './routes/admin';

export interface AppContext {
  config: AppConfig;
  store: Store;
  labels: ReturnType<typeof createLabelService>;
  verifier: ReturnType<typeof createVerificationService>;
  /** Renders the signed QR payload for a token (VQ1.<token>.<sig>). */
  sign: PayloadSigner;
}

export function createApp(db: Db, config: AppConfig) {
  const store = new Store(db);
  const ctx: AppContext = {
    config,
    store,
    labels: createLabelService(store, config.tokenHashSecret),
    verifier: createVerificationService(store, { tokenHashSecret: config.tokenHashSecret, qrSigningSecret: config.qrSigningSecret }),
    sign: (token) => buildQrPayload(token, config.qrSigningSecret),
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '32kb' }));

  const json429 = (message: string) => ({ error: { code: 'RATE_LIMITED', message } });
  const verifyLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.verifyRateLimitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: json429('Too many verification attempts from this address. Please wait a minute.'),
  });
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: json429('Too many sign-in attempts. Please wait a minute.'),
  });

  const api: Router = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  // Public endpoints (verify additionally requires an authorized X-App-Key)
  api.use('/auth', authRoutes(ctx, loginLimiter));
  api.use('/verify', verifyLimiter, verifyRoutes(ctx));
  // Operator-only endpoints
  const operator = requireOperator(store);
  api.use('/products', operator, productRoutes(ctx));
  api.use('/verification-logs', operator, logRoutes(ctx));
  api.use('/', operator, adminRoutes(ctx));

  app.use('/api', api, notFound);
  app.use(errorHandler);
  return { app, ctx };
}
