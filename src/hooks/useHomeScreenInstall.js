import { useCallback, useEffect, useRef, useState } from 'react';

// "Add to Home Screen" for ONE route inside a shared single-manifest SPA (the whole app - staff
// worklists, this doctor portal, everything - shares one index.html, so it shares one
// <link rel="manifest">, whose start_url is "/"). Without this, a doctor tapping "Install app" on
// their portal link would install a shortcut that opens the STAFF APP'S LOGIN PAGE, not their
// dashboard - because Chrome/Edge/Android read the manifest linked in the document to decide where
// an installed shortcut opens.
//
// While mounted, swaps that link to a small Blob-URL manifest scoped to THIS exact page (current
// URL, token included) and restores the app's real manifest on unmount - other routes are
// unaffected. iOS Safari's "Add to Home Screen" doesn't read the Web App Manifest at all; it just
// bookmarks the current URL, so it already opens the right page with no swap needed - this hook
// only relabels the home-screen icon there (apple-mobile-web-app-title).
export default function useHomeScreenInstall({ title, shortTitle, iconPath }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const restoreRef = useRef(null);

  const isStandalone = typeof window !== 'undefined' && !!(
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator?.standalone === true
  );
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');

  useEffect(() => {
    if (typeof document === 'undefined' || isStandalone) return undefined;

    const manifestLink = document.querySelector('link[rel="manifest"]');
    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const prevManifestHref = manifestLink?.getAttribute('href') ?? null;
    const prevAppleTitle = appleTitleMeta?.getAttribute('content') ?? null;
    let blobUrl = null;

    try {
      const origin = window.location.origin;
      const iconUrl = iconPath ? origin + iconPath : null;
      const manifest = {
        name: title,
        short_name: shortTitle || title,
        // Absolute — a Blob-URL manifest has no meaningful path of its own for relative URLs to
        // resolve against.
        start_url: origin + window.location.pathname + window.location.search,
        scope: origin + window.location.pathname,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f52ba',
        background_color: '#f6f8fb',
        icons: iconUrl ? [
          { src: iconUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
        ] : [],
      };
      if (manifestLink) {
        blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
        manifestLink.setAttribute('href', blobUrl);
      }
      if (appleTitleMeta) appleTitleMeta.setAttribute('content', shortTitle || title);
    } catch {
      // Best-effort — worst case the install just isn't scoped to this page. Never block the portal on this.
    }

    restoreRef.current = () => {
      if (manifestLink && prevManifestHref) manifestLink.setAttribute('href', prevManifestHref);
      if (appleTitleMeta && prevAppleTitle !== null) appleTitleMeta.setAttribute('content', prevAppleTitle);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    return () => restoreRef.current?.();
  }, [title, shortTitle, iconPath, isStandalone]);

  useEffect(() => {
    if (isStandalone) return undefined;
    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isStandalone]);

  // Chrome/Edge/Android only - the native install prompt. Returns 'accepted' | 'dismissed' | null.
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
    return choice?.outcome ?? null;
  }, [deferredPrompt]);

  return { isStandalone, isIOS, installed, canPrompt: !!deferredPrompt, promptInstall };
}
