import type { RequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from './errors';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const storage = multer.memoryStorage();

/**
 * Accepts one image file in the `image` field, kept in memory and forwarded byte-for-byte
 * to the analysis service (no resizing or recompression anywhere in the pipeline).
 */
export function singleImage(): RequestHandler {
  const handler = multer({
    storage,
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 },
    fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype) || file.mimetype === 'application/octet-stream'),
  }).single('image');

  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        next(
          err.code === 'LIMIT_FILE_SIZE'
            ? new HttpError(413, 'IMAGE_TOO_LARGE', `The image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`)
            : new HttpError(400, 'BAD_UPLOAD', err.message),
        );
        return;
      }
      if (err) {
        next(err);
        return;
      }
      if (!req.file) {
        next(new HttpError(400, 'IMAGE_REQUIRED', 'Send the photo as multipart/form-data in a field named "image" (JPEG or PNG).'));
        return;
      }
      next();
    });
  };
}
