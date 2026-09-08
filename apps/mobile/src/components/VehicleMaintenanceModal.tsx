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
import type { VehiclePublic, FuelType } from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { describeVehicle } from '../lib/format';
import { PHOTO_QUALITY } from '../media/limits';
import { radius, spacing } from '../theme';

export type MaintenanceTab = 'FUEL' | 'TYRE' | 'BATTERY';

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
  initialTab = 'FUEL',
  onSuccess,
}: VehicleMaintenanceModalProps): ReactElement {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<MaintenanceTab>(initialTab);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
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

  // --- Fuel / DEF Form State ---
  const [fuelType, setFuelType] = useState<FuelType>('FUEL');
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [fuelPrice, setFuelPrice] = useState('');
  const [fuelOdometer, setFuelOdometer] = useState('');
  const [fuelNotes, setFuelNotes] = useState('');
  const [fuelReceiptPhoto, setFuelReceiptPhoto] = useState<api.FileToUpload | null>(null);

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

  // Photo handlers for Fuel Receipt
  const takeFuelPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera Permission', 'Camera permission is required to capture fuel receipt.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setFuelReceiptPhoto({
        uri: asset.uri,
        name: asset.fileName ?? 'fuel_receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const pickFuelPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setFuelReceiptPhoto({
        uri: asset.uri,
        name: asset.fileName ?? 'fuel_receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const showFuelAttachmentMenu = () => {
    Alert.alert('Attach Fuel / DEF Receipt', 'Choose an option', [
      { text: '📷 Take Photo', onPress: takeFuelPhoto },
      { text: '🖼️ Choose from Gallery', onPress: pickFuelPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
    setFuelQuantity('');
    setFuelPrice('');
    setFuelOdometer('');
    setFuelNotes('');
    setFuelReceiptPhoto(null);

    setItemNumber('');
    setQuantity('1');
    setBrand('');
    setPosition('');
    setOdometer('');
    setCost('');
    setNotes('');
    setMaintenancePhoto(null);
  };

  const handleFuelSubmit = async () => {
    const parsedQty = parseFloat(fuelQuantity);
    const parsedPrice = parseFloat(fuelPrice);

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
          type: fuelType,
          quantityLtr: parsedQty,
          totalPrice: parsedPrice,
          odometerKm: fuelOdometer.trim() ? parseInt(fuelOdometer.trim(), 10) : undefined,
          notes: fuelNotes.trim() || undefined,
        },
        fuelReceiptPhoto ?? undefined,
      );

      Alert.alert(
        'Fuel Logged 🎉',
        `${fuelType === 'FUEL' ? 'Fuel' : 'DEF'} entry recorded successfully!`,
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
        err?.message || 'Could not log fuel entry. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
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
          {/* Main 3-Tab Segment Selector: FUEL/DEF vs TYRE vs BATTERY */}
          <View style={styles.mainTabsContainer}>
            <Pressable
              style={[styles.mainTabBtn, activeTab === 'FUEL' && styles.mainTabBtnActiveFuel]}
              onPress={() => setActiveTab('FUEL')}
            >
              <Ionicons
                name="water"
                size={16}
                color={activeTab === 'FUEL' ? '#FFFFFF' : '#475569'}
              />
              <Text style={[styles.mainTabText, activeTab === 'FUEL' && styles.mainTabTextActive]}>
                ⛽ Fuel / DEF
              </Text>
            </Pressable>

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
                🛞 Tyre
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
                🔋 Battery
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

          {/* ========================================================
              TAB 1: FUEL / DEF LOG SECTION
             ======================================================== */}
          {activeTab === 'FUEL' ? (
            <>
              {/* Segment Selector: FUEL vs DEF */}
              <View style={styles.subSegmentContainer}>
                <Pressable
                  style={[
                    styles.subSegmentBtn,
                    fuelType === 'FUEL' && styles.subSegmentBtnActiveFuel,
                  ]}
                  onPress={() => setFuelType('FUEL')}
                >
                  <Ionicons
                    name="flame"
                    size={16}
                    color={fuelType === 'FUEL' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.subSegmentText,
                      fuelType === 'FUEL' && styles.subSegmentTextActive,
                    ]}
                  >
                    Fuel (Diesel/Petrol) ⛽
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.subSegmentBtn,
                    fuelType === 'DEF' && styles.subSegmentBtnActiveDef,
                  ]}
                  onPress={() => setFuelType('DEF')}
                >
                  <Ionicons
                    name="water"
                    size={16}
                    color={fuelType === 'DEF' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.subSegmentText,
                      fuelType === 'DEF' && styles.subSegmentTextActive,
                    ]}
                  >
                    DEF (AdBlue) 💧
                  </Text>
                </Pressable>
              </View>

              {/* Quantity & Price Row */}
              <View style={styles.rowGroup}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Quantity (Litres) *</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="funnel-outline" size={18} color="#075E54" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 50.0"
                      placeholderTextColor="#94A3B8"
                      keyboardType="decimal-pad"
                      value={fuelQuantity}
                      onChangeText={setFuelQuantity}
                    />
                  </View>
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Total Price (₹) *</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="cash-outline" size={18} color="#075E54" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 4500"
                      placeholderTextColor="#94A3B8"
                      keyboardType="decimal-pad"
                      value={fuelPrice}
                      onChangeText={setFuelPrice}
                    />
                  </View>
                </View>
              </View>

              {/* Calculated Rate per Ltr Indicator */}
              {parseFloat(fuelQuantity) > 0 && parseFloat(fuelPrice) >= 0 ? (
                <View style={styles.rateBadge}>
                  <Ionicons name="calculator-outline" size={16} color="#0369A1" />
                  <Text style={styles.rateBadgeText}>
                    Calculated Rate:{' '}
                    <Text style={{ fontWeight: '800' }}>
                      ₹{(parseFloat(fuelPrice) / parseFloat(fuelQuantity)).toFixed(2)}
                    </Text>{' '}
                    / Litre
                  </Text>
                </View>
              ) : null}

              {/* Odometer Reading */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Odometer Reading (KM) — Optional</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="speedometer-outline" size={18} color="#64748B" />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 124500"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    value={fuelOdometer}
                    onChangeText={setFuelOdometer}
                  />
                </View>
              </View>

              {/* Bill / Receipt Attachment */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Bill / Receipt Photo — Optional</Text>
                {fuelReceiptPhoto ? (
                  <View style={styles.photoPreviewWrapper}>
                    <Image
                      source={{ uri: fuelReceiptPhoto.uri }}
                      style={styles.photoPreview}
                      resizeMode="cover"
                    />
                    <Pressable
                      style={styles.removePhotoBtn}
                      onPress={() => setFuelReceiptPhoto(null)}
                      accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="trash" size={18} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.attachBtn} onPress={showFuelAttachmentMenu}>
                    <Ionicons name="camera-outline" size={22} color="#075E54" />
                    <Text style={styles.attachBtnText}>Attach Fuel Receipt / Bill Photo</Text>
                  </Pressable>
                )}
              </View>

              {/* Notes Input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Notes / Fuel Station — Optional</Text>
                <View
                  style={[
                    styles.inputBox,
                    { height: 60, alignItems: 'flex-start', paddingTop: 8 },
                  ]}
                >
                  <TextInput
                    style={[styles.textInput, { textAlignVertical: 'top' }]}
                    placeholder="Pump station, card ref, remarks..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    value={fuelNotes}
                    onChangeText={setFuelNotes}
                  />
                </View>
              </View>

              {/* Fuel Submit Action Button */}
              <Pressable
                style={[
                  styles.submitBtn,
                  { backgroundColor: fuelType === 'FUEL' ? '#15803D' : '#0284C7' },
                  submitting && styles.submitBtnDisabled,
                ]}
                onPress={handleFuelSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>Submit {fuelType} Fill Entry</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : null}

          {/* ========================================================
              TAB 2 & 3: TYRE & BATTERY REPLACEMENT SECTIONS
             ======================================================== */}
          {activeTab === 'TYRE' || activeTab === 'BATTERY' ? (
            <>
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

              {/* Quantity & Brand Row */}
              <View style={styles.rowGroup}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Quantity (Units) *</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="layers-outline" size={18} color="#075E54" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="1"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      value={quantity}
                      onChangeText={setQuantity}
                    />
                  </View>
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Brand / Make — Optional</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="pricetag-outline" size={18} color="#075E54" />
                    <TextInput
                      style={styles.textInput}
                      placeholder={activeTab === 'TYRE' ? 'Apollo / MRF' : 'Exide / Amaron'}
                      placeholderTextColor="#94A3B8"
                      value={brand}
                      onChangeText={setBrand}
                    />
                  </View>
                </View>
              </View>

              {/* Position (for Tyre only) */}
              {activeTab === 'TYRE' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Tyre Position / Axle — Optional</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="compass-outline" size={18} color="#64748B" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Front Right / Rear Left Outer"
                      placeholderTextColor="#94A3B8"
                      value={position}
                      onChangeText={setPosition}
                    />
                  </View>
                </View>
              ) : null}

              {/* Photo of New Tyre / Battery Attachment */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Photo of New {activeTab === 'TYRE' ? 'Tyre' : 'Battery'} *
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
                  <Pressable style={styles.attachBtn} onPress={showMaintenanceAttachmentMenu}>
                    <Ionicons
                      name="camera"
                      size={24}
                      color={activeTab === 'TYRE' ? '#0284C7' : '#D97706'}
                    />
                    <Text style={styles.attachBtnText}>
                      Take / Attach Photo of New {activeTab === 'TYRE' ? 'Tyre' : 'Battery'}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Odometer & Cost Row */}
              <View style={styles.rowGroup}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Odometer (KM) — Optional</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="speedometer-outline" size={18} color="#64748B" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 142000"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      value={odometer}
                      onChangeText={setOdometer}
                    />
                  </View>
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Cost (₹) — Optional</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="cash-outline" size={18} color="#64748B" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 8500"
                      placeholderTextColor="#94A3B8"
                      keyboardType="decimal-pad"
                      value={cost}
                      onChangeText={setCost}
                    />
                  </View>
                </View>
              </View>

              {/* Notes / Workshop Details */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Notes / Vendor Name — Optional</Text>
                <View
                  style={[
                    styles.inputBox,
                    { height: 60, alignItems: 'flex-start', paddingTop: 8 },
                  ]}
                >
                  <TextInput
                    style={[styles.textInput, { textAlignVertical: 'top' }]}
                    placeholder="Workshop location, warranty details, invoice ref..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    value={notes}
                    onChangeText={setNotes}
                  />
                </View>
              </View>

              {/* Maintenance Submit Button */}
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
            </>
          ) : null}
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
  mainTabBtnActiveFuel: {
    backgroundColor: '#15803D', // Green for Fuel
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
  subSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  subSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.md - 3,
    gap: 6,
  },
  subSegmentBtnActiveFuel: {
    backgroundColor: '#15803D',
  },
  subSegmentBtnActiveDef: {
    backgroundColor: '#0284C7',
  },
  subSegmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  subSegmentTextActive: {
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
