import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  define: {
    __DEV__: true,
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'expo-sqlite': path.resolve(__dirname, 'src/test/mocks/expo-sqlite.ts'),
      'expo-file-system/legacy': path.resolve(__dirname, 'src/test/mocks/expo-file-system.ts'),
      'expo-file-system': path.resolve(__dirname, 'src/test/mocks/expo-file-system.ts'),
      'expo-secure-store': path.resolve(__dirname, 'src/test/mocks/expo-secure-store.ts'),
    },
  },
});
