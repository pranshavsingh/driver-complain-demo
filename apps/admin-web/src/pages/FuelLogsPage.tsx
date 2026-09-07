import { useState, useMemo, type ReactElement } from 'react';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { formatDateTime } from '../lib/format';
import { Fuel, Download, RotateCw, Search, X, ExternalLink, ImageIcon } from '../components/Icons';

export function FuelLogsPage(): ReactElement {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);

  const vehiclesRes = useApiResource('admin:vehicles', () => api.vehicles.list());
  const statsRes = useApiResource(
    `admin:fuel:stats:${startDate}:${endDate}:${vehicleId}`,
    () => api.fuel.stats({ startDate: startDate || undefined, endDate: endDate || undefined, vehicleId: vehicleId || undefined }),
  );
  const logsRes = useApiResource(
    `admin:fuel:list:${typeFilter}:${vehicleId}:${startDate}:${endDate}:${page}:${pageSize}`,
    () =>
      api.fuel.list({
        type: typeFilter || undefined,
        vehicleId: vehicleId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: pageSize,
      }),
  );

  const vehicles = vehiclesRes.data ?? [];
  const stats = statsRes.data ?? {
    totalFuelCost: 0,
    totalDefCost: 0,
    totalFuelVolumeLtr: 0,
    totalDefVolumeLtr: 0,
    totalEntriesCount: 0,
  };

  const rawLogs = logsRes.data?.data ?? [];
  const totalItems = logsRes.data?.total ?? 0;
  const totalPages = logsRes.data?.totalPages ?? 1;

  // Filter search locally if search text entered
  const filteredLogs = useMemo(() => {
    if (!search.trim()) return rawLogs;
    const term = search.toLowerCase();
    return rawLogs.filter((item: any) => {
      const driverName = item.driver?.user
        ? `${item.driver.user.firstName} ${item.driver.user.lastName}`.toLowerCase()
        : '';
      const empId = item.driver?.user?.employeeId?.toLowerCase() ?? '';
      const plate = item.vehicle?.plateNumber?.toLowerCase() ?? '';
      return driverName.includes(term) || empId.includes(term) || plate.includes(term);
    });
  }, [rawLogs, search]);

  const handleExportCsv = () => {
    void api.fuel.exportCsv({
      type: typeFilter || undefined,
      vehicleId: vehicleId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleRefresh = () => {
    statsRes.reload();
    logsRes.reload();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Fuel className="text-emerald-600" size={28} />
            Fuel & DEF Management & Logs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time fleet fuel fill logs, DEF consumption, expense metrics, and receipt auditing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <RotateCw size={16} />
            Refresh
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <ErrorBanner error={logsRes.error || statsRes.error} />

      {/* Metric Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Fuel Expense</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              ⛽
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            ₹{stats.totalFuelCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {stats.totalFuelVolumeLtr.toFixed(1)} Litres filled
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total DEF Expense</span>
            <span className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
              💧
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            ₹{stats.totalDefCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {stats.totalDefVolumeLtr.toFixed(1)} Litres DEF
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Fuel Volume</span>
            <Fuel className="text-amber-500" size={18} />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {stats.totalFuelVolumeLtr.toFixed(1)} L
          </div>
          <p className="text-xs text-slate-500 mt-1">Combined fleet volume</p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Log Entries</span>
            <span className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              📋
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {stats.totalEntriesCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Logged by drivers</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search driver name, emp ID, or vehicle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Types (Fuel & DEF)</option>
              <option value="FUEL">Fuel ⛽</option>
              <option value="DEF">DEF 💧</option>
            </select>
          </div>

          {/* Vehicle Filter */}
          <div>
            <select
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} ({v.make || ''} {v.model || ''})
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              placeholder="Start Date"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* End Date */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              placeholder="End Date"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Driver Details</th>
                <th className="py-3.5 px-4">Vehicle</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Quantity (L)</th>
                <th className="py-3.5 px-4">Total Price</th>
                <th className="py-3.5 px-4">Rate / Litre</th>
                <th className="py-3.5 px-4">Odometer</th>
                <th className="py-3.5 px-4">Receipt Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-200">
              {logsRes.loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Loading fuel fill entries...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No fuel / DEF entries found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log: any) => {
                  const driverUser = log.driver?.user;
                  const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Driver';
                  const empId = driverUser?.employeeId ?? 'N/A';
                  const isFuel = log.type === 'FUEL';
                  const calculatedRate = log.ratePerLtr ?? (log.quantityLtr > 0 ? (log.totalPrice / log.quantityLtr).toFixed(2) : 0);

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">{driverName}</div>
                        <div className="text-xs text-slate-500">ID: {empId}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono font-medium text-slate-900 dark:text-white">
                        {log.vehicle?.plateNumber ?? 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isFuel
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              : 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                          }`}
                        >
                          {isFuel ? '⛽ Fuel' : '💧 DEF'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-slate-900 dark:text-white">
                        {log.quantityLtr} L
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                        ₹{log.totalPrice.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500">
                        ₹{calculatedRate} / L
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500">
                        {log.odometerKm ? `${log.odometerKm.toLocaleString()} KM` : '—'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {log.receiptUrl ? (
                          <button
                            onClick={() =>
                              setSelectedPhoto({
                                url: log.receiptUrl,
                                title: `${log.type} Receipt — ${log.vehicle?.plateNumber ?? ''} (${formatDateTime(log.createdAt)})`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
                          >
                            <ImageIcon size={14} />
                            View Bill
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">No Photo</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <Pagination
              meta={{ page, pageSize, total: totalItems, totalPages }}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              itemLabel="entry"
            />
          </div>
        )}
      </div>


      {/* Receipt Photo Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative max-w-3xl w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ImageIcon className="text-emerald-500" size={18} />
                {selectedPhoto.title}
              </h3>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh]">
              <img
                src={selectedPhoto.url}
                alt="Fuel receipt"
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 flex justify-end">
              <a
                href={selectedPhoto.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <ExternalLink size={14} />
                Open Original Image
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
