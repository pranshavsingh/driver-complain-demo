import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
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
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export function useVoiceRecorder(onRecorded: (note: VoiceNote) => void): VoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const stop = useCallback((): void => {
    if (!recordingRef.current) return;
    clearTimer();
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);

    void (async () => {
      try {
        await rec.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        const uri = rec.getURI();
        if (!uri) {
          setError('The recording could not be saved. Try again.');
          return;
        }
        const durationSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        onRecorded({
          uri,
          name: 'voice.m4a',
          type: 'audio/m4a',
          durationSec,
        });
      } catch (err) {
        console.warn('Error stopping recording:', err);
        setError('Failed to stop recording.');
      }
    })();
  }, [clearTimer, onRecorded]);

  const cancel = useCallback((): void => {
    clearTimer();
    if (recordingRef.current) {
      const rec = recordingRef.current;
      recordingRef.current = null;
      setIsRecording(false);
      void (async () => {
        try {
          await rec.stopAndUnloadAsync();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        } catch {
          // ignore
        }
      })();
    }
    setElapsedSec(0);
  }, [clearTimer]);

  const start = useCallback((): void => {
    setError(null);
    void (async () => {
      try {
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          setError('Microphone access refused. Please allow access in Settings.');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );

        recordingRef.current = recording;
        startTimeRef.current = Date.now();
        setIsRecording(true);
        setElapsedSec(0);

        timerRef.current = setInterval(() => {
          const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedSec(currentElapsed);

          if (currentElapsed >= MAX_VOICE_SECONDS) {
            stop();
          }
        }, 500);
      } catch (err) {
        console.warn('Could not start recording:', err);
        setError('Failed to start microphone. Please try again.');
        setIsRecording(false);
      }
    })();
  }, [stop]);

  return {
    isRecording,
    elapsedSec,
    error,
    start,
    stop,
    cancel,
  };
}
