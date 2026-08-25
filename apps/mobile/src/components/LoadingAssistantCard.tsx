import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import type { LoadingRecord } from '@driver-complaint/shared-types';
import { loading, type FileToUpload } from '../api/endpoints';
import { Button } from './Button';
import { Card } from './Card';
import { PHOTO_QUALITY } from '../media/limits';
import { colors, fontSize, radius, spacing } from '../theme';

export function LoadingAssistantCard(): ReactElement {
  const [activeRecord, setActiveRecord] = useState<LoadingRecord | null>(null);
  const [completedRecord, setCompletedRecord] = useState<LoadingRecord | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await loading.active();
        if (mounted && res.active) {
          setActiveRecord(res.active);
        }
      } catch (err) {
        console.warn('Failed to fetch active loading session:', err);
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Timer tick for active loading session
  useEffect(() => {
    if (!activeRecord) return;
    const reachedTime = new Date(activeRecord.reachedAt).getTime();
    
    const updateElapsed = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - reachedTime) / 1000));
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

  const captureGpsAndPhoto = async (): Promise<{
    coords: { latitude: number; longitude: number };
    address?: string;
    photo: FileToUpload;
  } | null> => {
    // 1. Request Location Permission & Fetch GPS
    const locPerm = await Location.requestForegroundPermissionsAsync();
    if (!locPerm.granted) {
      Alert.alert('Location Required', 'Location permission is needed to verify your arrival at the loading point.');
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

    // 2. Request Camera Permission & Launch Camera automatically
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
      name: asset.fileName ?? 'loading_proof.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    };

    return {
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      },
      address: addressStr,
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
      Alert.alert('📍 Reached Loading Point', 'Arrival milestone recorded and live waiting timer started!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record loading arrival');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleted = async (): Promise<void> => {
    if (!activeRecord) return;
    try {
      setSubmitting(true);
      const data = await captureGpsAndPhoto();
      if (!data) return;

      const record = await loading.completed(
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
      Alert.alert('✅ Loading Completed', `Total Waiting Time: ${record.formattedWaitingTime || '< 1 min'}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to complete loading milestone');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <Card title="Loading Point Assistant">
        <ActivityIndicator color={colors.primary} size="small" />
      </Card>
    );
  }

  return (
    <Card title="Loading Point Assistant 🚛">
      {activeRecord ? (
        <View style={styles.activeContainer}>
          <View style={styles.statusBadge}>
            <View style={styles.pulsingDot} />
            <Text style={styles.statusBadgeText}>LOADING IN PROGRESS</Text>
          </View>

          <Text style={styles.timerTitle}>Current Waiting Duration</Text>
          <Text style={styles.timerText}>{formatElapsed(elapsedSec)}</Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Arrived At:</Text>
            <Text style={styles.infoValue}>
              {new Date(activeRecord.reachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {activeRecord.reachedAddress ? (
              <>
                <Text style={styles.infoLabel}>Location:</Text>
                <Text style={styles.infoValue} numberOfLines={2}>
                  {activeRecord.reachedAddress}
                </Text>
              </>
            ) : null}
          </View>

          {activeRecord.reachedPhotoUrl ? (
            <Image source={{ uri: activeRecord.reachedPhotoUrl }} style={styles.previewImage} />
          ) : null}

          <Button
            label={submitting ? 'Capturing GPS & Camera...' : '✅ Mark Loading Completed'}
            disabled={submitting}
            onPress={handleCompleted}
          />
        </View>
      ) : completedRecord ? (
        <View style={styles.completedContainer}>
          <Text style={styles.completedTitle}>🎉 Loading Finished!</Text>
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Total Driver Waiting Time:</Text>
            <Text style={styles.resultValue}>{completedRecord.formattedWaitingTime || '< 1 min'}</Text>
          </View>
          <Button
            label="Start New Loading Session"
            variant="secondary"
            onPress={() => setCompletedRecord(null)}
          />
        </View>
      ) : (
        <View style={styles.idleContainer}>
          <Text style={styles.idleDescription}>
            Upon arrival at the warehouse or loading location, tap below to verify GPS, capture proof photo, and start automated waiting time analytics.
          </Text>
          <Button
            label={submitting ? 'Fetching Location & Camera...' : '📍 Reached Loading Point'}
            disabled={submitting}
            onPress={handleReached}
          />
        </View>
      )}
    </Card>
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
  previewImage: {
    width: '100%',
    height: 140,
    borderRadius: radius.sm,
  },
  completedContainer: { gap: spacing.md, alignItems: 'center' },
  completedTitle: {
    fontSize: fontSize.large,
    fontWeight: '800',
    color: colors.success,
  },
  resultBox: {
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: spacing.lg,
    borderRadius: radius.md,
    width: '100%',
  },
  resultLabel: {
    fontSize: fontSize.small,
    color: '#065F46',
  },
  resultValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#047857',
    marginTop: 4,
  },
});
