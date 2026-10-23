import { HttpError } from '../middleware/errors';

/** Response shapes of cdp-service (see cdp-service/app/main.py). */
export interface CdpDiagnostics {
  pixelsPerCell?: number;
  blurCells?: number;
  sharpness?: number;
  edgeWidthPx?: number;
  qrSidePx?: number;
  imageWidth?: number;
  imageHeight?: number;
  detector?: string;
  bytes?: number;
  [key: string]: unknown;
}

export interface CdpDecodeResult {
  status: 'ok' | 'unreadable';
  reasonCode: string | null;
  decoded: string | null;
  diagnostics: CdpDiagnostics;
}

export interface CdpAnalyzeResult extends CdpDecodeResult {
  score?: number;
  components?: Record<string, number>;
}

export interface CdpImage {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

export interface CdpAnalyzeParams {
  grid: string;
  gridSize: number;
  qrModules: number;
  clearModules: number;
  patternModules: number;
  expectedPayload: string;
}

export interface CdpClient {
  health(): Promise<{ online: boolean; detail?: unknown }>;
  decode(image: CdpImage): Promise<CdpDecodeResult>;
  analyze(image: CdpImage, params: CdpAnalyzeParams): Promise<CdpAnalyzeResult>;
}

const unavailable = (detail: string) =>
  new HttpError(503, 'CDP_SERVICE_UNAVAILABLE', `The copy-detection analysis service is unavailable (${detail}). Start it with cdp-service\\run-cdp.ps1.`);

/** Talks to the Python service over HTTP (multipart). Images are forwarded byte-for-byte. */
export function httpCdpClient(baseUrl: string, timeoutMs = 30_000): CdpClient {
  async function post<T>(path: string, image: CdpImage, fields: Record<string, string | number> = {}): Promise<T> {
    const form = new FormData();
    form.append('image', new Blob([image.buffer], { type: image.mimetype || 'application/octet-stream' }), image.filename || 'capture.jpg');
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw unavailable(err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'not reachable');
    }
    if (!res.ok) throw unavailable(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async health() {
      try {
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
        return { online: res.ok, detail: res.ok ? await res.json() : undefined };
      } catch {
        return { online: false };
      }
    },
    decode: (image) => post<CdpDecodeResult>('/decode', image),
    analyze: (image, params) => post<CdpAnalyzeResult>('/analyze', image, { ...params }),
  };
}
