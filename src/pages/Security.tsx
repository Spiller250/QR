import type { ReactNode } from 'react';
import {
  AppWindow,
  ArrowRight,
  FileSignature,
  Ban,
  Camera,
  Cpu,
  FileKey2,
  Fingerprint,
  KeyRound,
  Nfc,
  Printer,
  QrCode,
  Radar,
  ScanSearch,
  Server,
  ShieldCheck,
  Sticker,
} from 'lucide-react';
import { Card, PageHead } from '../components/ui';

type Status = 'implemented' | 'heuristic' | 'not';
const STATUS: Record<Status, ReactNode> = {
  implemented: <span className="badge badge-success">Implemented in POC</span>,
  heuristic: <span className="badge badge-warning">Implemented · partial</span>,
  not: <span className="badge badge-neutral">Not implemented</span>,
};

const LAYERS: { icon: ReactNode; title: string; body: string; status: Status }[] = [
  {
    icon: <KeyRound size={18} />,
    title: 'Unique QR token generation',
    body: 'Each label carries a 128-bit token from the operating system CSPRNG (Node crypto.randomBytes). Tokens are unguessable and separate from the public product ID. Guessing a valid token is computationally infeasible.',
    status: 'implemented',
  },
  {
    icon: <FileSignature size={18} />,
    title: 'Signed, non-URL QR payload',
    body: 'Labels encode VQ1.<token>.<signature> — plain text, not a link, so regular camera apps have nothing to open. The 96-bit HMAC signature (separate QR signing secret) is checked in constant time before any database lookup, so modified or forged payloads are rejected as BAD_SIGNATURE.',
    status: 'implemented',
  },
  {
    icon: <AppWindow size={18} />,
    title: 'Verification through authorized apps only',
    body: 'POST /api/verify requires an X-App-Key issued per client (e.g. web-scanner, flutter-app); other callers receive 401 and nothing is logged or disclosed. Keys identify apps but are not secrets once shipped in a web bundle or binary — production needs platform attestation (Play Integrity / App Attest).',
    status: 'heuristic',
  },
  {
    icon: <Server size={18} />,
    title: 'Server-side token validation',
    body: 'After the signature check, the server looks the token up by HMAC-SHA256, checks the label status and returns a minimal result. Unknown and revoked codes disclose no product data. Requests are rate-limited.',
    status: 'implemented',
  },
  {
    icon: <Ban size={18} />,
    title: 'Revocation and reissue',
    body: 'Operators can revoke a label or atomically reissue it. Revoked tokens remain recognisable (so attempts are logged as “revoked”) but can never verify again; their plaintext is discarded.',
    status: 'implemented',
  },
  {
    icon: <Radar size={18} />,
    title: 'Repeat-scan anomaly detection',
    body: 'Configurable rules flag unusual patterns: too many scans, too many scanners or locations within a window, or a different scanner shortly after the previous scan. These are risk signals for review, not proof.',
    status: 'heuristic',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Copy Detection Pattern (CDP) — physical label check',
    body: 'Each label carries a 6 mm random pattern of 0.15 mm cells in the centre of its QR code, derived from a server secret. POST /api/verify-physical photographs the label and scores how faithfully the cells survived: first-generation prints keep them crisp, photocopies, re-prints of photos and screen photos degrade them. The score is a calibrated heuristic, not proof — it depends on consistent high-quality printing, a sharp close-up capture and a threshold tuned on real samples.',
    status: 'heuristic',
  },
  {
    icon: <Nfc size={18} />,
    title: 'Hardware-backed physical authenticity',
    body: 'Cryptographic proof that the physical item is genuine (e.g. secure NFC tags answering a fresh challenge) is not implemented. It is the strongest option and cannot be copied by imaging.',
    status: 'not',
  },
];

const OPTIONS: { icon: ReactNode; title: string; body: string; notes: string[] }[] = [
  {
    icon: <Sticker size={17} />,
    title: 'Tamper-evident labels',
    body: 'VOID-pattern or destructible label stock shows visible damage when removed, discouraging label transfer to counterfeit goods.',
    notes: ['Low cost, works with existing QR flow', 'Does not stop a photocopy being applied to a fake'],
  },
  {
    icon: <Printer size={17} />,
    title: 'Secure labels & print features',
    body: 'Holograms, micro-text, security inks or randomized physical features that are hard to reproduce with consumer printers.',
    notes: ['Often verified by trained inspectors', 'Requires a qualified label vendor'],
  },
  {
    icon: <Nfc size={17} />,
    title: 'Secure NFC tags',
    body: 'NFC chips with on-chip keys (e.g. tags that produce a fresh cryptographic message on each tap) cannot be cloned by copying data.',
    notes: ['Higher unit cost', 'Needs NFC-capable scanners/phones'],
  },
  {
    icon: <FileKey2 size={17} />,
    title: 'Cryptographic product credentials',
    body: 'Signed credentials (e.g. manufacturer-signed records) allow offline verification of issuance data and supply-chain events.',
    notes: ['Proves who issued the data — not which physical item is present'],
  },
  {
    icon: <Cpu size={17} />,
    title: 'Device-bound / challenge–response',
    body: 'Where suitable hardware exists (secure elements, attested scanner apps), the verifier sends a fresh challenge the genuine tag must answer.',
    notes: ['Strongest option against cloning', 'Requires dedicated hardware and app'],
  },
  {
    icon: <ScanSearch size={17} />,
    title: 'Production-grade copy detection',
    body: 'This POC includes a basic CDP. A production deployment would need print-process control, larger validated datasets and an independently tested false-accept / false-reject rate.',
    notes: ['A skilled forger with high-end scanning/printing may defeat a basic CDP', 'Error rates must be measured on real prints before any claims'],
  },
];

