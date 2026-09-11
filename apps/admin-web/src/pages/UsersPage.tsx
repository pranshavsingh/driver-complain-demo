import { useState, type ReactElement } from 'react';
import type { UserPublic, Role, ComplaintCategory } from '@driver-complaint/shared-types';
import { COMPLAINT_CATEGORIES } from '@driver-complaint/shared-types';
import {
  Users,
  RotateCw,
  Search,
  X,
  ShieldAlert,
  Plus,
  Edit2,
  UserCheck,
  UserX,
  CheckCircle2,
} from '../components/Icons';
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
        employeeId: employeeId.trim().toUpperCase(),
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 16,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.35)',
            }}
          >
            SUPER ADMIN
          </span>
        );
      case 'ADMIN':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 16,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.35)',
            }}
          >
            DEPARTMENT ADMIN
          </span>
        );
      case 'EXECUTIVE':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 16,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: 'rgba(249, 115, 22, 0.15)',
              color: '#fb923c',
              border: '1px solid rgba(249, 115, 22, 0.35)',
            }}
          >
            EXECUTIVE
          </span>
        );
      case 'DRIVER':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 16,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.35)',
            }}
          >
            DRIVER
          </span>
        );
    }
  };

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={26} color="var(--accent)" /> User Accounts & Approvals
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

          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> Create User ID
          </button>
        </div>
      </div>

      <ErrorBanner error={usersResource.error} />

      {/* Modern Navigation Tabs */}
      <div
        style={{
          display: 'inline-flex',
          padding: 4,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginBottom: 16,
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: activeTab === 'directory' ? 700 : 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: activeTab === 'directory' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'directory' ? '#ffffff' : 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>All Users Directory</span>
          <span
            style={{
              padding: '1px 7px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 800,
              background: activeTab === 'directory' ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg)',
              color: activeTab === 'directory' ? '#ffffff' : 'var(--muted)',
            }}
          >
            {usersList.length}
          </span>
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 13,
              fontWeight: activeTab === 'pending' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: activeTab === 'pending' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'pending' ? '#ffffff' : 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>Pending Approvals</span>
            {pendingUsers.length > 0 && (
              <span
                style={{
                  padding: '1px 7px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  background: 'var(--danger-border)',
                  color: '#ffffff',
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
        {/* Responsive Filter & Action Toolbar */}
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
              {activeTab === 'directory' ? 'User Directory' : 'Pending Approvals'}{' '}
              <span className="badge-pill">{filteredUsers.length}</span>
            </h2>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              flex: '1 1 auto',
              justifyContent: 'flex-end',
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                }}
              />
              <input
                type="text"
                className="filter-select"
                placeholder="Search by name, Emp ID, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: 32, paddingRight: searchQuery ? 28 : 10 }}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
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

            {/* Role Filter */}
            {activeTab === 'directory' && (
              <select
                className="filter-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{ width: 'auto', minWidth: 150 }}
              >
                <option value="ALL">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Department Admin</option>
                <option value="EXECUTIVE">Executive</option>
                <option value="DRIVER">Driver</option>
              </select>
            )}

            {(searchQuery !== '' || roleFilter !== 'ALL') && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('ALL');
                }}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Reset
              </button>
            )}
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
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          fontSize: 13,
                          letterSpacing: '0.04em',
                          padding: '4px 8px',
                          background: 'var(--bg)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                        }}
                      >
                        {u.employeeId}
                      </span>
                    </td>
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                          {u.firstName} {u.lastName}
                        </div>
                        {u.email && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{u.email}</div>}
                      </div>
                    </td>
                    <td>{getRoleBadge(u.role)}</td>
                    <td>
                      {u.category ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 10px',
                            borderRadius: 6,
                            backgroundColor: 'rgba(6, 182, 212, 0.15)',
                            color: '#22d3ee',
                            border: '1px solid rgba(6, 182, 212, 0.35)',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {u.category}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      {u.approvalStatus === 'APPROVED' && (
                        <span
                          style={{
                            color: 'var(--success-text)',
                            fontWeight: 700,
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <CheckCircle2 size={14} /> Approved
                        </span>
                      )}
                      {u.approvalStatus === 'PENDING_APPROVAL' && (
                        <span
                          style={{
                            color: 'var(--warning-text)',
                            fontWeight: 700,
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <ShieldAlert size={14} /> Pending Approval
                        </span>
                      )}
                      {u.approvalStatus === 'REJECTED' && (
                        <span style={{ color: 'var(--danger-text)', fontWeight: 700, fontSize: 12 }}>
                          Rejected
                        </span>
                      )}
                    </td>
                    <td>
                      {u.isActive ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--success-text)',
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success-text)' }} />
                          Active
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--muted)',
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)' }} />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                        {/* Approval actions for SuperAdmin on pending users */}
                        {isSuperAdmin && u.approvalStatus === 'PENDING_APPROVAL' && (
                          <>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{
                                padding: '5px 10px',
                                fontSize: 12,
                                backgroundColor: 'var(--success-text)',
                                borderColor: 'var(--success-border)',
                              }}
                              onClick={() => handleApprove(u.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{
                                padding: '5px 10px',
                                fontSize: 12,
                                color: 'var(--danger-text)',
                                borderColor: 'var(--danger-border)',
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
                            title={u.isActive ? 'Deactivate account' : 'Activate account'}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '5px 10px',
                              fontSize: 12,
                              fontWeight: 600,
                              borderRadius: 6,
                              cursor: 'pointer',
                              background: u.isActive ? 'var(--danger-bg)' : 'var(--success-bg)',
                              color: u.isActive ? 'var(--danger-text)' : 'var(--success-text)',
                              border: u.isActive ? '1px solid var(--danger-border)' : '1px solid var(--success-border)',
                            }}
                          >
                            {u.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}

                        {/* Edit User details */}
                        {isSuperAdmin && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onClick={() => setEditingUser(u)}
                            title="Edit user details"
                          >
                            <Edit2 size={13} />
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
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 580,
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
                background: 'var(--bg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                  }}
                >
                  <Plus size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Create User ID</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 2 }}>
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
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form
              onSubmit={handleCreateUser}
              style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              {!isSuperAdmin && (
                <div
                  style={{
                    backgroundColor: 'var(--warning-bg)',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--warning-border)',
                    fontSize: 13,
                    color: 'var(--warning-text)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>SuperAdmin Approval Required:</strong> Accounts requested by Department Admins remain
                    pending until approved by Super Admin.
                  </div>
                </div>
              )}

              {modalError && (
                <div
                  style={{
                    backgroundColor: 'var(--danger-bg)',
                    color: 'var(--danger-text)',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--danger-border)',
                    fontSize: 13,
                  }}
                >
                  {modalError}
                </div>
              )}

              {/* Section 1: Authentication */}
              <div>
                <h4
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--accent)',
                    marginBottom: 12,
                  }}
                >
                  1. Login Credentials
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      Employee ID <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="filter-select"
                      placeholder="e.g. EMP-104 or DRV-501"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      Initial PIN <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="password"
                      className="filter-select"
                      placeholder="4 to 6 digit PIN"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px' }}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Role & Routing */}
              <div>
                <h4
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--accent)',
                    marginBottom: 12,
                  }}
                >
                  2. Role & Department Auto-Routing
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      Account Role <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <select
                      className="filter-select"
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as Role)}
                      style={{ width: '100%', padding: '9px 12px' }}
                    >
                      {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin (Full Fleet Control)</option>}
                      {isSuperAdmin && <option value="ADMIN">Department Admin (Category Head)</option>}
                      <option value="EXECUTIVE">Executive (Category Staff)</option>
                      <option value="DRIVER">Driver (Mobile App User)</option>
                    </select>
                  </div>

                  {(selectedRole === 'ADMIN' || selectedRole === 'EXECUTIVE') && (
                    <div
                      style={{
                        backgroundColor: 'var(--bg)',
                        padding: 14,
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                        Assigned Complaint Category (Auto-Routing)
                      </label>
                      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px 0' }}>
                        Driver complaints raised under this category will auto-assign directly to this user.
                      </p>
                      <select
                        className="filter-select"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                        style={{ width: '100%', padding: '9px 12px' }}
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
                <h4
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--accent)',
                    marginBottom: 12,
                  }}
                >
                  3. User Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      First Name <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="filter-select"
                      placeholder="e.g. Rahul"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      Last Name <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="filter-select"
                      placeholder="e.g. Sharma"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px' }}
                      required
                    />
                  </div>
                </div>

                {selectedRole === 'DRIVER' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      Driving License (DL) Number
                    </label>
                    <input
                      type="text"
                      className="filter-select"
                      placeholder="e.g. DL-1420110012345"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px' }}
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      className="filter-select"
                      placeholder="user@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                      Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      className="filter-select"
                      placeholder="+91 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '9px 18px', borderRadius: 8, fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{
                    padding: '9px 22px',
                    borderRadius: 8,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {submitting ? 'Creating User…' : 'Create User ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
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
          onClick={() => setEditingUser(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 540,
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
                background: 'var(--bg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                  }}
                >
                  <Edit2 size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Edit User Details</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 2 }}>
                    Employee ID:{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>
                      {editingUser.employeeId}
                    </span>{' '}
                    • Role: {editingUser.role}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <form
              onSubmit={handleSaveEdit}
              style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    First Name <span style={{ color: 'var(--danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="filter-select"
                    value={editingUser.firstName}
                    onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Last Name <span style={{ color: 'var(--danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="filter-select"
                    value={editingUser.lastName}
                    onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px' }}
                    required
                  />
                </div>
              </div>

              {(editingUser.role === 'ADMIN' || editingUser.role === 'EXECUTIVE') && (
                <div
                  style={{
                    backgroundColor: 'var(--bg)',
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                    Assigned Complaint Category (Auto-Routing)
                  </label>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px 0' }}>
                    Complaints filed in this category will automatically be routed to this user.
                  </p>
                  <select
                    className="filter-select"
                    value={editingUser.category ?? ''}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, category: (e.target.value as ComplaintCategory) || null })
                    }
                    style={{ width: '100%', padding: '9px 12px' }}
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
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    className="filter-select"
                    value={editingUser.email ?? ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    className="filter-select"
                    value={editingUser.phone ?? ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px' }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '9px 18px', borderRadius: 8, fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{ padding: '9px 22px', borderRadius: 8, fontWeight: 700 }}
                >
                  {submitting ? 'Saving Changes…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

