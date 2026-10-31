import { useMemo, useState, type ReactElement } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FuelRecordPublic } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../src/components/admin/AdminHeader';
import { FilterBar, type FilterOption } from '../../../src/components/admin/FilterBar';
import { EmptyState } from '../../../src/components/admin/EmptyState';
import { SkeletonList } from '../../../src/components/LoadingSystem';
import { radius, spacing } from '../../../src/theme';

const FUEL_FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'All Fuel Records' },
  { id: 'FUEL', label: 'Diesel' },
  { id: 'DEF', label: 'DEF / AdBlue' },
];

export default function FuelLogsAdminScreen(): ReactElement {
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [fuelType, setFuelType] = useState<'FUEL' | 'DEF'>('FUEL');
  const [quantityLtr, setQuantityLtr] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fuelResource = useApiResource('admin:fuel:list', () =>
    api.fuel.list({ limit: 100 })
  );

  const records: FuelRecordPublic[] = useMemo(() => {
    const raw = fuelResource.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }, [fuelResource.data]);

  const filteredRecords = useMemo(() => {
    let list = records;

    if (selectedType !== 'ALL') {
      list = list.filter((r) => r.type === selectedType);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.vehicle?.plateNumber?.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [records, selectedType, searchQuery]);

  const handleAddFuel = async (): Promise<void> => {
    if (!quantityLtr.trim() || isNaN(parseFloat(quantityLtr))) {
      Alert.alert('Required', 'Please enter a valid quantity in litres.');
      return;
    }

    setSaving(true);
    try {
      await api.fuel.create({
        vehicleNumber: vehicleNumber.trim() || undefined,
        type: fuelType,
        quantityLtr: parseFloat(quantityLtr),
        totalPrice: totalPrice ? parseFloat(totalPrice) : undefined,
        odometerKm: odometerKm ? parseFloat(odometerKm) : undefined,
        notes: notes.trim() || undefined,
      });
      setShowAddModal(false);
      setVehicleNumber('');
      setQuantityLtr('');
      setTotalPrice('');
      setOdometerKm('');
      setNotes('');
      await fuelResource.reload();
      Alert.alert('Log Added', `${fuelType} record created.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not record fuel entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="Fuel & DEF Logs"
        subtitle={`${filteredRecords.length} consumption logs`}
        showBack
        rightAction={
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={styles.addBtn}
            accessibilityLabel="Log Fuel"
          >
            <Ionicons name="add-circle" size={26} color="#0284C7" />
          </Pressable>
        }
      />

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by vehicle or notes..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterWrap}>
        <FilterBar
          options={FUEL_FILTERS}
          selectedId={selectedType}
          onSelect={setSelectedType}
        />
      </View>

      {/* List */}
      <FlatList
        data={filteredRecords}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={fuelResource.loading && fuelResource.data !== null}
            onRefresh={() => fuelResource.reload()}
            tintColor="#0284C7"
          />
        }
        ListEmptyComponent={
          fuelResource.loading && fuelResource.data === null ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="water-outline"
              title="No fuel entries found"
              message="No consumption records match filters."
              actionLabel="Refresh Logs"
              onAction={() => fuelResource.reload()}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.plateTag}>
                <Ionicons name="bus" size={16} color="#0F172A" />
                <Text style={styles.plateText}>{item.vehicle?.plateNumber || 'Unassigned Fleet'}</Text>
              </View>
              <View
                style={[
                  styles.typePill,
                  { backgroundColor: item.type === 'FUEL' ? '#FEF3C7' : '#E0F2FE' },
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    { color: item.type === 'FUEL' ? '#B45309' : '#0369A1' },
                  ]}
                >
                  {item.type === 'FUEL' ? 'DIESEL' : 'DEF'}
                </Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Quantity</Text>
                <Text style={styles.metricVal}>{item.quantityLtr} Ltr</Text>
              </View>

              {item.totalPrice != null && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Total Amount</Text>
                  <Text style={styles.metricVal}>₹{item.totalPrice.toLocaleString()}</Text>
                </View>
              )}

              {item.odometerKm != null && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Odometer</Text>
                  <Text style={styles.metricVal}>{item.odometerKm} Km</Text>
                </View>
              )}
            </View>

            {item.notes && <Text style={styles.notesText}>{item.notes}</Text>}

            <View style={styles.cardFooter}>
              <Text style={styles.dateText}>
                {new Date(item.createdAt).toLocaleDateString()} at{' '}
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Add Fuel Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Log Fuel / DEF Slip</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Fuel Category</Text>
            <View style={styles.typeSelectorRow}>
              {(['FUEL', 'DEF'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.typeOption, fuelType === t && styles.typeOptionActive]}
                  onPress={() => setFuelType(t)}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      fuelType === t && styles.typeOptionTextActive,
                    ]}
                  >
                    {t === 'FUEL' ? 'Diesel Fuel' : 'DEF / AdBlue'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Vehicle Plate Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. MH12AB1234"
              placeholderTextColor="#94A3B8"
              value={vehicleNumber}
              onChangeText={setVehicleNumber}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Quantity (Litres) *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 150"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={quantityLtr}
              onChangeText={setQuantityLtr}
            />

            <Text style={styles.inputLabel}>Total Cost (₹)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 13500"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={totalPrice}
              onChangeText={setTotalPrice}
            />

            <Text style={styles.inputLabel}>Odometer Reading (Km)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 74520"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={odometerKm}
              onChangeText={setOdometerKm}
            />

            <Text style={styles.inputLabel}>Remarks / Bunk Station</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. IOCL Pump Jaipur Bypass"
              placeholderTextColor="#94A3B8"
              value={notes}
              onChangeText={setNotes}
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setShowAddModal(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleAddFuel}
                disabled={saving}
              >
                <Text style={styles.confirmBtnText}>
                  {saving ? 'Saving...' : 'Save Record'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  addBtn: { padding: spacing.xs },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: spacing.xs,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A' },
  filterWrap: { backgroundColor: '#F8FAFC' },
  listContent: {
    padding: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  plateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  metricItem: {},
  metricLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  notesText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: spacing.xs + 2,
  },
  cardFooter: {
    marginTop: spacing.xs + 4,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  centerLoading: { padding: spacing.xl, alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#64748B' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 380,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: spacing.xs + 2,
    marginBottom: 4,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 4,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  typeOptionActive: {
    backgroundColor: '#0F172A',
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  typeOptionTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    height: 40,
    fontSize: 13,
    color: '#0F172A',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  cancelBtn: { backgroundColor: '#F1F5F9' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  confirmBtn: { backgroundColor: '#0284C7' },
  confirmBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
});
