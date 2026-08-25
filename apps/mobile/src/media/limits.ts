/**
 * Client-side copies of the API's evidence caps.
 *
 * The server is the authority (apps/api/src/middleware/upload.ts); these exist so a driver on
 * rural 3G is refused in an instant instead of after a two-minute upload that ends in a 400.
 * Keep the two in step — raising one without the other either burns the driver's data or
 * refuses a file the server would have accepted.
 */

const MB = 1024 * 1024;

export const MAX_PHOTO_BYTES = 10 * MB;
export const MAX_VIDEO_BYTES = 25 * MB;

/**
 * Voice notes are bounded by time rather than bytes. At the bitrate below, the 120 s cap puts a
 * full-length note near 500 KB — two orders of magnitude under the server's 10 MB audio limit —
 * so there is nothing a driver could record that the byte check would catch, and reading the
 * file size back would mean pulling in expo-file-system for no benefit.
 */
export const MAX_VOICE_SECONDS = 120;

/** Long enough to walk around a vehicle and point the camera at the fault; short enough to send. */
export const MAX_VIDEO_SECONDS = 30;

/**
 * Photo compression applied by the picker before the file leaves the phone. 0.5 keeps a cracked
 * windscreen or a leaking hose perfectly legible while cutting a 4 MB camera JPEG to a few
 * hundred KB — the difference between a 5-second and a 2-minute upload on rural 3G.
 */
export const PHOTO_QUALITY = 0.5;

/**
 * Voice recording format: AAC in an .m4a container, mono, 32 kbps at 22.05 kHz.
 *
 * Two constraints decide this and neither is negotiable:
 *  - the dashboard plays it in a browser `<audio>` element, which rules out expo-audio's
 *    LOW_QUALITY preset (AMR-NB in .3gp — tiny, but Chrome cannot decode it);
 *  - the driver is on 3G, which rules out the HIGH_QUALITY preset (128 kbps stereo, ~2 MB for a
 *    two-minute note).
 * Mono speech at 32 kbps is clear, universally playable, and about 4 KB per second.
 */
export const VOICE_BITRATE = 32_000;
export const VOICE_SAMPLE_RATE = 22_050;

/**
 * On-device video compression target: 640 px on the long edge at 800 kbps, which puts a 30 s
 * clip near 3 MB. `expo-image-picker`'s own `videoQuality` is iOS-only, so without a native
 * transcoder an Android clip arrives at 30–150 MB and is unsendable — see media/video.ts.
 */
export const VIDEO_MAX_DIMENSION = 640;
export const VIDEO_BITRATE = 800_000;
