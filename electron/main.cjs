const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
// Dev vs. packaged: use Electron's built-in flag instead of the electron-is-dev
// module. app.isPackaged is false in `npm run electron` and true once the app
// runs from the installed asar bundle — and it needs no extra dependency to
// ship inside the installer (which is what caused the "Cannot find module
// 'electron-is-dev'" crash).
const isDev = !app.isPackaged;
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

  // ── Web Serial (USB thermal printers) ───────────────────────────────────
  // Enables navigator.serial inside the desktop app so the SAME browser-based
  // printer setup drives a USB(-serial) thermal printer here too — replacing
  // the native USB module that can't build against Electron 42's V8. This is a
  // trusted local app (loads its own bundle + same API), so we grant serial and
  // auto-pick the printer's port (front desks typically have one).
  const ses = mainWindow.webContents.session;
  ses.setPermissionCheckHandler(() => true);
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial' || details.deviceType === 'hid');
  ses.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    callback(portList && portList.length ? portList[0].portId : '');
  });

  // Load the app (Vite dev server or built files). In production use loadFile()
  // — it builds a correct file:// URL from the OS path (handles Windows
  // backslashes / drive letters) where a hand-built `file://${path}` can fail.
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Surface a blank-screen cause instead of failing silently: if the renderer
  // can't load, log it and open DevTools so the error is visible.
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] did-fail-load ${code} ${desc} → ${url}`);
    if (!isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

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

  // Window-open policy:
  //   • Blank / blob / data popups are the app's OWN print + PDF preview windows
  //     (window.open('', '_blank') + document.write + window.print()). Let them
  //     open as real child windows so printing works in the desktop app.
  //   • Real external links (https, mailto, tel, wa.me, …) open in the OS's
  //     default handler, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const u = url || '';
    if (u === '' || u === 'about:blank' || u.startsWith('blob:') || u.startsWith('data:')) {
      return { action: 'allow' };
    }
    shell.openExternal(u);
    return { action: 'deny' };
  });
}

// ── IPC Handlers (The Bridge) ────────────────────────────────────

// Store Handlers
ipcMain.handle('store:get', (event, key) => store.get(key));
ipcMain.handle('store:set', (event, key, value) => store.set(key, value));
ipcMain.handle('store:delete', (event, key) => store.delete(key));
ipcMain.handle('store:getAll', (event) => store.store);

// ── Thermal printer (ESC/POS) ────────────────────────────────────
// Silent receipt printing on 58mm / 80mm thermal printers. We build the raw
// ESC/POS byte stream with node-thermal-printer (pure JS) and send it over the
// configured interface:
//   • 'tcp://192.168.x.x:9100'  → network printer (no native module needed)
//   • 'printer:My Printer Name' → USB/driver printer (needs the optional native
//                                  module @thiagoelg/node-printer)
// Every require is lazy + guarded so a missing/half-built native module can
// never crash app startup or the installer build — it just disables USB listing
// while TCP keeps working, and the renderer falls back to the HTML slip.

function loadThermal() {
  try { return require('node-thermal-printer'); }
  catch (e) { console.warn('[printer] node-thermal-printer unavailable:', e.message); return null; }
}
function loadNativePrinter() {
  // node-thermal-printer pulls this in for the 'printer:' interface; we also use
  // it directly to enumerate installed printers for the settings dropdown.
  try { return require('@thiagoelg/node-printer'); }
  catch (_) { return null; }
}

// Compose a clinic receipt onto a ThermalPrinter instance. Money uses "Rs."
// (not ₹) — the default thermal code page (PC437) has no rupee glyph and would
// print garbage. Width is in characters: 32 for 58mm, 48 for 80mm.
function composeReceipt(p, data) {
  const d = data || {};
  const clinic = d.clinic || {};
  const inv = d.invoice || {};
  const money = (n) => 'Rs.' + (Number(n) || 0).toLocaleString('en-IN');

  p.alignCenter();
  p.bold(true);
  try { p.setTextSize(1, 1); } catch (_) {}
  p.println((clinic.name || '1RAD DIAGNOSTICS').toUpperCase());
  try { p.setTextNormal(); } catch (_) {}
  p.bold(false);
  if (clinic.address) p.println(clinic.address);
  if (clinic.phone)   p.println('Tel: ' + clinic.phone);
  if (clinic.email)   p.println(clinic.email);
  if (clinic.rep)     { p.bold(true); p.println('REP: ' + clinic.rep); p.bold(false); }
  p.drawLine();

  p.alignLeft();
  if (inv.displayId)     p.println('INV : ' + inv.displayId);
  p.println('DATE: ' + (inv.date || new Date().toLocaleDateString()));
  p.bold(true);
  p.println('PATIENT: ' + (inv.patientName || 'N/A').toUpperCase());
  p.bold(false);
  if (inv.patientId) p.println('ID  : ' + inv.patientId);
  if (inv.refNo)     p.println('REF : ' + inv.refNo);
  p.drawLine();

  for (const it of (d.items || [])) {
    const tag = it.code ? `[${it.code}] ` : '';
    const name = `${tag}${(it.desc || '')}`.slice(0, (d.width === 58 ? 20 : 30));
    const qty = Number(it.qty) || 1;
    const sub = (Number(it.amount) || 0) * qty;
    p.leftRight(`${name} x${qty}`, money(sub));
  }

  if ((d.modalitySummary || []).length > 1) {
    p.drawLine();
    p.bold(true); p.println('BY MODALITY'); p.bold(false);
    for (const m of d.modalitySummary) {
      p.leftRight(`${m.code || ''} ${m.name || ''}`.trim().slice(0, d.width === 58 ? 20 : 30), money(m.subtotal));
    }
  }

  p.drawLine();
  if ((Number(d.discount) || 0) > 0) {
    const sub = (Number(d.gross) || 0) > 0 ? d.gross : (Number(d.total) || 0) + (Number(d.discount) || 0);
    p.leftRight('SUBTOTAL', money(sub));
    p.leftRight('DISCOUNT', '-' + money(d.discount));
  }
  p.bold(true);
  try { p.setTextSize(1, 1); } catch (_) {}
  p.leftRight('TOTAL', money(d.total));
  try { p.setTextNormal(); } catch (_) {}
  p.bold(false);
  p.drawLine();

  p.alignCenter();
  for (const line of (d.footer || ['THANK YOU FOR CHOOSING 1RAD'])) p.println(line);
  p.println('');
  p.println('Powered by NexEagle');
  p.newLine();
}

// Compose a queue-token slip: clinic, a large TOKEN number, patient, time and
// what they're in for — optionally a QR to the patient tracking page.
function composeToken(p, data) {
  const d = data || {};
  const clinic = d.clinic || {};
  p.alignCenter();
  p.bold(true);
  p.println((clinic.name || '1RAD DIAGNOSTICS').toUpperCase());
  p.bold(false);
  if (clinic.address) p.println(clinic.address);
  p.drawLine();

  p.println('TOKEN NO.');
  p.bold(true);
  // Big, glanceable token number. setTextSize(height,width) 0-7; fall back to
  // the widely-supported quad area if the printer rejects custom sizes.
  try { p.setTextSize(3, 3); }
  catch (_) { try { p.setTextDoubleHeight(); p.setTextDoubleWidth(); } catch (__) {} }
  p.println(String(d.token != null ? d.token : '-'));
  try { p.setTextNormal(); } catch (_) {}
  p.bold(false);
  p.drawLine();

  p.alignLeft();
  if (d.patientName) { p.bold(true); p.println(String(d.patientName).toUpperCase()); p.bold(false); }
  if (d.patientId) p.println('ID  : ' + d.patientId);
  if (d.datetime)  p.println('TIME: ' + d.datetime);
  if (d.service)   p.println('FOR : ' + String(d.service).slice(0, d.width === 58 ? 24 : 38));
  if (d.modality)  p.println('MOD : ' + d.modality);

  p.alignCenter();
  if (d.qr) { try { p.printQR(String(d.qr), { cellSize: 5, correction: 'M' }); } catch (_) {} }
  p.drawLine();
  for (const line of (d.footer || ['PLEASE KEEP THIS TOKEN'])) p.println(line);
  p.println('');
  p.println('Powered by NexEagle');
  p.newLine();
}

// Print a queue-token slip. payload = { interface, width, cut, ...tokenData }
ipcMain.handle('printer:printToken', async (event, payload) => {
  const thermal = loadThermal();
  if (!thermal) return { ok: false, error: 'THERMAL_LIB_UNAVAILABLE' };
  const data = payload || {};
  if (!data.interface) return { ok: false, error: 'NO_PRINTER_CONFIGURED' };
  if (data.interface.startsWith('printer:') && !loadNativePrinter()) {
    return { ok: false, error: 'USB_NATIVE_MODULE_MISSING' };
  }
  try {
    const p = new thermal.printer({
      type: thermal.types.EPSON,
      interface: data.interface,
      width: data.width === 58 ? 32 : 48,
      characterSet: thermal.characterSet?.PC437_USA,
      removeSpecialCharacters: false,
      options: { timeout: 5000 },
    });
    composeToken(p, data);
    if (data.cut !== false) p.cut();
    const ok = await p.execute();
    return { ok: ok !== false, message: 'PRINTED' };
  } catch (e) {
    console.error('[printer] token print failed:', e.message);
    return { ok: false, error: e.message };
  }
});

// Enumerate installed printers for the settings dropdown (USB/driver printers
// only; network printers are entered by IP). Returns [] if the native module
// isn't available.
ipcMain.handle('printer:list', async () => {
  const np = loadNativePrinter();
  if (!np?.getPrinters) return { ok: true, printers: [], nativeAvailable: false };
  try {
    const printers = np.getPrinters().map(pr => ({ name: pr.name, status: pr.status }));
    return { ok: true, printers, nativeAvailable: true };
  } catch (e) {
    return { ok: false, error: e.message, printers: [], nativeAvailable: true };
  }
});

// Print a structured receipt. payload = { interface, width, cut, cashDrawer, ...receiptData }
ipcMain.handle('printer:printReceipt', async (event, payload) => {
  const thermal = loadThermal();
  if (!thermal) return { ok: false, error: 'THERMAL_LIB_UNAVAILABLE' };
  const data = payload || {};
  const iface = data.interface;
  if (!iface) return { ok: false, error: 'NO_PRINTER_CONFIGURED' };
  if (iface.startsWith('printer:') && !loadNativePrinter()) {
    return { ok: false, error: 'USB_NATIVE_MODULE_MISSING' };
  }
  try {
    const p = new thermal.printer({
      type: thermal.types.EPSON,
      interface: iface,
      width: data.width === 58 ? 32 : 48,
      characterSet: thermal.characterSet?.PC437_USA,
      removeSpecialCharacters: false,
      options: { timeout: 5000 },
    });
    composeReceipt(p, data);
    if (data.cut !== false) p.cut();
    if (data.cashDrawer) { try { p.openCashDrawer(); } catch (_) {} }
    const ok = await p.execute();
    return { ok: ok !== false, message: 'PRINTED' };
  } catch (e) {
    console.error('[printer] print failed:', e.message);
    return { ok: false, error: e.message };
  }
});

// Tiny self-test slip so the user can verify the printer + width from settings.
ipcMain.handle('printer:test', async (event, payload) => {
  const thermal = loadThermal();
  if (!thermal) return { ok: false, error: 'THERMAL_LIB_UNAVAILABLE' };
  const data = payload || {};
  if (!data.interface) return { ok: false, error: 'NO_PRINTER_CONFIGURED' };
  try {
    const p = new thermal.printer({
      type: thermal.types.EPSON,
      interface: data.interface,
      width: data.width === 58 ? 32 : 48,
      options: { timeout: 5000 },
    });
    p.alignCenter(); p.bold(true); p.println('1RAD TEST PRINT'); p.bold(false);
    p.println(`${data.width || 80}mm OK`);
    p.println(new Date().toLocaleString());
    p.drawLine(); p.cut();
    const ok = await p.execute();
    return { ok: ok !== false };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

  const check = () => autoUpdater.checkForUpdates().catch((err) =>
    console.warn('[auto-update] check failed:', err?.message || err));

  // Check at launch, then every 30 minutes — many clinics leave the app open for
  // days, so a launch-only check would never pick up a deploy. electron-updater
  // de-dupes, so re-checking the same version is cheap and harmless.
  check();
  setInterval(check, 30 * 60 * 1000);
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
