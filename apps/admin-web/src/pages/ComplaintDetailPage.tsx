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
  HelpCircle,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApiResource } from '../hooks/useApiResource';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ErrorBanner } from '../components/ErrorBanner';
import { PriorityBadge, StatusBadge, SlaBadge } from '../components/Badges';
import { formatBytes, formatDateTime, formatDuration, formatEnum, fullName, computeSlaInfo } from '../lib/format';

const TERMINAL_STATUSES: ComplaintStatus[] = ['RESOLVED', 'CLOSED'];

/** Trip Phase visual config */
const TRIP_PHASE_CONFIG: Record<
  TripPhase,
  { label: string; bg: string; color: string; border: string; icon: string; desc: string }
> = {
  AT_LOADING_PLANT: {
    label: 'At Loading Plant',
    bg: 'rgba(6, 182, 212, 0.12)',
    color: '#06b6d4',
    border: 'rgba(6, 182, 212, 0.35)',
    icon: '🏭',
    desc: 'The complaint was raised while the vehicle is currently at the loading factory or warehouse.',
  },
  IN_TRANSIT: {
    label: 'In Transit / Highway',
    bg: 'rgba(249, 115, 22, 0.12)',
    color: '#f97316',
    border: 'rgba(249, 115, 22, 0.35)',
    icon: '🚚',
    desc: 'The vehicle is actively in motion on highway/transit route with loaded cargo.',
  },
  AT_UNLOADING_POINT: {
    label: 'At Unloading Point',
    bg: 'rgba(168, 85, 247, 0.12)',
    color: '#a855f7',
    border: 'rgba(168, 85, 247, 0.35)',
    icon: '📦',
    desc: 'The vehicle has arrived at destination and is undergoing cargo unloading.',
  },
  YARD_IDLE: {
    label: 'Parking',
    bg: 'rgba(148, 163, 184, 0.1)',
    color: 'var(--muted)',
    border: 'var(--border)',
    icon: '🅿️',
    desc: 'Vehicle is currently in parking and not on an active trip.',
  },
};

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

  const handleRequestClarificationPreset = () => {
    setNote('Clarification requested from driver: Please provide more details regarding the current vehicle issue, exact breakdown location, or attached photos.');
    if (noteTextareaRef.current) {
      noteTextareaRef.current.focus();
    }
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

  const phaseKey: TripPhase = complaint.tripPhase || 'YARD_IDLE';
  const phaseCfg = TRIP_PHASE_CONFIG[phaseKey] || TRIP_PHASE_CONFIG.YARD_IDLE;
  const isNeedsAction =
    complaint.status === 'NEW' &&
    (!complaint.assignedToId || (complaint.updates?.length ?? 0) <= 1);
  const sla = computeSlaInfo(complaint.createdAt, complaint.priority, complaint.resolvedAt);

  return (
    <div className="page-container">
      {/* Top Header & Navigation */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/complaints" className="back-link" style={{ marginBottom: 12 }}>
          <ArrowLeft size={16} style={{ marginRight: 6 }} /> Back to Complaints Queue
        </Link>

        <div className="detail-header-card" style={{ padding: '20px 24px' }}>
          <div className="detail-header-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <span className="complaint-no-tag" style={{ fontSize: 16, fontWeight: 800 }}>
                {complaint.complaintNo}
              </span>
              <StatusBadge status={complaint.status} />
              <PriorityBadge priority={complaint.priority} />
              <SlaBadge sla={sla} />
              {isNeedsAction && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                  title="Untouched: Newly filed complaint awaiting team assignment and first response."
                >
                  <AlertTriangle size={12} /> Needs Action
                </span>
              )}
            </div>

            <h1 className="detail-title" style={{ fontSize: 20, margin: '6px 0 2px' }}>
              {complaint.title}
            </h1>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Logged {sla.elapsedText} ({formatDateTime(complaint.createdAt)})
            </div>
          </div>
        </div>
      </div>

      <ErrorBanner error={detailRes.error} />

      {/* Live Trip & Loading Process Context Banner */}
      <div
        className="table-card"
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          border: `1px solid ${phaseCfg.border}`,
          backgroundColor: phaseCfg.bg,
          borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                fontSize: 24,
                padding: '10px 12px',
                borderRadius: 10,
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              {phaseCfg.icon}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: phaseCfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Trip Phase at Complaint Time
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    backgroundColor: 'var(--surface)',
                    border: `1px solid ${phaseCfg.border}`,
                    color: phaseCfg.color,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {phaseCfg.label}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4, fontWeight: 500 }}>
                {phaseCfg.desc}
              </div>
              {complaint.tripLocationName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
                  <MapPin size={13} color="var(--muted)" /> Location / Point: <strong>{complaint.tripLocationName}</strong>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {complaint.loadingRecordId && (
              <Link
                to="/loading-tracker"
                className="btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                <Truck size={14} color="var(--accent)" /> View Live Loading Tracker <ExternalLink size={12} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Pending SuperAdmin Acceptance Banner */}
      {complaint.assignmentStatus === 'PENDING' && complaint.pendingAssignee ? (
        <div className="pending-assignment-banner" style={{ marginBottom: 20 }}>
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
          {/* Card 1: Key Metadata & Direct Driver Contact */}
          <div className="table-card detail-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="card-section-title" style={{ margin: 0 }}>
                <FileText size={18} color="var(--accent)" /> Driver & Vehicle Details
              </h2>
              {complaint.driverPhone ? (
                <a
                  href={`tel:${complaint.driverPhone}`}
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 8,
                    textDecoration: 'none',
                  }}
                  title={`Call driver on ${complaint.driverPhone}`}
                >
                  <Phone size={13} /> Call Driver ({complaint.driverPhone})
                </a>
              ) : null}
            </div>

            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Driver Name</span>
                <span className="meta-value">
                  {fullName(complaint.driver)} · <strong>{complaint.driver.employeeId}</strong>
                </span>
                <span className="meta-sub">DL: {complaint.driver.licenseNumber}</span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Vehicle Assigned</span>
                <span className="meta-value">
                  {complaint.vehicle
                    ? `${complaint.vehicle.plateNumber}${
                        complaint.vehicle.make ? ` · ${complaint.vehicle.make}` : ''
                      }${complaint.vehicle.model ? ` ${complaint.vehicle.model}` : ''}`
                    : complaint.vehiclePlateNumber || '— Not linked'}
                </span>
                {complaint.vehicle?.agreementStatus && (
                  <span className="meta-sub">
                    Agreement: <strong>{complaint.vehicle.agreementStatus}</strong>
                    {complaint.vehicle.wheels ? ` · ${complaint.vehicle.wheels} Wheeler` : ''}
                  </span>
                )}
              </div>

              <div className="meta-item">
                <span className="meta-label">Assigned Staff / Team</span>
                <span className="meta-value">
                  {complaint.assignmentStatus === 'PENDING' && complaint.pendingAssignee ? (
                    <span className="pending-assignee-badge">
                      Pending SuperAdmin Approval ({fullName(complaint.pendingAssignee)})
                    </span>
                  ) : complaint.assignedTo ? (
                    <span className="assignee-tag">
                      👤 {fullName(complaint.assignedTo)} ({complaint.assignedTo.employeeId})
                    </span>
                  ) : (
                    <span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>
                      ⚠️ Unassigned (Needs Action)
                    </span>
                  )}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Reported Timestamp</span>
                <span className="meta-value">{formatDateTime(complaint.createdAt)}</span>
              </div>

              {complaint.resolvedAt ? (
                <div className="meta-item">
                  <span className="meta-label">Resolved Timestamp</span>
                  <span className="meta-value">{formatDateTime(complaint.resolvedAt)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Card 2: Driver Report Description & Audio Note */}
          <div className="table-card detail-card">
            <h2 className="card-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={18} color="var(--accent)" /> What the Driver Reported
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
                  <Mic size={14} color="var(--accent)" />
                  {transcribing ? 'Transcribing…' : 'Convert Voice Note to Text'}
                </button>
              ) : null}
            </h2>

            <ErrorBanner error={transcribeError} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Language:</span>
              {(['ENGLISH', 'BENGALI', 'HINDI'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleLanguageChange(lang)}
                  disabled={translatingLang === lang}
                  style={{
                    padding: '4px 14px',
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: 700,
                    border: selectedLang === lang ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: selectedLang === lang ? 'var(--accent)' : 'var(--surface)',
                    color: selectedLang === lang ? '#ffffff' : 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                  }}
                >
                  {translatingLang === lang ? `Translating…` : lang}
                </button>
              ))}
            </div>

            <div className="driver-statement-box" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
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
                      📷 Photo attached
                    </p>
                  );
                }

                if (hasUserText && hasTranscription) {
                  return (
                    <>
                      <p className="statement-text">{getDisplayText(complaint.description, 'description')}</p>
                      <div style={{ borderTop: '1px dashed var(--border)', marginTop: 10, paddingTop: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <Mic size={12} color="var(--accent)" /> Voice Note Transcription:
                        </span>
                        <p className="statement-text" style={{ fontSize: 13, color: 'var(--text)' }}>
                          {getDisplayText(complaint.transcription!, 'transcription')}
                        </p>
                      </div>
                    </>
                  );
                }

                if (hasTranscription) {
                  return (
                    <p className="statement-text">{getDisplayText(complaint.transcription!, 'transcription')}</p>
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

          {/* Card 3: Evidence & Media Attachments */}
          <div className="table-card detail-card">
            <h2 className="card-section-title">
              <Paperclip size={18} color="var(--accent)" /> Evidence Attachments{' '}
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

          {/* Card 4: Audit Timeline */}
          <div className="table-card detail-card">
            <h2 className="card-section-title">
              <History size={18} color="var(--accent)" /> Audit & Action Timeline
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="card-section-title" style={{ margin: 0 }}>
                <CheckSquare size={18} color="var(--accent)" /> Take Action & Update
              </h2>
              <button
                type="button"
                onClick={handleRequestClarificationPreset}
                className="btn-secondary btn-sm"
                style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Fill note with a driver clarification request"
              >
                <HelpCircle size={12} color="var(--accent)" /> Request Driver Info
              </button>
            </div>
            <ErrorBanner error={statusError} />

            <div className="form-group">
              <label htmlFor="newStatus" className="form-label">
                Select Complaint Status
              </label>
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
              <label htmlFor="note" className="form-label">
                Action Taken / Progress / Clarification Note
              </label>
              <textarea
                id="note"
                ref={noteTextareaRef}
                className="form-textarea"
                rows={4}
                maxLength={2000}
                placeholder="Type progress update, clarification request, or resolution details. The driver receives this update directly."
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
              <p className="form-hint">Type a note above to record an action while keeping the current status.</p>
            ) : null}
          </form>

          {/* Assign Card */}
          <form className="table-card form-card" onSubmit={submitAssignee}>
            <h2 className="card-section-title">
              <UserCheck size={18} color="var(--accent)" /> Assign Staff / Team
            </h2>
            <ErrorBanner error={assignError} />
            <ErrorBanner error={adminsRes.error} />

            <div className="form-group">
              <label htmlFor="assignee" className="form-label">
                Assignee Member / Team Leader
              </label>
              <select
                id="assignee"
                className="form-select"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                disabled={complaint.assignmentStatus === 'PENDING'}
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
                  >
                    {savingAssignee
                      ? 'Submitting…'
                      : isAssigningToSuperAdmin
                        ? 'Request SuperAdmin Assignment'
                        : 'Assign Staff / Team'}
                  </button>
                  {isPending ? (
                    <p className="form-hint" style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
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
