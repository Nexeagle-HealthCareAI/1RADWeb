// ════════════════════════════════════════════════════════════════════════════
//  ThermalPrinterSettings.jsx
//
//  Configures the thermal printer used for silent receipt / token printing
//  (Configuration → Printing & Devices). Adapts to the environment:
//    • Desktop app  → USB (installed printer) or network (IP), via Electron.
//    • Chrome/Edge  → raw ESC/POS over Web Serial (recommended) or WebUSB.
//    • Otherwise    → a note that silent printing needs the desktop app or Chrome.
//
//  Saved config is device-local (one printer per machine).
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { nativePrinter } from '../../hooks/useElectron';
import { getThermalConfig, setThermalConfig } from '../../utils/thermalPrinter';
import {
  webPrinterSupported, webSerialSupported, webUsbSupported,
  pickSerialPort, pickUsbDevice, webPrint,
} from '../../utils/webPrinter';
import { EscPos } from '../../utils/escpos';

const card = { background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };
const label = { display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' };
const input = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: 'white' };
const pill = (active) => ({ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, border: active ? '1px solid #1d4ed8' : '1px solid #e2e8f0', background: active ? '#1d4ed8' : 'white', color: active ? 'white' : '#475569' });
const primaryBtn = { flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer' };
const ghostBtn = { flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', fontSize: '13px', fontWeight: 700, cursor: 'pointer' };

function WidthPicker({ width, setWidth }) {
  return (
    <div>
      <label style={label}>Paper width</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[58, 80].map(w => (
          <button key={w} type="button" onClick={() => setWidth(w)} style={pill(width === w)}>{w}mm</button>
        ))}
      </div>
    </div>
  );
}

function CashDrawerToggle({ cashDrawer, setCashDrawer }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
      <input type="checkbox" checked={cashDrawer} onChange={e => setCashDrawer(e.target.checked)} />
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Open cash drawer after printing</span>
    </label>
  );
}

