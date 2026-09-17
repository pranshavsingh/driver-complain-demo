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
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import type {
  SupportConversationSummary,
  SupportMessagePublic,
} from '@driver-complaint/shared-types';

type RoleFilter = 'ALL' | 'DRIVER' | 'ADMIN' | 'EXECUTIVE';

export function SupportChatPage(): ReactElement {
  const { user } = useAuth();
  const { subscribeCustom } = useRealtime();

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
              <div className="chat-messages-container">
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

                    return (
                      <div key={msg.id} className="chat-message-row-wrapper">
                        {showDateDivider ? (
                          <div className="chat-date-divider">
                            <span>{formatMessageDate(msg.createdAt)}</span>
                          </div>
                        ) : null}

                        <div className={`chat-message-bubble ${isMe ? 'outgoing' : 'incoming'}`}>
                          {/* Sender name for received group style */}
                          {!isMe && (
                            <span className="chat-sender-label">
                              {msg.sender?.firstName || 'User'}
                            </span>
                          )}

                          {/* 1. PHOTO MESSAGE */}
                          {msg.type === 'IMAGE' && msg.attachmentUrl && (
                            <div
                              className="chat-bubble-image-wrap"
                              onClick={() => setLightboxImage(msg.attachmentUrl)}
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
                          {msg.content && msg.content !== 'Photo' && msg.content !== 'Voice Message' ? (
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
    </div>
  );
}
