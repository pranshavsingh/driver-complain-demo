import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  COMPLAINT_STATUSES,
  type AdminSummary,
  type ComplaintDetail,
  type ComplaintStatus,
} from '@driver-complaint/shared-types';
import {
  ArrowLeft,
  FileText,
  MessageSquare,
  Paperclip,
  Mic,
  Video,
  History,
  CheckSquare,
  UserCheck,
  Check,
  X,
  Clock,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApiResource } from '../hooks/useApiResource';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ErrorBanner } from '../components/ErrorBanner';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { formatBytes, formatDateTime, formatDuration, formatEnum, fullName } from '../lib/format';

const TERMINAL_STATUSES: ComplaintStatus[] = ['RESOLVED', 'CLOSED'];

export function ComplaintDetailPage(): ReactElement {
  const { user } = useAuth();
  const { id = '' } = useParams<{ id: string }>();
  const detailRes = useApiResource<ComplaintDetail>(`complaint:${id}`, () =>
    api.complaints.get(id),
  );
  const reload = detailRes.reload;
  const adminsRes = useApiResource<AdminSummary[]>('admins', () => api.users.admins());

  const { subscribe } = useRealtime();
  useEffect(
    () =>
      subscribe((message) => {
        if (message.payload.complaintId === id) reload();
      }),
    [subscribe, id, reload],
  );

  const complaint = detailRes.data;

  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [note, setNote] = useState('');
  const [statusError, setStatusError] = useState<unknown>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const [assignee, setAssignee] = useState('');
  const [assignError, setAssignError] = useState<unknown>(null);
  const [savingAssignee, setSavingAssignee] = useState(false);

  const [acceptingAssignment, setAcceptingAssignment] = useState(false);
  const [rejectingAssignment, setRejectingAssignment] = useState(false);
  const [rejectError, setRejectError] = useState<unknown>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<unknown>(null);

  const handleTranscribe = (): void => {
    if (!complaint) return;
    setTranscribeError(null);
    setTranscribing(true);
    api.complaints.transcribe(complaint.id).then(
      () => {
        setTranscribing(false);
        reload();
      },
      (err: unknown) => {
        setTranscribeError(err);
        setTranscribing(false);
      },
    );
  };

  useEffect(() => {
    if (!complaint) return;
    setStatus(complaint.status);
    setAssignee(complaint.assignedToId ?? '');
  }, [complaint]);

  const handleAcceptAssignment = (): void => {
    if (!complaint) return;
    setRejectError(null);
    setAcceptingAssignment(true);
    api.complaints.acceptAssignment(complaint.id).then(
      () => {
        setAcceptingAssignment(false);
        reload();
      },
      (err: unknown) => {
        setRejectError(err);
        setAcceptingAssignment(false);
      },
    );
  };

  const handleRejectAssignment = (e: FormEvent): void => {
    e.preventDefault();
    if (!complaint) return;
    setRejectError(null);
    setRejectingAssignment(true);
    api.complaints.rejectAssignment(complaint.id, rejectNote.trim()).then(
      () => {
        setRejectingAssignment(false);
        setShowRejectBox(false);
        setRejectNote('');
        reload();
      },
      (err: unknown) => {
        setRejectError(err);
        setRejectingAssignment(false);
      },
    );
  };

  const submitStatus = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!complaint || !status) return;

    if (TERMINAL_STATUSES.includes(status) && status !== complaint.status) {
      const ok = window.confirm(
        `Mark ${complaint.complaintNo} as ${formatEnum(status)}? The driver is notified straight away.`,
      );
      if (!ok) return;
    }

    setStatusError(null);
    setSavingStatus(true);
    api.complaints
      .updateStatus(complaint.id, { status, ...(note.trim() ? { note: note.trim() } : {}) })
      .then(
        () => {
          setNote('');
          setSavingStatus(false);
          reload();
        },
        (err: unknown) => {
          setStatusError(err);
          setSavingStatus(false);
        },
      );
  };

  const submitAssignee = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!complaint || !assignee) return;

    setAssignError(null);
    setSavingAssignee(true);
    api.complaints.assign(complaint.id, assignee).then(
      () => {
        setSavingAssignee(false);
        reload();
      },
      (err: unknown) => {
        setAssignError(err);
        setSavingAssignee(false);
      },
    );
  };

  if (detailRes.loading && !complaint) {
    return <div className="loading-state">Loading complaint details…</div>;
  }
  if (!complaint) {
    return (
      <div className="page-container">
        <ErrorBanner error={detailRes.error} />
        <Link to="/complaints" className="back-link">
          <ArrowLeft size={16} style={{ marginRight: 6 }} /> Back to complaints
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Top Header & Navigation */}
      <div>
        <Link to="/complaints" className="back-link">
          <ArrowLeft size={16} style={{ marginRight: 6 }} /> Back to Complaints Queue
        </Link>

        <div className="detail-header-card">
          <div className="detail-header-info">
            <h1 className="detail-title">
              <span className="complaint-no-tag">{complaint.complaintNo}</span> {complaint.title}
            </h1>
            <div className="badge-row">
              <StatusBadge status={complaint.status} />
              <PriorityBadge priority={complaint.priority} />
            </div>
          </div>
        </div>
      </div>

      <ErrorBanner error={detailRes.error} />

      {/* Pending SuperAdmin Acceptance Banner */}
      {complaint.assignmentStatus === 'PENDING' && complaint.pendingAssignee ? (
        <div className="pending-assignment-banner">
          <div className="banner-content">
            <div className="banner-icon">
              <Clock size={24} color="#d97706" />
            </div>
            <div>
              <h3 className="banner-title">Pending SuperAdmin Acceptance</h3>
              <p className="banner-desc">
                {user?.role === 'SUPER_ADMIN' && complaint.pendingAssignee.id === user.id ? (
                  <>An admin requested to assign this complaint to you. Please accept or reject this assignment request.</>
                ) : (
                  <>
                    Requested assignment to SuperAdmin <strong>{fullName(complaint.pendingAssignee)}</strong>. Awaiting SuperAdmin acceptance.
                  </>
                )}
              </p>
            </div>
          </div>

          {user?.role === 'SUPER_ADMIN' ? (
            <div className="banner-actions">
              <ErrorBanner error={rejectError} />
              {!showRejectBox ? (
                <div className="banner-btn-group">
                  <button
                    type="button"
                    className="btn-success-banner"
                    onClick={handleAcceptAssignment}
                    disabled={acceptingAssignment}
                  >
                    <Check size={16} style={{ marginRight: 6 }} />
                    {acceptingAssignment ? 'Accepting…' : 'Accept Assignment'}
                  </button>
                  <button
                    type="button"
                    className="btn-danger-outline-banner"
                    onClick={() => setShowRejectBox(true)}
                    disabled={acceptingAssignment}
                  >
                    <X size={16} style={{ marginRight: 6 }} />
                    Reject Assignment
                  </button>
                </div>
              ) : (
                <form className="reject-form-box" onSubmit={handleRejectAssignment}>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder="Reason for rejecting this assignment (optional)..."
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                  />
                  <div className="banner-btn-group" style={{ marginTop: 8 }}>
                    <button
                      type="submit"
                      className="btn-danger-banner"
                      disabled={rejectingAssignment}
                    >
                      {rejectingAssignment ? 'Rejecting…' : 'Confirm Rejection'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowRejectBox(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 2-Column Responsive Layout */}
      <div className="detail-layout-grid">
        {/* Left Main Content Column */}
        <div className="detail-main-column">
          {/* Card 1: Key Metadata Overview */}
          <div className="table-card detail-card">
            <h2 className="card-section-title">
              <FileText size={18} color="#1d4ed8" /> Report Metadata
            </h2>
            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Driver</span>
                <span className="meta-value">
                  {fullName(complaint.driver)} · <strong>{complaint.driver.employeeId}</strong>
                  <span className="meta-sub"> (DL: {complaint.driver.licenseNumber})</span>
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Vehicle</span>
                <span className="meta-value">
                  {complaint.vehicle
                    ? `${complaint.vehicle.plateNumber}${
                        complaint.vehicle.make ? ` · ${complaint.vehicle.make}` : ''
                      }${complaint.vehicle.model ? ` ${complaint.vehicle.model}` : ''}`
                    : '— Not linked'}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Assigned Maintenance Staff</span>
                <span className="meta-value">
                  {complaint.assignmentStatus === 'PENDING' && complaint.pendingAssignee ? (
                    <span className="pending-assignee-badge">
                      Pending SuperAdmin Approval ({fullName(complaint.pendingAssignee)})
                    </span>
                  ) : complaint.assignedTo ? (
                    <span className="assignee-tag">
                      {fullName(complaint.assignedTo)} ({complaint.assignedTo.employeeId})
                    </span>
                  ) : (
                    <span className="unassigned-tag">Unassigned</span>
                  )}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Reported Date</span>
                <span className="meta-value">{formatDateTime(complaint.createdAt)}</span>
              </div>

              {complaint.resolvedAt ? (
                <div className="meta-item">
                  <span className="meta-label">Resolved Date</span>
                  <span className="meta-value">{formatDateTime(complaint.resolvedAt)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Card 2: Driver Report Description */}
          <div className="table-card detail-card">
            <h2 className="card-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={18} color="#1d4ed8" /> What the Driver Reported
              </span>
              {complaint.transcription || complaint.attachments.some((a) => a.kind === 'VOICE' && a.transcription) ? (
                <span className="transcription-badge">
                  <Mic size={14} style={{ marginRight: 4 }} /> Transcribed Voice Note
                </span>
              ) : complaint.attachments.some((a) => a.kind === 'VOICE') ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={handleTranscribe}
                  disabled={transcribing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px' }}
                >
                  <Mic size={14} color="#1d4ed8" />
                  {transcribing ? 'Transcribing…' : 'Convert Voice Note to Text'}
                </button>
              ) : null}
            </h2>

            <ErrorBanner error={transcribeError} />

            <div className="driver-statement-box">
              <p className="statement-text">
                {complaint.description && complaint.description !== 'Voice note attached'
                  ? complaint.description
                  : complaint.transcription ?? 'Voice note attached'}
              </p>
            </div>
          </div>

          {/* Card 3: Evidence & Media Attachments */}
          <div className="table-card detail-card">
            <h2 className="card-section-title">
              <Paperclip size={18} color="#1d4ed8" /> Evidence Attachments{' '}
              <span className="badge-pill">{complaint.attachments.length}</span>
            </h2>

            {complaint.attachments.length === 0 ? (
              <p className="empty-text">No photo, voice, or video evidence attached.</p>
            ) : (
              <div className="attachments-grid">
                {complaint.attachments.map((a) => (
                  <div key={a.id} className={`attachment-card attachment-${a.kind.toLowerCase()}`}>
                    {a.kind === 'PHOTO' ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="photo-link">
                        <img src={a.url} alt={a.originalName ?? 'Complaint photo'} className="attachment-photo" />
                      </a>
                    ) : a.kind === 'VOICE' ? (
                      <div className="audio-wrapper">
                        <span className="media-kind-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Mic size={14} color="#1d4ed8" /> Voice Note
                        </span>
                        <audio controls preload="none" src={a.url} className="audio-player">
                          <a href={a.url} target="_blank" rel="noreferrer">
                            Download voice note
                          </a>
                        </audio>
                      </div>
                    ) : (
                      <div className="video-wrapper">
                        <span className="media-kind-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Video size={14} color="#1d4ed8" /> Video Clip
                        </span>
                        <video controls preload="none" playsInline src={a.url} className="video-player">
                          <a href={a.url} target="_blank" rel="noreferrer">
                            Download video
                          </a>
                        </video>
                      </div>
                    )}
                    <div className="attachment-meta">
                      <span>{formatEnum(a.kind)}</span>
                      {a.durationSec ? <span> · {formatDuration(a.durationSec)}</span> : null}
                      {a.bytes ? <span> · {formatBytes(a.bytes)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 4: Audit Timeline */}
          <div className="table-card detail-card">
            <h2 className="card-section-title">
              <History size={18} color="#1d4ed8" /> Audit Timeline
            </h2>
            <div className="timeline-container">
              {complaint.updates.map((u) => (
                <div key={u.id} className="timeline-item">
                  <div className="timeline-marker" />
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-author">{fullName(u.author)}</span>
                      <span className="timeline-time">{formatDateTime(u.createdAt)}</span>
                    </div>

                    <div className="timeline-body">
                      {u.toStatus ? (
                        <div className="timeline-transition">
                          {u.fromStatus ? `${formatEnum(u.fromStatus)} ➔ ` : 'Opened as '}
                          <StatusBadge status={u.toStatus} />
                        </div>
                      ) : null}
                      {u.note ? <p className="timeline-note">{u.note}</p> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Action Sidebar */}
        <div className="detail-sidebar-column">
          {/* Status Update Card */}
          <form className="table-card form-card" onSubmit={submitStatus}>
            <h2 className="card-section-title">
              <CheckSquare size={18} color="#1d4ed8" /> Update Status
            </h2>
            <ErrorBanner error={statusError} />

            <div className="form-group">
              <label htmlFor="newStatus" className="form-label">Select Status</label>
              <select
                id="newStatus"
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
              >
                {COMPLAINT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatEnum(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="note" className="form-label">Action Taken / Progress Note</label>
              <textarea
                id="note"
                className="form-textarea"
                rows={4}
                maxLength={2000}
                placeholder="Type progress update or resolution details. The driver receives this update."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn-primary btn-full"
              disabled={savingStatus || (status === complaint.status && !note.trim())}
            >
              {savingStatus
                ? 'Saving Update…'
                : status === complaint.status
                  ? 'Add Progress Note'
                  : 'Save Status'}
            </button>
            {status === complaint.status && !note.trim() ? (
              <p className="form-hint">Type a progress note above to record an update while keeping current status.</p>
            ) : null}
          </form>

          {/* Assign Card */}
          <form className="table-card form-card" onSubmit={submitAssignee}>
            <h2 className="card-section-title">
              <UserCheck size={18} color="#1d4ed8" /> Assign Staff
            </h2>
            <ErrorBanner error={assignError} />
            <ErrorBanner error={adminsRes.error} />

            <div className="form-group">
              <label htmlFor="assignee" className="form-label">Assignee Admin / Executive</label>
              <select
                id="assignee"
                className="form-select"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                disabled={complaint.assignmentStatus === 'PENDING'}
              >
                <option value="">Select an admin or executive…</option>
                {(adminsRes.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {fullName(a)} ({formatEnum(a.role)})
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const isPending = complaint.assignmentStatus === 'PENDING';
              const selectedUser = (adminsRes.data ?? []).find((a) => a.id === assignee);
              const isAssigningToSuperAdmin = user?.role === 'ADMIN' && selectedUser?.role === 'SUPER_ADMIN';

              return (
                <>
                  <button
                    type="submit"
                    className="btn-primary btn-full"
                    disabled={isPending || savingAssignee || !assignee || assignee === complaint.assignedToId}
                  >
                    {savingAssignee
                      ? 'Submitting…'
                      : isAssigningToSuperAdmin
                        ? 'Request SuperAdmin Assignment'
                        : 'Assign Complaint'}
                  </button>
                  {isPending ? (
                    <p className="form-hint" style={{ color: '#d97706', fontWeight: 600 }}>
                      Please Accept or Reject the pending assignment request above before re-assigning this complaint.
                    </p>
                  ) : isAssigningToSuperAdmin ? (
                    <p className="form-hint">
                      Assigning to a SuperAdmin requires their acceptance before ownership transfers.
                    </p>
                  ) : null}
                </>
              );
            })()}
          </form>
        </div>
      </div>
    </div>
  );
}
