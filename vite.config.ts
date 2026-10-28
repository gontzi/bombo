/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is ~600 kB minified; it lives with the hall (and its guide) in a lazily loaded chunk.
    chunkSizeWarningLimit: 1300,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
