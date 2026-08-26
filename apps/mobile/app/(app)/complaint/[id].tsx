import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { ComplaintAttachmentPublic, ComplaintUpdatePublic } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { PriorityBadge, StatusBadge } from '../../../src/components/Badges';
import { Button } from '../../../src/components/Button';
import { Card, Row } from '../../../src/components/Card';
import { ErrorNotice } from '../../../src/components/ErrorNotice';
import { Header } from '../../../src/components/Header';
import { LoadingScreen } from '../../../src/components/ScreenState';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { describeVehicle, formatDateTime, formatDuration, formatEnum, fullName } from '../../../src/lib/format';
import { colors, fontSize, radius, spacing } from '../../../src/theme';

export default function ComplaintDetailScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const complaint = useApiResource(`complaint:${id}`, () => api.complaints.get(id));

  if (complaint.loading && complaint.data === null && !complaint.error) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title="Report" back />
        <LoadingScreen label="Loading the report…" />
      </SafeAreaView>
    );
  }

  const data = complaint.data;
  const photos = data?.attachments.filter((a) => a.kind === 'PHOTO') ?? [];
  const voiceNotes = data?.attachments.filter((a) => a.kind === 'VOICE') ?? [];
  const videos = data?.attachments.filter((a) => a.kind === 'VIDEO') ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title={data?.complaintNo ?? 'Report'} back />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={complaint.loading} onRefresh={complaint.reload} />
        }
      >
        {complaint.error ? (
          <ErrorNotice error={complaint.error} onRetry={complaint.reload} />
        ) : null}

        {data ? (
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
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Audio playback player component for voice note attachments */
function VoiceAttachmentPlayer({ attachment }: { attachment: ComplaintAttachmentPublic }): ReactElement {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<any>(null);

  const togglePlayback = (): void => {
    void (async () => {
      try {
        if (isPlaying && soundRef.current) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
          return;
        }

        if (soundRef.current) {
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri: attachment.url },
          { shouldPlay: true },
          (status: any) => {
            if (status.isLoaded) {
              if (status.didJustFinish) {
                setIsPlaying(false);
              }
            }
          },
        );
        soundRef.current = sound;
        setIsPlaying(true);
      } catch (err) {
        console.warn('Voice playback error:', err);
        setIsPlaying(false);
      }
    })();
  };

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
      }
    };
  }, []);

  const durationText = attachment.durationSec ? ` (${formatDuration(attachment.durationSec)})` : '';

  return (
    <View style={styles.attachmentWrapper}>
      <Text style={styles.voiceAttachedText}>🎙️ Voice note attached{durationText}</Text>
      <Button
        label={isPlaying ? 'Pause Voice Note' : 'Play Voice Note'}
        variant="secondary"
        onPress={togglePlayback}
      />
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
        {fullName(update.author)} · {formatDateTime(update.createdAt)}
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
});

