import { useMemo, useState, type ReactElement } from 'react';
import type { DriverListItem } from '@driver-complaint/shared-types';
import { Users, RotateCw, Search, X } from '../components/Icons';
import * as api from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { useApiResource } from '../hooks/useApiResource';

export function DriversPage(): ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const driversResource = useApiResource('drivers:list', () => api.drivers.list());
  const driversList: DriverListItem[] = driversResource.data ?? [];

  const filteredDrivers = useMemo(() => {
    return driversList.filter((d) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = `${d.firstName} ${d.lastName}`.toLowerCase().includes(q);
      const empMatch = d.employeeId.toLowerCase().includes(q);
      const dlMatch = d.licenseNumber.toLowerCase().includes(q);
      return nameMatch || empMatch || dlMatch;
    });
  }, [driversList, searchQuery]);

  const totalItems = filteredDrivers.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  const paginatedDrivers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredDrivers.slice(start, start + pageSize);
  }, [filteredDrivers, page, pageSize]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={24} color="#1d4ed8" /> Drivers Directory
          </h1>
          <p className="page-subtitle">Registered fleet drivers & license details</p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => driversResource.reload()}
          disabled={driversResource.loading}
        >
          <RotateCw size={14} style={{ marginRight: 6 }} className={driversResource.loading ? 'spin' : ''} />
          {driversResource.loading ? 'Refreshing…' : 'Refresh Drivers'}
        </button>
      </div>

      <ErrorBanner error={driversResource.error} />

      <div className="table-card">
        <div className="table-card-header">
          <div>
            <h2 className="table-card-title">
              Drivers List <span className="badge-pill">{totalItems}</span>
            </h2>
          </div>

          <div className="table-search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search driver by name, Emp ID, or DL..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
            {searchQuery ? (
              <button
                type="button"
                className="clear-search"
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {driversResource.loading && driversList.length === 0 ? (
          <div className="loading-state">Loading drivers directory…</div>
        ) : filteredDrivers.length === 0 ? (
          <div className="empty-table-state">
            <p>No drivers found matching your search.</p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Driver Name</th>
                    <th>Employee ID</th>
                    <th>Contact Number</th>
                    <th>Driving License (DL)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDrivers.map((driver) => (
                    <tr key={driver.id}>
                      <td>
                        <div className="driver-avatar-circle">
                          {driver.firstName[0]}
                          {driver.lastName[0]}
                        </div>
                      </td>
                      <td>
                        <div className="driver-name-cell">
                          {driver.firstName} {driver.lastName}
                        </div>
                      </td>
                      <td>
                        <span className="employee-id-badge">{driver.employeeId}</span>
                      </td>
                      <td>
                        <span className="contact-phone">+1 (555) 019-2834</span>
                      </td>
                      <td>
                        <span className="license-tag">{driver.licenseNumber || 'N/A'}</span>
                      </td>
                      <td>
                        <span className="status-chip-active">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={{ page, pageSize, total: totalItems, totalPages }}
              onPageChange={setPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              itemLabel="driver"
            />
          </>
        )}
      </div>
    </div>
  );
}
