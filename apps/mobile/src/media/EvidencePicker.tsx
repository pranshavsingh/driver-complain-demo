import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { EvidenceUpload, FileToUpload } from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { formatDuration } from '../lib/format';
import { colors, fontSize, radius, spacing } from '../theme';
import { MAX_PHOTO_BYTES, MAX_VIDEO_SECONDS, MAX_VOICE_SECONDS, PHOTO_QUALITY } from './limits';
import { useVoiceRecorder, type VoiceNote } from './recorder';
import { captureVideo, videoCaptureAvailable, type VideoClip } from './video';

/** What the driver has attached so far. At most one file of each kind. */
export interface EvidenceState {
  photo: FileToUpload | null;
  voice: VoiceNote | null;
  video: VideoClip | null;
}

export const NO_EVIDENCE: EvidenceState = { photo: null, voice: null, video: null };

/** Drop the display-only fields (durations, sizes) and keep what the upload needs. */
export function toEvidenceUpload(evidence: EvidenceState): EvidenceUpload {
  const file = (f: FileToUpload | null): FileToUpload | undefined =>
    f ? { uri: f.uri, name: f.name, type: f.type } : undefined;
  return {
    photo: file(evidence.photo),
    voice: file(evidence.voice),
    video: file(evidence.video),
  };
}

interface Props {
  value: EvidenceState;
  onChange: (next: EvidenceState) => void;
  disabled?: boolean;
}

const PHOTO_LIMIT_MB = String(Math.round(MAX_PHOTO_BYTES / (1024 * 1024)));
const VOICE_LIMIT_MINUTES = String(Math.round(MAX_VOICE_SECONDS / 60));

/**
 * The evidence card on the report form: one photo, one voice note, one video, all optional.
 *
 * Everything here is deliberately skippable. A driver standing in the rain with a dead battery
 * must be able to send the report with nothing but text, so no attachment ever blocks submit and
 * every failure ends in an alert plus an unchanged form rather than a dead end.
 */
export function EvidencePicker({ value, onChange, disabled = false }: Props): ReactElement {
  const [videoProgress, setVideoProgress] = useState<number | null>(null);

  const set = (patch: Partial<EvidenceState>): void => {
    onChange({ ...value, ...patch });
  };

  const recorder = useVoiceRecorder((voice) => {
    set({ voice });
  });

  const attachPhoto = (asset: ImagePicker.ImagePickerAsset): void => {
    if (asset.fileSize !== undefined && asset.fileSize > MAX_PHOTO_BYTES) {
      Alert.alert(
        'Photo too large',
        `That photo is over ${PHOTO_LIMIT_MB} MB. Take a new one with the camera instead of sending the original file.`,
      );
      return;
    }
    set({
      photo: {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        // Some Android gallery providers report no MIME type. The API only accepts image/*, and
        // the picker was restricted to images, so defaulting to JPEG is safe rather than a guess
        // that could smuggle something else past the server's check.
        type: asset.mimeType ?? 'image/jpeg',
      },
    });
  };

  const takePhoto = (): void => {
    void (async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera not allowed',
          'Allow camera access in Settings to attach a photo, or send the report without one.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset) attachPhoto(asset);
    })();
  };

  const choosePhoto = (): void => {
    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset) attachPhoto(asset);
    })();
  };

  const recordVideo = (): void => {
    void (async () => {
      setVideoProgress(0);
      const result = await captureVideo((fraction) => {
        setVideoProgress(fraction);
      });
      setVideoProgress(null);
      if (result.status === 'ok') {
        set({ video: result.clip });
      } else if (result.status === 'error') {
        Alert.alert('Video not attached', result.message);
      }
    })();
  };

  const busy = disabled || recorder.isRecording || videoProgress !== null;

  return (
    <Card title="Evidence (optional)">
      <Text style={styles.intro}>
        A photo, a spoken description or a short clip helps the workshop bring the right parts.
      </Text>

      <View style={styles.slot}>
        <Text style={styles.slotLabel}>Photo</Text>
        {value.photo ? (
          <View>
            <Image
              source={{ uri: value.photo.uri }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityLabel="The photo you attached"
            />
            <Button
              label="Remove photo"
              variant="secondary"
              disabled={busy}
              onPress={() => {
                set({ photo: null });
              }}
            />
          </View>
        ) : (
          <View style={styles.actions}>
            <Button
              label="Take a photo"
              variant="secondary"
              disabled={busy}
              onPress={takePhoto}
            />
            <Button
              label="Choose from gallery"
              variant="secondary"
              disabled={busy}
              onPress={choosePhoto}
            />
          </View>
        )}
      </View>

      <View style={styles.slot}>
        <Text style={styles.slotLabel}>Voice note</Text>
        {recorder.isRecording ? (
          <View style={styles.actions}>
            <Text style={styles.recording}>
              Recording {formatDuration(recorder.elapsedSec)} of{' '}
              {formatDuration(MAX_VOICE_SECONDS)}
            </Text>
            <Button label="Stop recording" onPress={recorder.stop} />
            <Button label="Discard" variant="secondary" onPress={recorder.cancel} />
          </View>
        ) : value.voice ? (
          <VoicePreview
            uri={value.voice.uri}
            durationSec={value.voice.durationSec}
            disabled={busy}
            onRemove={() => {
              set({ voice: null });
            }}
          />
        ) : (
          <View style={styles.actions}>
            <Text style={styles.hint}>
              Say what is wrong instead of typing it — up to {VOICE_LIMIT_MINUTES} minutes.
            </Text>
            <Button
              label="Record a voice note"
              variant="secondary"
              disabled={busy}
              onPress={recorder.start}
            />
          </View>
        )}
        {recorder.error === null ? null : <Text style={styles.error}>{recorder.error}</Text>}
      </View>

      <View>
        <Text style={styles.slotLabel}>Video</Text>
        {videoProgress !== null ? (
          <Text style={styles.recording}>
            Preparing the video — {String(Math.round(videoProgress * 100))}%. Keep the app open.
          </Text>
        ) : value.video ? (
          <VideoPreview
            uri={value.video.uri}
            durationSec={value.video.durationSec}
            disabled={busy}
            onRemove={() => {
              set({ video: null });
            }}
          />
        ) : !videoCaptureAvailable ? (
          // Expo Go cannot compress video (see src/media/video.ts). Say so plainly rather than
          // showing a button that only errors; a photo or voice note covers most reports.
          <Text style={styles.hint}>
            Recording video needs the installed app, so it is off in Expo Go. Photo and voice notes
            work here.
          </Text>
        ) : (
          <View style={styles.actions}>
            <Text style={styles.hint}>
              A clip of the noise or the leak, up to {String(MAX_VIDEO_SECONDS)} seconds. It is
              shrunk on the phone before sending, which takes a moment.
            </Text>
            <Button
              label="Record a video"
              variant="secondary"
              disabled={busy}
              onPress={recordVideo}
            />
          </View>
        )}
      </View>
    </Card>
  );
}

