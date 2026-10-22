import { Fragment, type ReactNode } from 'react';

/** Minimal syntax-highlighted JSON renderer (no HTML injection — builds React nodes). */
export function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? '';
  const nodes: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1]) {
      nodes.push(
        <span key={i++} className={m[2] ? 'k' : 's'}>
          {m[1]}
        </span>,
      );
      if (m[2]) nodes.push(<Fragment key={i++}>{m[2]}</Fragment>);
    } else if (m[3]) nodes.push(<span key={i++} className="b">{m[3]}</span>);
    else if (m[4]) nodes.push(<span key={i++} className="n">{m[4]}</span>);
    last = re.lastIndex;
  }
  nodes.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <pre className="json">{nodes}</pre>;
}
