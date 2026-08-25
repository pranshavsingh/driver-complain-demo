declare module 'expo-audio' {
  export const AudioQuality: any;
  export const IOSOutputFormat: any;
  export function requestRecordingPermissionsAsync(): Promise<any>;
  export function setAudioModeAsync(options?: any): Promise<void>;
  export function useAudioRecorder(options?: any): any;
  export function useAudioRecorderState(recorder?: any, interval?: number): any;
  export function useAudioPlayer(source?: any): any;
  export function useAudioPlayerStatus(player?: any): any;
  export type RecordingOptions = any;
}

declare module 'expo-video' {
  export const VideoView: any;
  export function useVideoPlayer(source?: any, setup?: any): any;
}

declare module '@expo/vector-icons' {
  export const Ionicons: any;
  export const MaterialCommunityIcons: any;
  export const FontAwesome: any;
  export const Feather: any;
}

declare module 'expo-av' {
  export const Audio: any;
  export const Video: any;
}
