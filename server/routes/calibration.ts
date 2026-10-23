import { Router } from 'express';
import { z } from 'zod';
import { CALIBRATION_TAGS } from '../../shared/constants';
import type { CalibrationSample, CalibrationSummary } from '../../shared/types';
import type { AppContext } from '../app';
import { HttpError, parse } from '../middleware/errors';
import { singleImage } from '../middleware/upload';

const sampleFields = z.object({
  tag: z.enum(CALIBRATION_TAGS, { errorMap: () => ({ message: 'tag must be original, photocopy or screen' }) }),
  note: z.string().trim().max(120).optional(),
});

/** Midpoint between the weakest original and the strongest copy (photocopy or screen). */
export function suggestThreshold(items: CalibrationSample[]): CalibrationSummary['suggestion'] {
  const scored = items.filter((i) => i.score !== null);
  const originals = scored.filter((i) => i.tag === 'original').map((i) => i.score!);
  const copies = scored.filter((i) => i.tag !== 'original').map((i) => i.score!);
  if (!originals.length || !copies.length) return null;
  const lowestOriginal = Math.min(...originals);
  const highestCopy = Math.max(...copies);
  return {
    threshold: Math.round(((lowestOriginal + highestCopy) / 2) * 1000) / 1000,
    lowestOriginal,
    highestCopy,
    separable: lowestOriginal > highestCopy,
  };
}

/** Operator-only calibration: analyse tagged captures without logging them as verifications. */
export function calibrationRoutes({ store, physical, config }: AppContext): Router {
  const r = Router();

  const summary = (): CalibrationSummary => {
    const items = store.listCalibrationSamples();
    return { items, threshold: store.getCdpThreshold(config.cdp.defaultThreshold), suggestion: suggestThreshold(items) };
  };

  r.get('/', (_req, res) => {
    res.json(summary());
  });

  r.post('/', singleImage(), async (req, res, next) => {
    try {
      const { tag, note } = parse(sampleFields, req.body ?? {});
      const file = req.file!;
      const out = await physical.check({
        image: { buffer: file.buffer, mimetype: file.mimetype, filename: file.originalname },
        scannerId: 'CALIBRATION',
        appClient: null,
        record: false,
      });
      const id = store.insertCalibrationSample({
        tag,
        note: note || file.originalname || null,
        status: out.result,
        reasonCode: out.reasonCode,
        score: out.score,
        productId: out.productId,
        components: out.components ?? {},
        diagnostics: out.diagnostics,
      });
      res.status(201).json({ id, ...summary() });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id', (req, res) => {
    if (!store.deleteCalibrationSample(req.params.id)) throw new HttpError(404, 'SAMPLE_NOT_FOUND', 'Calibration sample not found.');
    res.json(summary());
  });

  r.delete('/', (_req, res) => {
    store.clearCalibrationSamples();
    res.json(summary());
  });

  return r;
}
