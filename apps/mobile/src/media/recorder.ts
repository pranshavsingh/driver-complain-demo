import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, PermissionsAndroid, Linking } from 'react-native';
import {
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  type RecordingOptions,
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
  ...RecordingPresets.HIGH_QUALITY,
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

/**
 * Fallback scanner: locate the newest valid recording file directly from the Expo Audio cache directory.
 */
async function findLatestRecordingFile(): Promise<string | null> {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return null;

    const audioDir = cacheDir + 'Audio/';
    const dirInfo = await FileSystem.getInfoAsync(audioDir);
    if (!dirInfo.exists) return null;

    const files = await FileSystem.readDirectoryAsync(audioDir);
    const m4aFiles = files.filter((f) => f.endsWith('.m4a') || f.endsWith('.3gp'));
    if (m4aFiles.length === 0) return null;

    let newestUri: string | null = null;
    let newestTime = 0;

    for (const file of m4aFiles) {
      const filePath = audioDir + file;
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists && !info.isDirectory && info.size > 0) {
        const modTime = info.modificationTime ?? 0;
        if (modTime >= newestTime) {
          newestTime = modTime;
          newestUri = filePath;
        }
      }
    }

    return newestUri;
  } catch (err) {
    console.warn('[recorder] findLatestRecordingFile error:', err);
    return null;
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

      // Step 3: Prepare the recorder
      try {
        if (typeof recorder.prepareToRecordAsync === 'function') {
          await recorder.prepareToRecordAsync();
        }
      } catch (prepErr) {
        // Can throw if already prepared; safe to proceed to record
        console.log('[recorder] prepareToRecordAsync notice:', prepErr);
      }

      // Step 4: Start recording
      recorder.record();
      startTimeRef.current = Date.now();
      recordingRef.current = true;
      setIsRecording(true);

      const status = typeof recorder.getStatus === 'function' ? recorder.getStatus() : null;
      if (status?.url) {
        capturedUriRef.current = status.url;
      } else if (recorder.uri) {
        capturedUriRef.current = recorder.uri;
      }
      console.log('[recorder] Recording active! status.url =', status?.url, 'recorder.uri =', recorder.uri);
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

    try {
      // Buffer minimum 800ms before stop so MediaRecorder has time to write audio headers
      const elapsedMs = Date.now() - (startTimeRef.current || 0);
      if (elapsedMs < 800) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 800 - elapsedMs);
        });
      }

      const durSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));

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

      // Restore audio session
      if (typeof setAudioModeAsync === 'function') {
        try {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        } catch {
          // Non-fatal
        }
      }

      let finalUri =
        stopResultUrl ||
        capturedUriRef.current ||
        preStopUrl ||
        recorder.uri ||
        recorderState.url ||
        null;

      // Fallback: search Expo Audio cache directory for the recorded file if native property returned empty
      if (!finalUri || finalUri.length === 0) {
        console.log('[recorder] finalUri empty from recorder object, searching cache directory...');
        finalUri = await findLatestRecordingFile();
      }

      // Normalize file URI format without corrupting encoded characters
      if (finalUri && typeof finalUri === 'string') {
        finalUri = finalUri.trim();
        if (finalUri.startsWith('file:/') && !finalUri.startsWith('file:///')) {
          finalUri = finalUri.replace(/^file:\/+/, 'file:///');
        } else if (finalUri.startsWith('/')) {
          finalUri = `file://${finalUri}`;
        }
      }

      console.log('[recorder] Resolved finalUri:', finalUri, 'duration:', durSec);

      if (finalUri && finalUri.length > 0) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(finalUri);
          console.log('[recorder] Verified recording file info:', JSON.stringify(fileInfo));
        } catch (infoErr) {
          console.warn('[recorder] getInfoAsync check error:', infoErr);
        }

        onRecorded({ uri: finalUri, name: 'voice.m4a', type: 'audio/m4a', durationSec: durSec });
      } else {
        setError('No audio captured. Please check microphone permissions.');
        Alert.alert(
          'Microphone / Recording Issue',
          'No audio was captured. Please ensure Microphone permission is allowed for Expo Go in your phone Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
      }
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
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
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

