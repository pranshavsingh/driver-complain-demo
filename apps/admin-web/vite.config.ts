import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The API's default CORS_ORIGINS is http://localhost:3000, so match it — a fresh clone
    // then works without editing the API's .env. strictPort makes a port clash fail loudly
    // instead of silently moving to 3001, where every API call would be blocked by CORS.
    port: 3000,
    strictPort: true,
  },
  preview: { port: 3000, strictPort: true },
  build: {
    outDir: 'dist',
    // Sourcemaps in production too: this dashboard is the only window into a live fleet, so
    // a stack trace from a real admin needs to point at real code.
    sourcemap: true,
  },
});
