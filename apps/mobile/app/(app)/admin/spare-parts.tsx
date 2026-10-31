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
import * as api from '../../../src/api/endpoints';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../src/components/admin/AdminHeader';
import { FilterBar, type FilterOption } from '../../../src/components/admin/FilterBar';
import { EmptyState } from '../../../src/components/admin/EmptyState';
import { SkeletonList } from '../../../src/components/LoadingSystem';
import { radius, spacing } from '../../../src/theme';

const REQ_FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'All Requests' },
  { id: 'PENDING', label: 'Pending Approval' },
  { id: 'ISSUED', label: 'Issued' },
  { id: 'REJECTED', label: 'Rejected' },
];

export default function SparePartsAdminScreen(): ReactElement {
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [actionType, setActionType] = useState<'ISSUE' | 'REJECT'>('ISSUE');
  const [remarks, setRemarks] = useState('');

  const partsResource = useApiResource('admin:spare-parts:list', () =>
    api.spareParts.list({ limit: 100 })
  );

  const requests = useMemo(() => {
    const raw = partsResource.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }, [partsResource.data]);

  const filtered = useMemo(() => {
    let list = requests;

    if (selectedStatus !== 'ALL') {
      list = list.filter((r) => r.status === selectedStatus);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.partName?.toLowerCase().includes(q) ||
          r.vehicleNumber?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [requests, selectedStatus, searchQuery]);

  const handleProcessAction = async (): Promise<void> => {
    if (!selectedRequest) return;
    setUpdating(true);
    try {
      if (actionType === 'ISSUE') {
        await api.spareParts.approveAndIssue(selectedRequest.id, {
          issuedQuantity: selectedRequest.quantity,
          remarks: remarks.trim() || undefined,
        });
        Alert.alert('Approved & Issued', 'Parts have been marked as issued from store.');
      } else {
        await api.spareParts.reject(selectedRequest.id, {
          reason: remarks.trim() || 'Request declined by operations.',
        });
        Alert.alert('Request Rejected', 'The requisition has been declined.');
      }
      setSelectedRequest(null);
      setRemarks('');
      await partsResource.reload();
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Could not process request.');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { bg: '#FEF3C7', color: '#B45309', label: 'Pending' };
      case 'ISSUED':
      case 'APPROVED':
        return { bg: '#DCFCE7', color: '#15803D', label: 'Issued' };
      case 'REJECTED':
        return { bg: '#FEE2E2', color: '#B91C1C', label: 'Rejected' };
      default:
        return { bg: '#F1F5F9', color: '#475569', label: status };
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="Spare Parts Requisitions"
        subtitle={`${filtered.length} inventory requests`}
        showBack
      />

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by part name or vehicle..."
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

      {/* Status Filter Bar */}
      <View style={styles.filterWrap}>
        <FilterBar
          options={REQ_FILTERS}
          selectedId={selectedStatus}
          onSelect={setSelectedStatus}
        />
      </View>

      {/* Request List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={partsResource.loading && partsResource.data !== null}
            onRefresh={() => partsResource.reload()}
            tintColor="#0284C7"
          />
        }
        ListEmptyComponent={
          partsResource.loading && partsResource.data === null ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="cog-outline"
              title="No parts requisitions"
              message="No requisitions match the current filters."
              actionLabel="Refresh List"
              onAction={() => partsResource.reload()}
            />
          )
        }
        renderItem={({ item }) => {
          const badge = getStatusBadge(item.status);
          const isPending = item.status === 'PENDING';

          return (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.partName}>{item.partName}</Text>
                  <Text style={styles.vehicleSub}>
                    {item.vehicleNumber ? `🚛 ${item.vehicleNumber}` : 'Fleet Unit'} • Qty: {item.quantity ?? 1}
                  </Text>
                </View>
                <View style={[styles.badgePill, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>

              {item.description && (
                <Text style={styles.descText}>{item.description}</Text>
              )}

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>

                {isPending && (
                  <View style={styles.actionBtnRow}>
                    <Pressable
                      style={[styles.smallBtn, { backgroundColor: '#FEE2E2' }]}
                      onPress={() => {
                        setSelectedRequest(item);
                        setActionType('REJECT');
                      }}
                    >
                      <Text style={[styles.smallBtnText, { color: '#B91C1C' }]}>Reject</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.smallBtn, { backgroundColor: '#DCFCE7' }]}
                      onPress={() => {
                        setSelectedRequest(item);
                        setActionType('ISSUE');
                      }}
                    >
                      <Text style={[styles.smallBtnText, { color: '#15803D' }]}>Issue</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Action Approval / Reject Modal */}
      <Modal visible={!!selectedRequest} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {actionType === 'ISSUE' ? 'Approve & Issue Part' : 'Reject Requisition'}
            </Text>
            <Text style={styles.modalSub}>
              {selectedRequest?.partName} (Qty: {selectedRequest?.quantity ?? 1}) for{' '}
              {selectedRequest?.vehicleNumber || 'Vehicle'}
            </Text>

            <Text style={styles.inputLabel}>
              {actionType === 'ISSUE' ? 'Store Bin / Issue Remarks' : 'Reason for Rejection *'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                actionType === 'ISSUE'
                  ? 'e.g. Issued from Bay 4 Central Store'
                  : 'e.g. Part already replaced recently'
              }
              placeholderTextColor="#94A3B8"
              value={remarks}
              onChangeText={setRemarks}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setSelectedRequest(null)}
                disabled={updating}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalBtn,
                  actionType === 'ISSUE' ? styles.issueBtn : styles.rejectBtn,
                ]}
                onPress={handleProcessAction}
                disabled={updating}
              >
                <Text style={styles.confirmBtnText}>
                  {updating ? 'Processing...' : actionType === 'ISSUE' ? 'Confirm Issue' : 'Reject'}
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
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  partName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  vehicleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  descText: {
    fontSize: 12,
    color: '#475569',
    marginTop: spacing.xs + 2,
    lineHeight: 17,
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
  actionBtnRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: '700',
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
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
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
  issueBtn: { backgroundColor: '#15803D' },
  rejectBtn: { backgroundColor: '#B91C1C' },
  confirmBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
});
