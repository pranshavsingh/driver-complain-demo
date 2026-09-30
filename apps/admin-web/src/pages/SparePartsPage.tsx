import { useState, useMemo, type ReactElement } from 'react';
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
  Volume2,
  UserX,
  Wrench,
  Clock,
  ShieldCheck,
  Download,
  ExternalLink,
  ImageIcon,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { useApiResource } from '../hooks/useApiResource';
import { formatDateTime } from '../lib/format';

export function SparePartsPage(): ReactElement {
  const { user: currentUser } = useAuth();
  const isSuper = isSuperAdmin(currentUser);
  const canPrepareIssue =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'EXECUTIVE';

  const [activeTab, setActiveTab] = useState<'requests' | 'warehouses'>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Universal Lightbox Photo Preview State
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
    date: string;
  } | null>(null);

  // Modals state
  const [viewingRequest, setViewingRequest] = useState<SparePartRequestPublic | null>(null);
  const [issuingRequest, setIssuingRequest] = useState<SparePartRequestPublic | null>(null);
  const [approvingRequest, setApprovingRequest] = useState<SparePartRequestPublic | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<SparePartRequestPublic | null>(null);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehousePublic | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Propose / Issue Form State
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
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
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

      return (
        reqNoMatch ||
        partMatch ||
        descMatch ||
        plateMatch ||
        driverMatch ||
        issuedPartMatch ||
        issuedPartNoMatch
      );
    });
  }, [requests, statusFilter, typeFilter, warehouseFilter, searchQuery]);

  const totalItems = filteredRequests.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, page, pageSize]);

  const hasActiveFilters =
    searchQuery !== '' || statusFilter !== 'ALL' || typeFilter !== 'ALL' || warehouseFilter !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setWarehouseFilter('ALL');
    setPage(1);
  };

  const handleOpenProposeIssue = (req: SparePartRequestPublic): void => {
    setIssuingRequest(req);
    setIssueType(req.type || 'NEW');
    setIssuePartName(req.issuedPartName || req.partName || '');
    setIssuePartNo(req.issuedPartNo || '');
    setIssueQty(req.issuedQty || req.quantity || 1);
    setIssueWarehouseId(req.warehouseId || warehousesList.find((w) => w.isActive)?.id || '');
    setIssueReturnedPartNo(req.returnedPartNo || '');
    setIssueReturnedCondition(req.returnedPartCondition || 'Worn / Replaced');
    setIssueNotes(req.adminNotes || '');
    setActionError(null);
  };

  const handleOpenApproveModal = (req: SparePartRequestPublic): void => {
    setApprovingRequest(req);
    setIssueType(req.type || 'NEW');
    setIssuePartName(req.issuedPartName || req.partName || 'Spare Part');
    setIssuePartNo(req.issuedPartNo || 'N/A');
    setIssueQty(req.issuedQty || req.quantity || 1);
    setIssueWarehouseId(req.warehouseId || warehousesList.find((w) => w.isActive)?.id || '');
    setIssueReturnedPartNo(req.returnedPartNo || '');
    setIssueReturnedCondition(req.returnedPartCondition || '');
    setIssueNotes(req.adminNotes || '');
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

  // Executive / Admin proposes issue (status -> ISSUE_PENDING_APPROVAL)
  const handleProposeSubmit = async (e: React.FormEvent): Promise<void> => {
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
      setActionError('Quantity must be at least 1');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      if (isSuper) {
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
      } else {
        await api.spareParts.proposeIssue(issuingRequest.id, {
          warehouseId: issueWarehouseId,
          type: issueType,
          issuedPartName: issuePartName.trim(),
          issuedPartNo: issuePartNo.trim(),
          issuedQty: parsedQty,
          returnedPartNo: issueType === 'EXCHANGE' ? issueReturnedPartNo.trim() : undefined,
          returnedPartCondition: issueType === 'EXCHANGE' ? issueReturnedCondition.trim() : undefined,
          adminNotes: issueNotes.trim() || undefined,
        });
      }

      setIssuingRequest(null);
      void requestsResource.reload();
      void statsResource.reload();
      void warehousesResource.reload();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to submit issue proposal');
    } finally {
      setActionLoading(false);
    }
  };

  // SuperAdmin approves proposed issue (status -> ISSUED)
  const handleSuperAdminApprove = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!approvingRequest) return;
    if (!issueWarehouseId) {
      setActionError('Please select a warehouse');
      return;
    }
    if (!issuePartName.trim()) {
      setActionError('Please enter the part name');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      await api.spareParts.approveAndIssue(approvingRequest.id, {
        warehouseId: issueWarehouseId,
        type: issueType,
        issuedPartName: issuePartName.trim(),
        issuedPartNo: issuePartNo.trim() || undefined,
        issuedQty: issueQty,
        returnedPartNo: issueType === 'EXCHANGE' ? issueReturnedPartNo.trim() : undefined,
        returnedPartCondition: issueType === 'EXCHANGE' ? issueReturnedCondition.trim() : undefined,
        adminNotes: issueNotes.trim() || undefined,
      });

      setApprovingRequest(null);
      void requestsResource.reload();
      void statsResource.reload();
      void warehousesResource.reload();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to approve and issue spare part');
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
    if (!window.confirm(`Are you sure you want to delete warehouse "${wh.name}"?`)) {
      return;
    }
    try {
      await api.warehouses.delete(wh.id);
      void warehousesResource.reload();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete warehouse');
    }
  };

  const handleExportCsv = (): void => {
    if (requests.length === 0) return;
    setExporting(true);
    try {
      const headers = [
        'Request No',
        'Created Date',
        'Vehicle Plate',
        'Driver Name',
        'Driver Employee ID',
        'Driver Phone',
        'Requisition Type',
        'Status',
        'Driver Description',
        'Issued Part Name',
        'Issued Part No',
        'Issued Qty',
        'Warehouse',
        'Returned Part No',
        'Returned Part Condition',
        'Prepared By',
        'Approved By',
        'Issued At',
        'Notes',
      ];

      const rows = filteredRequests.map((r) => [
        r.requestNo,
        new Date(r.createdAt).toISOString(),
        r.vehicle?.plateNumber ?? '',
        r.driver?.user ? `${r.driver.user.firstName} ${r.driver.user.lastName}` : '',
        r.driver?.user?.employeeId ?? '',
        r.driver?.user?.phone ?? '',
        r.type ?? '',
        r.status,
        (r.description ?? '').replace(/"/g, '""'),
        (r.issuedPartName ?? r.partName ?? '').replace(/"/g, '""'),
        r.issuedPartNo ?? '',
        r.issuedQty ?? r.quantity ?? '',
        r.warehouse?.name ?? '',
        r.returnedPartNo ?? '',
        r.returnedPartCondition ?? '',
        r.issueProposedBy ? `${r.issueProposedBy.firstName} ${r.issueProposedBy.lastName}` : '',
        r.approvedBy ? `${r.approvedBy.firstName} ${r.approvedBy.lastName}` : '',
        r.issuedAt ? new Date(r.issuedAt).toISOString() : '',
        (r.adminNotes ?? '').replace(/"/g, '""'),
      ]);

      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers.join(','), ...rows.map((row) => row.map((val) => `"${val}"`).join(','))].join('\n');

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `spare-part-requisitions-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: SparePartRequestStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: 'var(--warning-bg)',
              color: 'var(--warning-text)',
              border: '1px solid var(--warning-border)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--warning-border)' }} />
            Pending Review
          </span>
        );
      case 'ISSUE_PENDING_APPROVAL':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: 'rgba(249, 115, 22, 0.12)',
              color: '#ea580c',
              border: '1px solid rgba(249, 115, 22, 0.35)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ea580c' }} />
            Issue Pending SuperAdmin
          </span>
        );
      case 'ISSUED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: 'var(--success-bg)',
              color: 'var(--success-text)',
              border: '1px solid var(--success-border)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success-border)' }} />
            Issued & Fulfilled
          </span>
        );
      case 'REJECTED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger-text)',
              border: '1px solid var(--danger-border)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--danger-border)' }} />
            Rejected
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const getTypeBadge = (type: SparePartType) => {
    switch (type) {
      case 'NEW':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: 'var(--accent)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}
          >
            New Part
          </span>
        );
      case 'EXCHANGE':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: 'rgba(234, 179, 8, 0.12)',
              color: 'var(--warning-text)',
              border: '1px solid var(--warning-border)',
            }}
          >
            Exchange
          </span>
        );
      case 'REPAIR':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: 'rgba(168, 85, 247, 0.12)',
              color: '#9333ea',
              border: '1px solid rgba(168, 85, 247, 0.3)',
            }}
          >
            Repair
          </span>
        );
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: 'var(--bg)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
            }}
          >
            {type}
          </span>
        );
    }
  };

  const pendingCount = stats?.totalPending ?? requests.filter((r) => r.status === 'PENDING_APPROVAL').length;
  const issuePendingCount = stats?.totalIssuePending ?? requests.filter((r) => r.status === 'ISSUE_PENDING_APPROVAL').length;
  const issuedCount = stats?.totalIssued ?? requests.filter((r) => r.status === 'ISSUED').length;
  const activeWarehousesCount = warehousesList.filter((w) => w.isActive).length;

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={26} color="var(--accent)" /> Spare Parts & Inventory Requisition
          </h1>
          <p className="page-subtitle">
            Review driver voice notes & photos, assign requisition types, issue warehouse parts, and manage SuperAdmin sign-offs.
          </p>
        </div>

        <div className="header-action-group">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              void requestsResource.reload();
              void warehousesResource.reload();
              void statsResource.reload();
            }}
            disabled={requestsResource.loading}
            title="Refresh records"
          >
            <RotateCw size={14} style={{ marginRight: 6 }} className={requestsResource.loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {activeTab === 'requests' && currentUser?.role !== 'EXECUTIVE' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleExportCsv}
              disabled={exporting || requests.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={15} />
              <span>{exporting ? 'Exporting…' : 'Export Excel'}</span>
            </button>
          ) : activeTab === 'warehouses' && isSuper ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenAddWarehouse}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} />
              <span>Add Warehouse</span>
            </button>
          ) : null}
        </div>
      </div>

      <ErrorBanner error={requestsResource.error || warehousesResource.error} />

      {/* KPI Summary Cards Grid (Interactive Status Selectors) */}
      <div className="stat-cards-grid">
        <div
          className={`stat-card stat-warning ${statusFilter === 'PENDING_APPROVAL' ? 'selected' : ''}`}
          onClick={() => {
            setActiveTab('requests');
            setStatusFilter((prev) => (prev === 'PENDING_APPROVAL' ? 'ALL' : 'PENDING_APPROVAL'));
            setPage(1);
          }}
          title="Filter by Pending Review"
        >
          <div className="stat-card-header">
            <span className="stat-card-title">Driver Requests (Pending Review)</span>
            <Clock size={20} color="var(--warning-border)" />
          </div>
          <div className="stat-card-value">{pendingCount}</div>
          <div className="stat-card-footer">Awaiting Executive / Admin action</div>
        </div>

        <div
          className={`stat-card stat-info ${statusFilter === 'ISSUE_PENDING_APPROVAL' ? 'selected' : ''}`}
          onClick={() => {
            setActiveTab('requests');
            setStatusFilter((prev) => (prev === 'ISSUE_PENDING_APPROVAL' ? 'ALL' : 'ISSUE_PENDING_APPROVAL'));
            setPage(1);
          }}
          title="Filter by Issue Pending Approval"
        >
          <div className="stat-card-header">
            <span className="stat-card-title">Issue Pending SuperAdmin</span>
            <Wrench size={20} color="#0284c7" />
          </div>
          <div className="stat-card-value">{issuePendingCount}</div>
          <div className="stat-card-footer">Prepared by Executive/Admin</div>
        </div>

        <div
          className={`stat-card stat-success ${statusFilter === 'ISSUED' ? 'selected' : ''}`}
          onClick={() => {
            setActiveTab('requests');
            setStatusFilter((prev) => (prev === 'ISSUED' ? 'ALL' : 'ISSUED'));
            setPage(1);
          }}
          title="Filter by Issued & Fulfilled"
        >
          <div className="stat-card-header">
            <span className="stat-card-title">Issued & Fulfilled</span>
            <CheckCircle2 size={20} color="var(--success-border)" />
          </div>
          <div className="stat-card-value">{issuedCount}</div>
          <div className="stat-card-footer">Successfully approved & issued</div>
        </div>

        <div
          className={`stat-card ${activeTab === 'warehouses' ? 'selected' : ''}`}
          onClick={() => {
            setActiveTab('warehouses');
            setPage(1);
          }}
          title="View Warehouse Directory"
        >
          <div className="stat-card-header">
            <span className="stat-card-title">Active Warehouses</span>
            <WarehouseIcon size={20} color="var(--accent)" />
          </div>
          <div className="stat-card-value">{activeWarehousesCount}</div>
          <div className="stat-card-footer">Inventory storage hubs</div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          className={`btn-${activeTab === 'requests' ? 'primary' : 'secondary'}`}
          onClick={() => {
            setActiveTab('requests');
            setPage(1);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Package size={16} />
          <span>Spare Part Requisitions</span>
          <span
            style={{
              marginLeft: 4,
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor:
                activeTab === 'requests'
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'var(--bg)',
              color: activeTab === 'requests' ? '#ffffff' : 'var(--muted)',
            }}
          >
            {requests.length}
          </span>
        </button>

        <button
          type="button"
          className={`btn-${activeTab === 'warehouses' ? 'primary' : 'secondary'}`}
          onClick={() => {
            setActiveTab('warehouses');
            setPage(1);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <WarehouseIcon size={16} />
          <span>Warehouse Directory</span>
          <span
            style={{
              marginLeft: 4,
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor:
                activeTab === 'warehouses'
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'var(--bg)',
              color: activeTab === 'warehouses' ? '#ffffff' : 'var(--muted)',
            }}
          >
            {warehousesList.length}
          </span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: SPARE PART REQUISITIONS VIEW
         ========================================================================= */}
      {activeTab === 'requests' && (
        <>
          {/* Structured Filter Card (Matching Complaints & Maintenance Pages) */}
          <div className="filter-card">
            <div className="filter-grid">
              {/* Row 1 - Search */}
              <div className="filter-group filter-wide">
                <label htmlFor="spare-search" className="filter-label">
                  Search
                </label>
                <div className="filter-input-box">
                  <Search size={15} className="filter-icon" />
                  <input
                    id="spare-search"
                    className="filter-input"
                    placeholder="Search request #, part, driver, plate..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setPage(1);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                      }}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Status Filter */}
              <div className="filter-group">
                <label htmlFor="spare-status" className="filter-label">
                  Status
                </label>
                <select
                  id="spare-status"
                  className="filter-select"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING_APPROVAL">🟡 Pending Review</option>
                  <option value="ISSUE_PENDING_APPROVAL">🟠 Issue Pending Approval</option>
                  <option value="ISSUED">🟢 Issued & Fulfilled</option>
                  <option value="REJECTED">🔴 Rejected</option>
                </select>
              </div>

              {/* Requisition Type Filter */}
              <div className="filter-group">
                <label htmlFor="spare-type" className="filter-label">
                  Requisition Type
                </label>
                <select
                  id="spare-type"
                  className="filter-select"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Types</option>
                  <option value="NEW">New Part</option>
                  <option value="EXCHANGE">Exchange</option>
                  <option value="REPAIR">Repair</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Warehouse Filter */}
              <div className="filter-group">
                <label htmlFor="spare-warehouse" className="filter-label">
                  Warehouse
                </label>
                <select
                  id="spare-warehouse"
                  className="filter-select"
                  value={warehouseFilter}
                  onChange={(e) => {
                    setWarehouseFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Warehouses</option>
                  {warehousesList.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.location ? `(${w.location})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Filters Action Button */}
              {hasActiveFilters ? (
                <div className="filter-group filter-action-btn-group" style={{ gridColumn: 'span 3' }}>
                  <button
                    type="button"
                    className="btn-clear-filters"
                    onClick={handleClearFilters}
                  >
                    Clear all filters
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Table Card Panel */}
          <div className="table-card">
            <div className="table-card-header">
              <h3 className="table-card-title">
                <Package size={18} color="var(--accent)" /> Requisition Master
                <span className="badge-pill">{totalItems} Records</span>
              </h3>
            </div>

            {requestsResource.loading && requests.length === 0 ? (
              <div className="notif-empty-state" style={{ padding: 48 }}>
                <RotateCw size={28} className="spin" color="var(--accent)" />
                <p style={{ marginTop: 8 }}>Loading spare part requisitions…</p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="notif-empty-state" style={{ padding: 48 }}>
                <Package size={36} color="var(--muted)" />
                <h3 style={{ margin: '8px 0 4px', color: 'var(--text)' }}>No spare part requests found</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, maxWidth: 440 }}>
                  {hasActiveFilters
                    ? 'No requisitions match your active search and filter criteria.'
                    : 'When drivers submit voice notes & photos from mobile, they will appear here for Executive/Admin issue preparation and SuperAdmin approval.'}
                </p>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleClearFilters}
                    style={{ marginTop: 14 }}
                  >
                    Clear all filters
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Request #</th>
                      <th>Date</th>
                      <th>Driver</th>
                      <th>Vehicle</th>
                      <th>Voice & Photo Proof</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Fulfillment Details</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequests.map((req) => {
                      const driverUser = req.driver?.user;
                      return (
                        <tr key={req.id}>
                          {/* Request # */}
                          <td>
                            <strong style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 13 }}>
                              {req.requestNo}
                            </strong>
                          </td>

                          {/* Date */}
                          <td style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {formatDateTime(req.createdAt)}
                          </td>

                          {/* Driver */}
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>
                              {driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Driver'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ID: {driverUser?.employeeId ?? 'N/A'}
                            </div>
                          </td>

                          {/* Vehicle */}
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                backgroundColor: 'var(--bg)',
                                color: 'var(--text)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {req.vehicle?.plateNumber ?? 'N/A'}
                            </span>
                          </td>

                          {/* Voice & Photo Proof */}
                          <td>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {req.voiceUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setViewingRequest(req)}
                                  title="Listen to Voice Note"
                                  style={{
                                    padding: '4px 8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                                    color: '#7c3aed',
                                    border: '1px solid rgba(124, 58, 237, 0.25)',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  <Volume2 size={13} />
                                  <span>Voice Note</span>
                                </button>
                              ) : null}

                              {req.photoUrl ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedPhoto({
                                      url: req.photoUrl!,
                                      title: `Photo Evidence #${req.requestNo}`,
                                      subtitle: `${req.vehicle?.plateNumber ?? 'Vehicle'} • ${driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Driver'}`,
                                      date: formatDateTime(req.createdAt),
                                    })
                                  }
                                  title="Click to view photo evidence"
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                  }}
                                >
                                  <img
                                    src={req.photoUrl}
                                    alt="Part proof"
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: 6,
                                      objectFit: 'cover',
                                      border: '1px solid var(--border)',
                                    }}
                                  />
                                </button>
                              ) : null}

                              {!req.photoUrl && !req.voiceUrl && (
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                  {req.description || 'No attachments'}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Requisition Type */}
                          <td>{getTypeBadge(req.type)}</td>

                          {/* Status */}
                          <td>{getStatusBadge(req.status)}</td>

                          {/* Fulfillment Info */}
                          <td>
                            {req.status === 'ISSUED' ? (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success-text)' }}>
                                  {req.issuedPartName} (Qty: {req.issuedQty})
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                  S/N: {req.issuedPartNo || 'N/A'} • {req.warehouse?.name}
                                </div>
                                {req.returnedPartNo ? (
                                  <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                                    Returned: {req.returnedPartNo}
                                  </div>
                                ) : null}
                              </div>
                            ) : req.status === 'ISSUE_PENDING_APPROVAL' ? (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#ea580c' }}>
                                  Prepared: {req.issuedPartName} (Qty: {req.issuedQty})
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                  {req.warehouse?.name} • By: {req.issueProposedBy ? `${req.issueProposedBy.firstName}` : 'Admin'}
                                </div>
                              </div>
                            ) : req.status === 'REJECTED' ? (
                              <div style={{ fontSize: 11, color: 'var(--danger-text)' }}>
                                Reason: {req.rejectionReason}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--warning-text)', fontWeight: 600 }}>
                                Awaiting Executive / Admin action
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setViewingRequest(req)}
                                style={{ padding: '5px 10px', fontSize: 12 }}
                                title="View Full Details"
                              >
                                Details
                              </button>

                              {/* Executive/Admin Prepare Issue */}
                              {canPrepareIssue && req.status === 'PENDING_APPROVAL' && (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => handleOpenProposeIssue(req)}
                                  style={{ padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  title={isSuper ? 'Direct Stock Issue' : 'Prepare Issue for SuperAdmin'}
                                >
                                  <Wrench size={13} />
                                  <span>{isSuper ? 'Issue' : 'Prepare'}</span>
                                </button>
                              )}

                              {/* SuperAdmin Approve Proposed Issue */}
                              {isSuper && req.status === 'ISSUE_PENDING_APPROVAL' && (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => handleOpenApproveModal(req)}
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: 12,
                                    backgroundColor: 'var(--success-border)',
                                    borderColor: 'var(--success-border)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                  title="Authorize and release stock"
                                >
                                  <ShieldCheck size={14} />
                                  <span>Approve</span>
                                </button>
                              )}

                              {/* Reject */}
                              {(isSuper || canPrepareIssue) &&
                                (req.status === 'PENDING_APPROVAL' || req.status === 'ISSUE_PENDING_APPROVAL') && (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleOpenReject(req)}
                                    style={{ padding: '5px 8px', color: 'var(--danger-text)' }}
                                    title="Reject Request"
                                  >
                                    <UserX size={14} />
                                  </button>
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

            {/* Pagination Panel */}
            {totalPages > 1 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                <Pagination
                  meta={{
                    page,
                    pageSize,
                    total: totalItems,
                    totalPages,
                  }}
                  onPageChange={setPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* =========================================================================
          TAB 2: WAREHOUSE DIRECTORY VIEW
         ========================================================================= */}
      {activeTab === 'warehouses' && (
        <div className="table-card">
          <div className="table-card-header">
            <h3 className="table-card-title">
              <WarehouseIcon size={18} color="var(--accent)" /> Warehouse Directory
              <span className="badge-pill">{warehousesList.length} Hubs</span>
            </h3>

            {isSuper && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenAddWarehouse}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={15} /> Add Warehouse
              </button>
            )}
          </div>

          {warehousesResource.loading && warehousesList.length === 0 ? (
            <div className="notif-empty-state" style={{ padding: 48 }}>
              <RotateCw size={28} className="spin" color="var(--accent)" />
              <p style={{ marginTop: 8 }}>Loading warehouses…</p>
            </div>
          ) : warehousesList.length === 0 ? (
            <div className="notif-empty-state" style={{ padding: 48 }}>
              <WarehouseIcon size={36} color="var(--muted)" />
              <h3 style={{ margin: '8px 0 4px', color: 'var(--text)' }}>No warehouses registered</h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                Add warehouse depots to manage stock and issue spare parts.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Warehouse Name</th>
                    <th>Code</th>
                    <th>Location / Address</th>
                    <th>Contact Person</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Issued Items</th>
                    {isSuper && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {warehousesList.map((wh) => (
                    <tr key={wh.id}>
                      <td style={{ fontWeight: 700 }}>{wh.name}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            backgroundColor: 'var(--bg)',
                            color: 'var(--muted)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {wh.code || '—'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{wh.location || '—'}</td>
                      <td style={{ fontSize: 13 }}>{wh.contactPerson || '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--accent)' }}>{wh.contactPhone || '—'}</td>
                      <td>
                        {wh.isActive ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              backgroundColor: 'var(--success-bg)',
                              color: 'var(--success-text)',
                              border: '1px solid var(--success-border)',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success-border)' }} />
                            Active
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              backgroundColor: 'var(--danger-bg)',
                              color: 'var(--danger-text)',
                              border: '1px solid var(--danger-border)',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--danger-border)' }} />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {wh._count?.issuedParts ?? 0}
                      </td>
                      {isSuper && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleOpenEditWarehouse(wh)}
                              style={{ padding: '4px 8px' }}
                              title="Edit Warehouse"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleToggleWarehouseStatus(wh)}
                              style={{ padding: '4px 8px', fontSize: 11 }}
                            >
                              {wh.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleDeleteWarehouse(wh)}
                              style={{ padding: '4px 8px', color: 'var(--danger-text)' }}
                              title="Delete Warehouse"
                            >
                              <Trash2 size={13} />
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

      {/* =========================================================================
          MODALS & LIGHTBOX
         ========================================================================= */}

      {/* Universal Photo Lightbox Modal */}
      {selectedPhoto ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 20,
            backdropFilter: 'blur(6px)',
          }}
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            style={{
              maxWidth: 750,
              width: '100%',
              borderRadius: 12,
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--surface)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ImageIcon size={18} color="var(--accent)" />
                  {selectedPhoto.title}
                </h3>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {selectedPhoto.subtitle} • {selectedPhoto.date}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                padding: 20,
                textAlign: 'center',
                backgroundColor: '#090d16',
                maxHeight: '65vh',
                overflowY: 'auto',
              }}
            >
              <img
                src={selectedPhoto.url}
                alt="Document Preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '55vh',
                  borderRadius: 8,
                  objectFit: 'contain',
                }}
              />
            </div>

            <div
              style={{
                padding: '12px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
              }}
            >
              <a
                href={selectedPhoto.url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={14} /> Open Full Resolution
              </a>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setSelectedPhoto(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Requisition Details Modal */}
      {viewingRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              maxWidth: 620,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700 }}>
                <Package size={20} color="var(--accent)" />
                Requisition #{viewingRequest.requestNo}
              </h2>
              <button
                type="button"
                onClick={() => setViewingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {getStatusBadge(viewingRequest.status)}
              {getTypeBadge(viewingRequest.type)}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
                backgroundColor: 'var(--bg)',
                padding: 14,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Driver</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                  {viewingRequest.driver?.user ? `${viewingRequest.driver.user.firstName} ${viewingRequest.driver.user.lastName}` : 'Driver'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>ID: {viewingRequest.driver?.user?.employeeId}</div>
                {viewingRequest.driver?.user?.phone && (
                  <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>Phone: {viewingRequest.driver.user.phone}</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Vehicle</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{viewingRequest.vehicle?.plateNumber}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {viewingRequest.vehicle?.make} {viewingRequest.vehicle?.model || ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Date: {formatDateTime(viewingRequest.createdAt)}</div>
              </div>
            </div>

            {/* Voice player */}
            {viewingRequest.voiceUrl && (
              <div
                style={{
                  marginBottom: 16,
                  padding: 14,
                  backgroundColor: 'rgba(124, 58, 237, 0.08)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(124, 58, 237, 0.25)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Volume2 size={18} /> Driver Voice Recording
                </div>
                <audio controls src={viewingRequest.voiceUrl} style={{ width: '100%', height: 38 }} />
                {viewingRequest.transcription && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text)' }}>
                    <strong style={{ color: '#7c3aed' }}>Transcription:</strong> {viewingRequest.transcription}
                  </div>
                )}
              </div>
            )}

            {/* Photo preview */}
            {viewingRequest.photoUrl && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Photo Evidence
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPhoto({
                      url: viewingRequest.photoUrl!,
                      title: `Photo Evidence #${viewingRequest.requestNo}`,
                      subtitle: `${viewingRequest.vehicle?.plateNumber ?? 'Vehicle'} • ${viewingRequest.driver?.user?.firstName ?? 'Driver'}`,
                      date: formatDateTime(viewingRequest.createdAt),
                    })
                  }
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'inline-block',
                    position: 'relative',
                  }}
                >
                  <img
                    src={viewingRequest.photoUrl}
                    alt="Proof"
                    style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 'var(--radius)', objectFit: 'contain', border: '1px solid var(--border)' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      backgroundColor: 'rgba(0,0,0,0.75)',
                      color: '#ffffff',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <ExternalLink size={11} /> Click to Zoom
                  </span>
                </button>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Driver Description
              </div>
              <div
                style={{
                  padding: 12,
                  backgroundColor: 'var(--bg)',
                  borderRadius: 'var(--radius)',
                  fontSize: 13,
                  border: '1px solid var(--border)',
                }}
              >
                {viewingRequest.description || 'No additional note'}
              </div>
            </div>

            {/* Prepared Issue Block */}
            {viewingRequest.status === 'ISSUE_PENDING_APPROVAL' && (
              <div
                style={{
                  padding: 14,
                  backgroundColor: 'rgba(249, 115, 22, 0.08)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ea580c', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Clock size={16} /> Issue Prepared — Awaiting SuperAdmin Sign-Off
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  <div><strong>Proposed Part:</strong> {viewingRequest.issuedPartName}</div>
                  <div><strong>Part / Serial No:</strong> {viewingRequest.issuedPartNo}</div>
                  <div><strong>Quantity:</strong> {viewingRequest.issuedQty}</div>
                  <div><strong>Warehouse:</strong> {viewingRequest.warehouse?.name}</div>
                  <div><strong>Requisition Type:</strong> {viewingRequest.type}</div>
                  <div><strong>Prepared By:</strong> {viewingRequest.issueProposedBy ? `${viewingRequest.issueProposedBy.firstName}` : 'Admin'}</div>
                </div>
                {viewingRequest.adminNotes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                    <strong>Notes:</strong> {viewingRequest.adminNotes}
                  </div>
                )}
              </div>
            )}

            {/* Completed Issue Record */}
            {viewingRequest.status === 'ISSUED' && (
              <div
                style={{
                  padding: 14,
                  backgroundColor: 'var(--success-bg)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--success-border)',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <CheckCircle2 size={16} /> Issuance & Fulfillment Record
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  <div><strong>Issued Part:</strong> {viewingRequest.issuedPartName}</div>
                  <div><strong>Part / Serial No:</strong> {viewingRequest.issuedPartNo}</div>
                  <div><strong>Quantity:</strong> {viewingRequest.issuedQty}</div>
                  <div><strong>Warehouse:</strong> {viewingRequest.warehouse?.name}</div>
                  <div><strong>Requisition Type:</strong> {viewingRequest.type}</div>
                  {viewingRequest.returnedPartNo && (
                    <>
                      <div><strong>Returned Part No:</strong> {viewingRequest.returnedPartNo}</div>
                      <div><strong>Condition:</strong> {viewingRequest.returnedPartCondition || 'N/A'}</div>
                    </>
                  )}
                  <div><strong>Authorized By:</strong> {viewingRequest.approvedBy ? `${viewingRequest.approvedBy.firstName} ${viewingRequest.approvedBy.lastName}` : 'SuperAdmin'}</div>
                  <div><strong>Issued At:</strong> {viewingRequest.issuedAt ? formatDateTime(viewingRequest.issuedAt) : 'N/A'}</div>
                </div>
              </div>
            )}

            {viewingRequest.status === 'REJECTED' && (
              <div
                style={{
                  padding: 14,
                  backgroundColor: 'var(--danger-bg)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--danger-border)',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={16} /> Request Rejected
                </div>
                <div style={{ fontSize: 13, color: 'var(--danger-text)', marginTop: 4 }}>
                  <strong>Reason:</strong> {viewingRequest.rejectionReason}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn-secondary" onClick={() => setViewingRequest(null)}>
                Close
              </button>
              {canPrepareIssue && viewingRequest.status === 'PENDING_APPROVAL' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const req = viewingRequest;
                    setViewingRequest(null);
                    handleOpenProposeIssue(req);
                  }}
                >
                  {isSuper ? 'Direct Issue' : 'Prepare Issue'}
                </button>
              )}
              {isSuper && viewingRequest.status === 'ISSUE_PENDING_APPROVAL' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const req = viewingRequest;
                    setViewingRequest(null);
                    handleOpenApproveModal(req);
                  }}
                  style={{ backgroundColor: 'var(--success-border)', borderColor: 'var(--success-border)' }}
                >
                  Approve & Issue
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prepare Issue Modal */}
      {issuingRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wrench size={20} color="var(--accent)" />
                {isSuper ? 'Direct Stock Issue' : 'Prepare Requisition Issue'} — #{issuingRequest.requestNo}
              </h2>
              <button
                type="button"
                onClick={() => setIssuingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Evidence summary box */}
            <div
              style={{
                padding: 12,
                backgroundColor: 'var(--bg)',
                borderRadius: 'var(--radius)',
                marginBottom: 16,
                border: '1px solid var(--border)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Vehicle: <strong>{issuingRequest.vehicle?.plateNumber}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Driver: <strong>{issuingRequest.driver?.user?.firstName} {issuingRequest.driver?.user?.lastName}</strong>
                </div>
              </div>
              {issuingRequest.voiceUrl && (
                <audio controls src={issuingRequest.voiceUrl} style={{ width: 180, height: 32 }} />
              )}
            </div>

            {actionError && <ErrorBanner error={actionError} />}

            <form onSubmit={handleProposeSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Select Warehouse *</label>
                <select
                  className="filter-select"
                  style={{ width: '100%', height: 38 }}
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
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as SparePartType)}
                  >
                    <option value="NEW">New Part Issue</option>
                    <option value="EXCHANGE">Exchange (Old Part Return)</option>
                    <option value="REPAIR">Repair / Overhaul</option>
                    <option value="OTHER">Other / Consumable</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Quantity to Issue *</label>
                  <input
                    type="number"
                    min={1}
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    value={issueQty}
                    onChange={(e) => setIssueQty(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Part Name / Description *</label>
                  <input
                    type="text"
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    placeholder="e.g. Brake Pad Set"
                    value={issuePartName}
                    onChange={(e) => setIssuePartName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Part / Serial Number *</label>
                  <input
                    type="text"
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    placeholder="e.g. BP-2026-X991"
                    value={issuePartNo}
                    onChange={(e) => setIssuePartNo(e.target.value)}
                    required
                  />
                </div>
              </div>

              {issueType === 'EXCHANGE' && (
                <div
                  style={{
                    padding: 12,
                    backgroundColor: 'var(--warning-bg)',
                    borderRadius: 'var(--radius)',
                    marginBottom: 14,
                    border: '1px solid var(--warning-border)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--warning-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wrench size={14} /> Old Part Received Back
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Old Part Serial / Code</label>
                      <input
                        type="text"
                        className="filter-select"
                        style={{ width: '100%', height: 34 }}
                        placeholder="Old part serial"
                        value={issueReturnedPartNo}
                        onChange={(e) => setIssueReturnedPartNo(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Condition</label>
                      <input
                        type="text"
                        className="filter-select"
                        style={{ width: '100%', height: 34 }}
                        placeholder="e.g. Worn, Broken"
                        value={issueReturnedCondition}
                        onChange={(e) => setIssueReturnedCondition(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Admin Notes</label>
                <textarea
                  className="filter-select"
                  style={{ width: '100%', height: 60, padding: 8 }}
                  placeholder="Optional fulfillment remarks..."
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIssuingRequest(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                  style={isSuper ? { backgroundColor: 'var(--success-border)', borderColor: 'var(--success-border)' } : undefined}
                >
                  {actionLoading ? 'Saving…' : isSuper ? 'Confirm & Direct Issue' : 'Submit for SuperAdmin Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SuperAdmin Final Approval Modal */}
      {approvingRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success-text)' }}>
                <ShieldCheck size={20} color="var(--success-border)" />
                SuperAdmin Sign-Off: #{approvingRequest.requestNo}
              </h2>
              <button
                type="button"
                onClick={() => setApprovingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                padding: 12,
                backgroundColor: 'var(--success-bg)',
                borderRadius: 'var(--radius)',
                marginBottom: 16,
                border: '1px solid var(--success-border)',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--success-text)' }}>
                Prepared by: {approvingRequest.issueProposedBy ? `${approvingRequest.issueProposedBy.firstName} ${approvingRequest.issueProposedBy.lastName}` : 'Admin'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Vehicle: <strong>{approvingRequest.vehicle?.plateNumber}</strong> • Driver: <strong>{approvingRequest.driver?.user?.firstName}</strong>
              </div>
            </div>

            {actionError && <ErrorBanner error={actionError} />}

            <form onSubmit={handleSuperAdminApprove}>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Warehouse *</label>
                <select
                  className="filter-select"
                  style={{ width: '100%', height: 38 }}
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
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Requisition Type</label>
                  <select
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as SparePartType)}
                  >
                    <option value="NEW">New Part</option>
                    <option value="EXCHANGE">Exchange</option>
                    <option value="REPAIR">Repair</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Quantity</label>
                  <input
                    type="number"
                    min={1}
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    value={issueQty}
                    onChange={(e) => setIssueQty(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Part Name *</label>
                  <input
                    type="text"
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    value={issuePartName}
                    onChange={(e) => setIssuePartName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Part / Serial Number</label>
                  <input
                    type="text"
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    value={issuePartNo}
                    onChange={(e) => setIssuePartNo(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>SuperAdmin Authorization Notes</label>
                <textarea
                  className="filter-select"
                  style={{ width: '100%', height: 60, padding: 8 }}
                  placeholder="Approved for stock release..."
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setApprovingRequest(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                  style={{ backgroundColor: 'var(--success-border)', borderColor: 'var(--success-border)' }}
                >
                  {actionLoading ? 'Approving…' : 'Approve & Release Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              maxWidth: 460,
              width: '100%',
              padding: 24,
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--danger-text)' }}>
                Reject Requisition #{rejectingRequest.requestNo}
              </h2>
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {actionError && <ErrorBanner error={actionError} />}

            <form onSubmit={handleRejectSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Reason for Rejection *</label>
                <textarea
                  className="filter-select"
                  style={{ width: '100%', height: 80, padding: 8 }}
                  placeholder="State clearly why this request cannot be fulfilled..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setRejectingRequest(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                  style={{ backgroundColor: 'var(--danger-border)', borderColor: 'var(--danger-border)' }}
                >
                  {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Warehouse Modal */}
      {showWarehouseModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              padding: 24,
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <WarehouseIcon size={18} color="var(--accent)" />
                {editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}
              </h2>
              <button
                type="button"
                onClick={() => setShowWarehouseModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {actionError && <ErrorBanner error={actionError} />}

            <form onSubmit={handleWarehouseSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Warehouse Name *</label>
                <input
                  type="text"
                  className="filter-select"
                  style={{ width: '100%', height: 38 }}
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
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    placeholder="e.g. WH-BOM-01"
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Status</label>
                  <select
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
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
                  className="filter-select"
                  style={{ width: '100%', height: 38 }}
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
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    placeholder="e.g. Ramesh Sharma"
                    value={whContactPerson}
                    onChange={(e) => setWhContactPerson(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Contact Phone</label>
                  <input
                    type="text"
                    className="filter-select"
                    style={{ width: '100%', height: 38 }}
                    placeholder="e.g. +91 9876543210"
                    value={whContactPhone}
                    onChange={(e) => setWhContactPhone(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowWarehouseModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
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
