import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkgJson = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8')
) as { version?: string };

const APP_VERSION = pkgJson.version || '2.0.0';

function eraVersionManifestPlugin(version: string, buildId: string): Plugin {
  return {
    name: 'era-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version, buildId }, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const buildId = mode === 'development' ? 'dev' : String(Date.now());
  const cachePrefix = `era-v${APP_VERSION}`;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      eraVersionManifestPlugin(APP_VERSION, buildId),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false,
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        workbox: {
          cacheId: cachePrefix,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}'],
          globIgnores: ['**/version.json', '**/manifest.json', '**/sw-notifications.js'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/\.well-known\//, /^\/version\.json/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          importScripts: ['/sw-notifications.js'],
          runtimeCaching: [
            {
              urlPattern: /\/version\.json/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/manifest\.json/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: `${cachePrefix}-manifest-cache`,
                networkTimeoutSeconds: 3,
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: `${cachePrefix}-google-fonts-cache`,
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: `${cachePrefix}-gstatic-fonts-cache`,
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
