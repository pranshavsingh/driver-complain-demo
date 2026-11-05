import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { ComplaintAttachmentPublic, ComplaintUpdatePublic, Priority } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useAuth } from '../../../src/auth/AuthContext';
import { PriorityBadge, StatusBadge } from '../../../src/components/Badges';
import { Button } from '../../../src/components/Button';
import { Card, Row } from '../../../src/components/Card';
import { ErrorNotice } from '../../../src/components/ErrorNotice';
import { Header } from '../../../src/components/Header';
import { ComplaintDetailSkeleton } from '../../../src/components/LoadingSystem';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { describeVehicle, formatDateTime, formatDuration, formatEnum, fullName } from '../../../src/lib/format';
import {
  complaintsRepository,
  type PendingComplaintRecord,
} from '../../../src/db/complaintsRepository';
import { recoverMissingAttachmentsAndRetry } from '../../../src/sync/recoveryService';
import { syncService } from '../../../src/sync/syncService';
import { colors, fontSize, radius, spacing } from '../../../src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ComplaintDetailScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [localRecord, setLocalRecord] = useState<PendingComplaintRecord | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const loadLocalRecord = useCallback((): void => {
    void complaintsRepository
      .getComplaintById(id)
      .then((record) => {
        if (record) setLocalRecord(record);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    loadLocalRecord();
  }, [loadLocalRecord]);

  useEffect(() => {
    const unsub = syncService.addListener((event) => {
      if (event.complaintId === id || !event.complaintId) {
        loadLocalRecord();
      }
    });
    return () => unsub();
  }, [id, loadLocalRecord]);

  const complaint = useApiResource(`complaint:${id}`, () => api.complaints.get(id));

  const handleRetryLocal = (): void => {
    if (!user || !localRecord) return;
    setIsRetrying(true);
    void complaintsRepository
      .retryComplaint(localRecord.id)
      .then(() => syncService.triggerSync(user.id))
      .then(() => {
        loadLocalRecord();
      })
      .finally(() => {
        setIsRetrying(false);
      });
  };

  const handleRemoveMissingAttachmentsAndRetry = (): void => {
    if (!user || !localRecord || isRetrying) return;

    Alert.alert(
      'Remove Missing Evidence?',
      'The missing evidence file cannot be found in device storage and cannot be uploaded.\n\nRemoving it will submit the complaint without this missing evidence. Any accessible evidence, the original complaint ID, and the idempotency key will be retained.\n\nDo you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove & Retry',
          style: 'destructive',
          onPress: () => {
            void executeRecovery();
          },
        },
      ],
    );
  };

  const executeRecovery = async (): Promise<void> => {
    if (!user || !localRecord || isRetrying) return;
    setIsRetrying(true);
    try {
      const res = await recoverMissingAttachmentsAndRetry(localRecord.id, user.id);
      loadLocalRecord();
      if (res.success) {
        if (res.removedAttachments.length > 0) {
          Alert.alert(
            'Evidence Removed & Retrying',
            `Removed ${res.removedAttachments.length} missing attachment(s). The complaint is now syncing with its original ID and idempotency key.`,
          );
        } else {
          Alert.alert(
            'All Evidence Found',
            'All attachments are accessible on device storage. Retrying sync with all evidence intact.',
          );
        }
      } else {
        Alert.alert(
          'Recovery Incomplete',
          res.error ?? 'Could not complete recovery. The complaint remains recoverable.',
        );
      }
    } catch (err: unknown) {
      console.error('[complaintDetail] Recovery error:', err);
      Alert.alert(
        'Recovery Error',
        err instanceof Error ? err.message : 'An unexpected error occurred. The complaint remains recoverable.',
      );
      loadLocalRecord();
    } finally {
      setIsRetrying(false);
    }
  };

  if (complaint.loading && complaint.data === null && !complaint.error && !localRecord) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title="Report" back />
        <ComplaintDetailSkeleton />
      </SafeAreaView>
    );
  }

  const data = complaint.data;

  // If server data exists, show server view
  if (data) {
    const photos = data.attachments.filter((a) => a.kind === 'PHOTO');
    const voiceNotes = data.attachments.filter((a) => a.kind === 'VOICE');
    const videos = data.attachments.filter((a) => a.kind === 'VIDEO');

    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title={data.complaintNo ?? 'Report'} back />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={complaint.loading} onRefresh={complaint.reload} />
          }
        >
          {complaint.error ? (
            <ErrorNotice error={complaint.error} onRetry={complaint.reload} />
          ) : null}

          <View>
            <View style={styles.badges}>
              <StatusBadge status={data.status} />
              <PriorityBadge priority={data.priority} />
            </View>

            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.description}>{data.description}</Text>

            <Card title="Details">
              <Row label="Reported" value={formatDateTime(data.createdAt)} />
              <Row
                label="Vehicle"
                value={data.vehicle ? describeVehicle(data.vehicle) : 'Not recorded'}
              />
              <Row
                label="Being handled by"
                value={data.assignedTo ? fullName(data.assignedTo) : 'Not assigned yet'}
              />
              {data.resolvedAt ? (
                <Row label="Resolved" value={formatDateTime(data.resolvedAt)} />
              ) : null}
            </Card>

            {photos.length > 0 ? (
              <Card title={photos.length === 1 ? 'Photo' : 'Photos'}>
                {photos.map((attachment) => (
                  <Image
                    key={attachment.id}
                    source={{ uri: attachment.url }}
                    style={styles.photo}
                    resizeMode="cover"
                    accessibilityLabel={attachment.originalName ?? 'Photo attached to this report'}
                  />
                ))}
              </Card>
            ) : null}

            {voiceNotes.length > 0 ? (
              <Card title={voiceNotes.length === 1 ? 'Voice Note' : 'Voice Notes'}>
                {voiceNotes.map((attachment) => (
                  <VoiceAttachmentPlayer key={attachment.id} attachment={attachment} />
                ))}
              </Card>
            ) : null}

            {videos.length > 0 ? (
              <Card title={videos.length === 1 ? 'Video Clip' : 'Video Clips'}>
                {videos.map((attachment) => (
                  <VideoAttachmentPlayer key={attachment.id} attachment={attachment} />
                ))}
              </Card>
            ) : null}

            <Card title="History">
              {data.updates.length === 0 ? (
                <Text style={styles.muted}>Nothing yet.</Text>
              ) : (
                data.updates.map((update) => <TimelineEntry key={update.id} update={update} />)
              )}
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // If local record exists (offline or pending sync)
  if (localRecord) {
    const localPhotos = localRecord.attachments.filter((a) => a.kind === 'PHOTO');
    const localVoiceNotes = localRecord.attachments.filter((a) => a.kind === 'VOICE');
    const localVideos = localRecord.attachments.filter((a) => a.kind === 'VIDEO');

    let badgeLabel = 'Waiting to sync';
    let badgeBg = '#FEF3C7';
    let badgeColor = '#92400E';
    let badgeBorder = '#FDE68A';

    if (localRecord.syncStatus === 'SYNCING') {
      badgeLabel = 'Syncing…';
      badgeBg = '#DBEAFE';
      badgeColor = '#1E40AF';
      badgeBorder = '#BFDBFE';
    } else if (
      localRecord.syncStatus === 'FAILED_TRANSIENT' ||
      localRecord.syncStatus === 'FAILED_PERMANENT'
    ) {
      badgeLabel = localRecord.syncStatus === 'FAILED_PERMANENT' ? 'Needs Attention' : 'Sync Failed';
      badgeBg = '#FEE2E2';
      badgeColor = '#991B1B';
      badgeBorder = '#FECACA';
    } else if (localRecord.syncStatus === 'SYNCED') {
      badgeLabel = 'Synced';
      badgeBg = '#DCFCE7';
      badgeColor = '#166534';
      badgeBorder = '#BBF7D0';
    }

    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title={localRecord.serverComplaintNo ?? 'Offline Report'} back />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRetrying}
              onRefresh={() => {
                handleRetryLocal();
                complaint.reload();
              }}
            />
          }
        >
          <View>
            <View style={styles.badges}>
              <View
                style={[
                  styles.localBadge,
                  { backgroundColor: badgeBg, borderColor: badgeBorder },
                ]}
              >
                <Text style={[styles.localBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
              </View>
              <PriorityBadge priority={localRecord.priority as Priority} />
            </View>

            <Text style={styles.title}>{localRecord.title}</Text>
            <Text style={styles.description}>{localRecord.description}</Text>

            {localRecord.lastFailureReason ? (
              <View style={styles.failureBox}>
                <Ionicons name="warning-outline" size={18} color="#991B1B" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.failureTitle}>Sync Error</Text>
                  <Text style={styles.failureText}>{localRecord.lastFailureReason}</Text>
                </View>
              </View>
            ) : null}

            {localRecord.syncStatus === 'FAILED_PERMANENT' &&
            localRecord.lastFailureReason?.includes('Missing local attachment file') ? (
              <View style={styles.recoveryCard}>
                <View style={styles.recoveryCardHeader}>
                  <Ionicons name="build-outline" size={18} color="#991B1B" />
                  <Text style={styles.recoveryCardTitle}>Evidence Recovery Options</Text>
                </View>
                <Text style={styles.recoveryCardBody}>
                  An attachment file is missing from device storage. You can remove the missing attachment to proceed with text details, or retry if you restored the file.
                </Text>
                <Pressable
                  style={[styles.removeMissingButton, isRetrying && { opacity: 0.6 }]}
                  onPress={handleRemoveMissingAttachmentsAndRetry}
                  disabled={isRetrying}
                  accessibilityLabel="Remove missing attachment and retry"
                  accessibilityRole="button"
                >
                  {isRetrying ? (
                    <ActivityIndicator size="small" color="#B91C1C" style={{ marginRight: 6 }} />
                  ) : (
                    <Ionicons name="trash-outline" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.removeMissingButtonText}>
                    {isRetrying ? 'Recovering…' : 'Remove Missing Attachment & Retry'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {(localRecord.syncStatus === 'FAILED_TRANSIENT' ||
              localRecord.syncStatus === 'FAILED_PERMANENT') && (
              <Pressable
                style={styles.retryButton}
                onPress={handleRetryLocal}
                disabled={isRetrying}
                accessibilityLabel="Retry syncing this complaint"
                accessibilityRole="button"
              >
                {isRetrying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.retryButtonText}>Retry Sync Now</Text>
                  </>
                )}
              </Pressable>
            )}

            <Card title="Local Details">
              <Row label="Recorded Locally" value={formatDateTime(localRecord.createdAt)} />
              <Row label="Vehicle" value={localRecord.vehicleNumber ?? 'Not recorded'} />
              <Row label="Category" value={localRecord.category} />
              {localRecord.locationName ? (
                <Row label="Location" value={localRecord.locationName} />
              ) : null}
              <Row label="Sync Status" value={badgeLabel} />
              {localRecord.retryCount > 0 ? (
                <Row label="Retry Attempts" value={String(localRecord.retryCount)} />
              ) : null}
            </Card>

            {localPhotos.length > 0 ? (
              <Card title={localPhotos.length === 1 ? 'Photo' : 'Photos'}>
                {localPhotos.map((att) => (
                  <Image
                    key={att.id}
                    source={{ uri: att.localUri }}
                    style={styles.photo}
                    resizeMode="cover"
                    accessibilityLabel={att.fileName}
                  />
                ))}
              </Card>
            ) : null}

            {localVoiceNotes.length > 0 ? (
              <Card title={localVoiceNotes.length === 1 ? 'Voice Note' : 'Voice Notes'}>
                {localVoiceNotes.map((att) => (
                  <View key={att.id} style={styles.localAttachmentRow}>
                    <Ionicons name="mic" size={20} color="#1D4ED8" />
                    <Text style={styles.localAttachmentName}>{att.fileName}</Text>
                    <Text style={styles.localAttachmentSize}>
                      {Math.round(att.fileSize / 1024)} KB
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {localVideos.length > 0 ? (
              <Card title={localVideos.length === 1 ? 'Video Clip' : 'Video Clips'}>
                {localVideos.map((att) => (
                  <View key={att.id} style={styles.localAttachmentRow}>
                    <Ionicons name="videocam" size={20} color="#1D4ED8" />
                    <Text style={styles.localAttachmentName}>{att.fileName}</Text>
                    <Text style={styles.localAttachmentSize}>
                      {Math.round(att.fileSize / 1024)} KB
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Report" back />
      <ScrollView contentContainerStyle={styles.content}>
        {complaint.error ? (
          <ErrorNotice error={complaint.error} onRetry={complaint.reload} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Voice player component for voice attachments */
function VoiceAttachmentPlayer({ attachment }: { attachment: ComplaintAttachmentPublic }): ReactElement {
  // Cloudinary video pipeline may assign .mp4 URL; replace with .m4a so Cloudinary delivers pure audio without video stream
  const audioUrl = attachment.url ? attachment.url.replace(/\.mp4(\?.*)?$/i, '.m4a$1') : '';
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);

  const togglePlayback = async (): Promise<void> => {
    try {
      console.log('[VoicePlayer] togglePlayback', {
        audioUrl,
        playing: status.playing,
        isLoaded: status.isLoaded,
        isBuffering: status.isBuffering,
        currentTime: status.currentTime,
        duration: status.duration,
        didJustFinish: status.didJustFinish,
        error: status.error,
      });

      if (status.playing) {
        player.pause();
        return;
      }

      // Configure Android & iOS audio routing to ensure audio outputs via loudspeaker
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
          interruptionMode: 'duckOthers',
        });
      } catch (modeErr) {
        console.warn('[VoicePlayer] setAudioModeAsync error:', modeErr);
      }

      player.volume = 1.0;

      // If playback already finished or near end, seek back to beginning to replay
      const isAtEnd =
        status.didJustFinish ||
        (status.duration > 0 && status.currentTime >= status.duration - 0.2);
      if (isAtEnd) {
        await player.seekTo(0);
      }

      player.play();
    } catch (err) {
      console.warn('[VoicePlayer] Play error:', err);
    }
  };

  const durationText = attachment.durationSec ? ` (${formatDuration(attachment.durationSec)})` : '';
  const progressText =
    status.playing || status.currentTime > 0
      ? ` · ${formatDuration(Math.floor(status.currentTime))} / ${formatDuration(Math.floor(status.duration || attachment.durationSec || 0))}`
      : '';

  let buttonLabel = 'Play Voice Note';
  if (status.playing) {
    buttonLabel = 'Pause Voice Note';
  } else if (status.isBuffering) {
    buttonLabel = 'Loading Voice Note…';
  } else if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.2)) {
    buttonLabel = 'Replay Voice Note';
  }

  return (
    <View style={styles.attachmentWrapper}>
      <Text style={styles.voiceAttachedText}>
        🎙️ Voice note attached{durationText}{progressText}
      </Text>
      <Button
        label={buttonLabel}
        variant="secondary"
        onPress={togglePlayback}
      />
      {status.error ? (
        <Text style={styles.errorText}>Playback error: {status.error}</Text>
      ) : null}
    </View>
  );
}

/** Video player component for video attachments */
function VideoAttachmentPlayer({ attachment }: { attachment: ComplaintAttachmentPublic }): ReactElement {
  const player = useVideoPlayer(attachment.url);

  return (
    <View style={styles.attachmentWrapper}>
      <VideoView
        player={player}
        style={styles.photo}
        contentFit="contain"
        nativeControls
        accessibilityLabel="Attached video clip"
      />
    </View>
  );
}

/**
 * One line of the complaint's audit trail. This is what tells a driver that someone actually
 * looked at their report, so the author's name and the note are shown, not just the new status.
 */
function TimelineEntry({ update }: { update: ComplaintUpdatePublic }): ReactElement {
  const change =
    update.fromStatus && update.toStatus && update.fromStatus !== update.toStatus
      ? `${formatEnum(update.fromStatus)} → ${formatEnum(update.toStatus)}`
      : update.toStatus
        ? `${formatEnum(update.toStatus)} Update`
        : 'Updated';

  return (
    <View style={styles.entry}>
      <Text style={styles.entryChange}>{change}</Text>
      {update.note ? <Text style={styles.entryNote}>{update.note}</Text> : null}
      <Text style={styles.entryMeta}>
        {update.author ? fullName(update.author) : 'System'} · {formatDateTime(update.createdAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  badges: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  description: {
    fontSize: fontSize.body,
    color: colors.text,
    lineHeight: 24,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  photo: {
    width: '100%',
    height: 240,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralSurface,
    marginBottom: spacing.md,
  },
  attachmentWrapper: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  voiceAttachedText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  entry: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
    marginBottom: spacing.lg,
  },
  entryChange: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  entryNote: { fontSize: fontSize.body, color: colors.text, marginTop: spacing.xs },
  entryMeta: { fontSize: fontSize.small, color: colors.textMuted, marginTop: spacing.xs },
  errorText: { fontSize: fontSize.small, color: colors.danger, marginTop: spacing.xs },
  localBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  localBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  failureBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  failureTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2,
  },
  failureText: {
    fontSize: 12,
    color: '#B91C1C',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  localAttachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  localAttachmentName: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  localAttachmentSize: {
    fontSize: 12,
    color: '#64748B',
  },
  recoveryCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  recoveryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  recoveryCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  recoveryCardBody: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  removeMissingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  removeMissingButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
});

