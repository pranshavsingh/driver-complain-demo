import type { Request, Response } from 'express';
import { VehicleReportQuerySchema } from '@driver-complaint/shared-types';
import * as reportsService from './reports.service';
import {
  exportVehicleReportFilename,
  writeVehicleReportXlsx,
  exportFleetReportFilename,
  writeFleetFullReportXlsx,
  XLSX_CONTENT_TYPE,
} from './reports.export';

export async function getVehicleReport(req: Request, res: Response): Promise<void> {
  const query = VehicleReportQuerySchema.parse({
    vehicleId: typeof req.query.vehicleId === 'string' ? req.query.vehicleId : undefined,
    dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
    dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
  });

  const report = await reportsService.getVehicleReport(query);
  res.json({ success: true, data: report });
}

export async function exportVehicleReport(req: Request, res: Response): Promise<void> {
  const query = VehicleReportQuerySchema.parse({
    vehicleId: typeof req.query.vehicleId === 'string' ? req.query.vehicleId : undefined,
    dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
    dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
  });

  const report = await reportsService.getVehicleReport(query);
  const filename = exportVehicleReportFilename(report.vehicle?.plateNumber ?? 'fleet');

  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await writeVehicleReportXlsx(res, report);
}

export async function exportFleetReport(req: Request, res: Response): Promise<void> {
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;

  const fleetData = await reportsService.getFleetFullReport({ dateFrom, dateTo });
  const filename = exportFleetReportFilename();

  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await writeFleetFullReportXlsx(res, fleetData);
}

export async function listFleetSummary(_req: Request, res: Response): Promise<void> {
  const fleet = await reportsService.listFleetVehiclesSummary();
  res.json({ success: true, data: fleet });
}

