import { useMemo, useState, useRef, useEffect, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { VehiclePublic, DriverListItem, UserPublic } from '@driver-complaint/shared-types';
import {
  Truck,
  RotateCw,
  Search,
  X,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  ChevronDown,
  Check,
  UserX,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { useApiResource } from '../hooks/useApiResource';

const WHEEL_OPTIONS = [
  '4 Wheeler',
  '6 Wheeler',
  '10 Wheeler',
  '12 Wheeler',
  '14 Wheeler',
  '16 Wheeler',
  '18 Wheeler',
  '22 Wheeler',
];

const AGREEMENT_STATUS_OPTIONS = [
  { value: 'FMS Pack 1', label: 'FMS Pack 1', colorVar: '#0284c7', bgVar: 'rgba(2, 132, 199, 0.12)', borderVar: 'rgba(2, 132, 199, 0.3)' },
  { value: 'Platinum Plus', label: 'Platinum Plus', colorVar: '#9333ea', bgVar: 'rgba(147, 51, 234, 0.12)', borderVar: 'rgba(147, 51, 234, 0.3)' },
  { value: 'Platinum:ComprehensiveCovrg', label: 'Platinum:ComprehensiveCovrg', colorVar: '#059669', bgVar: 'rgba(5, 150, 105, 0.12)', borderVar: 'rgba(5, 150, 105, 0.3)' },
];

/** Inline Searchable Driver Dropdown Selector Component */
function InlineDriverSelect({
  vehicle,
  driversList,
  driverAssignedVehicleMap,
  onAssign,
  isUpdating,
}: {
  vehicle: VehiclePublic;
  driversList: DriverListItem[];
  driverAssignedVehicleMap: Map<string, { vehicleId: string; plateNumber: string; driverName: string }>;
  onAssign: (vehicleId: string, driverId: string | null) => Promise<void>;
  isUpdating: boolean;
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const top = openUpwards ? Math.max(8, rect.top - dropdownHeight - 6) : rect.bottom + 6;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 310);
    setCoords({ top, left });
  };

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleScrollOrResize() {
      if (isOpen) {
        updatePosition();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const filteredDrivers = useMemo(() => {
    if (!search.trim()) return driversList;
    const q = search.toLowerCase();
    return driversList.filter(
      (d) =>
        d.firstName.toLowerCase().includes(q) ||
        d.lastName.toLowerCase().includes(q) ||
        d.employeeId.toLowerCase().includes(q) ||
        (d.licenseNumber && d.licenseNumber.toLowerCase().includes(q)),
    );
  }, [driversList, search]);

  const handleSelect = async (dId: string | null) => {
    if (dId) {
      const assigned = driverAssignedVehicleMap.get(dId);
      if (assigned && assigned.vehicleId !== vehicle.id) {
        const driverObj = driversList.find((d) => d.id === dId);
        const dName = driverObj ? `${driverObj.firstName} ${driverObj.lastName}` : 'Driver';
        alert(
          `Driver ${dName} is already assigned on vehicle "${assigned.plateNumber}".\n\nPlease free from vehicle "${assigned.plateNumber}" first then assign to a new vehicle.`
        );
        return;
      }
    }
    setIsOpen(false);
    await onAssign(vehicle.id, dId);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={isUpdating}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 8,
          background: vehicle.driverName ? 'var(--surface)' : 'rgba(16, 185, 129, 0.12)',
          border: vehicle.driverName ? '1px solid var(--border)' : '1px solid rgba(16, 185, 129, 0.35)',
          color: vehicle.driverName ? 'var(--text)' : 'var(--success-text)',
          cursor: isUpdating ? 'wait' : 'pointer',
          fontSize: 13,
          fontWeight: 700,
          transition: 'all 0.15s ease',
          outline: 'none',
        }}
        title="Click to assign, change or unassign driver"
      >
        {isUpdating ? (
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RotateCw size={12} className="spin" /> Updating…
          </span>
        ) : vehicle.driverName ? (
          <>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {vehicle.driverName[0]}
            </span>
            <span style={{ fontWeight: 700 }}>{vehicle.driverName}</span>
            <ChevronDown size={14} style={{ color: 'var(--muted)', marginLeft: 2 }} />
          </>
        ) : (
          <>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success-text)' }} />
            <span>Free / Unassigned</span>
            <ChevronDown size={14} style={{ color: 'var(--success-text)', marginLeft: 2 }} />
          </>
        )}
      </button>

      {/* Popover Dropdown Menu (Rendered in Portal to escape table/card clipping) */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 999999,
              width: 300,
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.6), 0 8px 16px -4px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.12s ease-out',
            }}
          >
            {/* Search Box Header */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '5px 10px',
                }}
              >
                <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search driver by name or ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'none',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--text)',
                    width: '100%',
                  }}
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Options List */}
            <div style={{ maxHeight: 250, overflowY: 'auto', padding: '6px' }}>
              {/* Unassign / Free Vehicle Option */}
              <button
                type="button"
                onClick={() => handleSelect(null)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: !vehicle.driverId ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  color: !vehicle.driverId ? 'var(--success-text)' : 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13,
                  fontWeight: !vehicle.driverId ? 800 : 500,
                  marginBottom: 4,
                }}
                onMouseEnter={(e) => {
                  if (vehicle.driverId) e.currentTarget.style.backgroundColor = 'var(--bg)';
                }}
                onMouseLeave={(e) => {
                  if (vehicle.driverId) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.2)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--success-text)',
                    }}
                  >
                    <UserX size={13} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 700 }}>Unassign Driver</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Mark vehicle as Free / Available</div>
                  </div>
                </div>
                {!vehicle.driverId && <Check size={16} color="var(--success-text)" />}
              </button>

              <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />

              {/* Drivers List */}
              {filteredDrivers.length === 0 ? (
                <div style={{ padding: '16px 8px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  No drivers found matching "{search}"
                </div>
              ) : (
                filteredDrivers.map((driver) => {
                  const isSelected = vehicle.driverId === driver.id;
                  const assignedInfo = driverAssignedVehicleMap.get(driver.id);
                  const isAssignedToOther = Boolean(assignedInfo && assignedInfo.vehicleId !== vehicle.id);

                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => handleSelect(driver.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: 'none',
                        background: isSelected
                          ? 'rgba(59, 130, 246, 0.15)'
                          : isAssignedToOther
                          ? 'rgba(239, 68, 68, 0.04)'
                          : 'transparent',
                        color: isSelected ? 'var(--accent)' : 'var(--text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        marginBottom: 2,
                        opacity: isAssignedToOther ? 0.75 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = isAssignedToOther ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = isAssignedToOther ? 'rgba(239, 68, 68, 0.04)' : 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: isSelected ? 'var(--accent)' : isAssignedToOther ? 'rgba(239, 68, 68, 0.15)' : 'var(--border)',
                            color: isSelected ? '#ffffff' : isAssignedToOther ? 'var(--danger-text)' : 'var(--text)',
                            fontSize: 11,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {driver.firstName[0]}
                        </span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>
                              {driver.firstName} {driver.lastName}
                            </span>
                            {isAssignedToOther && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  backgroundColor: 'var(--danger-bg)',
                                  color: 'var(--danger-text)',
                                  border: '1px solid var(--danger-border)',
                                  fontWeight: 700,
                                }}
                              >
                                On {assignedInfo!.plateNumber}
                              </span>
                            )}
                            {!assignedInfo && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                  color: 'var(--success-text)',
                                  fontWeight: 600,
                                }}
                              >
                                Free
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            ID: {driver.employeeId} {driver.licenseNumber ? `• Lic: ${driver.licenseNumber}` : ''}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check size={16} color="var(--accent)" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function VehiclesPage(): ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [wheelFilter, setWheelFilter] = useState('ALL');
  const [assignmentFilter, setAssignmentFilter] = useState<'ALL' | 'ASSIGNED' | 'FREE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [updatingDriverVehicleId, setUpdatingDriverVehicleId] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehiclePublic | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form Fields
  const [plateNumber, setPlateNumber] = useState('');
  const [model, setModel] = useState('');
  const [registrationDate, setRegistrationDate] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [wheels, setWheels] = useState('10 Wheeler');
  const [agreementStatus, setAgreementStatus] = useState('FMS Pack 1');
  const [make, setMake] = useState('');
  const [year, setYear] = useState<string>('');
  const [driverId, setDriverId] = useState<string>('');
  const [siteInchargeId, setSiteInchargeId] = useState<string>('');

  const vehiclesResource = useApiResource('vehicles:list', () => api.vehicles.list());
  const driversResource = useApiResource('drivers:list', () => api.drivers.list());
  const usersResource = useApiResource('users:admins', () => api.users.list());

  const vehiclesList: VehiclePublic[] = vehiclesResource.data ?? [];
  const driversList: DriverListItem[] = driversResource.data ?? [];
  const allUsers: UserPublic[] = usersResource.data ?? [];
  const adminMap = useMemo(() => {
    const map = new Map<string, UserPublic>();
    for (const u of allUsers) {
      if (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') {
        map.set(u.id, u);
      }
    }
    return map;
  }, [allUsers]);

  const siteInchargesList = useMemo(() => {
    return allUsers
      .filter((u) => u.role === 'EXECUTIVE' && u.isActive)
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [allUsers]);

  // Map of driverId -> assigned vehicle details (for 1:1 driver assignment enforcement)
  const driverAssignedVehicleMap = useMemo(() => {
    const map = new Map<string, { vehicleId: string; plateNumber: string; driverName: string }>();
    for (const v of vehiclesList) {
      if (v.driverId) {
        map.set(v.driverId, {
          vehicleId: v.id,
          plateNumber: v.plateNumber,
          driverName: v.driverName || 'Driver',
        });
      }
    }
    return map;
  }, [vehiclesList]);

  // Filter vehicles
  const filteredVehicles = useMemo(() => {
    return vehiclesList.filter((v) => {
      if (statusFilter !== 'ALL') {
        const vStatus = (v.agreementStatus || 'Active').toLowerCase();
        const target = statusFilter.toLowerCase();
        if (vStatus !== target && v.agreementStatus !== statusFilter) {
          return false;
        }
      }
      if (wheelFilter !== 'ALL' && (v.wheels || '') !== wheelFilter) {
        return false;
      }
      if (assignmentFilter === 'ASSIGNED' && !v.driverId) {
        return false;
      }
      if (assignmentFilter === 'FREE' && Boolean(v.driverId)) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const plateMatch = v.plateNumber.toLowerCase().includes(q);
      const modelMatch = v.model ? v.model.toLowerCase().includes(q) : false;
      const makeMatch = v.make ? v.make.toLowerCase().includes(q) : false;
      const modelNoMatch = v.modelNumber ? v.modelNumber.toLowerCase().includes(q) : false;
      const chassisMatch = v.chassisNumber ? v.chassisNumber.toLowerCase().includes(q) : false;
      const vinMatch = v.vin ? v.vin.toLowerCase().includes(q) : false;
      const driverMatch = v.driverName ? v.driverName.toLowerCase().includes(q) : false;
      const siteInchargeMatch = v.siteInchargeName ? v.siteInchargeName.toLowerCase().includes(q) : false;
      const yearMatch = v.year ? v.year.toString().includes(q) : false;
      return plateMatch || modelMatch || makeMatch || modelNoMatch || chassisMatch || vinMatch || driverMatch || siteInchargeMatch || yearMatch;
    });
  }, [vehiclesList, statusFilter, wheelFilter, assignmentFilter, searchQuery]);

  const totalItems = filteredVehicles.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  const paginatedVehicles = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredVehicles.slice(start, start + pageSize);
  }, [filteredVehicles, page, pageSize]);

  // KPI Metrics
  const activeAgreementsCount = vehiclesList.filter((v) => {
    const s = (v.agreementStatus || 'ACTIVE').toUpperCase();
    return s === 'ACTIVE' || s.includes('FMS') || s.includes('PLATINUM');
  }).length;
  const freeVehiclesCount = vehiclesList.filter((v) => !v.driverId).length;
  const assignedVehiclesCount = vehiclesList.filter((v) => Boolean(v.driverId)).length;

  const handleOpenCreate = () => {
    setEditingVehicle(null);
    setPlateNumber('');
    setModel('');
    setRegistrationDate('');
    setModelNumber('');
    setChassisNumber('');
    setWheels('10 Wheeler');
    setAgreementStatus('FMS Pack 1');
    setMake('');
    setYear(new Date().getFullYear().toString());
    setDriverId('');
    setSiteInchargeId('');
    setModalError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (vehicle: VehiclePublic) => {
    setEditingVehicle(vehicle);
    setPlateNumber(vehicle.plateNumber);
    setModel(vehicle.model || '');
    setRegistrationDate(vehicle.registrationDate ? vehicle.registrationDate.substring(0, 10) : '');
    setModelNumber(vehicle.modelNumber || '');
    setChassisNumber(vehicle.chassisNumber || vehicle.vin || '');
    setWheels(vehicle.wheels || '10 Wheeler');
    setAgreementStatus(vehicle.agreementStatus || 'FMS Pack 1');
    setMake(vehicle.make || '');
    setYear(vehicle.year ? vehicle.year.toString() : '');
    setDriverId(vehicle.driverId || '');
    setSiteInchargeId(vehicle.siteInchargeId || '');
    setModalError(null);
    setShowModal(true);
  };

  // Quick Inline Driver Assignment
  const handleInlineAssignDriver = async (vehicleId: string, newDriverId: string | null) => {
    try {
      setUpdatingDriverVehicleId(vehicleId);
      await api.vehicles.update(vehicleId, { driverId: newDriverId ? newDriverId : null });
      void vehiclesResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to update driver assignment');
    } finally {
      setUpdatingDriverVehicleId(null);
    }
  };

  const handleSubmitVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const normPlate = plateNumber.trim().toUpperCase();
    if (!normPlate) {
      setModalError('Vehicle Number is required.');
      return;
    }

    // 1. Uniqueness check for Vehicle Number (Plate)
    const dupPlate = vehiclesList.find(
      (v) => v.plateNumber.toUpperCase() === normPlate && v.id !== editingVehicle?.id
    );
    if (dupPlate) {
      setModalError(`Vehicle Number "${normPlate}" already exists in the fleet.`);
      return;
    }

    // 2. Uniqueness check for Chassis No (VIN)
    const normChassis = chassisNumber.trim().toUpperCase();
    if (normChassis) {
      const dupChassis = vehiclesList.find(
        (v) =>
          ((v.chassisNumber && v.chassisNumber.toUpperCase() === normChassis) ||
            (v.vin && v.vin.toUpperCase() === normChassis)) &&
          v.id !== editingVehicle?.id
      );
      if (dupChassis) {
        setModalError(
          `Chassis No (VIN) "${normChassis}" already exists (registered on vehicle "${dupChassis.plateNumber}").`
        );
        return;
      }
    }

    // 3. Driver 1:1 Assignment Validation
    const trimmedDriverId = driverId.trim();
    if (trimmedDriverId) {
      const assigned = driverAssignedVehicleMap.get(trimmedDriverId);
      if (assigned && assigned.vehicleId !== editingVehicle?.id) {
        const driverObj = driversList.find((d) => d.id === trimmedDriverId);
        const dName = driverObj ? `${driverObj.firstName} ${driverObj.lastName}` : 'Driver';
        const errMsg = `Driver ${dName} is already assigned on vehicle "${assigned.plateNumber}". Please free from that vehicle first then assign to a new vehicle.`;
        alert(errMsg);
        setModalError(errMsg);
        return;
      }
    }

    let parsedYear: number | undefined = undefined;
    if (year.trim()) {
      const y = parseInt(year.trim(), 10);
      const currentYear = new Date().getFullYear();
      if (isNaN(y) || y < 1990 || y > currentYear + 2) {
        setModalError(`Year must be a valid 4-digit year between 1990 and ${currentYear + 2}.`);
        return;
      }
      parsedYear = y;
    }

    try {
      setSubmitting(true);
      const payload = {
        plateNumber: normPlate,
        model: model.trim() || undefined,
        make: make.trim() || undefined,
        modelNumber: modelNumber.trim() || undefined,
        registrationDate: registrationDate.trim() || undefined,
        chassisNumber: normChassis || undefined,
        wheels: wheels.trim() || undefined,
        agreementStatus: agreementStatus.trim() || 'FMS Pack 1',
        year: parsedYear,
        vin: normChassis || undefined,
        driverId: trimmedDriverId ? trimmedDriverId : null,
        siteInchargeId: siteInchargeId.trim() ? siteInchargeId.trim() : null,
      };

      if (editingVehicle) {
        await api.vehicles.update(editingVehicle.id, payload);
      } else {
        await api.vehicles.create(payload);
      }

      setShowModal(false);
      void vehiclesResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalError(msg || 'Failed to save vehicle entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVehicle = async (vehicle: VehiclePublic) => {
    if (!confirm(`Are you sure you want to delete vehicle ${vehicle.plateNumber}? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.vehicles.remove(vehicle.id);
      void vehiclesResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to delete vehicle');
    }
  };

  const getAgreementBadge = (status?: string | null) => {
    const s = status || 'FMS Pack 1';
    const opt = AGREEMENT_STATUS_OPTIONS.find((o) => o.value.toLowerCase() === s.toLowerCase()) || {
      value: s,
      label: s,
      colorVar: 'var(--muted)',
      bgVar: 'var(--surface)',
      borderVar: 'var(--border)',
    };

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          color: opt.colorVar,
          backgroundColor: opt.bgVar,
          border: `1px solid ${opt.borderVar}`,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: opt.colorVar }} />
        {opt.label}
      </span>
    );
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'ALL' || wheelFilter !== 'ALL' || assignmentFilter !== 'ALL';

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Truck size={26} color="var(--accent)" /> Vehicle Directory & Entry
          </h1>
          <p className="page-subtitle">Manage fleet vehicles, chassis numbers, wheel configs, driver assignments, and agreement statuses</p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => vehiclesResource.reload()}
            disabled={vehiclesResource.loading}
          >
            <RotateCw size={14} style={{ marginRight: 6 }} className={vehiclesResource.loading ? 'spin' : ''} />
            {vehiclesResource.loading ? 'Refreshing…' : 'Refresh'}
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> Add Vehicle Entry
          </button>
        </div>
      </div>

      <ErrorBanner error={vehiclesResource.error} />

      {/* Stat KPI Cards Grid */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Fleet Vehicles</span>
            <Truck size={22} color="var(--accent)" />
          </div>
          <div className="stat-card-value">{vehiclesList.length}</div>
          <div className="stat-card-footer">Registered fleet units</div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-card-header">
            <span className="stat-card-title">Free / Available Vehicles</span>
            <CheckCircle2 size={22} color="var(--success-text)" />
          </div>
          <div className="stat-card-value" style={{ color: 'var(--success-text)' }}>{freeVehiclesCount}</div>
          <div className="stat-card-footer">Unassigned & ready to allocate</div>
        </div>

        <div className="stat-card stat-info">
          <div className="stat-card-header">
            <span className="stat-card-title">Assigned to Drivers</span>
            <Clock size={22} color="#0284c7" />
          </div>
          <div className="stat-card-value">{assignedVehiclesCount}</div>
          <div className="stat-card-footer">Currently operational</div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-card-header">
            <span className="stat-card-title">Active Agreements</span>
            <AlertCircle size={22} color="var(--warning-text)" />
          </div>
          <div className="stat-card-value" style={{ color: 'var(--warning-text)' }}>{activeAgreementsCount}</div>
          <div className="stat-card-footer">FMS & Platinum active packs</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="table-card">
        {/* Clean Responsive Filter Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="table-card-title" style={{ margin: 0 }}>
              Fleet Vehicle Master <span className="badge-pill">{totalItems}</span>
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 220, flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                className="filter-select"
                placeholder="Search plate, model, chassis..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                style={{ width: '100%', paddingLeft: 32, paddingRight: searchQuery ? 28 : 10 }}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            {/* Assignment Filter */}
            <select
              className="filter-select"
              value={assignmentFilter}
              onChange={(e) => {
                setAssignmentFilter(e.target.value as any);
                setPage(1);
              }}
              style={{ width: 'auto', minWidth: 150 }}
            >
              <option value="ALL">All Assignments</option>
              <option value="ASSIGNED">Assigned Only</option>
              <option value="FREE">Free / Unassigned</option>
            </select>

            {/* Agreement Status Filter */}
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: 'auto', minWidth: 170 }}
            >
              <option value="ALL">All Agreements</option>
              {AGREEMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* Wheel Filter */}
            <select
              className="filter-select"
              value={wheelFilter}
              onChange={(e) => {
                setWheelFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: 'auto', minWidth: 130 }}
            >
              <option value="ALL">All Wheels</option>
              {WHEEL_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setWheelFilter('ALL');
                  setAssignmentFilter('ALL');
                  setPage(1);
                }}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {vehiclesResource.loading && vehiclesList.length === 0 ? (
          <div className="loading-state">Loading vehicle directory…</div>
        ) : filteredVehicles.length === 0 ? (
          <div className="empty-table-state">
            <p>No vehicles found matching your search or filters.</p>
          </div>
        ) : (
          <>
            <div className="table-responsive" style={{ overflow: 'visible' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Vehicle Number</th>
                    <th>Vehicle Model</th>
                    <th>Model No</th>
                    <th>Registration Date</th>
                    <th>Chassis No (VIN)</th>
                    <th>Wheel</th>
                    <th>Site In-charge</th>
                    <th>Status of Agreements</th>
                    <th>Assigned Driver</th>
                    <th>Make & Year</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedVehicles.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              fontSize: 13,
                              letterSpacing: '0.04em',
                              padding: '5px 10px',
                              background: 'var(--bg)',
                              color: 'var(--text)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {vehicle.plateNumber}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                          {vehicle.model || '—'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {vehicle.modelNumber || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {vehicle.registrationDate
                            ? new Date(vehicle.registrationDate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            padding: '3px 8px',
                            background: 'var(--bg)',
                            color: 'var(--muted)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {vehicle.chassisNumber || vehicle.vin || '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 6,
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: 'var(--accent)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {vehicle.wheels || '10 Wheeler'}
                        </span>
                      </td>
                      <td>
                        {(() => {
                          const execUser = allUsers.find((u) => u.id === vehicle.siteInchargeId);
                          const name = vehicle.siteInchargeName || (execUser ? `${execUser.firstName} ${execUser.lastName}` : null);
                          const siteName = vehicle.siteInchargeSite || execUser?.site;
                          if (!name) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>;
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                padding: '4px 8px',
                                borderRadius: 6,
                                background: 'rgba(59, 130, 246, 0.12)',
                                color: 'var(--accent)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span>👤 {name}</span>
                              {siteName && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                    color: 'var(--text)',
                                  }}
                                >
                                  {siteName}
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td>{getAgreementBadge(vehicle.agreementStatus)}</td>
                      <td>
                        {/* Inline Searchable Driver Dropdown with Right-Checkmark Icon */}
                        <InlineDriverSelect
                          vehicle={vehicle}
                          driversList={driversList}
                          driverAssignedVehicleMap={driverAssignedVehicleMap}
                          onAssign={handleInlineAssignDriver}
                          isUpdating={updatingDriverVehicleId === vehicle.id}
                        />
                      </td>
                      <td>
                        <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {vehicle.make ? <span style={{ fontWeight: 600 }}>{vehicle.make}</span> : null}
                          {vehicle.year ? (
                            <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: vehicle.make ? 4 : 0 }}>
                              {vehicle.make ? `(${vehicle.year})` : vehicle.year}
                            </span>
                          ) : null}
                          {!vehicle.make && !vehicle.year && <span style={{ color: 'var(--muted)' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(vehicle)}
                            title="Edit Vehicle Details"
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--bg)',
                              color: 'var(--accent)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVehicle(vehicle)}
                            title="Delete Vehicle"
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--danger-border)',
                              background: 'var(--danger-bg)',
                              color: 'var(--danger-text)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
              itemLabel="vehicle"
            />
          </>
        )}
      </div>

      {/* Add / Edit Vehicle Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 640,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              color: 'var(--text)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--bg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                    {editingVehicle ? 'Edit Vehicle Entry' : 'New Fleet Vehicle Entry'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                    Fill out registration details, wheel specs & agreement status
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSubmitVehicle} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {modalError && (
                <div
                  style={{
                    backgroundColor: 'var(--danger-bg)',
                    color: 'var(--danger-text)',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--danger-border)',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                  <div>{modalError}</div>
                </div>
              )}

              {/* Row 1: Vehicle Number & Model */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Vehicle Number <span style={{ color: 'var(--danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="filter-select"
                    placeholder="e.g. MH-12-AB-1234"
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                    style={{ width: '100%', textTransform: 'uppercase', fontWeight: 700 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Vehicle Model
                  </label>
                  <input
                    type="text"
                    className="filter-select"
                    placeholder="e.g. Tata Signa, Ashok Leyland"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Row 2: Registration Date & Model No */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Registration Date
                  </label>
                  <input
                    type="date"
                    className="filter-select"
                    value={registrationDate}
                    onChange={(e) => setRegistrationDate(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Model No
                  </label>
                  <input
                    type="text"
                    className="filter-select"
                    placeholder="e.g. 4825.TK, 2820.T, 6028"
                    value={modelNumber}
                    onChange={(e) => setModelNumber(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Row 3: Chassis No & Wheel Configuration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Chassis No (VIN)
                  </label>
                  <input
                    type="text"
                    className="filter-select"
                    placeholder="e.g. MAT612034XYZ56789"
                    value={chassisNumber}
                    onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Wheel
                  </label>
                  <select
                    className="filter-select"
                    value={wheels}
                    onChange={(e) => setWheels(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {WHEEL_OPTIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Site In-charge & Status of Agreements */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Select Under Site In-charge (Executive)
                  </label>
                  <select
                    className="filter-select"
                    value={siteInchargeId}
                    onChange={(e) => setSiteInchargeId(e.target.value)}
                    style={{ width: '100%', fontWeight: 600 }}
                  >
                    <option value="">-- Select Site In-charge (Executive) --</option>
                    {siteInchargesList.length === 0 ? (
                      <option value="" disabled>No active Executives found</option>
                    ) : (
                      siteInchargesList.map((user) => {
                        const supervisingAdmin = user.createdByAdminId ? adminMap.get(user.createdByAdminId) : null;
                        const adminPart = supervisingAdmin
                          ? ` • Under: ${supervisingAdmin.firstName} ${supervisingAdmin.lastName}${supervisingAdmin.category ? ` (${supervisingAdmin.category})` : ''}`
                          : '';
                        const sitePart = user.site ? ` • Site: ${user.site}` : ' • Site: Unassigned';
                        return (
                          <option key={user.id} value={user.id}>
                            {user.firstName} {user.lastName} ({user.employeeId}){sitePart}{adminPart}
                          </option>
                        );
                      })
                    )}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Select the executive on-ground who oversees this vehicle and its operating hub.
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Status of Agreements
                  </label>
                  <select
                    className="filter-select"
                    value={agreementStatus}
                    onChange={(e) => setAgreementStatus(e.target.value)}
                    style={{ width: '100%', fontWeight: 700, color: 'var(--accent)' }}
                  >
                    {AGREEMENT_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4b: Assigned Driver */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                  Assigned Driver
                </label>
                <select
                  className="filter-select"
                  value={driverId}
                  onChange={(e) => {
                    const selectedVal = e.target.value;
                    if (selectedVal) {
                      const assignedInfo = driverAssignedVehicleMap.get(selectedVal);
                      if (assignedInfo && assignedInfo.vehicleId !== editingVehicle?.id) {
                        const driverObj = driversList.find((d) => d.id === selectedVal);
                        const dName = driverObj ? `${driverObj.firstName} ${driverObj.lastName}` : 'This driver';
                        alert(
                          `Driver ${dName} is already assigned on vehicle "${assignedInfo.plateNumber}".\n\nPlease free from vehicle "${assignedInfo.plateNumber}" first then assign to a new vehicle.`
                        );
                        setModalError(`Driver ${dName} is already assigned on vehicle "${assignedInfo.plateNumber}". Please free from that vehicle first.`);
                        setDriverId('');
                        return;
                      }
                    }
                    setModalError(null);
                    setDriverId(selectedVal);
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="">-- No Driver (Free / Unassigned Vehicle) --</option>
                  {driversList.map((d) => {
                    const assignedInfo = driverAssignedVehicleMap.get(d.id);
                    const isAssignedElsewhere = Boolean(assignedInfo && assignedInfo.vehicleId !== editingVehicle?.id);
                    const isAssignedHere = Boolean(assignedInfo && assignedInfo.vehicleId === editingVehicle?.id);

                    return (
                      <option
                        key={d.id}
                        value={d.id}
                        style={isAssignedElsewhere ? { color: 'var(--danger-text)', fontWeight: 600 } : undefined}
                      >
                        {d.firstName} {d.lastName} ({d.employeeId}) {isAssignedElsewhere ? `[⚠️ Already on ${assignedInfo!.plateNumber}]` : isAssignedHere ? '[Currently Assigned Here]' : '[Free / Available]'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Row 5: Make & Year (Optional Details) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Manufacturer / Make (Optional)
                  </label>
                  <input
                    type="text"
                    className="filter-select"
                    placeholder="e.g. Tata Motors, BharatBenz"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Manufacturing Year (Optional)
                  </label>
                  <input
                    type="number"
                    className="filter-select"
                    placeholder="e.g. 2024"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    min="1990"
                    max="2035"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 12,
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{ minWidth: 140 }}
                >
                  {submitting ? 'Saving…' : editingVehicle ? 'Save Changes' : 'Create Vehicle Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
