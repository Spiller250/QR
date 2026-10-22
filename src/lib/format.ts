const dateTime = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const timeOnly = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');
export const fmtDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '—');
export const fmtTime = (iso: string | null | undefined) => (iso ? timeOnly.format(new Date(iso)) : '—');
export const fmtNumber = (n: number) => n.toLocaleString('en-US');

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(diff / 3600), 'hour');
  if (abs < 86_400 * 30) return relative.format(Math.round(diff / 86_400), 'day');
  return fmtDate(iso);
}

export const today = () => new Date().toISOString().slice(0, 10);
