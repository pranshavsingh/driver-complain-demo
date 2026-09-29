import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VehiclePublic } from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { describeVehicle } from '../lib/format';
import { PHOTO_QUALITY, MAX_PHOTO_BYTES } from '../media/limits';
import { useVoiceRecorder, type VoiceNote } from '../media/recorder';

interface SparePartRequestModalProps {
  visible: boolean;
  onClose: () => void;
  vehicles: VehiclePublic[];
  onSuccess?: () => void;
}

export function SparePartRequestModal({
  visible,
  onClose,
  vehicles,
  onSuccess,
}: SparePartRequestModalProps): ReactElement {
  const insets = useSafeAreaInsets();

  // Assigned Vehicle from driver profile
  const assignedVehicle = vehicles[0] ?? null;
  const vehicleLabel = assignedVehicle ? describeVehicle(assignedVehicle) : 'Assigned Vehicle';

  // Form Fields: Purely Voice Note + Photo + Optional Note
  const [photo, setPhoto] = useState<api.FileToUpload | null>(null);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [optionalNote, setOptionalNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Voice recording hook
  const {
    isRecording,
    elapsedSec,
    error: voiceError,
    start: startRecording,
    stop: stopRecording,
    cancel: cancelRecording,
  } = useVoiceRecorder(setVoiceNote);

  const clearVoiceNote = () => setVoiceNote(null);

  const handleSafeClose = () => {
    const isDirty = Boolean(photo || voiceNote || optionalNote.trim());
    if (isDirty) {
      Alert.alert(
        'Discard Request?',
        'You have unsaved changes in your spare part request. Discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setPhoto(null);
              clearVoiceNote();
              setOptionalNote('');
              setErrorMessage(null);
              onClose();
            },
          },
        ],
      );
      return;
    }
    setErrorMessage(null);
    onClose();
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Camera permission is required to capture spare part photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset) {
          if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
            Alert.alert('File too large', 'Photo exceeds 10 MB limit.');
            return;
          }
          setPhoto({
            uri: asset.uri,
            name: asset.uri.split('/').pop() ?? 'spare-part-proof.jpg',
            type: asset.mimeType ?? 'image/jpeg',
          });
        }
      }
    } catch (err) {
      console.warn('Camera picker error', err);
    }
  };

  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Gallery permission is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset) {
          if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
            Alert.alert('File too large', 'Photo exceeds 10 MB limit.');
            return;
          }
          setPhoto({
            uri: asset.uri,
            name: asset.uri.split('/').pop() ?? 'spare-part-proof.jpg',
            type: asset.mimeType ?? 'image/jpeg',
          });
        }
      }
    } catch (err) {
      console.warn('Gallery picker error', err);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!voiceNote && !photo && !optionalNote.trim()) {
      setErrorMessage('Please record a voice note or attach a photo of the required part.');
      return;
    }

    try {
      setSubmitting(true);

      const voiceFileToUpload: api.FileToUpload | undefined = voiceNote
        ? {
            uri: voiceNote.uri,
            name: voiceNote.name || 'voice-request.m4a',
            type: voiceNote.type || 'audio/m4a',
          }
        : undefined;

      await api.spareParts.create(
        {
          vehicleId: assignedVehicle?.id,
          vehicleNumber: vehicleLabel,
          description: optionalNote.trim() || (voiceNote ? 'Voice note attached' : 'Spare part photo request'),
          quantity: 1,
          type: 'NEW',
        },
        {
          photo: photo || undefined,
          voice: voiceFileToUpload,
        },
      );

      // Reset form
      setPhoto(null);
      clearVoiceNote();
      setOptionalNote('');

      Alert.alert(
        'Request Sent Successfully',
        'Your spare part request has been forwarded to the Executive and Fleet Admin for review.',
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit spare part request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatSec = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleSafeClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="construct" size={20} color="#2563eb" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Request Spare Part</Text>
                <Text style={styles.headerSubtitle}>Record voice note & attach part photo</Text>
              </View>
            </View>
            <Pressable
              onPress={handleSafeClose}
              disabled={submitting || isRecording}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Ionicons name="close" size={22} color="#64748b" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Assigned Vehicle Auto Badge */}
            <View style={styles.vehicleBadge}>
              <Ionicons name="car-sport" size={20} color="#2563eb" />
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleBadgeLabel}>Assigned Vehicle</Text>
                <Text style={styles.vehicleBadgeValue}>{vehicleLabel}</Text>
              </View>
              <View style={styles.autoTag}>
                <Text style={styles.autoTagText}>Auto-Assigned</Text>
              </View>
            </View>

            {/* Error Banner */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#dc2626" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Step 1: Voice Recording Card */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="mic-circle" size={20} color="#7c3aed" />
                <Text style={styles.sectionTitle}>1. Voice Description (Recommended)</Text>
              </View>
              <Text style={styles.sectionHelp}>
                Explain what spare part you need, where it belongs, or what broke.
              </Text>

              <View style={styles.voiceCard}>
                {isRecording ? (
                  <View style={styles.recordingRow}>
                    <View style={styles.pulsingDot} />
                    <Text style={styles.recordingTime}>Recording... {formatSec(elapsedSec)}</Text>
                    <Pressable style={styles.stopBtn} onPress={stopRecording}>
                      <Ionicons name="stop" size={16} color="#ffffff" />
                      <Text style={styles.stopBtnText}>Done</Text>
                    </Pressable>
                    <Pressable style={styles.cancelVoiceBtn} onPress={cancelRecording}>
                      <Ionicons name="close" size={18} color="#dc2626" />
                    </Pressable>
                  </View>
                ) : voiceNote ? (
                  <View style={styles.recordedRow}>
                    <Ionicons name="checkmark-circle" size={26} color="#16a34a" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.recordedTitle}>Voice Note Ready</Text>
                      <Text style={styles.recordedDuration}>Duration: {formatSec(voiceNote.durationSec)}</Text>
                    </View>
                    <Pressable style={styles.deleteVoiceBtn} onPress={clearVoiceNote}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.recordStartBtn} onPress={startRecording}>
                    <View style={styles.recordIconCircle}>
                      <Ionicons name="mic" size={22} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recordStartText}>Tap to Record Voice Note</Text>
                      <Text style={styles.recordStartSub}>Speak clearly into your phone mic</Text>
                    </View>
                  </Pressable>
                )}
                {voiceError ? <Text style={styles.voiceErrorText}>{voiceError}</Text> : null}
              </View>
            </View>

            {/* Step 2: Photo Capture Card */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="camera" size={20} color="#0284c7" />
                <Text style={styles.sectionTitle}>2. Photo of Part / Damage</Text>
              </View>
              <Text style={styles.sectionHelp}>
                Take a clear photo of the broken part or area needing replacement.
              </Text>

              {photo ? (
                <View style={styles.photoPreviewBox}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <Pressable style={styles.removePhotoBtn} onPress={() => setPhoto(null)}>
                    <Ionicons name="close-circle" size={26} color="#dc2626" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.photoActionsRow}>
                  <Pressable style={styles.photoBtn} onPress={takePhoto}>
                    <Ionicons name="camera-outline" size={22} color="#2563eb" />
                    <Text style={styles.photoBtnText}>Take Photo</Text>
                  </Pressable>
                  <Pressable style={styles.photoBtn} onPress={pickFromGallery}>
                    <Ionicons name="images-outline" size={22} color="#475569" />
                    <Text style={styles.photoBtnText}>Choose Gallery</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Step 3: Optional Quick Note */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="document-text-outline" size={18} color="#64748b" />
                <Text style={styles.sectionTitle}>3. Additional Note (Optional)</Text>
              </View>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Any additional details for the fleet team (optional)..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={2}
                maxLength={500}
                value={optionalNote}
                onChangeText={setOptionalNote}
              />
            </View>
          </ScrollView>

          {/* Submit Action */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting || isRecording}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitButtonText}>Submit Spare Part Request</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: '65%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  btnPressed: {
    opacity: 0.6,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 18,
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  vehicleBadgeLabel: {
    fontSize: 11,
    color: '#15803d',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vehicleBadgeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14532d',
    marginTop: 1,
  },
  autoTag: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  autoTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    flex: 1,
  },
  section: {
    gap: 6,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  sectionHelp: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  voiceCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
  },
  recordStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 6,
  },
  recordIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordStartText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  recordStartSub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#dc2626',
  },
  recordingTime: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stopBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelVoiceBtn: {
    padding: 8,
  },
  recordedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  recordedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  recordedDuration: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  deleteVoiceBtn: {
    padding: 8,
  },
  voiceErrorText: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 6,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 14,
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  photoPreviewBox: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    backgroundColor: '#f1f5f9',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    elevation: 2,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  textArea: {
    minHeight: 65,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
