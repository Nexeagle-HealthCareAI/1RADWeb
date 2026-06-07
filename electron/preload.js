const { contextBridge, ipcRenderer } = require('electron');

// ════════════════════════════════════════════════════════════════
// Preload Script: The Secure Bridge
// Exposes safe native APIs to the React frontend.
// ════════════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld('electron', {
  // Persistence
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete: (key) => ipcRenderer.invoke('store:delete', key),
    getAll: () => ipcRenderer.invoke('store:getAll'),
  },

  // Hardware / Printing — silent ESC/POS thermal receipts (58mm / 80mm)
  printer: {
    list: () => ipcRenderer.invoke('printer:list'),
    printReceipt: (data) => ipcRenderer.invoke('printer:printReceipt', data),
    printToken: (data) => ipcRenderer.invoke('printer:printToken', data),
    test: (data) => ipcRenderer.invoke('printer:test', data),
  },

  // A4 report printing — silent print of a self-contained HTML document to the
  // default (or named) printer. Used by the report print-preview modal.
  report: {
    printSilent: (payload) => ipcRenderer.invoke('report:printSilent', payload),
    listPrinters: () => ipcRenderer.invoke('report:listPrinters'),
  },

  // Microsoft Word — write a document and launch Word with it
  word: {
    open: (payload) => ipcRenderer.invoke('word:open', payload),
    openFile: (payload) => ipcRenderer.invoke('word:openFile', payload),
    stopWatch: (filePath) => ipcRenderer.invoke('word:stopWatch', filePath),
    // Subscribe to "the user saved the Word file" events. Returns an
    // unsubscribe function.
    onFileChanged: (callback) => {
      const subscription = (event, payload) => callback(payload);
      ipcRenderer.on('word:fileChanged', subscription);
      return () => ipcRenderer.removeListener('word:fileChanged', subscription);
    },
  },

  // Auto-update — surface "update ready" to the UI + trigger restart-to-apply.
  updater: {
    install: () => ipcRenderer.invoke('update:install'),
    onUpdateDownloaded: (callback) => {
      const subscription = (event, payload) => callback(payload);
      ipcRenderer.on('update:downloaded', subscription);
      return () => ipcRenderer.removeListener('update:downloaded', subscription);
    },
    onUpdateAvailable: (callback) => {
      const subscription = (event, payload) => callback(payload);
      ipcRenderer.on('update:available', subscription);
      return () => ipcRenderer.removeListener('update:available', subscription);
    },
  },

  // App Metadata
  app: {
    version: () => ipcRenderer.invoke('app:info').then(info => info.version),
    platform: () => ipcRenderer.invoke('app:info').then(info => info.platform),
    isDev: () => ipcRenderer.invoke('app:info').then(info => info.isDev),
  },

  // IPC Event Listener
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  }
});
