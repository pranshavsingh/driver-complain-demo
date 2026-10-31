import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { canManageUsers } from '../../../../src/auth/permissions';
import { Button } from '../../../../src/components/Button';
import { radius, spacing } from '../../../../src/theme';
import { UserProfileSkeleton } from '../../../../src/components/LoadingSystem';

export default function UserDetailScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: currentUser } = useAuth();

  const [updating, setUpdating] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');

  const usersResource = useApiResource(
    `admin:user:${id}`,
    async () => {
      const list = await api.users.list();
      return list.find((u) => u.id === id) || null;
    }
  );

  const targetUser = usersResource.data;
  const canManage = canManageUsers(currentUser);

  const toggleActiveStatus = async (): Promise<void> => {
    if (!id || !targetUser || !canManage) return;
    setUpdating(true);
    try {
      await api.users.update(id, { isActive: !targetUser.isActive });
      await usersResource.reload();
      Alert.alert(
        'Status Updated',
        `User ${targetUser.firstName} is now ${!targetUser.isActive ? 'Active' : 'Deactivated'}.`
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update user status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleResetPin = async (): Promise<void> => {
    if (!id || !newPin.trim()) return;
    if (newPin.trim().length < 4) {
      Alert.alert('Invalid PIN', 'PIN must be at least 4 digits.');
      return;
    }

    setUpdating(true);
    try {
      await api.users.update(id, { pin: newPin.trim() });
      setShowPinModal(false);
      setNewPin('');
      Alert.alert('PIN Updated', 'New security PIN has been set.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update PIN.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title={targetUser ? `${targetUser.firstName} ${targetUser.lastName || ''}` : 'User Profile'}
        subtitle={targetUser ? `ID: ${targetUser.employeeId}` : 'Loading...'}
        showBack
      />

      {usersResource.loading && !targetUser ? (
        <UserProfileSkeleton />
      ) : !targetUser ? (
        <View style={styles.centerLoading}>
          <Text style={styles.errorText}>User profile not found.</Text>
          <Button label="Go Back" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Main Profile Card */}
          <View style={styles.card}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarLarge}>
                <Ionicons name="person" size={32} color="#0F172A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nameLarge}>
                  {targetUser.firstName} {targetUser.lastName || ''}
                </Text>
                <Text style={styles.empBadge}>ID: {targetUser.employeeId}</Text>
                <View style={styles.badgesRow}>
                  <StatusBadge status={targetUser.role} type="role" />
                  <View
                    style={[
                      styles.activeTag,
                      { backgroundColor: targetUser.isActive ? '#DCFCE7' : '#FEE2E2' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.activeTagText,
                        { color: targetUser.isActive ? '#15803D' : '#B91C1C' },
                      ]}
                    >
                      {targetUser.isActive ? 'Active' : 'Deactivated'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>Contact Phone</Text>
                <Text style={styles.detailVal}>{targetUser.phone || 'None provided'}</Text>
              </View>

              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>Email Address</Text>
                <Text style={styles.detailVal}>{targetUser.email || 'None'}</Text>
              </View>

              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>License Number</Text>
                <Text style={styles.detailVal}>{targetUser.licenseNumber || 'None'}</Text>
              </View>

              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>Registered On</Text>
                <Text style={styles.detailVal}>
                  {new Date(targetUser.createdAt).toLocaleDateString()}
                </Text>
              </View>

              {targetUser.category && (
                <View style={[styles.detailCol, { width: '100%' }]}>
                  <Text style={styles.detailLabel}>Primary Assigned Department</Text>
                  <Text style={styles.detailVal}>{targetUser.category}</Text>
                </View>
              )}
            </View>
          </View>

          {/* SuperAdmin Management Controls */}
          {canManage && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account Security & Controls</Text>
              <Text style={styles.cardSubtitle}>
                Manage account access and login credentials.
              </Text>

              <View style={styles.actionsBtnStack}>
                <Pressable
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: targetUser.isActive ? '#FFFBEB' : '#F0FDF4',
                      borderColor: targetUser.isActive ? '#FDE68A' : '#BBF7D0',
                    },
                  ]}
                  onPress={toggleActiveStatus}
                  disabled={updating}
                >
                  <Ionicons
                    name={targetUser.isActive ? 'ban' : 'checkmark-circle'}
                    size={20}
                    color={targetUser.isActive ? '#D97706' : '#15803D'}
                  />
                  <Text
                    style={[
                      styles.actionBtnText,
                      { color: targetUser.isActive ? '#92400E' : '#166534' },
                    ]}
                  >
                    {targetUser.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}
                  onPress={() => setShowPinModal(true)}
                  disabled={updating}
                >
                  <Ionicons name="key" size={20} color="#0284C7" />
                  <Text style={[styles.actionBtnText, { color: '#0369A1' }]}>
                    Reset Security PIN
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Reset PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reset PIN for {targetUser?.firstName}</Text>
            <Text style={styles.modalSub}>
              Enter a new 4 to 8 digit login PIN. The user must use this PIN on their next login.
            </Text>

            <TextInput
              style={styles.textInput}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={8}
              secureTextEntry
              value={newPin}
              onChangeText={setNewPin}
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setShowPinModal(false)}
                disabled={updating}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleResetPin}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Update PIN</Text>
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameLarge: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  empBadge: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 6,
  },
  activeTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: spacing.sm,
  },
  detailCol: {
    width: '48%',
  },
  detailLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  detailVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  actionsBtnStack: {
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
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
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    height: 44,
    fontSize: 14,
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
