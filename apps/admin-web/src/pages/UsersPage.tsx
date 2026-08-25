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
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2 className="modal-title">Create New User ID</h2>
              <button type="button" className="close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              {!isSuperAdmin && (
                <div style={{ backgroundColor: '#fffbe5', padding: 10, borderRadius: 6, border: '1px solid #fde047', fontSize: 13, color: '#854d0e' }}>
                  <strong>Note:</strong> Accounts created by Department Admins require <strong>Super Admin Approval</strong> before becoming active.
                </div>
              )}

              {modalError && <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: 10, borderRadius: 6, fontSize: 13 }}>{modalError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Employee ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. EMP-104"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Initial PIN *</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="4-6 digit PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>User Role *</label>
                <select
                  className="form-input"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                >
                  {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
                  {isSuperAdmin && <option value="ADMIN">Department Admin</option>}
                  <option value="EXECUTIVE">Executive</option>
                  <option value="DRIVER">Driver</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>First Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Last Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Last Name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {(selectedRole === 'ADMIN' || selectedRole === 'EXECUTIVE') && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Assigned Complaint Category (for Auto-Assignment)
                  </label>
                  <select
                    className="form-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
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

              {selectedRole === 'DRIVER' && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Driving License (DL) Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="DL Number"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email (Optional)</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="email@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone (Optional)</label>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="+91..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 className="modal-title">Edit User Details ({editingUser.employeeId})</h2>
              <button type="button" className="close-btn" onClick={() => setEditingUser(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>First Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.firstName}
                    onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Last Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.lastName}
                    onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>

              {(editingUser.role === 'ADMIN' || editingUser.role === 'EXECUTIVE') && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Assigned Complaint Category</label>
                  <select
                    className="form-input"
                    value={editingUser.category ?? ''}
                    onChange={(e) => setEditingUser({ ...editingUser, category: (e.target.value as ComplaintCategory) || null })}
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

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={editingUser.email ?? ''}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  value={editingUser.phone ?? ''}
                  onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
