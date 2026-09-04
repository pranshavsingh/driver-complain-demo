declare module 'expo-audio' {
  export const AudioQuality: unknown;
  export const IOSOutputFormat: unknown;
  export function requestRecordingPermissionsAsync(): Promise<unknown>;
  export function setAudioModeAsync(options?: unknown): Promise<void>;
  export function useAudioRecorder(options?: unknown): unknown;
  export function useAudioRecorderState(recorder?: unknown, interval?: number): unknown;
  export function useAudioPlayer(source?: unknown): unknown;
  export function useAudioPlayerStatus(player?: unknown): unknown;
  export type RecordingOptions = unknown;
}

declare module 'expo-video' {
  export const VideoView: unknown;
  export function useVideoPlayer(source?: unknown, setup?: unknown): unknown;
}

declare module '@expo/vector-icons' {
  export const Ionicons: unknown;
  export const MaterialCommunityIcons: unknown;
  export const FontAwesome: unknown;
  export const Feather: unknown;
}

declare module 'expo-av' {
  export const Audio: unknown;
  export const Video: unknown;
}

declare module 'expo-location' {
  export const Accuracy: unknown;
  export function requestForegroundPermissionsAsync(): Promise<unknown>;
  export function getCurrentPositionAsync(options?: unknown): Promise<unknown>;
  export function reverseGeocodeAsync(coords: unknown): Promise<unknown>;
}
