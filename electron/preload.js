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

  // Hardware / Printing
  printer: {
    printReceipt: (data) => ipcRenderer.invoke('printer:printReceipt', data),
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
