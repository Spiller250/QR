import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../shared/schemas';
import { isWellFormedToken, maskPayload, parsePayload } from '../shared/token';
import { evaluateRules } from '../server/services/verification';
import { generateVerificationToken } from '../server/lib/crypto';

const at = new Date('2026-10-20T12:00:00Z');
const minutesAgo = (m: number) => new Date(at.getTime() - m * 60_000).toISOString();
const fired = (r: ReturnType<typeof evaluateRules>) => r.filter((x) => x.triggered).map((x) => x.code);

describe('evaluateRules', () => {
  it('does not flag a first scan', () => {
    expect(fired(evaluateRules(DEFAULT_RULES, [], { scannerId: 'A', location: 'Berlin', at }))).toEqual([]);
  });

  it('does not flag an ordinary repeat scan by the same scanner', () => {
    const prior = [{ createdAt: minutesAgo(5), scannerId: 'A', location: 'Berlin' }];
    expect(fired(evaluateRules(DEFAULT_RULES, prior, { scannerId: 'A', location: 'Berlin', at }))).toEqual([]);
  });

  it('flags when the scan count exceeds the configured maximum', () => {
    const prior = Array.from({ length: DEFAULT_RULES.scanCountThreshold }, (_, i) => ({ createdAt: minutesAgo(100 + i), scannerId: 'A', location: 'Berlin' }));
    expect(fired(evaluateRules(DEFAULT_RULES, prior, { scannerId: 'A', location: 'Berlin', at }))).toContain('HIGH_SCAN_COUNT');
  });

  it('flags a different scanner shortly after the previous scan', () => {
    const prior = [{ createdAt: minutesAgo(3), scannerId: 'A', location: 'Milan' }];
    expect(fired(evaluateRules(DEFAULT_RULES, prior, { scannerId: 'B', location: 'Singapore', at }))).toEqual(['RAPID_DEVICE_SWITCH']);
  });

  it('flags too many distinct locations inside the window and ignores old scans', () => {
    const prior = [
      { createdAt: minutesAgo(60), scannerId: 'A', location: 'Milan' },
      { createdAt: minutesAgo(120), scannerId: 'B', location: 'Paris' },
      { createdAt: minutesAgo(60 * 24 * 30), scannerId: 'C', location: 'Tokyo' },
    ];
    const result = evaluateRules(DEFAULT_RULES, prior, { scannerId: 'D', location: 'Dubai', at });
    expect(fired(result)).toContain('MULTIPLE_LOCATIONS');
    expect(result.find((r) => r.code === 'MULTIPLE_LOCATIONS')?.observed).toBe(3);
  });

  it('respects disabled rules', () => {
    const rules = { ...DEFAULT_RULES, enabled: { ...DEFAULT_RULES.enabled, RAPID_DEVICE_SWITCH: false } };
    const prior = [{ createdAt: minutesAgo(3), scannerId: 'A', location: 'Milan' }];
    expect(fired(evaluateRules(rules, prior, { scannerId: 'B', location: 'Milan', at }))).toEqual([]);
  });
});

describe('tokens', () => {
  it('generates unique, well-formed 128-bit tokens', () => {
    const set = new Set(Array.from({ length: 2000 }, generateVerificationToken));
    expect(set.size).toBe(2000);
    for (const t of set) expect(isWellFormedToken(t)).toBe(true);
  });

  it('parses VQ1 payloads and recognises the retired URL format', () => {
    const token = 'abcDEF0123456789_-abcd';
    expect(parsePayload(` VQ1.${token}.0123456789abcdef `)).toEqual({ kind: 'vq1', token, signature: '0123456789abcdef' });
    expect(parsePayload(`https://verify.test/v/${token}?x=1`)).toEqual({ kind: 'legacy_url', token });
    expect(parsePayload(token).kind).toBe('malformed');
    expect(parsePayload(`VQ1.${token}.short`).kind).toBe('malformed');
    expect(parsePayload(`VQ2.${token}.0123456789abcdef`).kind).toBe('malformed');
    expect(maskPayload(`VQ1.${token}.0123456789abcdef`)).toBe('VQ1.abc…abcd.012…');
  });
});
