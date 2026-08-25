import { useMemo, useState, type ReactElement } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const vehicles = useApiResource('vehicles:mine', () => api.vehicles.mine());

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
    setSelectedCategory(tile.id);

    // 1. Complaint / Status -> Navigates to Complaint Status tab (history)
    if (tile.id === 'COMPLAINT_STATUS') {
      router.push('/(app)/(tabs)/history');
      return;
    }

    // 2. Medical Emergency -> High priority alert + Navigate to Register tab
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

    // 3. Loading / Unloading -> Show assistant card right here or navigate to Register
    if (tile.id === 'LOADING' || tile.id === 'UNLOADING') {
      return;
    }

    // 4. Other Issue Boxes (Breakdown, Tyre issue, Fuel/DEF, Accounts, Support) -> Navigate to Register Tab
    let initialText = '';
    let initialPriority = 'MEDIUM';

    if (tile.id === 'BREAKDOWN') {
      initialText = '🛠️ Breakdown Issue: ';
      initialPriority = 'HIGH';
    } else if (tile.id === 'TYRE_ISSUE') {
      initialText = '🛞 Tyre Issue: ';
      initialPriority = 'MEDIUM';
    } else if (tile.id === 'FUEL_DEF') {
      initialText = '⛽ Fuel / DEF Request: ';
      initialPriority = 'MEDIUM';
    } else if (tile.id === 'ACCOUNTS') {
      initialText = '💰 Accounts / Settlement Query: ';
      initialPriority = 'LOW';
    } else if (tile.id === 'SUPPORT') {
      initialText = '🎧 Support Request: ';
      initialPriority = 'MEDIUM';
    }

    router.push({
      pathname: '/(app)/(tabs)/register',
      params: { initialText, initialPriority },
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
            <Text style={styles.welcomeSub}>Tap any service box below to submit an issue or record arrival.</Text>
          </View>
          <Ionicons name="shield-checkmark" size={32} color="#075E54" />
        </View>

        {/* 9 Grid Action Boxes (matching wireframe design) */}
        <DashboardGrid onTilePress={handleTilePress} />

        {/* Show Loading / Unloading Assistant Card when selected */}
        {selectedCategory === 'LOADING' || selectedCategory === 'UNLOADING' ? (
          <View style={styles.assistantSection}>
            <LoadingAssistantCard />
          </View>
        ) : null}
      </ScrollView>
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
    backgroundColor: '#075E54', // Fleet Green Theme
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
  assistantSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
});
