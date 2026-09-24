import { useState, useMemo, type ReactElement } from 'react';
import type { OperatingSitePublic, CreateOperatingSite, UpdateOperatingSite } from '@driver-complaint/shared-types';
import {
  Settings,
  MapPin,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Warehouse,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth, isSuperAdmin, isAdmin } from '../auth/AuthContext';
import { useApiResource } from '../hooks/useApiResource';
import { ErrorBanner } from '../components/ErrorBanner';

export function SettingsPage(): ReactElement {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<OperatingSitePublic | null>(null);
  const [deletingSite, setDeletingSite] = useState<OperatingSitePublic | null>(null);

  // Form states
  const [formData, setFormData] = useState<{ name: string; code: string; address: string; isActive: boolean }>({
    name: '',
    code: '',
    address: '',
    isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch sites
  const sitesResource = useApiResource('sites:list', () => api.sites.list());
  const sites = sitesResource.data ?? [];
  const loading = sitesResource.loading;
  const error = sitesResource.error;

  const showSuccessBanner = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const openCreateModal = () => {
    setFormData({ name: '', code: '', address: '', isActive: true });
    setFormError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (site: OperatingSitePublic) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      code: site.code || '',
      address: site.address || '',
      isActive: site.isActive,
    });
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Site name is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (editingSite) {
        const payload: UpdateOperatingSite = {
          name: formData.name.trim(),
          code: formData.code.trim() ? formData.code.trim() : null,
          address: formData.address.trim() ? formData.address.trim() : null,
          isActive: formData.isActive,
        };
        await api.sites.update(editingSite.id, payload);
        showSuccessBanner(`Site "${formData.name}" updated successfully.`);
        setEditingSite(null);
      } else {
        const payload: CreateOperatingSite = {
          name: formData.name.trim(),
          code: formData.code.trim() ? formData.code.trim() : null,
          address: formData.address.trim() ? formData.address.trim() : null,
          isActive: formData.isActive,
        };
        await api.sites.create(payload);
        showSuccessBanner(`Site "${formData.name}" added successfully.`);
        setIsCreateOpen(false);
      }
      void sitesResource.reload();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save site');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSite) return;
    setSubmitting(true);
    try {
      await api.sites.remove(deletingSite.id);
      showSuccessBanner(`Site "${deletingSite.name}" deleted.`);
      setDeletingSite(null);
      void sitesResource.reload();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to delete site');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (site: OperatingSitePublic) => {
    try {
      await api.sites.update(site.id, { isActive: !site.isActive });
      showSuccessBanner(`Site "${site.name}" status changed to ${!site.isActive ? 'Active' : 'Inactive'}.`);
      void sitesResource.reload();
    } catch (err: any) {
      alert(err?.message || 'Failed to change site status');
    }
  };

  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      if (statusFilter === 'ACTIVE' && !site.isActive) return false;
      if (statusFilter === 'INACTIVE' && site.isActive) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = site.name.toLowerCase().includes(q);
        const matchesCode = site.code ? site.code.toLowerCase().includes(q) : false;
        const matchesAddress = site.address ? site.address.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesCode && !matchesAddress) return false;
      }
      return true;
    });
  }, [sites, statusFilter, search]);

  const stats = useMemo(() => {
    const total = sites.length;
    const active = sites.filter((s) => s.isActive).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [sites]);

  const canManage = isSuperAdmin(user) || isAdmin(user);

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary, #3b82f6)'
            }}>
              <Settings size={22} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-main, #0f172a)' }}>
              Settings & Hub Management
            </h1>
          </div>
          <p style={{ margin: '4px 0 0 46px', fontSize: 13, color: 'var(--text-muted, #64748b)' }}>
            Configure operating sites, hub locations, and platform properties for Executive user assignment.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void sitesResource.reload()}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          {canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openCreateModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <Plus size={16} />
              Add Operating Site
            </button>
          ) : null}
        </div>
      </div>

      {actionSuccess ? (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          color: '#16a34a',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          fontWeight: 500,
        }}>
          <CheckCircle2 size={18} />
          {actionSuccess}
        </div>
      ) : null}

      <ErrorBanner error={error} />

      {/* KPI Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{
          padding: 16,
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6',
          }}>
            <MapPin size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Sites
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-main, #0f172a)', marginTop: 2 }}>
              {stats.total}
            </div>
          </div>
        </div>

        <div style={{
          padding: 16,
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#16a34a',
          }}>
            <Warehouse size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Sites
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>
              {stats.active}
            </div>
          </div>
        </div>

        <div style={{
          padding: 16,
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444',
          }}>
            <AlertCircle size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Inactive Sites
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444', marginTop: 2 }}>
              {stats.inactive}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {/* Controls Toolbar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color, #e2e8f0)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260, maxWidth: 440 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted, #94a3b8)',
                }}
              />
              <input
                type="text"
                placeholder="Search by site name, code, or address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color, #cbd5e1)',
                  backgroundColor: 'var(--input-bg, #ffffff)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted, #94a3b8)',
                  }}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted, #64748b)', marginRight: 4 }}>
              Status:
            </div>
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: statusFilter === filter ? '1px solid #3b82f6' : '1px solid var(--border-color, #e2e8f0)',
                  backgroundColor: statusFilter === filter ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  color: statusFilter === filter ? '#3b82f6' : 'var(--text-main, #475569)',
                  transition: 'all 0.15s ease',
                }}
              >
                {filter === 'ALL' ? 'All' : filter === 'ACTIVE' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        </div>

        {/* Sites Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Site Name
                </th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Code / Short ID
                </th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Address / Hub Location
                </th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Created At
                </th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && sites.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                    <RotateCw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                    <div>Loading operating sites...</div>
                  </td>
                </tr>
              ) : filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                    <MapPin size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main, #1e293b)' }}>
                      No operating sites found
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {search ? 'Try adjusting your search criteria.' : 'Click "Add Operating Site" to create your first site.'}
                    </div>
                    {!search && canManage ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={openCreateModal}
                        style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Plus size={16} />
                        Add Operating Site
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : (
                filteredSites.map((site) => (
                  <tr
                    key={site.id}
                    style={{
                      borderBottom: '1px solid var(--border-color, #e2e8f0)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MapPin size={16} style={{ color: site.isActive ? '#3b82f6' : '#94a3b8' }} />
                        <span>{site.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {site.code ? (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 700,
                          backgroundColor: 'rgba(99, 102, 241, 0.1)',
                          color: '#4f46e5',
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          letterSpacing: '0.05em',
                        }}>
                          {site.code}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-main, #334155)', fontSize: 13, maxWidth: 300 }}>
                      {site.address || <span style={{ color: 'var(--text-muted, #94a3b8)' }}>No address specified</span>}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <button
                        type="button"
                        onClick={() => canManage && handleToggleActive(site)}
                        disabled={!canManage}
                        title={canManage ? 'Click to toggle status' : undefined}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: canManage ? 'pointer' : 'default',
                          border: site.isActive ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          backgroundColor: site.isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: site.isActive ? '#16a34a' : '#ef4444',
                        }}
                      >
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: site.isActive ? '#16a34a' : '#ef4444',
                        }} />
                        {site.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-muted, #64748b)', fontSize: 13 }}>
                      {new Date(site.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      {canManage ? (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => openEditModal(site)}
                            title="Edit site"
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: '1px solid var(--border-color, #e2e8f0)',
                              backgroundColor: 'transparent',
                              cursor: 'pointer',
                              color: 'var(--text-main, #334155)',
                            }}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon text-danger"
                            onClick={() => setDeletingSite(site)}
                            title="Delete site"
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              backgroundColor: 'rgba(239, 68, 68, 0.05)',
                              cursor: 'pointer',
                              color: '#ef4444',
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 12 }}>View only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {(isCreateOpen || editingSite) && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: 16,
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'var(--card-bg, #ffffff)',
            borderRadius: 12,
            width: '100%',
            maxWidth: 520,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color, #e2e8f0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-main, #0f172a)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={20} color="#3b82f6" />
                {editingSite ? 'Edit Operating Site' : 'Add New Operating Site'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingSite(null);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #64748b)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: 20 }}>
              {formError ? (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 13,
                }}>
                  {formError}
                </div>
              ) : null}

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-main, #334155)' }}>
                  Site Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kolkata Hub, Dankuni Yard, Haldia Terminal"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--input-bg, #ffffff)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-main, #334155)' }}>
                  Site Code / Short ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CCU-01, DAN-YRD, HLD-01"
                  value={formData.code}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--input-bg, #ffffff)',
                    fontSize: 14,
                    outline: 'none',
                    textTransform: 'uppercase',
                  }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-main, #334155)' }}>
                  Full Address / Location Details (Optional)
                </label>
                <textarea
                  placeholder="e.g. NH-6, Dankuni Toll Plaza Road, Hooghly, West Bengal - 712311"
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--input-bg, #ffffff)',
                    fontSize: 14,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span>Active Operating Site (Available in Hub Location dropdowns)</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingSite(null);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                >
                  {submitting ? <RotateCw size={15} className="spin" /> : null}
                  {editingSite ? 'Save Changes' : 'Create Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSite && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: 16,
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'var(--card-bg, #ffffff)',
            borderRadius: 12,
            width: '100%',
            maxWidth: 440,
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
              }}>
                <Trash2 size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                Delete Operating Site?
              </h3>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted, #64748b)', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{deletingSite.name}</strong>? This action cannot be undone. If users or vehicles are assigned to this site, consider making it <strong>Inactive</strong> instead.
            </p>
            {formError ? (
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 13,
              }}>
                {formError}
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingSite(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={submitting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, backgroundColor: '#ef4444', color: '#ffffff' }}
              >
                {submitting ? <RotateCw size={15} className="spin" /> : null}
                Delete Site
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
