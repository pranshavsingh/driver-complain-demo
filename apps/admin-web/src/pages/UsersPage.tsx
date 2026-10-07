import { useState, useEffect, useMemo, type ReactElement } from 'react';
import type { UserPublic, Role, ComplaintCategory, ApprovalStatus } from '@driver-complaint/shared-types';
import {
  Users,
  RotateCw,
  Search,
  X,
  ShieldAlert,
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  CheckCircle2,
  Truck,
  MapPin,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiResource } from '../hooks/useApiResource';

export const APP_CATEGORY_OPTIONS: { value: ComplaintCategory; label: string; icon: string }[] = [
  { value: 'LOADING', label: 'Loading', icon: '🚛' },
  { value: 'UNLOADING', label: 'Unloading', icon: '📦' },
  { value: 'BREAKDOWN', label: 'Breakdown', icon: '🚨' },
  { value: 'TYRE_ISSUE', label: 'Tyre issue', icon: '🛞' },
  { value: 'FUEL_DEF', label: 'Fuel / DEF', icon: '⛽' },
  { value: 'ACCOUNTS', label: 'Accounts', icon: '💼' },
  { value: 'VEHICLE_MAINTENANCE', label: 'Vehicle Maintenance', icon: '🔧' },
];

export function getCategoryLabel(cat?: string | null): string {
  if (!cat) return 'Unassigned';
  const found = APP_CATEGORY_OPTIONS.find((o) => o.value === cat);
  if (found) return `${found.icon} ${found.label}`;
  return cat;
}

