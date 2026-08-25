import { useState, type ReactElement } from 'react';
import type { UserPublic, Role, ComplaintCategory } from '@driver-complaint/shared-types';
import { COMPLAINT_CATEGORIES } from '@driver-complaint/shared-types';
import { Users, RotateCw, Search, X, Check, ShieldAlert, Plus, Edit2, UserCheck, UserX } from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiResource } from '../hooks/useApiResource';

export function UsersPage(): ReactElement {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<'directory' | 'pending'>('directory');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserPublic | null>(null);

  // Form State for User Creation
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>(isSuperAdmin ? 'ADMIN' : 'EXECUTIVE');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usersResource = useApiResource('users:list', () => api.users.list());
  const usersList: UserPublic[] = usersResource.data ?? [];

  const pendingUsers = usersList.filter((u) => u.approvalStatus === 'PENDING_APPROVAL');

  const filteredUsers = usersList.filter((u) => {
    if (activeTab === 'pending') return u.approvalStatus === 'PENDING_APPROVAL';

    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = `${u.firstName} ${u.lastName}`.toLowerCase().includes(q);
    const empMatch = u.employeeId.toLowerCase().includes(q);
    const emailMatch = u.email ? u.email.toLowerCase().includes(q) : false;
    return nameMatch || empMatch || emailMatch;
  });

  const handleOpenCreate = (): void => {
    setEmployeeId('');
    setPin('');
    setSelectedRole(isSuperAdmin ? 'ADMIN' : 'EXECUTIVE');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setCategory('');
    setLicenseNumber('');
    setModalError(null);
    setShowCreateModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setModalError(null);
    if (!employeeId.trim() || !pin.trim() || !firstName.trim() || !lastName.trim()) {
      setModalError('Please fill in all required fields (Employee ID, PIN, First & Last Name).');
      return;
    }

    try {
      setSubmitting(true);
      await api.users.create({
        employeeId: employeeId.trim(),
        pin: pin.trim(),
        role: selectedRole,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        category: category ? (category as ComplaintCategory) : null,
        licenseNumber: licenseNumber.trim() || undefined,
      });

      setShowCreateModal(false);
      void usersResource.reload();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create user ID');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (userId: string): Promise<void> => {
    try {
      await api.users.approve(userId);
      void usersResource.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to approve user');
    }
  };

  const handleReject = async (userId: string): Promise<void> => {
    if (!confirm('Reject and disable this user creation request?')) return;
    try {
      await api.users.reject(userId);
      void usersResource.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to reject user');
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
    } catch (err: any) {
      alert(err.message || `Failed to ${actionLabel} user`);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setSubmitting(true);
      await api.users.update(editingUser.id, {
        firstName: editingUser.firstName,
        lastName: editingUser.lastName,
        email: editingUser.email ?? null,
        phone: editingUser.phone ?? null,
        category: editingUser.category ?? null,
      });
      setEditingUser(null);
      void usersResource.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <span className="status-badge" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8' }}>Super Admin</span>;
      case 'ADMIN':
        return <span className="status-badge" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>Department Admin</span>;
      case 'EXECUTIVE':
        return <span className="status-badge" style={{ backgroundColor: '#ffedd5', color: '#c2410c' }}>Executive</span>;
      case 'DRIVER':
        return <span className="status-badge" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>Driver</span>;
    }
  };

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={24} color="#075E54" /> User Accounts & Approvals
          </h1>
          <p className="page-subtitle">
            Manage system roles, pending approvals, and category-assigned Admins
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => usersResource.reload()}
            disabled={usersResource.loading}
          >
            <RotateCw size={14} style={{ marginRight: 6 }} className={usersResource.loading ? 'spin' : ''} />
            {usersResource.loading ? 'Refreshing…' : 'Refresh List'}
          </button>

          <button type="button" className="btn-primary" onClick={handleOpenCreate}>
            <Plus size={16} style={{ marginRight: 6 }} /> Create User ID
          </button>
        </div>
      </div>

      <ErrorBanner error={usersResource.error} />

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className={`btn-${activeTab === 'directory' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('directory')}
        >
          All Users Directory ({usersList.length})
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            className={`btn-${activeTab === 'pending' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('pending')}
            style={{ position: 'relative' }}
          >
            Pending SuperAdmin Approvals
            {pendingUsers.length > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              >
                {pendingUsers.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Users Table Card */}
      <div className="table-card">
        <div className="table-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 className="table-card-title">
              {activeTab === 'directory' ? 'User Directory' : 'Pending SuperAdmin Approvals'}{' '}
              <span className="badge-pill">{filteredUsers.length}</span>
            </h2>

            {activeTab === 'directory' && (
              <select
                className="filter-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                <option value="ALL">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Department Admin</option>
                <option value="EXECUTIVE">Executive</option>
                <option value="DRIVER">Driver</option>
              </select>
            )}
          </div>

          <div className="table-search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search user by name, Emp ID, email..."
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

        {usersResource.loading && usersList.length === 0 ? (
          <div className="loading-state">Loading user directory…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-table-state">
            <p>No user accounts found matching the selection.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Assigned Category</th>
                  <th>Approval State</th>
                  <th>Account Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{u.employeeId}</strong>
                    </td>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                          {u.firstName} {u.lastName}
                        </div>
                        {u.email && <div style={{ fontSize: 12, color: '#64748b' }}>{u.email}</div>}
                      </div>
                    </td>
                    <td>{getRoleBadge(u.role)}</td>
                    <td>
                      {u.category ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: '#075E54',
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {u.category}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 13 }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      {u.approvalStatus === 'APPROVED' && (
                        <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={14} /> Approved
                        </span>
                      )}
                      {u.approvalStatus === 'PENDING_APPROVAL' && (
                        <span style={{ color: '#d97706', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ShieldAlert size={14} /> Pending Approval
                        </span>
                      )}
                      {u.approvalStatus === 'REJECTED' && (
                        <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 13 }}>Rejected</span>
                      )}
                    </td>
                    <td>
                      {u.isActive ? (
                        <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>Active</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 13 }}>Inactive</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* Approval actions for SuperAdmin on pending users */}
                        {isSuperAdmin && u.approvalStatus === 'PENDING_APPROVAL' && (
                          <>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                              onClick={() => handleApprove(u.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
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
                            className="btn-secondary"
                            style={{
                              padding: '4px 8px',
                              fontSize: 12,
                              color: u.isActive ? '#dc2626' : '#16a34a',
                              borderColor: u.isActive ? '#fca5a5' : '#86efac',
                            }}
                            onClick={() => handleToggleActive(u)}
                            title={u.isActive ? 'Deactivate account' : 'Activate account'}
                          >
                            {u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}

                        {/* Edit User details */}
                        {isSuperAdmin && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => setEditingUser(u)}
                            title="Edit user"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <div
            className="modal-card"
            style={{
              maxWidth: 580,
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              padding: 0,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: '#075E54',
                padding: '20px 24px',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={22} color="#FFFFFF" />
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>Create User ID</h2>
                  <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.8)', margin: 0, marginTop: 2 }}>
                    Provision new credentials for Fleet Staff or Drivers
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  opacity: 0.8,
                  padding: 4,
                  display: 'flex',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleCreateUser} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!isSuperAdmin && (
                <div
                  style={{
                    backgroundColor: '#fffbe5',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid #fde047',
                    fontSize: 13,
                    color: '#854d0e',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>SuperAdmin Approval Required:</strong> Accounts requested by Department Admins remain pending until approved by Super Admin.
                  </div>
                </div>
              )}

              {modalError && (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    color: '#991b1b',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid #fecaca',
                    fontSize: 13,
                  }}
                >
                  {modalError}
                </div>
              )}

              {/* Section 1: Authentication */}
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 12 }}>
                  1. Login Credentials
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Employee ID <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. EMP-104 or DRV-501"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Initial PIN <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="4 to 6 digit PIN"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Role & Routing */}
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 12 }}>
                  2. Role & Department Auto-Routing
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Account Role <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      className="form-input"
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as Role)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, backgroundColor: '#ffffff' }}
                    >
                      {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin (Full Fleet Control)</option>}
                      {isSuperAdmin && <option value="ADMIN">Department Admin (Category Head)</option>}
                      <option value="EXECUTIVE">Executive (Category Staff)</option>
                      <option value="DRIVER">Driver (Mobile App User)</option>
                    </select>
                  </div>

                  {(selectedRole === 'ADMIN' || selectedRole === 'EXECUTIVE') && (
                    <div style={{ backgroundColor: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                        Assigned Complaint Category (Auto-Routing)
                      </label>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px 0' }}>
                        Driver complaints raised under this category will auto-assign directly to this user.
                      </p>
                      <select
                        className="form-input"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, backgroundColor: '#ffffff' }}
                      >
                        <option value="">-- Select Category --</option>
                        {COMPLAINT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Personal Details */}
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 12 }}>
                  3. User Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      First Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Rahul"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Last Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Sharma"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                      required
                    />
                  </div>
                </div>

                {selectedRole === 'DRIVER' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Driving License (DL) Number
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. DL-1420110012345"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Email (Optional)</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="user@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Phone (Optional)</label>
                    <input
                      type="tel"
                      className="form-input"
                      placeholder="+91 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    fontWeight: 600,
                    backgroundColor: '#075E54',
                    borderColor: '#075E54',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  {submitting ? 'Creating User...' : 'Create User ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-backdrop" style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <div
            className="modal-card"
            style={{
              maxWidth: 540,
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              padding: 0,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: '#1e293b',
                padding: '20px 24px',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Edit2 size={20} color="#FFFFFF" />
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>Edit User Details</h2>
                  <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.8)', margin: 0, marginTop: 2 }}>
                    Employee ID: <strong style={{ color: '#38bdf8' }}>{editingUser.employeeId}</strong> • Role: {editingUser.role}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  opacity: 0.8,
                  padding: 4,
                  display: 'flex',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveEdit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                    First Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.firstName}
                    onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Last Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.lastName}
                    onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                    required
                  />
                </div>
              </div>

              {(editingUser.role === 'ADMIN' || editingUser.role === 'EXECUTIVE') && (
                <div style={{ backgroundColor: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                    Assigned Complaint Category (Auto-Routing)
                  </label>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px 0' }}>
                    Complaints filed in this category will automatically be routed to this user.
                  </p>
                  <select
                    className="form-input"
                    value={editingUser.category ?? ''}
                    onChange={(e) => setEditingUser({ ...editingUser, category: (e.target.value as ComplaintCategory) || null })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, backgroundColor: '#ffffff' }}
                  >
                    <option value="">-- None --</option>
                    {COMPLAINT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={editingUser.email ?? ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Phone</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={editingUser.phone ?? ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{ padding: '10px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                  {submitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
