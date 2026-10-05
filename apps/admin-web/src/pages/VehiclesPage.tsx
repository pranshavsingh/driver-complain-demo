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
  Clock,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  UserX,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';

const WHEEL_OPTIONS = [
  '4 Wheeler',
  '6 Wheeler',
  '10 Wheeler',
  '12 Wheeler',
  '14 Wheeler',
  '16 Wheeler',
  '18 Wheeler',
  '22 Wheeler Heavy',
];

const AGREEMENT_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'ACTIVE', colorVar: 'var(--fo-success)', bgVar: 'rgba(16, 185, 129, 0.12)', borderVar: 'rgba(16, 185, 129, 0.3)' },
  { value: 'FMS Pack 1', label: 'FMS Pack 1', colorVar: 'var(--fo-tertiary)', bgVar: 'rgba(76, 215, 246, 0.12)', borderVar: 'rgba(76, 215, 246, 0.3)' },
  { value: 'Platinum Plus', label: 'Platinum Plus', colorVar: '#a855f7', bgVar: 'rgba(168, 85, 247, 0.12)', borderVar: 'rgba(168, 85, 247, 0.3)' },
  { value: 'Platinum:ComprehensiveCovrg', label: 'Platinum:ComprehensiveCovrg', colorVar: '#06b6d4', bgVar: 'rgba(6, 182, 212, 0.12)', borderVar: 'rgba(6, 182, 212, 0.3)' },
  { value: 'LEASED', label: 'LEASED', colorVar: 'var(--fo-warning)', bgVar: 'rgba(245, 158, 11, 0.12)', borderVar: 'rgba(245, 158, 11, 0.3)' },
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
          justifyContent: 'space-between',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 6,
          background: vehicle.driverName ? 'var(--fo-surface-high)' : 'rgba(76, 215, 246, 0.12)',
          border: vehicle.driverName ? '1px solid var(--fo-border-subtle)' : '1px solid rgba(76, 215, 246, 0.3)',
          color: vehicle.driverName ? 'var(--fo-text)' : 'var(--fo-tertiary)',
          cursor: isUpdating ? 'wait' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          transition: 'all 0.15s ease',
          outline: 'none',
          whiteSpace: 'nowrap',
        }}
        title="Click to assign, change or unassign driver"
      >
        {isUpdating ? (
          <span style={{ fontSize: 11, color: 'var(--fo-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <RotateCw size={11} className="spin" /> Updating…
          </span>
        ) : vehicle.driverName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--fo-primary-container)',
                color: 'var(--fo-on-primary-container)',
                fontSize: 10,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {vehicle.driverName[0]}
            </span>
            <span style={{ fontWeight: 600 }}>{vehicle.driverName}</span>
            <ChevronDown size={13} style={{ color: 'var(--fo-text-muted)' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fo-tertiary)' }} />
            <span>Free / Unassigned</span>
            <ChevronDown size={13} style={{ color: 'var(--fo-tertiary)' }} />
          </div>
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
              backgroundColor: 'var(--fo-surface-high)',
              border: '1px solid var(--fo-border)',
              borderRadius: 12,
              boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.7), 0 8px 16px -4px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.12s ease-out',
            }}
          >
            {/* Search Box Header */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--fo-border-subtle)', backgroundColor: 'var(--fo-surface-low)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'var(--fo-surface)',
                  border: '1px solid var(--fo-border)',
                  borderRadius: 6,
                  padding: '5px 10px',
                }}
              >
                <Search size={13} style={{ color: 'var(--fo-text-muted)', flexShrink: 0 }} />
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
                    color: 'var(--fo-text)',
                    width: '100%',
                  }}
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fo-text-muted)', padding: 0 }}
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
                  borderRadius: 6,
                  border: 'none',
                  background: !vehicle.driverId ? 'rgba(76, 215, 246, 0.15)' : 'transparent',
                  color: !vehicle.driverId ? 'var(--fo-tertiary)' : 'var(--fo-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: !vehicle.driverId ? 700 : 500,
                  marginBottom: 4,
                }}
                onMouseEnter={(e) => {
                  if (vehicle.driverId) e.currentTarget.style.backgroundColor = 'var(--fo-surface)';
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
                      background: 'rgba(76, 215, 246, 0.2)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--fo-tertiary)',
                    }}
                  >
                    <UserX size={12} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Unassign Driver</div>
                    <div style={{ fontSize: 10, color: 'var(--fo-text-muted)' }}>Mark vehicle as Free / Available</div>
                  </div>
                </div>
                {!vehicle.driverId && <Check size={14} color="var(--fo-tertiary)" />}
              </button>

              <div style={{ height: 1, backgroundColor: 'var(--fo-border-subtle)', margin: '4px 0' }} />

              {/* Drivers List */}
              {filteredDrivers.length === 0 ? (
                <div style={{ padding: '16px 8px', fontSize: 12, color: 'var(--fo-text-muted)', textAlign: 'center' }}>
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
                        borderRadius: 6,
                        border: 'none',
                        background: isSelected
                          ? 'rgba(59, 130, 246, 0.18)'
                          : isAssignedToOther
                          ? 'rgba(239, 68, 68, 0.06)'
                          : 'transparent',
                        color: isSelected ? 'var(--fo-primary)' : 'var(--fo-text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        marginBottom: 2,
                        opacity: isAssignedToOther ? 0.75 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = isAssignedToOther ? 'rgba(239, 68, 68, 0.1)' : 'var(--fo-surface)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = isAssignedToOther ? 'rgba(239, 68, 68, 0.06)' : 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: isSelected ? 'var(--fo-primary)' : isAssignedToOther ? 'rgba(239, 68, 68, 0.2)' : 'var(--fo-surface)',
                            color: isSelected ? '#001a42' : isAssignedToOther ? 'var(--fo-error-text)' : 'var(--fo-text)',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {driver.firstName[0]}
                        </span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>
                              {driver.firstName} {driver.lastName}
                            </span>
                            {isAssignedToOther && (
                              <span
                                style={{
                                  fontSize: 9,
                                  padding: '1px 4px',
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                  color: 'var(--fo-error-text)',
                                  fontWeight: 700,
                                }}
                              >
                                On {assignedInfo!.plateNumber}
                              </span>
                            )}
                            {!assignedInfo && (
                              <span
                                style={{
                                  fontSize: 9,
                                  padding: '1px 4px',
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(76, 215, 246, 0.12)',
                                  color: 'var(--fo-tertiary)',
                                  fontWeight: 600,
                                }}
                              >
                                Free
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--fo-text-muted)' }}>
                            ID: {driver.employeeId} {driver.licenseNumber ? `• Lic: ${driver.licenseNumber}` : ''}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check size={14} color="var(--fo-primary)" />}
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
  const { user } = useAuth();
  const canAddVehicle = isSuperAdmin(user);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [wheelFilter, setWheelFilter] = useState('ALL');
  const [assignmentFilter, setAssignmentFilter] = useState<'ALL' | 'ASSIGNED' | 'FREE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
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
  const [agreementStatus, setAgreementStatus] = useState('ACTIVE');
  const [make, setMake] = useState('');
  const [year, setYear] = useState<string>('');
  const [driverId, setDriverId] = useState<string>('');
  const [siteInchargeId, setSiteInchargeId] = useState<string>('');

  const vehiclesResource = useApiResource('vehicles:list', () => api.vehicles.list());
  const driversResource = useApiResource('drivers:list', () => api.drivers.list());
  const usersResource = useApiResource('users:admins', () => api.users.list());
  const { subscribeCustom } = useRealtime();

  // Live Realtime Subscriptions for Vehicle Add/Edit/Delete/Assign & Driver updates
  useEffect(() => {
    const unsubCreated = subscribeCustom('vehicle:created', () => {
      void vehiclesResource.reload();
      void driversResource.reload();
    });
    const unsubUpdated = subscribeCustom('vehicle:updated', () => {
      void vehiclesResource.reload();
      void driversResource.reload();
    });
    const unsubDeleted = subscribeCustom('vehicle:deleted', () => {
      void vehiclesResource.reload();
      void driversResource.reload();
    });
    const unsubAssigned = subscribeCustom('vehicle:assigned', () => {
      void vehiclesResource.reload();
      void driversResource.reload();
    });
    const unsubUserCreated = subscribeCustom('user:created', () => {
      void driversResource.reload();
      void usersResource.reload();
    });
    const unsubUserApproved = subscribeCustom('user:approved', () => {
      void driversResource.reload();
      void usersResource.reload();
    });
    const unsubUserUpdated = subscribeCustom('user:updated', () => {
      void driversResource.reload();
      void usersResource.reload();
      void vehiclesResource.reload();
    });
    return () => {
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
      unsubAssigned();
      unsubUserCreated();
      unsubUserApproved();
      unsubUserUpdated();
    };
  }, [subscribeCustom, vehiclesResource, driversResource, usersResource]);

  const rawVehicles: VehiclePublic[] = vehiclesResource.data ?? [];
  const vehiclesList: VehiclePublic[] = useMemo(() => {
    if (user?.role === 'EXECUTIVE') {
      return rawVehicles.filter((v) => v.siteInchargeId === user.id);
    }
    return rawVehicles;
  }, [rawVehicles, user]);
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
        const vStatus = (v.agreementStatus || 'ACTIVE').toLowerCase();
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
  const fleetUtilizationPct = vehiclesList.length > 0 ? Math.round((assignedVehiclesCount / vehiclesList.length) * 100) : 0;

  const handleOpenCreate = () => {
    setEditingVehicle(null);
    setPlateNumber('');
    setModel('');
    setRegistrationDate('');
    setModelNumber('');
    setChassisNumber('');
    setWheels('10 Wheeler');
    setAgreementStatus('ACTIVE');
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
    setAgreementStatus(vehicle.agreementStatus || 'ACTIVE');
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
        agreementStatus: agreementStatus.trim() || 'ACTIVE',
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
    const s = status || 'ACTIVE';
    const opt = AGREEMENT_STATUS_OPTIONS.find((o) => o.value.toLowerCase() === s.toLowerCase()) || {
      value: s,
      label: s,
      colorVar: 'var(--fo-text-muted)',
      bgVar: 'var(--fo-surface)',
      borderVar: 'var(--fo-border-subtle)',
    };

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          color: opt.colorVar,
          backgroundColor: opt.bgVar,
          border: `1px solid ${opt.borderVar}`,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: opt.colorVar }} />
        {opt.label}
      </span>
    );
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'ALL' || wheelFilter !== 'ALL' || assignmentFilter !== 'ALL';

  return (
    <div className="fleetops-view">
      <div className="fleetops-container">
        {/* Header Section */}
        <div className="fo-mission-header">
          <div className="fo-header-glow" />
          <div className="fo-header-content">
            <div className="fo-header-titles">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 8,
                    background: 'var(--fo-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--fo-border-subtle)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  <Truck size={24} color="var(--fo-primary)" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Vehicle Directory & Entry</h1>
                    <span className="fo-live-pill">
                      <span className="fo-ping-dot" /> LIVE SYNC
                    </span>
                  </div>
                  <p className="fo-header-sub">Manage fleet vehicles, chassis numbers, wheel configs, driver assignments, and agreement statuses</p>
                </div>
              </div>
            </div>

            <div className="fo-header-actions">
              <button
                type="button"
                className="fo-btn-sync"
                onClick={() => vehiclesResource.reload()}
                disabled={vehiclesResource.loading}
              >
                <RotateCw size={14} className={vehiclesResource.loading ? 'spin' : ''} />
                <span>{vehiclesResource.loading ? 'Refreshing…' : 'Refresh'}</span>
              </button>

              {canAddVehicle && (
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: 'var(--fo-primary)',
                    color: '#001a42',
                    fontWeight: 700,
                    fontSize: 13,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(173, 198, 255, 0.3)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Plus size={16} />
                  <span>+ Add Vehicle Entry</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <ErrorBanner error={vehiclesResource.error} />

        {/* Top KPI Metric Cards (4-Column Bento Layout) */}
        <div className="fo-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {/* Card 1: Total Fleet Vehicles */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                TOTAL FLEET VEHICLES
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--fo-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Truck size={16} color="var(--fo-primary)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-text)', margin: '10px 0 6px 0' }}>
              {vehiclesList.length}
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setWheelFilter('ALL');
                setAssignmentFilter('ALL');
                setPage(1);
                document.getElementById('master-table')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--fo-primary)',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              <span>Registered fleet units</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Card 2: Free / Available */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                FREE / AVAILABLE VEHICLES
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--fo-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={16} color="var(--fo-tertiary)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-tertiary)', margin: '10px 0 6px 0' }}>
              {freeVehiclesCount}
            </div>
            <button
              type="button"
              onClick={() => {
                setAssignmentFilter('FREE');
                setPage(1);
                document.getElementById('master-table')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--fo-tertiary)',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              <span>Unassigned & ready to allocate</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Card 3: Assigned to Drivers */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                ASSIGNED TO DRIVERS
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--fo-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Clock size={16} color="var(--fo-secondary)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-secondary)', margin: '10px 0 6px 0' }}>
              {assignedVehiclesCount}
            </div>
            <button
              type="button"
              onClick={() => {
                setAssignmentFilter('ASSIGNED');
                setPage(1);
                document.getElementById('master-table')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--fo-secondary)',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              <span>Currently operational</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Card 4: Active Agreements */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                ACTIVE AGREEMENTS
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--fo-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={16} color="var(--fo-primary-accent)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-primary)', margin: '10px 0 6px 0' }}>
              {activeAgreementsCount}
            </div>
            <div style={{ color: 'var(--fo-text-muted)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span>FMS & Platinum active packs</span>
              <ChevronRight size={14} />
            </div>
          </div>
        </div>

        {/* Live Telemetry / Telematics Bar */}
        <div className="fo-telematics-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fo-ping-dot" />
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Hub Status: Optimal
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--fo-text-muted)' }}>
              <span>GPS Fix: 99.8%</span>
              <span>•</span>
              <span>Avg Route Latency: 22ms</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--fo-text-muted)', fontWeight: 600 }}>Fleet Utilization Index</span>
            <div style={{ width: 140, height: 8, borderRadius: 9999, background: 'var(--fo-surface)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${fleetUtilizationPct}%`,
                  height: '100%',
                  borderRadius: 9999,
                  background: 'linear-gradient(90deg, var(--fo-primary-accent) 0%, var(--fo-tertiary) 100%)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--fo-text)' }}>
              {fleetUtilizationPct}%
            </span>
          </div>
        </div>

        {/* Main Data Table Container */}
        <div
          id="master-table"
          style={{
            background: 'var(--fo-surface-low)',
            border: '1px solid var(--fo-border-subtle)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* Toolbar Header */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--fo-surface)',
              borderBottom: '1px solid var(--fo-border-subtle)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="font-head" style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                Fleet Vehicle Master
              </span>
              <span
                className="font-mono"
                style={{
                  padding: '2px 8px',
                  borderRadius: 9999,
                  backgroundColor: 'var(--fo-surface-high)',
                  color: 'var(--fo-primary)',
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid var(--fo-border-subtle)',
                }}
              >
                {totalItems}
              </span>
            </div>

            {/* Filter Strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
              {/* Search Box */}
              <div style={{ position: 'relative', minWidth: 200, flex: '1 1 200px', maxWidth: 280 }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--fo-text-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search plate, model, chassis..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    width: '100%',
                    height: 32,
                    paddingLeft: 30,
                    paddingRight: searchQuery ? 28 : 10,
                    backgroundColor: 'var(--fo-surface-high)',
                    border: '1px solid var(--fo-border-subtle)',
                    borderRadius: 6,
                    color: 'var(--fo-text)',
                    fontSize: 12,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {searchQuery && (
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
                      color: 'var(--fo-text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Assignment Filter */}
              <select
                value={assignmentFilter}
                onChange={(e) => {
                  setAssignmentFilter(e.target.value as any);
                  setPage(1);
                }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  backgroundColor: 'var(--fo-surface-high)',
                  border: '1px solid var(--fo-border-subtle)',
                  borderRadius: 6,
                  color: 'var(--fo-text)',
                  fontSize: 12,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Assignments</option>
                <option value="FREE">Free / Unassigned</option>
                <option value="ASSIGNED">Assigned to Drivers</option>
              </select>

              {/* Agreement Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  backgroundColor: 'var(--fo-surface-high)',
                  border: '1px solid var(--fo-border-subtle)',
                  borderRadius: 6,
                  color: 'var(--fo-text)',
                  fontSize: 12,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Agreements</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="FMS Pack 1">FMS Pack 1</option>
                <option value="Platinum Plus">Platinum Plus</option>
                <option value="Platinum:ComprehensiveCovrg">Platinum:ComprehensiveCovrg</option>
                <option value="LEASED">LEASED</option>
              </select>

              {/* Wheel Filter */}
              <select
                value={wheelFilter}
                onChange={(e) => {
                  setWheelFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  backgroundColor: 'var(--fo-surface-high)',
                  border: '1px solid var(--fo-border-subtle)',
                  borderRadius: 6,
                  color: 'var(--fo-text)',
                  fontSize: 12,
                  outline: 'none',
                  cursor: 'pointer',
                }}
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
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setWheelFilter('ALL');
                    setAssignmentFilter('ALL');
                    setPage(1);
                  }}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid var(--fo-border-subtle)',
                    background: 'var(--fo-surface-highest)',
                    color: 'var(--fo-text)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table Body */}
          {vehiclesResource.loading && vehiclesList.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fo-text-muted)', fontSize: 13 }}>
              <RotateCw size={20} className="spin" style={{ margin: '0 auto 10px auto' }} />
              Loading vehicle directory…
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fo-text-muted)', fontSize: 13 }}>
              No fleet vehicles found matching your search or filters.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 1100 }}>
                <thead>
                  <tr
                    className="font-mono"
                    style={{
                      backgroundColor: 'var(--fo-canvas)',
                      fontSize: 11,
                      color: 'var(--fo-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--fo-border-subtle)',
                    }}
                  >
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>VEHICLE NUMBER</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>VEHICLE MODEL</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>MODEL NO</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>REGISTRATION DATE</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>CHASSIS NO (VIN)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>WHEEL</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>SITE IN-CHARGE</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>STATUS OF AGREEMENTS</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>ASSIGNED DRIVER</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>MAKE & YEAR</th>
                    {isSuperAdmin(user) && <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>}
                  </tr>
                </thead>
                <tbody style={{ fontSize: 12 }}>
                  {paginatedVehicles.map((vehicle, idx) => {
                    const isEven = idx % 2 === 0;
                    return (
                      <tr
                        key={vehicle.id}
                        style={{
                          backgroundColor: isEven ? 'var(--fo-surface-low)' : 'var(--fo-canvas)',
                          borderBottom: '1px solid rgba(66, 71, 84, 0.2)',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--fo-surface)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isEven ? 'var(--fo-surface-low)' : 'var(--fo-canvas)')}
                      >
                        {/* Vehicle Number (Plate) */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <span className="fo-vehicle-plate-badge">{vehicle.plateNumber}</span>
                        </td>

                        {/* Model */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--fo-text)', fontWeight: 600 }}>
                          {vehicle.model || '—'}
                        </td>

                        {/* Model No */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--fo-text-muted)' }}>
                          {vehicle.modelNumber || '—'}
                        </td>

                        {/* Registration Date */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--fo-text-muted)' }}>
                          {vehicle.registrationDate
                            ? new Date(vehicle.registrationDate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>

                        {/* Chassis No (VIN) */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <span className="fo-chassis-badge">{vehicle.chassisNumber || vehicle.vin || '—'}</span>
                        </td>

                        {/* Wheel Configuration */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              backgroundColor: 'rgba(59, 130, 246, 0.14)',
                              color: 'var(--fo-primary)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {vehicle.wheels || '10 Wheeler'}
                          </span>
                        </td>

                        {/* Site In-charge */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const execUser = allUsers.find((u) => u.id === vehicle.siteInchargeId);
                            const name = vehicle.siteInchargeName || (execUser ? `${execUser.firstName} ${execUser.lastName}` : null);
                            const siteName = vehicle.siteInchargeSite || execUser?.site;
                            if (!name) return <span style={{ color: 'var(--fo-text-muted)' }}>—</span>;
                            return (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  backgroundColor: 'var(--fo-surface-high)',
                                  color: 'var(--fo-secondary)',
                                  border: '1px solid var(--fo-border-subtle)',
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                <span>{name}</span>
                                {siteName && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      padding: '1px 4px',
                                      borderRadius: 3,
                                      backgroundColor: 'var(--fo-surface)',
                                      color: 'var(--fo-primary)',
                                    }}
                                  >
                                    {siteName}
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Status of Agreements */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          {getAgreementBadge(vehicle.agreementStatus)}
                        </td>

                        {/* Assigned Driver (Inline selector) */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <InlineDriverSelect
                            vehicle={vehicle}
                            driversList={driversList}
                            driverAssignedVehicleMap={driverAssignedVehicleMap}
                            onAssign={handleInlineAssignDriver}
                            isUpdating={updatingDriverVehicleId === vehicle.id}
                          />
                        </td>

                        {/* Make & Year */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--fo-text)' }}>
                          {vehicle.make ? <span style={{ fontWeight: 600 }}>{vehicle.make}</span> : null}
                          {vehicle.year ? (
                            <span style={{ color: 'var(--fo-text-muted)', fontSize: 11, marginLeft: vehicle.make ? 4 : 0 }}>
                              {vehicle.make ? `(${vehicle.year})` : vehicle.year}
                            </span>
                          ) : null}
                          {!vehicle.make && !vehicle.year && <span style={{ color: 'var(--fo-text-muted)' }}>—</span>}
                        </td>

                        {/* Actions */}
                        {isSuperAdmin(user) && (
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(vehicle)}
                                title="Edit Vehicle Specs"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: '1px solid var(--fo-border-subtle)',
                                  background: 'var(--fo-surface)',
                                  color: 'var(--fo-primary)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <Edit2 size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteVehicle(vehicle)}
                                title="Delete Vehicle"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: 'var(--fo-error-text)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--fo-surface)',
              borderTop: '1px solid var(--fo-border-subtle)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--fo-text-muted)' }}>
                Showing {totalItems > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalItems)} of {totalItems} vehicles
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fo-text-muted)' }}>
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  style={{
                    height: 24,
                    padding: '0 6px',
                    backgroundColor: 'var(--fo-surface-high)',
                    border: '1px solid var(--fo-border-subtle)',
                    borderRadius: 4,
                    color: 'var(--fo-text)',
                    fontSize: 11,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid var(--fo-border-subtle)',
                  background: 'var(--fo-surface-high)',
                  color: page <= 1 ? 'var(--fo-text-muted)' : 'var(--fo-text)',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 ? 0.5 : 1,
                }}
              >
                <ChevronLeft size={13} />
                <span>Prev</span>
              </button>

              <span
                style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'var(--fo-primary)',
                  color: '#001a42',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {page}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid var(--fo-border-subtle)',
                  background: 'var(--fo-surface-high)',
                  color: page >= totalPages ? 'var(--fo-text-muted)' : 'var(--fo-text)',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages ? 0.5 : 1,
                }}
              >
                <span>Next</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Add / Edit Vehicle Modal */}
        {showModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 15, 33, 0.8)',
              backdropFilter: 'blur(6px)',
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
                backgroundColor: 'var(--fo-surface-high)',
                borderRadius: 14,
                width: '100%',
                maxWidth: 620,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 48px rgba(0,0,0,0.8)',
                border: '1px solid var(--fo-border-subtle)',
                overflow: 'hidden',
                color: 'var(--fo-text)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--fo-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'var(--fo-surface)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--fo-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Truck size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                      {editingVehicle ? 'Edit Vehicle Entry' : 'New Fleet Vehicle Entry'}
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--fo-text-muted)' }}>
                      Fill out registration details, wheel specs & agreement status
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--fo-text-muted)' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form Content */}
              <form onSubmit={handleSubmitVehicle} style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {modalError && (
                  <div
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: 'var(--fo-error-text)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      fontSize: 12,
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Vehicle Number / Plate <span style={{ color: 'var(--fo-error)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. WB40R9901"
                      value={plateNumber}
                      onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Vehicle Model <span style={{ color: 'var(--fo-error)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TATA Prima / Tipper"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      required
                    />
                  </div>
                </div>

                {/* Row 2: Registration Date & Model No */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Registration Date
                    </label>
                    <input
                      type="date"
                      value={registrationDate}
                      onChange={(e) => setRegistrationDate(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Model No
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 5863TK, 4825.TK"
                      value={modelNumber}
                      onChange={(e) => setModelNumber(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Row 3: Chassis No & Wheel Configuration */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Chassis No (VIN)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MTS520 / MAT612034"
                      value={chassisNumber}
                      onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        fontFamily: 'var(--fo-font-mono)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Wheel Configuration
                    </label>
                    <select
                      value={wheels}
                      onChange={(e) => setWheels(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Site In-charge (Executive)
                    </label>
                    <select
                      value={siteInchargeId}
                      onChange={(e) => setSiteInchargeId(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">-- Select Executive --</option>
                      {siteInchargesList.length === 0 ? (
                        <option value="" disabled>No active Executives found</option>
                      ) : (
                        siteInchargesList.map((u) => {
                          const supervisingAdmin = u.createdByAdminId ? adminMap.get(u.createdByAdminId) : null;
                          const adminPart = supervisingAdmin
                            ? ` • Under: ${supervisingAdmin.firstName} ${supervisingAdmin.lastName}`
                            : '';
                          const sitePart = u.site ? ` • Site: ${u.site}` : '';
                          return (
                            <option key={u.id} value={u.id}>
                              {u.firstName} {u.lastName} ({u.employeeId}){sitePart}{adminPart}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Agreement Status
                    </label>
                    <select
                      value={agreementStatus}
                      onChange={(e) => setAgreementStatus(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-primary)',
                        fontSize: 12,
                        fontWeight: 700,
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
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
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Assigned Driver
                  </label>
                  <select
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
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      backgroundColor: 'var(--fo-surface)',
                      border: '1px solid var(--fo-border-subtle)',
                      borderRadius: 6,
                      color: 'var(--fo-text)',
                      fontSize: 12,
                      outline: 'none',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
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
                          style={isAssignedElsewhere ? { color: 'var(--fo-error-text)', fontWeight: 600 } : undefined}
                        >
                          {d.firstName} {d.lastName} ({d.employeeId}) {isAssignedElsewhere ? `[⚠️ Already on ${assignedInfo!.plateNumber}]` : isAssignedHere ? '[Currently Assigned Here]' : '[Free / Available]'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Row 5: Make & Year */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Make / OEM (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TATA Motors, BharatBenz"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Manufacturing Year (Optional)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 2024"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      min="1990"
                      max="2035"
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        backgroundColor: 'var(--fo-surface)',
                        border: '1px solid var(--fo-border-subtle)',
                        borderRadius: 6,
                        color: 'var(--fo-text)',
                        fontSize: 12,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Modal Footer Buttons */}
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 14,
                    borderTop: '1px solid var(--fo-border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={submitting}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid var(--fo-border-subtle)',
                      background: 'var(--fo-surface)',
                      color: 'var(--fo-text)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'var(--fo-primary)',
                      color: '#001a42',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: submitting ? 'wait' : 'pointer',
                      boxShadow: '0 4px 14px rgba(173, 198, 255, 0.25)',
                    }}
                  >
                    {submitting ? 'Saving…' : editingVehicle ? 'Save Changes' : 'Save Vehicle Entry'}
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
