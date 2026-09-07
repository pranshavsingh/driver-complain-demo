import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, PermissionsAndroid, Linking } from 'react-native';
import {
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  type RecordingOptions,
  IOSOutputFormat,
  AudioQuality,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { MAX_VOICE_SECONDS } from './limits';

export interface VoiceNote {
  uri: string;
  name: string;
  type: string;
  durationSec: number;
}

export interface VoiceRecorder {
  isRecording: boolean;
  elapsedSec: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
}

/**
 * Standard recording options: High quality AAC in m4a container.
 */
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 2,
  bitRate: 128000,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

/**
 * Check and request microphone permission.
 * Returns true if microphone permission is granted.
 */
async function checkAndRequestMicPermission(): Promise<boolean> {
  // 1. Check native OS permission on Android first
  if (Platform.OS === 'android') {
    try {
      const alreadyGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (alreadyGranted) return true;

      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Required',
          message:
            'Driver Complaint needs microphone access so you can record voice notes for vehicle problems.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        return true;
      }
    } catch (e) {
      console.warn('[recorder] PermissionsAndroid check error:', e);
    }
  }

  // 2. Try expo-audio permission request
  try {
    if (typeof requestRecordingPermissionsAsync === 'function') {
      const resp = await requestRecordingPermissionsAsync();
      console.log('[recorder] requestRecordingPermissionsAsync:', JSON.stringify(resp));
      if (resp && resp.granted) return true;
    }
  } catch (e) {
    console.warn('[recorder] expo-audio permission check error:', e);
  }

  return false;
}

interface ValidatedRecording {
  valid: true;
  normalizedUri: string;
  size: number;
}

interface InvalidRecording {
  valid: false;
  reason: string;
}

type RecordingValidationResult = ValidatedRecording | InvalidRecording;

/**
 * Enterprise validation: verifies that the recording URI belongs strictly to the current recording session,
 * is an actual non-empty file on disk, and was created during this session.
 * NEVER guesses or falls back to old cache files.
 */
async function validateCurrentSessionRecording(
  rawUri: string | null | undefined,
  sessionStartTimeMs: number,
): Promise<RecordingValidationResult> {
  if (!rawUri || typeof rawUri !== 'string' || rawUri.trim().length === 0) {
    return { valid: false, reason: 'Recorder did not return a valid file URI for this session' };
  }

  let normalized = rawUri.trim();
  if (normalized.startsWith('file:/') && !normalized.startsWith('file:///')) {
    normalized = normalized.replace(/^file:\/+/, 'file:///');
  } else if (normalized.startsWith('/')) {
    normalized = `file://${normalized}`;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(normalized);
    if (!fileInfo.exists) {
      return { valid: false, reason: `Recording file does not exist at ${normalized}` };
    }
    if (fileInfo.isDirectory) {
      return { valid: false, reason: `Recording URI points to a directory, not a file: ${normalized}` };
    }
    if (fileInfo.size === undefined || fileInfo.size <= 0) {
      return { valid: false, reason: 'Recording file is empty (0 bytes)' };
    }

    // Check modification time if available to ensure this file was produced in the current session
    if (typeof fileInfo.modificationTime === 'number' && fileInfo.modificationTime > 0) {
      const modTimeMs =
        fileInfo.modificationTime > 1e11
          ? fileInfo.modificationTime
          : fileInfo.modificationTime * 1000;
      // Allow 3s grace period before sessionStartTimeMs for platform clock jitter
      if (modTimeMs < sessionStartTimeMs - 3000) {
        return {
          valid: false,
          reason: `Stale file detected: modification time (${new Date(modTimeMs).toISOString()}) is older than session start (${new Date(sessionStartTimeMs).toISOString()})`,
        };
      }
    }

    return { valid: true, normalizedUri: normalized, size: fileInfo.size };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `Filesystem inspection failed: ${msg}` };
  }
}

