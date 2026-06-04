import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Silent updates — radiologists shouldn't be prompted mid-report.
      registerType: 'autoUpdate',
      // Service worker breaks HMR in dev; only generate it on build.
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'Logo.png'],
      manifest: {
        name: '1Rad NexEagle',
        short_name: '1Rad',
        description: 'Radiology Management & Reporting System',
        theme_color: '#0f172a',
        background_color: '#060a12',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'Logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'Logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'Logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache app shell. Large DICOM-related chunks can blow past the default 2 MB limit.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Don't intercept anything the page itself shouldn't ever hit through SW:
        // SPA navigations are handled below; static assets above; runtime caches further down.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // Never serve the SPA shell for API or auth requests if they 404 — let them fail honestly.
          /^\/api\//,
          /\/auth\//,
        ],
        runtimeCaching: [
          // Auth: NEVER cache. Tokens and 401s would be poisonous in cache.
          {
            urlPattern: ({ url }) => /\/api\/v1\/auth\//.test(url.pathname),
            handler: 'NetworkOnly',
          },

          // Worklist GETs: NetworkFirst — fresh when online, last-known when offline.
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /\/api\/v1\/appointments(?:\?|$)/.test(url.pathname + url.search),
            handler: 'NetworkFirst',
            options: {
              cacheName: '1rad-worklist',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // Single appointment GETs
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /\/api\/v1\/appointments\/[^/]+$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: '1rad-appointment',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // Study asset lists (the manifest, NOT the ZIP blob itself)
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /\/api\/v1\/Study\/[^/]+\/assets/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: '1rad-study-assets',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // Anything else under /api/v1 → NetworkOnly so we don't accidentally serve stale POST/PATCH or
          // PHI-bearing endpoints we haven't explicitly classified.
          {
            urlPattern: ({ url }) => /\/api\/v1\//.test(url.pathname),
            handler: 'NetworkOnly',
          },

          // Extracted DICOM slices + thumbnails (manifest / Option C path).
          // These are fetched per-slice straight from Blob and are NOT persisted
          // by the IndexedDB DicomCache (that only covers the legacy ZIP path),
          // so without this they re-download on every visit. Each slice is
          // immutable (keyed by asset/series/instance), so CacheFirst is safe
          // and gives instant repeat views + cheaper re-scrolls.
          {
            urlPattern: ({ url }) =>
              url.host.endsWith('.blob.core.windows.net') &&
              url.pathname.includes('/extracted/'),
            handler: 'CacheFirst',
            options: {
              cacheName: '1rad-dicom-slices',
              // ~1500 small JPEG-LS slices ≈ a few recent studies. LRU-evicted.
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // Azure Blob Storage (the actual DICOM ZIPs) — DO NOT use SW Cache here.
          // We already cache extracted series in IndexedDB via DicomCache + StudyPrefetcher.
          // Letting Workbox cache 100+ MB blobs would duplicate storage and fight that system.
          {
            urlPattern: ({ url }) => /\.blob\.core\.windows\.net\//.test(url.host),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  // Web (Azure Static Web Apps) is served from the domain root → absolute '/'.
  // The Electron desktop build loads index.html over file:// where '/assets/…'
  // would resolve to the drive root (white screen), so it needs RELATIVE './'.
  // The desktop build sets VITE_TARGET=electron (see package.json / pipeline).
  base: process.env.VITE_TARGET === 'electron' ? './' : '/',
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
})
