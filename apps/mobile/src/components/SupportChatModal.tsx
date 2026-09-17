import { useState, useEffect, useRef, useCallback, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useVoiceRecorder, type VoiceNote } from '../media/recorder';
import { PHOTO_QUALITY } from '../media/limits';
import { spacing } from '../theme';

interface SupportChatModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SupportChatModal({ visible, onClose }: SupportChatModalProps): ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [targetAdminId, setTargetAdminId] = useState<string | null>(null);

  // Input states
  const [textInput, setTextInput] = useState('');
  const [pickedPhoto, setPickedPhoto] = useState<api.FileToUpload | null>(null);
  const [recordedVoice, setRecordedVoice] = useState<VoiceNote | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recorder = useVoiceRecorder((voice) => {
    setRecordedVoice(voice);
  });

  // 1. Fetch default admin and initial messages
  const loadChat = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      let adminId = targetAdminId;
      if (!adminId) {
        try {
          const defaultAdmin = await api.support.getDefaultAdmin();
          adminId = defaultAdmin.id;
          setTargetAdminId(defaultAdmin.id);
        } catch {
          const convs = await api.support.getConversations();
          if (convs.length > 0 && convs[0]?.contactUser?.id) {
            adminId = convs[0].contactUser.id;
            setTargetAdminId(adminId);
          }
        }
      }

      if (adminId) {
        const res = await api.support.getMessages(adminId, { limit: 100 });
        setMessages(res.data ?? []);
        // Mark read
        void api.support.markRead(adminId);
      }
    } catch (err) {
      console.warn('[SupportChatModal] Error loading chat:', err);
    } finally {
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  }, [targetAdminId]);

  useEffect(() => {
    if (visible) {
      void loadChat(false);
      // Auto-poll messages every 4 seconds for realtime feel
      pollingTimerRef.current = setInterval(() => {
        void loadChat(true);
      }, 4000);
    } else {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    }

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [visible, loadChat]);

  // Handle Photo Picker
  const handlePickPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Denied', 'Camera permission is required to take a photo.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: PHOTO_QUALITY,
        });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          setPickedPhoto({
            uri: asset.uri,
            name: asset.fileName || `support-photo-${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          });
        }
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: PHOTO_QUALITY,
        });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          setPickedPhoto({
            uri: asset.uri,
            name: asset.fileName || `support-photo-${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          });
        }
      }
    } catch (err) {
      console.warn('[SupportChatModal] Photo picker error:', err);
    }
  };

  const showAttachmentOptions = () => {
    Alert.alert('Send Attachment 📎', 'Choose photo attachment source:', [
      { text: '📷 Take Photo', onPress: () => void handlePickPhoto('camera') },
      { text: '🖼️ Choose from Gallery', onPress: () => void handlePickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Send Message
  const handleSend = async () => {
    if (!textInput.trim() && !pickedPhoto && !recordedVoice) return;
    setSending(true);

    try {
      let attachment: api.FileToUpload | undefined;
      let msgType: 'TEXT' | 'IMAGE' | 'AUDIO' = 'TEXT';

      if (recordedVoice) {
        msgType = 'AUDIO';
        attachment = {
          uri: recordedVoice.uri,
          name: recordedVoice.name,
          type: recordedVoice.type,
        };
      } else if (pickedPhoto) {
        msgType = 'IMAGE';
        attachment = pickedPhoto;
      }

      const res = await api.support.sendMessage(
        {
          receiverId: targetAdminId ?? undefined,
          content: textInput.trim(),
          type: msgType,
        },
        attachment
      );

      // Append message to UI
      setMessages((prev) => [...prev, res]);
      setTextInput('');
      setPickedPhoto(null);
      setRecordedVoice(null);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    } catch (err) {
      console.error('[SupportChatModal] Failed to send message:', err);
      Alert.alert('Send Error', 'Failed to send your message. Please check internet connection.');
    } finally {
      setSending(false);
    }
  };

  const renderMessageItem = ({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;
    const timeStr = item.createdAt
      ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <View style={[styles.bubbleWrapper, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
        <View style={[styles.bubbleCard, isMe ? styles.bubbleCardMe : styles.bubbleCardOther]}>
          {!isMe && (
            <Text style={styles.senderNameLabel}>
              {item.sender?.firstName ? `Support (${item.sender.firstName})` : 'Fleet Support'}
            </Text>
          )}

          {/* 1. Photo Message */}
          {item.type === 'IMAGE' && item.attachmentUrl && (
            <Pressable
              onPress={() => setEnlargedImage(item.attachmentUrl)}
              style={styles.imageAttachWrap}
            >
              <Image source={{ uri: item.attachmentUrl }} style={styles.chatAttachedImg} />
            </Pressable>
          )}

          {/* 2. Audio Voice Note Message */}
          {item.type === 'AUDIO' && item.attachmentUrl && (
            <MobileVoicePlayer uri={item.attachmentUrl} durationSec={item.attachmentDurationSec} />
          )}

          {/* 3. Text Message */}
          {item.content && item.content !== 'Photo' && item.content !== 'Voice Message' ? (
            <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>
              {item.content}
            </Text>
          ) : null}

          {/* Meta footer with time & double tick */}
          <View style={styles.bubbleMetaRow}>
            <Text style={styles.timeText}>{timeStr}</Text>
            {isMe && (
              <Ionicons
                name={item.isRead ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={item.isRead ? '#38BDF8' : '#94A3B8'}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* WhatsApp Green Header Bar */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
          <Pressable onPress={onClose} style={styles.backBtn} accessibilityLabel="Back to Home">
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>

          <View style={styles.headerProfile}>
            <View style={styles.headerAvatar}>
              <Ionicons name="headset" size={20} color="#FFFFFF" />
              <View style={styles.onlineDot} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Fleet Support Helpline</Text>
              <Text style={styles.headerSubtitle}>SuperAdmin & Support Active • 🟢 Online</Text>
            </View>
          </View>

          <Pressable
            onPress={() => void loadChat(false)}
            style={styles.refreshBtn}
            accessibilityLabel="Refresh chat"
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Chat Feed */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatArea}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#075E54" />
              <Text style={styles.loadingText}>Connecting to SuperAdmin Support…</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id || Math.random().toString()}
              renderItem={renderMessageItem}
              contentContainerStyle={styles.messageListContent}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onRefresh={() => void loadChat(false)}
              refreshing={refreshing}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="chatbubbles" size={36} color="#075E54" />
                  </View>
                  <Text style={styles.emptyTitle}>Welcome to Driver Support! 💬</Text>
                  <Text style={styles.emptySub}>
                    Ask anything regarding breakdown, spare parts, fuel allowances, or route
                    issues. Our team replies instantly!
                  </Text>
                </View>
              }
            />
          )}

          {/* Selected Attachment Preview Bar */}
          {pickedPhoto && (
            <View style={styles.previewBar}>
              <Image source={{ uri: pickedPhoto.uri }} style={styles.previewThumb} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.previewLabel}>Photo attached</Text>
                <Text style={styles.previewSub}>Ready to send with your message</Text>
              </View>
              <Pressable onPress={() => setPickedPhoto(null)} style={styles.removePreviewBtn}>
                <Ionicons name="close-circle" size={22} color="#EF4444" />
              </Pressable>
            </View>
          )}

          {recordedVoice && (
            <View style={styles.previewBar}>
              <View style={styles.audioPreviewIcon}>
                <Ionicons name="mic" size={20} color="#0284C7" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.previewLabel}>Voice Note ({recordedVoice.durationSec}s)</Text>
                <Text style={styles.previewSub}>Recorded and ready to send</Text>
              </View>
              <Pressable onPress={() => setRecordedVoice(null)} style={styles.removePreviewBtn}>
                <Ionicons name="close-circle" size={22} color="#EF4444" />
              </Pressable>
            </View>
          )}

          {/* Recording Live Indicator Banner */}
          {recorder.isRecording && (
            <View style={styles.recordingBanner}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                Recording Voice Note ({recorder.elapsedSec}s)…
              </Text>
              <Pressable onPress={() => void recorder.cancel()} style={styles.discardBtn}>
                <Text style={styles.discardBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void recorder.stop()} style={styles.doneRecBtn}>
                <Text style={styles.doneRecBtnText}>Done</Text>
              </Pressable>
            </View>
          )}

          {/* Bottom Message Composer */}
          <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Pressable
              onPress={showAttachmentOptions}
              style={styles.attachBtn}
              accessibilityLabel="Attach photo"
            >
              <Ionicons name="attach" size={24} color="#54656F" />
            </Pressable>

            <Pressable
              onPress={() => void handlePickPhoto('camera')}
              style={styles.cameraBtn}
              accessibilityLabel="Open camera"
            >
              <Ionicons name="camera" size={22} color="#54656F" />
            </Pressable>

            <TextInput
              style={styles.composerInput}
              placeholder={
                recorder.isRecording
                  ? 'Recording audio…'
                  : pickedPhoto
                  ? 'Add photo caption…'
                  : 'Type a message…'
              }
              placeholderTextColor="#94A3B8"
              value={textInput}
              onChangeText={setTextInput}
              multiline
              maxLength={1000}
              editable={!sending && !recorder.isRecording}
            />

            {/* If no text or photo, show Mic button, else show Send Button */}
            {!textInput.trim() && !pickedPhoto && !recordedVoice ? (
              <Pressable
                onPress={() => {
                  if (recorder.isRecording) {
                    void recorder.stop();
                  } else {
                    void recorder.start();
                  }
                }}
                style={[
                  styles.micBtn,
                  recorder.isRecording && { backgroundColor: '#EF4444' },
                ]}
                accessibilityLabel="Record voice message"
              >
                <Ionicons
                  name={recorder.isRecording ? 'stop' : 'mic'}
                  size={20}
                  color="#FFFFFF"
                />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void handleSend()}
                style={styles.sendBtn}
                disabled={sending}
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                )}
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>

        {/* Photo Lightbox Popup */}
        <Modal
          visible={!!enlargedImage}
          transparent
          animationType="fade"
          onRequestClose={() => setEnlargedImage(null)}
        >
          <View style={styles.lightboxModal}>
            <Pressable
              style={styles.closeLightboxBtn}
              onPress={() => setEnlargedImage(null)}
              accessibilityLabel="Close enlarged photo"
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </Pressable>
            {enlargedImage && (
              <Image
                source={{ uri: enlargedImage }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

/** Native Audio Player Component for WhatsApp Voice Bubbles */
function MobileVoicePlayer({
  uri,
  durationSec,
}: {
  uri: string;
  durationSec?: number | null;
}): ReactElement {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const togglePlay = async () => {
    try {
      if (status.playing) {
        player.pause();
        return;
      }

      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
          interruptionMode: 'duckOthers',
        });
      } catch {
        // non-fatal
      }

      player.volume = 1.0;
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.2)) {
        await player.seekTo(0);
      }
      player.play();
    } catch (err) {
      console.warn('[MobileVoicePlayer] play error:', err);
    }
  };

  const currentSec = Math.floor(status.currentTime || 0);
  const totalSec = durationSec || Math.floor(status.duration || 0) || 0;

  return (
    <View style={styles.voicePlayerCard}>
      <Pressable onPress={() => void togglePlay()} style={styles.playIconCircle}>
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={18}
          color="#FFFFFF"
          style={{ marginLeft: status.playing ? 0 : 2 }}
        />
      </Pressable>

      <View style={styles.waveformWrap}>
        <View style={styles.waveBarGroup}>
          {[4, 8, 12, 16, 10, 14, 6, 18, 12, 8, 14, 10, 6, 12].map((height, idx) => (
            <View
              key={idx}
              style={[
                styles.waveformBar,
                {
                  height,
                  backgroundColor:
                    status.playing && idx <= (currentSec % 14) ? '#075E54' : '#94A3B8',
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.voiceDurationText}>
          {status.playing ? `${currentSec}s` : totalSec > 0 ? `${totalSec}s` : 'Voice Note'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFEAE2', // WhatsApp chat wallpaper background
  },
  header: {
    backgroundColor: '#075E54',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  backBtn: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#128C7E',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 1.5,
    borderColor: '#075E54',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#D1FAE5',
    fontWeight: '500',
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  chatArea: {
    flex: 1,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  messageListContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 10,
  },
  bubbleWrapper: {
    width: '100%',
    flexDirection: 'row',
  },
  bubbleLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRight: {
    justifyContent: 'flex-end',
  },
  bubbleCard: {
    maxWidth: '82%',
    padding: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
  },
  bubbleCardMe: {
    backgroundColor: '#E7FCE3', // WhatsApp Outgoing green
    borderTopRightRadius: 2,
  },
  bubbleCardOther: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 2,
  },
  senderNameLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#075E54',
    marginBottom: 3,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 19,
  },
  messageTextMe: {
    color: '#0F172A',
  },
  messageTextOther: {
    color: '#0F172A',
  },
  bubbleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  timeText: {
    fontSize: 10,
    color: '#64748B',
  },
  imageAttachWrap: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  chatAttachedImg: {
    width: 220,
    height: 160,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  voicePlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 200,
    paddingVertical: 4,
  },
  playIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformWrap: {
    flex: 1,
  },
  waveBarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 20,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceDurationText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    marginTop: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#075E54',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  previewThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  audioPreviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewSub: {
    fontSize: 11,
    color: '#64748B',
  },
  removePreviewBtn: {
    padding: 4,
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#B91C1C',
    flex: 1,
  },
  discardBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  discardBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  doneRecBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  doneRecBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6,
  },
  attachBtn: {
    padding: 6,
  },
  cameraBtn: {
    padding: 6,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  lightboxModal: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLightboxBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
});