/** Play back a recorded note before sending it — the driver should hear what the admin will hear. */
function VoicePreview({
  uri,
  durationSec,
  disabled,
  onRemove,
}: {
  uri: string;
  durationSec: number;
  disabled: boolean;
  onRemove: () => void;
}): ReactElement {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<{ pauseAsync: () => Promise<unknown>; unloadAsync: () => Promise<unknown> } | null>(null);

  const toggle = (): void => {
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
          { uri },
          { shouldPlay: true },
          (status: { isLoaded?: boolean; didJustFinish?: boolean }) => {
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
        console.warn('Playback error:', err);
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

  return (
    <View style={styles.actions}>
      <Text style={styles.attached}>Voice note attached · {formatDuration(durationSec)}</Text>
      <Button
        label={isPlaying ? 'Stop playing' : 'Play it back'}
        variant="secondary"
        onPress={toggle}
      />
      <Button label="Remove voice note" variant="secondary" disabled={disabled} onPress={onRemove} />
    </View>
  );
}

/** Show the compressed clip, so a driver sees what is actually being sent. */
function VideoPreview({
  uri,
  durationSec,
  disabled,
  onRemove,
}: {
  uri: string;
  durationSec: number;
  disabled: boolean;
  onRemove: () => void;
}): ReactElement {
  const player = useVideoPlayer(uri);

  return (
    <View>
      <VideoView
        player={player}
        style={styles.preview}
        contentFit="contain"
        nativeControls
        accessibilityLabel="The video you attached"
      />
      <Text style={styles.attached}>Video attached · {formatDuration(durationSec)}</Text>
      <Button label="Remove video" variant="secondary" disabled={disabled} onPress={onRemove} />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: fontSize.body, color: colors.textMuted, marginBottom: spacing.lg },
  slot: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  slotLabel: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  actions: { gap: spacing.md },
  hint: { fontSize: fontSize.small, color: colors.textMuted },
  attached: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  recording: { fontSize: fontSize.body, fontWeight: '600', color: colors.primary },
  error: { fontSize: fontSize.small, color: colors.danger, marginTop: spacing.sm },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralSurface,
    marginBottom: spacing.md,
  },
});
