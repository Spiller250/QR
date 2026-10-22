import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductInput, ProductUpdate, RepeatScanRules, VerifyRequest } from '../../shared/schemas';
import type {
  OverviewStats,
  Paginated,
  Product,
  ProductDetail,
  QrCodeRow,
  SettingsPayload,
  VerificationEvent,
  VerifyResponse,
} from '../../shared/types';
import { api } from './client';

export type ProductQuery = {
  q?: string;
  category?: string;
  status?: string;
  authState?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type LogQuery = {
  q?: string;
  result?: string;
  flagged?: string;
  productId?: string;
  source?: string;
  page?: number;
  pageSize?: number;
};

/** Every write can change counters on every page, so we refresh all data views. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
}

export const useOverview = () =>
  useQuery({ queryKey: ['stats'], queryFn: () => api.get<OverviewStats>('/stats/overview'), refetchInterval: 15_000 });

export const useProducts = (query: ProductQuery) =>
  useQuery({ queryKey: ['products', query], queryFn: () => api.get<Paginated<Product>>('/products', query), placeholderData: keepPreviousData });

export const useProduct = (id: string | undefined) =>
  useQuery({ queryKey: ['product', id], queryFn: () => api.get<ProductDetail>(`/products/${id}`), enabled: Boolean(id) });

export const useQrCodes = (query: { status?: string; q?: string }) =>
  useQuery({ queryKey: ['qr', query], queryFn: () => api.get<{ items: QrCodeRow[] }>('/qr-codes', query), placeholderData: keepPreviousData });

export const useLogs = (query: LogQuery, opts: { refetchInterval?: number } = {}) =>
  useQuery({
    queryKey: ['logs', query],
    queryFn: () => api.get<Paginated<VerificationEvent>>('/verification-logs', query),
    placeholderData: keepPreviousData,
    refetchInterval: opts.refetchInterval,
  });

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsPayload>('/settings') });

export function useCreateProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: ProductInput) => api.post<ProductDetail>('/products', input), onSuccess: invalidate });
}

export function useUpdateProduct(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (patch: ProductUpdate) => api.patch<ProductDetail>(`/products/${id}`, patch), onSuccess: invalidate });
}

type TokenActionResult = { product: ProductDetail; revokedTokenId: string | null };

export function useTokenAction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'reissue' | 'revoke' | 'issue'; reason?: string }) =>
      api.post<TokenActionResult>(`/products/${id}/${action}-token`, { reason }),
    onSuccess: invalidate,
  });
}

export function useVerify() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (body: VerifyRequest) => api.verify<VerifyResponse>(body), onSuccess: invalidate });
}

export function useSaveRules() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (rules: RepeatScanRules) => api.put<SettingsPayload>('/settings/rules', rules), onSuccess: invalidate });
}

export function useResetDemo() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: () => api.post<{ ok: boolean }>('/admin/reset-demo'), onSuccess: invalidate });
}
