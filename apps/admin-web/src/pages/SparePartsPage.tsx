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
  Trash2,
  CheckCircle2,
  Wrench,
  Clock,
  ShieldCheck,
  Download,
  ExternalLink,
  ImageIcon,
  Truck,
  User,
  Check,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { useApiResource } from '../hooks/useApiResource';
import { formatDateTime } from '../lib/format';

interface IssueProductItem {
  id: string;
  name: string;
  quantity: number | string;
  serialNumber: string;
}

export interface ReturnTrackingInfo {
  status: 'PENDING' | 'PARTIAL' | 'RETURNED' | 'NOT_APPLICABLE';
  totalItems: number;
  returnedItems: number;
  pendingItems: number;
  items: Array<{
    name: string;
    quantity: number;
    serialNumber: string;
    returned: boolean;
    returnedAt?: string | null;
  }>;
  returnDate: string | null;
}

export function getReturnStatus(req: SparePartRequestPublic): ReturnTrackingInfo {
  if (req.issuedItems && req.issuedItems.length > 0) {
    const items = req.issuedItems;
    const returnedCount = items.filter((i) => i.returned).length;
    const pendingCount = items.length - returnedCount;
    const latestReturnedAt =
      items
        .filter((i) => i.returnedAt)
        .sort((a, b) => new Date(b.returnedAt!).getTime() - new Date(a.returnedAt!).getTime())[0]
        ?.returnedAt ?? null;

    let status: 'PENDING' | 'PARTIAL' | 'RETURNED' = 'PENDING';
    if (returnedCount === items.length) {
      status = 'RETURNED';
    } else if (returnedCount > 0) {
      status = 'PARTIAL';
    }

    return {
      status,
      totalItems: items.length,
      returnedItems: returnedCount,
      pendingItems: pendingCount,
      items,
      returnDate: latestReturnedAt,
    };
  }

  // Fallback for requests where issuedItems is not populated as an array
  if (req.status === 'ISSUED' || req.returnedPartNo || req.type === 'EXCHANGE' || req.status === 'ISSUE_PENDING_APPROVAL') {
    const isRet = Boolean(req.returnedPartNo);
    const itemName = req.issuedPartName || req.partName || 'Spare Part';
    const itemQty = req.issuedQty || req.quantity || 1;
    const itemSerial = req.returnedPartNo || req.issuedPartNo || '';
    const items = [
      {
        name: itemName,
        quantity: itemQty,
        serialNumber: itemSerial,
        returned: isRet,
        returnedAt: isRet ? req.updatedAt : null,
      },
    ];
    return {
      status: isRet ? 'RETURNED' : 'PENDING',
      totalItems: 1,
      returnedItems: isRet ? 1 : 0,
      pendingItems: isRet ? 0 : 1,
      items,
      returnDate: isRet ? req.updatedAt : null,
    };
  }

  return {
    status: 'NOT_APPLICABLE',
    totalItems: 0,
    returnedItems: 0,
    pendingItems: 0,
    items: [],
    returnDate: null,
  };
}

