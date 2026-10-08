import { useState, useEffect, useRef, useMemo, type ReactElement, type ChangeEvent } from 'react';
import {
  Search,
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  CheckCheck,
  Check,
  Truck,
  Users,
  Headphones,
  X,
  Loader,
  Phone,
  Volume2,
  Link2,
  Plus,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { isSuperAdmin, useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import type {
  SupportConversationSummary,
  SupportMessagePublic,
  ComplaintPublic,
  ComplaintCategory,
  Priority,
} from '@driver-complaint/shared-types';

type RoleFilter = 'ALL' | 'DRIVER' | 'ADMIN' | 'EXECUTIVE';

export function SupportChatPage(): ReactElement {
  const { user } = useAuth();
  const { subscribeCustom } = useRealtime();

  if (user && !isSuperAdmin(user)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Headphones size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text)' }}>
          Access Restricted
        </h2>
        <p style={{ fontSize: 14, margin: 0 }}>
          The Support Helpline is managed exclusively by SuperAdmin users.
        </p>
      </div>
    );
  }

  const [conversations, setConversations] = useState<SupportConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessagePublic[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

  // Input composer state
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'IMAGE' | 'AUDIO' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sending, setSending] = useState(false);

  // Photo Lightbox modal
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Multi-select state
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const isSelectionMode = selectedMessageIds.length > 0;

  const toggleSelectMessage = (id: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const clearSelection = () => {
    setSelectedMessageIds([]);
  };

  // Link to complaint state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkingMessages, setLinkingMessages] = useState<SupportMessagePublic[]>([]);
  const [driverOpenComplaints, setDriverOpenComplaints] = useState<ComplaintPublic[]>([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState('');
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  // Create Complaint from Chat state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<ComplaintCategory>('BREAKDOWN');
  const [createPriority, setCreatePriority] = useState<Priority>('MEDIUM');
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [isCreatingComplaint, setIsCreatingComplaint] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const openLinkModal = async (msgs: SupportMessagePublic[]) => {
    if (msgs.length === 0) return;
    setLinkingMessages(msgs);
    setSelectedComplaintId('');
    setLinkModalOpen(true);
    setLoadingComplaints(true);

    try {
      const driverList = await api.drivers.list();
      const contactUserId = selectedConversation?.contactUser.id;
      const matchedDriver = driverList.find((d) => d.userId === contactUserId);
      const driverId = matchedDriver?.id || selectedConversation?.vehicle?.driverId;

      const res = await api.complaints.list(
        { ...api.EMPTY_FILTER, driverId: driverId || '' },
        1,
        50,
      );

      const open = (res?.data || []).filter(
        (c) => c.status !== 'RESOLVED' && c.status !== 'CLOSED',
      );
      setDriverOpenComplaints(open);
      const firstComplaint = open[0];
      if (firstComplaint) {
        setSelectedComplaintId(firstComplaint.id);
      }
    } catch (err) {
      console.error('Failed to load driver complaints', err);
      setDriverOpenComplaints([]);
    } finally {
      setLoadingComplaints(false);
    }
  };

  const handleAttachToComplaint = async () => {
    if (linkingMessages.length === 0 || !selectedComplaintId) return;
    setIsLinking(true);
    try {
      const firstMsg = linkingMessages[0];
      if (linkingMessages.length === 1 && firstMsg) {
        const res = await api.support.attachToComplaint(firstMsg.id, selectedComplaintId);
        alert(`✅ Chat message successfully linked to Complaint #${res.complaintNo}`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === firstMsg.id
              ? { ...m, linkedComplaintId: selectedComplaintId, linkedComplaintNo: res.complaintNo }
              : m,
          ),
        );
      } else {
        const res = await api.support.bulkAttachToComplaint(
          linkingMessages.map((m) => m.id),
          selectedComplaintId,
        );
        alert(`✅ ${res.count} chat messages successfully linked to Complaint #${res.complaintNo}`);
        const linkedIdSet = new Set(linkingMessages.map((m) => m.id));
        setMessages((prev) =>
          prev.map((m) =>
            linkedIdSet.has(m.id)
              ? { ...m, linkedComplaintId: selectedComplaintId, linkedComplaintNo: res.complaintNo }
              : m,
          ),
        );
      }
      setLinkModalOpen(false);
      setLinkingMessages([]);
      setSelectedComplaintId('');
      setSelectedMessageIds([]);
    } catch (err: any) {
      alert(err.message || 'Failed to attach message(s) to complaint');
    } finally {
      setIsLinking(false);
    }
  };

  const handleDetachFromComplaint = async (msg: SupportMessagePublic) => {
    if (!confirm(`Are you sure you want to unlink message from Complaint #${msg.linkedComplaintNo}?`)) return;
    try {
      await api.support.detachFromComplaint(msg.id);
      alert(`✅ Message unlinked from Complaint #${msg.linkedComplaintNo}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, linkedComplaintId: null, linkedComplaintNo: null }
            : m,
        ),
      );
    } catch (err: any) {
      alert(err.message || 'Failed to unlink message from complaint');
    }
  };

  // Open Create Complaint Modal with pre-filled fields
  const openCreateModal = () => {
    const selectedMsgs = messages.filter((m) => selectedMessageIds.includes(m.id));
    if (selectedMsgs.length === 0) return;
    const driverUser = selectedConversation?.contactUser;
    const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Driver';

    const firstTextMsg = selectedMsgs.find(
      (m) => m.content && m.content !== 'Photo' && m.content !== 'Voice Message',
    );
    const autoTitle = firstTextMsg
      ? `[Support] ${firstTextMsg.content.slice(0, 60)}`
      : `[Support Ticket] Issue reported by ${driverName}`;

    const compiledDesc = selectedMsgs
      .map((m) => {
        const timeStr = formatMessageTime(m.createdAt);
        const senderLabel = m.senderId === user?.id ? 'Support Desk' : driverName;
        const mediaNote =
          m.type === 'AUDIO'
            ? ' [Voice Note Attached]'
            : m.type === 'IMAGE'
            ? ' [Photo Evidence Attached]'
            : '';
        return `[${timeStr}] ${senderLabel}: ${m.content || mediaNote}`;
      })
      .join('\n');

    setCreateCategory('BREAKDOWN');
    setCreatePriority('MEDIUM');
    setCreateTitle(autoTitle);
    setCreateDescription(compiledDesc);
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const handleCreateComplaintSubmit = async () => {
    if (!selectedConversation) return;
    if (!createTitle.trim()) {
      setCreateError('Please enter a complaint title');
      return;
    }
    if (!createDescription.trim()) {
      setCreateError('Please enter a description');
      return;
    }
    setIsCreatingComplaint(true);
    setCreateError(null);

    try {
      const res = await api.support.createComplaintFromChat({
        driverUserId: selectedConversation.contactUser.id,
        vehicleNumber: selectedConversation.vehicle?.plateNumber,
        vehicleId: selectedConversation.vehicle?.id,
        category: createCategory,
        priority: createPriority,
        title: createTitle.trim(),
        description: createDescription.trim(),
        messageIds: selectedMessageIds,
      });

      alert(
        `✅ Complaint #${res.complaintNo} created successfully with ${selectedMessageIds.length} linked messages!`,
      );

      const linkedIdSet = new Set(selectedMessageIds);
      setMessages((prev) =>
        prev.map((m) =>
          linkedIdSet.has(m.id)
            ? { ...m, linkedComplaintId: res.id, linkedComplaintNo: res.complaintNo }
            : m,
        ),
      );

      setCreateModalOpen(false);
      setSelectedMessageIds([]);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create complaint from chat');
    } finally {
      setIsCreatingComplaint(false);
    }
  };

  const selectedMediaEvidence = useMemo(() => {
    return messages.filter((m) => selectedMessageIds.includes(m.id) && m.attachmentUrl);
  }, [messages, selectedMessageIds]);

  // Load conversations
  const loadConversations = async (keepSelection = true): Promise<void> => {
    try {
      const list = await api.support.getConversations();
      setConversations(list);
      if (!keepSelection && list.length > 0 && !selectedUserId && list[0]) {
        setSelectedUserId(list[0].contactUser.id);
      }
    } catch (err) {
      console.error('Failed to load support conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    void loadConversations(false);
  }, []);

  // Selected conversation summary
  const selectedConversation = useMemo(() => {
    return conversations.find((c) => c.contactUser.id === selectedUserId) ?? null;
  }, [conversations, selectedUserId]);

  // Load messages for selected user
  const loadMessages = async (otherUserId: string): Promise<void> => {
    setLoadingMessages(true);
    try {
      const res = await api.support.getMessages(otherUserId, { limit: 100 });
      setMessages(res.data);
      // Mark read
      await api.support.markRead(otherUserId);
      // Update local unread badge count
      setConversations((prev) =>
        prev.map((c) => (c.contactUser.id === otherUserId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      void loadMessages(selectedUserId);
    } else {
      setMessages([]);
    }
  }, [selectedUserId]);

  // Scroll to bottom on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, filePreview]);

  // Realtime Socket listeners for live chat & read receipts
  useEffect(() => {
    const unsubMsg = subscribeCustom('support:message', (newMsg: SupportMessagePublic) => {
      // 1. Update conversation preview
      setConversations((prev) => {
        const contactId =
          newMsg.senderId === user?.id ? newMsg.receiverId : newMsg.senderId;
        const exists = prev.some((c) => c.contactUser.id === contactId);

        if (!exists) {
          void loadConversations(true);
          return prev;
        }

        return prev
          .map((c) => {
            if (c.contactUser.id === contactId) {
              const isCurrentChat = selectedUserId === contactId;
              return {
                ...c,
                lastMessage: newMsg,
                unreadCount:
                  newMsg.senderId !== user?.id && !isCurrentChat
                    ? c.unreadCount + 1
                    : c.unreadCount,
              };
            }
            return c;
          })
          .sort((a, b) => {
            const tA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const tB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return tB - tA;
          });
      });

      // 2. If message belongs to active chat, append to messages list
      if (
        selectedUserId &&
        (newMsg.senderId === selectedUserId || newMsg.receiverId === selectedUserId)
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        // Mark read if it was received in open chat
        if (newMsg.senderId === selectedUserId) {
          void api.support.markRead(selectedUserId);
        }
      }
    });

    const unsubRead = subscribeCustom(
      'support:read',
      (data: { readerId: string; otherUserId: string; readAt: string }) => {
        // If the other user read our messages in the active chat
        if (selectedUserId && data.readerId === selectedUserId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.senderId === user?.id && !m.isRead
                ? { ...m, isRead: true, readAt: data.readAt }
                : m
            )
          );
        }
      }
    );

    return () => {
      unsubMsg();
      unsubRead();
    };
  }, [selectedUserId, user?.id, subscribeCustom]);

  // Handle file picker selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, type: 'IMAGE' | 'AUDIO') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setFileType(type);

    if (type === 'IMAGE') {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(file.name);
    }
  };

  const clearSelectedFile = () => {
    if (filePreview && fileType === 'IMAGE') {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setFileType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  // Browser Audio Recording with MediaRecorder API
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/m4a' });
        const audioFile = new File([audioBlob], `voice-note-${Date.now()}.m4a`, {
          type: 'audio/m4a',
        });
        setSelectedFile(audioFile);
        setFileType('AUDIO');
        setFilePreview(`Voice Recording (${recordingSeconds}s)`);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied or unsupported:', err);
      alert('Could not access microphone. Please check browser permissions or upload an audio file directly.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      clearSelectedFile();
    }
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    if (!selectedUserId) return;
    if (!textInput.trim() && !selectedFile) return;

    setSending(true);
    try {
      const msgType = fileType ?? 'TEXT';
      const res = await api.support.sendMessage(
        {
          receiverId: selectedUserId,
          content: textInput.trim(),
          type: msgType,
        },
        selectedFile ?? undefined
      );

      // Add to local state if not already received via socket
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.id)) return prev;
        return [...prev, res];
      });

      // Clear composer
      setTextInput('');
      clearSelectedFile();
      void loadConversations(true);
    } catch (err) {
      console.error('Failed to send support message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Filtered contacts list
  const filteredConversations = useMemo(() => {
    return conversations.filter((item) => {
      // Role filter
      if (roleFilter !== 'ALL' && item.contactUser.role !== roleFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = `${item.contactUser.firstName} ${item.contactUser.lastName}`.toLowerCase();
        const empId = item.contactUser.employeeId.toLowerCase();
        const plate = item.vehicle?.plateNumber.toLowerCase() ?? '';
        return name.includes(query) || empId.includes(query) || plate.includes(query);
      }
      return true;
    });
  }, [conversations, roleFilter, searchQuery]);

  const formatMessageTime = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageDate = (iso: string): string => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="support-chat-page-container">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileChange(e, 'IMAGE')}
      />
      <input
        type="file"
        ref={audioInputRef}
        accept="audio/*,.m4a,.mp3,.webm"
        style={{ display: 'none' }}
        onChange={(e) => handleFileChange(e, 'AUDIO')}
      />

      {/* Main WhatsApp-Web Styled Chat Wrapper */}
      <div className="chat-layout-shell">
        {/* ================= LEFT COLUMN: CONTACTS & SEARCH ================= */}
        <aside className="chat-sidebar-panel">
          {/* Header */}
          <div className="chat-sidebar-header">
            <div className="chat-header-title-row">
              <div className="chat-header-icon-wrap">
                <Headphones size={22} color="#ffffff" />
              </div>
              <div>
                <h2 className="chat-header-heading">Support Center</h2>
                <span className="chat-header-subheading">Live WhatsApp-style Helpline</span>
              </div>
            </div>

            {/* Search Box */}
            <div className="chat-search-input-wrap">
              <Search size={16} className="chat-search-icon" />
              <input
                type="text"
                className="chat-search-field"
                placeholder="Search name, emp ID, or vehicle…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="chat-clear-search-btn"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            {/* Role Filter Tabs */}
            <div className="chat-role-filter-row">
              {(['ALL', 'DRIVER', 'ADMIN', 'EXECUTIVE'] as RoleFilter[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`chat-role-pill ${roleFilter === tab ? 'active' : ''}`}
                  onClick={() => setRoleFilter(tab)}
                >
                  {tab === 'ALL'
                    ? 'All'
                    : tab === 'DRIVER'
                    ? 'Drivers'
                    : tab === 'ADMIN'
                    ? 'Admins'
                    : 'Executives'}
                </button>
              ))}
            </div>
          </div>

          {/* Contact List */}
          <div className="chat-contact-list-container">
            {loadingConversations ? (
              <div className="chat-loading-state">
                <Loader size={24} className="icon-spin" />
                <span>Loading conversations…</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="chat-empty-state">
                <Users size={36} color="#94a3b8" />
                <p>No matching contacts found</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedUserId === conv.contactUser.id;
                const lastMsg = conv.lastMessage;
                const contact = conv.contactUser;

                return (
                  <div
                    key={contact.id}
                    className={`chat-contact-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedUserId(contact.id)}
                  >
                    <div className="chat-contact-avatar-wrap">
                      <div className={`chat-avatar-circle ${contact.role.toLowerCase()}`}>
                        {(contact.firstName ? contact.firstName.charAt(0) : 'U').toUpperCase()}
                        {(contact.lastName ? contact.lastName.charAt(0) : '').toUpperCase()}
                      </div>
                      <span className="chat-online-indicator" />
                    </div>

                    <div className="chat-contact-info-col">
                      <div className="chat-contact-name-row">
                        <span className="chat-contact-fullname">
                          {contact.firstName} {contact.lastName}
                        </span>
                        {lastMsg ? (
                          <span className="chat-last-msg-time">
                            {formatMessageTime(lastMsg.createdAt)}
                          </span>
                        ) : null}
                      </div>

                      <div className="chat-contact-meta-row">
                        <span className={`chat-role-tag ${contact.role.toLowerCase()}`}>
                          {contact.role}
                        </span>
                        {conv.vehicle ? (
                          <span className="chat-vehicle-tag">
                            <Truck size={12} />
                            {conv.vehicle.plateNumber}
                          </span>
                        ) : null}
                      </div>

                      <div className="chat-contact-preview-row">
                        <span className="chat-preview-text">
                          {lastMsg ? (
                            <>
                              {lastMsg.senderId === user?.id ? (
                                <span className="chat-outgoing-tick">
                                  {lastMsg.isRead ? (
                                    <CheckCheck size={14} color="#3b82f6" />
                                  ) : (
                                    <Check size={14} color="#94a3b8" />
                                  )}
                                </span>
                              ) : null}
                              {lastMsg.type === 'AUDIO' ? (
                                <span className="preview-media-tag">🎤 Voice Note</span>
                              ) : lastMsg.type === 'IMAGE' ? (
                                <span className="preview-media-tag">📷 Photo</span>
                              ) : (
                                lastMsg.content
                              )}
                            </>
                          ) : (
                            <span className="chat-no-msg-hint">No messages yet</span>
                          )}
                        </span>

                        {conv.unreadCount > 0 ? (
                          <span className="chat-unread-badge">{conv.unreadCount}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ================= RIGHT COLUMN: CHAT WINDOW ================= */}
        <section className="chat-conversation-panel">
          {selectedConversation ? (
            <>
              {/* Active Conversation Top Bar */}
              <div className="chat-convo-header">
                <div className="chat-convo-profile-wrap">
                  <div
                    className={`chat-avatar-circle ${selectedConversation.contactUser.role.toLowerCase()}`}
                  >
                    {(selectedConversation.contactUser.firstName
                      ? selectedConversation.contactUser.firstName.charAt(0)
                      : 'U'
                    ).toUpperCase()}
                    {(selectedConversation.contactUser.lastName
                      ? selectedConversation.contactUser.lastName.charAt(0)
                      : ''
                    ).toUpperCase()}
                  </div>
                  <div className="chat-convo-titles">
                    <div className="chat-convo-name-row">
                      <h3 className="chat-convo-name">
                        {selectedConversation.contactUser.firstName}{' '}
                        {selectedConversation.contactUser.lastName}
                      </h3>
                      <span
                        className={`chat-role-tag ${selectedConversation.contactUser.role.toLowerCase()}`}
                      >
                        {selectedConversation.contactUser.role}
                      </span>
                    </div>

                    <div className="chat-convo-sub-row">
                      <span className="chat-emp-id">
                        ID: {selectedConversation.contactUser.employeeId}
                      </span>
                      {selectedConversation.contactUser.phone ? (
                        <span className="chat-phone">
                          <Phone size={12} />
                          {selectedConversation.contactUser.phone}
                        </span>
                      ) : null}
                      {selectedConversation.vehicle ? (
                        <span className="chat-vehicle-plate">
                          <Truck size={12} />
                          {selectedConversation.vehicle.plateNumber} (
                          {selectedConversation.vehicle.model || 'Fleet Unit'})
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="chat-convo-actions">
                  <div className="chat-live-badge">
                    <span className="live-dot live-on" />
                    <span>Live Channel</span>
                  </div>
                </div>
              </div>

              {/* Chat Message Stream */}
              <div className={`chat-messages-container ${isSelectionMode ? 'selection-mode' : ''}`}>
                {loadingMessages ? (
                  <div className="chat-loading-state">
                    <Loader size={28} className="icon-spin" />
                    <span>Loading conversation history…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-conversation-empty">
                    <div className="chat-empty-icon-circle">
                      <Headphones size={36} color="#059669" />
                    </div>
                    <h4>Direct Support Channel</h4>
                    <p>
                      Start messaging with {selectedConversation.contactUser.firstName}. Send
                      text messages, instant voice recordings, or photo attachments in real time.
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isMe = msg.senderId === user?.id;
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const showDateDivider =
                      !prevMsg ||
                      new Date(prevMsg.createdAt).toDateString() !==
                        new Date(msg.createdAt).toDateString();
                    const isSelected = selectedMessageIds.includes(msg.id);

                    return (
                      <div key={msg.id} className="chat-message-row-wrapper">
                        {showDateDivider ? (
                          <div className="chat-date-divider">
                            <span>{formatMessageDate(msg.createdAt)}</span>
                          </div>
                        ) : null}

                        <div className={`chat-message-row ${isMe ? 'outgoing' : 'incoming'}`}>
                          {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                            <div
                              className={`chat-row-select-checkbox ${isSelected ? 'checked' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectMessage(msg.id);
                              }}
                              title={isSelected ? 'Deselect message' : 'Select message'}
                            >
                              {isSelected && <Check size={12} />}
                            </div>
                          )}

                          <div
                            className={`chat-message-bubble ${isMe ? 'outgoing' : 'incoming'} ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => {
                              if (isSelectionMode) {
                                toggleSelectMessage(msg.id);
                              }
                            }}
                          >
                            {/* Sender name + Link button for received messages */}
                            {!isMe && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginBottom: 2,
                                }}
                              >
                                <span className="chat-sender-label">
                                  {msg.sender?.firstName || 'User'}
                                </span>
                                {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') &&
                                  (msg.linkedComplaintNo ? (
                                    <button
                                      type="button"
                                      className="btn-chat-link-complaint btn-chat-un-link-complaint"
                                      title={`Linked to #${msg.linkedComplaintNo}. Click to unlink.`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDetachFromComplaint(msg);
                                      }}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        color: '#ef4444',
                                        borderColor: 'rgba(239, 68, 68, 0.25)',
                                      }}
                                    >
                                      <Link2 size={11} />
                                      <span>#{msg.linkedComplaintNo} · Unlink</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-chat-link-complaint"
                                      title="Link message to an open complaint"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void openLinkModal([msg]);
                                      }}
                                    >
                                      <Link2 size={11} />
                                      <span>Link</span>
                                    </button>
                                  ))}
                              </div>
                            )}

                            {/* If sender is me and already linked to a complaint */}
                            {isMe && msg.linkedComplaintNo && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  marginBottom: 2,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: 'rgba(255, 255, 255, 0.2)',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    color: '#ffffff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  <Link2 size={9} /> #{msg.linkedComplaintNo}
                                </span>
                              </div>
                            )}

                            {/* 1. PHOTO MESSAGE */}
                            {msg.type === 'IMAGE' && msg.attachmentUrl && (
                              <div
                                className="chat-bubble-image-wrap"
                                onClick={(e) => {
                                  if (!isSelectionMode) {
                                    e.stopPropagation();
                                    setLightboxImage(msg.attachmentUrl);
                                  }
                                }}
                              >
                                <img
                                  src={msg.attachmentUrl}
                                  alt="Support Attachment"
                                  className="chat-bubble-img"
                                />
                              </div>
                            )}

                            {/* 2. AUDIO VOICE NOTE MESSAGE */}
                            {msg.type === 'AUDIO' && msg.attachmentUrl && (
                              <div className="chat-bubble-audio-wrap">
                                <div className="chat-audio-header">
                                  <Volume2 size={16} color="#0284c7" />
                                  <span>Voice Note</span>
                                  {msg.attachmentDurationSec ? (
                                    <span className="chat-audio-duration">
                                      {msg.attachmentDurationSec}s
                                    </span>
                                  ) : null}
                                </div>
                                <audio
                                  controls
                                  src={msg.attachmentUrl}
                                  className="chat-native-audio-player"
                                />
                              </div>
                            )}

                            {/* 3. TEXT CONTENT */}
                            {msg.content &&
                            msg.content !== 'Photo' &&
                            msg.content !== 'Voice Message' ? (
                              <p className="chat-bubble-text">{msg.content}</p>
                            ) : null}

                            {/* Footer Meta (Timestamp + Double blue tick read receipt) */}
                            <div className="chat-bubble-meta">
                              <span className="chat-bubble-timestamp">
                                {formatMessageTime(msg.createdAt)}
                              </span>
                              {isMe ? (
                                <span className="chat-bubble-status">
                                  {msg.isRead ? (
                                    <CheckCheck
                                      size={15}
                                      color="#38bdf8"
                                      className="read-tick"
                                      style={{ display: 'inline-block' }}
                                    />
                                  ) : (
                                    <Check
                                      size={15}
                                      color="#94a3b8"
                                      className="sent-tick"
                                      style={{ display: 'inline-block' }}
                                    />
                                  )}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Attachment Preview Banner if selected */}
              {filePreview && (
                <div className="chat-attachment-preview-bar">
                  <div className="preview-file-details">
                    {fileType === 'IMAGE' ? (
                      <img src={filePreview} alt="Preview" className="preview-img-thumbnail" />
                    ) : (
                      <div className="preview-audio-icon">
                        <Mic size={20} color="#0284c7" />
                      </div>
                    )}
                    <div className="preview-text-info">
                      <span className="preview-filename">
                        {fileType === 'IMAGE' ? selectedFile?.name : filePreview}
                      </span>
                      <span className="preview-filesize">
                        {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-cancel-preview"
                    onClick={clearSelectedFile}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Recording Indicator Bar */}
              {isRecording && (
                <div className="chat-recording-banner">
                  <div className="recording-pulsing-circle" />
                  <span className="recording-text">Recording Audio ({recordingSeconds}s)…</span>
                  <div className="recording-actions">
                    <button
                      type="button"
                      className="btn-cancel-rec"
                      onClick={cancelRecording}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-done-rec"
                      onClick={stopRecording}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Message Composer Footer */}
              <form className="chat-composer-footer" onSubmit={handleSendMessage}>
                {/* Photo attachment trigger */}
                <button
                  type="button"
                  className="chat-composer-btn"
                  title="Attach Photo"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isRecording}
                >
                  <ImageIcon size={20} />
                </button>

                {/* Audio file upload trigger */}
                <button
                  type="button"
                  className="chat-composer-btn"
                  title="Upload Audio File"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={sending || isRecording}
                >
                  <Paperclip size={20} />
                </button>

                {/* Microphone Record trigger */}
                <button
                  type="button"
                  className={`chat-composer-btn ${isRecording ? 'recording-active' : ''}`}
                  title={isRecording ? 'Stop Recording' : 'Record Voice Note'}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={sending}
                >
                  <Mic size={20} color={isRecording ? '#ef4444' : 'currentColor'} />
                </button>

                {/* Text input */}
                <input
                  type="text"
                  className="chat-text-input"
                  placeholder={
                    isRecording
                      ? 'Recording voice note…'
                      : filePreview
                      ? 'Add a caption…'
                      : 'Type a message… (Press Enter to send)'
                  }
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  disabled={sending || isRecording}
                />

                {/* Send button */}
                <button
                  type="submit"
                  className="chat-send-btn"
                  title="Send Message"
                  disabled={(!textInput.trim() && !selectedFile) || sending || isRecording}
                >
                  {sending ? (
                    <Loader size={18} className="icon-spin" />
                  ) : (
                    <Send size={18} color="#ffffff" />
                  )}
                </button>
              </form>

              {/* Floating Multi-Action Dock for selected messages */}
              {isSelectionMode && (
                <div className="chat-multi-action-dock">
                  <div className="dock-selection-badge">
                    <span className="dock-count-pill">{selectedMessageIds.length}</span>
                    <span>Selected</span>
                  </div>
                  <button
                    type="button"
                    className="dock-btn dock-btn-link"
                    onClick={() => {
                      const selectedMsgs = messages.filter((m) =>
                        selectedMessageIds.includes(m.id),
                      );
                      void openLinkModal(selectedMsgs);
                    }}
                  >
                    <Link2 size={14} />
                    <span>Link to Complaint</span>
                  </button>
                  <button
                    type="button"
                    className="dock-btn dock-btn-create"
                    onClick={openCreateModal}
                  >
                    <Plus size={14} />
                    <span>Create New Complaint</span>
                  </button>
                  <button
                    type="button"
                    className="dock-btn dock-btn-clear"
                    onClick={clearSelection}
                    title="Clear selection"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="chat-no-selection-screen">
              <div className="chat-no-selection-graphic">
                <Headphones size={64} color="#cbd5e1" />
              </div>
              <h3>SuperAdmin Support Helpline</h3>
              <p>
                Select a driver, admin, or executive from the left sidebar to view live chat
                history and send realtime replies.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Photo Lightbox Modal */}
      {lightboxImage && (
        <div className="modal-backdrop" onClick={() => setLightboxImage(null)}>
          <div className="photo-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <span>Photo Attachment</span>
              <button
                type="button"
                className="btn-close-lightbox"
                onClick={() => setLightboxImage(null)}
              >
                <X size={20} />
              </button>
            </div>
            <img src={lightboxImage} alt="Enlarged Attachment" className="lightbox-img" />
          </div>
        </div>
      )}

      {/* Link Message(s) to Complaint Modal */}
      {linkModalOpen && linkingMessages.length > 0 && (
        <div className="link-complaint-modal-overlay" onClick={() => setLinkModalOpen(false)}>
          <div className="link-complaint-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="link-complaint-modal-header">
              <h3>
                <Link2 size={18} />
                <span>
                  {linkingMessages.length === 1
                    ? 'Link Chat Message to Complaint'
                    : `Link ${linkingMessages.length} Messages to Complaint`}
                </span>
              </h3>
              <button
                type="button"
                className="btn-cancel-preview"
                onClick={() => setLinkModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="link-complaint-modal-body">
              {/* Message preview snippet */}
              {linkingMessages.length === 1 && linkingMessages[0] ? (
                (() => {
                  const singleMsg = linkingMessages[0];
                  return (
                    <div className="message-preview-card">
                      <div className="message-preview-header">
                        <span>{singleMsg.sender?.firstName || 'Driver'}</span>
                        <span>{formatMessageTime(singleMsg.createdAt)}</span>
                      </div>
                      {singleMsg.type === 'IMAGE' && singleMsg.attachmentUrl ? (
                        <img
                          src={singleMsg.attachmentUrl}
                          alt="Chat photo"
                          className="message-preview-media"
                        />
                      ) : null}
                      {singleMsg.type === 'AUDIO' ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: '#0284c7',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Volume2 size={14} /> Voice Message (
                          {singleMsg.attachmentDurationSec || 0}s)
                        </div>
                      ) : null}
                      {singleMsg.content ? (
                        <p className="message-preview-text">{singleMsg.content}</p>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                <div className="message-preview-card">
                  <div className="message-preview-header">
                    <span style={{ fontWeight: 700, color: '#0284c7' }}>
                      Selected Messages ({linkingMessages.length})
                    </span>
                    <span>Batch Link</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      maxHeight: 160,
                      overflowY: 'auto',
                      marginTop: 4,
                    }}
                  >
                    {linkingMessages.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          fontSize: 12,
                          padding: '6px 8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        {m.type === 'IMAGE' ? (
                          <ImageIcon size={13} color="#059669" />
                        ) : m.type === 'AUDIO' ? (
                          <Volume2 size={13} color="#0284c7" />
                        ) : null}
                        <span style={{ fontWeight: 600 }}>{m.sender?.firstName || 'User'}:</span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {m.content || (m.type === 'AUDIO' ? 'Voice recording' : 'Photo')}
                        </span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>
                          {formatMessageTime(m.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Complaint selector */}
              <div className="link-complaint-form-group">
                <label>Select Open Complaint of Driver:</label>
                {loadingComplaints ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      fontSize: 13,
                      color: '#64748b',
                    }}
                  >
                    <Loader size={16} className="icon-spin" /> Loading open complaints…
                  </div>
                ) : driverOpenComplaints.length === 0 ? (
                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      fontSize: 13,
                      color: '#991b1b',
                    }}
                  >
                    No open complaints found for this driver/vehicle. You can create a new complaint
                    instead.
                  </div>
                ) : (
                  <select
                    className="link-complaint-select"
                    value={selectedComplaintId}
                    onChange={(e) => setSelectedComplaintId(e.target.value)}
                  >
                    {driverOpenComplaints.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.complaintNo} — {c.title} ({c.category || 'General'}) [{c.status}]
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="link-complaint-modal-footer">
              <button
                type="button"
                className="btn-cancel-preview"
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                }}
                onClick={() => setLinkModalOpen(false)}
                disabled={isLinking}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-submit-resolution"
                style={{
                  background: '#0284c7',
                  borderColor: '#0284c7',
                  padding: '6px 16px',
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={handleAttachToComplaint}
                disabled={!selectedComplaintId || isLinking || loadingComplaints}
              >
                {isLinking ? <Loader size={14} className="icon-spin" /> : <Link2 size={14} />}
                <span>
                  {linkingMessages.length > 1
                    ? `Attach ${linkingMessages.length} Messages`
                    : 'Attach to Complaint'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Complaint from Selected Messages Modal */}
      {createModalOpen && selectedConversation && (
        <div className="link-complaint-modal-overlay" onClick={() => setCreateModalOpen(false)}>
          <div className="create-complaint-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="create-complaint-modal-header">
              <h3>
                <Plus size={18} color="#2563eb" />
                <span>Create New Complaint from Chat</span>
              </h3>
              <button
                type="button"
                className="btn-cancel-preview"
                onClick={() => setCreateModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="create-complaint-modal-body">
              {createError && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#b91c1c',
                  }}
                >
                  {createError}
                </div>
              )}

              {/* Auto-populated Context Grid */}
              <div className="fo-modal-context-grid">
                <div className="fo-context-card">
                  <span className="fo-context-label">Driver (Auto-Selected)</span>
                  <span className="fo-context-value">
                    {selectedConversation.contactUser.firstName}{' '}
                    {selectedConversation.contactUser.lastName}
                  </span>
                  <span className="fo-context-sub">
                    Emp ID: {selectedConversation.contactUser.employeeId}
                    {selectedConversation.contactUser.phone
                      ? ` • ${selectedConversation.contactUser.phone}`
                      : ''}
                  </span>
                </div>

                <div className="fo-context-card">
                  <span className="fo-context-label">Assigned Vehicle</span>
                  <span className="fo-context-value">
                    {selectedConversation.vehicle
                      ? selectedConversation.vehicle.plateNumber
                      : 'No Assigned Vehicle'}
                  </span>
                  <span className="fo-context-sub">
                    {selectedConversation.vehicle?.model
                      ? selectedConversation.vehicle.model
                      : 'Will be recorded as unassigned'}
                  </span>
                </div>

                <div className="fo-context-card">
                  <span className="fo-context-label">Complaint ID</span>
                  <span className="fo-context-value" style={{ color: '#059669' }}>
                    Auto-Generated
                  </span>
                  <span className="fo-context-sub">Sequenced on backend creation</span>
                </div>

                <div className="fo-context-card">
                  <span className="fo-context-label">Chat Evidence</span>
                  <span className="fo-context-value">
                    {selectedMessageIds.length} Messages Selected
                  </span>
                  <span className="fo-context-sub">
                    {selectedMediaEvidence.length > 0
                      ? `${selectedMediaEvidence.length} media file(s) attached`
                      : 'Text transcript only'}
                  </span>
                </div>
              </div>

              {/* Category Dropdown */}
              <div className="fo-form-group">
                <label htmlFor="complaint-cat-select">
                  Category of Problem <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id="complaint-cat-select"
                  value={createCategory}
                  onChange={(e) => setCreateCategory(e.target.value as ComplaintCategory)}
                >
                  <option value="BREAKDOWN">Breakdown / Mechanical Failure</option>
                  <option value="TYRE_ISSUE">Tyre Issue / Puncture / Replacement</option>
                  <option value="FUEL_DEF">Fuel / DEF Diesel Exhaust Fluid Issue</option>
                  <option value="LOADING">Loading Plant / Loading Delay</option>
                  <option value="UNLOADING">Unloading Point / Delivery Problem</option>
                  <option value="ACCOUNTS">Accounts / Cash Advance / Toll Payment</option>
                  <option value="VEHICLE_MAINTENANCE">Vehicle Routine Maintenance</option>
                </select>
              </div>

              {/* Priority Selector */}
              <div className="fo-form-group">
                <label>Priority Level</label>
                <div className="fo-priority-selector">
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((pri) => (
                    <button
                      key={pri}
                      type="button"
                      className={`fo-priority-btn ${createPriority === pri ? `active ${pri.toLowerCase()}` : ''}`}
                      onClick={() => setCreatePriority(pri)}
                    >
                      {pri}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title Input */}
              <div className="fo-form-group">
                <label htmlFor="complaint-title-input">
                  Complaint Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="complaint-title-input"
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="Brief summary of the issue..."
                />
              </div>

              {/* Description / Logs Transcript */}
              <div className="fo-form-group">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <label htmlFor="complaint-desc-input">
                    Description / Chat Transcript <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    Auto-compiled from selected messages (editable)
                  </span>
                </div>
                <textarea
                  id="complaint-desc-input"
                  rows={5}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Detailed description of the issue..."
                />
              </div>

              {/* Evidence Media Chips */}
              {selectedMediaEvidence.length > 0 && (
                <div className="fo-form-group">
                  <label>Collected Evidence Attachments ({selectedMediaEvidence.length})</label>
                  <div className="fo-media-chips-row">
                    {selectedMediaEvidence.map((m, idx) => (
                      <div key={m.id} className="fo-media-chip">
                        {m.type === 'IMAGE' ? (
                          <ImageIcon size={13} />
                        ) : (
                          <Volume2 size={13} />
                        )}
                        <span>
                          {m.type === 'IMAGE' ? `Photo #${idx + 1}` : `Voice Note #${idx + 1}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="link-complaint-modal-footer">
              <button
                type="button"
                className="btn-cancel-preview"
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                }}
                onClick={() => setCreateModalOpen(false)}
                disabled={isCreatingComplaint}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-submit-resolution"
                style={{
                  background: '#2563eb',
                  borderColor: '#2563eb',
                  padding: '8px 20px',
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onClick={handleCreateComplaintSubmit}
                disabled={isCreatingComplaint || !createTitle.trim() || !createDescription.trim()}
              >
                {isCreatingComplaint ? (
                  <Loader size={14} className="icon-spin" />
                ) : (
                  <Plus size={14} />
                )}
                <span>Register Complaint Ticket</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
