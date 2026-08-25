/**
 * Stub for expo-audio.
 *
 * expo-audio requires a custom native build and has no SDK 52/54 release on npm.
 * This stub lets the app load in Expo Go — audio recording and playback are
 * disabled, but everything else works.
 */

// --- Recording stubs ---
export const AudioQuality = { LOW: 0, MEDIUM: 1, HIGH: 2 };
export const IOSOutputFormat = { MPEG4AAC: 'aac' };

export async function requestRecordingPermissionsAsync() {
  return { granted: false, canAskAgain: false, status: 'undetermined' };
}

export async function setAudioModeAsync() {}

export function useAudioRecorder() {
  return {
    uri: null,
    stop: async () => {},
    prepareToRecordAsync: async () => {},
    record: () => {},
  };
}

export function useAudioRecorderState(_recorder, _interval) {
  return { isRecording: false, durationMillis: 0 };
}

// --- Playback stubs ---
export function useAudioPlayer() {
  return {
    play: () => {},
    pause: () => {},
    seekTo: () => {},
    currentTime: 0,
    duration: 0,
    playing: false,
  };
}

export function useAudioPlayerStatus() {
  return { isLoaded: false, isPlaying: false, positionMillis: 0, durationMillis: 0 };
}
