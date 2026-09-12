import { useEffect, useState, useRef, type FormEvent, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  COMPLAINT_STATUSES,
  type AdminSummary,
  type ComplaintDetail,
  type ComplaintStatus,
  type TripPhase,
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
  Truck,
  MapPin,
  Phone,
  AlertTriangle,
  ExternalLink,
  Zap,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApiResource } from '../hooks/useApiResource';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ErrorBanner } from '../components/ErrorBanner';
import { PriorityBadge, StatusBadge, SlaBadge, CategoryBadge } from '../components/Badges';
import { formatBytes, formatDateTime, formatDuration, formatEnum, fullName, computeSlaInfo } from '../lib/format';

const TERMINAL_STATUSES: ComplaintStatus[] = ['RESOLVED', 'CLOSED'];

/** Journey phase step configuration */
const JOURNEY_STEPS: { key: TripPhase; label: string; icon: string; desc: string }[] = [
  {
    key: 'AT_LOADING_PLANT',
    label: 'At Loading Plant',
    icon: '🏭',
    desc: 'At factory or warehouse loading dock',
  },
  {
    key: 'IN_TRANSIT',
    label: 'In Transit',
    icon: '🚚',
    desc: 'Actively in motion on highway / route',
  },
  {
    key: 'AT_UNLOADING_POINT',
    label: 'At Unloading Point',
    icon: '📦',
    desc: 'At destination undergoing cargo unloading',
  },
  {
    key: 'YARD_IDLE',
    label: 'Parking / Yard',
    icon: '🅿️',
    desc: 'Stationary in parking / yard',
  },
];

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
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [actionTab, setActionTab] = useState<'status' | 'assign'>('status');

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

  const [selectedLang, setSelectedLang] = useState<'ENGLISH' | 'BENGALI' | 'HINDI'>('ENGLISH');
  const [translationsCache, setTranslationsCache] = useState<
    Record<string, { description?: string; transcription?: string }>
  >({});
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);

  const handleLanguageChange = (lang: 'ENGLISH' | 'BENGALI' | 'HINDI'): void => {
    setSelectedLang(lang);
    if (!complaint || lang === 'ENGLISH' || translationsCache[lang]) return;

    const isDescPlaceholder =
      !complaint.description ||
      complaint.description === 'Photo attached' ||
      complaint.description === 'Voice note attached';
    const textToTranslateDesc = !isDescPlaceholder ? complaint.description : null;
    const textToTranslateTrans = complaint.transcription || null;

    if (!textToTranslateDesc && !textToTranslateTrans) return;

    setTranslatingLang(lang);
    const promises: Promise<void>[] = [];
    let newDescTrans: string | undefined;
    let newAudioTrans: string | undefined;

    if (textToTranslateDesc) {
      promises.push(
        api.complaints.translate(textToTranslateDesc, lang).then((res) => {
          newDescTrans = res.translatedText;
        }),
      );
    }

    if (textToTranslateTrans) {
      promises.push(
        api.complaints.translate(textToTranslateTrans, lang).then((res) => {
          newAudioTrans = res.translatedText;
        }),
      );
    }

    Promise.all(promises).then(
      () => {
        setTranslationsCache((prev) => ({
          ...prev,
          [lang]: { description: newDescTrans, transcription: newAudioTrans },
        }));
        setTranslatingLang(null);
      },
      () => {
        setTranslatingLang(null);
      },
    );
  };

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

  const applyPresetNote = (presetText: string) => {
    setNote(presetText);
    if (noteTextareaRef.current) {
      noteTextareaRef.current.focus();
    }
  };

  const submitStatus = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!complaint || !status) return;

    if (TERMINAL_STATUSES.includes(status) && status !== complaint.status) {
      const ok = window.confirm(
        `Mark ${complaint.complaintNo} as ${formatEnum(status)}? The driver will be notified immediately.`,
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
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Loading complaint file…</div>
        </div>
      </div>
    );
  }
  if (!complaint) {
    return (
      <div className="page-container">
        <ErrorBanner error={detailRes.error} />
        <Link to="/complaints" className="back-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Back to complaints
        </Link>
      </div>
    );
  }

  const currentPhase: TripPhase = complaint.tripPhase || 'YARD_IDLE';
  const isNeedsAction =
    complaint.status === 'NEW' &&
    (!complaint.assignedToId || (complaint.updates?.length ?? 0) <= 1);
  const sla = computeSlaInfo(complaint.createdAt, complaint.priority, complaint.resolvedAt);

  // Driver Initials
  const driverInitials = `${complaint.driver.firstName?.[0] || ''}${complaint.driver.lastName?.[0] || ''}`.toUpperCase() || 'D';

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 60 }}>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/complaints"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--muted)',
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            transition: 'all 0.2s ease',
          }}
        >
          <ArrowLeft size={14} /> Back to Complaints Queue
        </Link>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="detail-layout-grid">
        {/* Left Main Column */}
        <div className="detail-main-column">
          {/* Hero Header Card */}
          <div className="detail-header-hero">
            <div className="detail-hero-top">
              <div className="detail-badge-cluster">
                <span className="detail-complaint-id">{complaint.complaintNo}</span>
                <CategoryBadge category={complaint.category} />
                <StatusBadge status={complaint.status} />
                <PriorityBadge priority={complaint.priority} />
                <SlaBadge sla={sla} />
                {isNeedsAction && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 9px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(239, 68, 68, 0.18)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.02em',
                    }}
                    title="Newly filed complaint awaiting team assignment and first response."
                  >
                    <AlertTriangle size={13} /> Needs Action
                  </span>
                )}
              </div>

              <div className="detail-hero-actions">
                {complaint.driverPhone && (
                  <a
                    href={`tel:${complaint.driverPhone}`}
                    className="btn-call-driver"
                    title={`Call driver directly on ${complaint.driverPhone}`}
                  >
                    <Phone size={14} /> Call Driver ({complaint.driverPhone})
                  </a>
                )}

                {complaint.loadingRecordId && (
                  <Link
                    to="/loading-tracker"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    <Truck size={15} color="var(--accent)" /> Live Trip Tracker <ExternalLink size={13} color="var(--muted)" />
                  </Link>
                )}
              </div>
            </div>

            <h1 className="detail-hero-title">{complaint.title}</h1>

            <div className="detail-hero-meta">
              <span>🕒 Logged {sla.elapsedText} ({formatDateTime(complaint.createdAt)})</span>
              {complaint.resolvedAt && (
                <span style={{ color: '#10b981', fontWeight: 700 }}>
                  ✓ Resolved at {formatDateTime(complaint.resolvedAt)}
                </span>
              )}
              {complaint.tripLocationName && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={13} color="var(--muted)" /> {complaint.tripLocationName}
                </span>
              )}
            </div>
          </div>

          <ErrorBanner error={detailRes.error} />

          {/* Live Trip Phase Progress Stepper */}
          <div className="journey-context-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
                  Operational Trip Progression Phase
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    color: '#3b82f6',
                  }}
                >
                  Live Status
                </span>
              </div>
              {complaint.tripLocationName && (
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} /> Point: <strong>{complaint.tripLocationName}</strong>
                </span>
              )}
            </div>

            <div className="journey-step-bar">
              {JOURNEY_STEPS.map((step) => {
                const isActive = currentPhase === step.key;
                return (
                  <div key={step.key} className={`journey-step-item ${isActive ? 'active' : ''}`}>
                    <span className="step-icon">{step.icon}</span>
                    <div className="step-info">
                      <span className="step-name">{step.label}</span>
                      <span className="step-status">{isActive ? 'Current Phase' : '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending SuperAdmin Acceptance Banner */}
          {complaint.assignmentStatus === 'PENDING' && complaint.pendingAssignee ? (
            <div className="pending-assignment-banner" style={{ marginBottom: 24, borderRadius: 14 }}>
              <div className="banner-content">
                <div className="banner-icon">
                  <Clock size={24} color="#d97706" />
                </div>
                <div>
                  <h3 className="banner-title">Pending SuperAdmin Acceptance</h3>
                  <p className="banner-desc">
                    {user?.role === 'SUPER_ADMIN' && complaint.pendingAssignee.id === user.id ? (
                      <>An admin has requested to assign this complaint to you. Please review and accept or reject below.</>
                    ) : (
                      <>
                        Requested assignment to SuperAdmin <strong>{fullName(complaint.pendingAssignee)}</strong>. Awaiting their acceptance.
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
                        placeholder="Reason for rejecting assignment..."
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
          {/* Card 1: Driver & Vehicle Profile Overview */}
          <div className="table-card detail-card" style={{ borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="card-section-title" style={{ margin: 0 }}>
                <FileText size={18} color="var(--accent)" /> Driver & Fleet Assignment Details
              </h2>
            </div>

            <div className="profile-overview-grid">
              {/* Driver Profile */}
              <div className="profile-sub-box">
                <div className="profile-avatar-row">
                  <div className="profile-avatar-circle">{driverInitials}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                      {fullName(complaint.driver)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                      ID: {complaint.driver.employeeId} · License: {complaint.driver.licenseNumber}
                    </div>
                  </div>
                </div>

                <div className="profile-data-row">
                  <span className="profile-data-label">Contact Phone</span>
                  <span className="profile-data-val">
                    {complaint.driverPhone ? (
                      <a href={`tel:${complaint.driverPhone}`} style={{ color: '#10b981', fontWeight: 700 }}>
                        📞 {complaint.driverPhone}
                      </a>
                    ) : (
                      '— Not on file'
                    )}
                  </span>
                </div>

                <div className="profile-data-row">
                  <span className="profile-data-label">Driver Profile</span>
                  <span className="profile-data-val" style={{ color: '#38bdf8' }}>
                    Verified Driver
                  </span>
                </div>
              </div>

              {/* Vehicle Profile */}
              <div className="profile-sub-box">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="vehicle-plate-pill">
                    <span className="ind-tag">IND</span>
                    <span>{complaint.vehicle?.plateNumber || complaint.vehiclePlateNumber || 'UNLINKED'}</span>
                  </div>
                  {complaint.vehicle?.agreementStatus && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 6,
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      {complaint.vehicle.agreementStatus}
                    </span>
                  )}
                </div>

                <div className="profile-data-row">
                  <span className="profile-data-label">Make & Model</span>
                  <span className="profile-data-val">
                    {complaint.vehicle?.make || complaint.vehicle?.model
                      ? `${complaint.vehicle.make || ''} ${complaint.vehicle.model || ''}`.trim()
                      : complaint.vehicleModel || 'Standard Fleet Truck'}
                  </span>
                </div>

                <div className="profile-data-row">
                  <span className="profile-data-label">Configuration</span>
                  <span className="profile-data-val">
                    {complaint.vehicle?.wheels ? `${complaint.vehicle.wheels} Wheeler` : 'Commercial Haulage'}
                  </span>
                </div>
              </div>
            </div>

            {/* Assignment & Timestamps summary strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Assigned Team / Lead
                </div>
                <div>
                  {complaint.assignmentStatus === 'PENDING' && complaint.pendingAssignee ? (
                    <span className="pending-assignee-badge">
                      Pending SuperAdmin Approval ({fullName(complaint.pendingAssignee)})
                    </span>
                  ) : complaint.assignedTo ? (
                    <span className="assignee-tag" style={{ fontSize: 12 }}>
                      👤 {fullName(complaint.assignedTo)} ({complaint.assignedTo.employeeId})
                    </span>
                  ) : (
                    <span style={{ color: 'var(--danger-text)', fontWeight: 800, fontSize: 12 }}>
                      ⚠️ Unassigned (Action Required)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Resolution Target SLA
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                  {complaint.priority === 'URGENT'
                    ? '2 Hours Target'
                    : complaint.priority === 'HIGH'
                      ? '4 Hours Target'
                      : complaint.priority === 'LOW'
                        ? '24 Hours Target'
                        : '12 Hours Target'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Reported Date & Time
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                  {formatDateTime(complaint.createdAt)}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Driver Report & Voice Note Player */}
          <div className="table-card detail-card" style={{ borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <h2 className="card-section-title" style={{ margin: 0 }}>
                <MessageSquare size={18} color="var(--accent)" /> What the Driver Reported
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {complaint.transcription || complaint.attachments.some((a) => a.kind === 'VOICE' && a.transcription) ? (
                  <span className="transcription-badge">
                    <Mic size={13} style={{ marginRight: 4 }} /> Transcribed Voice Note
                  </span>
                ) : complaint.attachments.some((a) => a.kind === 'VOICE') ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={handleTranscribe}
                    disabled={transcribing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px' }}
                  >
                    <Mic size={14} color="var(--accent)" />
                    {transcribing ? 'Transcribing…' : 'Convert Voice Note to Text'}
                  </button>
                ) : null}
              </div>
            </div>

            <ErrorBanner error={transcribeError} />

            {/* Language Switcher Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Translate:</span>
              {(['ENGLISH', 'BENGALI', 'HINDI'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleLanguageChange(lang)}
                  disabled={translatingLang === lang}
                  style={{
                    padding: '4px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    border: selectedLang === lang ? '1px solid #3b82f6' : '1px solid var(--border)',
                    background: selectedLang === lang ? '#3b82f6' : 'var(--surface)',
                    color: selectedLang === lang ? '#ffffff' : 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {translatingLang === lang ? `Translating…` : lang === 'BENGALI' ? 'বাংলা Bengali' : lang === 'HINDI' ? 'हिंदी Hindi' : 'English'}
                </button>
              ))}
            </div>

            {/* Audio Voice Note Player Card if attached */}
            {complaint.attachments.some((a) => a.kind === 'VOICE') && (
              <div className="audio-card-container">
                <div className="audio-header-bar">
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mic size={15} /> Driver's Original Voice Note
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                    High Quality Audio
                  </span>
                </div>
                {complaint.attachments
                  .filter((a) => a.kind === 'VOICE')
                  .map((a) => (
                    <audio key={a.id} controls preload="none" src={a.url} className="audio-native-custom" />
                  ))}
              </div>
            )}

            {/* Driver Statement Box */}
            <div className="driver-statement-box" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', marginTop: 12, borderRadius: 12 }}>
              {(() => {
                const isPlaceholder =
                  !complaint.description ||
                  complaint.description === 'Photo attached' ||
                  complaint.description === 'Voice note attached';
                const hasUserText = !isPlaceholder;
                const hasTranscription = Boolean(complaint.transcription);
                const isPhotoOnly = complaint.description === 'Photo attached' && !hasTranscription;

                const getDisplayText = (
                  text: string,
                  type: 'description' | 'transcription' = 'description',
                ): string => {
                  if (selectedLang === 'ENGLISH') return text;
                  const cached = translationsCache[selectedLang]?.[type];
                  return cached ?? (translatingLang === selectedLang ? 'Translating…' : text);
                };

                if (isPhotoOnly) {
                  return (
                    <p className="statement-text" style={{ color: 'var(--muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 8 }}>
                      📷 Photo attached with no written note.
                    </p>
                  );
                }

                if (hasUserText && hasTranscription) {
                  return (
                    <>
                      <p className="statement-text">{getDisplayText(complaint.description, 'description')}</p>
                      <div style={{ borderTop: '1px dashed var(--border)', marginTop: 12, paddingTop: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                          <Mic size={13} color="var(--accent)" /> Voice Note AI Transcription:
                        </span>
                        <p className="statement-text" style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                          {getDisplayText(complaint.transcription!, 'transcription')}
                        </p>
                      </div>
                    </>
                  );
                }

                if (hasTranscription) {
                  return (
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                        <Mic size={13} color="var(--accent)" /> Voice Note Transcription:
                      </span>
                      <p className="statement-text" style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                        {getDisplayText(complaint.transcription!, 'transcription')}
                      </p>
                    </div>
                  );
                }

                return (
                  <p className="statement-text">
                    {getDisplayText(complaint.description || 'No description provided', 'description')}
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Card 3: Evidence & Attachments */}
          <div className="table-card detail-card" style={{ borderRadius: 14 }}>
            <h2 className="card-section-title">
              <Paperclip size={18} color="var(--accent)" /> Evidence & Media Attachments{' '}
              <span className="badge-pill">{complaint.attachments.length}</span>
            </h2>

            {complaint.attachments.length === 0 ? (
              <p className="empty-text">No photo or video evidence attached.</p>
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
                          <Mic size={14} color="var(--accent)" /> Voice Note
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
                          <Video size={14} color="var(--accent)" /> Video Clip
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
        </div>

        {/* Right Action, Assignment & Audit History Column */}
        <div className="detail-sidebar-column" style={{ position: 'sticky', top: 'calc(var(--header-height, 64px) + 20px)', alignSelf: 'start' }}>
          {/* Card 1: Take Action & Assign Staff Box */}
          <div className="table-card" style={{ borderRadius: 14, padding: 0, overflow: 'hidden' }}>
            {/* Segmented Tab Header Bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <button
                type="button"
                onClick={() => setActionTab('status')}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  background: actionTab === 'status' ? 'var(--surface)' : 'transparent',
                  color: actionTab === 'status' ? 'var(--accent)' : 'var(--muted)',
                  border: 'none',
                  borderBottom: actionTab === 'status' ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <CheckSquare size={16} /> Take Action
              </button>

              <button
                type="button"
                onClick={() => setActionTab('assign')}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  background: actionTab === 'assign' ? 'var(--surface)' : 'transparent',
                  color: actionTab === 'assign' ? 'var(--accent)' : 'var(--muted)',
                  border: 'none',
                  borderBottom: actionTab === 'assign' ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <UserCheck size={16} /> Assign Staff
                {!complaint.assignedToId && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                      display: 'inline-block',
                    }}
                    title="Complaint unassigned"
                  />
                )}
              </button>
            </div>

            {/* Tab 1 Content: Take Action & Update */}
            {actionTab === 'status' && (
              <form className="form-card" onSubmit={submitStatus} style={{ padding: '16px 18px', gap: 12 }}>
                <ErrorBanner error={statusError} />

                {/* Interactive Status Selector Chips (Horizontal 4-grid) */}
                <div className="form-group" style={{ gap: 4 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Set Complaint Status</label>
                  <div className="status-chips-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {COMPLAINT_STATUSES.map((s) => {
                      const isSelected = status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(s)}
                          className={`status-chip-btn status-${s.toLowerCase()} ${isSelected ? 'active' : ''}`}
                          style={{
                            padding: '6px 2px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 2,
                            fontSize: 11,
                            minHeight: 'auto',
                          }}
                        >
                          <span style={{ fontSize: 13 }}>
                            {s === 'NEW' ? '🔵' : s === 'IN_PROGRESS' ? '🟡' : s === 'RESOLVED' ? '🟢' : '⚫'}
                          </span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {formatEnum(s)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Action Preset Buttons */}
                <div className="form-group" style={{ gap: 4 }}>
                  <label className="form-label" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={12} color="var(--accent)" /> Quick Presets
                  </label>
                  <div className="presets-group" style={{ marginTop: 0, gap: 4 }}>
                    <button
                      type="button"
                      className="preset-pill-btn"
                      style={{ fontSize: 10.5, padding: '3px 7px' }}
                      onClick={() => applyPresetNote('Clarification requested from driver: Please provide more details regarding current vehicle condition.')}
                    >
                      💬 Info
                    </button>
                    <button
                      type="button"
                      className="preset-pill-btn"
                      style={{ fontSize: 10.5, padding: '3px 7px' }}
                      onClick={() => applyPresetNote('Location confirmation requested: Please share your exact highway/loading plant landmark.')}
                    >
                      📍 Location
                    </button>
                    <button
                      type="button"
                      className="preset-pill-btn"
                      style={{ fontSize: 10.5, padding: '3px 7px' }}
                      onClick={() => applyPresetNote('Mechanic / Breakdown assistance team has been dispatched to vehicle location.')}
                    >
                      🛠️ Mechanic
                    </button>
                    <button
                      type="button"
                      className="preset-pill-btn"
                      style={{ fontSize: 10.5, padding: '3px 7px' }}
                      onClick={() => applyPresetNote('Issue investigated and resolved. Driver cleared to proceed.')}
                    >
                      ✅ Resolved
                    </button>
                  </div>
                </div>

                {/* Note Textarea */}
                <div className="form-group" style={{ gap: 4 }}>
                  <label htmlFor="note" className="form-label" style={{ fontSize: 11 }}>
                    Action Taken / Progress Note
                  </label>
                  <textarea
                    id="note"
                    ref={noteTextareaRef}
                    className="form-textarea"
                    rows={3}
                    maxLength={2000}
                    placeholder="Type progress update, instructions for driver, or resolution details..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{ fontSize: 13, padding: '8px 10px' }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary btn-full"
                  disabled={savingStatus || (status === complaint.status && !note.trim())}
                  style={{
                    padding: '10px 14px',
                    fontSize: 13.5,
                    fontWeight: 800,
                    background: status === 'RESOLVED' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined,
                    boxShadow: status === 'RESOLVED' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : undefined,
                  }}
                >
                  {savingStatus
                    ? 'Saving Update…'
                    : status === 'RESOLVED' && complaint.status !== 'RESOLVED'
                      ? '✓ Mark Complaint as Resolved'
                      : status === complaint.status
                        ? 'Add Progress Note'
                        : `Update Status to ${formatEnum(status)}`}
                </button>
              </form>
            )}

            {/* Tab 2 Content: Assign Staff / Team */}
            {actionTab === 'assign' && (
              <form className="form-card" onSubmit={submitAssignee} style={{ padding: '16px 18px', gap: 14 }}>
                <ErrorBanner error={assignError} />
                <ErrorBanner error={adminsRes.error} />

                {/* Current Assignee Summary */}
                <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Current Assigned Lead
                  </div>
                  <div>
                    {complaint.assignedTo ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        👤 {fullName(complaint.assignedTo)} <span style={{ fontSize: 11, color: 'var(--muted)' }}>({complaint.assignedTo.employeeId})</span>
                      </span>
                    ) : (
                      <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 12 }}>
                        ⚠️ Currently Unassigned
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ gap: 4 }}>
                  <label htmlFor="assignee" className="form-label" style={{ fontSize: 11 }}>
                    Select Team Member / Lead
                  </label>
                  <select
                    id="assignee"
                    className="form-select"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    disabled={complaint.assignmentStatus === 'PENDING'}
                    style={{ fontSize: 13, padding: '8px 10px' }}
                  >
                    <option value="">Select a team member or leader…</option>
                    {(adminsRes.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {fullName(a)} ({formatEnum(a.role)}) {a.category ? `· ${formatEnum(a.category)}` : ''}
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
                        style={{ padding: '10px 14px', fontSize: 13.5, fontWeight: 800 }}
                      >
                        {savingAssignee
                          ? 'Submitting…'
                          : isAssigningToSuperAdmin
                            ? 'Request SuperAdmin Assignment'
                            : 'Assign Staff / Team'}
                      </button>
                      {isPending ? (
                        <p className="form-hint" style={{ color: 'var(--warning-text)', fontWeight: 600, fontSize: 11 }}>
                          Please Accept or Reject the pending assignment request above before re-assigning.
                        </p>
                      ) : isAssigningToSuperAdmin ? (
                        <p className="form-hint" style={{ fontSize: 11 }}>
                          Assigning to a SuperAdmin sends an assignment request for their acceptance.
                        </p>
                      ) : null}
                    </>
                  );
                })()}
              </form>
            )}
          </div>

          {/* Card 2: Action & Audit Timeline (Directly below Take Action box) */}
          <div className="table-card detail-card" style={{ borderRadius: 14, padding: '16px 18px' }}>
            <h2 className="card-section-title" style={{ fontSize: 14, margin: '0 0 12px', paddingBottom: 8 }}>
              <History size={16} color="var(--accent)" /> Action & Audit Timeline
              <span className="badge-pill" style={{ marginLeft: 6, fontSize: 11 }}>{complaint.updates.length}</span>
            </h2>

            {complaint.updates.length === 0 ? (
              <p className="empty-text" style={{ fontSize: 12 }}>No updates or actions logged yet.</p>
            ) : (
              <div className="detail-audit-timeline" style={{ gap: 12, marginTop: 8 }}>
                {complaint.updates.map((u, idx) => (
                  <div key={u.id} className="detail-audit-item">
                    <div className="detail-audit-indicator" style={{ paddingTop: 8 }}>
                      <div className="detail-audit-dot" style={{ width: 11, height: 11 }} />
                      {idx < complaint.updates.length - 1 && <div className="detail-audit-line" />}
                    </div>
                    <div className="detail-audit-bubble" style={{ padding: '10px 12px', borderRadius: 10 }}>
                      <div className="detail-audit-header" style={{ paddingBottom: 6, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span className="detail-audit-author" style={{ fontSize: 12.5 }}>👤 {fullName(u.author)}</span>
                          {u.author?.employeeId && (
                            <span className="detail-audit-role-badge" style={{ fontSize: 9.5 }}>
                              {u.author.employeeId}
                            </span>
                          )}
                        </div>
                        <span className="detail-audit-time" style={{ fontSize: 11 }}>{formatDateTime(u.createdAt)}</span>
                      </div>

                      <div className="detail-audit-body" style={{ gap: 6 }}>
                        {u.toStatus && (
                          <div className="detail-audit-status-row">
                            <span className="detail-audit-status-label" style={{ fontSize: 11 }}>Status changed to</span>
                            <StatusBadge status={u.toStatus} />
                          </div>
                        )}
                        {u.note && (
                          <div className="detail-audit-note" style={{ padding: '8px 10px' }}>
                            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                              {u.note}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
