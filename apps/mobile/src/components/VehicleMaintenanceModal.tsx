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

  // --- Mandatory Form Fields Only ---
  const [itemNumber, setItemNumber] = useState(''); // New tyre / battery number
  const [oldItemNumber, setOldItemNumber] = useState(''); // Old tyre / battery number (replaced with this)
  const [quantity, setQuantity] = useState('1'); // Qty
  const [maintenancePhoto, setMaintenancePhoto] = useState<api.FileToUpload | null>(null); // Photo proof

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
    setOldItemNumber('');
    setQuantity('1');
    setMaintenancePhoto(null);
  };

  const handleMaintenanceSubmit = async () => {
    if (!activeVehicleName) {
      Alert.alert('Vehicle Required', 'Please select or enter a vehicle number.');
      return;
    }

    if (!itemNumber.trim()) {
      Alert.alert(
        'Missing New ' + (activeTab === 'TYRE' ? 'Tyre' : 'Battery') + ' Number',
        `Please enter the ${activeTab === 'TYRE' ? 'New Tyre Number' : 'New Battery Number / Serial'}.`,
      );
      return;
    }

    if (!oldItemNumber.trim()) {
      Alert.alert(
        'Missing Old ' + (activeTab === 'TYRE' ? 'Tyre' : 'Battery') + ' Number',
        `Please enter the ${activeTab === 'TYRE' ? 'Old Tyre Number (replaced with this)' : 'Old Battery Number (replaced with this)'}.`,
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
        'Photo Mandatory',
        `Please attach a clear photo of the new ${activeTab === 'TYRE' ? 'tyre' : 'battery'} as proof.`,
      );
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
          oldItemNumber: oldItemNumber.trim(),
          quantity: parsedQty,
          notes: `Old ${activeTab === 'TYRE' ? 'Tyre' : 'Battery'}: ${oldItemNumber.trim()}`,
        },
        maintenancePhoto,
      );

      Alert.alert(
        'Replacement Recorded 🎉',
        `${activeTab === 'TYRE' ? 'Tyre' : 'Battery'} replacement successfully submitted!`,
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

  const isTyre = activeTab === 'TYRE';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Modal Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
          <View style={styles.headerTitleRow}>
            <Ionicons name={isTyre ? 'disc' : 'battery-charging'} size={22} color="#FFFFFF" />
            <Text style={styles.headerTitle}>
              {isTyre ? 'Tyre Replacement' : 'Battery Replacement'}
            </Text>
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

          {/* 1. Vehicle Input Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Vehicle Number <Text style={styles.requiredStar}>*</Text>
            </Text>
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

          {/* 2. New Tyre / Battery Number */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              {isTyre ? 'New Tyre Number' : 'New Battery Number / Serial'}{' '}
              <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputBox}>
              <Ionicons
                name={isTyre ? 'barcode-outline' : 'keypad-outline'}
                size={18}
                color={isTyre ? '#0284C7' : '#D97706'}
              />
              <TextInput
                style={styles.textInput}
                placeholder={
                  isTyre
                    ? 'Enter new tyre number (e.g. TYR-9842)'
                    : 'Enter new battery serial number'
                }
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                value={itemNumber}
                onChangeText={setItemNumber}
              />
            </View>
          </View>

          {/* 3. Old Tyre / Battery Number (Replaced with this) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              {isTyre
                ? 'Old Tyre Number (replaced with this)'
                : 'Old Battery Number (replaced with this)'}{' '}
              <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="repeat-outline"
                size={18}
                color="#64748B"
              />
              <TextInput
                style={styles.textInput}
                placeholder={
                  isTyre
                    ? 'Enter old tyre number being replaced'
                    : 'Enter old battery number being replaced'
                }
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                value={oldItemNumber}
                onChangeText={setOldItemNumber}
              />
            </View>
          </View>

          {/* 4. Quantity Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Quantity (Qty) <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={[styles.inputBox, { width: 140 }]}>
              <Ionicons name="calculator-outline" size={18} color="#64748B" />
              <TextInput
                style={[styles.textInput, { textAlign: 'center', fontWeight: '700' }]}
                placeholder="1"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                value={quantity}
                onChangeText={setQuantity}
              />
            </View>
          </View>

          {/* 5. Photo Proof of New Item (MANDATORY) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Photo of New {isTyre ? 'Tyre' : 'Battery'} <Text style={styles.requiredStar}>*</Text>
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
                <Ionicons
                  name="camera"
                  size={22}
                  color={isTyre ? '#0284C7' : '#D97706'}
                />
                <Text
                  style={[
                    styles.attachBtnText,
                    { color: isTyre ? '#0284C7' : '#D97706' },
                  ]}
                >
                  📷 Attach Photo of Installed New {isTyre ? 'Tyre' : 'Battery'}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Submit Action Button */}
          <Pressable
            style={[
              styles.submitBtn,
              { backgroundColor: isTyre ? '#0284C7' : '#D97706' },
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
                  Submit {isTyre ? 'Tyre' : 'Battery'} Replacement
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
    backgroundColor: '#0F172A',
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
    gap: spacing.lg,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  requiredStar: {
    color: '#DC2626',
    fontWeight: '800',
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
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.md + 2,
    gap: 8,
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  photoPreviewWrapper: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 190,
    borderRadius: radius.md,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    gap: 8,
    marginTop: spacing.xs,
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
