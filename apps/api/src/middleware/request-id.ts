import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** Attach a correlation id to every request and echo it back for client-side tracing. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