export function SparePartsPage(): ReactElement {
  const { user: currentUser } = useAuth();
  const isSuper = isSuperAdmin(currentUser);
  const canManageWarehouses = isSuper || currentUser?.role === 'ADMIN';
  const canPrepareIssue =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'EXECUTIVE';

  const [activeTab, setActiveTab] = useState<'requests' | 'returns' | 'warehouses'>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [returnStatusFilter, setReturnStatusFilter] = useState<string>('ALL');
  const [warehouseStatusFilter, setWarehouseStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Universal Lightbox Photo Preview State
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
    date: string;
  } | null>(null);

  // Universal Lightbox Audio Preview State
  const [selectedAudio, setSelectedAudio] = useState<{
    url: string;
    title: string;
    subtitle: string;
    date: string;
    description?: string;
  } | null>(null);

  // Modals state
  const [viewingRequest, setViewingRequest] = useState<SparePartRequestPublic | null>(null);
  const [issuingRequest, setIssuingRequest] = useState<SparePartRequestPublic | null>(null);
  const [approvingRequest, setApprovingRequest] = useState<SparePartRequestPublic | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<SparePartRequestPublic | null>(null);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehousePublic | null>(null);

  // Return tracking checklist state in View Modal
  const [returnChecked, setReturnChecked] = useState<Record<number, boolean>>({});
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  // Form states for Propose Issue
  const [issueWarehouseId, setIssueWarehouseId] = useState('');
  const [issueType, setIssueType] = useState<SparePartType>('NEW');
  const [issueNotes, setIssueNotes] = useState('');
  const [issueProductItems, setIssueProductItems] = useState<IssueProductItem[]>([
    { id: '1', name: '', quantity: 1, serialNumber: '' },
  ]);

  // Warehouse Form State
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whLocation, setWhLocation] = useState('');
  const [whContactPerson, setWhContactPerson] = useState('');
  const [whContactPhone, setWhContactPhone] = useState('');
  const [whIsActive, setWhIsActive] = useState(true);

  // Rejection Form State
  const [rejectionReason, setRejectionReason] = useState('');

  // Loading & error feedback states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // API Resources
  const requestsResource = useApiResource('admin:spare-parts:requests', () =>
    api.spareParts.list({
      status: statusFilter === 'ALL' || statusFilter === 'CORE_RETURN_AWAITING' ? undefined : statusFilter,
      warehouseId: warehouseFilter === 'ALL' ? undefined : warehouseFilter,
    }),
  );

  const statsResource = useApiResource('admin:spare-parts:stats', () => api.spareParts.stats());
  const warehousesResource = useApiResource('admin:warehouses:list', () => api.warehouses.list(true));

  const requests: SparePartRequestPublic[] = useMemo(() => {
    const res = requestsResource.data as any;
    return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  }, [requestsResource.data]);

  const warehousesList: WarehousePublic[] = useMemo(() => {
    return warehousesResource.data ?? [];
  }, [warehousesResource.data]);

  const stats = statsResource.data;

  // Filter requests locally by search query, status, type, warehouse
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Status filter
      if (statusFilter === 'CORE_RETURN_AWAITING') {
        const ret = getReturnStatus(req);
        if (ret.status === 'NOT_APPLICABLE' || ret.status === 'RETURNED') return false;
      } else if (statusFilter !== 'ALL' && req.status !== statusFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'ALL' && req.type !== typeFilter) {
        return false;
      }

      // Warehouse filter
      if (warehouseFilter !== 'ALL' && req.warehouseId !== warehouseFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const reqNoMatch = req.requestNo.toLowerCase().includes(query);
        const partMatch = (req.partName || '').toLowerCase().includes(query) || (req.issuedPartName || '').toLowerCase().includes(query);
        const serialMatch = (req.issuedPartNo || '').toLowerCase().includes(query);
        const driverNameMatch = req.driver?.user
          ? `${req.driver.user.firstName} ${req.driver.user.lastName}`.toLowerCase().includes(query)
          : false;
        const driverEmpMatch = (req.driver?.user?.employeeId || '').toLowerCase().includes(query);
        const plateMatch = (req.vehicle?.plateNumber || '').toLowerCase().includes(query);
        const descMatch = (req.description || '').toLowerCase().includes(query);

        return reqNoMatch || partMatch || serialMatch || driverNameMatch || driverEmpMatch || plateMatch || descMatch;
      }

      return true;
    });
  }, [requests, statusFilter, typeFilter, warehouseFilter, searchQuery]);

  // Compute return counts across all requests
  const totalReturnsCount = useMemo(() => {
    return requests.filter((req) => getReturnStatus(req).status !== 'NOT_APPLICABLE').length;
  }, [requests]);

  const pendingReturnCount = useMemo(() => {
    return requests.filter((req) => {
      const ret = getReturnStatus(req);
      return ret.status === 'PENDING' || ret.status === 'PARTIAL';
    }).length;
  }, [requests]);

  const completedReturnCount = useMemo(() => {
    return requests.filter((req) => getReturnStatus(req).status === 'RETURNED').length;
  }, [requests]);

  // Returns tab list - shows all returns (pending and completed) by default
  const returnsList = useMemo(() => {
    return requests
      .filter((req) => {
        const ret = getReturnStatus(req);
        if (ret.status === 'NOT_APPLICABLE') return false;
        if (returnStatusFilter === 'RETURNED') {
          return ret.status === 'RETURNED';
        }
        if (returnStatusFilter === 'PENDING') {
          return ret.status === 'PENDING' || ret.status === 'PARTIAL';
        }
        if (returnStatusFilter === 'PARTIAL') {
          return ret.status === 'PARTIAL';
        }
        return true;
      })
      .filter((req) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const reqNoMatch = req.requestNo.toLowerCase().includes(query);
        const partMatch = (req.issuedPartName || req.partName || '').toLowerCase().includes(query);
        const plateMatch = (req.vehicle?.plateNumber || '').toLowerCase().includes(query);
        const driverMatch = req.driver?.user
          ? `${req.driver.user.firstName} ${req.driver.user.lastName}`.toLowerCase().includes(query)
          : false;
        return reqNoMatch || partMatch || plateMatch || driverMatch;
      });
  }, [requests, returnStatusFilter, searchQuery]);

  // Pagination for Requests Roster
  const totalItems = filteredRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedRequests = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredRequests.slice(startIndex, startIndex + pageSize);
  }, [filteredRequests, page, pageSize]);

  // Pagination for Returns Roster
  const totalReturnItems = returnsList.length;
  const totalReturnPages = Math.max(1, Math.ceil(totalReturnItems / pageSize));
  const paginatedReturns = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return returnsList.slice(startIndex, startIndex + pageSize);
  }, [returnsList, page, pageSize]);

  // Filter warehouses locally by search query and active/inactive status
  const filteredWarehouses = useMemo(() => {
    return warehousesList.filter((wh) => {
      // Status filter
      if (warehouseStatusFilter === 'ACTIVE' && !wh.isActive) return false;
      if (warehouseStatusFilter === 'INACTIVE' && wh.isActive) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = wh.name.toLowerCase().includes(q);
        const codeMatch = Boolean(wh.code && wh.code.toLowerCase().includes(q));
        const locationMatch = Boolean(wh.location && wh.location.toLowerCase().includes(q));
        const contactMatch = Boolean(wh.contactPerson && wh.contactPerson.toLowerCase().includes(q));
        const phoneMatch = Boolean(wh.contactPhone && wh.contactPhone.toLowerCase().includes(q));
        return nameMatch || codeMatch || locationMatch || contactMatch || phoneMatch;
      }
      return true;
    });
  }, [warehousesList, warehouseStatusFilter, searchQuery]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setWarehouseFilter('ALL');
    setReturnStatusFilter('ALL');
    setWarehouseStatusFilter('ALL');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(searchQuery) ||
    (activeTab === 'requests' && (statusFilter !== 'ALL' || typeFilter !== 'ALL' || warehouseFilter !== 'ALL')) ||
    (activeTab === 'returns' && returnStatusFilter !== 'ALL') ||
    (activeTab === 'warehouses' && warehouseStatusFilter !== 'ALL');

  // Product items handlers for Propose Issue
  const handleAddProductItem = (): void => {
    setIssueProductItems((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', quantity: 1, serialNumber: '' },
    ]);
  };

  const handleUpdateProductItem = (
    index: number,
    field: keyof IssueProductItem,
    value: string | number,
  ): void => {
    setIssueProductItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, [field]: value };
      return copy;
    });
  };

  const handleDeleteProductItem = (index: number): void => {
    setIssueProductItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  // Open modals
  const handleOpenProposeIssue = (req: SparePartRequestPublic): void => {
    setIssuingRequest(req);
    setIssueWarehouseId(req.warehouseId || warehousesList[0]?.id || '');
    setIssueType(req.type || 'NEW');
    setIssueNotes('');
    setActionError(null);

    const initialName = req.issuedPartName || req.partName || 'Spare Part';
    const initialQty = req.issuedQty || req.quantity || 1;
    const initialSerial = req.issuedPartNo || '';

    setIssueProductItems([
      {
        id: String(Date.now()),
        name: initialName,
        quantity: initialQty,
        serialNumber: initialSerial,
      },
    ]);
  };

  const handleOpenApproveModal = (req: SparePartRequestPublic): void => {
    setApprovingRequest(req);
    setIssueWarehouseId(req.warehouseId || warehousesList[0]?.id || '');
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

  const handleOpenViewModal = (req: SparePartRequestPublic): void => {
    setViewingRequest(req);
    setReturnChecked({});
    setReturnError(null);
  };

  const handleConfirmReturns = async (): Promise<void> => {
    if (!viewingRequest) return;
    const itemIndexes = Object.entries(returnChecked)
      .filter(([, checked]) => checked)
      .map(([idx]) => Number(idx));
    if (itemIndexes.length === 0) return;
    try {
      setReturnLoading(true);
      setReturnError(null);
      const updated = await api.spareParts.confirmReturns(viewingRequest.id, { itemIndexes });
      setViewingRequest(updated);
      setReturnChecked({});
      void requestsResource.reload();
      void statsResource.reload();
    } catch (err: any) {
      setReturnError(err?.message || 'Failed to confirm returns');
    } finally {
      setReturnLoading(false);
    }
  };

  // Submit Propose Issue / Direct Issue
  const handleProposeSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!issuingRequest) return;

    if (!issueWarehouseId) {
      setActionError('Please select a warehouse');
      return;
    }

    const invalidItems = issueProductItems.filter((i) => !i.name.trim() || Number(i.quantity) <= 0);
    if (invalidItems.length > 0) {
      setActionError('Please ensure all items have a valid name and quantity (> 0)');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const itemsPayload = issueProductItems.map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity),
        serialNumber: item.serialNumber.trim() || '',
      }));

      const primaryItem = issueProductItems[0]!;

      if (isSuper) {
        // Direct issue for SuperAdmin
        await api.spareParts.approveAndIssue(issuingRequest.id, {
          warehouseId: issueWarehouseId,
          type: issueType,
          issuedPartName: primaryItem.name.trim(),
          issuedPartNo: primaryItem.serialNumber.trim() || undefined,
          issuedQty: Number(primaryItem.quantity),
          adminNotes: issueNotes.trim() || undefined,
          items: itemsPayload,
        });
      } else {
        // Prepare/propose for Executive/Admin
        await api.spareParts.proposeIssue(issuingRequest.id, {
          warehouseId: issueWarehouseId,
          type: issueType,
          issuedPartName: primaryItem.name.trim(),
          issuedPartNo: primaryItem.serialNumber.trim() || undefined,
          issuedQty: Number(primaryItem.quantity),
          adminNotes: issueNotes.trim() || undefined,
          items: itemsPayload,
        });
      }

      setIssuingRequest(null);
      void requestsResource.reload();
      void statsResource.reload();
      void warehousesResource.reload();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to process requisition');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit SuperAdmin Approval
  const handleSuperAdminApprove = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!approvingRequest) return;

    try {
      setActionLoading(true);
      setActionError(null);

      await api.spareParts.approveAndIssue(approvingRequest.id, {
        warehouseId: issueWarehouseId || approvingRequest.warehouseId || undefined,
        type: approvingRequest.type || 'NEW',
        issuedPartName: approvingRequest.issuedPartName || approvingRequest.partName || 'Spare Part',
        issuedPartNo: approvingRequest.issuedPartNo || undefined,
        issuedQty: approvingRequest.issuedQty || approvingRequest.quantity || 1,
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



  const getStatusBadge = (status: SparePartRequestStatus, req?: SparePartRequestPublic) => {
    // If request requires core exchange / return awaiting
    if (req && (req.type === 'EXCHANGE' || Boolean(req.returnedPartNo)) && req.status === 'ISSUED') {
      const ret = getReturnStatus(req);
      if (ret.status !== 'RETURNED') {
        return (
          <span
            className="fo-spare-status-badge"
            style={{
              background: '#102034',
              color: '#93ccff',
              border: '1px solid rgba(147, 204, 255, 0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#93ccff' }} />
            Core Return Awaiting
          </span>
        );
      }
    }

    switch (status) {
      case 'PENDING_APPROVAL':
        return (
          <span
            className="fo-spare-status-badge"
            style={{
              background: '#102034',
              color: '#fed65b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
            Pending Review
          </span>
        );
      case 'ISSUE_PENDING_APPROVAL':
        return (
          <span
            className="fo-spare-status-badge"
            style={{
              background: '#102034',
              color: '#93ccff',
              border: '1px solid rgba(147, 204, 255, 0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#93ccff' }} />
            Issue Pending
          </span>
        );
      case 'ISSUED':
        return (
          <span
            className="fo-spare-status-badge"
            style={{
              background: '#102034',
              color: '#6ee7b7',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            Issued &amp; Fulfilled
          </span>
        );
      case 'REJECTED':
        return (
          <span
            className="fo-spare-status-badge"
            style={{
              background: '#102034',
              color: '#ffb4ab',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
            Rejected
          </span>
        );
      default:
        return <span className="fo-spare-status-badge">{status}</span>;
    }
  };

  const getTypeBadge = (type: SparePartType) => {
    switch (type) {
      case 'NEW':
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: '#d3e4fe',
              background: '#162942',
              border: '1px solid #1f3654',
            }}
          >
            New Part
          </span>
        );
      case 'EXCHANGE':
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: '#93ccff',
              background: '#162942',
              border: '1px solid #1f3654',
            }}
          >
            Core Exchange
          </span>
        );
      case 'REPAIR':
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: '#c084fc',
              background: '#162942',
              border: '1px solid #1f3654',
            }}
          >
            Repair
          </span>
        );
      default:
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: '#8c909f',
              background: '#162942',
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
    <div className="fleetops-view">
      <div className="fleetops-container">
        {/* ===================================================================
            1. TOP MISSION HEADER
           =================================================================== */}
        <div className="fo-spare-header">
          <div className="fo-spare-header-left">
            <div className="fo-spare-header-icon">
              <Package size={22} color="#93ccff" />
            </div>
            <div>
              <div className="fo-spare-header-title-row">
                <h1 className="fo-spare-header-title">Spare Parts &amp; Inventory Requisition</h1>
                <span className="fo-spare-badge-milspec">MIL-SPEC HUB</span>
              </div>
              <p className="fo-spare-header-sub">
                Review driver voice notes &amp; photos, assign requisition types, issue warehouse parts, and manage SuperAdmin sign-offs.
              </p>
            </div>
          </div>

          <div className="fo-spare-header-actions">
            <button
              type="button"
              className="fo-spare-btn-ghost"
              onClick={() => {
                void requestsResource.reload();
                void warehousesResource.reload();
                void statsResource.reload();
              }}
              disabled={requestsResource.loading}
              title="Refresh records"
            >
              <RotateCw size={14} className={requestsResource.loading ? 'fo-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              className="fo-spare-btn-ghost"
              onClick={handleExportCsv}
              disabled={exporting || requests.length === 0}
              title="Export Excel / CSV"
            >
              <Download size={14} color="#93ccff" />
              <span>{exporting ? 'Exporting…' : 'Export Excel'}</span>
            </button>

            {canManageWarehouses && (
              <button
                type="button"
                className="fo-spare-btn-primary"
                onClick={handleOpenAddWarehouse}
              >
                <Plus size={14} />
                <span>+ Add Warehouse</span>
              </button>
            )}
          </div>
        </div>

        <ErrorBanner error={requestsResource.error || warehousesResource.error} />

        {/* ===================================================================
            2. 5 KPI CARDS GRID
           =================================================================== */}
        <div className="fo-spare-kpi-grid">
          {/* Card 1: DRIVER REQUESTS */}
          <div
            className="fo-spare-kpi-card"
            style={{
              borderColor: statusFilter === 'PENDING_APPROVAL' ? '#3b82f6' : '#1f3654',
            }}
            onClick={() => {
              setActiveTab('requests');
              setStatusFilter((prev) => (prev === 'PENDING_APPROVAL' ? 'ALL' : 'PENDING_APPROVAL'));
              setPage(1);
            }}
            title="Filter by Pending Review"
          >
            <div>
              <div className="fo-spare-kpi-top">
                <span className="fo-spare-kpi-label">DRIVER REQUESTS</span>
                <Clock size={16} color="#8c909f" />
              </div>
              <div className="fo-spare-kpi-value">
                {pendingCount}{' '}
                <span style={{ fontSize: 11, color: '#8c909f', fontWeight: 600, letterSpacing: '0.04em' }}>
                  QUEUE
                </span>
              </div>
            </div>
            <div
              style={{
                background: '#081627',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(31, 54, 84, 0.6)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                Awaiting Exec/Admin
              </span>
              <span style={{ color: '#93ccff', fontWeight: 'bold' }}>&rarr;</span>
            </div>
          </div>

          {/* Card 2: PENDING SUPERADMIN */}
          <div
            className="fo-spare-kpi-card"
            style={{
              borderColor: statusFilter === 'ISSUE_PENDING_APPROVAL' ? '#93ccff' : '#1f3654',
            }}
            onClick={() => {
              setActiveTab('requests');
              setStatusFilter((prev) => (prev === 'ISSUE_PENDING_APPROVAL' ? 'ALL' : 'ISSUE_PENDING_APPROVAL'));
              setPage(1);
            }}
            title="Filter by Issue Pending Approval"
          >
            <div>
              <div className="fo-spare-kpi-top">
                <span className="fo-spare-kpi-label" style={{ color: '#93ccff' }}>
                  PENDING SUPERADMIN
                </span>
                <Wrench size={16} color="#93ccff" />
              </div>
              <div className="fo-spare-kpi-value" style={{ color: '#93ccff' }}>
                {issuePendingCount}{' '}
                <span style={{ fontSize: 11, color: '#93ccff', fontWeight: 600, letterSpacing: '0.04em' }}>
                  APPROVAL
                </span>
              </div>
            </div>
            <div
              style={{
                background: '#081627',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(31, 54, 84, 0.6)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 11, color: '#93ccff', fontFamily: 'var(--fo-font-mono)' }}>
                Prepared by Exec/Admin
              </span>
              <span style={{ color: '#93ccff', fontWeight: 'bold' }}>&rarr;</span>
            </div>
          </div>

          {/* Card 3: ISSUED & FULFILLED */}
          <div
            className="fo-spare-kpi-card"
            style={{
              borderColor: statusFilter === 'ISSUED' && activeTab === 'requests' ? '#10b981' : '#1f3654',
            }}
            onClick={() => {
              setActiveTab('requests');
              setStatusFilter((prev) => (prev === 'ISSUED' ? 'ALL' : 'ISSUED'));
              setPage(1);
            }}
            title="Filter by Issued & Fulfilled"
          >
            <div>
              <div className="fo-spare-kpi-top">
                <span className="fo-spare-kpi-label" style={{ color: '#10b981' }}>
                  ISSUED &amp; FULFILLED
                </span>
                <CheckCircle2 size={16} color="#10b981" />
              </div>
              <div className="fo-spare-kpi-value" style={{ color: '#6ee7b7' }}>
                {issuedCount}{' '}
                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, letterSpacing: '0.04em' }}>
                  DISPATCHED
                </span>
              </div>
            </div>
            <div
              style={{
                background: '#081627',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(31, 54, 84, 0.6)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 11, color: '#6ee7b7', fontFamily: 'var(--fo-font-mono)' }}>
                Approved &amp; Issued
              </span>
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>&rarr;</span>
            </div>
          </div>

          {/* Card 4: PENDING PART RETURNS */}
          <div
            className="fo-spare-kpi-card"
            style={{
              borderColor: activeTab === 'returns' && returnStatusFilter === 'PENDING' ? '#f59e0b' : '#1f3654',
            }}
            onClick={() => {
              setActiveTab('returns');
              setReturnStatusFilter('PENDING');
              setPage(1);
            }}
            title="View Pending Returns"
          >
            <div>
              <div className="fo-spare-kpi-top">
                <span className="fo-spare-kpi-label" style={{ color: '#f59e0b' }}>
                  PENDING PART RETURNS
                </span>
                <RotateCw size={16} color="#f59e0b" />
              </div>
              <div className="fo-spare-kpi-value" style={{ color: '#fed65b' }}>
                {pendingReturnCount}{' '}
                <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, letterSpacing: '0.04em' }}>
                  DUE BACK
                </span>
              </div>
            </div>
            <div
              style={{
                background: '#081627',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(31, 54, 84, 0.6)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 11, color: '#fed65b', fontFamily: 'var(--fo-font-mono)' }}>
                Awaiting core / salvage
              </span>
              <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>&rarr;</span>
            </div>
          </div>

          {/* Card 5: ACTIVE WAREHOUSES */}
          <div
            className="fo-spare-kpi-card"
            style={{
              borderColor: activeTab === 'warehouses' ? '#4cd7f6' : '#1f3654',
            }}
            onClick={() => {
              setActiveTab('warehouses');
              setPage(1);
            }}
            title="Warehouse Inventory Depots"
          >
            <div>
              <div className="fo-spare-kpi-top">
                <span className="fo-spare-kpi-label" style={{ color: '#4cd7f6' }}>
                  ACTIVE WAREHOUSES
                </span>
                <WarehouseIcon size={16} color="#4cd7f6" />
              </div>
              <div className="fo-spare-kpi-value" style={{ color: '#4cd7f6' }}>
                {activeWarehousesCount}{' '}
                <span style={{ fontSize: 11, color: '#4cd7f6', fontWeight: 600, letterSpacing: '0.04em' }}>
                  HUB
                </span>
              </div>
            </div>
            <div
              style={{
                background: '#081627',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(31, 54, 84, 0.6)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 11, color: '#4cd7f6', fontFamily: 'var(--fo-font-mono)' }}>
                Kolkata Depot Online
              </span>
              <span style={{ color: '#4cd7f6', fontWeight: 'bold' }}>&rarr;</span>
            </div>
          </div>
        </div>

        {/* ===================================================================
            3. NAVIGATION SUB-TABS ROW
           =================================================================== */}
        <div className="fo-spare-tabs-row">
          <button
            type="button"
            className={`fo-spare-tab-btn ${activeTab === 'requests' ? 'active' : 'inactive'}`}
            onClick={() => {
              setActiveTab('requests');
              setPage(1);
            }}
          >
            <Package size={15} />
            <span>Requisition Master</span>
            <span className="fo-spare-tab-counter">{requests.length}</span>
          </button>

          <button
            type="button"
            className={`fo-spare-tab-btn ${activeTab === 'returns' ? 'active' : 'inactive'}`}
            onClick={() => {
              setActiveTab('returns');
              setReturnStatusFilter('ALL');
              setPage(1);
            }}
          >
            <RotateCw size={15} />
            <span>Returns</span>
            <span className="fo-spare-tab-counter">{totalReturnsCount}</span>
          </button>

          <button
            type="button"
            className={`fo-spare-tab-btn ${activeTab === 'warehouses' ? 'active' : 'inactive'}`}
            onClick={() => {
              setActiveTab('warehouses');
              setWarehouseStatusFilter('ALL');
              setPage(1);
            }}
          >
            <WarehouseIcon size={15} />
            <span>Warehouse Directory</span>
            <span className="fo-spare-tab-counter">{warehousesList.length}</span>
          </button>
        </div>

        {/* ===================================================================
            4. FILTERS TOOLBAR ROW
           =================================================================== */}
        <div className="fo-spare-filter-bar">
          {/* Search Bar */}
          <div className="fo-spare-search-wrap">
            <Search size={15} className="fo-spare-search-icon" />
            <input
              type="text"
              className="fo-spare-search-input"
              placeholder={
                activeTab === 'warehouses'
                  ? 'Search warehouse name, code, location, manager...'
                  : activeTab === 'returns'
                    ? 'Search returns by request #, part, driver, vehicle...'
                    : 'Search request #, part, driver, plate...'
              }
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#8c909f',
                  cursor: 'pointer',
                  padding: 2,
                }}
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Dynamic Dropdown Filters by Tab */}
          <div className="fo-spare-dropdown-group">
            {activeTab === 'warehouses' ? (
              <>
                {/* Warehouse Status Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: '#8c909f' }}>
                    STATUS:
                  </span>
                  <select
                    className="fo-spare-filter-select"
                    value={warehouseStatusFilter}
                    onChange={(e) => {
                      setWarehouseStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE');
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All Warehouses ({warehousesList.length})</option>
                    <option value="ACTIVE">Active Only ({activeWarehousesCount})</option>
                    <option value="INACTIVE">Inactive ({warehousesList.length - activeWarehousesCount})</option>
                  </select>
                </div>

                {canManageWarehouses && (
                  <button
                    type="button"
                    className="fo-spare-btn-primary"
                    onClick={handleOpenAddWarehouse}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <Plus size={14} />
                    <span>+ Add Warehouse</span>
                  </button>
                )}
              </>
            ) : activeTab === 'returns' ? (
              <>
                {/* Returns Status Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: '#8c909f' }}>
                    RETURN STATUS:
                  </span>
                  <select
                    className="fo-spare-filter-select"
                    value={returnStatusFilter}
                    onChange={(e) => {
                      setReturnStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All Returns ({totalReturnsCount})</option>
                    <option value="PENDING">Pending Returns ({pendingReturnCount})</option>
                    <option value="RETURNED">Completed Returns ({completedReturnCount})</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                {/* Requisitions Status Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: '#8c909f' }}>
                    STATUS:
                  </span>
                  <select
                    className="fo-spare-filter-select"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ISSUED">Issued &amp; Fulfilled</option>
                    <option value="CORE_RETURN_AWAITING">Core Return Awaiting</option>
                    <option value="PENDING_APPROVAL">Pending Review</option>
                    <option value="ISSUE_PENDING_APPROVAL">Issue Pending Approval</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                {/* Type Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: '#8c909f' }}>
                    TYPE:
                  </span>
                  <select
                    className="fo-spare-filter-select"
                    value={typeFilter}
                    onChange={(e) => {
                      setTypeFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All Types</option>
                    <option value="NEW">New Part</option>
                    <option value="EXCHANGE">Core Exchange</option>
                    <option value="REPAIR">Repair</option>
                  </select>
                </div>

                {/* Warehouse Dropdown */}
                <select
                  className="fo-spare-filter-select"
                  value={warehouseFilter}
                  onChange={(e) => {
                    setWarehouseFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Warehouses</option>
                  {warehousesList.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.code ? `(#${w.code})` : ''} {!w.isActive ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#93ccff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  textDecoration: 'underline',
                }}
                onClick={handleClearFilters}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ===================================================================
            5. TAB 1: REQUISITION MASTER TABLE
           =================================================================== */}
        {activeTab === 'requests' && (
          <div className="fo-spare-table-card">
            {/* Table Top Sub-Header */}
            <div className="fo-spare-table-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontFamily: 'var(--fo-font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#ffffff',
                  }}
                >
                  REQUISITIONS ROSTER
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--fo-font-mono)',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#162942',
                    color: '#93ccff',
                    border: '1px solid #1f3654',
                  }}
                >
                  {totalItems} Records
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4cd7f6', boxShadow: '0 0 8px #4cd7f6' }} />
                <span>Real-time Operational Feed</span>
              </div>
            </div>

            {requestsResource.loading && requests.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#8c909f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <RotateCw size={24} className="fo-spin" color="#3b82f6" />
                <span>Loading requisitions…</span>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#8c909f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Package size={36} color="#8c909f" />
                <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>No requisitions match your criteria</div>
                <p style={{ fontSize: 12, color: '#8c909f', margin: 0 }}>Try adjusting your search or filters above.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="fo-spare-table">
                  <thead>
                    <tr>
                      <th>REQUEST #</th>
                      <th>DATE &amp; TIMESTAMP</th>
                      <th>DRIVER</th>
                      <th>VEHICLE</th>
                      <th>VOICE &amp; PROOF</th>
                      <th>TYPE</th>
                      <th>STATUS</th>
                      <th>FULFILLMENT DETAILS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequests.map((req) => {
                      const driverUser = req.driver?.user;
                      const initials = driverUser
                        ? `${driverUser.firstName?.[0] || ''}${driverUser.lastName?.[0] || ''}`.toUpperCase() || 'DD'
                        : 'DD';

                      return (
                        <tr
                          key={req.id}
                          onClick={() => handleOpenViewModal(req)}
                          style={{ cursor: 'pointer' }}
                        >
                          {/* Request # */}
                          <td style={{ fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: '#93ccff', whiteSpace: 'nowrap' }}>
                            {req.requestNo}
                          </td>

                          {/* Date & Timestamp */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: '#ffffff' }}>
                              {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                              {new Date(req.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} IST
                            </div>
                          </td>

                          {/* Driver */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div className="fo-spare-driver-pill">
                              <div className="fo-spare-avatar">{initials}</div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                  {driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Dana Driver'}
                                </span>
                                <span style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                                  ID: {driverUser?.employeeId || 'E1001'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Vehicle */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="fo-spare-plate-badge">
                              {req.vehicle?.plateNumber || 'WB40R8693'}
                            </span>
                          </td>

                          {/* Voice & Proof */}
                          <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {req.voiceUrl ? (
                                <button
                                  type="button"
                                  className="fo-spare-audio-pill"
                                  onClick={() => {
                                    setSelectedAudio({
                                      url: req.voiceUrl!,
                                      title: `Driver Voice Note - ${req.requestNo}`,
                                      subtitle: `Driver: ${driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Driver'} • Plate: ${req.vehicle?.plateNumber || 'N/A'}`,
                                      date: req.createdAt,
                                      description: req.description || undefined,
                                    });
                                  }}
                                  title="Click to open / play driver voice note"
                                >
                                  <span>&darr; || 0:18</span>
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--fo-font-mono)', padding: '2px 6px' }}>
                                  None
                                </span>
                              )}

                              {req.photoUrl ? (
                                <button
                                  type="button"
                                  className="fo-spare-photo-btn"
                                  onClick={() =>
                                    setSelectedPhoto({
                                      url: req.photoUrl!,
                                      title: `Photo Evidence - ${req.requestNo}`,
                                      subtitle: `Part: ${req.partName} • Plate: ${req.vehicle?.plateNumber || 'N/A'}`,
                                      date: req.createdAt,
                                    })
                                  }
                                  title="View photo proof"
                                >
                                  <ImageIcon size={14} />
                                </button>
                              ) : null}
                            </div>
                          </td>

                          {/* Type */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {getTypeBadge(req.type || 'NEW')}
                          </td>

                          {/* Status */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {getStatusBadge(req.status, req)}
                          </td>

                          {/* Fulfillment Details */}
                          <td>
                            <div style={{ fontWeight: 600, color: '#ffffff' }}>
                              {req.issuedPartName || req.partName || 'Brake Pad Assembly'}{' '}
                              <span style={{ color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                                [Qty: {req.issuedQty || req.quantity || 1}]
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                              {req.warehouse?.name || 'Kolkata Depot'} &bull; Bin B-14
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #1f3654', background: '#081627' }}>
                <Pagination
                  meta={{
                    page,
                    pageSize,
                    total: totalItems,
                    totalPages,
                  }}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            5B. TAB 2: RETURNS ROSTER (SHOWING ALL PENDING & COMPLETED)
           =================================================================== */}
        {activeTab === 'returns' && (
          <div className="fo-spare-table-card">
            <div className="fo-spare-table-top" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontFamily: 'var(--fo-font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#93ccff',
                  }}
                >
                  RETURNS &amp; CORE SALVAGE ROSTER
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--fo-font-mono)',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#162942',
                    color: '#93ccff',
                    border: '1px solid #1f3654',
                  }}
                >
                  {totalReturnItems} Records
                </span>
              </div>

              {/* Status Filter Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setReturnStatusFilter('ALL');
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'var(--fo-font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: returnStatusFilter === 'ALL' ? '#3b82f6' : '#162942',
                    color: returnStatusFilter === 'ALL' ? '#ffffff' : '#8c909f',
                    border: `1px solid ${returnStatusFilter === 'ALL' ? '#3b82f6' : '#1f3654'}`,
                  }}
                >
                  All Returns ({totalReturnsCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReturnStatusFilter('PENDING');
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'var(--fo-font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: returnStatusFilter === 'PENDING' ? '#f59e0b' : '#162942',
                    color: returnStatusFilter === 'PENDING' ? '#000000' : '#fed65b',
                    border: `1px solid ${returnStatusFilter === 'PENDING' ? '#f59e0b' : '#1f3654'}`,
                  }}
                >
                  Pending ({pendingReturnCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReturnStatusFilter('RETURNED');
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'var(--fo-font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: returnStatusFilter === 'RETURNED' ? '#10b981' : '#162942',
                    color: returnStatusFilter === 'RETURNED' ? '#ffffff' : '#6ee7b7',
                    border: `1px solid ${returnStatusFilter === 'RETURNED' ? '#10b981' : '#1f3654'}`,
                  }}
                >
                  Completed ({completedReturnCount})
                </button>
              </div>
            </div>

            {returnsList.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#8c909f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={36} color="#10b981" />
                <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>No return records match your filter</div>
                <p style={{ fontSize: 12, color: '#8c909f', margin: 0 }}>Try selecting "All Returns" or clearing search filters.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="fo-spare-table">
                  <thead>
                    <tr>
                      <th>REQUEST #</th>
                      <th>VEHICLE</th>
                      <th>DRIVER</th>
                      <th>ISSUED ITEMS &amp; PROGRESS</th>
                      <th>RETURN STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReturns.map((req) => {
                      const ret = getReturnStatus(req);
                      return (
                        <tr key={req.id}>
                          <td style={{ fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: '#93ccff' }}>
                            {req.requestNo}
                          </td>
                          <td>
                            <span className="fo-spare-plate-badge">
                              {req.vehicle?.plateNumber || 'N/A'}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#ffffff' }}>
                              {req.driver?.user ? `${req.driver.user.firstName} ${req.driver.user.lastName}` : 'Driver'}
                            </div>
                            <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                              ID: {req.driver?.user?.employeeId || 'E1001'}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#ffffff' }}>
                              {req.issuedPartName || req.partName || 'Brake Assembly'}
                            </div>
                            <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                              {ret.returnedItems} of {ret.totalItems} items returned ({ret.pendingItems} pending)
                            </div>
                          </td>
                          <td>
                            {ret.status === 'RETURNED' ? (
                              <span
                                className="fo-spare-status-badge"
                                style={{ background: '#102034', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                              >
                                <Check size={12} color="#10b981" /> Returned {ret.returnDate ? `(${formatDateTime(ret.returnDate).slice(-8)})` : ''}
                              </span>
                            ) : ret.status === 'PARTIAL' ? (
                              <span
                                className="fo-spare-status-badge"
                                style={{ background: '#102034', color: '#93ccff', border: '1px solid rgba(147, 204, 255, 0.3)' }}
                              >
                                <RotateCw size={12} color="#93ccff" /> Partial Return ({ret.returnedItems}/{ret.totalItems})
                              </span>
                            ) : (
                              <span
                                className="fo-spare-status-badge"
                                style={{ background: '#102034', color: '#fed65b', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                              >
                                <Clock size={12} color="#f59e0b" /> Pending Return
                              </span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="fo-spare-btn-ghost"
                              onClick={() => handleOpenViewModal(req)}
                            >
                              Verify Returns
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalReturnPages > 1 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #1f3654', background: '#081627' }}>
                <Pagination
                  meta={{
                    page,
                    pageSize,
                    total: totalReturnItems,
                    totalPages: totalReturnPages,
                  }}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            5C. TAB 3: WAREHOUSE DIRECTORY
           =================================================================== */}
        {activeTab === 'warehouses' && (
          <div className="fo-spare-table-card" style={{ padding: 18 }}>
            {/* Top Sub-Header */}
            <div className="fo-spare-table-top" style={{ padding: '0 0 16px 0', borderBottom: '1px solid #1f3654', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontFamily: 'var(--fo-font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#ffffff',
                  }}
                >
                  DEPOT NETWORK DIRECTORY
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--fo-font-mono)',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#162942',
                    color: '#93ccff',
                    border: '1px solid #1f3654',
                  }}
                >
                  {filteredWarehouses.length} Facilities
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                <span>{activeWarehousesCount} Active Hubs</span>
              </div>
            </div>

            {warehousesResource.loading && warehousesList.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#8c909f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <RotateCw size={24} className="fo-spin" color="#3b82f6" />
                <span>Loading warehouses…</span>
              </div>
            ) : filteredWarehouses.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#8c909f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <WarehouseIcon size={36} color="#8c909f" />
                <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>No warehouses match your criteria</div>
                <p style={{ fontSize: 12, color: '#8c909f', margin: 0 }}>Try clearing your search or provision a new warehouse depot.</p>
                {canManageWarehouses && (
                  <button
                    type="button"
                    className="fo-spare-btn-primary"
                    onClick={handleOpenAddWarehouse}
                    style={{ marginTop: 12 }}
                  >
                    <Plus size={14} />
                    <span>+ Add Warehouse</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 16,
                }}
              >
                {filteredWarehouses.map((wh) => (
                  <div key={wh.id} className="fo-spare-kpi-card" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <WarehouseIcon size={18} color="#93ccff" />
                            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>{wh.name}</h4>
                          </div>
                          {wh.code && (
                            <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)', marginTop: 4 }}>
                              Depot Code: #{wh.code}
                            </div>
                          )}
                        </div>
                        <span
                          className="fo-spare-status-badge"
                          style={{
                            background: wh.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: wh.isActive ? '#6ee7b7' : '#ffb4ab',
                            border: `1px solid ${wh.isActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                          }}
                        >
                          {wh.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: '#8c909f', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                        <div>📍 {wh.location || 'Central Depot Facility'}</div>
                        <div>👤 Manager: <strong style={{ color: '#d3e4fe' }}>{wh.contactPerson || 'Not assigned'}</strong></div>
                        <div>📞 Phone: <span style={{ fontFamily: 'var(--fo-font-mono)', color: '#d3e4fe' }}>{wh.contactPhone || 'N/A'}</span></div>
                        {wh._count?.issuedParts !== undefined && (
                          <div style={{ fontSize: 11, color: '#93ccff', fontFamily: 'var(--fo-font-mono)', marginTop: 4 }}>
                            📦 {wh._count.issuedParts} Dispatched Requisitions
                          </div>
                        )}
                      </div>
                    </div>

                    {canManageWarehouses && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 10, borderTop: '1px solid #1f3654' }}>
                        <button
                          type="button"
                          className="fo-spare-btn-ghost"
                          onClick={() => handleToggleWarehouseStatus(wh)}
                        >
                          {wh.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="fo-spare-btn-ghost"
                          onClick={() => handleOpenEditWarehouse(wh)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 8,
                            color: '#ffb4ab',
                            padding: '6px 10px',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleDeleteWarehouse(wh)}
                          title="Delete warehouse"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            6. MODALS (DETAIL, ISSUE, APPROVE, REJECT, WAREHOUSE, LIGHTBOX)
           =================================================================== */}

        {/* Universal Photo Lightbox */}
        {selectedPhoto && (
          <div className="fo-spare-modal-backdrop" onClick={() => setSelectedPhoto(null)}>
            <div className="fo-spare-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <div className="fo-spare-modal-head">
                <div>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>{selectedPhoto.title}</h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#8c909f' }}>{selectedPhoto.subtitle}</p>
                </div>
                <button type="button" className="fo-spare-modal-close" onClick={() => setSelectedPhoto(null)}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ background: '#031427', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: '55vh', overflow: 'hidden' }}>
                <img src={selectedPhoto.url} alt="Proof" style={{ maxHeight: '50vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
              </div>
              <div className="fo-spare-modal-foot">
                <a href={selectedPhoto.url} target="_blank" rel="noreferrer" style={{ color: '#93ccff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                  <ExternalLink size={13} /> Open Full Size
                </a>
                <button type="button" className="fo-spare-btn-primary" onClick={() => setSelectedPhoto(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Universal Audio Voice Note Lightbox */}
        {selectedAudio && (
          <div className="fo-spare-modal-backdrop" onClick={() => setSelectedAudio(null)}>
            <div className="fo-spare-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
              <div className="fo-spare-modal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(6, 182, 212, 0.18)', border: '1px solid rgba(6, 182, 212, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4cd7f6' }}>
                    <RotateCw size={18} color="#4cd7f6" />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>{selectedAudio.title}</h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#8c909f' }}>{selectedAudio.subtitle}</p>
                  </div>
                </div>
                <button type="button" className="fo-spare-modal-close" onClick={() => setSelectedAudio(null)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ background: '#0b1c30', borderRadius: 8, padding: 16, border: '1px solid #1f3654', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                  <span style={{ color: '#4cd7f6', fontWeight: 600 }}>● Driver Telemetry Audio Recording</span>
                  <span>{formatDateTime(selectedAudio.date)}</span>
                </div>

                {/* Animated Waveform Bars */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 40, background: '#081627', borderRadius: 6, padding: '0 12px' }}>
                  {[12, 24, 18, 32, 14, 28, 22, 36, 18, 26, 30, 16, 24, 32, 20, 14, 28, 36, 22, 16, 28, 34, 18, 24, 12].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: 3,
                        height: `${h}px`,
                        background: i % 2 === 0 ? '#4cd7f6' : '#3b82f6',
                        borderRadius: 2,
                        opacity: 0.85,
                      }}
                    />
                  ))}
                </div>

                {/* Audio Controls */}
                <audio
                  controls
                  autoPlay
                  src={selectedAudio.url}
                  style={{ width: '100%', height: 42, outline: 'none', borderRadius: 8 }}
                />

                {selectedAudio.description && (
                  <div style={{ background: '#102034', padding: 10, borderRadius: 6, border: '1px solid #1f3654', fontSize: 12, color: '#d3e4fe', fontStyle: 'italic' }}>
                    "{selectedAudio.description}"
                  </div>
                )}
              </div>

              <div className="fo-spare-modal-foot">
                <a
                  href={selectedAudio.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#93ccff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontWeight: 600 }}
                >
                  <Download size={14} /> Download Audio
                </a>
                <button type="button" className="fo-spare-btn-primary" onClick={() => setSelectedAudio(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Requisition Details Modal */}
        {viewingRequest && (
          <div className="fo-spare-modal-backdrop" onClick={() => setViewingRequest(null)}>
            <div className="fo-spare-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780 }}>
              <div className="fo-spare-modal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#162942', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93ccff' }}>
                    <Package size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 18, fontWeight: 800, color: '#ffffff' }}>
                        {viewingRequest.requestNo}
                      </span>
                      {getTypeBadge(viewingRequest.type || 'NEW')}
                    </div>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#8c909f' }}>
                      Requisition Ticket &bull; Vehicle: <strong style={{ color: '#ffffff' }}>{viewingRequest.vehicle?.plateNumber || 'N/A'}</strong>
                    </p>
                  </div>
                </div>
                <button type="button" className="fo-spare-modal-close" onClick={() => setViewingRequest(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Status Header Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#0b1c30', borderRadius: 8, border: '1px solid #1f3654' }}>
                <span style={{ fontSize: 12, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>CURRENT STATUS:</span>
                {getStatusBadge(viewingRequest.status, viewingRequest)}
              </div>

              {/* 3-Column Info Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ background: '#0b1c30', borderRadius: 8, padding: 12, border: '1px solid #1f3654' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <User size={13} color="#93ccff" /> Driver Details
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                    {viewingRequest.driver?.user ? `${viewingRequest.driver.user.firstName} ${viewingRequest.driver.user.lastName}` : 'Dana Driver'}
                  </div>
                  <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)', marginTop: 2 }}>
                    ID: {viewingRequest.driver?.user?.employeeId || 'E1001'} &bull; {viewingRequest.driver?.user?.phone || 'N/A'}
                  </div>
                </div>

                <div style={{ background: '#0b1c30', borderRadius: 8, padding: 12, border: '1px solid #1f3654' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Truck size={13} color="#93ccff" /> Assigned Fleet
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                    {viewingRequest.vehicle?.plateNumber || 'WB40R8693'}
                  </div>
                  <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)', marginTop: 2 }}>
                    Model: {viewingRequest.vehicle?.model || 'Heavy Hauler'} &bull; {viewingRequest.warehouse?.name || 'Kolkata Depot'}
                  </div>
                </div>

                <div style={{ background: '#0b1c30', borderRadius: 8, padding: 12, border: '1px solid #1f3654' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Clock size={13} color="#93ccff" /> Timestamp
                  </span>
                  <div style={{ fontSize: 12, fontFamily: 'var(--fo-font-mono)', color: '#ffffff' }}>
                    {formatDateTime(viewingRequest.createdAt)}
                  </div>
                  <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'var(--fo-font-mono)', marginTop: 2 }}>
                    IST Verified
                  </div>
                </div>
              </div>

              {/* Voice Player & Description */}
              {(viewingRequest.voiceUrl || viewingRequest.photoUrl || viewingRequest.description) && (
                <div style={{ background: '#0b1c30', borderRadius: 8, padding: 14, border: '1px solid #1f3654', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase' }}>
                    Driver Evidence &amp; Telemetry Note
                  </span>
                  {viewingRequest.voiceUrl && (
                    <audio controls src={viewingRequest.voiceUrl} style={{ width: '100%', height: 36 }} />
                  )}
                  {viewingRequest.description && (
                    <p style={{ margin: 0, fontSize: 12, color: '#d3e4fe', fontStyle: 'italic', background: '#102034', padding: 10, borderRadius: 6, border: '1px solid #1f3654' }}>
                      "{viewingRequest.description}"
                    </p>
                  )}
                </div>
              )}

              {/* Itemized Return Tracking Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
                      Issued Items &mdash; Return Tracking
                    </h3>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: 'var(--fo-font-mono)',
                        background: '#162942',
                        color: '#93ccff',
                        border: '1px solid #1f3654',
                      }}
                    >
                      {getReturnStatus(viewingRequest).totalItems} items / {getReturnStatus(viewingRequest).returnedItems} returned
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f' }}>
                    Audit Protocol #ISO-9001
                  </span>
                </div>

                {returnError && (
                  <div style={{ padding: 8, fontSize: 12, color: '#ffb4ab', background: 'rgba(239,68,68,0.15)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)' }}>
                    {returnError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(() => {
                    const ret = getReturnStatus(viewingRequest);
                    const items = ret.items.length > 0 ? ret.items : [
                      {
                        name: viewingRequest.issuedPartName || viewingRequest.partName || 'Brake Pad Assembly',
                        quantity: viewingRequest.issuedQty || viewingRequest.quantity || 2,
                        serialNumber: viewingRequest.issuedPartNo || 'BP-2024-001',
                        returned: Boolean(viewingRequest.returnedPartNo),
                        returnedAt: viewingRequest.returnedPartNo ? viewingRequest.updatedAt : null,
                      },
                    ];

                    return items.map((item, idx) => {
                      const isReturned = Boolean(item.returned);
                      const isChecked = Boolean(returnChecked[idx]);

                      return (
                        <div
                          key={idx}
                          style={{
                            background: '#0b1c30',
                            borderRadius: 8,
                            padding: '10px 14px',
                            border: '1px solid #1f3654',
                            borderLeft: `4px solid ${isReturned ? '#10b981' : '#f59e0b'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                              type="checkbox"
                              checked={isReturned || isChecked}
                              disabled={isReturned || returnLoading}
                              onChange={(e) => {
                                if (isReturned) return;
                                setReturnChecked((prev) => ({ ...prev, [idx]: e.target.checked }));
                              }}
                              style={{ width: 16, height: 16, accentColor: '#3b82f6', cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                                {item.name} <span style={{ color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>(Qty x{item.quantity})</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                                S/N: {item.serialNumber || 'SN-REQ-001'}
                              </div>
                            </div>
                          </div>

                          <div>
                            {isReturned ? (
                              <span
                                className="fo-spare-status-badge"
                                style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                              >
                                <Check size={11} /> Returned {item.returnedAt ? `(${formatDateTime(item.returnedAt).slice(-8)})` : ''}
                              </span>
                            ) : (
                              <span
                                className="fo-spare-status-badge"
                                style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fed65b', border: '1px solid rgba(245, 158, 11, 0.4)' }}
                              >
                                <Clock size={11} /> Pending Return
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Return Action Confirm Bar - Only displayed when items are pending return */}
                {getReturnStatus(viewingRequest).pendingItems > 0 && (
                  <div style={{ background: '#0b1c30', padding: '10px 14px', borderRadius: 8, border: '1px solid #1f3654', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                      <strong style={{ color: '#ffffff' }}>{Object.values(returnChecked).filter(Boolean).length}</strong> item(s) selected for return
                    </div>
                    <button
                      type="button"
                      className="fo-spare-btn-primary"
                      disabled={returnLoading || !Object.values(returnChecked).some(Boolean)}
                      onClick={handleConfirmReturns}
                    >
                      {returnLoading ? 'Updating…' : 'Confirm Selected Returns'}
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="fo-spare-modal-foot">
                <button
                  type="button"
                  className="fo-spare-btn-ghost"
                  onClick={() => setViewingRequest(null)}
                >
                  Close
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

                  {canPrepareIssue && viewingRequest.status === 'PENDING_APPROVAL' && (
                    <>
                      <button
                        type="button"
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ffb4ab',
                          padding: '8px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          const r = viewingRequest;
                          setViewingRequest(null);
                          handleOpenReject(r);
                        }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="fo-spare-btn-primary"
                        onClick={() => {
                          const r = viewingRequest;
                          setViewingRequest(null);
                          handleOpenProposeIssue(r);
                        }}
                      >
                        {isSuper ? 'Direct Issue' : 'Prepare Issue'}
                      </button>
                    </>
                  )}

                  {isSuper && viewingRequest.status === 'ISSUE_PENDING_APPROVAL' && (
                    <>
                      <button
                        type="button"
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ffb4ab',
                          padding: '8px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          const r = viewingRequest;
                          setViewingRequest(null);
                          handleOpenReject(r);
                        }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        style={{
                          background: '#10b981',
                          border: '1px solid #10b981',
                          color: '#ffffff',
                          padding: '8px 16px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          const r = viewingRequest;
                          setViewingRequest(null);
                          handleOpenApproveModal(r);
                        }}
                      >
                        Approve &amp; Release
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prepare / Propose Issue Modal */}
        {issuingRequest && (
          <div className="fo-spare-modal-backdrop">
            <div className="fo-spare-modal-dialog" style={{ maxWidth: 540 }}>
              <div className="fo-spare-modal-head">
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                  <Wrench size={18} color="#93ccff" /> {isSuper ? 'Direct Stock Issue' : 'Prepare Requisition'} #{issuingRequest.requestNo}
                </h3>
                <button type="button" className="fo-spare-modal-close" onClick={() => setIssuingRequest(null)}>
                  <X size={18} />
                </button>
              </div>

              {actionError && <ErrorBanner error={actionError} />}

              <form onSubmit={handleProposeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Select Warehouse *
                  </label>
                  <select
                    className="fo-spare-filter-select"
                    style={{ width: '100%' }}
                    value={issueWarehouseId}
                    onChange={(e) => setIssueWarehouseId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Warehouse --</option>
                    {warehousesList.filter((w) => w.isActive).map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Requisition Type *
                  </label>
                  <select
                    className="fo-spare-filter-select"
                    style={{ width: '100%' }}
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as SparePartType)}
                  >
                    <option value="NEW">New Part</option>
                    <option value="EXCHANGE">Core Exchange</option>
                  </select>
                </div>

                <div style={{ background: '#0b1c30', padding: 12, borderRadius: 8, border: '1px solid #1f3654', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase' }}>
                      Product Items *
                    </span>
                    <button type="button" style={{ background: 'transparent', border: 'none', color: '#93ccff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} onClick={handleAddProductItem}>
                      + Add
                    </button>
                  </div>
                  {issueProductItems.map((item, idx) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '6fr 2fr 3fr 1fr', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        className="fo-spare-search-input"
                        placeholder="Product name"
                        value={item.name}
                        onChange={(e) => handleUpdateProductItem(idx, 'name', e.target.value)}
                        required
                        style={{ padding: '0 10px' }}
                      />
                      <input
                        type="number"
                        min={1}
                        className="fo-spare-search-input"
                        value={item.quantity}
                        onChange={(e) => handleUpdateProductItem(idx, 'quantity', e.target.value)}
                        required
                        style={{ textAlign: 'center', padding: '0 4px' }}
                      />
                      <input
                        type="text"
                        className="fo-spare-search-input"
                        placeholder="Serial"
                        value={item.serialNumber}
                        onChange={(e) => handleUpdateProductItem(idx, 'serialNumber', e.target.value)}
                        style={{ padding: '0 10px' }}
                      />
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                        onClick={() => handleDeleteProductItem(idx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Admin Notes
                  </label>
                  <textarea
                    className="fo-spare-search-input"
                    rows={2}
                    style={{ height: 'auto', padding: 8 }}
                    placeholder="Optional fulfillment remarks..."
                    value={issueNotes}
                    onChange={(e) => setIssueNotes(e.target.value)}
                  />
                </div>

                <div className="fo-spare-modal-foot">
                  <button type="button" className="fo-spare-btn-ghost" onClick={() => setIssuingRequest(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="fo-spare-btn-primary" disabled={actionLoading}>
                    {actionLoading ? 'Saving…' : isSuper ? 'Confirm & Issue' : 'Submit for SuperAdmin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SuperAdmin Approval Modal */}
        {approvingRequest && (
          <div className="fo-spare-modal-backdrop">
            <div className="fo-spare-modal-dialog" style={{ maxWidth: 540 }}>
              <div className="fo-spare-modal-head">
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                  <ShieldCheck size={18} color="#10b981" /> SuperAdmin Sign-Off #{approvingRequest.requestNo}
                </h3>
                <button type="button" className="fo-spare-modal-close" onClick={() => setApprovingRequest(null)}>
                  <X size={18} />
                </button>
              </div>

              {actionError && <ErrorBanner error={actionError} />}

              <form onSubmit={handleSuperAdminApprove} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#0b1c30', padding: 12, borderRadius: 8, border: '1px solid #1f3654', fontSize: 12, color: '#8c909f' }}>
                  Prepared by: <strong style={{ color: '#ffffff' }}>{approvingRequest.issueProposedBy?.firstName || 'Admin'}</strong> &bull; Vehicle: <strong style={{ color: '#ffffff' }}>{approvingRequest.vehicle?.plateNumber}</strong>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Select Warehouse *
                  </label>
                  <select
                    className="fo-spare-filter-select"
                    style={{ width: '100%' }}
                    value={issueWarehouseId}
                    onChange={(e) => setIssueWarehouseId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Warehouse --</option>
                    {warehousesList.filter((w) => w.isActive).map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div className="fo-spare-modal-foot">
                  <button type="button" className="fo-spare-btn-ghost" onClick={() => setApprovingRequest(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="fo-spare-btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }} disabled={actionLoading}>
                    {actionLoading ? 'Approving…' : 'Approve & Release Stock'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reject Request Modal */}
        {rejectingRequest && (
          <div className="fo-spare-modal-backdrop">
            <div className="fo-spare-modal-dialog" style={{ maxWidth: 480 }}>
              <div className="fo-spare-modal-head">
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffb4ab' }}>
                  <X size={18} color="#ef4444" /> Reject Requisition #{rejectingRequest.requestNo}
                </h3>
                <button type="button" className="fo-spare-modal-close" onClick={() => setRejectingRequest(null)}>
                  <X size={18} />
                </button>
              </div>

              {actionError && <ErrorBanner error={actionError} />}

              <form onSubmit={handleRejectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#0b1c30', padding: 12, borderRadius: 8, border: '1px solid #1f3654', fontSize: 12, color: '#8c909f' }}>
                  Vehicle: <strong style={{ color: '#ffffff' }}>{rejectingRequest.vehicle?.plateNumber}</strong> &bull; Part: <strong style={{ color: '#ffffff' }}>{rejectingRequest.partName}</strong>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Rejection Reason *
                  </label>
                  <textarea
                    className="fo-spare-search-input"
                    rows={3}
                    style={{ height: 'auto', padding: 8 }}
                    placeholder="Explain why this request is being rejected..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    required
                  />
                </div>

                <div className="fo-spare-modal-foot">
                  <button type="button" className="fo-spare-btn-ghost" onClick={() => setRejectingRequest(null)}>
                    Cancel
                  </button>
                  <button type="submit" style={{ background: '#ef4444', border: '1px solid #ef4444', color: '#ffffff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }} disabled={actionLoading}>
                    {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Warehouse Provision / Edit Modal */}
        {showWarehouseModal && (
          <div className="fo-spare-modal-backdrop" onClick={() => setShowWarehouseModal(false)}>
            <div className="fo-spare-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
              <div className="fo-spare-modal-head">
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                  <WarehouseIcon size={18} color="#93ccff" /> {editingWarehouse ? 'Edit Warehouse Depot' : 'Provision New Warehouse Depot'}
                </h3>
                <button type="button" className="fo-spare-modal-close" onClick={() => setShowWarehouseModal(false)}>
                  <X size={18} />
                </button>
              </div>

              {actionError && <ErrorBanner error={actionError} />}

              <form onSubmit={handleWarehouseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Depot Name *
                  </label>
                  <input
                    type="text"
                    className="fo-spare-search-input"
                    placeholder="e.g. Kolkata Central Warehouse"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    required
                    style={{ padding: '0 10px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Depot Code #
                    </label>
                    <input
                      type="text"
                      className="fo-spare-search-input"
                      placeholder="e.g. 52365"
                      value={whCode}
                      onChange={(e) => setWhCode(e.target.value)}
                      style={{ padding: '0 10px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Operational Status
                    </label>
                    <select
                      className="fo-spare-filter-select"
                      style={{ width: '100%' }}
                      value={whIsActive ? 'ACTIVE' : 'INACTIVE'}
                      onChange={(e) => setWhIsActive(e.target.value === 'ACTIVE')}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Location Address
                  </label>
                  <input
                    type="text"
                    className="fo-spare-search-input"
                    placeholder="e.g. Eastern Hub Depot 4, Sector 5, Kolkata"
                    value={whLocation}
                    onChange={(e) => setWhLocation(e.target.value)}
                    style={{ padding: '0 10px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Contact Person / Manager
                    </label>
                    <input
                      type="text"
                      className="fo-spare-search-input"
                      placeholder="e.g. Rajesh Kumar"
                      value={whContactPerson}
                      onChange={(e) => setWhContactPerson(e.target.value)}
                      style={{ padding: '0 10px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      className="fo-spare-search-input"
                      placeholder="e.g. +91 98765 43210"
                      value={whContactPhone}
                      onChange={(e) => setWhContactPhone(e.target.value)}
                      style={{ padding: '0 10px' }}
                    />
                  </div>
                </div>

                <div className="fo-spare-modal-foot">
                  <button type="button" className="fo-spare-btn-ghost" onClick={() => setShowWarehouseModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="fo-spare-btn-primary" disabled={actionLoading}>
                    {actionLoading ? 'Saving…' : editingWarehouse ? 'Update Warehouse' : 'Save & Provision'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