export function useVoiceRecorder(onRecorded: (note: VoiceNote) => void): VoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const capturedUriRef = useRef<string | null>(null);

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS, (status) => {
    console.log('[recorder] status update:', JSON.stringify(status));
    if (status?.url) {
      capturedUriRef.current = status.url;
    }
  });
  const recorderState = useAudioRecorderState(recorder, 250);

  // Live timer tick while recording is active
  useEffect(() => {
    if (!isRecording) {
      setElapsedSec(0);
      return;
    }
    const interval = setInterval(() => {
      const ms = Date.now() - startTimeRef.current;
      setElapsedSec(Math.floor(ms / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [isRecording]);

  const start = useCallback(async (): Promise<void> => {
    if (recordingRef.current) return;
    setError(null);
    capturedUriRef.current = null;

    try {
      // Step 1: Check microphone permission
      const granted = await checkAndRequestMicPermission();
      console.log('[recorder] microphone permission granted:', granted);

      if (!granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Microphone permission is currently disabled for Expo Go. Please open Settings and allow Microphone access.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                void Linking.openSettings();
              },
            },
          ],
        );
        setError('Microphone permission denied');
        return;
      }

      // Step 2: Configure audio session for recording
      if (typeof setAudioModeAsync === 'function') {
        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
          });
        } catch (modeErr) {
          console.warn('[recorder] setAudioModeAsync error:', modeErr);
        }
      }

      // Step 3: Prepare the recorder with options
      try {
        if (typeof recorder.prepareToRecordAsync === 'function') {
          await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
        }
      } catch (prepErr) {
        // Can throw if already prepared; safe to proceed to record
        console.log('[recorder] prepareToRecordAsync notice:', prepErr);
      }

      // Step 4: Start recording session
      startTimeRef.current = Date.now();
      recorder.record();
      recordingRef.current = true;
      setIsRecording(true);

      const status = typeof recorder.getStatus === 'function' ? recorder.getStatus() : null;
      const initialUri = status?.url || (recorder as unknown as { uri?: string })?.uri || null;
      if (initialUri) {
        capturedUriRef.current = initialUri;
      }
      console.log('[recorder] Recording active! sessionStartTime:', startTimeRef.current);
    } catch (e: unknown) {
      console.warn('[recorder] start error:', e);
      recordingRef.current = false;
      setIsRecording(false);
      const msg =
        e instanceof Error
          ? e.message
          : 'Could not start recording. Check microphone permissions.';
      setError(msg);
      Alert.alert('Recording Error', msg);
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<void> => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setIsRecording(false);
    const sessionStartTime = startTimeRef.current;

    try {
      // Buffer minimum 800ms before stop so MediaRecorder has time to write audio headers
      const elapsedMs = Date.now() - (sessionStartTime || 0);
      if (elapsedMs < 800) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 800 - elapsedMs);
        });
      }

      const durSec = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));

      // 1. Get status URL before stopping
      let preStopUrl: string | null = null;
      try {
        if (typeof recorder.getStatus === 'function') {
          const st = recorder.getStatus();
          if (st?.url) preStopUrl = st.url;
        }
      } catch {
        // ignore
      }

      // 2. Stop recorder and capture returned status bundle
      let stopResultUrl: string | null = null;
      if (typeof recorder.stop === 'function') {
        try {
          const stopResult = (await recorder.stop()) as { url?: string } | undefined;
          console.log('[recorder] stopResult:', JSON.stringify(stopResult));
          if (stopResult?.url) {
            stopResultUrl = stopResult.url;
          }
        } catch (stopErr) {
          console.warn('[recorder] stop() call error:', stopErr);
        }
      }

      // 3. Immediately restore audio session to loudspeaker playback mode
      if (typeof setAudioModeAsync === 'function') {
        try {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldRouteThroughEarpiece: false,
            interruptionMode: 'duckOthers',
          });
        } catch {
          // Non-fatal
        }
      }

      // 4. Resolve candidate URI strictly from THIS recording session
      const candidateUri =
        stopResultUrl ||
        capturedUriRef.current ||
        preStopUrl ||
        recorder.uri ||
        recorderState.url ||
        null;

      // 5. Strict session validation — NEVER search cache or fallback to old files!
      const validation = await validateCurrentSessionRecording(candidateUri, sessionStartTime);

      if (!validation.valid) {
        console.warn('[recorder] Recording session rejected:', {
          reason: validation.reason,
          candidateUri,
          sessionStartTime,
          elapsedMs: Date.now() - sessionStartTime,
        });

        const userMsg = "We couldn't save your voice recording. Please try recording again.";
        setError(userMsg);
        Alert.alert('Recording Failed', userMsg);
        return;
      }

      console.log('[recorder] Validated recording URI:', validation.normalizedUri, 'size:', validation.size, 'duration:', durSec);

      onRecorded({
        uri: validation.normalizedUri,
        name: 'voice.m4a',
        type: 'audio/m4a',
        durationSec: durSec,
      });
    } catch (e) {
      console.warn('[recorder] stop error:', e);
      setError('Failed to stop recording');
    }
  }, [recorder, recorderState.url, onRecorded]);

  const cancel = useCallback(async (): Promise<void> => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setIsRecording(false);
    try {
      if (typeof recorder.stop === 'function') {
        await recorder.stop();
      }
      if (typeof setAudioModeAsync === 'function') {
        try {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldRouteThroughEarpiece: false,
            interruptionMode: 'duckOthers',
          });
        } catch {
          // Non-fatal
        }
      }
    } catch {
      // Silently ignore cancel errors
    }
  }, [recorder]);

  // Auto-stop when max duration reached
  if (isRecording && elapsedSec >= MAX_VOICE_SECONDS) {
    void stop();
  }

  return {
    isRecording,
    elapsedSec,
    error,
    start,
    stop,
    cancel,
  };
}


