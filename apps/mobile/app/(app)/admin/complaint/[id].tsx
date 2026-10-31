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
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from '../../../../src/api/endpoints';
import { useAuth } from '../../../../src/auth/AuthContext';
import { useApiResource } from '../../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../../src/components/admin/AdminHeader';
import { StatusBadge } from '../../../../src/components/admin/StatusBadge';
import { canResolveComplaints } from '../../../../src/auth/permissions';
import { Button } from '../../../../src/components/Button';
import { radius, spacing } from '../../../../src/theme';
import { ComplaintDetailSkeleton } from '../../../../src/components/LoadingSystem';

export default function ComplaintDetailScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [updating, setUpdating] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('IN_PROGRESS');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const complaintResource = useApiResource(
    `admin:complaint:${id}`,
    () => api.complaints.get(id!)
  );

  const complaint = complaintResource.data;
  const canUpdate = canResolveComplaints(user);

  const handleUpdateStatus = async (): Promise<void> => {
    if (!id) return;
    setUpdating(true);
    try {
      await api.complaints.updateStatus(id, {
        status: newStatus as any,
        note: resolutionNotes.trim() ? resolutionNotes.trim() : undefined,
      });
      setShowStatusModal(false);
      setResolutionNotes('');
      await complaintResource.reload();
      Alert.alert('Status Updated', `Ticket status has been set to ${newStatus}.`);
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update ticket status.');
    } finally {
      setUpdating(false);
    }
  };

  const openStatusPrompt = (status: string): void => {
    setNewStatus(status);
    setShowStatusModal(true);
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="Complaint Details"
        subtitle={complaint ? `#${complaint.id.slice(-6)}` : 'Loading...'}
        showBack
      />

      {complaintResource.loading && !complaint ? (
        <ComplaintDetailSkeleton />
      ) : !complaint ? (
        <View style={styles.centerLoading}>
          <Text style={styles.errorText}>Complaint ticket not found.</Text>
          <Button label="Go Back" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Main Card */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <StatusBadge status={complaint.status} />
              <StatusBadge status={complaint.priority} type="priority" />
            </View>

            <Text style={styles.title}>{complaint.title}</Text>
            <Text style={styles.description}>{complaint.description}</Text>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Vehicle</Text>
                <Text style={styles.metaVal}>
                  {complaint.vehiclePlateNumber || complaint.vehicle?.plateNumber ? `🚛 ${complaint.vehiclePlateNumber || complaint.vehicle?.plateNumber}` : 'None specified'}
                </Text>
              </View>

              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Category</Text>
                <Text style={styles.metaVal}>{complaint.category || 'General'}</Text>
              </View>

              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Driver ID</Text>
                <Text style={styles.metaVal}>{complaint.driverId || 'N/A'}</Text>
              </View>

              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Trip Phase</Text>
                <Text style={styles.metaVal}>{complaint.tripPhase || 'Not logged'}</Text>
              </View>

              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Date Logged</Text>
                <Text style={styles.metaVal}>
                  {new Date(complaint.createdAt).toLocaleString()}
                </Text>
              </View>

              {complaint.locationName && (
                <View style={[styles.metaItem, { width: '100%' }]}>
                  <Text style={styles.metaLabel}>Location</Text>
                  <Text style={styles.metaVal}>📍 {complaint.locationName}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Evidence Photos */}
          {complaint.attachments && complaint.attachments.filter((a) => a.kind === 'PHOTO').length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>Attached Evidence</Text>
              <View style={styles.photoGrid}>
                {complaint.attachments
                  .filter((a) => a.kind === 'PHOTO')
                  .map((att) => (
                    <Image
                      key={att.id}
                      source={{ uri: att.url }}
                      style={styles.evidenceImage}
                      resizeMode="cover"
                    />
                  ))}
              </View>
            </View>
          )}

          {/* Latest Note (if any) */}
          {complaint.updates && complaint.updates.find((u) => u.note) && (
            <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cardHeaderTitle, { color: '#166534' }]}>
                  Latest Operational Note
                </Text>
                <Ionicons name="checkmark-circle" size={20} color="#15803D" />
              </View>
              <Text style={styles.resolutionText}>
                {complaint.updates.find((u) => u.note)?.note}
              </Text>
            </View>
          )}

          {/* Status Change Operations Bar */}
          {canUpdate && (
            <View style={styles.actionsCard}>
              <Text style={styles.actionsTitle}>Workflow Action</Text>
              <View style={styles.actionBtnRow}>
                {complaint.status !== 'IN_PROGRESS' && (
                  <Pressable
                    style={[styles.btnAction, { backgroundColor: '#E0F2FE' }]}
                    onPress={() => openStatusPrompt('IN_PROGRESS')}
                  >
                    <Ionicons name="time" size={16} color="#0369A1" />
                    <Text style={[styles.btnActionText, { color: '#0369A1' }]}>
                      In Progress
                    </Text>
                  </Pressable>
                )}

                {complaint.status !== 'RESOLVED' && (
                  <Pressable
                    style={[styles.btnAction, { backgroundColor: '#DCFCE7' }]}
                    onPress={() => openStatusPrompt('RESOLVED')}
                  >
                    <Ionicons name="checkmark" size={16} color="#15803D" />
                    <Text style={[styles.btnActionText, { color: '#15803D' }]}>
                      Resolve
                    </Text>
                  </Pressable>
                )}

                {complaint.status !== 'CLOSED' && (
                  <Pressable
                    style={[styles.btnAction, { backgroundColor: '#FEE2E2' }]}
                    onPress={() => openStatusPrompt('CLOSED')}
                  >
                    <Ionicons name="close" size={16} color="#B91C1C" />
                    <Text style={[styles.btnActionText, { color: '#B91C1C' }]}>
                      Close
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Timeline / Updates */}
          {complaint.updates && complaint.updates.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>Audit History</Text>
              {complaint.updates.map((update, idx) => (
                <View key={idx} style={styles.timelineItem}>
                  <View style={styles.timelineDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timelineAction}>
                      {update.toStatus ? `Status: ${update.toStatus}` : (update.author ? `${update.author.firstName} updated` : 'System Update')}
                    </Text>
                    {update.note && <Text style={styles.timelineNote}>{update.note}</Text>}
                    <Text style={styles.timelineTime}>
                      {new Date(update.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal for Status Update */}
      <Modal visible={showStatusModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Set Status: {newStatus}</Text>
            <Text style={styles.modalSub}>
              Enter resolution notes or operational instructions (optional):
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Parts replaced, vehicle dispatched..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={resolutionNotes}
              onChangeText={setResolutionNotes}
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setShowStatusModal(false)}
                disabled={updating}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleUpdateStatus}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                )}
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
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: { fontSize: 13, color: '#64748B' },
  errorText: { fontSize: 14, color: '#EF4444', marginBottom: spacing.md },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: spacing.sm,
  },
  description: {
    fontSize: 13,
    color: '#475569',
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: spacing.sm,
  },
  metaItem: {
    width: '48%',
  },
  metaLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 1,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: spacing.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  evidenceImage: {
    width: 100,
    height: 100,
    borderRadius: radius.sm,
    backgroundColor: '#F1F5F9',
  },
  resolutionText: {
    fontSize: 13,
    color: '#14532D',
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  actionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: spacing.sm,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  btnActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0284C7',
    marginTop: 5,
  },
  timelineAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  timelineNote: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  timelineTime: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
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
    marginTop: 4,
    marginBottom: spacing.md,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 80,
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
  cancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  confirmBtn: {
    backgroundColor: '#0F172A',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
