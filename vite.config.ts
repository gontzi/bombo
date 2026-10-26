/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is ~600 kB minified; it lives in its own lazily loaded chunk.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
