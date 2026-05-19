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
  base: '/',
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
})
