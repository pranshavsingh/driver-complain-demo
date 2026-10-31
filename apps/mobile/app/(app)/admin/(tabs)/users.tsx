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
import type { UserPublic, Role } from '@driver-complaint/shared-types';
import * as api from '../../../../src/api/endpoints';
import { useAuth } from '../../../../src/auth/AuthContext';
import { useApiResource } from '../../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../../src/components/admin/AdminHeader';
import { FilterBar, type FilterOption } from '../../../../src/components/admin/FilterBar';
import { StatusBadge } from '../../../../src/components/admin/StatusBadge';
import { EmptyState } from '../../../../src/components/admin/EmptyState';
import { SkeletonList } from '../../../../src/components/LoadingSystem';
import { canManageUsers } from '../../../../src/auth/permissions';
import { radius, spacing } from '../../../../src/theme';

const ROLE_FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'All Users' },
  { id: 'DRIVER', label: 'Drivers' },
  { id: 'EXECUTIVE', label: 'Executives' },
  { id: 'ADMIN', label: 'Admins' },
  { id: 'SUPER_ADMIN', label: 'Super Admins' },
];

export default function UsersPage(): ReactElement {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('DRIVER');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = canManageUsers(user);

  const usersResource = useApiResource('admin:users:list', () =>
    api.users.list()
  );

  const filteredUsers = useMemo(() => {
    let list: UserPublic[] = usersResource.data ?? [];

    if (selectedRole !== 'ALL') {
      list = list.filter((u) => u.role === selectedRole);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          u.firstName?.toLowerCase().includes(q) ||
          u.lastName?.toLowerCase().includes(q) ||
          u.employeeId.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [usersResource.data, selectedRole, searchQuery]);

  const handleAddUser = async (): Promise<void> => {
    if (!employeeId.trim() || !firstName.trim() || !pin.trim()) {
      Alert.alert('Required Fields', 'Please enter Employee ID, First Name, and a 4-8 digit PIN.');
      return;
    }

    setSaving(true);
    try {
      await api.users.create({
        employeeId: employeeId.trim().toUpperCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        pin: pin.trim(),
        role,
        phone: phone.trim() || undefined,
      });
      setShowAddModal(false);
      setEmployeeId('');
      setFirstName('');
      setLastName('');
      setPin('');
      setPhone('');
      await usersResource.reload();
      Alert.alert('User Created', `Account created for ${firstName}.`);
    } catch (err: any) {
      Alert.alert('Creation Failed', err?.message || 'Could not register user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="User Accounts"
        subtitle={`${filteredUsers.length} staff and drivers`}
        rightAction={
          canManage ? (
            <Pressable
              onPress={() => setShowAddModal(true)}
              style={styles.addBtn}
              accessibilityLabel="Add User"
            >
              <Ionicons name="person-add" size={24} color="#0284C7" />
            </Pressable>
          ) : undefined
        }
      />

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, employee ID, or phone..."
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

      {/* Role Filters */}
      <View style={styles.filterWrap}>
        <FilterBar
          options={ROLE_FILTERS}
          selectedId={selectedRole}
          onSelect={setSelectedRole}
        />
      </View>

      {/* User List */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={usersResource.loading && usersResource.data !== null}
            onRefresh={() => usersResource.reload()}
            tintColor="#0284C7"
          />
        }
        ListEmptyComponent={
          usersResource.loading && usersResource.data === null ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No users found"
              message="No user profiles match the selected role or search."
              actionLabel="Refresh Users"
              onAction={() => usersResource.reload()}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(app)/admin/user/${item.id}`)}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.nameRow}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={18} color="#0F172A" />
                </View>
                <View>
                  <Text style={styles.userName}>
                    {item.firstName} {item.lastName || ''}
                  </Text>
                  <Text style={styles.empIdText}>ID: {item.employeeId}</Text>
                </View>
              </View>
              <StatusBadge status={item.role} type="role" />
            </View>

            <View style={styles.footerRow}>
              <Text style={styles.contactText}>
                {item.phone ? `📞 ${item.phone}` : 'No phone linked'}
              </Text>
              <View style={styles.activePill}>
                <View
                  style={[
                    styles.activeDot,
                    { backgroundColor: item.isActive ? '#10B981' : '#EF4444' },
                  ]}
                />
                <Text style={styles.activeText}>
                  {item.isActive ? 'Active' : 'Deactivated'}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* Add User Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Create New Account</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Employee ID *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. E1050"
              placeholderTextColor="#94A3B8"
              value={employeeId}
              onChangeText={setEmployeeId}
              autoCapitalize="characters"
            />

            <View style={styles.nameInputsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>First Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="First name"
                  placeholderTextColor="#94A3B8"
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Last name"
                  placeholderTextColor="#94A3B8"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.rolePickerRow}>
              {(['DRIVER', 'EXECUTIVE', 'ADMIN'] as Role[]).map((r) => (
                <Pressable
                  key={r}
                  style={[styles.roleOption, role === r && styles.roleOptionSelected]}
                  onPress={() => setRole(r)}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      role === r && styles.roleOptionTextSelected,
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Security PIN (4-8 Digits) *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={8}
              secureTextEntry
              value={pin}
              onChangeText={setPin}
            />

            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. +91 9876543210"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
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
                onPress={handleAddUser}
                disabled={saving}
              >
                <Text style={styles.confirmBtnText}>
                  {saving ? 'Creating...' : 'Create Account'}
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
    borderColor: '#E2E8F0',
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  empIdText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  contactText: {
    fontSize: 12,
    color: '#475569',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
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
  nameInputsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: 4,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  roleOptionSelected: {
    backgroundColor: '#0F172A',
  },
  roleOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  roleOptionTextSelected: {
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
