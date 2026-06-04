// ════════════════════════════════════════════════════════════════════════════
//  webPrinter.js — raw ESC/POS over Web Serial / WebUSB (Chrome / Edge).
//
//  Lets the WEB app print silently to a thermal printer without the desktop app.
//
//  Notes / limitations:
//    • Web Serial works for serial and USB-serial thermal printers (the common,
//      reliable path). Grant once via a user gesture; the browser remembers it.
//    • WebUSB can reach a USB printer ONLY if the OS hasn't claimed it with a
//      kernel driver. On Windows the usbprint driver usually claims it, so
//      claimInterface fails — Web Serial (or the desktop app) is preferred.
//    • Browsers cannot open raw TCP sockets, so NETWORK printers aren't reachable
//      from the browser — use the desktop app for those.
//
//  Granted devices/ports persist per-origin, so after the first connect, prints
//  re-acquire silently via getPorts()/getDevices().
// ════════════════════════════════════════════════════════════════════════════

let cachedSerialPort = null;
let cachedUsb = null; // { device, epOut, ifaceNum }

export function webSerialSupported() { return typeof navigator !== 'undefined' && 'serial' in navigator; }
export function webUsbSupported() { return typeof navigator !== 'undefined' && 'usb' in navigator; }
export function webPrinterSupported() { return webSerialSupported() || webUsbSupported(); }

// ── Web Serial ──────────────────────────────────────────────────────────────
export async function pickSerialPort() {
  cachedSerialPort = await navigator.serial.requestPort();
  return cachedSerialPort;
}

async function getSerialPort() {
  if (cachedSerialPort) return cachedSerialPort;
  const ports = await navigator.serial.getPorts();
  if (ports.length) { cachedSerialPort = ports[0]; return cachedSerialPort; }
  return pickSerialPort(); // needs a user gesture (print is one)
}

async function sendSerial(bytes, baud = 9600) {
  const port = await getSerialPort();
  if (!port) return { ok: false, error: 'NO_SERIAL_PORT' };
  if (!port.writable) await port.open({ baudRate: baud || 9600 });
  const writer = port.writable.getWriter();
  try { await writer.write(bytes); }
  finally { writer.releaseLock(); } // keep the port open for fast reuse
  return { ok: true };
}

// ── WebUSB ──────────────────────────────────────────────────────────────────
async function openUsb(device) {
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  let epOut = null, ifaceNum = null;
  for (const iface of device.configuration.interfaces) {
    const alt = iface.alternate;
    for (const ep of alt.endpoints) {
      if (ep.direction === 'out' && ep.type === 'bulk') { epOut = ep.endpointNumber; ifaceNum = iface.interfaceNumber; }
    }
    if (epOut != null) break;
  }
  if (ifaceNum != null) await device.claimInterface(ifaceNum);
  return { device, epOut, ifaceNum };
}

export async function pickUsbDevice() {
  const device = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] }); // 7 = printer class
  cachedUsb = await openUsb(device);
  return device;
}

async function getUsb() {
  if (cachedUsb?.device?.opened) return cachedUsb;
  const devices = await navigator.usb.getDevices();
  if (devices.length) { cachedUsb = await openUsb(devices[0]); return cachedUsb; }
  return null;
}

async function sendUsb(bytes) {
  let u = await getUsb();
  if (!u) { await pickUsbDevice(); u = cachedUsb; } // user gesture required
  if (!u?.epOut) return { ok: false, error: 'NO_USB_BULK_ENDPOINT' };
  await u.device.transferOut(u.epOut, bytes);
  return { ok: true };
}

// ── Unified send ──────────────────────────────────────────────────────────────
// cfg = { transport: 'serial' | 'usb', baud? }
export async function webPrint(bytes, cfg = {}) {
  try {
    if (cfg.transport === 'usb' && webUsbSupported()) return await sendUsb(bytes);
    if (cfg.transport === 'serial' && webSerialSupported()) return await sendSerial(bytes, cfg.baud);
    // No explicit transport — prefer serial.
    if (webSerialSupported()) return await sendSerial(bytes, cfg.baud);
    if (webUsbSupported()) return await sendUsb(bytes);
    return { ok: false, error: 'WEB_PRINTER_UNSUPPORTED' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
