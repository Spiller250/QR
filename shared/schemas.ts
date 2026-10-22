import { z } from 'zod';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES, SCAN_SOURCES } from './constants';

const trimmed = (label: string, max: number) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const productInputSchema = z.object({
  name: trimmed('Product name', 120),
  sku: trimmed('SKU', 40).regex(/^[A-Za-z0-9][A-Za-z0-9-_.]*$/, 'SKU may contain letters, digits, dashes, dots and underscores'),
  manufacturer: trimmed('Manufacturer', 120),
  category: z.enum(PRODUCT_CATEGORIES, { errorMap: () => ({ message: 'Select a category' }) }),
  batchNumber: trimmed('Batch number', 40),
  productionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
    .refine((v) => Date.parse(v) <= Date.now() + 86_400_000, 'Production date cannot be in the future'),
  status: z.enum(PRODUCT_STATUSES).default('active'),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const productUpdateSchema = productInputSchema.partial();
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

/**
 * `payload` is the raw QR content (`VQ1.<token>.<sig>`). The schema is deliberately
 * permissive in shape so that malformed input is *recorded* as an invalid attempt
 * rather than rejected silently; only size is bounded.
 */
export const verifyRequestSchema = z.object({
  payload: z.string({ required_error: 'payload is required' }).trim().min(1, 'payload is required').max(512, 'payload is too long'),
  scannerId: z.string().trim().max(64).optional(),
  location: z.string().trim().max(80).optional(),
  source: z.enum(SCAN_SOURCES).exclude(['seed', 'public_page']).optional(),
});
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

export const tokenActionSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const rulesSchema = z.object({
  scanCountThreshold: z.number().int().min(1).max(1000),
  distinctDeviceThreshold: z.number().int().min(1).max(100),
  distinctLocationThreshold: z.number().int().min(1).max(100),
  windowHours: z.number().int().min(1).max(24 * 365),
  rapidSwitchMinutes: z.number().int().min(0).max(24 * 60),
  enabled: z.object({
    HIGH_SCAN_COUNT: z.boolean(),
    MULTIPLE_DEVICES: z.boolean(),
    MULTIPLE_LOCATIONS: z.boolean(),
    RAPID_DEVICE_SWITCH: z.boolean(),
  }),
});
export type RepeatScanRules = z.infer<typeof rulesSchema>;

export const DEFAULT_RULES: RepeatScanRules = {
  scanCountThreshold: 4,
  distinctDeviceThreshold: 3,
  distinctLocationThreshold: 2,
  windowHours: 72,
  rapidSwitchMinutes: 30,
  enabled: {
    HIGH_SCAN_COUNT: true,
    MULTIPLE_DEVICES: true,
    MULTIPLE_LOCATIONS: true,
    RAPID_DEVICE_SWITCH: true,
  },
};

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  authState: z.enum(['verified', 'not_scanned', 'flagged', 'no_active_label']).optional(),
  sort: z.enum(['created_desc', 'created_asc', 'name_asc', 'name_desc', 'scans_desc']).default('created_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const logListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  result: z.enum(['authentic', 'suspicious', 'invalid', 'revoked']).optional(),
  flagged: z.enum(['true', 'false']).optional(),
  productId: z.string().max(64).optional(),
  source: z.enum(SCAN_SOURCES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
