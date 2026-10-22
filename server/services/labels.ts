import { transaction } from '../db';
import type { Store, TokenRecord } from '../store';
import { generateVerificationToken, hashToken } from '../lib/crypto';

export interface LabelService {
  issue(productId: string, now?: string): { token: string; record: TokenRecord };
  reissue(productId: string, reason: string, now?: string): { token: string; record: TokenRecord; revoked: TokenRecord | null };
  revoke(productId: string, reason: string, now?: string): TokenRecord | null;
}

export function createLabelService(store: Store, tokenHashSecret: string): LabelService {
  function issueInner(productId: string, now: string) {
    const token = generateVerificationToken();
    const tokenHash = hashToken(token, tokenHashSecret);
    const id = store.insertToken({ productId, tokenHash, tokenPlain: token, tokenPreview: `…${token.slice(-4)}`, createdAt: now });
    const record = store.findTokenByHash(tokenHash);
    if (!record || record.id !== id) throw new Error('Failed to persist token');
    return { token, record };
  }

  return {
    issue(productId, now = new Date().toISOString()) {
      return transaction(store.raw, () => issueInner(productId, now));
    },
    reissue(productId, reason, now = new Date().toISOString()) {
      return transaction(store.raw, () => {
        const revoked = store.revokeActiveToken(productId, reason, now);
        return { ...issueInner(productId, now), revoked };
      });
    },
    revoke(productId, reason, now = new Date().toISOString()) {
      return transaction(store.raw, () => store.revokeActiveToken(productId, reason, now));
    },
  };
}
