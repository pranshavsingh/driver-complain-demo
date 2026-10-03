import { useEffect, useState, useRef, useMemo, type FormEvent, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AdminSummary,
  ComplaintDetail,
  ComplaintStatus,
} from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { useCategorySlaMap } from '../hooks/useCategorySlaMap';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ErrorBanner } from '../components/ErrorBanner';
import { formatDateTime, computeSlaInfo } from '../lib/format';

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ComplaintDetailPage(): ReactElement {
  const { id = '' } = useParams<{ id: string }>();

  // Resources
  const detailRes = useApiResource<ComplaintDetail>(`complaint:${id}`, () =>
    api.complaints.get(id),
  );
  const reload = detailRes.reload;
  const adminsRes = useApiResource<AdminSummary[]>('admins', () => api.users.admins());
  const { slaMap } = useCategorySlaMap();
  const { subscribe } = useRealtime();

  // Live Realtime Subscriptions
  useEffect(() => {
    return subscribe((message) => {
      if (message.payload.complaintId === id) reload();
    });
  }, [subscribe, id, reload]);

  const complaint = detailRes.data;

  // Audio Playback & Waveform State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // AI Speech Forensics Language Toggle
  const [selectedLang, setSelectedLang] = useState<'HI' | 'EN' | 'BN'>('HI');
  const [translationsCache, setTranslationsCache] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Photographic Dossier Lightbox
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  // Operational Note Composer State
  const [noteContent, setNoteContent] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Workflow Action States
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // Voice note attachment if available
  const voiceNoteAttachment = useMemo(() => {
    return complaint?.attachments?.find((a) => a.kind === 'VOICE');
  }, [complaint?.attachments]);

  // Real photo attachments only
  const photoAttachments = useMemo(() => {
    return complaint?.attachments?.filter((a) => a.kind === 'PHOTO') ?? [];
  }, [complaint?.attachments]);

  // Dynamically resolve complaint origin phase from real complaint data
  // Do NOT guess phase from category — a BREAKDOWN can happen in any phase
  const activeOriginPhase = useMemo(() => {
    // 1. Prefer the stored tripPhase (set at complaint creation from actual vehicle state)
    if (complaint?.tripPhase) {
      return complaint.tripPhase;
    }
    // 2. Fall back to loading record status (for older complaints without stored tripPhase)
    if (complaint?.loadingStatus) {
      if (complaint.loadingStatus === 'REACHED' || complaint.loadingStatus === 'COMPLETED') {
        return 'AT_LOADING_PLANT';
      }
      if (complaint.loadingStatus === 'TRIP_STARTED') {
        return 'IN_TRANSIT';
      }
      if (complaint.loadingStatus === 'UNLOADING') {
        return 'AT_UNLOADING_POINT';
      }
    }
    // 3. Default: no active trip = vehicle is in yard/parking
    return 'YARD_IDLE';
  }, [complaint?.tripPhase, complaint?.loadingStatus]);


  // SLA Calculation
  const slaTargetHours = slaMap[complaint?.category || ''] || 4;
  const slaInfo = useMemo(() => {
    if (!complaint) return null;
    return computeSlaInfo(
      complaint.createdAt,
      complaint.category,
      complaint.resolvedAt,
      slaMap,
      complaint.priority,
    );
  }, [complaint, slaMap]);

  const slaTargetMs = slaTargetHours * 60 * 60 * 1000;
  const createdAtMs = complaint ? new Date(complaint.createdAt).getTime() : Date.now();
  const elapsedMs = Math.max(
    0,
    (complaint?.resolvedAt ? new Date(complaint.resolvedAt).getTime() : Date.now()) - createdAtMs,
  );
  const remainingMs = slaTargetMs - elapsedMs;
  const deadlineIso = complaint ? new Date(createdAtMs + slaTargetMs).toISOString() : '';
  const isSlaBreached = slaInfo?.isOverdue ?? remainingMs <= 0;
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
  const slaFraction = Math.min(1, Math.max(0, elapsedMs / slaTargetMs));

  // Handle Play/Pause
  const togglePlayAudio = () => {
    if (audioRef.current && voiceNoteAttachment) {
      if (isPlayingAudio) {
        audioRef.current.pause();
      } else {
        void audioRef.current.play();
      }
    }
    setIsPlayingAudio((prev) => !prev);
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  // AI Translation Handler
  const handleTranslateLang = (target: 'HI' | 'EN' | 'BN') => {
    setSelectedLang(target);
    if (translationsCache[target] || !complaint) return;

    const sourceText = complaint.transcription || complaint.description;
    if (!sourceText) return;

    setTranslating(true);
    const langKey = target === 'HI' ? 'HINDI' : target === 'BN' ? 'BENGALI' : 'ENGLISH';
    api.complaints
      .translate(sourceText, langKey)
      .then((res) => {
        setTranslationsCache((prev) => ({ ...prev, [target]: res.translatedText }));
      })
      .catch(() => {})
      .finally(() => setTranslating(false));
  };

  // Web Speech API Voice Recording for Note Composer
  const toggleVoiceRecording = () => {
    if (isListeningVoice) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListeningVoice(false);
      return;
    }

    const windowSpeech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!windowSpeech) {
      setActionError('Browser does not support Speech Recognition.');
      return;
    }

    try {
      const recognition = new windowSpeech();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = selectedLang === 'HI' ? 'hi-IN' : 'en-US';

      recognition.onstart = () => setIsListeningVoice(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setNoteContent((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      recognition.onerror = () => setIsListeningVoice(false);
      recognition.onend = () => setIsListeningVoice(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListeningVoice(false);
    }
  };

  // Status Transitions
  const handleUpdateStatus = (newStatus: ComplaintStatus) => {
    if (!complaint) return;
    setActionError(null);
    setUpdatingStatus(true);
    api.complaints
      .updateStatus(complaint.id, { status: newStatus })
      .then(() => reload())
      .catch((err) => setActionError(err instanceof Error ? err.message : 'Failed to update status'))
      .finally(() => setUpdatingStatus(false));
  };

  // Escalate Action
  const handleEscalate = () => {
    if (!complaint) return;
    setActionError(null);
    setUpdatingStatus(true);
    api.complaints
      .updateStatus(complaint.id, {
        status: complaint.status === 'NEW' ? 'IN_PROGRESS' : complaint.status,
        note: '🚨 ESCALATED to Regional Head & Priority Response Dispatch.',
      })
      .then(() => reload())
      .catch((err) => setActionError(err instanceof Error ? err.message : 'Failed to escalate incident'))
      .finally(() => setUpdatingStatus(false));
  };

  // Post Note Action
  const handlePostNote = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!complaint || !noteContent.trim()) return;
    setPostingNote(true);
    api.complaints
      .updateStatus(complaint.id, { status: complaint.status, note: noteContent.trim() })
      .then(() => {
        setNoteContent('');
        reload();
      })
      .catch((err) => setActionError(err instanceof Error ? err.message : 'Failed to post note'))
      .finally(() => setPostingNote(false));
  };

  // Reassign Tech
  const handleAssignTech = () => {
    if (!complaint || !selectedAssignee) return;
    setAssigning(true);
    api.complaints
      .assign(complaint.id, selectedAssignee)
      .then(() => {
        setShowReassignModal(false);
        reload();
      })
      .catch((err) => setActionError(err instanceof Error ? err.message : 'Failed to assign'))
      .finally(() => setAssigning(false));
  };

  // Generate AI Transcription
  const handleTranscribe = () => {
    if (!complaint) return;
    setTranscribing(true);
    api.complaints
      .transcribe(complaint.id)
      .then(() => reload())
      .catch((err) => setActionError(err instanceof Error ? err.message : 'Transcription failed'))
      .finally(() => setTranscribing(false));
  };

  if (detailRes.error) {
    return (
      <div className="fleetops-view">
        <ErrorBanner error={detailRes.error} />
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="fleetops-view">
        <div style={{ padding: 40, textAlign: 'center', color: '#8c909f' }}>
          <span className="material-symbols-outlined fo-spin-slow" style={{ fontSize: 32, color: '#38bdf8' }}>
            sync
          </span>
          <p style={{ marginTop: 12, fontFamily: 'Outfit', fontSize: 16 }}>Loading Investigation Room Telemetry…</p>
        </div>
      </div>
    );
  }

  // Pure dynamic values from real database object
  const vehiclePlate = complaint.vehiclePlateNumber || complaint.vehicle?.plateNumber || 'Unassigned Vehicle';
  const driverName = complaint.driverName || (complaint.driver ? `${complaint.driver.firstName} ${complaint.driver.lastName}`.trim() : 'Unassigned Driver');
  const driverPhone = complaint.driverPhone || '';
  const driverEmpId = complaint.driverEmployeeId || complaint.driver?.employeeId || complaint.driverId || '—';
  const assignedTechName = complaint.assignedToName || (complaint.assignedTo ? `${complaint.assignedTo.firstName} ${complaint.assignedTo.lastName}`.trim() : 'Unassigned');

  // Active transcript text based on selected language
  const displayedTranscript =
    translationsCache[selectedLang] ||
    complaint.transcription ||
    (voiceNoteAttachment?.transcription) ||
    complaint.description ||
    'No description or transcription logged for this incident.';

  return (
    <div className="fleetops-view">
      <div className="fo-inv-container">
        {actionError && <ErrorBanner error={actionError} />}

        {/* ==========================================================================
            1. TOP CONTEXT & INVESTIGATION HEADER
            ========================================================================== */}
        <section className="fo-inv-header">
          <div className="fo-inv-top-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div className="fo-inv-breadcrumbs">
                <Link to="/complaints" style={{ color: '#8c909f', textDecoration: 'none' }}>
                  Complaints Queue
                </Link>
                <span>/</span>
                <span style={{ color: '#4cd7f6', fontWeight: 800 }}>ROOM #{complaint.complaintNo}</span>
                <span>/</span>
                <span style={{ color: '#ffffff' }}>Forensic Investigation</span>
              </div>

              <div className="fo-inv-title-wrap">
                <h1 className="fo-inv-title">
                  {vehiclePlate}: {complaint.title}
                </h1>
                <span className="fo-inv-badge-urgent">
                  <span className="fo-ping-dot" style={{ background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                  {complaint.priority} Priority
                </span>
                <span className="fo-inv-badge-cat">Category: {complaint.category || 'General'}</span>
                <span className="fo-inv-timestamp">
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#8c909f' }}>
                    schedule
                  </span>
                  Created: {formatDateTime(complaint.createdAt)} ({formatRelativeTime(complaint.createdAt)})
                </span>
              </div>
            </div>

            {/* Circular SLA Escalation Pill */}
            <div className="fo-inv-sla-pill">
              <div style={{ position: 'relative', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg style={{ width: 34, height: 34, transform: 'rotate(-90deg)' }}>
                  <circle cx="17" cy="17" r="13" fill="transparent" stroke="#26364a" strokeWidth="3" />
                  <circle
                    cx="17"
                    cy="17"
                    r="13"
                    fill="transparent"
                    stroke={isSlaBreached ? '#ef4444' : '#93ccff'}
                    strokeWidth="3"
                    strokeDasharray="81.6"
                    strokeDashoffset={81.6 * (1 - slaFraction)}
                  />
                </svg>
                <span
                  className="material-symbols-outlined"
                  style={{
                    position: 'absolute',
                    fontSize: 14,
                    color: isSlaBreached ? '#ef4444' : '#93ccff',
                  }}
                >
                  timer
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 9, fontWeight: 700, color: '#8c909f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {isSlaBreached ? 'SLA Breached By' : 'SLA Target'}
                </span>
                <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 14, fontWeight: 800, color: isSlaBreached ? '#ffb4ab' : '#93ccff' }}>
                  {isSlaBreached ? `${Math.abs(Math.floor((elapsedMs - slaTargetMs) / 60000))}m overdue` : `${remainingMinutes}m left`}
                </span>
              </div>
            </div>
          </div>

          {/* Workflow Action Bar */}
          <div className="fo-inv-workflow-bar">
            <div className="fo-inv-action-group">
              <button
                type="button"
                className={`fo-btn-workflow ${complaint.status === 'IN_PROGRESS' ? 'in-progress' : 'secondary'}`}
                onClick={() => handleUpdateStatus('IN_PROGRESS')}
                disabled={updatingStatus || complaint.status === 'IN_PROGRESS'}
              >
                <span className="fo-ping-dot" style={{ background: '#ffffff', boxShadow: '0 0 6px #ffffff' }} />
                <span>{complaint.status.replace('_', ' ')}</span>
              </button>

              <button
                type="button"
                className="fo-btn-workflow danger"
                onClick={handleEscalate}
                disabled={updatingStatus}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  report
                </span>
                <span>Escalate to Regional Head</span>
              </button>

              <button
                type="button"
                className="fo-btn-workflow secondary"
                onClick={() => setShowReassignModal(true)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  swap_horiz
                </span>
                <span>Transfer Hub / Reassign</span>
              </button>
            </div>

            <div className="fo-inv-action-group">
              {complaint.status !== 'RESOLVED' && complaint.status !== 'CLOSED' ? (
                <button
                  type="button"
                  className="fo-btn-workflow resolve"
                  onClick={() => handleUpdateStatus('RESOLVED')}
                  disabled={updatingStatus}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    check_circle
                  </span>
                  <span>Resolve Complaint</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="fo-btn-workflow secondary"
                  onClick={() => handleUpdateStatus('IN_PROGRESS')}
                  disabled={updatingStatus}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    replay
                  </span>
                  <span>Reopen Case</span>
                </button>
              )}

              <button
                type="button"
                className="fo-btn-workflow secondary"
                style={{ padding: '0 8px' }}
                title="Refresh Case Telemetry"
                onClick={() => reload()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  sync
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* ==========================================================================
            2. INCIDENT PHASE TRACKER (STITCH STAGE FLOW COMPONENT)
            ========================================================================== */}
        <section className="fo-inv-card" style={{ marginBottom: 16 }}>
          <div className="fo-inv-card-head" style={{ marginBottom: 12 }}>
            <div className="fo-inv-card-title-group">
              <div className="fo-inv-card-icon" style={{ color: '#ef4444' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  error
                </span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 className="fo-inv-card-title" style={{ fontSize: 14 }}>INCIDENT PHASE TRACKER</h3>
                  <span
                    style={{
                      fontFamily: 'var(--fo-font-mono)',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#ffb4ab',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span className="fo-ping-dot" style={{ background: '#ef4444' }} />
                    Complaint Origin: {activeOriginPhase === 'YARD_IDLE' ? 'PARKING / SAFE YARD' : activeOriginPhase.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="fo-inv-card-subtitle" style={{ fontSize: 11, color: '#8c909f' }}>
                  Identifies the exact operational trip phase at which the driver reported the breakdown
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {photoAttachments.length > 0 && (
                <button
                  type="button"
                  className="fo-btn-workflow secondary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => photoAttachments[0]?.url && setActivePhoto(photoAttachments[0].url)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                    collections
                  </span>
                  <span>View All Phase Photos ({photoAttachments.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* 4 Phase Stage Grid */}
          <div className="fo-phase-tracker-grid">
            {/* PHASE 1: AT_LOADING_PLANT */}
            <div className={`fo-phase-box ${activeOriginPhase === 'AT_LOADING_PLANT' ? 'active-origin' : ''}`}>
              <div className="fo-phase-head">
                <span className={`fo-phase-badge ${activeOriginPhase === 'AT_LOADING_PLANT' ? 'alert' : 'success'}`}>
                  {activeOriginPhase === 'AT_LOADING_PLANT' ? '● COMPLAINT RAISED HERE' : '✓ PHASE 1: PRE-INCIDENT'}
                </span>
                <span className="fo-phase-time">{formatDateTime(complaint.createdAt)}</span>
              </div>
              <div className="fo-phase-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: activeOriginPhase === 'AT_LOADING_PLANT' ? '#ef4444' : '#6ee7b7' }}>
                    factory
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#ffffff' }}>At Loading Plant</span>
                    <span style={{ fontSize: 10, color: activeOriginPhase === 'AT_LOADING_PLANT' ? '#ffb4ab' : '#8c909f' }}>
                      {activeOriginPhase === 'AT_LOADING_PLANT' ? `SOS: ${complaint.category || 'Loading'}` : 'Completed Prior to Incident'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="fo-phase-foot">
                <span style={{ fontSize: 10, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                  {complaint.vehiclePlateNumber || 'Loading Inspection'}
                </span>
              </div>
            </div>

            {/* PHASE 2: IN_TRANSIT */}
            <div className={`fo-phase-box ${activeOriginPhase === 'IN_TRANSIT' ? 'active-origin' : ''}`}>
              <div className="fo-phase-head">
                <span className={`fo-phase-badge ${activeOriginPhase === 'IN_TRANSIT' ? 'alert' : 'muted'}`}>
                  {activeOriginPhase === 'IN_TRANSIT' ? '● COMPLAINT RAISED HERE' : 'PHASE 2: IN TRANSIT'}
                </span>
                <span className="fo-phase-time">{formatDateTime(complaint.createdAt)}</span>
              </div>
              <div className="fo-phase-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: activeOriginPhase === 'IN_TRANSIT' ? '#ef4444' : '#1b2b3f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {activeOriginPhase === 'IN_TRANSIT' ? 'emergency' : 'directions_bus'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>
                      Phase 2: In Transit
                    </span>
                    <span style={{ fontSize: 10, color: activeOriginPhase === 'IN_TRANSIT' ? '#ffb4ab' : '#8c909f' }}>
                      {activeOriginPhase === 'IN_TRANSIT' ? `Driver SOS: ${complaint.category || 'Breakdown'}` : 'Highway Movement'}
                    </span>
                    {complaint.tripLocationName ? (
                      <span style={{ fontSize: 10, color: '#8c909f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                        {complaint.tripLocationName}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="fo-phase-foot">
                <span style={{ fontSize: 10, color: activeOriginPhase === 'IN_TRANSIT' ? '#ffb4ab' : '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                  {photoAttachments.length} Evidence Photo(s) Attached
                </span>
              </div>
            </div>

            {/* PHASE 3: AT_UNLOADING_POINT */}
            <div className={`fo-phase-box ${activeOriginPhase === 'AT_UNLOADING_POINT' ? 'active-origin' : ''}`}>
              <div className="fo-phase-head">
                <span className={`fo-phase-badge ${activeOriginPhase === 'AT_UNLOADING_POINT' ? 'alert' : 'muted'}`}>
                  {activeOriginPhase === 'AT_UNLOADING_POINT' ? '● COMPLAINT RAISED HERE' : 'PHASE 3: IMPACTED'}
                </span>
                <span className="fo-phase-time">{activeOriginPhase === 'AT_UNLOADING_POINT' ? formatDateTime(complaint.createdAt) : 'Target SLA'}</span>
              </div>
              <div className="fo-phase-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: activeOriginPhase === 'AT_UNLOADING_POINT' ? '#ef4444' : '#8c909f' }}>
                    inventory_2
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#ffffff' }}>At Unloading Point</span>
                    <span style={{ fontSize: 10, color: activeOriginPhase === 'AT_UNLOADING_POINT' ? '#ffb4ab' : '#8c909f' }}>
                      {activeOriginPhase === 'AT_UNLOADING_POINT' ? `Driver SOS: ${complaint.category || 'Unloading'}` : 'Interrupted by Incident'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="fo-phase-foot">
                <span style={{ fontSize: 10, color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                  {complaint.loadingStatus ? `Status: ${complaint.loadingStatus}` : 'POD Delivery Pending'}
                </span>
              </div>
            </div>

            {/* PHASE 4: YARD_IDLE (PARKING / SAFE YARD) */}
            <div className={`fo-phase-box ${activeOriginPhase === 'YARD_IDLE' ? 'active-origin' : ''}`}>
              <div className="fo-phase-head">
                <span className={`fo-phase-badge ${activeOriginPhase === 'YARD_IDLE' ? 'alert' : 'muted'}`}>
                  {activeOriginPhase === 'YARD_IDLE' ? '● COMPLAINT RAISED HERE' : 'CURRENT STOPPAGE'}
                </span>
                <span className="fo-phase-time">{activeOriginPhase === 'YARD_IDLE' ? formatDateTime(complaint.createdAt) : 'Staging Zone'}</span>
              </div>
              <div className="fo-phase-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: activeOriginPhase === 'YARD_IDLE' ? '#ef4444' : '#1b2b3f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                    P
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#ffffff' }}>Parking / Safe Yard</span>
                    <span style={{ fontSize: 10, color: activeOriginPhase === 'YARD_IDLE' ? '#ffb4ab' : '#8c909f' }}>
                      {activeOriginPhase === 'YARD_IDLE' ? `Driver SOS: ${complaint.category || 'Yard'}` : 'Post-Incident Safe Haven'}
                    </span>
                    {complaint.tripLocationName ? (
                      <span style={{ fontSize: 10, color: '#8c909f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                        {complaint.tripLocationName}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="fo-phase-foot">
                <span style={{ fontSize: 10, color: activeOriginPhase === 'YARD_IDLE' ? '#ffb4ab' : '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>
                  Status: {complaint.status}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================================
            3. TWO-COLUMN FORENSIC SPLIT LAYOUT
            ========================================================================== */}
        <div className="fo-inv-grid">
          {/* ==================== LEFT COLUMN (~60%) ==================== */}
          <div className="fo-inv-col">
            {/* 1. Voice Note & AI Speech Forensics */}
            <div className="fo-inv-card">
              <div className="fo-inv-card-head">
                <div className="fo-inv-card-title-group">
                  <div className="fo-inv-card-icon" style={{ color: '#4cd7f6' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      mic
                    </span>
                  </div>
                  <div>
                    <h3 className="fo-inv-card-title">Driver Voice Memo & AI Forensics</h3>
                    <div className="fo-inv-card-subtitle">
                      {voiceNoteAttachment ? `Voice Attachment • ${formatDateTime(voiceNoteAttachment.createdAt)}` : 'Audio / Text Description Log'}
                    </div>
                  </div>
                </div>
                {voiceNoteAttachment && (
                  <span
                    style={{
                      fontFamily: 'var(--fo-font-mono)',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#93ccff',
                      background: '#1b2b3f',
                      padding: '2px 8px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Verified Audio
                  </span>
                )}
              </div>

              <div className="fo-inv-waveform-box">
                {voiceNoteAttachment ? (
                  <>
                    <audio
                      ref={audioRef}
                      src={voiceNoteAttachment.url}
                      onTimeUpdate={() => setAudioCurrentTime(audioRef.current?.currentTime || 0)}
                      onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || voiceNoteAttachment.durationSec || 0)}
                      onEnded={() => setIsPlayingAudio(false)}
                      style={{ display: 'none' }}
                    />

                    <div className="fo-inv-wave-player-row">
                      <button
                        type="button"
                        className="fo-inv-play-btn"
                        onClick={togglePlayAudio}
                        title={isPlayingAudio ? 'Pause' : 'Play'}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                          {isPlayingAudio ? 'pause' : 'play_arrow'}
                        </span>
                      </button>

                      <div className="fo-inv-wave-bars">
                        {[12, 20, 28, 16, 32, 24, 36, 20, 28, 16, 24, 32, 20, 12, 28, 36, 16, 24, 32, 14, 20, 28, 16, 24, 10, 20].map(
                          (h, i) => {
                            const isPlayed = audioDuration > 0 ? i / 26 <= audioCurrentTime / audioDuration : false;
                            return (
                              <div
                                key={i}
                                className={`fo-inv-bar ${isPlayed ? '' : 'unplayed'}`}
                                style={{ height: `${h}px` }}
                              />
                            );
                          },
                        )}
                      </div>

                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, color: '#93ccff', minWidth: 70 }}>
                        {Math.floor(audioCurrentTime / 60)}:{Math.floor(audioCurrentTime % 60).toString().padStart(2, '0')} /{' '}
                        {Math.floor(audioDuration / 60)}:{Math.floor(audioDuration % 60).toString().padStart(2, '0')}
                      </span>

                      <div className="fo-inv-speed-group">
                        {[1.0, 1.25, 1.5].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            className={`fo-inv-speed-btn ${playbackRate === rate ? 'active' : ''}`}
                            onClick={() => changePlaybackRate(rate)}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {/* AI Transcription Container */}
                <div className="fo-inv-transcription-box">
                  <div className="fo-inv-transcript-head">
                    <div className="fo-inv-transcript-badge">
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                        smart_toy
                      </span>
                      <span>AI SPEECH FORENSICS</span>
                    </div>

                    <div className="fo-inv-lang-tabs">
                      <button
                        type="button"
                        className={`fo-inv-lang-tab ${selectedLang === 'HI' ? 'active' : ''}`}
                        onClick={() => handleTranslateLang('HI')}
                      >
                        हिंदी (Original)
                      </button>
                      <button
                        type="button"
                        className={`fo-inv-lang-tab ${selectedLang === 'EN' ? 'active' : ''}`}
                        onClick={() => handleTranslateLang('EN')}
                      >
                        English Translation
                      </button>
                      <button
                        type="button"
                        className={`fo-inv-lang-tab ${selectedLang === 'BN' ? 'active' : ''}`}
                        onClick={() => handleTranslateLang('BN')}
                      >
                        বাংলা
                      </button>
                    </div>
                  </div>

                  <div className="fo-inv-transcript-text">
                    {translating ? (
                      <span style={{ color: '#8c909f' }}>Translating neural speech model…</span>
                    ) : (
                      displayedTranscript
                    )}
                  </div>

                  {!complaint.transcription && voiceNoteAttachment && (
                    <button
                      type="button"
                      className="fo-btn-workflow secondary"
                      style={{ alignSelf: 'flex-start', marginTop: 4 }}
                      onClick={handleTranscribe}
                      disabled={transcribing}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        transcribe
                      </span>
                      <span>{transcribing ? 'Transcribing…' : 'Generate Full AI Transcription'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Field Photographic Dossier */}
            <div className="fo-inv-card">
              <div className="fo-inv-card-head">
                <div className="fo-inv-card-title-group">
                  <div className="fo-inv-card-icon" style={{ color: '#3b82f6' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      photo_camera
                    </span>
                  </div>
                  <div>
                    <h3 className="fo-inv-card-title">Field Photographic Dossier</h3>
                    <div className="fo-inv-card-subtitle">
                      {photoAttachments.length} {photoAttachments.length === 1 ? 'image attached' : 'images attached'}
                    </div>
                  </div>
                </div>
              </div>

              {photoAttachments.length > 0 ? (
                <div className="fo-inv-photo-grid">
                  {photoAttachments.map((photo, idx) => (
                    <div
                      key={photo.id || idx}
                      className="fo-inv-photo-card"
                      onClick={() => setActivePhoto(photo.url)}
                      title="Click to expand full resolution photo"
                    >
                      <img src={photo.url} alt={photo.originalName || `Photo #${idx + 1}`} />
                      <div className="fo-inv-photo-overlay">
                        <span className="fo-inv-photo-tag">{photo.format?.toUpperCase() || 'PHOTO'}</span>
                        <div className="fo-inv-photo-bottom">
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 9, color: '#8c909f' }}>
                              {formatDateTime(photo.createdAt)}
                            </span>
                            <span style={{ fontFamily: 'var(--fo-font-head)', fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
                              {photo.originalName || `Photo #${idx + 1}`}
                            </span>
                          </div>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#adc6ff' }}>
                            zoom_in
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#8c909f', background: '#0b1c30', borderRadius: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#424754', display: 'block', marginBottom: 6 }}>
                    no_photography
                  </span>
                  <span style={{ fontSize: 12 }}>No field photos attached to this ticket.</span>
                </div>
              )}
            </div>

            {/* 3. Fleet Asset & Pilot Telemetry */}
            <div className="fo-inv-card">
              <div className="fo-inv-card-head">
                <div className="fo-inv-card-title-group">
                  <div className="fo-inv-card-icon" style={{ color: '#93ccff' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      local_shipping
                    </span>
                  </div>
                  <h3 className="fo-inv-card-title">Fleet Asset & Pilot Telemetry</h3>
                </div>
                <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: '#4cd7f6' }}>
                  Unit Context
                </span>
              </div>

              <div className="fo-inv-telemetry-grid">
                {/* Driver Subcard */}
                <div className="fo-inv-telemetry-box">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontFamily: 'Outfit',
                        fontSize: 16,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {driverName.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {driverName}
                        </span>
                        <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 9, background: '#1b2b3f', color: '#93ccff', padding: '1px 4px', borderRadius: 3 }}>
                          #{driverEmpId}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, color: '#4cd7f6', marginTop: 4 }}>
                        {driverPhone || 'No contact phone'}
                      </span>
                    </div>
                  </div>

                  {driverPhone ? (
                    <div style={{ display: 'flex', gap: 6, paddingTop: 6, borderTop: '1px solid rgba(66, 71, 84, 0.4)' }}>
                      <a
                        href={`tel:${driverPhone}`}
                        className="fo-btn-workflow secondary"
                        style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#4cd7f6' }}>
                          call
                        </span>
                        <span>Direct Call</span>
                      </a>
                      <a
                        href={`https://wa.me/${driverPhone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="fo-btn-workflow secondary"
                        style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', color: '#93ccff' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                          chat
                        </span>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  ) : null}
                </div>

                {/* Vehicle & Trip Subcard */}
                <div className="fo-inv-telemetry-box">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 14, fontWeight: 800, color: '#adc6ff' }}>
                        {vehiclePlate}
                      </span>
                      <span style={{ fontSize: 11, color: '#8c909f', fontWeight: 600 }}>
                        {complaint.vehicle ? [complaint.vehicle.make, complaint.vehicle.model].filter(Boolean).join(' ') || complaint.vehicleModel || 'Vehicle Unit' : (complaint.vehicleModel || 'Unassigned')}
                      </span>
                    </div>

                    {/* Vehicle Specifications: Chassis No (VIN), Wheel, Status of Agreements */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#102034', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(66, 71, 84, 0.4)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>Chassis No (VIN):</span>
                        <span style={{ color: '#93ccff', fontFamily: 'var(--fo-font-mono)', fontWeight: 700 }}>
                          {complaint.vehicle?.chassisNumber || complaint.vehicle?.vin || 'N/A'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>Wheel Specification:</span>
                        <span style={{ color: '#ffffff', fontWeight: 600 }}>
                          {complaint.vehicle?.wheels ? (complaint.vehicle.wheels.includes('Wheel') ? complaint.vehicle.wheels : `${complaint.vehicle.wheels} Wheels`) : 'N/A'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#8c909f', fontFamily: 'var(--fo-font-mono)' }}>Status of Agreements:</span>
                        <span
                          style={{
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontFamily: 'var(--fo-font-mono)',
                            background: complaint.vehicle?.agreementStatus === 'EXPIRED' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: complaint.vehicle?.agreementStatus === 'EXPIRED' ? '#ffb4ab' : '#6ee7b7',
                          }}
                        >
                          {complaint.vehicle?.agreementStatus || 'ACTIVE'}
                        </span>
                      </div>
                    </div>

                    <div style={{ background: '#102034', padding: '6px 8px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 9, color: '#8c909f', textTransform: 'uppercase' }}>
                        Trip Context
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#ffffff' }}>
                        <span>{complaint.tripPhase ? complaint.tripPhase.replace(/_/g, ' ') : 'In-Transit'}</span>
                        {complaint.loadingStatus ? (
                          <span style={{ fontSize: 10, color: '#4cd7f6' }}>({complaint.loadingStatus})</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {complaint.tripLocationName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#93ccff', background: '#102034', padding: '4px 8px', borderRadius: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#4cd7f6' }}>
                        pin_drop
                      </span>
                      <span className="truncate">{complaint.tripLocationName}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Geolocation Stoppage Location Trace */}
              {complaint.tripLocationName ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#8c909f' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#4cd7f6' }}>
                        location_on
                      </span>
                      Reported Incident Location
                    </span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(complaint.tripLocationName)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: 'var(--fo-font-mono)', color: '#4cd7f6', fontSize: 11, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}
                    >
                      <span>Open Google Maps</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                        open_in_new
                      </span>
                    </a>
                  </div>

                  <div style={{ background: '#0b1c30', border: '1px solid rgba(66, 71, 84, 0.4)', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444' }}>
                      location_on
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
                        {complaint.tripLocationName}
                      </span>
                      <span style={{ fontSize: 10, color: '#8c909f' }}>
                        Filed by {driverName} • {formatDateTime(complaint.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* ==================== RIGHT COLUMN (~40%) ==================== */}
          <div className="fo-inv-col">
            {/* 1. Assignment Control Card */}
            <div className="fo-inv-card">
              <div className="fo-inv-card-head">
                <div className="fo-inv-card-title-group">
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#93ccff' }}>
                    assignment_ind
                  </span>
                  <h3 className="fo-inv-card-title">Assignment Control</h3>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--fo-font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: complaint.assignedToId ? 'rgba(0, 158, 185, 0.25)' : 'rgba(239, 68, 68, 0.2)',
                    color: complaint.assignedToId ? '#4cd7f6' : '#ffb4ab',
                    border: `1px solid ${complaint.assignedToId ? 'rgba(76, 215, 246, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                  }}
                >
                  {complaint.assignedToId ? 'Assigned' : 'Unassigned'}
                </span>
              </div>

              {/* Active Dispatch Unit */}
              <div style={{ background: '#0b1c30', border: '1px solid rgba(66, 71, 84, 0.4)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: '#8c909f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Assigned Administrator / Tech
                  </span>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    onClick={() => setShowReassignModal(true)}
                  >
                    Reassign
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #0284c7 0%, #009eb9 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      {assignedTechName.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#ffffff' }}>{assignedTechName}</span>
                      {complaint.assignedTo?.employeeId ? (
                        <span style={{ fontSize: 10, color: '#8c909f' }}>ID: #{complaint.assignedTo.employeeId}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic SLA Gauge Bar */}
              <div style={{ background: '#0b1c30', border: '1px solid rgba(66, 71, 84, 0.4)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: '#8c909f', textTransform: 'uppercase' }}>
                    Category SLA ({complaint.category || 'General'}: {slaTargetHours}h)
                  </span>
                  <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, fontWeight: 700, color: isSlaBreached ? '#ef4444' : '#93ccff' }}>
                    {isSlaBreached ? 'Breached' : `On Schedule (${Math.round(slaFraction * 100)}%)`}
                  </span>
                </div>

                <div style={{ width: '100%', height: 6, background: '#102034', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 3,
                      background: isSlaBreached ? '#ef4444' : '#93ccff',
                      width: `${Math.round(slaFraction * 100)}%`,
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#8c909f' }}>
                  <span>Elapsed: {elapsedMinutes} mins</span>
                  <span style={{ color: '#d3e4fe' }}>Target Resolution: {formatDateTime(deadlineIso)}</span>
                </div>
              </div>
            </div>

            {/* 2. Forensic Audit Timeline */}
            <div className="fo-inv-card">
              <div className="fo-inv-card-head">
                <div className="fo-inv-card-title-group">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#4cd7f6' }}>
                    history
                  </span>
                  <h3 className="fo-inv-card-title">Forensic Audit Timeline</h3>
                </div>
                <span style={{ fontSize: 11, color: '#8c909f' }}>
                  {(complaint.updates?.length || 0) + 1} Events Logged
                </span>
              </div>

              <div className="fo-inv-timeline">
                {/* 1. Ticket Creation Event */}
                <div className="fo-inv-timeline-item">
                  <div className="fo-inv-timeline-dot cyan" />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, fontWeight: 700, color: '#4cd7f6' }}>
                      {formatDateTime(complaint.createdAt)} • TICKET CREATED
                    </span>
                    <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: '#8c909f' }}>
                      {formatRelativeTime(complaint.createdAt)}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#d3e4fe', background: '#0b1c30', padding: 8, borderRadius: 6 }}>
                    Ticket #{complaint.complaintNo} submitted by <strong style={{ color: '#93ccff' }}>{driverName}</strong> ({complaint.category || 'General'}).
                  </p>
                </div>

                {/* 2. Database Complaint Updates */}
                {complaint.updates?.map((u, i) => (
                  <div key={u.id || i} className="fo-inv-timeline-item">
                    <div className="fo-inv-timeline-dot cyan" />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, fontWeight: 700, color: '#93ccff' }}>
                        {formatDateTime(u.createdAt)} {u.toStatus ? `• STATUS: ${u.toStatus}` : ''}
                      </span>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: '#8c909f' }}>
                        {formatRelativeTime(u.createdAt)}
                      </span>
                    </div>
                    {u.note && (
                      <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#d3e4fe', background: '#0b1c30', padding: 8, borderRadius: 6 }}>
                        <strong style={{ color: '#ffffff' }}>{u.author ? `${u.author.firstName} ${u.author.lastName}` : 'Admin'}:</strong> “{u.note}”
                      </p>
                    )}
                  </div>
                ))}

                {/* 3. Resolution Event if resolved */}
                {complaint.resolvedAt ? (
                  <div className="fo-inv-timeline-item">
                    <div className="fo-inv-timeline-dot" style={{ background: '#10b981', borderColor: '#10b981' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, fontWeight: 700, color: '#6ee7b7' }}>
                        {formatDateTime(complaint.resolvedAt)} • RESOLVED
                      </span>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: '#8c909f' }}>
                        {formatRelativeTime(complaint.resolvedAt)}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#6ee7b7', background: 'rgba(16, 185, 129, 0.15)', padding: 8, borderRadius: 6 }}>
                      Complaint marked resolved.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* 3. Internal Team Note Composer */}
              <form className="fo-inv-composer" onSubmit={handlePostNote}>
                <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, fontWeight: 700, color: '#8c909f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Add Operational Note
                </span>

                <div style={{ position: 'relative' }}>
                  <textarea
                    className="fo-inv-textarea"
                    placeholder="Type internal dispatch note or operational update..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={3}
                  />

                  {/* Voice dictation mic button */}
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    title={isListeningVoice ? 'Stop voice dictation' : 'Click to dictate note'}
                    style={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      background: isListeningVoice ? '#ef4444' : '#1b2b3f',
                      border: '1px solid rgba(66, 71, 84, 0.5)',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {isListeningVoice ? 'mic_off' : 'mic'}
                    </span>
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4 }}>
                  <button
                    type="submit"
                    className="fo-btn-workflow resolve"
                    style={{ height: 28, padding: '0 14px' }}
                    disabled={postingNote || !noteContent.trim()}
                  >
                    {postingNote ? 'Posting…' : 'Post Note'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ==========================================================================
            3. FULL-RESOLUTION DOSSIER LIGHTBOX MODAL
            ========================================================================== */}
        {activePhoto && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 15, 33, 0.95)',
              backdropFilter: 'blur(8px)',
              zIndex: 99999,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
            onClick={() => setActivePhoto(null)}
          >
            <div
              style={{ position: 'relative', maxWidth: '90vw', maxHeight: '85vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={activePhoto}
                alt="Enlarged forensic evidentiary photo"
                style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8, border: '1px solid rgba(140, 144, 159, 0.3)' }}
              />
              <button
                type="button"
                onClick={() => setActivePhoto(null)}
                style={{
                  position: 'absolute',
                  top: -16,
                  right: -16,
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ==========================================================================
            4. REASSIGN MODAL
            ========================================================================== */}
        {showReassignModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 15, 33, 0.8)',
              backdropFilter: 'blur(4px)',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setShowReassignModal(false)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 440,
                background: '#102034',
                border: '1px solid rgba(66, 71, 84, 0.6)',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 18, color: '#ffffff' }}>
                  Reassign Field Technician
                </h3>
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  style={{ background: 'none', border: 'none', color: '#8c909f', cursor: 'pointer' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    close
                  </span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, color: '#8c909f' }}>
                  SELECT OPS DISPATCHER / FIELD TECH
                </label>
                <select
                  style={{
                    background: '#0b1c30',
                    border: '1px solid rgba(66, 71, 84, 0.5)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontFamily: 'Inter',
                    fontSize: 13,
                  }}
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                >
                  <option value="">-- Choose Operator --</option>
                  {adminsRes.data?.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.firstName} {admin.lastName} ({admin.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="fo-btn-workflow secondary"
                  onClick={() => setShowReassignModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="fo-btn-workflow resolve"
                  onClick={handleAssignTech}
                  disabled={assigning || !selectedAssignee}
                >
                  {assigning ? 'Assigning…' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
