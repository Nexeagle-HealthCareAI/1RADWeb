import React, { useState, useEffect, useRef } from 'react';

/**
 * Compact toolbar for the NarrativeEditor on phone-sized viewports (<768 px).
 * The full desktop Ribbon (5 tabs, 17 tools, 7 dialogs) would never fit; this
 * surfaces the radiologist essentials in two thumb-reachable strips:
 *
 *   Top strip:    Save + status (always visible)
 *   Bottom strip: B / I / U  |  list controls  |  undo / redo  |  heading menu
 *
 * 44 × 44 px hit targets follow Apple HIG minimum. The bottom strip uses
 * sticky positioning so the soft keyboard can shrink the viewport without
 * pushing the bar offscreen.
 */
const TouchBtn = ({ onPress, active, disabled, title, children, flex }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    // onPointerDown wins races with the editor's blur on iOS Safari — pressing
    // a button must not de-focus the ProseMirror selection or the formatting
    // command would have nothing to apply itself to.
    onPointerDown={(e) => { e.preventDefault(); }}
    onClick={onPress}
    style={{
      minWidth: '44px',
      height: '44px',
      flex: flex ?? '0 0 auto',
      padding: '0 10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      background: active ? '#e2e8f0' : 'transparent',
      color: active ? '#0f172a' : '#1e293b',
      border: 'none',
      borderRadius: '8px',
      fontSize: '15px',
      fontWeight: active ? 700 : 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      touchAction: 'manipulation',
      WebkitTapHighlightColor: 'transparent',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}
  >
    {children}
  </button>
);

const Divider = () => (
  <div style={{
    width: '1px',
    height: '24px',
    background: '#cbd5e1',
    margin: '0 4px',
    flexShrink: 0,
    alignSelf: 'center',
  }} />
);

const HEADING_OPTIONS = [
  { label: 'Normal', level: null },
  { label: 'Heading 1', level: 1 },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
];

/**
 * @param {object} props
 * @param {'top'|'bottom'} [props.position]  Which strip to render. Default
 *        renders BOTH stacked (legacy); pass 'top' to render only the
 *        Save/status strip (place above canvas), or 'bottom' to render only
 *        the formatting strip (place below canvas so it sticks above the
 *        soft keyboard).
 */
const MobileToolbar = ({
  editor,
  onSave,
  saveStatus,
  isFinalized,
  isFullscreen,
  toggleFullscreen,
  position,
}) => {
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingRef = useRef(null);

  // Force re-render on selection change so active states update
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const tick = () => forceTick(n => n + 1);
    editor.on('selectionUpdate', tick);
    editor.on('transaction', tick);
    return () => {
      editor.off('selectionUpdate', tick);
      editor.off('transaction', tick);
    };
  }, [editor]);

  // Close the heading dropdown on outside tap
  useEffect(() => {
    if (!headingOpen) return;
    const onDown = (e) => {
      if (headingRef.current && !headingRef.current.contains(e.target)) {
        setHeadingOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [headingOpen]);

  if (!editor) return null;

  const canUndo = editor.can()?.undo() ?? false;
  const canRedo = editor.can()?.redo() ?? false;
  const activeHeading = HEADING_OPTIONS.find(opt =>
    opt.level == null
      ? editor.isActive('paragraph')
      : editor.isActive('heading', { level: opt.level })
  ) ?? HEADING_OPTIONS[0];

  const apply = (fn) => {
    editor.chain().focus();
    fn();
  };

  const renderTop = !position || position === 'top';
  const renderBottom = !position || position === 'bottom';

  return (
    <>
      {/* TOP STRIP — Save + status */}
      {renderTop && (
      <div
        className="ne-mobile-top"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '4px 8px',
          height: '44px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          flexShrink: 0,
        }}
      >
        <div style={{
          fontSize: '12px',
          fontWeight: 700,
          color: '#475569',
          letterSpacing: '0.4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}>
          {isFinalized ? 'FINALIZED' : (saveStatus || 'Draft')}
        </div>
        {/* Full / Exit fullscreen toggle. CSS-only fullscreen on iOS (handled
            inside toggleFullscreen) so iPad swipe gestures don't tear it
            down. The button compacts to icon-only at <360px-wide phones. */}
        {toggleFullscreen && (
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            style={{
              minHeight: '36px',
              padding: '0 12px',
              background: isFullscreen ? '#e2e8f0' : 'rgba(15,23,42,0.06)',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.8px',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isFullscreen ? (
                <>
                  <path d="M9 4v5H4" />
                  <path d="M15 4v5h5" />
                  <path d="M4 15h5v5" />
                  <path d="M20 15h-5v5" />
                </>
              ) : (
                <>
                  <path d="M4 9V4h5" />
                  <path d="M20 9V4h-5" />
                  <path d="M4 15v5h5" />
                  <path d="M20 15v5h-5" />
                </>
              )}
            </svg>
            <span>{isFullscreen ? 'EXIT' : 'FULL'}</span>
          </button>
        )}
        {onSave && !isFinalized && (
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onSave}
            style={{
              minHeight: '36px',
              padding: '0 14px',
              background: 'linear-gradient(135deg, #0f52ba, #1e40af)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.8px',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 2px 6px rgba(15, 82, 186, 0.3)',
              flexShrink: 0,
            }}
          >
            SAVE
          </button>
        )}
      </div>
      )}

      {/* BOTTOM STRIP — formatting (sticky so soft keyboard can't hide it) */}
      {renderBottom && (
      <div
        className="ne-mobile-bottom"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          padding: '3px 6px',
          height: '50px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          flexShrink: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          // Keep above the soft keyboard on iOS — position:sticky with bottom:0
          // is set on the parent flex container; this strip just sits within.
        }}
      >
        <TouchBtn
          title="Bold"
          active={editor.isActive('bold')}
          onPress={() => apply(() => editor.chain().toggleBold().run())}
        >
          <span style={{ fontWeight: 900, fontSize: '17px' }}>B</span>
        </TouchBtn>
        <TouchBtn
          title="Italic"
          active={editor.isActive('italic')}
          onPress={() => apply(() => editor.chain().toggleItalic().run())}
        >
          <span style={{ fontStyle: 'italic', fontWeight: 700, fontSize: '17px' }}>I</span>
        </TouchBtn>
        <TouchBtn
          title="Underline"
          active={editor.isActive('underline')}
          onPress={() => apply(() => editor.chain().toggleUnderline().run())}
        >
          <span style={{ textDecoration: 'underline', fontWeight: 700, fontSize: '17px' }}>U</span>
        </TouchBtn>

        <Divider />

        <TouchBtn
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onPress={() => apply(() => editor.chain().toggleBulletList().run())}
        >
          <span style={{ fontSize: '17px' }}>•</span>
        </TouchBtn>
        <TouchBtn
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onPress={() => apply(() => editor.chain().toggleOrderedList().run())}
        >
          <span style={{ fontSize: '12px', fontWeight: 800 }}>1.</span>
        </TouchBtn>

        <Divider />

        <TouchBtn
          title="Undo"
          disabled={!canUndo}
          onPress={() => apply(() => editor.chain().undo().run())}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M3 13c.6-3.4 3.6-6 7.5-6a7.5 7.5 0 0 1 7.5 7.5" />
          </svg>
        </TouchBtn>
        <TouchBtn
          title="Redo"
          disabled={!canRedo}
          onPress={() => apply(() => editor.chain().redo().run())}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M21 13c-.6-3.4-3.6-6-7.5-6a7.5 7.5 0 0 0-7.5 7.5" />
          </svg>
        </TouchBtn>

        <Divider />

        {/* Heading dropdown — anchored to the button, opens upward so it doesn't
            collide with the soft keyboard. */}
        <div ref={headingRef} style={{ position: 'relative', flexShrink: 0 }}>
          <TouchBtn
            title="Paragraph style"
            active={headingOpen || activeHeading.level != null}
            onPress={() => setHeadingOpen(v => !v)}
          >
            <span style={{ fontSize: '12px', fontWeight: 800 }}>{activeHeading.label}</span>
            <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
          </TouchBtn>
          {headingOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 0,
                minWidth: '160px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                boxShadow: '0 12px 28px rgba(15,23,42,0.18)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 9999,
              }}
            >
              {HEADING_OPTIONS.map(opt => {
                const isActive = opt.level == null
                  ? editor.isActive('paragraph')
                  : editor.isActive('heading', { level: opt.level });
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setHeadingOpen(false);
                      if (opt.level == null) {
                        editor.chain().focus().setParagraph().run();
                      } else {
                        editor.chain().focus().toggleHeading({ level: opt.level }).run();
                      }
                    }}
                    style={{
                      minHeight: '40px',
                      padding: '0 14px',
                      textAlign: 'left',
                      background: isActive ? '#eff6ff' : 'transparent',
                      color: '#0f172a',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: opt.level === 1 ? '17px' : opt.level === 2 ? '15px' : opt.level === 3 ? '13px' : '13px',
                      fontWeight: opt.level == null ? 500 : 800,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </>
  );
};

export default MobileToolbar;
