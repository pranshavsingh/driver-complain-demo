import { useState, type ReactElement } from 'react';
import type {
  SparePartRequestPublic,
  WarehousePublic,
  SparePartRequestStatus,
  SparePartType,
} from '@driver-complaint/shared-types';
import {
  Package,
  Warehouse as WarehouseIcon,
  RotateCw,
  Search,
  X,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Volume2,
  UserCheck,
  UserX,
  Wrench,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiResource } from '../hooks/useApiResource';

export function SparePartsPage(): ReactElement {
  const { user: currentUser } = useAuth();
  const isSuper = isSuperAdmin(currentUser);

  const [activeTab, setActiveTab] = useState<'requests' | 'warehouses'>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');

  // Modals state
  const [viewingRequest, setViewingRequest] = useState<SparePartRequestPublic | null>(null);
  const [issuingRequest, setIssuingRequest] = useState<SparePartRequestPublic | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<SparePartRequestPublic | null>(null);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehousePublic | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Issue Form State
  const [issueWarehouseId, setIssueWarehouseId] = useState('');
  const [issueType, setIssueType] = useState<SparePartType>('NEW');
  const [issuePartName, setIssuePartName] = useState('');
  const [issuePartNo, setIssuePartNo] = useState('');
  const [issueQty, setIssueQty] = useState(1);
  const [issueReturnedPartNo, setIssueReturnedPartNo] = useState('');
  const [issueReturnedCondition, setIssueReturnedCondition] = useState('');
  const [issueNotes, setIssueNotes] = useState('');

  // Reject Form State
  const [rejectionReason, setRejectionReason] = useState('');

  // Warehouse Form State
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whLocation, setWhLocation] = useState('');
  const [whContactPerson, setWhContactPerson] = useState('');
  const [whContactPhone, setWhContactPhone] = useState('');
  const [whIsActive, setWhIsActive] = useState(true);

  // Data resources
  const requestsResource = useApiResource('spare-parts:list', () =>
    api.spareParts.list({ limit: 100 }),
  );
  const warehousesResource = useApiResource('warehouses:list', () =>
    api.warehouses.list(true),
  );
  const statsResource = useApiResource('spare-parts:stats', () =>
    api.spareParts.stats(),
  );

  const requests: SparePartRequestPublic[] = requestsResource.data?.data ?? [];
  const warehousesList: WarehousePublic[] = warehousesResource.data ?? [];
  const stats = statsResource.data;

  // Filtered requests
  const filteredRequests = requests.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
    if (warehouseFilter !== 'ALL' && r.warehouseId !== warehouseFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const reqNoMatch = r.requestNo.toLowerCase().includes(q);
    const partMatch = (r.partName || '').toLowerCase().includes(q);
    const descMatch = (r.description || '').toLowerCase().includes(q);
    const plateMatch = (r.vehicle?.plateNumber || '').toLowerCase().includes(q);
    const driverMatch = r.driver?.user
      ? `${r.driver.user.firstName} ${r.driver.user.lastName} ${r.driver.user.employeeId}`.toLowerCase().includes(q)
      : false;
    const issuedPartMatch = (r.issuedPartName || '').toLowerCase().includes(q);
    const issuedPartNoMatch = (r.issuedPartNo || '').toLowerCase().includes(q);

    return reqNoMatch || partMatch || descMatch || plateMatch || driverMatch || issuedPartMatch || issuedPartNoMatch;
  });

  const handleOpenIssue = (req: SparePartRequestPublic): void => {
    setIssuingRequest(req);
    setIssueType(req.type || 'NEW');
    setIssuePartName(req.partName || '');
    setIssuePartNo('');
    setIssueQty(req.quantity || 1);
    setIssueWarehouseId(warehousesList.find((w) => w.isActive)?.id || '');
    setIssueReturnedPartNo('');
    setIssueReturnedCondition('Worn / Replaced');
    setIssueNotes('');
    setActionError(null);
  };

  const handleOpenReject = (req: SparePartRequestPublic): void => {
    setRejectingRequest(req);
    setRejectionReason('');
    setActionError(null);
  };

  const handleOpenAddWarehouse = (): void => {
    setEditingWarehouse(null);
    setWhName('');
    setWhCode('');
    setWhLocation('');
    setWhContactPerson('');
    setWhContactPhone('');
    setWhIsActive(true);
    setActionError(null);
    setShowWarehouseModal(true);
  };

  const handleOpenEditWarehouse = (wh: WarehousePublic): void => {
    setEditingWarehouse(wh);
    setWhName(wh.name);
    setWhCode(wh.code || '');
    setWhLocation(wh.location || '');
    setWhContactPerson(wh.contactPerson || '');
    setWhContactPhone(wh.contactPhone || '');
    setWhIsActive(wh.isActive);
    setActionError(null);
    setShowWarehouseModal(true);
  };

  const handleIssueSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!issuingRequest) return;
    if (!issueWarehouseId) {
      setActionError('Please select a warehouse');
      return;
    }
    if (!issuePartName.trim() || !issuePartNo.trim()) {
      setActionError('Please enter the issued part name and serial/part number');
      return;
    }

    const parsedQty = parseInt(String(issueQty), 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setActionError('Issued quantity must be a positive integer (at least 1)');
      return;
    }

    if (!window.confirm(`Are you sure you want to approve and issue "${issuePartName.trim()}" (${parsedQty} unit(s)) for this vehicle?`)) {
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      await api.spareParts.approveAndIssue(issuingRequest.id, {
        warehouseId: issueWarehouseId,
        type: issueType,
        issuedPartName: issuePartName.trim(),
        issuedPartNo: issuePartNo.trim(),
        issuedQty: parsedQty,
        returnedPartNo: issueType === 'EXCHANGE' ? issueReturnedPartNo.trim() : undefined,
        returnedPartCondition: issueType === 'EXCHANGE' ? issueReturnedCondition.trim() : undefined,
        adminNotes: issueNotes.trim() || undefined,
      });

      setIssuingRequest(null);
      void requestsResource.reload();
      void statsResource.reload();
      void warehousesResource.reload();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to issue spare part');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!rejectingRequest) return;
    if (!rejectionReason.trim()) {
      setActionError('Please provide a rejection reason');
      return;
    }

    if (!window.confirm('Are you sure you want to reject this spare part request?')) {
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      await api.spareParts.reject(rejectingRequest.id, {
        rejectionReason: rejectionReason.trim(),
      });

      setRejectingRequest(null);
      void requestsResource.reload();
      void statsResource.reload();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to reject spare part request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWarehouseSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!whName.trim()) {
      setActionError('Warehouse name is required');
      return;
    }

    if (whContactPhone.trim() && !/^[+0-9\s-]{7,20}$/.test(whContactPhone.trim())) {
      setActionError('Please enter a valid contact phone number');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      if (editingWarehouse) {
        await api.warehouses.update(editingWarehouse.id, {
          name: whName.trim(),
          code: whCode.trim() || undefined,
          location: whLocation.trim() || undefined,
          contactPerson: whContactPerson.trim() || undefined,
          contactPhone: whContactPhone.trim() || undefined,
          isActive: whIsActive,
        });
      } else {
        await api.warehouses.create({
          name: whName.trim(),
          code: whCode.trim() || undefined,
          location: whLocation.trim() || undefined,
          contactPerson: whContactPerson.trim() || undefined,
          contactPhone: whContactPhone.trim() || undefined,
          isActive: whIsActive,
        });
      }

      setShowWarehouseModal(false);
      void warehousesResource.reload();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save warehouse');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleWarehouseStatus = async (wh: WarehousePublic): Promise<void> => {
    try {
      await api.warehouses.update(wh.id, { isActive: !wh.isActive });
      void warehousesResource.reload();
    } catch (err: any) {
      alert(err?.message || 'Failed to update warehouse status');
    }
  };

  const handleDeleteWarehouse = async (wh: WarehousePublic): Promise<void> => {
    if (!window.confirm(`Are you sure you want to delete or deactivate warehouse "${wh.name}"?`)) {
      return;
    }
    try {
      await api.warehouses.delete(wh.id);
      void warehousesResource.reload();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete warehouse');
    }
  };

  const handleExportExcel = async (): Promise<void> => {
    try {
      setExporting(true);
      await api.spareParts.exportXlsx(
        {
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          warehouseId: warehouseFilter !== 'ALL' ? warehouseFilter : undefined,
          search: searchQuery.trim() || undefined,
        },
        `spare-parts-requisitions-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err: any) {
      alert(err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: SparePartRequestStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return <span className="badge badge-warning">Pending Approval</span>;
      case 'APPROVED':
        return <span className="badge badge-info">Approved</span>;
      case 'ISSUED':
        return <span className="badge badge-success">Issued</span>;
      case 'REJECTED':
        return <span className="badge badge-danger">Rejected</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const getTypeBadge = (type: SparePartType) => {
    switch (type) {
      case 'NEW':
        return <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>New Part</span>;
      case 'EXCHANGE':
        return <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>Exchange (Old Returned)</span>;
      case 'REPAIR':
        return <span className="badge" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce' }}>Repair</span>;
      default:
        return <span className="badge">{type}</span>;
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={26} color="#3b82f6" />
            Spare Parts & Inventory Requisition
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
            Manage driver spare part requests, warehouse issue tracking, exchanges, and inventory audit logs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void requestsResource.reload();
              void warehousesResource.reload();
              void statsResource.reload();
            }}
            disabled={requestsResource.loading}
            title="Refresh records"
          >
            <RotateCw size={16} className={requestsResource.loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          {activeTab === 'requests' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportExcel}
              disabled={exporting || requests.length === 0}
              title="Download Excel Spreadsheet"
            >
              <FileSpreadsheet size={16} color="#16a34a" />
              <span>{exporting ? 'Exporting…' : 'Export Excel'}</span>
            </button>
          ) : (
            isSuper && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenAddWarehouse}
              >
                <Plus size={16} />
                <span>Add Warehouse</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid-summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 18, borderLeft: '4px solid #eab308' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Pending SuperAdmin Approval</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#eab308', marginTop: 4 }}>
            {stats?.totalPending ?? requests.filter((r) => r.status === 'PENDING_APPROVAL').length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>Awaiting warehouse issue</div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Issued & Completed</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
            {stats?.totalIssued ?? requests.filter((r) => r.status === 'ISSUED').length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>Successfully dispatched</div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #f97316' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Exchanges Tracked</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f97316', marginTop: 4 }}>
            {requests.filter((r) => r.type === 'EXCHANGE' && r.status === 'ISSUED').length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>Old parts returned</div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Active Warehouses</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6', marginTop: 4 }}>
            {warehousesList.filter((w) => w.isActive).length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>Inventory storage hubs</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', marginBottom: 20, display: 'flex', gap: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: 15,
            borderBottom: activeTab === 'requests' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'requests' ? '#3b82f6' : 'var(--text-muted, #64748b)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Package size={18} />
          <span>Driver Requisitions ({filteredRequests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('warehouses')}
          style={{
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: 15,
            borderBottom: activeTab === 'warehouses' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'warehouses' ? '#3b82f6' : 'var(--text-muted, #64748b)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <WarehouseIcon size={18} />
          <span>Warehouse Directory ({warehousesList.length})</span>
        </button>
      </div>

      {/* Tab 1: Requests List */}
      {activeTab === 'requests' && (
        <div className="card" style={{ padding: 20 }}>
          {/* Filter Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 36 }}
                placeholder="Search request #, part name, driver, vehicle plate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ width: 180 }}>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="ISSUED">Issued</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div style={{ width: 170 }}>
              <select
                className="form-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="NEW">New Part</option>
                <option value="EXCHANGE">Exchange</option>
                <option value="REPAIR">Repair</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div style={{ width: 180 }}>
              <select
                className="form-select"
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
              >
                <option value="ALL">All Warehouses</option>
                {warehousesList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          {requestsResource.loading && !requestsResource.data ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading spare part requisitions…</div>
          ) : filteredRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <Package size={48} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <h3>No spare part requests found</h3>
              <p>When drivers request spare parts from their mobile app, they will appear here for review and issuance.</p>
            </div>
          ) : (
            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e2e8f0)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 14px' }}>Request No</th>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Driver</th>
                    <th style={{ padding: '12px 14px' }}>Vehicle</th>
                    <th style={{ padding: '12px 14px' }}>Part Requested</th>
                    <th style={{ padding: '12px 14px' }}>Type</th>
                    <th style={{ padding: '12px 14px' }}>Evidence</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px' }}>Issued Details</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => {
                    const driverUser = req.driver?.user;
                    return (
                      <tr key={req.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                          <span style={{ color: '#2563eb' }}>{req.requestNo}</span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Driver'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            ID: {driverUser?.employeeId ?? 'N/A'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#334155', fontWeight: 600 }}>
                            {req.vehicle?.plateNumber ?? 'N/A'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{req.partName || 'Spare Part'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {req.description}
                          </div>
                          <div style={{ fontSize: 12, color: '#3b82f6' }}>Qty: {req.quantity}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>{getTypeBadge(req.type)}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {req.photoUrl ? (
                              <a
                                href={req.photoUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="View Photo"
                                style={{ display: 'inline-block' }}
                              >
                                <img
                                  src={req.photoUrl}
                                  alt="Part proof"
                                  style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid #cbd5e1' }}
                                />
                              </a>
                            ) : null}
                            {req.voiceUrl ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => setViewingRequest(req)}
                                title="Play voice recording"
                                style={{ padding: '4px 8px' }}
                              >
                                <Volume2 size={14} color="#7c3aed" />
                              </button>
                            ) : null}
                            {!req.photoUrl && !req.voiceUrl && (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Text only</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>{getStatusBadge(req.status)}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {req.status === 'ISSUED' ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>
                                {req.issuedPartName} (Qty: {req.issuedQty})
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                S/N: {req.issuedPartNo} • {req.warehouse?.name}
                              </div>
                              {req.returnedPartNo ? (
                                <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                                  Returned: {req.returnedPartNo} ({req.returnedPartCondition || 'Returned'})
                                </div>
                              ) : null}
                            </div>
                          ) : req.status === 'REJECTED' ? (
                            <div style={{ fontSize: 12, color: '#dc2626' }}>
                              Reason: {req.rejectionReason}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Awaiting issue</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => setViewingRequest(req)}
                              title="View Full Details"
                            >
                              Details
                            </button>

                            {isSuper && req.status === 'PENDING_APPROVAL' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleOpenIssue(req)}
                                  title="Approve & Issue Item"
                                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                                >
                                  <UserCheck size={14} />
                                  <span>Issue</span>
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => handleOpenReject(req)}
                                  title="Reject Request"
                                  style={{ color: '#dc2626' }}
                                >
                                  <UserX size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Warehouses CRUD */}
      {activeTab === 'warehouses' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <WarehouseIcon size={20} color="#3b82f6" />
              Warehouse Locations & Depots
            </h3>
            {isSuper && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenAddWarehouse}
              >
                <Plus size={16} />
                <span>Add Warehouse</span>
              </button>
            )}
          </div>

          {warehousesResource.loading && !warehousesResource.data ? (
            <div style={{ textAlign: 'center', padding: 40 }}>Loading warehouses…</div>
          ) : warehousesList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <WarehouseIcon size={40} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <h4>No warehouses defined</h4>
              <p>Add your company's warehouses and depots to issue spare parts to vehicles.</p>
              {isSuper && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleOpenAddWarehouse}
                  style={{ marginTop: 12 }}
                >
                  <Plus size={16} /> Add First Warehouse
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e2e8f0)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 14px' }}>Warehouse Name</th>
                    <th style={{ padding: '12px 14px' }}>Code</th>
                    <th style={{ padding: '12px 14px' }}>Location / Address</th>
                    <th style={{ padding: '12px 14px' }}>Contact Person</th>
                    <th style={{ padding: '12px 14px' }}>Phone</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px' }}>Issued Parts</th>
                    {isSuper && <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {warehousesList.map((wh) => (
                    <tr key={wh.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{wh.name}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                          {wh.code || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{wh.location || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>{wh.contactPerson || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>{wh.contactPhone || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {wh.isActive ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-danger">Inactive</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 600 }}>{wh._count?.issuedParts ?? 0}</span> items
                      </td>
                      {isSuper && (
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleOpenEditWarehouse(wh)}
                              title="Edit Warehouse"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleToggleWarehouseStatus(wh)}
                              title={wh.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {wh.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleDeleteWarehouse(wh)}
                              title="Delete Warehouse"
                              style={{ color: '#dc2626' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {viewingRequest && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="modal-content card" style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
                <Package size={20} color="#3b82f6" />
                Requisition #{viewingRequest.requestNo}
              </h2>
              <button type="button" className="btn-close" onClick={() => setViewingRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {getStatusBadge(viewingRequest.status)}
              {getTypeBadge(viewingRequest.type)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, background: 'var(--bg-muted, #f8fafc)', padding: 12, borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Driver</div>
                <div style={{ fontWeight: 600 }}>
                  {viewingRequest.driver?.user ? `${viewingRequest.driver.user.firstName} ${viewingRequest.driver.user.lastName}` : 'Driver'}
                </div>
                <div style={{ fontSize: 12 }}>Emp ID: {viewingRequest.driver?.user?.employeeId}</div>
                {viewingRequest.driver?.user?.phone && (
                  <div style={{ fontSize: 12, color: '#3b82f6' }}>Phone: {viewingRequest.driver.user.phone}</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vehicle</div>
                <div style={{ fontWeight: 600 }}>Plate: {viewingRequest.vehicle?.plateNumber}</div>
                <div style={{ fontSize: 12 }}>
                  Model: {viewingRequest.vehicle?.make} {viewingRequest.vehicle?.model || ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date: {new Date(viewingRequest.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Part Description & Notes</div>
              <div style={{ padding: 12, backgroundColor: 'var(--bg-muted, #f8fafc)', borderRadius: 8, fontSize: 14 }}>
                {viewingRequest.description}
              </div>
              {viewingRequest.transcription && viewingRequest.transcription !== viewingRequest.description && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#7c3aed' }}>
                  <strong>Voice Note Transcription:</strong> {viewingRequest.transcription}
                </div>
              )}
            </div>

            {/* Voice player */}
            {viewingRequest.voiceUrl && (
              <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f3ff', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6d28d9', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Volume2 size={16} /> Driver Voice Note
                </div>
                <audio controls src={viewingRequest.voiceUrl} style={{ width: '100%' }} />
              </div>
            )}

            {/* Photo preview */}
            {viewingRequest.photoUrl && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Photo Evidence</div>
                <a href={viewingRequest.photoUrl} target="_blank" rel="noreferrer">
                  <img
                    src={viewingRequest.photoUrl}
                    alt="Proof"
                    style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'contain', border: '1px solid #e2e8f0' }}
                  />
                </a>
              </div>
            )}

            {/* Issuance Information if Issued */}
            {viewingRequest.status === 'ISSUED' && (
              <div style={{ padding: 16, backgroundColor: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px', color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={18} color="#16a34a" /> Issuance & Fulfillment Record
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div><strong>Issued Part:</strong> {viewingRequest.issuedPartName}</div>
                  <div><strong>Part / Serial No:</strong> {viewingRequest.issuedPartNo}</div>
                  <div><strong>Quantity Issued:</strong> {viewingRequest.issuedQty}</div>
                  <div><strong>Warehouse:</strong> {viewingRequest.warehouse?.name}</div>
                  {viewingRequest.returnedPartNo && (
                    <>
                      <div><strong>Returned Part No:</strong> {viewingRequest.returnedPartNo}</div>
                      <div><strong>Returned Condition:</strong> {viewingRequest.returnedPartCondition || 'N/A'}</div>
                    </>
                  )}
                  <div><strong>Issued By:</strong> {viewingRequest.approvedBy ? `${viewingRequest.approvedBy.firstName} ${viewingRequest.approvedBy.lastName}` : 'Admin'}</div>
                  <div><strong>Issued At:</strong> {viewingRequest.issuedAt ? new Date(viewingRequest.issuedAt).toLocaleString() : 'N/A'}</div>
                </div>
                {viewingRequest.adminNotes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#166534' }}>
                    <strong>Admin Remarks:</strong> {viewingRequest.adminNotes}
                  </div>
                )}
              </div>
            )}

            {viewingRequest.status === 'REJECTED' && (
              <div style={{ padding: 16, backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={18} color="#dc2626" /> Request Rejected
                </h4>
                <div style={{ fontSize: 13, color: '#991b1b' }}>
                  <strong>Rejection Reason:</strong> {viewingRequest.rejectionReason}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setViewingRequest(null)}>
                Close
              </button>
              {isSuper && viewingRequest.status === 'PENDING_APPROVAL' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const req = viewingRequest;
                    setViewingRequest(null);
                    handleOpenIssue(req);
                  }}
                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                >
                  Approve & Issue Item
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin Issue Modal */}
      {issuingRequest && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="modal-content card" style={{ maxWidth: 580, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={22} color="#16a34a" />
                Approve & Issue Part — #{issuingRequest.requestNo}
              </h2>
              <button type="button" className="btn-close" onClick={() => setIssuingRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {actionError && <ErrorBanner error={actionError} />}

            <form onSubmit={handleIssueSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Select Warehouse *</label>
                <select
                  className="form-select"
                  value={issueWarehouseId}
                  onChange={(e) => setIssueWarehouseId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Warehouse --</option>
                  {warehousesList.filter((w) => w.isActive).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.location ? `(${w.location})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Requisition Type *</label>
                  <select
                    className="form-select"
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as SparePartType)}
                  >
                    <option value="NEW">New Part</option>
                    <option value="EXCHANGE">Exchange (Old Part Returned)</option>
                    <option value="REPAIR">Repair / Overhaul</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Quantity Issued *</label>
                  <input
                    type="number"
                    min={1}
                    className="form-input"
                    value={issueQty}
                    onChange={(e) => setIssueQty(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Issued Part Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Front Brake Pad Set"
                    value={issuePartName}
                    onChange={(e) => setIssuePartName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Issued Part No / S.N. *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. BP-2026-X991"
                    value={issuePartNo}
                    onChange={(e) => setIssuePartNo(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Exchange Fields (if Exchange selected) */}
              {issueType === 'EXCHANGE' && (
                <div style={{ padding: 14, backgroundColor: '#fef3c7', borderRadius: 8, marginBottom: 14, border: '1px solid #fde68a' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#92400e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wrench size={16} /> Return / Exchange Tracking (Old Part Received)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Old Part Serial / Code</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Old part serial number"
                        value={issueReturnedPartNo}
                        onChange={(e) => setIssueReturnedPartNo(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Condition of Returned Item</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Worn, Broken, Repairable"
                        value={issueReturnedCondition}
                        onChange={(e) => setIssueReturnedCondition(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Admin Notes / Fulfillment Remarks</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Optional fulfillment notes..."
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIssuingRequest(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                >
                  {actionLoading ? 'Issuing…' : 'Confirm & Issue Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingRequest && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="modal-content card" style={{ maxWidth: 480, width: '100%', padding: 24, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#dc2626' }}>
                Reject Requisition #{rejectingRequest.requestNo}
              </h2>
              <button type="button" className="btn-close" onClick={() => setRejectingRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {actionError && <ErrorBanner error={actionError} />}

            <form onSubmit={handleRejectSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Reason for Rejection *</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="State clearly why this request cannot be fulfilled (the driver will receive this in their notification)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRejectingRequest(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                  style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                >
                  {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Warehouse Modal */}
      {showWarehouseModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="modal-content card" style={{ maxWidth: 500, width: '100%', padding: 24, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <WarehouseIcon size={20} color="#3b82f6" />
                {editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}
              </h2>
              <button type="button" className="btn-close" onClick={() => setShowWarehouseModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {actionError && <ErrorBanner error={actionError} />}

            <form onSubmit={handleWarehouseSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Warehouse Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Central Depot - Mumbai"
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Warehouse Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. WH-BOM-01"
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Status</label>
                  <select
                    className="form-select"
                    value={whIsActive ? 'ACTIVE' : 'INACTIVE'}
                    onChange={(e) => setWhIsActive(e.target.value === 'ACTIVE')}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Location / Address</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Sector 18, Vashi, Navi Mumbai"
                  value={whLocation}
                  onChange={(e) => setWhLocation(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Contact Person</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Ramesh Sharma"
                    value={whContactPerson}
                    onChange={(e) => setWhContactPerson(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Contact Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. +91 9876543210"
                    value={whContactPhone}
                    onChange={(e) => setWhContactPhone(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowWarehouseModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Saving…' : editingWarehouse ? 'Update Warehouse' : 'Create Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
