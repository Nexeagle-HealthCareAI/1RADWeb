import React, { useState, useRef } from 'react';
import {
  Btn, BigBtn, Sep, Icon, Group, selectStyle, ICONS,
  FONT_FAMILIES, FONT_SIZES, HIGHLIGHTS, ColorPicker,
} from './RibbonControls';
import StylesGallery from './StylesGallery';
import { editorPrompt } from '../dialogs/PromptDialog';

/**
 * HomeTab — primary formatting controls.
 * Groups: Clipboard | Font | Paragraph | Styles | History
 */
export default function HomeTab({ editor }) {
  const [showColors, setShowColors] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const colorBtnRef = useRef(null);
  const hlBtnRef = useRef(null);

  if (!editor) return null;

  const attrs = editor.getAttributes('textStyle');
  const currentFontFamily = attrs.fontFamily || 'Calibri';
  const currentFontSize = (attrs.fontSize || '12pt').replace('pt', '');
  const currentColor = attrs.color || '#000000';
  const currentHL = editor.getAttributes('highlight').color || null;
  const painterActive = !!editor.storage?.formatPainter?.active;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      {/* ── Clipboard group ─────────────────────────────── */}
      <Group label="Clipboard">
        <BigBtn
          icon="📋"
          label="Paste"
          title="Paste (Ctrl+V)"
          onClick={() => navigator.clipboard.readText().then(t => editor.chain().focus().insertContent(t).run()).catch(() => {})}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'stretch', justifyContent: 'space-between', height: '52px' }}>
          <Btn onClick={() => document.execCommand('cut')} title="Cut (Ctrl+X)" style={{ fontSize: '11px', height: '17px', justifyContent: 'flex-start', minWidth: '64px' }}>
            <span style={{ marginRight: '4px' }}>✂</span> Cut
          </Btn>
          <Btn onClick={() => document.execCommand('copy')} title="Copy (Ctrl+C)" style={{ fontSize: '11px', height: '17px', justifyContent: 'flex-start', minWidth: '64px' }}>
            <span style={{ marginRight: '4px' }}>⎘</span> Copy
          </Btn>
          <Btn
            onClick={() => {
              if (painterActive) editor.chain().applyFormat().run();
              else editor.chain().pickupFormat().run();
            }}
            active={painterActive}
            title="Format Painter (Ctrl+Shift+C / V)"
            style={{ fontSize: '11px', height: '17px', justifyContent: 'flex-start', minWidth: '64px' }}
          >
            <span style={{ marginRight: '4px' }}><Icon d={ICONS.brush} size={11} /></span> Painter
          </Btn>
        </div>
      </Group>

      <Sep />

      {/* ── Font group ──────────────────────────────────── */}
      <Group label="Font">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <select
              value={currentFontFamily}
              onChange={e => editor.chain().focus().setMark('textStyle', { fontFamily: e.target.value }).run()}
              style={{ ...selectStyle, width: '130px', fontFamily: currentFontFamily }}
              title="Font Family"
            >
              {FONT_FAMILIES.map(f => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
            <select
              value={currentFontSize}
              onChange={e => editor.chain().focus().setMark('textStyle', { fontSize: `${e.target.value}pt` }).run()}
              style={{ ...selectStyle, width: '54px' }}
              title="Font Size"
            >
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1px' }}>
            <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)" style={{ fontWeight: 900 }}>B</Btn>
            <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)" style={{ fontStyle: 'italic' }}>I</Btn>
            <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)" style={{ textDecoration: 'underline' }}>U</Btn>
            <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough" style={{ textDecoration: 'line-through' }}>S</Btn>
            <Btn onClick={() => editor.commands.toggleSubscript?.()} active={editor.isActive('subscript')} title="Subscript (Ctrl+=)" style={{ fontSize: '11px' }}>
              x<sub>2</sub>
            </Btn>
            <Btn onClick={() => editor.commands.toggleSuperscript?.()} active={editor.isActive('superscript')} title="Superscript (Ctrl+Shift++)" style={{ fontSize: '11px' }}>
              x<sup>2</sup>
            </Btn>

            {/* Text color */}
            <div ref={colorBtnRef} style={{ display: 'inline-flex' }}>
              <Btn onClick={() => { setShowColors(v => !v); setShowHighlights(false); }} title="Font Color">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontWeight: 900, fontSize: '13px', lineHeight: 1 }}>A</span>
                  <div style={{ width: '16px', height: '3px', background: currentColor, borderRadius: '1px' }} />
                </div>
              </Btn>
            </div>
            {showColors && (
              <ColorPicker
                anchorEl={colorBtnRef.current}
                onSelect={c => editor.chain().focus().setColor(c).run()}
                onClear={() => editor.chain().focus().unsetColor().run()}
                onClose={() => setShowColors(false)}
                clearLabel="Automatic"
              />
            )}

            {/* Highlight */}
            <div ref={hlBtnRef} style={{ display: 'inline-flex' }}>
              <Btn onClick={() => { setShowHighlights(v => !v); setShowColors(false); }} title="Highlight Color">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontSize: '12px', lineHeight: 1 }}>ab</span>
                  <div style={{ width: '16px', height: '3px', background: currentHL || '#ffff00', borderRadius: '1px' }} />
                </div>
              </Btn>
            </div>
            {showHighlights && (
              <ColorPicker
                anchorEl={hlBtnRef.current}
                onSelect={c => editor.chain().focus().setHighlight({ color: c }).run()}
                onClear={() => editor.chain().focus().unsetHighlight().run()}
                onClose={() => setShowHighlights(false)}
                clearLabel="No Highlight"
              />
            )}

            <Btn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting (Ctrl+\\)">
              <Icon d={ICONS.clearFmt} />
            </Btn>
          </div>
        </div>
      </Group>

      <Sep />

      {/* ── Paragraph group ─────────────────────────────── */}
      <Group label="Paragraph">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '1px' }}>
            <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List (Ctrl+Shift+8)">
              <Icon d={ICONS.bulletList} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List (Ctrl+Shift+7)">
              <Icon d={ICONS.orderedList} />
            </Btn>
            <Btn
              onClick={() => {
                if (editor.can().liftListItem('listItem')) editor.chain().focus().liftListItem('listItem').run();
                else editor.chain().focus().decreaseParagraphIndent().run();
              }}
              title="Decrease Indent (Shift+Tab)"
              style={{ fontSize: '14px' }}
            >⇤</Btn>
            <Btn
              onClick={() => {
                if (editor.can().sinkListItem('listItem')) editor.chain().focus().sinkListItem('listItem').run();
                else editor.chain().focus().increaseParagraphIndent().run();
              }}
              title="Increase Indent (Tab)"
              style={{ fontSize: '14px' }}
            >⇥</Btn>
            <select
              value={editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || ''}
              onChange={async e => {
                const v = e.target.value;
                if (v === '__custom__') {
                  const current = editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || '1.6';
                  const input = await editorPrompt({
                    title: 'Custom Line Spacing',
                    message: 'Enter a number (e.g. 1.75) or value with unit (e.g. 24px, 150%).',
                    defaultValue: String(current),
                    placeholder: '1.75',
                    confirmLabel: 'Apply',
                  });
                  // Reset the select to its previous state (so it doesn't stay on Custom…)
                  e.target.value = current || '';
                  if (input == null) return;
                  const trimmed = input.trim();
                  if (!trimmed) editor.chain().focus().unsetLineHeight().run();
                  else editor.chain().focus().setLineHeight(trimmed).run();
                  return;
                }
                if (v) editor.chain().focus().setLineHeight(v).run();
                else editor.chain().focus().unsetLineHeight().run();
              }}
              style={{ ...selectStyle, width: '78px' }}
              title="Line Spacing"
            >
              <option value="">Spacing</option>
              <option value="1">1.0</option>
              <option value="1.15">1.15</option>
              <option value="1.5">1.5</option>
              <option value="2">2.0</option>
              <option value="2.5">2.5</option>
              <option value="3">3.0</option>
              <option value="__custom__">Custom…</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1px' }}>
            <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left (Ctrl+L)">
              <Icon d={ICONS.alignL} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center (Ctrl+E)">
              <Icon d={ICONS.alignC} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right (Ctrl+R)">
              <Icon d={ICONS.alignR} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify (Ctrl+J)">
              <Icon d={ICONS.alignJ} />
            </Btn>
          </div>
        </div>
      </Group>

      <Sep />

      {/* ── Styles group ────────────────────────────────── */}
      <Group label="Styles">
        <StylesGallery editor={editor} />
      </Group>

      <Sep />

      {/* ── History group ───────────────────────────────── */}
      <Group label="History">
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
          <Icon d={ICONS.undo} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
          <Icon d={ICONS.redo} />
        </Btn>
      </Group>
    </div>
  );
}
