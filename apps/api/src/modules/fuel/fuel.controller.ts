import type { Request, Response, NextFunction } from 'express';
import { createFuelRecord, listFuelRecords, getFuelStatsSummary } from './fuel.service';
import { sendSuccess } from '../../lib/http';
import { CreateFuelRecordSchema, type FuelType } from '@driver-complaint/shared-types';

export async function handleCreateFuelRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const body = req.body;

    // Harmonize legacy/mobile quantity & price fields before validation
    const rawQuantity = body.quantityLtr ?? body.quantity;
    const rawPrice = body.totalPrice !== undefined && body.totalPrice !== ''
      ? body.totalPrice
      : body.price !== undefined && body.price !== ''
        ? body.price
        : 0;

    const parsed = CreateFuelRecordSchema.parse({
      ...body,
      quantityLtr: rawQuantity,
      totalPrice: rawPrice,
    });

    const record = await createFuelRecord(userId, parsed, req.file);
    sendSuccess(res, record, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleListFuelRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    const rawPage = req.query.page ? Number(req.query.page) : 1;
    const rawLimit = req.query.limit ? Number(req.query.limit) : 20;

    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

    const result = await listFuelRecords({
      driverUserId: role === 'DRIVER' ? userId : (req.query.driverId as string),
      userRole: role,
      vehicleId: req.query.vehicleId as string,
      type: req.query.type as FuelType,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page,
      limit,
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetFuelStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getFuelStatsSummary({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      vehicleId: req.query.vehicleId as string,
    });

    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}

export async function handleExportFuelCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listFuelRecords({
      vehicleId: req.query.vehicleId as string,
      type: req.query.type as FuelType,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: 1,
      limit: 5000,
    });

    let csv = 'ID,Date,Driver,EmployeeID,Vehicle,Type,Quantity(L),TotalPrice,RatePerLtr,Odometer(KM),Notes,ReceiptUrl\n';

    for (const row of result.data) {
      const driverName = row.driver?.user ? `${row.driver.user.firstName} ${row.driver.user.lastName}` : 'N/A';
      const empId = row.driver?.user?.employeeId ?? 'N/A';
      const vehicle = row.vehicle?.plateNumber ?? 'N/A';
      const date = new Date(row.createdAt).toISOString();
      const rate = row.ratePerLtr ?? (row.quantityLtr > 0 ? (row.totalPrice / row.quantityLtr).toFixed(2) : '0');

      csv += `"${row.id}","${date}","${driverName}","${empId}","${vehicle}","${row.type}",${row.quantityLtr},${row.totalPrice},${rate},${row.odometerKm ?? ''},"${(row.notes ?? '').replace(/"/g, '""')}","${row.receiptUrl ?? ''}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="fuel-def-logs-${Date.now()}.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}
