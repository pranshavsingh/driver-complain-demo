import { useMemo, useState, useEffect, type ReactElement } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  CreateComplaintSchema,
  PRIORITIES,
  type Priority,
  type VehiclePublic,
} from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useAuth } from '../../../src/auth/AuthContext';
import { ErrorNotice } from '../../../src/components/ErrorNotice';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { describeVehicle, formatEnum, formatDuration } from '../../../src/lib/format';
import {
  NO_EVIDENCE,
  toEvidenceUpload,
  type EvidenceState,
} from '../../../src/media/EvidencePicker';
import { MAX_PHOTO_BYTES, MAX_VOICE_SECONDS, PHOTO_QUALITY } from '../../../src/media/limits';
import { useVoiceRecorder, type VoiceNote } from '../../../src/media/recorder';
import { captureVideo, videoCaptureAvailable } from '../../../src/media/video';
import { radius, spacing, PRIORITY_TONES } from '../../../src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function WhatsAppRegisterComplaintScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const params = useLocalSearchParams<{ initialText?: string; initialPriority?: string }>();

  const vehicles = useApiResource('vehicles:mine', () => api.vehicles.mine());

  const [textInput, setTextInput] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [manualVehicleInput, setManualVehicleInput] = useState('');
  const [evidence, setEvidence] = useState<EvidenceState>(NO_EVIDENCE);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);

  useEffect(() => {
    if (params.initialText) {
      setTextInput(params.initialText);
    }
    if (params.initialPriority && PRIORITIES.includes(params.initialPriority as Priority)) {
      setPriority(params.initialPriority as Priority);
    }
  }, [params.initialText, params.initialPriority]);

  const vehicleList = useMemo<VehiclePublic[]>(() => vehicles.data ?? [], [vehicles.data]);

  const selectedVehicle = useMemo(() => {
    if (vehicleId) return vehicleList.find((v) => v.id === vehicleId);
    return vehicleList[0];
  }, [vehicleId, vehicleList]);

  const selectedVehicleId = selectedVehicle?.id ?? null;

  const driverDisplayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : 'Driver';

  // Voice recording hook using working expo-av recorder
  const recorder = useVoiceRecorder((voice: VoiceNote) => {
    setEvidence((prev) => ({ ...prev, voice }));
  });

  const attachPhoto = (asset: ImagePicker.ImagePickerAsset): void => {
    if (asset.fileSize !== undefined && asset.fileSize > MAX_PHOTO_BYTES) {
      Alert.alert('Photo too large', 'Please take a new photo with the camera.');
      return;
    }
    setEvidence((prev) => ({
      ...prev,
      photo: {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      },
    }));
  };

  const takePhoto = (): void => {
    void (async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to attach photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
      });
      if (!result.canceled && result.assets[0]) {
        attachPhoto(result.assets[0]);
      }
    })();
  };

  const choosePhoto = (): void => {
    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
      });
      if (!result.canceled && result.assets[0]) {
        attachPhoto(result.assets[0]);
      }
    })();
  };

  const recordVideoClip = (): void => {
    void (async () => {
      const result = await captureVideo();
      if (result.status === 'ok') {
        setEvidence((prev) => ({ ...prev, video: result.clip }));
      } else if (result.status === 'error') {
        Alert.alert('Video Error', result.message);
      }
    })();
  };

  const showAttachmentMenu = (): void => {
    Alert.alert('Attach Media', 'Choose an attachment type', [
      { text: '📷 Take Photo', onPress: takePhoto },
      { text: '🖼️ Choose Photo from Gallery', onPress: choosePhoto },
      ...(videoCaptureAvailable
        ? [{ text: '🎥 Record Video', onPress: recordVideoClip }]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmSignOut = (): void => {
    Alert.alert('Sign out?', 'You will need your employee ID and PIN to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  const submitComplaint = (): void => {
    const trimmed = textInput.trim();

    if (!trimmed && !evidence.photo && !evidence.voice && !evidence.video) {
      Alert.alert(
        'Empty Complaint',
        'Please type a problem description or record a voice note before sending.',
      );
      return;
    }

    const lines = trimmed.split('\n');
    const titleText =
      lines[0]?.trim() ||
      (evidence.photo
        ? 'Photo evidence report'
        : evidence.voice
          ? 'Voice note report'
          : 'Vehicle Complaint');
    const descriptionText = trimmed || (evidence.photo ? 'Photo attached' : 'Voice note attached');

    const parsed = CreateComplaintSchema.safeParse({
      title: titleText,
      description: descriptionText,
      priority,
      ...(selectedVehicleId ? { vehicleId: selectedVehicleId } : {}),
      ...(manualVehicleInput.trim() ? { vehicleNumber: manualVehicleInput.trim() } : {}),
    });

    if (!parsed.success) {
      setError(new Error(parsed.error.issues.map((i) => i.message).join('\n')));
      return;
    }

    setError(null);
    setSubmitting(true);

    api.complaints
      .create(parsed.data, toEvidenceUpload(evidence))
      .then(() => {
        setTextInput('');
        setManualVehicleInput('');
        setEvidence(NO_EVIDENCE);
        setPriority('MEDIUM');
        router.push('/(app)/(tabs)/history');
      })
      .catch((err: unknown) => {
        setError(err);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const hasAttachments = Boolean(evidence.photo || evidence.voice || evidence.video);

  return (
    <View style={styles.screen}>
      {/* 1. Status Bar & WhatsApp Top Header */}
      <View style={[styles.whatsappHeader, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerProfile}>
          <Pressable onPress={() => router.push('/(app)/(tabs)')} style={{ marginRight: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={styles.avatarCircle}>
            <Ionicons name="headset" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Dispatch Support</Text>
            <Text style={styles.headerSubtitle}>{driverDisplayName}</Text>
          </View>
        </View>

        <Pressable onPress={confirmSignOut} style={styles.logoutBtn} accessibilityLabel="Sign out">
          <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* 2. Prominent Vehicle Input & Priority Controls */}
      <View style={styles.vehicleInputSection}>
        <View style={styles.vehicleBox}>
          <Ionicons name="bus-outline" size={20} color="#075E54" />
          <TextInput
            style={styles.vehicleInput}
            placeholder="enter vehicle number"
            placeholderTextColor="#94A3B8"
            value={manualVehicleInput || (selectedVehicle ? describeVehicle(selectedVehicle) : '')}
            onChangeText={(txt) => {
              setManualVehicleInput(txt);
              setShowVehicleDropdown(true);
            }}
            onFocus={() => setShowVehicleDropdown(true)}
          />
          {vehicleList.length > 0 ? (
            <Pressable
              onPress={() => setShowVehicleDropdown(!showVehicleDropdown)}
              style={styles.dropdownToggle}
            >
              <Ionicons name="chevron-down" size={18} color="#64748B" />
            </Pressable>
          ) : null}
        </View>

        {/* Priority Selector Pill */}
        <Pressable
          style={[
            styles.priorityPill,
            { backgroundColor: PRIORITY_TONES[priority].surface },
          ]}
          onPress={() => setShowPriorityPicker(!showPriorityPicker)}
        >
          <Ionicons name="alert-circle" size={15} color={PRIORITY_TONES[priority].text} />
          <Text style={[styles.priorityPillText, { color: PRIORITY_TONES[priority].text }]}>
            Priority: {formatEnum(priority)}
          </Text>
          <Ionicons name="chevron-down" size={12} color={PRIORITY_TONES[priority].text} />
        </Pressable>
      </View>

      {/* Dropdown Vehicle Options */}
      {showVehicleDropdown && vehicleList.length > 0 ? (
        <View style={styles.dropdownMenu}>
          <Text style={styles.dropdownHeader}>Assigned Vehicles:</Text>
          {vehicleList.map((v) => (
            <Pressable
              key={v.id}
              style={styles.dropdownItem}
              onPress={() => {
                setVehicleId(v.id);
                setManualVehicleInput(describeVehicle(v));
                setShowVehicleDropdown(false);
              }}
            >
              <Ionicons name="car" size={16} color="#075E54" />
              <Text style={styles.dropdownItemText}>{describeVehicle(v)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Priority Picker Dropdown */}
      {showPriorityPicker ? (
        <View style={styles.dropdownMenu}>
          <Text style={styles.dropdownHeader}>Set Priority:</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                onPress={() => {
                  setPriority(p);
                  setShowPriorityPicker(false);
                }}
                style={[
                  styles.priorityChip,
                  { backgroundColor: PRIORITY_TONES[p].surface },
                  priority === p && styles.priorityChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.priorityChipText,
                    { color: PRIORITY_TONES[p].text },
                    priority === p && { fontWeight: '700' },
                  ]}
                >
                  {formatEnum(p)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* 3. WhatsApp Chat Timeline Area */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.chatTimeline}
          keyboardShouldPersistTaps="handled"
        >
          {/* Welcome Message */}
          <View style={styles.systemBubble}>
            <Text style={styles.systemText}>
              👋 Describe your issue below or record a voice note. You can also attach proof images and video clips.
            </Text>
            <Text style={styles.bubbleTime}>Just now</Text>
          </View>

          {/* Draft Message (Outgoing Bubble) */}
          {(textInput.trim() !== '' || hasAttachments || recorder.isRecording) ? (
            <View style={styles.outgoingBubble}>
              {/* Photo Preview */}
              {evidence.photo ? (
                <View style={styles.mediaSlot}>
                  <Image
                    source={{ uri: evidence.photo.uri }}
                    style={styles.photoPreview}
                    resizeMode="cover"
                  />
                  <Pressable
                    style={styles.removeMediaBtn}
                    onPress={() => setEvidence((prev) => ({ ...prev, photo: null }))}
                  >
                    <Ionicons name="close" size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : null}

              {/* Voice Note Preview */}
              {evidence.voice ? (
                <View style={styles.voicePreviewRow}>
                  <Ionicons name="mic" size={20} color="#075E54" />
                  <Text style={styles.voicePreviewText}>
                    Voice Note ({formatDuration(evidence.voice.durationSec)})
                  </Text>
                  <Pressable
                    onPress={() => setEvidence((prev) => ({ ...prev, voice: null }))}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              ) : null}

              {/* Video Clip Preview */}
              {evidence.video ? (
                <View style={styles.voicePreviewRow}>
                  <Ionicons name="videocam" size={20} color="#075E54" />
                  <Text style={styles.voicePreviewText}>
                    Video Clip ({formatDuration(evidence.video.durationSec)})
                  </Text>
                  <Pressable
                    onPress={() => setEvidence((prev) => ({ ...prev, video: null }))}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              ) : null}

              {/* Text Input Content */}
              {textInput.trim() !== '' ? (
                <Text style={styles.outgoingText}>{textInput.trim()}</Text>
              ) : null}

              <View style={styles.bubbleFooter}>
                <Text style={styles.outgoingTime}>Drafting</Text>
                <Ionicons name="checkmark-done" size={16} color="#60A5FA" />
              </View>
            </View>
          ) : null}

          <ErrorNotice error={error} />
        </ScrollView>

        {/* Live Voice Recording Status Bar */}
        {recorder.isRecording ? (
          <View style={styles.recordingBar}>
            <View style={styles.recordingRedDot} />
            <Text style={styles.recordingText}>
              Recording Voice Note: {formatDuration(recorder.elapsedSec)} / {formatDuration(MAX_VOICE_SECONDS)}
            </Text>
            <Pressable style={styles.stopRecBtn} onPress={recorder.stop}>
              <Text style={styles.stopRecText}>Done</Text>
            </Pressable>
            <Pressable style={styles.cancelRecBtn} onPress={recorder.cancel}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
            </Pressable>
          </View>
        ) : null}

        {/* 4. WhatsApp Chat Bottom Action Bar */}
        <View style={styles.whatsappInputBar}>
          <Pressable style={styles.actionIconBtn} onPress={showAttachmentMenu} disabled={submitting}>
            <Ionicons name="add" size={24} color="#075E54" />
          </Pressable>

          <Pressable style={styles.actionIconBtn} onPress={takePhoto} disabled={submitting}>
            <Ionicons name="camera-outline" size={22} color="#64748B" />
          </Pressable>

          <View style={styles.chatInputWrapper}>
            <TextInput
              style={styles.chatTextInput}
              placeholder="Type a problem..."
              placeholderTextColor="#94A3B8"
              value={textInput}
              onChangeText={setTextInput}
              multiline
              maxLength={2000}
              editable={!submitting}
            />
          </View>

          {!textInput.trim() && !hasAttachments ? (
            <Pressable
              style={styles.micCircleBtn}
              onPress={recorder.start}
              disabled={submitting || recorder.isRecording}
            >
              <Ionicons name="mic" size={20} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.sendCircleBtn, submitting && styles.sendBtnDisabled]}
              onPress={submitComplaint}
              disabled={submitting}
            >
              <Ionicons name="send" size={16} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E5DDD5' },
  flex: { flex: 1 },
  whatsappHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: '#075E54',
    elevation: 4,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#128C7E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#E0F2FE',
  },
  logoutBtn: {
    padding: spacing.xs,
  },
  vehicleInputSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    gap: spacing.xs,
  },
  vehicleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: spacing.xs,
  },
  vehicleInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  dropdownToggle: {
    padding: 4,
  },
  priorityPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: 2,
  },
  priorityPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 4,
  },
  dropdownHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: spacing.xs,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  priorityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  priorityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  priorityChipSelected: {
    borderWidth: 1,
    borderColor: '#075E54',
  },
  priorityChipText: {
    fontSize: 13,
  },
  chatTimeline: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  systemBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderTopLeftRadius: 0,
    padding: spacing.md,
    maxWidth: '85%',
    marginBottom: spacing.md,
    elevation: 1,
  },
  systemText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize: 10,
    color: '#94A3B8',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  outgoingBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
    borderRadius: 12,
    borderTopRightRadius: 0,
    padding: spacing.md,
    maxWidth: '85%',
    marginBottom: spacing.md,
    elevation: 1,
  },
  outgoingText: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
  },
  mediaSlot: {
    position: 'relative',
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
  },
  removeMediaBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  voicePreviewText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  outgoingTime: {
    fontSize: 10,
    color: '#64748B',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  recordingRedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DC2626',
  },
  recordingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#991B1B',
  },
  stopRecBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  stopRecText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelRecBtn: {
    padding: 4,
  },
  whatsappInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    backgroundColor: '#F0F2F5',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  actionIconBtn: {
    padding: spacing.xs,
  },
  chatInputWrapper: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    maxHeight: 90,
  },
  chatTextInput: {
    fontSize: 14,
    color: '#0F172A',
  },
  micCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
