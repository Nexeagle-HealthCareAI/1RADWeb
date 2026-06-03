// ════════════════════════════════════════════════════════════════
// src/hooks/useElectron.js
//
// 1Rad / EasyRad Desktop Bridge
// Provides unified access to native OS features like silent printing,
// secure local storage, and file system operations.
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useCallback } from 'react';

// Detect Electron Environment
const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

/**
 * Native Storage Abstraction
 * Uses Electron-Store (Native) if available, otherwise localStorage.
 */
export const nativeStorage = {
  get: async (key) => {
    if (IS_ELECTRON && window.electron.store) {
      return window.electron.store.get(key);
    }
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  },

  set: async (key, value) => {
    if (IS_ELECTRON && window.electron.store) {
      return window.electron.store.set(key, value);
    }
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) {}
    return true;
  },

  getAll: async () => {
    if (IS_ELECTRON && window.electron.store) {
      return window.electron.store.getAll();
    }
    // Browser fallback: Scan known 1Rad keys
    const keys = ['1rad_invoices', '1rad_settings', '1rad_offline_outbox'];
    const result = {};
    keys.forEach(k => {
      const val = localStorage.getItem(k);
      if (val) result[k] = JSON.parse(val);
    });
    return result;
  }
};

/**
 * Native File Operations
 */
export const nativeFile = {
  exportJSON: async (data, filename) => {
    if (IS_ELECTRON && window.electron.file?.exportJSON) {
      return window.electron.file.exportJSON(data, filename);
    }
    // Browser fallback: Blob download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `1rad-export-${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  }
};

/**
 * Microsoft Word Launcher
 * Desktop: writes a .doc and opens it in Word via the OS default handler.
 * Browser: downloads a .doc the OS opens in Word on double-click (a sandboxed
 * browser can't launch a native app directly).
 */
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const nativeWord = {
  // Launch Word with a real binary document (e.g. a .docx Blob). Desktop writes
  // the bytes to a temp file and opens it in Word; browser downloads it.
  //   watch:true → desktop polls the temp file so a Save in Word streams the
  //   bytes back (auto-sync round-trip). Ignored on the web (no native watch).
  openDocx: async (blob, filename, ext = 'docx', { watch = false } = {}) => {
    if (IS_ELECTRON && window.electron.word?.openFile) {
      const base64 = await blobToBase64(blob);
      return window.electron.word.openFile({ base64, filename, ext, watch });
    }
    downloadBlob(blob, `${filename || 'report'}.${ext}`);
    return { ok: true, mode: 'BROWSER_DOWNLOAD' };
  },

  // Subscribe to Word-save events (desktop only). Returns an unsubscribe fn.
  onFileChanged: (callback) => {
    if (IS_ELECTRON && window.electron.word?.onFileChanged) {
      return window.electron.word.onFileChanged(callback);
    }
    return () => {};
  },

  // Stop watching a temp Word file.
  stopWatch: (filePath) => {
    if (IS_ELECTRON && window.electron.word?.stopWatch) {
      return window.electron.word.stopWatch(filePath);
    }
    return Promise.resolve({ ok: true });
  },

  // Launch Word with HTML-as-.doc (legacy/simple path).
  open: async (html, filename) => {
    if (IS_ELECTRON && window.electron.word?.open) {
      return window.electron.word.open({ html, filename });
    }
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    downloadBlob(blob, `${filename || 'report'}.doc`);
    return { ok: true, mode: 'BROWSER_DOWNLOAD' };
  }
};

/**
 * Desktop auto-update bridge. No-ops on the web (PWA updates itself via the
 * service worker), so callers can use it unconditionally.
 */
export const nativeUpdater = {
  // Fires when a new version has finished downloading in the background.
  onUpdateDownloaded: (callback) => {
    if (IS_ELECTRON && window.electron.updater?.onUpdateDownloaded) {
      return window.electron.updater.onUpdateDownloaded(callback);
    }
    return () => {};
  },
  // Restart the app and apply the downloaded update.
  install: () => {
    if (IS_ELECTRON && window.electron.updater?.install) {
      return window.electron.updater.install();
    }
    return Promise.resolve({ ok: false });
  },
};

/**
 * Thermal Printing Engine (Silent)
 */
export const nativePrinter = {
  printReceipt: async (invoice) => {
    if (IS_ELECTRON && window.electron.printer?.printReceipt) {
      return window.electron.printer.printReceipt(invoice);
    }
    // Browser fallback: System print dialog
    window.print();
    return { ok: true, mode: 'BROWSER_DIALOG' };
  }
};

export default function useElectron() {
  const menuHandlers = useRef({});

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanups = [];
    
    // Register IPC event listeners for OS Menu / Hardware events
    Object.entries(menuHandlers.current).forEach(([channel, cb]) => {
      if (window.electron.on) {
        cleanups.push(window.electron.on(channel, cb));
      }
    });
    
    return () => cleanups.forEach(fn => fn && fn());
  }, []);

  const onNativeEvent = useCallback((channel, cb) => { 
    menuHandlers.current[channel] = cb; 
  }, []);

  return {
    isElectron: IS_ELECTRON,
    storage: nativeStorage,
    file: nativeFile,
    printer: nativePrinter,
    onNativeEvent,
    app: IS_ELECTRON ? window.electron.app : {
      version: () => Promise.resolve('1.0.0-web'),
      platform: () => Promise.resolve(navigator.platform),
      openExternal: (url) => { window.open(url, '_blank'); }
    }
  };
}
