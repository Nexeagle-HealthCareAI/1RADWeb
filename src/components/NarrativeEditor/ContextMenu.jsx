import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { editorPrompt } from './dialogs/PromptDialog';

const CItem = ({ label, shortcut, onClick, disabled, danger }) => (
  <button
    onMouseDown={e => { e.preventDefault(); if (!disabled) onClick?.(); }}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', padding: '5px 12px',
      background: 'transparent', border: 'none',
      cursor: disabled ? 'default' : 'pointer',
      fontSize: '12px',
      color: disabled ? '#9ca3af' : danger ? '#dc2626' : '#1f2937',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      gap: '24px', borderRadius: '3px', textAlign: 'left',
    }}
    onMouseEnter={e => {
      if (!disabled) e.currentTarget.style.background = danger ? '#fef2f2' : '#eff6ff';
    }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >
    <span>{label}</span>
    {shortcut && <span style={{ color: '#9ca3af', fontSize: '11px', flexShrink: 0 }}>{shortcut}</span>}
  </button>
);

const CSep = () => (
  <div style={{ height: '1px', background: '#e5e7eb', margin: '3px 0' }} />
);

/**
 * ContextMenu — right-click menu for the NarrativeEditor.
 * Self-contained: attaches its own contextmenu listener to containerRef.
 */
export default function ContextMenu({ editor, containerRef }) {
  const [menu, setMenu] = useState(null); // { x, y }
  const menuRef = useRef(null);

  // Attach contextmenu listener
  useEffect(() => {
    const el = containerRef?.current;
    if (!el || !editor) return;

    const onContext = (e) => {
      if (!el.contains(e.target)) return;
      if (!editor.isEditable) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    };

    el.addEventListener('contextmenu', onContext);
    return () => el.removeEventListener('contextmenu', onContext);
  }, [editor, containerRef]);

  // Close on outside click / key / scroll
  useEffect(() => {
    if (!menu) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null);
    };
    const closeKey = () => setMenu(null);
    setTimeout(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('keydown', closeKey);
      document.addEventListener('scroll', closeKey, true);
    }, 0);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeKey);
      document.removeEventListener('scroll', closeKey, true);
    };
  }, [menu]);

  if (!menu || !editor) return null;

  const inTable = editor.isActive('table');
  const inImage = editor.isActive('image');
  const target  = document.fullscreenElement || document.body;
  const close   = () => setMenu(null);

  // Keep menu inside viewport
  const menuW = 210, menuH = inTable ? 420 : inImage ? 340 : 260;
  const left = menu.x + menuW > window.innerWidth  ? menu.x - menuW : menu.x;
  const top  = menu.y + menuH > window.innerHeight ? menu.y - menuH : menu.y;

  return createPortal(
    <div
      ref={menuRef}
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed', top, left,
        background: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        padding: '4px',
        zIndex: 14000,
        minWidth: '210px',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* ── Formatting ─────────────────────────────────── */}
      <CItem
        label="Bold"
        shortcut="Ctrl+B"
        onClick={() => { editor.chain().focus().toggleBold().run(); close(); }}
      />
      <CItem
        label="Italic"
        shortcut="Ctrl+I"
        onClick={() => { editor.chain().focus().toggleItalic().run(); close(); }}
      />
      <CItem
        label="Underline"
        shortcut="Ctrl+U"
        onClick={() => { editor.chain().focus().toggleUnderline().run(); close(); }}
      />
      <CItem
        label="Clear Formatting"
        onClick={() => { editor.chain().focus().clearNodes().unsetAllMarks().run(); close(); }}
      />

      <CSep />

      {/* ── Clipboard ──────────────────────────────────── */}
      <CItem
        label="Cut"
        shortcut="Ctrl+X"
        onClick={() => { editor.commands.focus(); document.execCommand('cut'); close(); }}
      />
      <CItem
        label="Copy"
        shortcut="Ctrl+C"
        onClick={() => { editor.commands.focus(); document.execCommand('copy'); close(); }}
      />
      <CItem
        label="Paste"
        shortcut="Ctrl+V"
        onClick={async () => {
          close();
          try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              if (item.types.includes('text/html')) {
                const html = await (await item.getType('text/html')).text();
                editor.chain().focus().insertContent(html).run();
                return;
              }
            }
            const text = await navigator.clipboard.readText();
            if (text) editor.chain().focus().insertContent(text).run();
          } catch { /* permission denied */ }
        }}
      />

      <CSep />

      {/* ── Insert Link ────────────────────────────────── */}
      <CItem
        label="Insert Link…"
        shortcut="Ctrl+K"
        onClick={async () => {
          close();
          const url = await editorPrompt({
            title: 'Insert Hyperlink',
            message: 'Enter the URL to link to.',
            defaultValue: 'https://',
            placeholder: 'https://example.com',
            confirmLabel: 'Insert',
          });
          if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
        }}
      />

      {/* ── Link operations (when cursor is on a link) ──── */}
      {editor.isActive('link') && (
        <>
          <CSep />
          <CItem
            label="Edit Link…"
            onClick={async () => {
              const current = editor.getAttributes('link').href || '';
              close();
              const url = await editorPrompt({
                title: 'Edit Hyperlink',
                message: 'Update the URL for this link.',
                defaultValue: current,
                placeholder: 'https://example.com',
                confirmLabel: 'Update',
              });
              if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
            }}
          />
          <CItem
            label="Remove Link"
            onClick={() => { editor.chain().focus().unsetLink().run(); close(); }}
          />
          <CItem
            label="Copy Link URL"
            onClick={() => {
              const href = editor.getAttributes('link').href;
              if (href) navigator.clipboard.writeText(href).catch(() => {});
              close();
            }}
          />
        </>
      )}

      {/* ── Table operations ───────────────────────────── */}
      {inTable && (
        <>
          <CSep />
          <CItem label="Insert Row Above" onClick={() => { editor.chain().focus().addRowBefore().run(); close(); }} />
          <CItem label="Insert Row Below" onClick={() => { editor.chain().focus().addRowAfter().run(); close(); }} />
          <CItem label="Insert Column Left" onClick={() => { editor.chain().focus().addColumnBefore().run(); close(); }} />
          <CItem label="Insert Column Right" onClick={() => { editor.chain().focus().addColumnAfter().run(); close(); }} />
          <CSep />
          <CItem label="Merge Cells" onClick={() => { editor.chain().focus().mergeCells().run(); close(); }} />
          <CItem label="Split Cell" onClick={() => { editor.chain().focus().splitCell().run(); close(); }} />
          <CSep />
          <CItem label="Delete Row" danger onClick={() => { editor.chain().focus().deleteRow().run(); close(); }} />
          <CItem label="Delete Column" danger onClick={() => { editor.chain().focus().deleteColumn().run(); close(); }} />
          <CItem label="Delete Table" danger onClick={() => { editor.chain().focus().deleteTable().run(); close(); }} />
        </>
      )}

      {/* ── Image operations ───────────────────────────── */}
      {inImage && (
        <>
          <CSep />
          <CItem label="Align Left"   onClick={() => { editor.chain().focus().setTextAlign('left').run();   close(); }} />
          <CItem label="Align Center" onClick={() => { editor.chain().focus().setTextAlign('center').run(); close(); }} />
          <CItem label="Align Right"  onClick={() => { editor.chain().focus().setTextAlign('right').run();  close(); }} />
          <CSep />
          <CItem label="Delete Image" danger onClick={() => { editor.chain().focus().deleteSelection().run(); close(); }} />
        </>
      )}
    </div>,
    target
  );
}
