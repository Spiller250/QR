import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileCode2, Printer } from 'lucide-react';
import { api } from '../api/client';
import { useAuthedObjectUrl } from '../api/hooks';
import { downloadUrl } from '../lib/qr';
import { useToast } from './toast';
import { Modal, Spinner } from './ui';

/**
 * Server-rendered vector label (QR + copy-detection pattern). The pattern is derived from a
 * server secret, so it is never generated in the browser. `version` = label/token ID so a
 * reissued label refetches.
 */
export function CdpLabelImage({
  productId,
  version,
  variant = 'label',
  alt,
  className,
  style,
}: {
  productId: string;
  version: string;
  variant?: 'label' | 'pattern';
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const url = useAuthedObjectUrl(`/products/${productId}/label.svg${variant === 'pattern' ? '?variant=pattern' : ''}`, version);
  if (!url)
    return (
      <div className={className} style={{ ...style, display: 'grid', placeItems: 'center', aspectRatio: variant === 'pattern' ? '1' : '36 / 45', background: '#f2f4f7' }}>
        <Spinner />
      </div>
    );
  return <img src={url} alt={alt} className={className} style={{ imageRendering: 'pixelated', ...style }} />;
}

async function downloadFile(path: string, filename: string) {
  const blob = await (await api.raw(path)).blob();
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function CdpLabelActions({ productId, publicId, version }: { productId: string; publicId: string; version: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const run = (kind: 'pdf' | 'svg') => async () => {
    setBusy(kind);
    try {
      await downloadFile(`/products/${productId}/label.${kind}`, `veriq-label-${publicId}.${kind}`);
    } catch (err) {
      toast({ tone: 'error', title: 'Download failed', body: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="row-wrap">
        <button className="btn btn-sm btn-primary" onClick={run('pdf')} disabled={busy !== null}>
          {busy === 'pdf' ? <Spinner light /> : <Download size={15} />} Download print PDF
        </button>
        <button className="btn btn-sm" onClick={run('svg')} disabled={busy !== null}>
          {busy === 'svg' ? <Spinner /> : <FileCode2 size={15} />} SVG
        </button>
        <button className="btn btn-sm" onClick={() => setPrinting(true)}>
          <Printer size={15} /> Print
        </button>
      </div>
      {printing && <PrintModal productId={productId} version={version} onClose={() => setPrinting(false)} />}
    </>
  );
}

function PrintModal({ productId, version, onClose }: { productId: string; version: string; onClose: () => void }) {
  const printRoot = document.getElementById('print-root');
  useEffect(() => {
    document.body.classList.add('printing-label');
    return () => document.body.classList.remove('printing-label');
  }, []);
  return (
    <Modal
      title="Print label at actual size"
      sub="The SVG carries its physical size in millimetres. For guaranteed scale use the print PDF."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', placeItems: 'center', padding: 20, background: '#f4f5f8', borderRadius: 8 }}>
        <CdpLabelImage productId={productId} version={version} alt="Label preview" style={{ width: 220, background: '#fff', boxShadow: '0 6px 20px -8px rgba(16,24,40,.3)' }} />
      </div>
      <div className="callout warn small mt-16">
        <div>
          <strong>Print at 100% / Actual size — laser printer recommended.</strong>
          Disable “Fit to page”. The copy-detection pattern only works when its 0.15 mm cells are printed sharply; inkjet bleed or scaling will lower original scores.
        </div>
      </div>
      {printRoot && createPortal(<CdpLabelImage productId={productId} version={version} alt="" />, printRoot)}
    </Modal>
  );
}
