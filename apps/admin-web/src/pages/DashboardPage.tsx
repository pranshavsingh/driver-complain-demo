import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import type { ComplaintPublic, VehiclePublic } from '@driver-complaint/shared-types';
import { ClipboardList, AlertCircle, Clock, CheckCircle2, RotateCw, Search, X } from '../components/Icons';
import * as api from '../api/endpoints';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiResource } from '../hooks/useApiResource';
import { describeVehicle, formatDateTime } from '../lib/format';

type StatFilterMode = 'ALL' | 'NEW' | 'IN_PROGRESS' | 'RESOLVED';

export function DashboardPage(): ReactElement {
  const [selectedStat, setSelectedStat] = useState<StatFilterMode>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const complaintsResource = useApiResource('dashboard:complaints', () =>
    api.complaints.list(api.EMPTY_FILTER, 1, 100),
  );

  const vehiclesResource = useApiResource('dashboard:vehicles', () => api.vehicles.list());

  const complaintsList: ComplaintPublic[] = complaintsResource.data?.data ?? [];
  const vehicleList: VehiclePublic[] = vehiclesResource.data ?? [];

  const vehicleMap = useMemo(() => {
    const map = new Map<string, VehiclePublic>();
    for (const v of vehicleList) {
      map.set(v.id, v);
    }
    return map;
  }, [vehicleList]);

  const totalCount = complaintsResource.data?.meta.total ?? complaintsList.length;
  const newCount = complaintsList.filter((c) => c.status === 'NEW').length;
  const inProgressCount = complaintsList.filter((c) => c.status === 'IN_PROGRESS').length;
  const resolvedCount = complaintsList.filter(
    (c) => c.status === 'RESOLVED' || c.status === 'CLOSED',
  ).length;

  const filteredComplaints = complaintsList.filter((item) => {
    if (selectedStat === 'NEW') {
      if (item.status !== 'NEW') return false;
    } else if (selectedStat === 'IN_PROGRESS') {
      if (item.status !== 'IN_PROGRESS') return false;
    } else if (selectedStat === 'RESOLVED') {
      if (item.status !== 'RESOLVED' && item.status !== 'CLOSED') return false;
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchNo = item.complaintNo.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      return matchTitle || matchNo || matchDesc;
    }

    return true;
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Executive Dashboard</h1>
          <p className="page-subtitle">Real-time overview of fleet complaints & maintenance status</p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            complaintsResource.reload();
            vehiclesResource.reload();
          }}
          disabled={complaintsResource.loading}
        >
          <RotateCw size={14} style={{ marginRight: 6 }} className={complaintsResource.loading ? 'spin' : ''} />
          {complaintsResource.loading ? 'Refreshing…' : 'Refresh Data'}
        </button>
      </div>

      <ErrorBanner error={complaintsResource.error} />

      {/* 4 Metric Stat Boxes with Professional Icons */}
      <div className="stat-cards-grid">
        <button
          type="button"
          className={`stat-card ${selectedStat === 'ALL' ? 'selected' : ''}`}
          onClick={() => setSelectedStat('ALL')}
        >
          <div className="stat-card-header">
            <span className="stat-card-title">Total Complaints</span>
            <ClipboardList size={22} color="#1d4ed8" />
          </div>
          <div className="stat-card-value">{totalCount}</div>
          <div className="stat-card-footer">Click to view all complaints</div>
        </button>

        <button
          type="button"
          className={`stat-card stat-info ${selectedStat === 'NEW' ? 'selected' : ''}`}
          onClick={() => setSelectedStat('NEW')}
        >
          <div className="stat-card-header">
            <span className="stat-card-title">New Complaints</span>
            <AlertCircle size={22} color="#0284c7" />
          </div>
          <div className="stat-card-value">{newCount}</div>
          <div className="stat-card-footer">Click to view new complaints</div>
        </button>

        <button
          type="button"
          className={`stat-card stat-warning ${selectedStat === 'IN_PROGRESS' ? 'selected' : ''}`}
          onClick={() => setSelectedStat('IN_PROGRESS')}
        >
          <div className="stat-card-header">
            <span className="stat-card-title">Total In Process Complaints</span>
            <Clock size={22} color="#d97706" />
          </div>
          <div className="stat-card-value">{inProgressCount}</div>
          <div className="stat-card-footer">Click to view in process complaints</div>
        </button>

        <button
          type="button"
          className={`stat-card stat-success ${selectedStat === 'RESOLVED' ? 'selected' : ''}`}
          onClick={() => setSelectedStat('RESOLVED')}
        >
          <div className="stat-card-header">
            <span className="stat-card-title">Total Resolved Complaints</span>
            <CheckCircle2 size={22} color="#16a34a" />
          </div>
          <div className="stat-card-value">{resolvedCount}</div>
          <div className="stat-card-footer">Click to view resolved / closed complaints</div>
        </button>
      </div>

      {/* Filtered Complaints Table Section */}
      <div className="table-card">
        <div className="table-card-header">
          <div>
            <h2 className="table-card-title">
              {selectedStat === 'ALL'
                ? 'All Complaints'
                : selectedStat === 'NEW'
                  ? 'New Complaints'
                  : selectedStat === 'IN_PROGRESS'
                    ? 'In Process Complaints'
                    : 'Resolved Complaints'}
              <span className="badge-pill">{filteredComplaints.length}</span>
            </h2>
          </div>

          <div className="table-search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by complaint no, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <button type="button" className="clear-search" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {complaintsResource.loading && complaintsList.length === 0 ? (
          <div className="loading-state">Loading dashboard data…</div>
        ) : filteredComplaints.length === 0 ? (
          <div className="empty-table-state">
            <p>No complaints match the selected box filter.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Complaint</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Vehicle</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.map((item) => {
                  const vehicleObj = item.vehicleId ? vehicleMap.get(item.vehicleId) : null;
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/complaints/${item.id}`} className="complaint-no">
                          {item.complaintNo}
                        </Link>
                      </td>
                      <td>
                        <div className="title-cell" title={item.description}>
                          {item.title}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td>
                        {vehicleObj ? (
                          <span className="vehicle-badge">{describeVehicle(vehicleObj)}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>
                        <Link to={`/complaints/${item.id}`} className="btn-view">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
