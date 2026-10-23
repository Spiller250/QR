import { useRef, useState } from 'react';
import { Check, Gauge, ImageUp, Trash2, Upload } from 'lucide-react';
import { CALIBRATION_TAGS } from '../../shared/constants';
import type { CalibrationSample, CalibrationTag } from '../../shared/types';
import { useAddCalibrationSample, useCalibration, useDeleteCalibrationSample, useSaveCdpThreshold } from '../api/hooks';
import { ResultBadge } from '../components/badges';
import { useToast } from '../components/toast';
import { Card, ConfirmModal, EmptyState, ErrorState, LoadingBlock, PageHead, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/format';

const TAG_META: Record<CalibrationTag, { label: string; color: string }> = {
  original: { label: 'Original print', color: '#0f7a55' },
  photocopy: { label: 'Photocopy / re-print', color: '#b42318' },
  screen: { label: 'Photo of a screen', color: '#a8530b' },
};

const BINS = 20;

export function CalibrationPage() {
  const { data, isLoading, error, refetch } = useCalibration();
  const add = useAddCalibrationSample();
  const remove = useDeleteCalibrationSample();
  const save = useSaveCdpThreshold();
  const toast = useToast();
  const [tag, setTag] = useState<CalibrationTag>('original');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setProgress({ done: 0, total: list.length });
    let failed = 0;
    for (const [i, file] of list.entries()) {
      try {
        await add.mutateAsync({ file, tag });
      } catch (err) {
        failed++;
        toast({ tone: 'error', title: `Could not analyse ${file.name}`, body: err instanceof Error ? err.message : undefined });
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    if (input.current) input.current.value = '';
    if (!failed) toast({ tone: 'success', title: `${list.length} sample${list.length === 1 ? '' : 's'} added`, body: `Tagged as ${TAG_META[tag].label.toLowerCase()}.` });
  }

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const s = data.suggestion;

  return (
    <div className="stack">
      <PageHead
        title="Calibration"
        description="Measure copy-detection scores for your printer and camera. Upload photos of original labels, photocopies and screen photos, then set the threshold between them."
      />

      <div className="grid grid-main-side">
        <Card title="Add samples" sub="Photos are analysed exactly like /api/verify-physical, but are not logged as verifications">
          <div className="stack-sm">
            <div className="tag">1 · What is in these photos?</div>
            <div className="segmented" role="radiogroup">
              {CALIBRATION_TAGS.map((t) => (
                <button key={t} className={tag === t ? 'active' : ''} onClick={() => setTag(t)} role="radio" aria-checked={tag === t}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: TAG_META[t].color, display: 'inline-block' }} />
                  {TAG_META[t].label}
                </button>
              ))}
            </div>
            <div className="tag mt-12">2 · Upload full-resolution photos (several at once is fine)</div>
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            <div className="row-wrap">
              <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={progress !== null}>
                {progress ? <Spinner light /> : <ImageUp size={16} />}
                {progress ? `Analysing ${progress.done}/${progress.total}…` : 'Choose photos'}
              </button>
              <span className="small muted">Use the original camera files — do not send them through a messenger (it recompresses images).</span>
            </div>
            <div className="callout info small mt-12">
              <div>
                <strong>Suggested procedure</strong>
                Print a label from a product page (PDF, 100% scale, laser). Take 5+ photos of the original, then photocopy it and take 5+ photos of the copy, and
                5+ photos of the label displayed on a phone or monitor. Use the same phone you will use for the demo.
              </div>
            </div>
          </div>
        </Card>

        <Card title="Threshold" sub={`Current: ${data.threshold.toFixed(2)} — results at or above are “Original”`}>
          {s ? (
            <div className="stack-sm">
              <div className="stat-value">{s.threshold.toFixed(2)}</div>
              <div className="small muted">
                Suggested: midway between the lowest original ({s.lowestOriginal.toFixed(2)}) and the highest copy ({s.highestCopy.toFixed(2)}).
              </div>
              {s.separable ? (
                <span className="badge badge-success">
                  <Check size={12} /> Margin {(s.lowestOriginal - s.highestCopy).toFixed(2)}
                </span>
              ) : (
                <div className="callout danger small">
                  <div>
                    <strong>Originals and copies overlap.</strong>No threshold separates them. Improve print quality (laser, 100% scale), capture closer and sharper, or
                    collect more samples.
                  </div>
                </div>
              )}
              <button
                className="btn btn-primary mt-8"
                disabled={save.isPending || Math.abs(s.threshold - data.threshold) < 0.0005}
                onClick={async () => {
                  await save.mutateAsync(s.threshold);
                  await refetch();
                  toast({ tone: 'success', title: 'Threshold updated', body: `Physical checks now use ${s.threshold.toFixed(2)}.` });
                }}
              >
                <Gauge size={16} /> Apply suggested threshold
              </button>
            </div>
          ) : (
            <div className="stack-sm">
              <p className="muted">Add at least one original and one copy (photocopy or screen) with a score to get a suggestion.</p>
              {data.items.some((i) => i.score === null) && (
                <div className="callout warn small">
                  <div>
                    {data.items.filter((i) => i.score === null).length} sample(s) have no score — see the Outcome column (e.g. revoked label, blurry or too-far photo). Only
                    labels that are currently active can be calibrated.
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Score distribution"
        sub="Number of samples per score bin (0.05 wide), by tag"
        actions={
          <div className="legend">
            {CALIBRATION_TAGS.map((t) => (
              <span key={t}>
                <i style={{ background: TAG_META[t].color }} />
                {TAG_META[t].label}
              </span>
            ))}
          </div>
        }
      >
        <Histogram items={data.items} threshold={data.threshold} suggested={s?.threshold ?? null} />
      </Card>

      <Card
        title="Samples"
        sub={`${data.items.length} stored in SQLite (scores and diagnostics only — images are not kept)`}
        bodyClass="tight"
        actions={
          data.items.length > 0 && (
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmClear(true)}>
              <Trash2 size={14} /> Clear all
            </button>
          )
        }
      >
        {data.items.length === 0 ? (
          <EmptyState icon={Upload} title="No calibration samples yet">
            Upload photos above to start.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Added</th>
                  <th>Tag</th>
                  <th>File / note</th>
                  <th>Outcome</th>
                  <th className="num">Score</th>
                  <th className="num">px/cell</th>
                  <th className="num">Sharpness</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td className="nowrap">{fmtDateTime(i.createdAt)}</td>
                    <td className="nowrap">
                      <span className="row" style={{ gap: 6 }}>
                        <i style={{ width: 8, height: 8, borderRadius: 2, background: TAG_META[i.tag].color, display: 'inline-block' }} />
                        {TAG_META[i.tag].label}
                      </span>
                    </td>
                    <td className="small truncate" style={{ maxWidth: 220 }}>
                      {i.note ?? '—'}
                      {i.productName && <div className="cell-sub">{i.productName}</div>}
                    </td>
                    <td>
                      <ResultBadge result={i.status} />
                      {i.status !== 'authentic' && i.status !== 'copy_suspected' && <div className="cell-sub mono">{i.reasonCode}</div>}
                    </td>
                    <td className="num strong">{i.score !== null ? i.score.toFixed(3) : '—'}</td>
                    <td className="num">{i.diagnostics.pixelsPerCell ?? '—'}</td>
                    <td className="num">{i.diagnostics.sharpness ?? '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" aria-label="Delete sample" onClick={() => remove.mutate(i.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmClear && (
        <ConfirmModal
          title="Delete all calibration samples?"
          body="Scores and diagnostics of all samples are removed. The current threshold is not changed."
          confirmLabel="Delete all"
          danger
          busy={remove.isPending}
          onClose={() => setConfirmClear(false)}
          onConfirm={async () => {
            await remove.mutateAsync('all');
            setConfirmClear(false);
          }}
        />
      )}
    </div>
  );
}

function Histogram({ items, threshold, suggested }: { items: CalibrationSample[]; threshold: number; suggested: number | null }) {
  const scored = items.filter((i) => i.score !== null);
  if (!scored.length) return <p className="muted">Scores appear here once samples are added. Unreadable photos have no score and are listed below only.</p>;
  const counts = Array.from({ length: BINS }, () => ({ original: 0, photocopy: 0, screen: 0 }) as Record<CalibrationTag, number>);
  for (const i of scored) counts[Math.min(BINS - 1, Math.floor(i.score! * BINS))][i.tag]++;
  const max = Math.max(1, ...counts.map((c) => c.original + c.photocopy + c.screen));
  // Labels sit on opposite sides of their lines so nearby markers stay readable.
  const mark = (v: number, label: string, color: string, side: 'left' | 'right') => (
    <div className={`histo-mark ${side}`} style={{ left: `${v * 100}%`, borderColor: color, color }}>
      <span>
        {label} {v.toFixed(2)}
      </span>
    </div>
  );
  return (
    <div style={{ paddingTop: 22 }}>
      <div className="histo">
        {counts.map((c, b) => (
          <div className="histo-col" key={b} title={`${(b / BINS).toFixed(2)}–${((b + 1) / BINS).toFixed(2)}: ${c.original} original, ${c.photocopy} photocopy, ${c.screen} screen`}>
            {CALIBRATION_TAGS.map((t) => (c[t] ? <i key={t} style={{ height: `${(c[t] / max) * 100}%`, background: TAG_META[t].color }} /> : null))}
          </div>
        ))}
        {mark(threshold, 'current', 'var(--navy-700)', suggested !== null && suggested < threshold ? 'right' : 'left')}
        {suggested !== null && Math.abs(suggested - threshold) > 0.01 && mark(suggested, 'suggested', 'var(--accent)', suggested < threshold ? 'left' : 'right')}
      </div>
      <div className="histo-axis">
        <span>0</span>
        <span>0.25</span>
        <span>0.5</span>
        <span>0.75</span>
        <span>1.0</span>
      </div>
    </div>
  );
}
