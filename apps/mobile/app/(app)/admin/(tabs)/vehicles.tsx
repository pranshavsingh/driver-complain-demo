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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { VehiclePublic } from '@driver-complaint/shared-types';
import * as api from '../../../../src/api/endpoints';
import { useAuth } from '../../../../src/auth/AuthContext';
import { useApiResource } from '../../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../../src/components/admin/AdminHeader';
import { FilterBar, type FilterOption } from '../../../../src/components/admin/FilterBar';
import { StatusBadge } from '../../../../src/components/admin/StatusBadge';
import { EmptyState } from '../../../../src/components/admin/EmptyState';
import { SkeletonList } from '../../../../src/components/LoadingSystem';
import { canManageVehicles } from '../../../../src/auth/permissions';
import { radius, spacing } from '../../../../src/theme';

const STATUS_FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'All Fleet' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'MAINTENANCE', label: 'In Maintenance' },
  { id: 'DECOMMISSIONED', label: 'Decommissioned' },
];

export default function VehiclesPage(): ReactElement {
  const { user } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [plateNumber, setPlateNumber] = useState('');
  const [model, setModel] = useState('');
  const [make, setMake] = useState('');
  const [wheels, setWheels] = useState('10 Wheeler');
  const [saving, setSaving] = useState(false);

  const canManage = canManageVehicles(user);

  const vehiclesResource = useApiResource('admin:vehicles:list', () =>
    api.vehicles.list()
  );

  const filteredVehicles = useMemo(() => {
    let list: VehiclePublic[] = vehiclesResource.data ?? [];

    if (selectedStatus !== 'ALL') {
      list = list.filter((v) => (v.agreementStatus || 'ACTIVE') === selectedStatus);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.plateNumber.toLowerCase().includes(q) ||
          v.model?.toLowerCase().includes(q) ||
          v.make?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [vehiclesResource.data, selectedStatus, searchQuery]);

  const handleAddVehicle = async (): Promise<void> => {
    if (!plateNumber.trim()) {
      Alert.alert('Required', 'Please enter a valid license plate number.');
      return;
    }

    setSaving(true);
    try {
      await api.vehicles.create({
        plateNumber: plateNumber.trim().toUpperCase(),
        model: model.trim() || undefined,
        make: make.trim() || undefined,
        wheels: wheels || undefined,
      });
      setShowAddModal(false);
      setPlateNumber('');
      setModel('');
      setMake('');
      await vehiclesResource.reload();
      Alert.alert('Vehicle Added', 'The fleet unit has been registered.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not register vehicle.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="Fleet Vehicles"
        subtitle={`${filteredVehicles.length} registered units`}
        rightAction={
          canManage ? (
            <Pressable
              onPress={() => setShowAddModal(true)}
              style={styles.addBtn}
              accessibilityLabel="Add Vehicle"
            >
              <Ionicons name="add-circle" size={26} color="#0284C7" />
            </Pressable>
          ) : undefined
        }
      />

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by plate, make, or model..."
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

      {/* Status Filters */}
      <View style={styles.filterWrap}>
        <FilterBar
          options={STATUS_FILTERS}
          selectedId={selectedStatus}
          onSelect={setSelectedStatus}
        />
      </View>

      {/* Vehicle List */}
      <FlatList
        data={filteredVehicles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={vehiclesResource.loading && vehiclesResource.data !== null}
            onRefresh={() => vehiclesResource.reload()}
            tintColor="#0284C7"
          />
        }
        ListEmptyComponent={
          vehiclesResource.loading && vehiclesResource.data === null ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="bus-outline"
              title="No vehicles found"
              message="No fleet vehicles match the active filters."
              actionLabel="Refresh Fleet"
              onAction={() => vehiclesResource.reload()}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(app)/admin/vehicle/${item.id}`)}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.plateBadge}>
                <Ionicons name="bus" size={18} color="#0F172A" />
                <Text style={styles.plateText}>{item.plateNumber}</Text>
              </View>
              <StatusBadge status={item.agreementStatus || 'ACTIVE'} />
            </View>

            <View style={styles.detailsRow}>
              <Text style={styles.modelText}>
                {item.make ? `${item.make} ` : ''}{item.model || 'Commercial Fleet Unit'}
              </Text>
              {item.wheels && (
                <View style={styles.wheelTag}>
                  <Text style={styles.wheelTagText}>{item.wheels}</Text>
                </View>
              )}
            </View>

            <View style={styles.footerRow}>
              <Text style={styles.statusSub}>
                Agreement: <Text style={{ fontWeight: '700' }}>{item.agreementStatus || 'ACTIVE'}</Text>
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </View>
          </Pressable>
        )}
      />

      {/* Add Vehicle Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Register New Fleet Unit</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>License Plate Number *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. MH12AB1234"
              placeholderTextColor="#94A3B8"
              value={plateNumber}
              onChangeText={setPlateNumber}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Make / Manufacturer</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Tata, BharatBenz, Ashok Leyland"
              placeholderTextColor="#94A3B8"
              value={make}
              onChangeText={setMake}
            />

            <Text style={styles.inputLabel}>Model / Fleet Type</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Prima 2830, Signa"
              placeholderTextColor="#94A3B8"
              value={model}
              onChangeText={setModel}
            />

            <Text style={styles.inputLabel}>Axle / Wheels</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 10 Wheeler, 12 Wheeler, Trailer"
              placeholderTextColor="#94A3B8"
              value={wheels}
              onChangeText={setWheels}
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
                onPress={handleAddVehicle}
                disabled={saving}
              >
                <Text style={styles.confirmBtnText}>
                  {saving ? 'Saving...' : 'Register Vehicle'}
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
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  filterWrap: {
    backgroundColor: '#F8FAFC',
  },
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
    borderColor: '#CBD5E1',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  plateText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs + 2,
  },
  modelText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  wheelTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  wheelTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369A1',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statusSub: {
    fontSize: 11,
    color: '#64748B',
  },
  centerLoading: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
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
    marginBottom: spacing.md,
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
  cancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  confirmBtn: {
    backgroundColor: '#0284C7',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
