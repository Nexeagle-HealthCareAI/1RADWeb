// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useHomeScreenInstall from './useHomeScreenInstall';

const setUrl = (path) => {
  window.history.pushState({}, '', path);
};

beforeEach(() => {
  document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest"><meta name="apple-mobile-web-app-title" content="1Rad Flow">';
  setUrl('/r/abc123?t=tok');
});

afterEach(() => {
  document.head.innerHTML = '';
});

describe('useHomeScreenInstall', () => {
  it('swaps the shared manifest for one scoped to the current page while mounted', () => {
    const { unmount } = renderHook(() => useHomeScreenInstall({ title: 'Centre — Referral Portal', shortTitle: 'Referral Portal' }));

    const link = document.querySelector('link[rel="manifest"]');
    expect(link.getAttribute('href')).toMatch(/^blob:/);

    unmount();
    expect(document.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('/manifest.webmanifest');
  });

  // Reading a real blob: URL back via fetch() isn't reliably supported outside a real browser, so
  // these two read the Blob content directly - what URL.createObjectURL was actually called with.
  const captureManifestBlob = () => {
    const originalCreate = URL.createObjectURL;
    let captured = null;
    URL.createObjectURL = (blob) => { captured = blob; return originalCreate.call(URL, blob); };
    return { getBlob: () => captured, restore: () => { URL.createObjectURL = originalCreate; } };
  };

  it('the swapped manifest carries an absolute start_url scoped to this exact page (including the token)', async () => {
    const cap = captureManifestBlob();
    renderHook(() => useHomeScreenInstall({ title: 'Referral Portal', shortTitle: 'Portal' }));

    const manifest = JSON.parse(await cap.getBlob().text());
    cap.restore();

    expect(manifest.start_url).toBe(`${window.location.origin}/r/abc123?t=tok`);
    expect(manifest.scope).toBe(`${window.location.origin}/r/abc123`);
    expect(manifest.display).toBe('standalone');
  });

  it('icon URLs in the manifest are absolute — a Blob-URL manifest has no path for a relative src to resolve against', async () => {
    const cap = captureManifestBlob();
    renderHook(() => useHomeScreenInstall({ title: 'Referral Portal', iconPath: '/Logo.png' }));

    const manifest = JSON.parse(await cap.getBlob().text());
    cap.restore();

    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.icons.every(i => i.src === `${window.location.origin}/Logo.png`)).toBe(true);
  });

  it('relabels the iOS home-screen title while mounted, and restores it on unmount', () => {
    const { unmount } = renderHook(() => useHomeScreenInstall({ title: 'Centre — Referral Portal', shortTitle: 'Referral Portal' }));

    expect(document.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('Referral Portal');

    unmount();
    expect(document.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('1Rad Flow');
  });

  it('does nothing when already running standalone — no point installing what is already installed', () => {
    const original = window.matchMedia;
    window.matchMedia = (q) => ({ matches: q.includes('standalone') });

    const { result } = renderHook(() => useHomeScreenInstall({ title: 'Referral Portal' }));

    expect(result.current.isStandalone).toBe(true);
    expect(document.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('/manifest.webmanifest');

    window.matchMedia = original;
  });

  it('captures the native install prompt and reports it promptable', async () => {
    const { result } = renderHook(() => useHomeScreenInstall({ title: 'Referral Portal' }));
    expect(result.current.canPrompt).toBe(false);

    const prevent = { called: false };
    const fakeEvent = {
      preventDefault: () => { prevent.called = true; },
      prompt: () => {},
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    };
    act(() => { window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakeEvent)); });

    expect(prevent.called).toBe(true);
    expect(result.current.canPrompt).toBe(true);

    let outcome;
    await act(async () => { outcome = await result.current.promptInstall(); });
    expect(outcome).toBe('accepted');
    expect(result.current.canPrompt).toBe(false);
  });
});
