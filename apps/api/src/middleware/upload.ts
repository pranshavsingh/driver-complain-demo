import multer, { MulterError } from 'multer';
import type { Request, Response, NextFunction } from 'express';
import type { AttachmentKind } from '@driver-complaint/shared-types';
import { ApiError } from '../errors/api-error';

const MB = 1024 * 1024;

interface EvidenceSpec {
  kind: AttachmentKind;
  /** Used in error messages the driver reads. */
  label: string;
  mimePrefix: string;
  accepts: string;
  maxBytes: number;
}

/**
 * The evidence a complaint can carry: at most one file of each kind.
 *
 * The caps are duplicated in the driver app (apps/mobile/src/media/limits.ts) on purpose — a
 * driver on rural 3G must be refused on the phone in an instant, not after a two-minute upload
 * that ends in a 400. This side is the one that matters for integrity; that side is UX.
 */
export const EVIDENCE_FIELDS = {
  photo: {
    kind: 'PHOTO',
    label: 'Photo',
    mimePrefix: 'image/',
    accepts: 'an image',
    maxBytes: 10 * MB,
  },
  voice: {
    kind: 'VOICE',
    label: 'Voice note',
    mimePrefix: 'audio/',
    accepts: 'an audio recording',
    maxBytes: 10 * MB,
  },
  video: {
    kind: 'VIDEO',
    label: 'Video',
    mimePrefix: 'video/',
    accepts: 'a video',
    maxBytes: 25 * MB,
  },
} as const satisfies Record<string, EvidenceSpec>;

export type EvidenceField = keyof typeof EVIDENCE_FIELDS;
export const EVIDENCE_FIELD_NAMES = Object.keys(EVIDENCE_FIELDS) as EvidenceField[];

/** Multer's fileSize limit is global, so it has to be the largest of our per-kind caps. */
const MAX_ANY_BYTES = Math.max(...EVIDENCE_FIELD_NAMES.map((name) => EVIDENCE_FIELDS[name].maxBytes));

function isEvidenceField(name: string): name is EvidenceField {
  return Object.prototype.hasOwnProperty.call(EVIDENCE_FIELDS, name);
}

const mb = (bytes: number): number => Math.round(bytes / MB);

const parseEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ANY_BYTES, files: EVIDENCE_FIELD_NAMES.length },
  fileFilter: (_req, file, cb) => {
    // multer's .fields() has already rejected any field name that is not one of ours
    // (LIMIT_UNEXPECTED_FILE). This lookup narrows the name so the mimetype can be checked.
    const spec = isEvidenceField(file.fieldname) ? EVIDENCE_FIELDS[file.fieldname] : undefined;
    if (!spec) {
      cb(ApiError.badRequest(`Unexpected file field "${file.fieldname}"`));
      return;
    }
    if (!file.mimetype.startsWith(spec.mimePrefix)) {
      cb(ApiError.badRequest(`${spec.label} must be ${spec.accepts}`));
      return;
    }
    cb(null, true);
  },
}).fields(EVIDENCE_FIELD_NAMES.map((name) => ({ name, maxCount: 1 })));

/** Translate multer's own failures into something a driver can act on. */
function describeMulterError(err: MulterError): string {
  const spec = err.field && isEvidenceField(err.field) ? EVIDENCE_FIELDS[err.field] : undefined;
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return spec
        ? `${spec.label} exceeds the ${mb(spec.maxBytes)} MB limit`
        : `File exceeds the ${mb(MAX_ANY_BYTES)} MB limit`;
    case 'LIMIT_UNEXPECTED_FILE':
    case 'LIMIT_FILE_COUNT':
      return 'Attach at most one photo, one voice note and one video';
    default:
      return err.message;
  }
}

/**
 * The per-kind cap multer could not enforce: its fileSize limit is global, so a 20 MB file sent
 * as `photo` gets through the parser and has to be rejected here. Returns the first offender's
 * message, or null when every file is within its own limit.
 */
function firstOversizeFile(files: Request['files']): string | null {
  if (!files || Array.isArray(files)) return null;
  for (const name of EVIDENCE_FIELD_NAMES) {
    const file = files[name]?.[0];
    const spec = EVIDENCE_FIELDS[name];
    if (file && file.size > spec.maxBytes) {
      return `${spec.label} exceeds the ${mb(spec.maxBytes)} MB limit`;
    }
  }
  return null;
}

/**
 * Accept up to one photo, one voice note and one video on a multipart complaint request
 * (memory storage). Everything is optional; a text-only complaint passes straight through.
 *
 * Multer errors and over-cap files become clean 400 ApiErrors; anything else falls through to
 * the error handler unchanged.
 */
export function uploadEvidence(req: Request, res: Response, next: NextFunction): void {
  parseEvidence(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      next(ApiError.badRequest(describeMulterError(err)));
      return;
    }
    if (err) {
      next(err);
      return;
    }

    const oversize = firstOversizeFile(req.files);
    next(oversize ? ApiError.badRequest(oversize) : undefined);
  });
}