export function SecurityPage() {
  return (
    <div className="stack">
      <PageHead
        title="Security & Limitations"
        description="What this proof of concept protects against, what it does not, and the options available for physical anti-counterfeit protection."
      />

      <Card title="Protection layers in this POC" bodyClass="tight">
        {LAYERS.map((l) => (
          <div className="layer" key={l.title}>
            <div className="l-ico">{l.icon}</div>
            <div>
              <h3>{l.title}</h3>
              <p>{l.body}</p>
            </div>
            <div>{STATUS[l.status]}</div>
          </div>
        ))}
      </Card>

      <Card title="Why a standard QR code can be copied" sub="The central limitation every QR-based system must address">
        <div className="flow" aria-hidden="true">
          <div className="flow-node">
            <div className="fn-box">
              <QrCode size={28} />
            </div>
            Original label with secret token
          </div>
          <ArrowRight className="flow-arrow" />
          <div className="flow-node">
            <div className="fn-box">
              <Camera size={28} />
            </div>
            Photographed or photocopied
          </div>
          <ArrowRight className="flow-arrow" />
          <div className="flow-node">
            <div className="fn-box" style={{ borderColor: 'var(--warning-border)', background: 'var(--warning-bg)' }}>
              <Fingerprint size={28} color="#a8530b" />
            </div>
            Server receives the identical signed payload
          </div>
        </div>
        <div className="grid grid-2 mt-16">
          <div className="callout warn">
            <div>
              <strong>What the server can know</strong>
              That the payload was signed by VERIQ, the token is active and not revoked, which authorized app submitted it, and how often, when, where and by which scanner it has been presented.
            </div>
          </div>
          <div className="callout danger">
            <div>
              <strong>What the server cannot know</strong>
              Whether the scanned image came from the original label, a photograph, a screen or a reprint. Server-side validation alone cannot prove a physical label
              is original.
            </div>
          </div>
        </div>
        <p className="muted mt-16">
          Repeat-scan heuristics narrow the window for abuse: a cloned code that appears in several cities, or on several scanners within minutes, is flagged for review.
          They cannot identify which copy is the original — and legitimate buyers may scan the same product more than once, so a repeat scan is never by itself
          treated as counterfeit.
        </p>
      </Card>

      <div>
        <h2 style={{ fontSize: 16 }}>Possible future options</h2>
        <p className="muted mt-4">Not implemented in this POC. Each option would require evaluation, vendor selection and testing before production use.</p>
      </div>
      <div className="grid grid-3">
        {OPTIONS.map((o) => (
          <div className="card option-card" key={o.title}>
            <h3>
              <span className="stat-icon neutral" style={{ width: 28, height: 28 }}>
                {o.icon}
              </span>
              {o.title}
            </h3>
            <p>{o.body}</p>
            <ul>
              {o.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Card title="Known limitations of this POC">
        <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
          <li>Operator authentication is demo-only: a single account from environment variables. No SSO, MFA, roles or audit trail of operator actions.</li>
          <li>Scanner IDs and locations are self-reported by the client. A production scanner app must enrol devices and authenticate them.</li>
          <li>App keys are static per-client identifiers. The web scanner's key is visible in its JavaScript bundle; a determined attacker can extract any key shipped in an app. Use app attestation and key rotation in production.</li>
          <li>The QR payload is plain text: anyone can read or copy it. The signature prevents forging new payloads, not copying existing ones.</li>
          <li>The copy-detection pattern is not 100% copy-proof. Scores depend on printer, paper, camera and lighting; inkjet or low-quality printing lowers original scores, and a high-quality reproduction may pass. Thresholds must be calibrated per setup.</li>
          <li>The browser scanner is a proof of concept, not the dedicated Flutter application.</li>
          <li>Plaintext tokens of active labels are stored so labels can be re-downloaded; production would render labels once at print time and keep only the HMAC.</li>
          <li>SQLite storage and in-process rate limiting suit a single-node demo, not a distributed deployment.</li>
          <li>Anomaly thresholds are illustrative and must be tuned on real scan data.</li>
        </ul>
      </Card>
    </div>
  );
}
