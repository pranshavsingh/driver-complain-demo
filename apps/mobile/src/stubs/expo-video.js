/**
 * Stub for expo-video.
 *
 * expo-video requires a custom native build and has no SDK 52/54 release on npm.
 * This stub lets the app load in Expo Go — video playback is disabled, but
 * everything else works. Video capture was already guarded behind
 * videoCaptureAvailable in video.ts.
 */
import React from 'react';
import { View } from 'react-native';

export function VideoView(props) {
  return React.createElement(View, props);
}

export function useVideoPlayer() {
  return {
    play: () => {},
    pause: () => {},
    seekTo: () => {},
    currentTime: 0,
    duration: 0,
    playing: false,
  };
}
