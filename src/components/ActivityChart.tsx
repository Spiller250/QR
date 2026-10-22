import { useState } from 'react';
import type { OverviewStats } from '../../shared/types';

export const SERIES = [
  { key: 'authentic', label: 'Authentic', color: '#2f5bea' },
  { key: 'suspicious', label: 'Suspicious', color: '#e8a33d' },
  { key: 'invalid', label: 'Invalid', color: '#d9534a' },
  { key: 'revoked', label: 'Revoked', color: '#8a94a8' },
] as const;

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 30 };

/** Lightweight stacked bar chart (SVG) of daily verification attempts. */
export function ActivityChart({ data }: { data: OverviewStats['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => d.authentic + d.suspicious + d.invalid + d.revoked);
  const max = Math.max(4, ...totals);
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const colW = innerW / data.length;
  const barW = Math.min(28, colW * 0.6);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily verification attempts, last 14 days">
        <g className="axis">
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line className="gridline" x1={PAD.left} x2={W - PAD.right} y1={y(i * step)} y2={y(i * step)} />
              <text x={PAD.left - 8} y={y(i * step) + 4} textAnchor="end">
                {i * step}
              </text>
            </g>
          ))}
        </g>
        {data.map((d, i) => {
          const x = PAD.left + i * colW + (colW - barW) / 2;
          let acc = 0;
          const label = new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
          return (
            <g key={d.date} className="col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + i * colW} y={PAD.top} width={colW} height={innerH} fill="transparent" />
              {SERIES.map((s) => {
                const v = d[s.key];
                if (!v) return null;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                return <rect key={s.key} className="bar" x={x} y={y1} width={barW} height={Math.max(0, y0 - y1)} fill={s.color} rx={2} />;
              })}
              {(i % 2 === data.length % 2 || data.length <= 8) && (
                <text className="axis" x={x + barW / 2} y={H - 8} textAnchor="middle" style={{ fontSize: 11, fill: '#98a2b3' }}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((PAD.left + (hover + 0.5) * colW) / W) * 100}%`, top: `${(y(totals[hover]) / H) * 100}%` }}>
          <div className="strong">{new Date(`${data[hover].date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })}</div>
          {SERIES.map((s) => (
            <div key={s.key} className="row" style={{ gap: 6 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label}: {data[hover][s.key]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
