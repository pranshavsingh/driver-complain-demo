import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VehiclePublic } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useAuth } from '../../../src/auth/AuthContext';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { radius, spacing } from '../../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { DashboardGrid, type GridTile } from '../../../src/components/DashboardGrid';
import { LoadingAssistantCard } from '../../../src/components/LoadingAssistantCard';

export default function DriverHomeDashboardScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [showLoadingAssistant, setShowLoadingAssistant] = useState(false);

  const vehicles = useApiResource('vehicles:mine', () => api.vehicles.mine());
  const reloadVehicles = vehicles.reload;

  // Auto reload on focus so when admin assigns a vehicle, it shows up immediately
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      reloadVehicles();
    }, [reloadVehicles]),
  );

  const vehicleList = useMemo<VehiclePublic[]>(() => vehicles.data ?? [], [vehicles.data]);
  const activeVehicle = vehicleList[0];

  const driverDisplayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : 'Driver';

  const confirmSignOut = (): void => {
    Alert.alert('Sign out?', 'You will need your employee ID and PIN to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  const handleTilePress = (tile: GridTile): void => {
    // 1. Complaint / Status -> Navigates directly to Complaint Status tab
    if (tile.id === 'COMPLAINT_STATUS') {
      router.push('/(app)/(tabs)/history');
      return;
    }

    // 2. Loading / Unloading -> Opens the Loading/Unloading Assistant Modal Popup
    if (tile.id === 'LOADING' || tile.id === 'UNLOADING') {
      setShowLoadingAssistant(true);
      return;
    }

    // 3. All Service Issue Boxes (Fuel / DEF, Breakdown, Tyre issue, Accounts, Support) -> Navigate to Complaint Registration Chat UI
    let initialPriority = 'MEDIUM';
    if (tile.id === 'BREAKDOWN') initialPriority = 'HIGH';
    if (tile.id === 'ACCOUNTS') initialPriority = 'LOW';

    router.push({
      pathname: '/(app)/(tabs)/register',
      params: {
        cardName: tile.title,
        category: tile.id,
        initialPriority,
      },
    });
  };

  return (
    <View style={styles.screen}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerProfile}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>{driverDisplayName}</Text>
            <Text style={styles.headerSubtitle}>
              {activeVehicle ? `🚛 ${activeVehicle.plateNumber}` : 'Standby / Free Driver'}
            </Text>
          </View>
        </View>

        <Pressable onPress={confirmSignOut} style={styles.logoutBtn} accessibilityLabel="Sign out">
          <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={vehicles.loading && vehicles.data !== null}
            onRefresh={() => vehicles.reload()}
            tintColor="#075E54"
          />
        }
      >
        {/* Prominent Vehicle Assignment Status Card */}
        {activeVehicle ? (
          <View style={styles.assignedVehicleCard}>
            <View style={styles.assignedVehicleHeader}>
              <View style={styles.plateBadge}>
                <Ionicons name="bus" size={18} color="#075E54" />
                <Text style={styles.plateText}>{activeVehicle.plateNumber}</Text>
              </View>
              <View style={styles.assignedStatusBadge}>
                <Text style={styles.assignedStatusBadgeText}>Active Vehicle</Text>
              </View>
            </View>

            <View style={styles.assignedDetailsRow}>
              <Text style={styles.assignedModelText}>
                {activeVehicle.model || 'Fleet Unit'} {activeVehicle.make ? `(${activeVehicle.make})` : ''}
              </Text>
              {activeVehicle.wheels && (
                <View style={styles.wheelTag}>
                  <Text style={styles.wheelTagText}>{activeVehicle.wheels}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.unassignedCard}>
            <View style={styles.unassignedIconWrap}>
              <Ionicons name="alert-circle" size={24} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unassignedTitle}>No Vehicle Assigned</Text>
              <Text style={styles.unassignedSub}>
                You are currently free/on standby. Your supervisor will assign a vehicle soon.
              </Text>
            </View>
            <Pressable
              onPress={() => vehicles.reload()}
              style={styles.refreshBtn}
              accessibilityLabel="Refresh assigned vehicle"
            >
              <Ionicons name="refresh" size={18} color="#D97706" />
            </Pressable>
          </View>
        )}

        {/* Banner Welcome */}
        <View style={styles.welcomeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle}>Driver Service Portal 🚛</Text>
            <Text style={styles.welcomeSub}>Tap any department below to raise an instant complaint or request.</Text>
          </View>
          <Ionicons name="shield-checkmark" size={28} color="#075E54" />
        </View>

        {/* 7 Grid Action Boxes (matching diagram design) */}
        <DashboardGrid onTilePress={handleTilePress} />
      </ScrollView>

      {/* Loading & Unloading Assistant Modal Popup */}
      <Modal
        visible={showLoadingAssistant}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowLoadingAssistant(false)}
      >
        <View style={styles.modalScreen}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.xs }]}>
            <View style={styles.modalHeaderTitleRow}>
              <Ionicons name="bus" size={22} color="#FFFFFF" />
              <Text style={styles.modalTitle}>Loading / Unloading Assistant</Text>
            </View>
            <Pressable onPress={() => setShowLoadingAssistant(false)} style={styles.closeModalBtn}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <LoadingAssistantCard visible={showLoadingAssistant} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: '#075E54',
    elevation: 4,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#128C7E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#E0F2FE',
    fontWeight: '600',
  },
  logoutBtn: {
    padding: spacing.xs,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  assignedVehicleCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  assignedVehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  plateText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#075E54',
    letterSpacing: 0.5,
  },
  assignedStatusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  assignedStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  assignedDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs + 2,
  },
  assignedModelText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  wheelTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  wheelTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  unassignedCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unassignedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unassignedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  unassignedSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.pill,
  },
  welcomeBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: spacing.md,
    elevation: 1,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  welcomeSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: '#075E54',
    elevation: 4,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeModalBtn: {
    padding: spacing.xs,
  },
  modalContent: {
    padding: spacing.md,
  },
});

