// ════════════════════════════════════════════════════════════════════════════
//  thermalPrint.js — one entry point for thermal receipt/token printing.
//
//  Picks the best available transport for the current environment:
//    1. Desktop app  → native ESC/POS via the Electron bridge (USB / network).
//    2. Web browser  → raw ESC/POS over Web Serial / WebUSB (Chrome / Edge).
//    3. Otherwise    → returns { ok:false, unconfigured:true } so the caller can
//                      fall back to the HTML print slip / dialog.
//
//  Callers pass structured data only; this module reads the saved printer config
//  and adds width / cut / cash-drawer.
// ════════════════════════════════════════════════════════════════════════════

import { nativePrinter } from '../hooks/useElectron';
import { getThermalConfig } from './thermalPrinter';
import { webPrinterSupported, webPrint } from './webPrinter';
import { buildReceiptBytes, buildTokenBytes } from './escpos';

function withCfg(data, cfg) {
  return { ...data, width: cfg.width === 58 ? 58 : 80, cut: true, cashDrawer: !!cfg.cashDrawer };
}

async function dispatch(data, { nativeFn, buildBytes }) {
  const cfg = getThermalConfig();
  if (!cfg) return { ok: false, unconfigured: true };

  // 1. Native via the Electron bridge — used when configured with a network/USB
  //    interface (desktop app, e.g. 'tcp://…').
  if (cfg.interface && nativePrinter.supported) {
    return nativeFn({ ...withCfg(data, cfg), interface: cfg.interface });
  }
  // 2. Raw ESC/POS over Web Serial / WebUSB — used when configured with a
  //    transport. Works in Chrome/Edge AND inside the desktop app (we enable
  //    Web Serial in Electron), so the config shape drives the method.
  if (cfg.transport && webPrinterSupported()) {
    return webPrint(buildBytes(withCfg(data, cfg)), cfg);
  }
  return { ok: false, unconfigured: true };
}

export function printThermalReceipt(data) {
  return dispatch(data, {
    nativeFn: (payload) => nativePrinter.printReceipt(payload),
    buildBytes: (payload) => buildReceiptBytes(payload),
  });
}

export function printThermalToken(data) {
  return dispatch(data, {
    nativeFn: (payload) => nativePrinter.printToken(payload),
    buildBytes: (payload) => buildTokenBytes(payload),
  });
}
