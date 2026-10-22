import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';

const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#0B1530', light: '#FFFFFF' } };

export function qrDataUrl(payload: string, width = 512): Promise<string> {
  return QRCode.toDataURL(payload, { ...QR_OPTIONS, width });
}

export function qrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, { ...QR_OPTIONS, type: 'svg' });
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Decodes a QR code from an image, canvas, file or URL using the browser decoder (qr-scanner). */
export async function decodeQr(source: HTMLImageElement | HTMLCanvasElement | File | Blob | string): Promise<string> {
  const result = await QrScanner.scanImage(source, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
  return result.data;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Simulates a photocopy / phone photo of a printed label: slight rotation, paper tint,
 * reduced contrast, blur and noise. The encoded data is untouched — which is the point.
 */
export async function simulateCopy(originalDataUrl: string): Promise<string> {
  const img = await loadImage(originalDataUrl);
  const size = 420;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return originalDataUrl;

  ctx.fillStyle = '#f1ede3';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((-2 * Math.PI) / 180);
  ctx.filter = 'grayscale(1) contrast(0.88) brightness(1.04) blur(0.35px)';
  ctx.drawImage(img, -size * 0.43, -size * 0.43, size * 0.86, size * 0.86);
  ctx.restore();

  const data = ctx.getImageData(0, 0, size, size);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < data.data.length; i += 4) {
    const n = (rand() - 0.5) * 16;
    data.data[i] += n;
    data.data[i + 1] += n;
    data.data[i + 2] += n - 4;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Changes one character in the middle of a token — a "modified QR" for scenario C. */
export function tamperToken(token: string): string {
  const i = Math.floor(token.length / 2);
  const c = token[i];
  const replacement = c === 'Q' ? 'R' : 'Q';
  return token.slice(0, i) + replacement + token.slice(i + 1);
}

export { QrScanner };