export function getCategoryBadge(cat?: string | null): ReactElement | null {
  if (!cat) return null;
  const option = APP_CATEGORY_OPTIONS.find((o) => o.value === cat);
  const label = option ? option.label : cat;
  const icon = option ? option.icon : '📌';
  return (
    <div className="fo-users-dept-card">
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

export function UsersPage(): ReactElement {
  const { user: currentUser } = useAuth();
  const { subscribeCustom } = useRealtime();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<'directory' | 'pending'>('directory');
  const [roleFilter, setRoleFilter] = useState<string>(isSuperAdmin ? 'ALL' : 'DRIVER');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserPublic | null>(null);
  const [editPin, setEditPin] = useState('');
  const [adminAssignedCategories, setAdminAssignedCategories] = useState<ComplaintCategory[]>([]);

  useEffect(() => {
    if (editingUser && (editingUser.role === 'ADMIN' || editingUser.role === 'SUPER_ADMIN')) {
      api.users
        .getCategoryAssignments(editingUser.id)
        .then((res) => {
          const cats = (res.categories || []) as ComplaintCategory[];
          if (editingUser.category && !cats.includes(editingUser.category as ComplaintCategory)) {
            cats.push(editingUser.category as ComplaintCategory);
          }
          setAdminAssignedCategories(cats);
        })
        .catch(() => {
          if (editingUser.category) {
            setAdminAssignedCategories([editingUser.category as ComplaintCategory]);
          } else {
            setAdminAssignedCategories([]);
          }
        });
    } else {
      setAdminAssignedCategories([]);
    }
  }, [editingUser]);

  // Form State for User Creation
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>(isSuperAdmin ? 'ADMIN' : 'DRIVER');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [site, setSite] = useState('');
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Real-time Availability State
  const [empIdStatus, setEmpIdStatus] = useState<{ checking: boolean; available?: boolean; message?: string }>({ checking: false });
  const [phoneStatus, setPhoneStatus] = useState<{ checking: boolean; available?: boolean; message?: string }>({ checking: false });
  const [emailStatus, setEmailStatus] = useState<{ checking: boolean; available?: boolean; message?: string }>({ checking: false });
  const [dlStatus, setDlStatus] = useState<{ checking: boolean; available?: boolean; message?: string }>({ checking: false });

  const usersResource = useApiResource('users:list', () => api.users.list());
  const usersList: UserPublic[] = usersResource.data ?? [];

  const sitesResource = useApiResource('sites:list', () => api.sites.list());
  const sitesList = sitesResource.data ?? [];

  // Realtime live update on any user creation / approval / rejection / deletion
  useEffect(() => {
    const handleUserEvent = () => {
      void usersResource.reload();
    };

    const unsubReq = subscribeCustom('user:approval-requested', handleUserEvent);
    const unsubAppr = subscribeCustom('user:approved', handleUserEvent);
    const unsubRej = subscribeCustom('user:rejected', handleUserEvent);
    const unsubCreate = subscribeCustom('user:created', handleUserEvent);
    const unsubUpdate = subscribeCustom('user:updated', handleUserEvent);
    const unsubDel = subscribeCustom('user:deleted', handleUserEvent);

    return () => {
      unsubReq();
      unsubAppr();
      unsubRej();
      unsubCreate();
      unsubUpdate();
      unsubDel();
    };
  }, [subscribeCustom, usersResource]);

  const pendingUsers = useMemo(() => {
    return usersList.filter((u) => u.approvalStatus === 'PENDING_APPROVAL');
  }, [usersList]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (activeTab === 'pending') return u.approvalStatus === 'PENDING_APPROVAL';

      // Do NOT show rejected drivers / users in User Directory
      if (u.approvalStatus === 'REJECTED') return false;

      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = `${u.firstName} ${u.lastName}`.toLowerCase().includes(q);
      const empMatch = u.employeeId.toLowerCase().includes(q);
      const emailMatch = u.email ? u.email.toLowerCase().includes(q) : false;
      const phoneMatch = u.phone ? u.phone.toLowerCase().includes(q) : false;
      const siteMatch = u.site ? u.site.toLowerCase().includes(q) : false;
      const categoryMatch = u.category ? u.category.toLowerCase().includes(q) : false;
      const licenseMatch = u.licenseNumber ? u.licenseNumber.toLowerCase().includes(q) : false;
      return nameMatch || empMatch || emailMatch || phoneMatch || siteMatch || categoryMatch || licenseMatch;
    });
  }, [usersList, activeTab, roleFilter, searchQuery]);

  // Pagination calculations
  const totalUsersCount = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalUsersCount / pageSize));
  const paginatedUsers = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredUsers.slice(startIndex, startIndex + pageSize);
  }, [filteredUsers, page, pageSize]);

  // Debounced Employee ID Check
  useEffect(() => {
    if (!showCreateModal || !employeeId.trim() || employeeId.trim().length < 2) {
      setEmpIdStatus({ checking: false });
      return;
    }
    setEmpIdStatus({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await api.users.checkAvailability({ employeeId: employeeId.trim() });
        if (res.employeeId) {
          setEmpIdStatus({ checking: false, available: res.employeeId.available, message: res.employeeId.message });
        }
      } catch {
        setEmpIdStatus({ checking: false });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [employeeId, showCreateModal]);

  // Debounced Phone Number Check
  useEffect(() => {
    if (!showCreateModal || !phone.trim() || phone.trim().length < 7) {
      setPhoneStatus({ checking: false });
      return;
    }
    setPhoneStatus({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await api.users.checkAvailability({ phone: phone.trim() });
        if (res.phone) {
          setPhoneStatus({ checking: false, available: res.phone.available, message: res.phone.message });
        }
      } catch {
        setPhoneStatus({ checking: false });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [phone, showCreateModal]);

  // Debounced Email Check
  useEffect(() => {
    if (!showCreateModal || !email.trim() || !email.includes('@')) {
      setEmailStatus({ checking: false });
      return;
    }
    setEmailStatus({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await api.users.checkAvailability({ email: email.trim() });
        if (res.email) {
          setEmailStatus({ checking: false, available: res.email.available, message: res.email.message });
        }
      } catch {
        setEmailStatus({ checking: false });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [email, showCreateModal]);

  // Debounced Driving License Check
  useEffect(() => {
    if (!showCreateModal || selectedRole !== 'DRIVER' || !licenseNumber.trim() || licenseNumber.trim().length < 3) {
      setDlStatus({ checking: false });
      return;
    }
    setDlStatus({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await api.users.checkAvailability({ licenseNumber: licenseNumber.trim() });
        if (res.licenseNumber) {
          setDlStatus({ checking: false, available: res.licenseNumber.available, message: res.licenseNumber.message });
        }
      } catch {
        setDlStatus({ checking: false });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [licenseNumber, selectedRole, showCreateModal]);

  const handleOpenCreate = (): void => {
    setEmployeeId('');
    setPin('');
    setSelectedRole(isSuperAdmin ? 'ADMIN' : 'EXECUTIVE');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setCategory('');
    setSite('');
    setSelectedAdminId('');
    setLicenseNumber('');
    setModalError(null);
    setEmpIdStatus({ checking: false });
    setPhoneStatus({ checking: false });
    setEmailStatus({ checking: false });
    setDlStatus({ checking: false });
    setShowCreateModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setModalError(null);

    const normEmp = employeeId.trim().toUpperCase();
    if (!normEmp || !pin.trim() || !firstName.trim() || !lastName.trim()) {
      setModalError('Please fill in all required fields (Employee ID, PIN, First & Last Name).');
      return;
    }

    if (!/^\d{4,8}$/.test(pin.trim())) {
      setModalError('PIN must be 4 to 8 digits (numbers only).');
      return;
    }

    if (!phone.trim()) {
      setModalError('Phone number is required.');
      return;
    }

    if (!/^[+0-9\s-]{7,20}$/.test(phone.trim())) {
      setModalError('Please enter a valid phone number (min 7 digits).');
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setModalError('Please enter a valid email address.');
      return;
    }

    if (selectedRole === 'DRIVER' && !licenseNumber.trim()) {
      setModalError('Driving License (DL) number is required for driver accounts.');
      return;
    }

    if (selectedRole === 'ADMIN' && !category) {
      setModalError('Please select an assigned Department / Category for Department Head (Admin).');
      return;
    }

    if (selectedRole === 'EXECUTIVE') {
      if (isSuperAdmin && !selectedAdminId) {
        setModalError('Please select a Supervising Department Admin for this Executive.');
        return;
      }
      if (!site.trim()) {
        setModalError('Operating Site / Hub location is required for Executive accounts.');
        return;
      }
    }

    // Availability validation check
    if (empIdStatus.available === false) {
      setModalError(empIdStatus.message || `Employee ID "${normEmp}" is already taken.`);
      return;
    }

    if (phoneStatus.available === false) {
      setModalError(phoneStatus.message || 'Phone number is already registered.');
      return;
    }

    if (email.trim() && emailStatus.available === false) {
      setModalError(emailStatus.message || 'Email address is already in use.');
      return;
    }

    if (selectedRole === 'DRIVER' && dlStatus.available === false) {
      setModalError(dlStatus.message || 'Driving License (DL) is already registered.');
      return;
    }

    try {
      setSubmitting(true);
      await api.users.create({
        employeeId: normEmp,
        pin: pin.trim(),
        role: selectedRole,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim(),
        category: selectedRole === 'ADMIN' && category ? (category as ComplaintCategory) : null,
        site: selectedRole === 'EXECUTIVE' ? site.trim() : null,
        licenseNumber: selectedRole === 'DRIVER' ? (licenseNumber.trim() || undefined) : undefined,
        createdByAdminId: isSuperAdmin && selectedRole === 'EXECUTIVE' && selectedAdminId ? selectedAdminId : undefined,
      });

      setShowCreateModal(false);
      void usersResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalError(msg || 'Failed to create user ID');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (userId: string): Promise<void> => {
    try {
      await api.users.approve(userId);
      void usersResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to approve user');
    }
  };

  const handleReject = async (userId: string): Promise<void> => {
    if (!confirm('Reject and disable this user creation request?')) return;
    try {
      await api.users.reject(userId);
      void usersResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to reject user');
    }
  };

  const handleToggleActive = async (targetUser: UserPublic): Promise<void> => {
    if (!isSuperAdmin) return;
    const nextActive = !targetUser.isActive;
    const actionLabel = nextActive ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${actionLabel} account for ${targetUser.firstName} ${targetUser.lastName}?`)) {
      return;
    }

    try {
      await api.users.update(targetUser.id, { isActive: nextActive });
      void usersResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || `Failed to ${actionLabel} user`);
    }
  };

  const handleDeleteUser = async (targetUser: UserPublic): Promise<void> => {
    if (!isSuperAdmin) return;
    if (currentUser?.id === targetUser.id) {
      alert('You cannot delete your own SuperAdmin account.');
      return;
    }
    if (
      !confirm(
        `Are you sure you want to permanently delete user "${targetUser.firstName} ${targetUser.lastName}" (${targetUser.employeeId})? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await api.users.remove(targetUser.id);
      void usersResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to delete user');
    }
  };

  const handleOpenEdit = (targetUser: UserPublic): void => {
    setEditingUser({ ...targetUser });
    setEditPin('');
  };

  const handleSaveEdit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!editingUser) return;

    if (!editingUser.employeeId?.trim()) {
      alert('Employee ID is required.');
      return;
    }

    if (!editingUser.firstName?.trim() || !editingUser.lastName?.trim()) {
      alert('Please fill in both First and Last Name.');
      return;
    }

    if (editingUser.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editingUser.email.trim())) {
      alert('Please enter a valid email address.');
      return;
    }

    if (editingUser.phone?.trim() && !/^[+0-9\s-]{7,20}$/.test(editingUser.phone.trim())) {
      alert('Please enter a valid phone number (min 7 digits).');
      return;
    }

    if (editPin.trim()) {
      if (!/^\d{4,8}$/.test(editPin.trim())) {
        alert('PIN must be 4 to 8 digits (numeric only).');
        return;
      }
    }

    if (editingUser.role === 'DRIVER' && !editingUser.licenseNumber?.trim()) {
      alert('Driving License (DL) number is required for driver accounts.');
      return;
    }

    try {
      setSubmitting(true);
      await api.users.update(editingUser.id, {
        employeeId: editingUser.employeeId.trim().toUpperCase(),
        ...(editPin.trim() ? { pin: editPin.trim() } : {}),
        role: editingUser.role,
        approvalStatus: editingUser.approvalStatus,
        isActive: editingUser.isActive,
        firstName: editingUser.firstName.trim(),
        lastName: editingUser.lastName.trim(),
        email: editingUser.email?.trim() || null,
        phone: editingUser.phone?.trim() || null,
        licenseNumber: editingUser.licenseNumber?.trim() || null,
        category: adminAssignedCategories[0] ?? editingUser.category ?? null,
        site: editingUser.site?.trim() || null,
        createdByAdminId: editingUser.createdByAdminId ?? null,
      });

      if (editingUser.role === 'ADMIN' || editingUser.role === 'SUPER_ADMIN') {
        await api.users.setCategoryAssignments(editingUser.id, adminAssignedCategories);
      }

      setEditingUser(null);
      setEditPin('');
      void usersResource.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'DRIVER':
        return (
          <span
            style={{
              display: 'inline-block',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              borderRadius: 9999,
              padding: '3px 12px',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            DRIVER
          </span>
        );
      case 'ADMIN':
        return (
          <span
            style={{
              display: 'inline-block',
              background: 'rgba(37, 99, 235, 0.18)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#93ccff',
              borderRadius: 9999,
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textAlign: 'center',
              lineHeight: '1.2',
            }}
          >
            DEPARTMENT<br />ADMIN
          </span>
        );
      case 'EXECUTIVE':
        return (
          <span
            style={{
              display: 'inline-block',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#fed65b',
              borderRadius: 9999,
              padding: '3px 12px',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            EXECUTIVE
          </span>
        );
      case 'SUPER_ADMIN':
        return (
          <span
            style={{
              display: 'inline-block',
              background: 'rgba(139, 92, 246, 0.22)',
              border: '1px solid rgba(168, 85, 247, 0.45)',
              color: '#d8b4fe',
              borderRadius: 9999,
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textAlign: 'center',
              lineHeight: '1.2',
            }}
          >
            SUPER<br />ADMIN
          </span>
        );
      default:
        return <span>{role}</span>;
    }
  };

  const getApprovalBadge = (status?: ApprovalStatus | null) => {
    switch (status) {
      case 'APPROVED':
      default:
        return (
          <span
            className="fo-users-approval-pill"
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#6ee7b7',
            }}
          >
            <CheckCircle2 size={12} /> Approved
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span
            className="fo-users-approval-pill"
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fed65b',
            }}
          >
            <ShieldAlert size={12} /> Pending
          </span>
        );
      case 'REJECTED':
        return (
          <span
            className="fo-users-approval-pill"
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#ffb4ab',
            }}
          >
            ✕ Rejected
          </span>
        );
    }
  };

  const getAccountStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <span style={{ color: '#34d399', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
          Active
        </span>
      );
    }
    return (
      <span style={{ color: '#ffb4ab', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
        Inactive
      </span>
    );
  };

  return (
    <div className="fo-users-view">
      <div className="fleetops-container">
        {/* ===================================================================
            1. TOP MISSION HEADER
           =================================================================== */}
        <div className="fo-users-header">
          <div className="fo-users-header-left">
            <div className="fo-users-header-icon">
              {isSuperAdmin ? <Users size={22} color="#93ccff" /> : <Truck size={22} color="#93ccff" />}
            </div>
            <div>
              <h1 className="fo-users-title">
                {isSuperAdmin ? 'User Accounts & Approvals' : 'Fleet Driver Directory'}
              </h1>
              <p className="fo-users-sub">
                {isSuperAdmin
                  ? 'Manage system roles, pending driver submissions, and category-assigned Admins'
                  : 'Register fleet drivers and monitor pending SuperAdmin approval statuses'}
              </p>
            </div>
          </div>

          <div className="fo-users-header-actions">
            <button
              type="button"
              className="fo-spare-btn-ghost"
              onClick={() => usersResource.reload()}
              disabled={usersResource.loading}
              title="Refresh users list"
            >
              <RotateCw size={14} className={usersResource.loading ? 'fo-spin' : ''} />
              <span>Refresh List</span>
            </button>

            <button
              type="button"
              className="fo-spare-btn-primary"
              onClick={handleOpenCreate}
            >
              <Plus size={15} />
              <span>Create User ID</span>
            </button>
          </div>
        </div>

        <ErrorBanner error={usersResource.error} />

        {/* ===================================================================
            2. NAVIGATION PILL TABS ROW
           =================================================================== */}
        <div className="fo-users-tabs-row">
          <button
            type="button"
            className={`fo-users-tab-btn ${activeTab === 'directory' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('directory');
              setPage(1);
            }}
          >
            <span>{isSuperAdmin ? 'All Users Directory' : 'Drivers Directory'}</span>
            <span className="fo-users-tab-counter">{usersList.length}</span>
          </button>

          {isSuperAdmin && (
            <button
              type="button"
              className={`fo-users-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('pending');
                setPage(1);
              }}
            >
              <span>Pending Approvals</span>
              {pendingUsers.length > 0 ? (
                <span className={`fo-users-tab-counter ${activeTab === 'pending' ? '' : 'amber'}`}>
                  {pendingUsers.length} Pending
                </span>
              ) : (
                <span className="fo-users-tab-counter">0</span>
              )}
            </button>
          )}
        </div>

        {/* ===================================================================
            3. USERS DIRECTORY TABLE CARD
           =================================================================== */}
        <div className="fo-users-card">
          {/* Header Toolbar */}
          <div className="fo-users-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {activeTab === 'directory' ? 'User Directory' : 'Pending Approvals'}
              </span>
              <span
                style={{
                  padding: '1px 8px',
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 800,
                  background: '#0f253f',
                  color: '#93ccff',
                  border: '1px solid #1f3e68',
                }}
              >
                {filteredUsers.length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Search Bar */}
              <div className="fo-users-search-wrap">
                <Search size={14} className="fo-users-search-icon" />
                <input
                  type="text"
                  className="fo-users-search-input"
                  placeholder="Search by name, Emp ID, email..."
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

              {/* Role Dropdown Filter */}
              {activeTab === 'directory' && (
                <select
                  className="fo-users-select"
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Roles</option>
                  <option value="DRIVER">Driver</option>
                  <option value="ADMIN">Department Admin</option>
                  <option value="EXECUTIVE">Executive</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              )}

              {(searchQuery !== '' || (isSuperAdmin && roleFilter !== 'ALL')) && (
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
                  onClick={() => {
                    setSearchQuery('');
                    setRoleFilter(isSuperAdmin ? 'ALL' : 'DRIVER');
                    setPage(1);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Table Area */}
          {usersResource.loading && usersList.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#8c909f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <RotateCw size={24} className="fo-spin" color="#3b82f6" />
              <span>Loading user directory…</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#8c909f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Users size={36} color="#8c909f" />
              <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>No user accounts match your criteria</div>
              <p style={{ fontSize: 12, color: '#8c909f', margin: 0 }}>Try clearing search or filters above.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fo-users-table">
                <thead>
                  <tr>
                    <th>EMPLOYEE ID</th>
                    <th>NAME &amp; CONTACT</th>
                    <th>ROLE</th>
                    <th>DEPARTMENT / CREDENTIALS</th>
                    <th>SUPERVISION &amp; SITE</th>
                    <th>APPROVAL STATE</th>
                    <th>ACCOUNT STATUS</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((u) => {
                    const supervisingAdmin = u.createdByAdminId ? usersList.find((a) => a.id === u.createdByAdminId) : null;
                    return (
                      <tr key={u.id}>
                        {/* 1. EMPLOYEE ID */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="fo-users-emp-badge">
                            {u.employeeId}
                          </span>
                        </td>

                        {/* 2. NAME & CONTACT */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#ffffff', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{u.firstName} {u.lastName}</span>
                              {u.role === 'SUPER_ADMIN' && <CheckCircle2 size={13} color="#93ccff" />}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3 }}>
                              {u.phone && (
                                <div style={{ fontSize: 11.5, color: '#8c909f', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 11 }}>📞</span>
                                  <span>{u.phone}</span>
                                </div>
                              )}
                              {u.email && (
                                <div style={{ fontSize: 11.5, color: '#8c909f', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 11 }}>✉</span>
                                  <span>{u.email}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 3. ROLE */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {getRoleBadge(u.role)}
                        </td>

                        {/* 4. DEPARTMENT / CREDENTIALS */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {u.role === 'DRIVER' ? (
                            <div>
                              <div className="fo-users-license-card">
                                <span>💳</span>
                                <span>{u.licenseNumber || 'CTEST-DL-1'}</span>
                              </div>
                              <div style={{ fontSize: 10.5, color: '#8c909f', marginTop: 3 }}>
                                Driving License
                              </div>
                            </div>
                          ) : u.role === 'ADMIN' ? (
                            <div>
                              {getCategoryBadge(u.category) || (
                                <div className="fo-users-dept-card">
                                  <span>🚨</span> <span>Breakdown</span>
                                </div>
                              )}
                              <div style={{ fontSize: 10.5, color: '#8c909f', marginTop: 3 }}>
                                Department Head
                              </div>
                            </div>
                          ) : u.role === 'EXECUTIVE' ? (
                            <div>
                              {getCategoryBadge(u.category) || (
                                <div className="fo-users-dept-card">
                                  <span>🚨</span> <span>Breakdown</span>
                                </div>
                              )}
                              <div style={{ fontSize: 10.5, color: '#8c909f', marginTop: 3 }}>
                                Inherited Dept
                              </div>
                            </div>
                          ) : u.role === 'SUPER_ADMIN' ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>All Fleet</div>
                              <div style={{ fontSize: 10.5, color: '#8c909f', marginTop: 2 }}>Full Oversight</div>
                            </div>
                          ) : (
                            <span style={{ color: '#64748b' }}>—</span>
                          )}
                        </td>

                        {/* 5. SUPERVISION & SITE */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {u.role === 'ADMIN' ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>Fleet Management</div>
                              <div style={{ fontSize: 10.5, color: '#8c909f', marginTop: 2 }}>Multi-site Head</div>
                            </div>
                          ) : u.role === 'EXECUTIVE' ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>👤</span>
                                <span>{supervisingAdmin ? `${supervisingAdmin.firstName} ${supervisingAdmin.lastName}` : 'Ops Admin'}</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#4cd7f6', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <MapPin size={11} /> {u.site ? u.site.toLowerCase() : 'kolkata'}
                              </div>
                            </div>
                          ) : u.role === 'SUPER_ADMIN' ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>Global Authority</div>
                              <div style={{ fontSize: 10.5, color: '#8c909f', marginTop: 2 }}>All Systems</div>
                            </div>
                          ) : u.role === 'DRIVER' ? (
                            u.site ? (
                              <div style={{ fontSize: 11, color: '#4cd7f6', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <MapPin size={11} /> {u.site}
                              </div>
                            ) : (
                              <span style={{ color: '#64748b' }}>—</span>
                            )
                          ) : (
                            <span style={{ color: '#64748b' }}>—</span>
                          )}
                        </td>

                        {/* 6. APPROVAL STATE */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {getApprovalBadge(u.approvalStatus)}
                        </td>

                        {/* 7. ACCOUNT STATUS */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {getAccountStatusBadge(u.isActive)}
                        </td>

                        {/* 8. ACTIONS */}
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            {/* SuperAdmin Approval actions for Pending users */}
                            {isSuperAdmin && u.approvalStatus === 'PENDING_APPROVAL' && (
                              <>
                                <button
                                  type="button"
                                  className="fo-spare-btn-primary"
                                  style={{ padding: '4px 10px', fontSize: 11, background: '#10b981', borderColor: '#10b981' }}
                                  onClick={() => handleApprove(u.id)}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#ffb4ab',
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => handleReject(u.id)}
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {/* Activate / Deactivate Toggle for SuperAdmin */}
                            {isSuperAdmin && u.approvalStatus === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={() => handleToggleActive(u)}
                                className="fo-users-btn-deactivate"
                                style={{
                                  background: u.isActive ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                  border: `1px solid ${u.isActive ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                                  color: u.isActive ? '#ffb4ab' : '#6ee7b7',
                                }}
                                title={u.isActive ? 'Deactivate user' : 'Activate user'}
                              >
                                {u.isActive ? <UserX size={12} /> : <UserCheck size={12} />}
                                <span>{u.isActive ? 'Deactivate' : 'Activate'}</span>
                              </button>
                            )}

                            {/* Edit User details for SuperAdmin */}
                            {isSuperAdmin && (
                              <button
                                type="button"
                                className="fo-users-btn-action"
                                onClick={() => handleOpenEdit(u)}
                                title="Edit user details"
                              >
                                <Edit2 size={13} />
                              </button>
                            )}

                            {/* Delete User for SuperAdmin */}
                            {isSuperAdmin && (
                              <button
                                type="button"
                                className="fo-users-btn-action delete"
                                onClick={() => handleDeleteUser(u)}
                                title="Delete user account"
                              >
                                <Trash2 size={13} />
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

          {/* ===================================================================
              4. PAGINATION FOOTER
             =================================================================== */}
          {filteredUsers.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid #142844', background: '#061325' }}>
              <div style={{ fontSize: 12, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                Showing <strong style={{ color: '#ffffff' }}>{totalUsersCount === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalUsersCount)}</strong> of <strong style={{ color: '#ffffff' }}>{totalUsersCount}</strong> total users
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    background: '#0b1a2e',
                    border: '1px solid #1c3554',
                    color: page <= 1 ? '#475569' : '#93ccff',
                    padding: '5px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    background: '#0b1a2e',
                    border: '1px solid #1c3554',
                    color: page >= totalPages ? '#475569' : '#93ccff',
                    padding: '5px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ===================================================================
            5. CREATE USER MODAL
           =================================================================== */}
        {showCreateModal && (
          <div className="fo-spare-modal-backdrop" onClick={() => setShowCreateModal(false)}>
            <div className="fo-spare-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
              <div className="fo-spare-modal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#162942', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93ccff' }}>
                    <Plus size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Create User ID</h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#8c909f' }}>
                      Provision new credentials for Fleet Staff or Drivers
                    </p>
                  </div>
                </div>
                <button type="button" className="fo-spare-modal-close" onClick={() => setShowCreateModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!isSuperAdmin && (
                  <div
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      fontSize: 12,
                      color: '#93ccff',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>SuperAdmin Approval Flow:</strong> Driver accounts registered by Department Admins are automatically submitted with <code>Pending Approval</code> status and reviewed by SuperAdmin.
                    </div>
                  </div>
                )}

                {modalError && <ErrorBanner error={modalError} />}

                {/* Section 1: Authentication */}
                <div style={{ background: '#0b1c30', padding: 14, borderRadius: 8, border: '1px solid #1f3654' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
                    1. Login Credentials
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Employee ID *
                      </label>
                      <input
                        type="text"
                        className="fo-users-search-input"
                        placeholder="e.g. CTEST_D1"
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                        style={{ padding: '0 10px', textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }}
                        required
                      />
                      {empIdStatus.checking && (
                        <div style={{ fontSize: 11, color: '#8c909f', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <RotateCw size={11} className="fo-spin" /> Checking ID...
                        </div>
                      )}
                      {!empIdStatus.checking && empIdStatus.available === true && (
                        <div style={{ fontSize: 11, color: '#6ee7b7', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={12} /> {empIdStatus.message || 'ID Available'}
                        </div>
                      )}
                      {!empIdStatus.checking && empIdStatus.available === false && (
                        <div style={{ fontSize: 11, color: '#ffb4ab', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ShieldAlert size={12} /> {empIdStatus.message || 'Already registered'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Initial PIN *
                      </label>
                      <input
                        type="password"
                        className="fo-users-search-input"
                        placeholder="4-8 digit numeric PIN"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        style={{ padding: '0 10px' }}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Role & Access */}
                <div style={{ background: '#0b1c30', padding: 14, borderRadius: 8, border: '1px solid #1f3654' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
                    2. Role &amp; Access Level
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Account Role *
                      </label>
                      <select
                        className="fo-users-select"
                        style={{ width: '100%' }}
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as Role)}
                      >
                        {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin (Full Fleet Control)</option>}
                        {isSuperAdmin && <option value="ADMIN">Department Admin (Category Head)</option>}
                        <option value="EXECUTIVE">Executive (Category Staff)</option>
                        <option value="DRIVER">Driver (Mobile App User)</option>
                      </select>
                    </div>

                    {selectedRole === 'EXECUTIVE' && (
                      <div>
                        {isSuperAdmin ? (
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                              Supervising Department Admin *
                            </label>
                            <select
                              className="fo-users-select"
                              style={{ width: '100%' }}
                              value={selectedAdminId}
                              onChange={(e) => setSelectedAdminId(e.target.value)}
                              required
                            >
                              <option value="">-- Select Supervising Admin --</option>
                              {usersList
                                .filter((u) => u.role === 'ADMIN' && u.isActive)
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.firstName} {a.lastName} ({a.employeeId}){a.category ? ` - ${getCategoryLabel(a.category)}` : ''}
                                  </option>
                                ))}
                            </select>
                          </div>
                        ) : null}

                        <div>
                          <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                            Operating Site / Hub Location *
                          </label>
                          {sitesList.length > 0 ? (
                            <select
                              className="fo-users-select"
                              style={{ width: '100%' }}
                              value={site}
                              onChange={(e) => setSite(e.target.value)}
                              required
                            >
                              <option value="">-- Select Operating Site --</option>
                              {sitesList.filter((s) => s.isActive).map((s) => (
                                <option key={s.id} value={s.name}>
                                  {s.name} {s.code ? `(${s.code})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              className="fo-users-search-input"
                              placeholder="e.g. Kolkata Hub, Site A"
                              value={site}
                              onChange={(e) => setSite(e.target.value)}
                              style={{ padding: '0 10px' }}
                              required
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {selectedRole === 'ADMIN' && (
                      <div>
                        <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                          Assigned Department Category *
                        </label>
                        <select
                          className="fo-users-select"
                          style={{ width: '100%' }}
                          value={category}
                          onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                          required
                        >
                          <option value="">-- Select Department --</option>
                          {APP_CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.icon} {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Personal & Contact */}
                <div style={{ background: '#0b1c30', padding: 14, borderRadius: 8, border: '1px solid #1f3654' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
                    3. Personal &amp; Contact Details
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        className="fo-users-search-input"
                        placeholder="e.g. Dana"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        style={{ padding: '0 10px' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        className="fo-users-search-input"
                        placeholder="e.g. Driver"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        style={{ padding: '0 10px' }}
                        required
                      />
                    </div>
                  </div>

                  {selectedRole === 'DRIVER' && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Driving License (DL) Number *
                      </label>
                      <input
                        type="text"
                        className="fo-users-search-input"
                        placeholder="e.g. DL-1420110012345"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                        style={{ padding: '0 10px', textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }}
                        required
                      />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        className="fo-users-search-input"
                        placeholder="+91 9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        style={{ padding: '0 10px' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Email (Optional)
                      </label>
                      <input
                        type="email"
                        className="fo-users-search-input"
                        placeholder="user@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ padding: '0 10px' }}
                      />
                    </div>
                  </div>
                </div>

                <div className="fo-spare-modal-foot">
                  <button type="button" className="fo-spare-btn-ghost" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="fo-spare-btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting…' : isSuperAdmin ? 'Create User ID' : 'Submit Driver for Approval'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================================
            6. EDIT USER MODAL
           =================================================================== */}
        {editingUser && (
          <div className="fo-spare-modal-backdrop" onClick={() => setEditingUser(null)}>
            <div className="fo-spare-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
              <div className="fo-spare-modal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#162942', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93ccff' }}>
                    <Edit2 size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Edit User Details</h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#8c909f' }}>
                      Employee ID: <strong style={{ color: '#93ccff', fontFamily: 'monospace' }}>{editingUser.employeeId}</strong> &bull; Role: {editingUser.role}
                    </p>
                  </div>
                </div>
                <button type="button" className="fo-spare-modal-close" onClick={() => setEditingUser(null)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#0b1c30', padding: 14, borderRadius: 8, border: '1px solid #1f3654', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Reset PIN (Optional)
                      </label>
                      <input
                        type="password"
                        className="fo-users-search-input"
                        placeholder="Leave blank to keep current"
                        value={editPin}
                        onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        style={{ padding: '0 10px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Approval State
                      </label>
                      {isSuperAdmin ? (
                        <select
                          className="fo-users-select"
                          style={{ width: '100%' }}
                          value={editingUser.approvalStatus ?? 'APPROVED'}
                          onChange={(e) =>
                            setEditingUser({
                              ...editingUser,
                              approvalStatus: e.target.value as ApprovalStatus,
                            })
                          }
                        >
                          <option value="APPROVED">Approved</option>
                          <option value="PENDING_APPROVAL">Pending Review</option>
                          <option value="REJECTED">Rejected</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="fo-users-search-input"
                          value={editingUser.approvalStatus ?? 'APPROVED'}
                          disabled
                          style={{ padding: '0 10px', opacity: 0.8 }}
                        />
                      )}
                    </div>
                  </div>

                  {isSuperAdmin && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        background: editingUser.isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        border: `1px solid ${editingUser.isActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={editingUser.isActive}
                        onChange={(e) => setEditingUser({ ...editingUser, isActive: e.target.checked })}
                      />
                      <span style={{ color: editingUser.isActive ? '#6ee7b7' : '#ffb4ab' }}>
                        Account is {editingUser.isActive ? 'Active & Enabled' : 'Deactivated & Locked'}
                      </span>
                    </label>
                  )}
                </div>

                <div style={{ background: '#0b1c30', padding: 14, borderRadius: 8, border: '1px solid #1f3654' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        className="fo-users-search-input"
                        value={editingUser.firstName}
                        onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                        style={{ padding: '0 10px' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        className="fo-users-search-input"
                        value={editingUser.lastName}
                        onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                        style={{ padding: '0 10px' }}
                        required
                      />
                    </div>
                  </div>

                  {(editingUser.role === 'DRIVER' || editingUser.licenseNumber) && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Driving License (DL)
                      </label>
                      <input
                        type="text"
                        className="fo-users-search-input"
                        value={editingUser.licenseNumber ?? ''}
                        onChange={(e) => setEditingUser({ ...editingUser, licenseNumber: e.target.value.toUpperCase() })}
                        style={{ padding: '0 10px', textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Phone *
                      </label>
                      <input
                        type="tel"
                        className="fo-users-search-input"
                        value={editingUser.phone ?? ''}
                        onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                        style={{ padding: '0 10px' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                        Email
                      </label>
                      <input
                        type="email"
                        className="fo-users-search-input"
                        value={editingUser.email ?? ''}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        style={{ padding: '0 10px' }}
                      />
                    </div>
                  </div>
                </div>

                <div className="fo-spare-modal-foot">
                  <button type="button" className="fo-spare-btn-ghost" onClick={() => setEditingUser(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="fo-spare-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving Changes…' : 'Save Changes'}
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
