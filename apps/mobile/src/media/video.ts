import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  VIDEO_BITRATE,
  VIDEO_MAX_DIMENSION,
} from './limits';

/**
 * react-native-compressor (backed by react-native-nitro-modules) is a CUSTOM native module, so it
 * is absent from Expo Go. Its type is imported type-only (erased at build time) and the module
 * itself is loaded lazily via require() — never a top-level import — so the report screen still
 * opens under Expo Go for iterating on the rest of the app. A development or production build
 * resolves it normally. This mirrors the guarded require in src/push/messaging.ts.
 */
type CompressorApi = typeof import('react-native-compressor');

/**
 * True everywhere except Expo Go. Expo Go reports the `storeClient` execution environment and
 * cannot load custom native modules, so video capture is only offered when this is true. Computed
 * from expo-constants alone: it must NOT require the compressor, or that require would run at
 * startup and crash Expo Go — the very thing this indirection avoids.
 */
export const videoCaptureAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

function loadCompressor(): CompressorApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-compressor') as CompressorApi;
  } catch {
    // Missing native module — running under Expo Go, or a build where it failed to link.
    return null;
  }
}


/** A clip ready to upload, in the shape the upload FormData wants. */
export interface VideoClip {
  uri: string;
  name: string;
  type: string;
  /** Display only — the stored duration comes from Cloudinary, server-side. */
  durationSec: number;
  bytes: number;
}

export type CaptureVideoResult =
  | { status: 'ok'; clip: VideoClip }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const megabytes = (bytes: number): string => `${String(Math.round(bytes / (1024 * 1024)))} MB`;

/**
 * Record a clip with the camera and compress it before it goes anywhere near the network.
 *
 * Camera only, no gallery: `expo-image-picker`'s `videoQuality` is iOS-only, so on Android the
 * picker hands back whatever the camera produced — 30 seconds at 30–150 MB, unsendable on 3G.
 * The transcode is therefore not an optimisation, it is what makes video work at all. Capturing
 * rather than picking also means the evidence was shot at the scene, not chosen from a camera roll.
 *
 * `onProgress` receives the transcode progress as a 0–1 fraction; it runs for tens of seconds on
 * a cheap phone, so the caller must show it.
 */
export async function captureVideo(
  onProgress?: (fraction: number) => void,
): Promise<CaptureVideoResult> {
  // Gate before the camera is even opened, so an Expo Go user is not asked to film a clip that
  // then cannot be processed. EvidencePicker also hides the button (see videoCaptureAvailable),
  // making this the belt-and-braces check rather than the only one.
  const compressor = videoCaptureAvailable ? loadCompressor() : null;
  if (!compressor) {
    return {
      status: 'error',
      message:
        'Recording video needs the installed app — Expo Go cannot compress video. Attach a photo or a voice note instead.',
    };
  }
  const { Video, getVideoMetaData } = compressor;

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return {
      status: 'error',
      message:
        'Camera access is off. Allow it in Settings to record a video, or send the report without one.',
    };
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    // The only duration cap the picker honours on both platforms.
    videoMaxDuration: MAX_VIDEO_SECONDS,
  });
  if (result.canceled) return { status: 'cancelled' };

  const asset = result.assets[0];
  if (!asset) return { status: 'error', message: 'The camera returned no video. Try again.' };

  let uri = asset.uri;
  try {
    uri = await Video.compress(
      asset.uri,
      {
        // 'manual' is what makes bitrate and maxSize apply at all; 'auto' ignores both.
        compressionMethod: 'manual',
        maxSize: VIDEO_MAX_DIMENSION,
        bitrate: VIDEO_BITRATE,
        // Default is to skip small files. A 30 s clip must be transcoded whatever its size —
        // the point is the bitrate, not just the total.
        minimumFileSizeForCompress: 0,
      },
      onProgress,
    );
  } catch {
    // Fall through with the original file. It is usually too big and gets refused by the size
    // check below, but a short clip from a low-resolution camera can pass — better to send that
    // than to lose the evidence because the transcoder failed.
    uri = asset.uri;
  }

  const meta = await getVideoMetaData(uri);
  if (meta.size > MAX_VIDEO_BYTES) {
    return {
      status: 'error',
      message: `That video is ${megabytes(meta.size)} after compression, over the ${megabytes(
        MAX_VIDEO_BYTES,
      )} limit. Record a shorter clip.`,
    };
  }

  return {
    status: 'ok',
    clip: {
      uri,
      name: 'video.mp4',
      type: 'video/mp4',
      durationSec: Math.round(meta.duration),
      bytes: meta.size,
    },
  };
}
