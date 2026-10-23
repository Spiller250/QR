export const PRODUCT_CATEGORIES = [
  'Watches',
  'Luxury Leather Goods',
  'Cosmetics',
  'Wine & Spirits',
  'Consumer Electronics',
  'Automotive Parts',
  'Health Supplements',
  'Sporting Goods',
] as const;

export const PRODUCT_STATUSES = ['active', 'inactive', 'recalled'] as const;

/** Derived from tokens + scan history; not stored. */
export const AUTH_STATES = ['verified', 'not_scanned', 'flagged', 'no_active_label'] as const;

/** `copy_suspected` and `unreadable` come from physical (CDP) verification only. */
export const VERIFICATION_RESULTS = ['authentic', 'suspicious', 'invalid', 'revoked', 'copy_suspected', 'unreadable'] as const;

export const CHECK_TYPES = ['payload', 'physical'] as const;

export const CALIBRATION_TAGS = ['original', 'photocopy', 'screen'] as const;

/** `public_page` is retired (URL labels) and kept only so historic log rows still type-check. */
export const SCAN_SOURCES = ['simulator', 'camera', 'manual', 'public_page', 'seed'] as const;

export const TOKEN_STATUSES = ['active', 'revoked'] as const;

/**
 * Demo scanners. Scanner identifiers are self-reported by the client in this POC
 * and are not authenticated (see Security & Limitations).
 */
export const DEMO_SCANNERS = [
  { id: 'SCN-BER-01', label: 'Distribution Center — Berlin', location: 'Berlin, DE' },
  { id: 'SCN-MIL-07', label: 'Authorized Retailer — Milan', location: 'Milan, IT' },
  { id: 'SCN-RTM-03', label: 'Customs Inspection — Rotterdam', location: 'Rotterdam, NL' },
  { id: 'SCN-SGP-12', label: 'Marketplace Kiosk — Singapore', location: 'Singapore, SG' },
  { id: 'SCN-DXB-05', label: 'Duty-Free Counter — Dubai', location: 'Dubai, AE' },
] as const;

export const RULE_CODES = {
  HIGH_SCAN_COUNT: 'HIGH_SCAN_COUNT',
  MULTIPLE_DEVICES: 'MULTIPLE_DEVICES',
  MULTIPLE_LOCATIONS: 'MULTIPLE_LOCATIONS',
  RAPID_DEVICE_SWITCH: 'RAPID_DEVICE_SWITCH',
} as const;

export const RULE_DESCRIPTIONS: Record<keyof typeof RULE_CODES, string> = {
  HIGH_SCAN_COUNT: 'Token has been verified more times than the configured maximum.',
  MULTIPLE_DEVICES: 'Token was verified by more distinct scanners than the configured maximum within the time window.',
  MULTIPLE_LOCATIONS: 'Token was verified from more distinct locations than the configured maximum within the time window.',
  RAPID_DEVICE_SWITCH: 'Token was verified by a different scanner within the configured interval after a previous scan.',
};
