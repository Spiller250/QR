import { Router } from 'express';
import { productInputSchema, productListQuerySchema, productUpdateSchema, tokenActionSchema } from '../../shared/schemas';
import type { ProductDetail } from '../../shared/types';
import type { AppContext } from '../app';
import { HttpError, parse } from '../middleware/errors';

export function productRoutes({ store, labels, sign }: AppContext): Router {
  const r = Router();

  const detail = (id: string): ProductDetail => {
    const product = store.getProduct(id);
    if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    const tokens = store.listTokensForProduct(id);
    const active = tokens.find((t) => t.status === 'active');
    return {
      ...product,
      activeLabel: active ? store.toLabel(active, sign) : null,
      labelHistory: tokens.map((t) => store.toLabel(t, sign)),
      recentEvents: store.listEvents({ productId: id, page: 1, pageSize: 20 }).items,
    };
  };

  const requireProduct = (id: string) => {
    if (!store.getProduct(id)) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  };

  r.get('/', (req, res) => {
    res.json(store.listProducts(parse(productListQuerySchema, req.query)));
  });

  r.post('/', (req, res) => {
    const input = parse(productInputSchema, req.body);
    if (store.skuExists(input.sku)) {
      throw new HttpError(409, 'DUPLICATE_SKU', 'A product with this SKU already exists.', { sku: 'SKU already registered' });
    }
    const id = store.insertProduct(input);
    labels.issue(id);
    res.status(201).json(detail(id));
  });

  r.get('/:id', (req, res) => {
    res.json(detail(req.params.id));
  });

  r.patch('/:id', (req, res) => {
    const patch = parse(productUpdateSchema, req.body);
    requireProduct(req.params.id);
    if (patch.sku && store.skuExists(patch.sku, req.params.id)) {
      throw new HttpError(409, 'DUPLICATE_SKU', 'A product with this SKU already exists.', { sku: 'SKU already registered' });
    }
    store.updateProduct(req.params.id, patch);
    res.json(detail(req.params.id));
  });

  /** Revokes the current token (if any) and issues a new one. The old label stops verifying immediately. */
  r.post('/:id/reissue-token', (req, res) => {
    const { reason } = parse(tokenActionSchema, req.body ?? {});
    requireProduct(req.params.id);
    const out = labels.reissue(req.params.id, reason || 'Reissued by operator');
    res.json({ product: detail(req.params.id), revokedTokenId: out.revoked?.id ?? null });
  });

  r.post('/:id/revoke-token', (req, res) => {
    const { reason } = parse(tokenActionSchema, req.body ?? {});
    requireProduct(req.params.id);
    const revoked = labels.revoke(req.params.id, reason || 'Revoked by operator');
    if (!revoked) throw new HttpError(409, 'NO_ACTIVE_LABEL', 'This product has no active label to revoke.');
    res.json({ product: detail(req.params.id), revokedTokenId: revoked.id });
  });

  r.post('/:id/issue-token', (req, res) => {
    requireProduct(req.params.id);
    if (store.getActiveToken(req.params.id)) {
      throw new HttpError(409, 'LABEL_EXISTS', 'This product already has an active label. Use reissue instead.');
    }
    labels.issue(req.params.id);
    res.status(201).json({ product: detail(req.params.id), revokedTokenId: null });
  });

  return r;
}
