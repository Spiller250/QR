import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileCode2, Printer, ShieldCheck } from 'lucide-react';
import type { Product, QrLabel } from '../../shared/types';
import { downloadText, downloadUrl, qrDataUrl, qrSvg } from '../lib/qr';
import { fmtDate } from '../lib/format';
import { Modal } from './ui';

export function useQrDataUrl(payload: string | null | undefined, width = 512) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!payload) {
      setUrl(null);
      return;
    }
    qrDataUrl(payload, width).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [payload, width]);
  return url;
}

export function QrImage({ payload, alt, className, width }: { payload: string; alt: string; className?: string; width?: number }) {
  const url = useQrDataUrl(payload, width);
  return url ? <img src={url} alt={alt} className={className} /> : <div className={className} style={{ aspectRatio: '1', background: '#f2f4f7' }} />;
}

type LabelProduct = Pick<Product, 'name' | 'manufacturer' | 'publicId' | 'batchNumber' | 'productionDate' | 'sku'>;

export function ProductLabel({ product, label, compact }: { product: LabelProduct; label: QrLabel; compact?: boolean }) {
  const url = useQrDataUrl(label.qrPayload, 400);
  return (
    <div className={`label${compact ? ' compact' : ''}`}>
      <div className="label-head">
        <span>VERIQ · AUTHENTICITY LABEL</span>
        <ShieldCheck size={14} />
      </div>
      <div className="label-body">
        {url ? <img src={url} alt="Verification QR code" /> : <div style={{ width: 132, height: 132 }} />}
        <div style={{ minWidth: 0 }}>
          <div className="label-name">{product.name}</div>
          <div className="label-meta">
            {product.manufacturer}
            <br />
            ID <b className="mono">{product.publicId}</b>
            <br />
            Batch <b>{product.batchNumber}</b> · {fmtDate(product.productionDate)}
          </div>
        </div>
      </div>
      <div className="label-foot">
        <span>Verify with the official VERIQ app</span>
        <span className="mono">{label.tokenPreview}</span>
      </div>
    </div>
  );
}

export function QrActions({ product, label }: { product: LabelProduct; label: QrLabel }) {
  const [printing, setPrinting] = useState(false);
  const base = `veriq-${product.publicId}`;
  if (!label.qrPayload) return null;
  const url = label.qrPayload;

  return (
    <>
      <div className="row-wrap">
        <button className="btn btn-sm" onClick={async () => downloadUrl(await qrDataUrl(url, 1024), `${base}.png`)}>
          <Download size={15} /> PNG
        </button>
        <button className="btn btn-sm" onClick={async () => downloadText(await qrSvg(url), `${base}.svg`, 'image/svg+xml')}>
          <FileCode2 size={15} /> SVG
        </button>
        <button className="btn btn-sm" onClick={() => setPrinting(true)}>
          <Printer size={15} /> Print label
        </button>
      </div>
      {printing && <PrintLabelModal product={product} label={label} onClose={() => setPrinting(false)} />}
    </>
  );
}

function PrintLabelModal({ product, label, onClose }: { product: LabelProduct; label: QrLabel; onClose: () => void }) {
  const printRoot = document.getElementById('print-root');
  useEffect(() => {
    document.body.classList.add('printing-label');
    return () => document.body.classList.remove('printing-label');
  }, []);
  return (
    <Modal
      title="Print-ready label"
      sub="Preview of a 85 × 45 mm product label. Only the label is sent to the printer."
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
      <div style={{ display: 'grid', placeItems: 'center', padding: '12px 0 20px', background: '#f4f5f8', borderRadius: 8 }}>
        <div style={{ boxShadow: '0 6px 20px -8px rgba(16,24,40,.3)', borderRadius: 10, marginTop: 8 }}>
          <ProductLabel product={product} label={label} />
        </div>
      </div>
      <div className="callout warn mt-16 small">
        <div>
          <strong>A printed QR code is copyable.</strong>
          The payload is not a link, so ordinary camera apps only show text, but anyone who photographs this label obtains the same signed payload. Combine with tamper-evident or secure label stock in production — see Security &amp;
          Limitations.
        </div>
      </div>
      {printRoot && createPortal(<ProductLabel product={product} label={label} />, printRoot)}
    </Modal>
  );
}
