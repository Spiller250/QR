import { useState, type FormEvent } from 'react';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '../../shared/constants';
import { productInputSchema, type ProductInput } from '../../shared/schemas';
import { ApiError } from '../api/client';
import { today } from '../lib/format';
import { Field, Modal, Spinner } from './ui';

const EMPTY = {
  name: '',
  sku: '',
  manufacturer: '',
  category: '',
  batchNumber: '',
  productionDate: today(),
  status: 'active',
};

type FormState = typeof EMPTY;

export function ProductFormModal({ initial, title, submitLabel, onSubmit, onClose }: {
  initial?: Partial<ProductInput>;
  title: string;
  submitLabel: string;
  onSubmit: (input: ProductInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>({ ...EMPTY, ...(initial as Partial<FormState>) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    // Same Zod schema as the API, so client and server validation agree.
    const parsed = productInputSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setFormError(err instanceof Error ? err.message : 'Could not save product');
    } finally {
      setBusy(false);
    }
  }

  const cls = (k: string) => `input${errors[k] ? ' error' : ''}`;

  return (
    <Modal
      title={title}
      sub="Fields marked by validation are required. Use fictional data only."
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="product-form" disabled={busy}>
            {busy && <Spinner light />}
            {submitLabel}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate>
        {formError && (
          <div className="callout danger small" style={{ marginBottom: 16 }}>
            {formError}
          </div>
        )}
        <div className="form-grid">
          <Field label="Product name" error={errors.name} className="span-2">
            <input className={cls('name')} value={form.name} onChange={set('name')} placeholder="e.g. Meridian Chronograph 42 mm" autoFocus />
          </Field>
          <Field label="SKU" error={errors.sku} hint="Unique stock-keeping unit">
            <input className={cls('sku')} value={form.sku} onChange={set('sku')} placeholder="AUR-MER-42-SLV" />
          </Field>
          <Field label="Manufacturer" error={errors.manufacturer}>
            <input className={cls('manufacturer')} value={form.manufacturer} onChange={set('manufacturer')} placeholder="Aurelle Horlogerie (fictional)" />
          </Field>
          <Field label="Category" error={errors.category}>
            <select className={`select${errors.category ? ' error' : ''}`} value={form.category} onChange={set('category')}>
              <option value="">Select a category</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Status" error={errors.status}>
            <select className="select" value={form.status} onChange={set('status')}>
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Batch number" error={errors.batchNumber}>
            <input className={cls('batchNumber')} value={form.batchNumber} onChange={set('batchNumber')} placeholder="B-2026-0917" />
          </Field>
          <Field label="Production date" error={errors.productionDate}>
            <input className={cls('productionDate')} type="date" value={form.productionDate} max={today()} onChange={set('productionDate')} />
          </Field>
        </div>
        {!initial && (
          <div className="callout info small mt-16">
            <div>A unique public product ID and a secret 128-bit verification token are generated automatically when you save.</div>
          </div>
        )}
      </form>
    </Modal>
  );
}