// ── Desktop (Electron) — USB / network ──────────────────────────────────────
function DesktopSettings() {
  const [printers, setPrinters] = useState([]);
  const [nativeUsb, setNativeUsb] = useState(true);
  const [connection, setConnection] = useState('usb');
  const [usbName, setUsbName] = useState('');
  const [networkAddr, setNetworkAddr] = useState('');
  const [width, setWidth] = useState(80);
  const [cashDrawer, setCashDrawer] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const cfg = getThermalConfig();
    if (cfg) {
      setWidth(cfg.width === 58 ? 58 : 80);
      setCashDrawer(!!cfg.cashDrawer);
      if ((cfg.interface || '').startsWith('tcp://')) { setConnection('network'); setNetworkAddr(cfg.interface.replace('tcp://', '')); }
      else if ((cfg.interface || '').startsWith('printer:')) { setConnection('usb'); setUsbName(cfg.interface.replace('printer:', '')); }
    }
    nativePrinter.list().then(r => {
      setPrinters(r?.printers || []);
      setNativeUsb(r?.nativeAvailable !== false);
      if (!cfg && r?.printers?.[0]) setUsbName(r.printers[0].name);
    });
  }, []);

  const buildInterface = () => connection === 'network' ? (networkAddr ? `tcp://${networkAddr}` : '') : (usbName ? `printer:${usbName}` : '');
  const persist = () => {
    const iface = buildInterface();
    if (!iface) { setStatus('Pick a printer (or enter an IP) first.'); return null; }
    const cfg = { interface: iface, width, cashDrawer };
    setThermalConfig(cfg); setStatus('Saved. Receipts will print here automatically.'); return cfg;
  };
  const onTest = async () => {
    const cfg = persist(); if (!cfg) return;
    setStatus('Printing test slip…');
    const r = await nativePrinter.test(cfg);
    setStatus(r?.ok ? 'Test slip printed ✓' : `Test failed: ${r?.error || 'error'}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <label style={label}>Connection</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setConnection('usb')} style={pill(connection === 'usb')}>USB / Installed printer</button>
          <button type="button" onClick={() => setConnection('network')} style={pill(connection === 'network')}>Network (IP)</button>
        </div>
      </div>

      {connection === 'usb' && (
        <div>
          <label style={label}>Installed printer</label>
          {nativeUsb ? (
            <select style={input} value={usbName} onChange={e => setUsbName(e.target.value)}>
              <option value="">— Select a printer —</option>
              {printers.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          ) : (
            <p style={{ fontSize: '12px', color: '#b45309', margin: 0, lineHeight: 1.5 }}>
              USB printing support isn't available in this build. Use <b>Network (IP)</b>, or reinstall the desktop app.
            </p>
          )}
        </div>
      )}

      {connection === 'network' && (
        <div>
          <label style={label}>Printer IP address and port</label>
          <input style={input} placeholder="192.168.1.50:9100" value={networkAddr} onChange={e => setNetworkAddr(e.target.value)} />
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>Most network thermal printers use port 9100.</div>
        </div>
      )}

      <WidthPicker width={width} setWidth={setWidth} />
      <CashDrawerToggle cashDrawer={cashDrawer} setCashDrawer={setCashDrawer} />

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={persist} style={primaryBtn}>Save</button>
        <button type="button" onClick={onTest} style={ghostBtn}>Print test slip</button>
      </div>
      {status && <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{status}</div>}
    </div>
  );
}

// ── Browser (Chrome/Edge) — Web Serial / WebUSB ─────────────────────────────
function BrowserSettings() {
  const [transport, setTransport] = useState(webSerialSupported() ? 'serial' : 'usb');
  const [width, setWidth] = useState(80);
  const [baud, setBaud] = useState(9600);
  const [cashDrawer, setCashDrawer] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const cfg = getThermalConfig();
    if (cfg?.transport) {
      setTransport(cfg.transport);
      setWidth(cfg.width === 58 ? 58 : 80);
      setBaud(cfg.baud || 9600);
      setCashDrawer(!!cfg.cashDrawer);
    }
    // Show "connected" if a device/port was already granted to this origin.
    (async () => {
      try {
        if (webSerialSupported() && (await navigator.serial.getPorts()).length) setConnected(true);
        else if (webUsbSupported() && (await navigator.usb.getDevices()).length) setConnected(true);
      } catch (_) {}
    })();
  }, []);

  const connect = async () => {
    try {
      setStatus('Select your printer in the browser prompt…');
      if (transport === 'serial') await pickSerialPort();
      else await pickUsbDevice();
      setConnected(true);
      setStatus('Printer connected. Don’t forget to Save.');
    } catch (e) {
      setStatus(`Connect cancelled or failed: ${e?.message || 'error'}`);
    }
  };

  const persist = () => {
    const cfg = { transport, width, baud, cashDrawer };
    setThermalConfig(cfg);
    setStatus('Saved. Receipts and tokens will print here automatically.');
    return cfg;
  };

  const onTest = async () => {
    const cfg = persist();
    setStatus('Printing test slip…');
    const p = new EscPos(width === 58 ? 32 : 48);
    p.align('center').bold(true).line('1RAD TEST PRINT').bold(false)
      .line(`${width}mm · ${transport.toUpperCase()}`)
      .line(new Date().toLocaleString()).drawLine().cut();
    const r = await webPrint(p.getBytes(), cfg);
    setStatus(r?.ok ? 'Test slip printed ✓' : `Test failed: ${r?.error || 'error'}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#1e40af', lineHeight: 1.5 }}>
        Browser printing uses your printer over <b>Web Serial</b> (or WebUSB). It works for serial / USB-serial
        thermal printers. For network printers or full USB support, use the desktop app.
      </div>

      <div>
        <label style={label}>Connection</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {webSerialSupported() && <button type="button" onClick={() => setTransport('serial')} style={pill(transport === 'serial')}>Web Serial (recommended)</button>}
          {webUsbSupported() && <button type="button" onClick={() => setTransport('usb')} style={pill(transport === 'usb')}>WebUSB</button>}
        </div>
      </div>

      <div>
        <label style={label}>Printer</label>
        <button type="button" onClick={connect} style={{ ...ghostBtn, width: '100%', flex: 'unset', borderColor: connected ? '#16a34a' : '#e2e8f0', color: connected ? '#16a34a' : '#1e293b' }}>
          {connected ? '✓ Printer connected — reconnect' : 'Connect printer…'}
        </button>
      </div>

      {transport === 'serial' && (
        <div>
          <label style={label}>Baud rate</label>
          <select style={input} value={baud} onChange={e => setBaud(Number(e.target.value))}>
            {[9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>Most thermal printers use 9600. Check your printer’s self-test slip if unsure.</div>
        </div>
      )}

      <WidthPicker width={width} setWidth={setWidth} />
      <CashDrawerToggle cashDrawer={cashDrawer} setCashDrawer={setCashDrawer} />

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={persist} style={primaryBtn}>Save</button>
        <button type="button" onClick={onTest} style={ghostBtn}>Print test slip</button>
      </div>
      {status && <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{status}</div>}
    </div>
  );
}

export default function ThermalPrinterSettings() {
  const desktop = nativePrinter.supported;
  const browser = !desktop && webPrinterSupported();

  return (
    <div style={card}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '20px' }}>Thermal Printer</div>
      {desktop && <DesktopSettings />}
      {browser && <BrowserSettings />}
      {!desktop && !browser && (
        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
          Silent thermal printing needs the <b>desktop app</b>, or a Chromium browser (Chrome / Edge)
          that supports Web Serial. In other browsers, receipts open the normal print dialog instead.
        </p>
      )}
    </div>
  );
}
