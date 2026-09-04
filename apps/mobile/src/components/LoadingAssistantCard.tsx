import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import type { LoadingRecord, LoadingStats } from '@driver-complaint/shared-types';
import { loading, type FileToUpload } from '../api/endpoints';
import { Button } from './Button';
import { Card } from './Card';
import { TotalTripCard } from './TotalTripCard';
import { PHOTO_QUALITY } from '../media/limits';
import { colors, fontSize, radius, spacing } from '../theme';
import { Ionicons } from '@expo/vector-icons';

interface LoadingAssistantCardProps {
  visible?: boolean;
}

export function LoadingAssistantCard({
  visible = true,
}: LoadingAssistantCardProps = {}): ReactElement {
  const [activeRecord, setActiveRecord] = useState<LoadingRecord | null>(null);
  const [completedRecord, setCompletedRecord] = useState<LoadingRecord | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [tripStats, setTripStats] = useState<LoadingStats>({
    completedTripsCount: 0,
    monthlyTripsCount: 0,
  });

  const fetchActiveAndStats = async () => {
    try {
      const res = await loading.active();
      setActiveRecord(res.active ?? null);
      if (res.active === null) {
        // Driver is idle (no active loading, transit, or unloading session).
        // Clear any old completedRecord from a prior session so a fresh session can begin.
        setCompletedRecord(null);
      }
      if (res.stats) {
        setTripStats({
          completedTripsCount: res.stats.completedTripsCount,
          monthlyTripsCount: res.stats.monthlyTripsCount,
        });
      }
    } catch (err) {
      console.warn('Failed to fetch active loading session:', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await fetchActiveAndStats();
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visible]);

  // Timer tick for the active loading, transit or unloading session. The origin always comes
  // from a server timestamp, never from Date.now() at mount, so the timer resumes correctly
  // after the app is force-closed and reopened mid-cycle.
  useEffect(() => {
    if (!activeRecord) return;

    let startTime = Date.now();
    if (activeRecord.status === 'UNLOADING' && activeRecord.tripCompletedAt) {
      // Unloading started the moment the driver reached the unloading point.
      startTime = new Date(activeRecord.tripCompletedAt).getTime();
    } else if (activeRecord.status === 'TRIP_STARTED' && activeRecord.tripStartedAt) {
      startTime = new Date(activeRecord.tripStartedAt).getTime();
    } else if (activeRecord.reachedAt) {
      startTime = new Date(activeRecord.reachedAt).getTime();
    }

    const updateElapsed = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSec(diff);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeRecord]);

  const formatElapsed = (totalSec: number): string => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    if (hrs > 0) {
      return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
    }
    return `${pad(mins)}m ${pad(secs)}s`;
  };

  const getGpsLocation = async (): Promise<{
    coords: { latitude: number; longitude: number };
    address?: string;
  } | null> => {
    const locPerm = await Location.requestForegroundPermissionsAsync();
    if (!locPerm.granted) {
      Alert.alert('Location Required', 'Location permission is needed to verify your position.');
      return null;
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    let addressStr: string | undefined;

    try {
      const geo = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (geo && geo.length > 0) {
        const item = geo[0];
        addressStr = [item.name, item.street, item.city, item.region].filter(Boolean).join(', ');
      }
    } catch {
      // Non-fatal geocode failure
    }

    return {
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      },
      address: addressStr,
    };
  };

  const captureGpsAndPhoto = async (): Promise<{
    coords: { latitude: number; longitude: number };
    address?: string;
    photo: FileToUpload;
  } | null> => {
    const gpsData = await getGpsLocation();
    if (!gpsData) return null;

    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert('Camera Required', 'Camera permission is required to capture proof photo.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    const photo: FileToUpload = {
      uri: asset.uri,
      name: asset.fileName ?? 'proof.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    };

    return {
      coords: gpsData.coords,
      address: gpsData.address,
      photo,
    };
  };

  const handleReached = async (): Promise<void> => {
    try {
      setSubmitting(true);
      const data = await captureGpsAndPhoto();
      if (!data) return;

      const record = await loading.reached(
        {
          latitude: data.coords.latitude,
          longitude: data.coords.longitude,
          address: data.address,
        },
        data.photo,
      );

      setActiveRecord(record);
      setCompletedRecord(null);
      await fetchActiveAndStats();
      Alert.alert('📍 Reached Loading Point', 'Arrival milestone recorded! Loading timer started.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg || 'Failed to record loading arrival');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadingDone = async (): Promise<void> => {
    if (!activeRecord) return;
    try {
      setSubmitting(true);
      // 1. Fetch Location and open camera for photo proof
      const data = await captureGpsAndPhoto();
      if (!data) return;

      // 2. Mark loading completed
      const completedRecordData = await loading.completed(
        activeRecord.id,
        {
          latitude: data.coords.latitude,
          longitude: data.coords.longitude,
          address: data.address,
        },
        data.photo,
      );

      // 3. Auto-start trip immediately after loading completion (fetch GPS only)
      const gpsData = await getGpsLocation();
      const tripStartedRecord = await loading.startTrip(completedRecordData.id, {
        latitude: gpsData ? gpsData.coords.latitude : data.coords.latitude,
        longitude: gpsData ? gpsData.coords.longitude : data.coords.longitude,
        address: gpsData ? gpsData.address : data.address,
      });

      setActiveRecord(tripStartedRecord);
      setCompletedRecord(null);
      await fetchActiveAndStats();
      Alert.alert(
        '✅ Loading Done & 🚛 Trip Started',
        `Loading completed in ${completedRecordData.formattedWaitingTime || '< 1 min'}. Your trip timer has started!`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg || 'Failed to complete loading / start trip');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * "Reached Unloading Point" — ends transit and starts the unloading clock.
   *
   * Deliberately NOT terminal: the record moves to UNLOADING and stays the active session, so
   * the card keeps a live timer running. The trip only closes out in handleCompleteUnloading.
   */
  const handleCompleteTrip = async (): Promise<void> => {
    if (!activeRecord) return;
    try {
      setSubmitting(true);
      // Fetch location and open camera to submit photo for arrival at the unloading point
      const data = await captureGpsAndPhoto();
      if (!data) return;

      const record = await loading.completeTrip(
        activeRecord.id,
        {
          latitude: data.coords.latitude,
          longitude: data.coords.longitude,
          address: data.address,
        },
        data.photo,
      );

      setActiveRecord(record);
      setCompletedRecord(null);
      Alert.alert(
        '📦 Reached Unloading Point',
        `Trip completed in ${record.formattedTripDuration || '< 1 min'}. Unloading timer started — tap "Unloading Done" once the vehicle is empty.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg || 'Failed to record arrival at unloading point');
    } finally {
      setSubmitting(false);
    }
  };

  /** "Unloading Done" — the terminal milestone; closes the cycle and bumps the trip count. */
  const handleCompleteUnloading = async (): Promise<void> => {
    if (!activeRecord) return;
    try {
      setSubmitting(true);
      const data = await captureGpsAndPhoto();
      if (!data) return;

      const record = await loading.completeUnloading(
        activeRecord.id,
        {
          latitude: data.coords.latitude,
          longitude: data.coords.longitude,
          address: data.address,
        },
        data.photo,
      );

      setActiveRecord(null);
      setCompletedRecord(record);
      if (record.completedTripsCount !== undefined || record.monthlyTripsCount !== undefined) {
        setTripStats({
          completedTripsCount: record.completedTripsCount ?? tripStats.completedTripsCount + 1,
          monthlyTripsCount: record.monthlyTripsCount ?? tripStats.monthlyTripsCount + 1,
        });
      }
      await fetchActiveAndStats();
      Alert.alert(
        '🏁 Unloading Done!',
        `Unloaded in ${record.formattedUnloadingDuration || '< 1 min'}. Total Trips: ${record.completedTripsCount ?? 1}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg || 'Failed to complete unloading');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <Card title="Loading & Trip Assistant">
        <ActivityIndicator color={colors.primary} size="small" />
      </Card>
    );
  }

  const isTripStarted = activeRecord?.status === 'TRIP_STARTED';
  const isUnloading = activeRecord?.status === 'UNLOADING';

  // Phase-dependent copy, kept as plain data instead of nested ternaries inside the JSX.
  const timerTitle = isUnloading
    ? 'Unloading Duration'
    : isTripStarted
      ? 'Live Trip Duration'
      : 'Loading Duration';
  const milestoneLabel = isUnloading
    ? 'Reached Unloading At:'
    : isTripStarted
      ? 'Trip Started At:'
      : 'Arrived At:';
  const milestoneAt = isUnloading
    ? activeRecord?.tripCompletedAt
    : isTripStarted
      ? activeRecord?.tripStartedAt
      : null;
  const milestoneAddress = isUnloading
    ? activeRecord?.tripCompletedAddress
    : isTripStarted
      ? activeRecord?.tripStartAddress
      : activeRecord?.reachedAddress;
  const timerStyle = isUnloading
    ? styles.unloadingTimerText
    : isTripStarted
      ? styles.tripTimerText
      : styles.timerText;

  return (
    <View style={{ gap: spacing.md }}>
      <Card title="Loading & Trip Assistant 🚛">
        {activeRecord ? (
          <View style={styles.activeContainer}>
            {isUnloading ? (
              <View style={styles.unloadingStatusBadge}>
                <View style={styles.pulsingOrangeDot} />
                <Ionicons name="cube-outline" size={16} color="#9A3412" style={{ marginRight: 2 }} />
                <Text style={styles.unloadingStatusBadgeText}>UNLOADING IN PROGRESS</Text>
              </View>
            ) : isTripStarted ? (
              <View style={styles.tripStatusBadge}>
                <View style={styles.pulsingGreenDot} />
                <Ionicons name="bus-outline" size={16} color="#065F46" style={{ marginRight: 2 }} />
                <Text style={styles.tripStatusBadgeText}>YOUR TRIP IS STARTED</Text>
              </View>
            ) : (
              <View style={styles.statusBadge}>
                <View style={styles.pulsingDot} />
                <Ionicons name="time-outline" size={16} color="#92400E" style={{ marginRight: 2 }} />
                <Text style={styles.statusBadgeText}>LOADING IN PROGRESS</Text>
              </View>
            )}

            <Text style={styles.timerTitle}>{timerTitle}</Text>
            <Text style={timerStyle}>{formatElapsed(elapsedSec)}</Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>{milestoneLabel}</Text>
              <Text style={styles.infoValue}>
                {new Date(milestoneAt ?? activeRecord.reachedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {milestoneAddress ? (
                <>
                  <Text style={styles.infoLabel}>Location:</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>
                    {milestoneAddress}
                  </Text>
                </>
              ) : null}
            </View>

            {isUnloading ? (
              <Pressable
                style={[styles.actionBtn, styles.unloadingDoneBtn, submitting && styles.btnDisabled]}
                onPress={handleCompleteUnloading}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Unloading Done</Text>
                  </>
                )}
              </Pressable>
            ) : isTripStarted ? (
              <Pressable
                style={[styles.actionBtn, styles.completeTripBtn, submitting && styles.btnDisabled]}
                onPress={handleCompleteTrip}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="flag" size={20} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Reached Unloading Point</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.actionBtn, styles.loadingDoneBtn, submitting && styles.btnDisabled]}
                onPress={handleLoadingDone}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Loading Done</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        ) : completedRecord ? (
          <View style={styles.completedContainer}>
            <Text style={styles.completedTitle}>🎉 Trip Completed Successfully!</Text>

            <View style={styles.tripCountBadge}>
              <Ionicons name="trophy" size={20} color="#D97706" />
              <Text style={styles.tripCountText}>
                Total Completed Trips: <Text style={styles.tripCountNumber}>{completedRecord.completedTripsCount ?? 1}</Text>
              </Text>
            </View>

            <View style={styles.resultBox}>
              {completedRecord.formattedWaitingTime ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.resultLabel}>Loading Time:</Text>
                  <Text style={styles.summaryValue}>{completedRecord.formattedWaitingTime}</Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.resultLabel}>Trip Duration:</Text>
                <Text style={styles.resultValue}>
                  {completedRecord.formattedTripDuration || '< 1 min'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.resultLabel}>Unloading Time:</Text>
                <Text style={styles.summaryValue}>
                  {completedRecord.formattedUnloadingDuration || '< 1 min'}
                </Text>
              </View>
            </View>

            <Button
              label="Start New Loading Session"
              variant="secondary"
              onPress={() => {
                setCompletedRecord(null);
                void fetchActiveAndStats();
              }}
            />
          </View>
        ) : (
          <View style={styles.idleContainer}>
            <Text style={styles.idleDescription}>
              Upon arrival at the warehouse or loading location, tap below to verify GPS, capture proof photo, and start automated timer analytics.
            </Text>
            <Pressable
              style={[styles.actionBtn, styles.reachedBtn, submitting && styles.btnDisabled]}
              onPress={handleReached}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="location" size={20} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Reached Loading Point</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </Card>

      {/* Total Trip Card under Loading Assistant Card */}
      <TotalTripCard
        monthlyTripsCount={tripStats.monthlyTripsCount}
        completedTripsCount={tripStats.completedTripsCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  idleContainer: { gap: spacing.md },
  idleDescription: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    lineHeight: 20,
  },
  activeContainer: { gap: spacing.md },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  statusBadgeText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: '#92400E',
  },
  tripStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  pulsingGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  tripStatusBadgeText: {
    fontSize: fontSize.small,
    fontWeight: '800',
    color: '#065F46',
  },
  unloadingStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEDD5',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  pulsingOrangeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EA580C',
  },
  unloadingStatusBadgeText: {
    fontSize: fontSize.small,
    fontWeight: '800',
    color: '#9A3412',
  },
  timerTitle: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  timerText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  tripTimerText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
  },
  unloadingTimerText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#EA580C',
    letterSpacing: 1,
  },
  infoBox: {
    backgroundColor: colors.neutralSurface,
    padding: spacing.md,
    borderRadius: radius.sm,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.text,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    elevation: 2,
  },
  reachedBtn: {
    backgroundColor: '#075E54',
  },
  loadingDoneBtn: {
    backgroundColor: '#2563EB',
  },
  completeTripBtn: {
    backgroundColor: '#059669',
  },
  unloadingDoneBtn: {
    backgroundColor: '#EA580C',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  completedContainer: { gap: spacing.md, alignItems: 'center' },
  completedTitle: {
    fontSize: fontSize.large,
    fontWeight: '800',
    color: colors.success,
    textAlign: 'center',
  },
  tripCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tripCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  tripCountNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#B45309',
  },
  resultBox: {
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: spacing.lg,
    borderRadius: radius.md,
    width: '100%',
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  resultLabel: {
    fontSize: fontSize.small,
    color: '#065F46',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#047857',
  },
  resultValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#047857',
  },
});
