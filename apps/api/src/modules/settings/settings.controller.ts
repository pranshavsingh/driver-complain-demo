import type { Request, Response } from 'express';
import * as settingsService from './settings.service';

export async function getCategorySla(_req: Request, res: Response): Promise<void> {
  const slas = await settingsService.getCategorySlaList();
  res.json(slas);
}

export async function updateCategorySla(req: Request, res: Response): Promise<void> {
  const updated = await settingsService.updateCategorySlaList(req.body);
  res.json(updated);
}
