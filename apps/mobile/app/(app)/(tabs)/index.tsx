import { useMemo, useState, type ReactElement } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VehiclePublic } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useAuth } from '../../../src/auth/AuthContext';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { describeVehicle } from '../../../src/lib/format';
import { radius, spacing } from '../../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { DashboardGrid, type GridTile } from '../../../src/components/DashboardGrid';
import { LoadingAssistantCard } from '../../../src/components/LoadingAssistantCard';

export default function DriverHomeDashboardScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [showLoadingAssistant, setShowLoadingAssistant] = useState(false);

  const vehicles = useApiResource('vehicles:mine', () => api.vehicles.mine());
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

    // 3. Medical Emergency -> Triggers Emergency SOS Alert prompt
    if (tile.id === 'MEDICAL_EMERGENCY') {
      Alert.alert(
        '🚨 MEDICAL EMERGENCY SOS',
        'Send an immediate Emergency SOS alert with your location to Dispatch?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'SEND SOS ALERT NOW',
            style: 'destructive',
            onPress: () => {
              router.push({
                pathname: '/(app)/(tabs)/register',
                params: {
                  cardName: tile.title,
                  category: tile.id,
                  initialText: '🚨 MEDICAL EMERGENCY SOS: Urgent medical/accident assistance required!',
                  initialPriority: 'URGENT',
                },
              });
            },
          },
        ],
      );
      return;
    }

    // 4. All Service Issue Boxes (Breakdown, Tyre issue, Fuel/DEF, Accounts, Support) -> Navigate to Register Tab with Card Context
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
            <Ionicons name="bus-outline" size={22} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>{driverDisplayName}</Text>
            <Text style={styles.headerSubtitle}>
              {activeVehicle ? describeVehicle(activeVehicle) : 'Fleet Driver'}
            </Text>
          </View>
        </View>

        <Pressable onPress={confirmSignOut} style={styles.logoutBtn} accessibilityLabel="Sign out">
          <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Banner Welcome */}
        <View style={styles.welcomeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle}>Driver Support Portal 🚛</Text>
            <Text style={styles.welcomeSub}>Tap any service box below to register an issue for that department.</Text>
          </View>
          <Ionicons name="shield-checkmark" size={32} color="#075E54" />
        </View>

        {/* 9 Grid Action Boxes (matching wireframe design) */}
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
              <Ionicons name="truck" size={22} color="#FFFFFF" />
              <Text style={styles.modalTitle}>Loading / Unloading Assistant</Text>
            </View>
            <Pressable onPress={() => setShowLoadingAssistant(false)} style={styles.closeModalBtn}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <LoadingAssistantCard />
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
    width: 42,
    height: 42,
    borderRadius: 21,
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
  },
  logoutBtn: {
    padding: spacing.xs,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  welcomeBanner: {
    margin: spacing.md,
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
