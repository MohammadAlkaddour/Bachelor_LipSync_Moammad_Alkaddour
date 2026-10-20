import { defineConfig } from 'vite';

import { generateAssetMetrics } from './scripts/generateAssetMetrics.mjs';

// Cross-origin isolation raises performance.now() precision from ~100 µs to ~5 µs.
const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: CROSS_ORIGIN_ISOLATION_HEADERS },
  preview: { headers: CROSS_ORIGIN_ISOLATION_HEADERS },
  plugins: [
    {
      name: 'asset-metrics',
      // Runs on dev and build, so the GLB sizes always match the files on disk.
      async buildStart() {
        await generateAssetMetrics();
      },
    },
  ],
});
