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
import type { MaintenanceRecordPublic } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../src/components/admin/AdminHeader';
import { FilterBar, type FilterOption } from '../../../src/components/admin/FilterBar';
import { EmptyState } from '../../../src/components/admin/EmptyState';
import { SkeletonList } from '../../../src/components/LoadingSystem';
import { radius, spacing } from '../../../src/theme';

const TYPE_FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'All Jobs' },
  { id: 'TYRE', label: 'Tyre Services' },
  { id: 'BATTERY', label: 'Battery Issues' },
];

export default function MaintenanceAdminScreen(): ReactElement {
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [jobType, setJobType] = useState<'TYRE' | 'BATTERY'>('TYRE');
  const [itemNumber, setItemNumber] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const maintenanceResource = useApiResource('admin:maintenance:list', () =>
    api.maintenance.list({ limit: 100 })
  );

  const statsResource = useApiResource('admin:maintenance:stats', () =>
    api.maintenance.stats().catch(() => null)
  );

  const records: MaintenanceRecordPublic[] = useMemo(() => {
    const raw = maintenanceResource.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }, [maintenanceResource.data]);

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
          r.itemNumber?.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [records, selectedType, searchQuery]);

  const handleCreateJob = async (): Promise<void> => {
    if (!itemNumber.trim()) {
      Alert.alert('Required', 'Please enter serial or item number.');
      return;
    }

    setSaving(true);
    try {
      await api.maintenance.create({
        vehicleNumber: vehicleNumber.trim() || undefined,
        type: jobType,
        itemNumber: itemNumber.trim(),
        cost: cost ? parseFloat(cost) : undefined,
        notes: notes.trim() || undefined,
      });
      setShowAddModal(false);
      setVehicleNumber('');
      setItemNumber('');
      setCost('');
      setNotes('');
      await maintenanceResource.reload();
      Alert.alert('Job Logged', 'Maintenance service recorded.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not record maintenance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="Vehicle Maintenance"
        subtitle={`${filteredRecords.length} service records`}
        showBack
        rightAction={
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={styles.addBtn}
            accessibilityLabel="Log Service"
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
          placeholder="Search by vehicle, item # or description..."
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
          options={TYPE_FILTERS}
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
            refreshing={maintenanceResource.loading && maintenanceResource.data !== null}
            onRefresh={() => {
              void maintenanceResource.reload();
              void statsResource.reload();
            }}
            tintColor="#0284C7"
          />
        }
        ListEmptyComponent={
          maintenanceResource.loading && maintenanceResource.data === null ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="construct-outline"
              title="No maintenance records"
              message="No service entries found."
              actionLabel="Refresh Records"
              onAction={() => maintenanceResource.reload()}
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
                  { backgroundColor: item.type === 'TYRE' ? '#FEF3C7' : '#E0F2FE' },
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    { color: item.type === 'TYRE' ? '#B45309' : '#0369A1' },
                  ]}
                >
                  {item.type}
                </Text>
              </View>
            </View>

            <Text style={styles.itemTitle}>Item / Serial #: {item.itemNumber}</Text>
            {item.notes && <Text style={styles.itemNotes}>{item.notes}</Text>}

            <View style={styles.cardFooter}>
              <Text style={styles.dateText}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              {item.cost != null && (
                <Text style={styles.costText}>₹{item.cost.toLocaleString()}</Text>
              )}
            </View>
          </View>
        )}
      />

      {/* Add Maintenance Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Log Maintenance Service</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Service Category</Text>
            <View style={styles.typeSelectorRow}>
              {(['TYRE', 'BATTERY'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.typeOption, jobType === t && styles.typeOptionActive]}
                  onPress={() => setJobType(t)}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      jobType === t && styles.typeOptionTextActive,
                    ]}
                  >
                    {t} Service
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

            <Text style={styles.inputLabel}>Serial / Item Number *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. TY-98234 or Exide-880"
              placeholderTextColor="#94A3B8"
              value={itemNumber}
              onChangeText={setItemNumber}
            />

            <Text style={styles.inputLabel}>Service Cost (₹)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 4500"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={cost}
              onChangeText={setCost}
            />

            <Text style={styles.inputLabel}>Technician Notes</Text>
            <TextInput
              style={[styles.textInput, { height: 60 }]}
              placeholder="e.g. Alignment, puncture, cell replacement..."
              placeholderTextColor="#94A3B8"
              multiline
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
                onPress={handleCreateJob}
                disabled={saving}
              >
                <Text style={styles.confirmBtnText}>
                  {saving ? 'Saving...' : 'Record Service'}
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
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: spacing.xs + 2,
  },
  itemNotes: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  costText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
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
