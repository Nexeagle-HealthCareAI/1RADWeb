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
