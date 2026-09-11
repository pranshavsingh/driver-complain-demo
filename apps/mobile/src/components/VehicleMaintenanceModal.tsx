import { useState, useMemo, useEffect, type ReactElement } from 'react';
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
import { PHOTO_QUALITY } from '../media/limits';
import { radius, spacing } from '../theme';

export type MaintenanceTab = 'TYRE' | 'BATTERY';

interface VehicleMaintenanceModalProps {
  visible: boolean;
  onClose: () => void;
  vehicles: VehiclePublic[];
  initialTab?: MaintenanceTab;
  onSuccess?: () => void;
}

export function VehicleMaintenanceModal({
  visible,
  onClose,
  vehicles,
  initialTab = 'TYRE',
  onSuccess,
}: VehicleMaintenanceModalProps): ReactElement {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<MaintenanceTab>(initialTab);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab === 'TYRE' || initialTab === 'BATTERY' ? initialTab : 'TYRE');
    }
  }, [visible, initialTab]);

  // Common Vehicle State
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    vehicles[0]?.id ?? null,
  );
  const [manualVehicle, setManualVehicle] = useState<string>(
    vehicles[0] ? describeVehicle(vehicles[0]) : '',
  );
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  // --- Tyre & Battery Form State ---
  const [itemNumber, setItemNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [brand, setBrand] = useState('');
  const [position, setPosition] = useState('');
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [maintenancePhoto, setMaintenancePhoto] = useState<api.FileToUpload | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  }, [selectedVehicleId, vehicles]);

  const activeVehicleName =
    manualVehicle.trim() || (selectedVehicle ? describeVehicle(selectedVehicle) : '');

  // Photo handlers for Tyre/Battery Proof
  const takeMaintenancePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Camera Permission',
        `Camera permission is required to capture photo of the new ${activeTab === 'TYRE' ? 'tyre' : 'battery'}.`,
      );
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setMaintenancePhoto({
        uri: asset.uri,
        name: asset.fileName ?? `${activeTab.toLowerCase()}_photo.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const pickMaintenancePhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setMaintenancePhoto({
        uri: asset.uri,
        name: asset.fileName ?? `${activeTab.toLowerCase()}_photo.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const showMaintenanceAttachmentMenu = () => {
    Alert.alert(
      `Photo of New ${activeTab === 'TYRE' ? 'Tyre' : 'Battery'}`,
      'Choose an option',
      [
        { text: '📷 Take Photo', onPress: takeMaintenancePhoto },
        { text: '🖼️ Choose from Gallery', onPress: pickMaintenancePhoto },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const resetAllForms = () => {
    setItemNumber('');
    setQuantity('1');
    setBrand('');
    setPosition('');
    setOdometer('');
    setCost('');
    setNotes('');
    setMaintenancePhoto(null);
  };

  const handleMaintenanceSubmit = async () => {
    if (!itemNumber.trim()) {
      Alert.alert(
        'Missing Information',
        `Please enter the ${activeTab === 'TYRE' ? 'Tyre Number / Serial' : 'Battery Number / Serial'}.`,
      );
      return;
    }

    const parsedQty = parseInt(quantity.trim(), 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid quantity (at least 1).');
      return;
    }

    if (!maintenancePhoto) {
      Alert.alert(
        'Photo Required',
        `Please attach a photo of the new ${activeTab === 'TYRE' ? 'tyre' : 'battery'} as proof.`,
      );
      return;
    }

    if (!activeVehicleName) {
      Alert.alert('Vehicle Required', 'Please select or enter a vehicle number.');
      return;
    }

    try {
      setSubmitting(true);
      await api.maintenance.create(
        {
          vehicleId: selectedVehicle?.id,
          vehicleNumber: activeVehicleName,
          type: activeTab === 'TYRE' ? 'TYRE' : 'BATTERY',
          itemNumber: itemNumber.trim(),
          quantity: parsedQty,
          odometerKm: odometer.trim() ? parseInt(odometer.trim(), 10) : undefined,
          brand: brand.trim() || undefined,
          position: activeTab === 'TYRE' && position.trim() ? position.trim() : undefined,
          cost: cost.trim() ? parseFloat(cost.trim()) : undefined,
          notes: notes.trim() || undefined,
        },
        maintenancePhoto ?? undefined,
      );

      Alert.alert(
        'Maintenance Logged 🎉',
        `New ${activeTab === 'TYRE' ? 'Tyre' : 'Battery'} entry recorded successfully!`,
        [
          {
            text: 'OK',
            onPress: () => {
              resetAllForms();
              onSuccess?.();
              onClose();
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert(
        'Submission Failed',
        err?.message || 'Could not log vehicle maintenance. Please try again.',
      );
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
            <Ionicons name="construct" size={22} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Vehicle Maintenance & Service</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close modal">
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Main 2-Tab Segment Selector: TYRE vs BATTERY */}
          <View style={styles.mainTabsContainer}>
            <Pressable
              style={[styles.mainTabBtn, activeTab === 'TYRE' && styles.mainTabBtnActiveTyre]}
              onPress={() => setActiveTab('TYRE')}
            >
              <Ionicons
                name="disc"
                size={16}
                color={activeTab === 'TYRE' ? '#FFFFFF' : '#475569'}
              />
              <Text style={[styles.mainTabText, activeTab === 'TYRE' && styles.mainTabTextActive]}>
                🛞 Tyre Replacement
              </Text>
            </Pressable>

            <Pressable
              style={[styles.mainTabBtn, activeTab === 'BATTERY' && styles.mainTabBtnActiveBattery]}
              onPress={() => setActiveTab('BATTERY')}
            >
              <Ionicons
                name="battery-charging"
                size={16}
                color={activeTab === 'BATTERY' ? '#FFFFFF' : '#475569'}
              />
              <Text
                style={[styles.mainTabText, activeTab === 'BATTERY' && styles.mainTabTextActive]}
              >
                🔋 Battery Replacement
              </Text>
            </Pressable>
          </View>

          {/* Vehicle Input Field (Common across all tabs) */}
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
                <Pressable
                  onPress={() => setShowVehicleDropdown(!showVehicleDropdown)}
                  style={{ padding: 4 }}
                >
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

          {/* Identification Number (Tyre No. or Battery Serial No.) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              {activeTab === 'TYRE'
                ? 'Tyre Number / Identification *'
                : 'Battery Number / Serial *'}
            </Text>
            <View style={styles.inputBox}>
              <Ionicons
                name={activeTab === 'TYRE' ? 'barcode-outline' : 'keypad-outline'}
                size={18}
                color="#075E54"
              />
              <TextInput
                style={styles.textInput}
                placeholder={
                  activeTab === 'TYRE'
                    ? 'Enter new tyre number (e.g. TYR-9842)'
                    : 'Enter battery serial number (e.g. BAT-2026-EX)'
                }
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                value={itemNumber}
                onChangeText={setItemNumber}
              />
            </View>
          </View>

          {/* Tyre Position (Only for Tyre Replacement) */}
          {activeTab === 'TYRE' ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Tyre Position — Optional</Text>
              <View style={styles.positionGrid}>
                {[
                  'Front Left',
                  'Front Right',
                  'Rear Left (Outer)',
                  'Rear Left (Inner)',
                  'Rear Right (Outer)',
                  'Rear Right (Inner)',
                  'Stepney / Spare',
                ].map((pos) => (
                  <Pressable
                    key={pos}
                    style={[
                      styles.positionChip,
                      position === pos && styles.positionChipSelected,
                    ]}
                    onPress={() => setPosition(position === pos ? '' : pos)}
                  >
                    <Text
                      style={[
                        styles.positionChipText,
                        position === pos && styles.positionChipTextSelected,
                      ]}
                    >
                      {pos}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Brand & Quantity Row */}
          <View style={styles.rowGroup}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Brand / Make — Optional</Text>
              <View style={styles.inputBox}>
                <Ionicons name="pricetag-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.textInput}
                  placeholder={activeTab === 'TYRE' ? 'MRF, Apollo...' : 'Exide, Amaron...'}
                  placeholderTextColor="#94A3B8"
                  value={brand}
                  onChangeText={setBrand}
                />
              </View>
            </View>

            <View style={[styles.fieldGroup, { width: 100 }]}>
              <Text style={styles.fieldLabel}>Qty *</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={[styles.textInput, { textAlign: 'center' }]}
                  placeholder="1"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>
            </View>
          </View>

          {/* Odometer & Cost Row */}
          <View style={styles.rowGroup}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Odometer (KM) — Optional</Text>
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

            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Total Cost (₹) — Optional</Text>
              <View style={styles.inputBox}>
                <Ionicons name="cash-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 18500"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={cost}
                  onChangeText={setCost}
                />
              </View>
            </View>
          </View>

          {/* Photo Proof of Installed Item (MANDATORY) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Photo of New {activeTab === 'TYRE' ? 'Tyre' : 'Battery'} * (Mandatory)
            </Text>
            {maintenancePhoto ? (
              <View style={styles.photoPreviewWrapper}>
                <Image
                  source={{ uri: maintenancePhoto.uri }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                />
                <Pressable
                  style={styles.removePhotoBtn}
                  onPress={() => setMaintenancePhoto(null)}
                  accessibilityLabel="Remove photo"
                >
                  <Ionicons name="trash" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.attachBtn}
                onPress={showMaintenanceAttachmentMenu}
              >
                <Ionicons name="camera-outline" size={22} color="#1D4ED8" />
                <Text style={styles.attachBtnText}>
                  Attach Photo of Installed {activeTab === 'TYRE' ? 'Tyre' : 'Battery'}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Notes Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Workshop / Notes — Optional</Text>
            <View
              style={[
                styles.inputBox,
                { height: 60, alignItems: 'flex-start', paddingTop: 8 },
              ]}
            >
              <TextInput
                style={[styles.textInput, { textAlignVertical: 'top' }]}
                placeholder="Workshop location, warranty serial, notes..."
                placeholderTextColor="#94A3B8"
                multiline
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>

          {/* Maintenance Submit Action Button */}
          <Pressable
            style={[
              styles.submitBtn,
              { backgroundColor: activeTab === 'TYRE' ? '#0284C7' : '#D97706' },
              submitting && styles.submitBtnDisabled,
            ]}
            onPress={handleMaintenanceSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>
                  Submit {activeTab === 'TYRE' ? 'Tyre' : 'Battery'} Replacement
                </Text>
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
    backgroundColor: '#0F172A', // Slate header
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
  mainTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  mainTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md - 2,
    gap: 5,
  },
  mainTabBtnActiveTyre: {
    backgroundColor: '#0284C7', // Blue for Tyre
  },
  mainTabBtnActiveBattery: {
    backgroundColor: '#D97706', // Amber for Battery
  },
  mainTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  mainTabTextActive: {
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
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  positionChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  positionChipSelected: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  positionChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  positionChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 8,
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  photoPreviewWrapper: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 180,
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
    backgroundColor: '#0F172A',
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
