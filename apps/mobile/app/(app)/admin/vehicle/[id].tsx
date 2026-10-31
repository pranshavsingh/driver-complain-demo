import { useState, type ReactElement } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from '../../../../src/api/endpoints';
import { useAuth } from '../../../../src/auth/AuthContext';
import { useApiResource } from '../../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../../src/components/admin/AdminHeader';
import { StatusBadge } from '../../../../src/components/admin/StatusBadge';
import { canManageVehicles } from '../../../../src/auth/permissions';
import { Button } from '../../../../src/components/Button';
import { radius, spacing } from '../../../../src/theme';
import { VehicleDetailSkeleton } from '../../../../src/components/LoadingSystem';

export default function VehicleDetailScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);

  const vehicleResource = useApiResource(
    `admin:vehicle:${id}`,
    () => api.vehicles.get(id!)
  );

  const vehicle = vehicleResource.data;
  const canManage = canManageVehicles(user);

  const toggleStatus = async (newStatus: 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED'): Promise<void> => {
    if (!id || !canManage) return;
    setUpdating(true);
    try {
      await api.vehicles.update(id, { agreementStatus: newStatus });
      await vehicleResource.reload();
      Alert.alert('Status Updated', `Vehicle status changed to ${newStatus}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update vehicle status.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title={vehicle ? vehicle.plateNumber : 'Vehicle Profile'}
        subtitle="Fleet Unit Details"
        showBack
      />

      {vehicleResource.loading && !vehicle ? (
        <VehicleDetailSkeleton />
      ) : !vehicle ? (
        <View style={styles.centerLoading}>
          <Text style={styles.errorText}>Vehicle record not found.</Text>
          <Button label="Go Back" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Main Card */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.plateBadge}>
                <Ionicons name="bus" size={20} color="#0F172A" />
                <Text style={styles.plateText}>{vehicle.plateNumber}</Text>
              </View>
              <StatusBadge status={vehicle.agreementStatus || 'ACTIVE'} />
            </View>

            <Text style={styles.vehicleName}>
              {vehicle.make ? `${vehicle.make} ` : ''}{vehicle.model || 'Commercial Fleet Unit'}
            </Text>

            <View style={styles.infoGrid}>
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Axle Config</Text>
                <Text style={styles.infoVal}>{vehicle.wheels || 'Standard'}</Text>
              </View>

              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Agreement</Text>
                <Text style={styles.infoVal}>{vehicle.agreementStatus || 'ACTIVE'}</Text>
              </View>

              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Assigned Driver</Text>
                <Text style={styles.infoVal}>
                  {vehicle.driverId ? `Driver #${vehicle.driverId.slice(-4)}` : 'Standby / Unassigned'}
                </Text>
              </View>

              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Registration Date</Text>
                <Text style={styles.infoVal}>
                  {new Date(vehicle.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Operations Actions */}
          <Text style={styles.sectionTitle}>Fleet Actions & Logs</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/(app)/admin/maintenance')}
            >
              <Ionicons name="construct" size={22} color="#D97706" />
              <Text style={styles.quickActionText}>Maintenance History</Text>
            </Pressable>

            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/(app)/admin/fuel-logs')}
            >
              <Ionicons name="water" size={22} color="#0284C7" />
              <Text style={styles.quickActionText}>Fuel & DEF Logs</Text>
            </Pressable>

            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/(app)/admin/spare-parts')}
            >
              <Ionicons name="cog" size={22} color="#7C3AED" />
              <Text style={styles.quickActionText}>Spare Parts</Text>
            </Pressable>

            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/(app)/admin/reports')}
            >
              <Ionicons name="bar-chart" size={22} color="#059669" />
              <Text style={styles.quickActionText}>Vehicle Performance</Text>
            </Pressable>
          </View>

          {/* Status Switcher (Admin/SuperAdmin only) */}
          {canManage && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Change Fleet Status</Text>
              <Text style={styles.cardSubtitle}>
                Update operational status for dispatch and job assignment.
              </Text>

              <View style={styles.statusBtnRow}>
                <Pressable
                  style={[
                    styles.statusActionBtn,
                    (vehicle.agreementStatus === 'ACTIVE' || !vehicle.agreementStatus) && styles.statusActiveBtn,
                  ]}
                  onPress={() => toggleStatus('ACTIVE')}
                  disabled={updating}
                >
                  <Text
                    style={[
                      styles.statusActionText,
                      (vehicle.agreementStatus === 'ACTIVE' || !vehicle.agreementStatus) && styles.statusActiveText,
                    ]}
                  >
                    Active
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.statusActionBtn,
                    vehicle.agreementStatus === 'MAINTENANCE' && styles.statusMaintenanceBtn,
                  ]}
                  onPress={() => toggleStatus('MAINTENANCE')}
                  disabled={updating}
                >
                  <Text
                    style={[
                      styles.statusActionText,
                      vehicle.agreementStatus === 'MAINTENANCE' && styles.statusMaintenanceText,
                    ]}
                  >
                    In Repair
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.statusActionBtn,
                    vehicle.agreementStatus === 'DECOMMISSIONED' && styles.statusDecomBtn,
                  ]}
                  onPress={() => toggleStatus('DECOMMISSIONED')}
                  disabled={updating}
                >
                  <Text
                    style={[
                      styles.statusActionText,
                      vehicle.agreementStatus === 'DECOMMISSIONED' && styles.statusDecomText,
                    ]}
                  >
                    Off-Duty
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}
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
  plateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  plateText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginTop: spacing.sm,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: spacing.sm,
  },
  infoCol: {
    width: '48%',
  },
  infoLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickActionBtn: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
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
  statusBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  statusActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  statusActiveBtn: {
    backgroundColor: '#DCFCE7',
  },
  statusActiveText: {
    color: '#15803D',
    fontWeight: '700',
  },
  statusMaintenanceBtn: {
    backgroundColor: '#FEF3C7',
  },
  statusMaintenanceText: {
    color: '#B45309',
    fontWeight: '700',
  },
  statusDecomBtn: {
    backgroundColor: '#FEE2E2',
  },
  statusDecomText: {
    color: '#B91C1C',
    fontWeight: '700',
  },
});
