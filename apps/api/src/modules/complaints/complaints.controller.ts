import type { Request, Response } from 'express';
import type {
  CreateComplaint,
  UpdateComplaintStatus,
  AssignComplaint,
  ComplaintListQuery,
  ComplaintExportQuery,
} from '@driver-complaint/shared-types';
import * as complaintsService from './complaints.service';
import type { ComplaintEvidence, ComplaintExportRow } from './complaints.service';
import { writeComplaintsXlsx, exportFilename, XLSX_CONTENT_TYPE } from './complaints.export';
import { EVIDENCE_FIELDS, EVIDENCE_FIELD_NAMES } from '../../middleware/upload';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';
import { logger } from '../../lib/logger';

/**
 * Collect the parsed uploads into evidence keyed by attachment kind.
 *
 * uploadEvidence (multer) runs before this handler and uses `.fields()`, so req.files is a
 * per-field map. It is absent entirely when the request was not multipart.
 */
function collectEvidence(files: Request['files']): ComplaintEvidence {
  if (!files || Array.isArray(files)) return {};
  const evidence: ComplaintEvidence = {};
  for (const name of EVIDENCE_FIELD_NAMES) {
    const file = files[name]?.[0];
    if (file) {
      evidence[EVIDENCE_FIELDS[name].kind] = {
        buffer: file.buffer,
        originalName: file.originalname,
      };
    }
  }
  return evidence;
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = req.body as CreateComplaint;
  const complaint = await complaintsService.create(
    req.user.id,
    input,
    collectEvidence(req.files),
  );
  sendSuccess(res, complaint, 201);
}

export async function list(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const query = res.locals.query as ComplaintListQuery;
  const result = await complaintsService.list({ id: req.user.id, role: req.user.role }, query);
  sendSuccess(res, result);
}

/** Re-yield an already-pulled first batch, then the remainder of the generator. */
async function* prepend(
  first: IteratorResult<ComplaintExportRow[]>,
  rest: AsyncGenerator<ComplaintExportRow[]>,
): AsyncGenerator<ComplaintExportRow[]> {
  if (!first.done) yield first.value;
  yield* rest;
}

export async function exportXlsx(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const filter = res.locals.query as ComplaintExportQuery;
  const batches = complaintsService.iterateForExport(
    { id: req.user.id, role: req.user.role },
    filter,
  );

  // Pull the first batch BEFORE any bytes go out: a failing query then still renders a JSON
  // error, instead of a 200-status file that opens as a corrupt spreadsheet.
  const first = await batches.next();

  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);

  try {
    await writeComplaintsXlsx(res, prepend(first, batches));
  } catch (err) {
    // Headers are already sent, so no error envelope is possible. Breaking the connection
    // is the only honest signal — the browser reports a failed download rather than saving
    // a truncated file that looks complete.
    logger.error({ err }, 'Complaint export failed mid-stream');
    res.destroy(err instanceof Error ? err : new Error('Export failed'));
  }
}

export async function getOne(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  const complaint = await complaintsService.getOne({ id: req.user.id, role: req.user.role }, id);
  sendSuccess(res, complaint);
}

export async function updateStatus(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  const input = req.body as UpdateComplaintStatus;
  const complaint = await complaintsService.updateStatus(
    { id: req.user.id, role: req.user.role },
    id,
    input,
  );
  sendSuccess(res, complaint);
}

export async function assign(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  const input = req.body as AssignComplaint;
  const complaint = await complaintsService.assign(req.user.id, id, input);
  sendSuccess(res, complaint);
}
