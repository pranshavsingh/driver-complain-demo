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
import type { VehiclePublic, FuelType } from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { describeVehicle } from '../lib/format';
import { PHOTO_QUALITY } from '../media/limits';
import { radius, spacing } from '../theme';

interface TakeFuelModalProps {
  visible: boolean;
  onClose: () => void;
  vehicles: VehiclePublic[];
  onSuccess?: () => void;
}

export function TakeFuelModal({ visible, onClose, vehicles, onSuccess }: TakeFuelModalProps): ReactElement {
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<FuelType>('FUEL');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(vehicles[0]?.id ?? null);
  const [manualVehicle, setManualVehicle] = useState<string>(
    vehicles[0] ? describeVehicle(vehicles[0]) : '',
  );
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');

  const [receiptPhoto, setReceiptPhoto] = useState<api.FileToUpload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  }, [selectedVehicleId, vehicles]);

  const activeVehicleName = manualVehicle.trim() || (selectedVehicle ? describeVehicle(selectedVehicle) : '');

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to take receipt photos.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setReceiptPhoto({
        uri: asset.uri,
        name: asset.fileName ?? 'receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setReceiptPhoto({
        uri: asset.uri,
        name: asset.fileName ?? 'receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const showAttachmentMenu = () => {
    Alert.alert('Attach Bill / Receipt', 'Choose option', [
      { text: '📷 Take Photo', onPress: takePhoto },
      { text: '🖼️ Choose from Gallery', onPress: pickPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const resetForm = () => {
    setQuantity('');
    setPrice('');
    setOdometer('');
    setNotes('');
    setReceiptPhoto(null);
  };

  const handleSubmit = async () => {
    const parsedQty = parseFloat(quantity);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid fuel/DEF quantity in Litres.');
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid total price amount.');
      return;
    }

    if (!activeVehicleName) {
      Alert.alert('Vehicle Required', 'Please enter or select a vehicle number.');
      return;
    }

    try {
      setSubmitting(true);
      await api.fuel.create(
        {
          vehicleId: selectedVehicle?.id,
          vehicleNumber: activeVehicleName,
          type,
          quantityLtr: parsedQty,
          totalPrice: parsedPrice,
          odometerKm: odometer.trim() ? parseInt(odometer.trim(), 10) : undefined,
          notes: notes.trim() || undefined,
        },
        receiptPhoto ?? undefined,
      );

      Alert.alert('Success 🎉', `${type === 'FUEL' ? 'Fuel' : 'DEF'} entry logged successfully!`, [
        {
          text: 'OK',
          onPress: () => {
            resetForm();
            onSuccess?.();
            onClose();
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Submission Failed', err?.message || 'Could not log fuel entry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Modal Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="water" size={22} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Take Fuel / DEF Log</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Segment Selector: FUEL vs DEF */}
          <View style={styles.segmentContainer}>
            <Pressable
              style={[styles.segmentBtn, type === 'FUEL' && styles.segmentBtnActive]}
              onPress={() => setType('FUEL')}
            >
              <Ionicons name="flame" size={18} color={type === 'FUEL' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.segmentText, type === 'FUEL' && styles.segmentTextActive]}>
                Fuel ⛽
              </Text>
            </Pressable>

            <Pressable
              style={[styles.segmentBtn, type === 'DEF' && styles.segmentBtnActiveDef]}
              onPress={() => setType('DEF')}
            >
              <Ionicons name="water" size={18} color={type === 'DEF' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.segmentText, type === 'DEF' && styles.segmentTextActive]}>
                DEF 💧
              </Text>
            </Pressable>
          </View>

          {/* Vehicle Input Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Vehicle Number (Auto-selected)</Text>
            <View style={styles.inputBox}>
              <Ionicons name="bus-outline" size={20} color="#075E54" />
              <TextInput
                style={styles.textInput}
                placeholder="Vehicle number"
                placeholderTextColor="#94A3B8"
                value={manualVehicle || (selectedVehicle ? describeVehicle(selectedVehicle) : '')}
                onChangeText={(val) => {
                  setManualVehicle(val);
                  setShowVehicleDropdown(true);
                }}
                onFocus={() => setShowVehicleDropdown(true)}
              />
              {vehicles.length > 0 ? (
                <Pressable onPress={() => setShowVehicleDropdown(!showVehicleDropdown)} style={{ padding: 4 }}>
                  <Ionicons name="chevron-down" size={18} color="#64748B" />
                </Pressable>
              ) : null}
            </View>

            {/* Vehicles Dropdown */}
            {showVehicleDropdown && vehicles.length > 0 ? (
              <View style={styles.dropdownMenu}>
                <Text style={styles.dropdownHeader}>Assigned Vehicles:</Text>
                {vehicles.map((v) => (
                  <Pressable
                    key={v.id}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedVehicleId(v.id);
                      setManualVehicle(describeVehicle(v));
                      setShowVehicleDropdown(false);
                    }}
                  >
                    <Ionicons name="car" size={16} color="#075E54" />
                    <Text style={styles.dropdownItemText}>{describeVehicle(v)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Quantity & Price Row */}
          <View style={styles.rowGroup}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Quantity (Litres) *</Text>
              <View style={styles.inputBox}>
                <Ionicons name="funnel-outline" size={18} color="#075E54" />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 4.7"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>
            </View>

            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Total Price (₹) *</Text>
              <View style={styles.inputBox}>
                <Ionicons name="cash-outline" size={18} color="#075E54" />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 450"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={price}
                  onChangeText={setPrice}
                />
              </View>
            </View>
          </View>

          {/* Calculated Rate per Ltr Indicator */}
          {parseFloat(quantity) > 0 && parseFloat(price) >= 0 ? (
            <View style={styles.rateBadge}>
              <Ionicons name="calculator-outline" size={16} color="#0369A1" />
              <Text style={styles.rateBadgeText}>
                Rate: <Text style={{ fontWeight: '800' }}>₹{(parseFloat(price) / parseFloat(quantity)).toFixed(2)}</Text> / Litre
              </Text>
            </View>
          ) : null}

          {/* Odometer Reading (Optional) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Odometer Reading (KM) — Optional</Text>
            <View style={styles.inputBox}>
              <Ionicons name="speedometer-outline" size={18} color="#64748B" />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 124500"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                value={odometer}
                onChangeText={setOdometer}
              />
            </View>
          </View>

          {/* Bill / Receipt Attachment */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Bill / Receipt Photo — Optional</Text>
            {receiptPhoto ? (
              <View style={styles.photoPreviewWrapper}>
                <Image source={{ uri: receiptPhoto.uri }} style={styles.photoPreview} resizeMode="cover" />
                <Pressable style={styles.removePhotoBtn} onPress={() => setReceiptPhoto(null)}>
                  <Ionicons name="trash" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.attachBtn} onPress={showAttachmentMenu}>
                <Ionicons name="camera-outline" size={22} color="#075E54" />
                <Text style={styles.attachBtnText}>Attach Fuel Receipt / Bill Photo</Text>
              </Pressable>
            )}
          </View>

          {/* Notes Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Notes / Station Name — Optional</Text>
            <View style={[styles.inputBox, { height: 60, alignItems: 'flex-start', paddingTop: 8 }]}>
              <TextInput
                style={[styles.textInput, { textAlignVertical: 'top' }]}
                placeholder="Fuel station, card ref, remarks..."
                placeholderTextColor="#94A3B8"
                multiline
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>

          {/* Submit Action Button */}
          <Pressable
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>Submit {type} Fill Entry</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: '#075E54',
    elevation: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md - 2,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#15803D', // Green for Fuel
  },
  segmentBtnActiveDef: {
    backgroundColor: '#0284C7', // Blue for DEF
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  fieldGroup: {
    gap: 6,
  },
  rowGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: spacing.xs,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    elevation: 3,
  },
  dropdownHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 8,
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#0F172A',
  },
  rateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    gap: 6,
  },
  rateBadgeText: {
    fontSize: 13,
    color: '#0369A1',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#075E54',
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 8,
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#075E54',
  },
  photoPreviewWrapper: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#075E54',
    paddingVertical: 14,
    borderRadius: radius.md,
    gap: 8,
    marginTop: spacing.sm,
    elevation: 2,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
