// ════════════════════════════════════════════════════════════════════════════
//  thermalPrinter.js — shared config for the ESC/POS thermal receipt printer.
//
//  Stored locally per device (the printer is physical to that front desk):
//    { interface: 'printer:My 80mm Printer' | 'tcp://192.168.1.50:9100',
//      width: 58 | 80, cashDrawer: boolean }
// ════════════════════════════════════════════════════════════════════════════

export const THERMAL_CFG_KEY = '1rad:thermal-printer';

export function getThermalConfig() {
  try { return JSON.parse(localStorage.getItem(THERMAL_CFG_KEY) || 'null'); }
  catch (_) { return null; }
}

export function setThermalConfig(cfg) {
  try { localStorage.setItem(THERMAL_CFG_KEY, JSON.stringify(cfg || {})); }
  catch (_) {}
}
