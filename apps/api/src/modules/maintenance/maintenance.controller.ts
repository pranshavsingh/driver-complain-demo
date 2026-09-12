import type { Request, Response, NextFunction } from 'express';
import {
  createMaintenanceRecord,
  listMaintenanceRecords,
  getMaintenanceStatsSummary,
} from './maintenance.service';
import { sendSuccess } from '../../lib/http';
import type { MaintenanceType } from '@driver-complaint/shared-types';

export async function handleCreateMaintenanceRecord(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.id;
    const body = req.body;

    const quantity = body.quantity ? Number(body.quantity) : 1;
    const odometerKm = body.odometerKm ? Number(body.odometerKm) : undefined;
    const cost = body.cost !== undefined && body.cost !== '' ? Number(body.cost) : undefined;

    const input = {
      vehicleId: body.vehicleId,
      vehicleNumber: body.vehicleNumber,
      type: (body.type as MaintenanceType) || 'TYRE',
      itemNumber: body.itemNumber || '',
      oldItemNumber: body.oldItemNumber || undefined,
      quantity,
      odometerKm,
      brand: body.brand,
      position: body.position,
      cost,
      notes: body.notes,
    };

    const record = await createMaintenanceRecord(userId, input, req.file);
    sendSuccess(res, record, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleListMaintenanceRecords(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    const result = await listMaintenanceRecords({
      driverUserId: role === 'DRIVER' ? userId : (req.query.driverId as string),
      userRole: role,
      vehicleId: req.query.vehicleId as string,
      type: req.query.type as MaintenanceType,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetMaintenanceStats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const stats = await getMaintenanceStatsSummary({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      vehicleId: req.query.vehicleId as string,
    });

    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}

export async function handleExportMaintenanceCsv(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await listMaintenanceRecords({
      vehicleId: req.query.vehicleId as string,
      type: req.query.type as MaintenanceType,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
      page: 1,
      limit: 5000,
    });

    let csv =
      'ID,Date,Driver,EmployeeID,Vehicle,Type,NewItemNumber,OldItemNumber,Quantity,Brand,Position,Cost,Odometer(KM),Notes,PhotoUrl\n';

    for (const row of result.data) {
      const driverName = row.driver?.user
        ? `${row.driver.user.firstName} ${row.driver.user.lastName}`
        : 'N/A';
      const empId = row.driver?.user?.employeeId ?? 'N/A';
      const vehicle = row.vehicle?.plateNumber ?? 'N/A';
      const date = new Date(row.createdAt).toISOString();

      csv += `"${row.id}","${date}","${driverName}","${empId}","${vehicle}","${row.type}","${row.itemNumber}","${row.oldItemNumber ?? ''}",${row.quantity},"${row.brand ?? ''}","${row.position ?? ''}",${row.cost ?? ''},${row.odometerKm ?? ''},"${(row.notes ?? '').replace(/"/g, '""')}","${row.photoUrl ?? ''}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vehicle-maintenance-logs-${Date.now()}.csv"`,
    );
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}
