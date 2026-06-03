const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const isDev = require('electron-is-dev');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// Initialize Electron Store
const store = new Store();

let mainWindow;

// ── Word auto-sync file watching ─────────────────────────────────
// Map<filePath, listener>. We poll with fs.watchFile (not fs.watch) because
// Word saves atomically (writes a temp then renames), which breaks fs.watch's
// handle on Windows; polling mtime survives that.
const wordWatchers = new Map();

// Word briefly locks the file while saving — read with a few retries.
async function readFileWithRetry(filePath, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      return fs.readFileSync(filePath);
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, 400));
    }
  }
}

function watchWordFile(filePath) {
  if (wordWatchers.has(filePath)) return;
  const listener = (curr, prev) => {
    // Only react to a genuine, completed write.
    if (curr.mtimeMs === prev.mtimeMs || curr.size === 0) return;
    readFileWithRetry(filePath)
      .then(buf => {
        if (buf && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('word:fileChanged', {
            path: filePath,
            base64: buf.toString('base64'),
          });
        }
      })
      .catch(err => console.warn('[word-watch] read failed:', err.message));
  };
  fs.watchFile(filePath, { interval: 1000 }, listener);
  wordWatchers.set(filePath, listener);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    title: "1Rad | Clinical Radiology Desktop",
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the app (Vite dev server or build folder)
  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Tear down any lingering Word file watchers.
    for (const fp of wordWatchers.keys()) fs.unwatchFile(fp);
    wordWatchers.clear();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── IPC Handlers (The Bridge) ────────────────────────────────────

// Store Handlers
ipcMain.handle('store:get', (event, key) => store.get(key));
ipcMain.handle('store:set', (event, key, value) => store.set(key, value));
ipcMain.handle('store:delete', (event, key) => store.delete(key));
ipcMain.handle('store:getAll', (event) => store.store);

// Printer Handlers (Silent Thermal Print Prototype)
ipcMain.handle('printer:printReceipt', async (event, data) => {
  console.log('NATIVE_PRINT_REQUEST', data);
  // Implementation for thermal printer would go here (esc-pos / node-printer)
  return { ok: true, message: 'SENT_TO_SPOOLER' };
});

// Word Handler — write a Word-compatible .doc (HTML) to disk and ask the OS
// to open it. On Windows that launches Microsoft Word (the default .doc
// handler), giving the radiologist a fully-editable copy of the report.
ipcMain.handle('word:open', async (event, payload) => {
  try {
    const { html, filename } = payload || {};
    if (!html) return { ok: false, error: 'NO_CONTENT' };
    const safe = String(filename || 'report').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 80);
    const filePath = path.join(os.tmpdir(), `${safe}-${Date.now()}.doc`);
    // Prepend a UTF-8 BOM so Word reads the document encoding correctly.
    fs.writeFileSync(filePath, '﻿' + html, 'utf8');
    const openErr = await shell.openPath(filePath); // '' on success
    if (openErr) return { ok: false, error: openErr, path: filePath };
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Word Handler (binary) — write a real .docx (base64-encoded OOXML bytes) and
// launch Word with it. Used for the faithful editor-format export so Word
// opens with exactly the formatting authored in the report editor.
//   watch:true → also poll the file so a Save inside Word streams the new
//   bytes back to the renderer (the auto-sync round-trip).
ipcMain.handle('word:openFile', async (event, payload) => {
  try {
    const { base64, filename, ext, watch } = payload || {};
    if (!base64) return { ok: false, error: 'NO_CONTENT' };
    const safe = String(filename || 'report').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 80);
    const safeExt = String(ext || 'docx').replace(/[^a-z0-9]/gi, '') || 'docx';
    const filePath = path.join(os.tmpdir(), `${safe}-${Date.now()}.${safeExt}`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    if (watch) watchWordFile(filePath);
    const openErr = await shell.openPath(filePath); // '' on success
    if (openErr) return { ok: false, error: openErr, path: filePath };
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Stop watching a temp Word file (called when the report closes).
ipcMain.handle('word:stopWatch', (event, filePath) => {
  if (filePath && wordWatchers.has(filePath)) {
    fs.unwatchFile(filePath);
    wordWatchers.delete(filePath);
  }
  return { ok: true };
});

// App Info
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  isDev
}));

// Silent auto-update. On launch (packaged builds only) electron-updater reads
// latest.yml from the publish feed (the Blob URL baked in at build time),
// downloads any newer version in the background, and installs it on quit — so
// installed clinics stay current without anyone re-downloading. Dev runs skip
// it (no update feed, and it throws when unpackaged).
function initAutoUpdater() {
  if (isDev) return;
  autoUpdater.autoDownload = true;
  // Still install on quit as a safety net if the user ignores the prompt.
  autoUpdater.autoInstallOnAppQuit = true;

  const notifyRenderer = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  autoUpdater.on('error', (err) => console.warn('[auto-update] error:', err?.message || err));
  autoUpdater.on('update-available', (info) => {
    console.info('[auto-update] update available:', info?.version);
    notifyRenderer('update:available', { version: info?.version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.info('[auto-update] downloaded:', info?.version);
    // Tell the renderer so it can offer "Restart to update". If ignored,
    // autoInstallOnAppQuit still applies the update on next quit.
    notifyRenderer('update:downloaded', { version: info?.version });
  });

  autoUpdater.checkForUpdates().catch((err) =>
    console.warn('[auto-update] check failed:', err?.message || err));
}

// Renderer asked to restart and apply the downloaded update now.
ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
  return { ok: true };
});

// Lifecycle
app.whenReady().then(() => {
  createWindow();
  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
