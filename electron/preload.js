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
