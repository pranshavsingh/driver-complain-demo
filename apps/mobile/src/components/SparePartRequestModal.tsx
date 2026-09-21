import { useState, useMemo, type ReactElement } from 'react';
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
import type { VehiclePublic, SparePartType } from '@driver-complaint/shared-types';
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

const COMMON_PARTS = [
  'Brake Pad / Shoe',
  'Fan Belt',
  'Wiper Blade',
  'Headlight Bulb',
  'Side Mirror',
  'Coolant / Oil',
  'Air Filter',
  'Clutch Plate',
  'Horn',
  'Other',
];

export function SparePartRequestModal({
  visible,
  onClose,
  vehicles,
  onSuccess,
}: SparePartRequestModalProps): ReactElement {
  const insets = useSafeAreaInsets();

  // Vehicle Selection
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    vehicles[0]?.id ?? null,
  );
  const [manualVehicle, setManualVehicle] = useState<string>(
    vehicles[0] ? describeVehicle(vehicles[0]) : '',
  );
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  // Form Fields
  const [partName, setPartName] = useState('');
  const [partType, setPartType] = useState<SparePartType>('NEW');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<api.FileToUpload | null>(null);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);

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

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  }, [selectedVehicleId, vehicles]);

  const activeVehicleName =
    manualVehicle.trim() || (selectedVehicle ? describeVehicle(selectedVehicle) : '');

  // Photo handlers
  const handleSafeClose = () => {
    const isDirty = Boolean(partName.trim() || description.trim() || photo || voiceNote);
    if (isDirty) {
      Alert.alert(
        'Discard Request?',
        'You have unsaved changes in this spare part request. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setPhoto(null);
              setPartName('');
              setDescription('');
              onClose();
            },
          },
        ],
      );
      return;
    }
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
          const uri = asset.uri;
          const name = uri.split('/').pop() ?? 'spare-part-proof.jpg';
          setPhoto({
            uri,
            name,
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
          const uri = asset.uri;
          const name = uri.split('/').pop() ?? 'spare-part-proof.jpg';
          setPhoto({
            uri,
            name,
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

    if (!activeVehicleName) {
      setErrorMessage('Vehicle identification is required');
      return;
    }

    if (!partName.trim() && !description.trim() && !voiceNote) {
      setErrorMessage('Please provide a part name, text description, or voice recording.');
      return;
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setErrorMessage('Quantity must be at least 1.');
      return;
    }

    if (parsedQty > 100) {
      setErrorMessage('Quantity cannot exceed 100 units.');
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
          vehicleId: selectedVehicle?.id,
          vehicleNumber: activeVehicleName,
          partName: partName.trim() || undefined,
          description: description.trim() || (voiceNote ? 'Voice note attached' : 'Spare part requested'),
          quantity: parsedQty,
          type: partType,
        },
        {
          photo: photo || undefined,
          voice: voiceFileToUpload,
        },
      );

      // Reset form
      setPartName('');
      setDescription('');
      setQuantity('1');
      setPartType('NEW');
      setPhoto(null);
      clearVoiceNote();

      Alert.alert(
        'Request Submitted',
        'Your spare part requisition has been sent to Fleet Admin for warehouse issuance.',
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
                <Text style={styles.headerSubtitle}>Submit via Voice, Photo, or Text</Text>
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
            {/* Error Banner */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#dc2626" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Vehicle Selector */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Assigned Vehicle *</Text>
              <Pressable
                onPress={() => setShowVehicleDropdown((prev) => !prev)}
                style={styles.dropdownTrigger}
              >
                <Ionicons name="car-sport" size={18} color="#2563eb" />
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {activeVehicleName || 'Select or type vehicle...'}
                </Text>
                <Ionicons
                  name={showVehicleDropdown ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#64748b"
                />
              </Pressable>

              {showVehicleDropdown && (
                <View style={styles.dropdownList}>
                  {vehicles.map((v) => (
                    <Pressable
                      key={v.id}
                      style={[
                        styles.dropdownItem,
                        selectedVehicleId === v.id && styles.dropdownItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedVehicleId(v.id);
                        setManualVehicle(describeVehicle(v));
                        setShowVehicleDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selectedVehicleId === v.id && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {describeVehicle(v)}
                      </Text>
                    </Pressable>
                  ))}
                  <View style={styles.manualVehicleRow}>
                    <TextInput
                      style={styles.manualVehicleInput}
                      placeholder="Or enter plate number..."
                      value={manualVehicle}
                      onChangeText={(txt) => {
                        setManualVehicle(txt);
                        setSelectedVehicleId(null);
                      }}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Request Type: New vs Exchange */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Requisition Type</Text>
              <View style={styles.typeRow}>
                <Pressable
                  style={[styles.typeOption, partType === 'NEW' && styles.typeOptionActive]}
                  onPress={() => setPartType('NEW')}
                >
                  <Ionicons
                    name={partType === 'NEW' ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={partType === 'NEW' ? '#2563eb' : '#64748b'}
                  />
                  <Text style={[styles.typeText, partType === 'NEW' && styles.typeTextActive]}>
                    New Part Issue
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.typeOption, partType === 'EXCHANGE' && styles.typeOptionActive]}
                  onPress={() => setPartType('EXCHANGE')}
                >
                  <Ionicons
                    name={partType === 'EXCHANGE' ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={partType === 'EXCHANGE' ? '#2563eb' : '#64748b'}
                  />
                  <Text style={[styles.typeText, partType === 'EXCHANGE' && styles.typeTextActive]}>
                    Exchange (Return Old)
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Quick Part Suggestions */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Part Name / Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {COMMON_PARTS.map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.chip, partName === item && styles.chipActive]}
                    onPress={() => setPartName(item === 'Other' ? '' : item)}
                  >
                    <Text style={[styles.chipText, partName === item && styles.chipTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                style={styles.textInput}
                placeholder="Enter exact part name or requirement..."
                maxLength={100}
                value={partName}
                onChangeText={setPartName}
              />
            </View>

            {/* Quantity */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Quantity Required</Text>
              <View style={styles.quantityRow}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => {
                    const q = Math.max(1, (parseInt(quantity, 10) || 1) - 1);
                    setQuantity(String(q));
                  }}
                >
                  <Ionicons name="remove" size={18} color="#1e293b" />
                </Pressable>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="numeric"
                  maxLength={3}
                  value={quantity}
                  onChangeText={(txt) => setQuantity(txt.replace(/[^0-9]/g, ''))}
                />
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => {
                    const q = Math.min(100, (parseInt(quantity, 10) || 1) + 1);
                    setQuantity(String(q));
                  }}
                >
                  <Ionicons name="add" size={18} color="#1e293b" />
                </Pressable>
              </View>
            </View>

            {/* Voice Recording Card */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Voice Description (Hold or Tap to Record)</Text>
              <View style={styles.voiceCard}>
                {isRecording ? (
                  <View style={styles.recordingRow}>
                    <View style={styles.pulsingDot} />
                    <Text style={styles.recordingTime}>Recording... {formatSec(elapsedSec)}</Text>
                    <Pressable style={styles.stopBtn} onPress={stopRecording}>
                      <Ionicons name="stop" size={18} color="#ffffff" />
                      <Text style={styles.stopBtnText}>Done</Text>
                    </Pressable>
                    <Pressable style={styles.cancelVoiceBtn} onPress={cancelRecording}>
                      <Ionicons name="close" size={18} color="#dc2626" />
                    </Pressable>
                  </View>
                ) : voiceNote ? (
                  <View style={styles.recordedRow}>
                    <Ionicons name="mic-circle" size={28} color="#7c3aed" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.recordedTitle}>Voice Note Attached</Text>
                      <Text style={styles.recordedDuration}>{formatSec(voiceNote.durationSec)}</Text>
                    </View>
                    <Pressable style={styles.deleteVoiceBtn} onPress={clearVoiceNote}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.recordStartBtn} onPress={startRecording}>
                    <Ionicons name="mic" size={20} color="#2563eb" />
                    <Text style={styles.recordStartText}>Record Voice Request</Text>
                  </Pressable>
                )}
                {voiceError ? <Text style={styles.voiceErrorText}>{voiceError}</Text> : null}
              </View>
            </View>

            {/* Photo Proof */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Photo Evidence (Optional)</Text>
              {photo ? (
                <View style={styles.photoPreviewBox}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <Pressable style={styles.removePhotoBtn} onPress={() => setPhoto(null)}>
                    <Ionicons name="close-circle" size={24} color="#dc2626" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.photoActionsRow}>
                  <Pressable style={styles.photoBtn} onPress={takePhoto}>
                    <Ionicons name="camera" size={20} color="#2563eb" />
                    <Text style={styles.photoBtnText}>Take Photo</Text>
                  </Pressable>
                  <Pressable style={styles.photoBtn} onPress={pickFromGallery}>
                    <Ionicons name="images" size={20} color="#475569" />
                    <Text style={styles.photoBtnText}>Choose Gallery</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Description Text */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Additional Notes / Reason</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe why this part is needed, current issue, or location..."
                multiline
                numberOfLines={3}
                maxLength={1000}
                value={description}
                onChangeText={setDescription}
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
                  <Text style={styles.submitButtonText}>Submit Requisition</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: '60%',
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    gap: 16,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  dropdownTriggerText: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '500',
  },
  dropdownList: {
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  dropdownItemSelected: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#334155',
  },
  dropdownItemTextSelected: {
    color: '#2563eb',
    fontWeight: '600',
  },
  manualVehicleRow: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 4,
    paddingTop: 6,
  },
  manualVehicleInput: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
  },
  typeOptionActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  typeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  typeTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  chipsScroll: {
    marginBottom: 8,
  },
  chip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
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
    minHeight: 70,
    textAlignVertical: 'top',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  qtyInput: {
    flex: 1,
    height: 40,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  voiceCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
  },
  recordStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  recordStartText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#dc2626',
  },
  recordingTime: {
    flex: 1,
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 13,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stopBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  cancelVoiceBtn: {
    padding: 6,
  },
  recordedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  recordedDuration: {
    fontSize: 11,
    color: '#64748b',
  },
  deleteVoiceBtn: {
    padding: 8,
  },
  voiceErrorText: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  photoPreviewBox: {
    position: 'relative',
    width: 120,
    height: 90,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
