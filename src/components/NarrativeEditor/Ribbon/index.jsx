import React, { useState, useRef, useLayoutEffect } from 'react';
import HomeTab from './HomeTab';
import InsertTab from './InsertTab';
import LayoutTab from './LayoutTab';
import ReviewTab from './ReviewTab';
import ViewTab from './ViewTab';
import TemplatesQuickPicker from './TemplatesQuickPicker';
import ActiveStyleIndicator from './ActiveStyleIndicator';
import HeadingQuickBar from './HeadingQuickBar';
import ZoomQuickControl from './ZoomQuickControl';
import { Icon, ICONS } from './RibbonControls';

// Modern system font stack — clean, premium feel, no network dep.
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif';

// Premium palette — SLATE accent. Restrained, professional, clinical-grade
// (matches RibbonControls.jsx token set).
const COLOR = {
  bg:           'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
  surface:      '#ffffff',
  border:       '#e2e8f0',
  borderSoft:   '#eef2f6',
  text:         '#0f172a',
  textMute:     '#64748b',
  textSoft:     '#94a3b8',
  accent:       '#2563eb',
  accentDeep:   '#1d4ed8',
  accentSoft:   '#eff6ff',
  danger:       '#dc2626',
  dangerSoft:   '#fee2e2',
};

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

// Same safe-can wrapper as in HomeTab — tiptap's internal Editor.can() can throw
// during concurrent rendering when the editor is mid-init.
function safeCan(editor, commandName) {
  if (!editor) return false;
  try {
    const can = editor.can?.();
    if (!can) return false;
    const fn = can[commandName];
    return typeof fn === 'function' ? !!fn() : false;
  } catch {
    return false;
  }
}

// Tab icons as inline SVGs — replaces emoji for a polished look.
const TabIcons = {
  home: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  insert: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5"  x2="12" y2="19" />
      <line x1="5"  y1="12" x2="19" y2="12" />
    </svg>
  ),
  layout: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3"  y="3"  width="7" height="9" rx="1" />
      <rect x="14" y="3"  width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3"  y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  review: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  view: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const TABS = [
  { id: 'home',   label: 'Home',   icon: TabIcons.home },
  { id: 'insert', label: 'Insert', icon: TabIcons.insert },
  { id: 'layout', label: 'Layout', icon: TabIcons.layout },
  { id: 'review', label: 'Review', icon: TabIcons.review },
  { id: 'view',   label: 'View',   icon: TabIcons.view },
];

/**
 * Premium ribbon with smooth animated tab indicator, polished pill buttons,
 * and a save-status pill in the quick-access area.
 */
export default function Ribbon(props) {
  const {
    editor, onSave, isFullscreen, toggleFullscreen,
    voiceSupported, voiceActive, onToggleVoice,
    saveStatus,            // '' | 'modified' | 'saving' | 'saved'
    lastSavedAt,           // Date | null
    onOpenTemplates,       // opens full picker dialog
    onApplyTemplate,       // (html, opts) — applies template directly (QAT quick pick)
    onOpenFinalize,        // opens the Finalize dialog
    isFinalized,           // current report finalized state
    onSaveVersion,         // (label?) — snapshots a version into history
    zoom,                  // current zoom percent
    setZoom,               // fn(z) to apply a new zoom
    zoomLevels,            // sorted array of preset levels
  } = props;

  const [activeTab, setActiveTab] = useState('home');
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  // Friction #6 — compact mode. When on, tab strip shows icons only and
  // the tab content area pads tighter. Persisted in localStorage so the
  // user's preference sticks across reloads. Opt-in by default.
  const [compact, setCompact] = useState(() => {
    try { return window.localStorage?.getItem('narrative-editor:ribbon-compact') === '1'; }
    catch { return false; }
  });
  const toggleCompact = () => {
    setCompact(v => {
      const next = !v;
      try { window.localStorage?.setItem('narrative-editor:ribbon-compact', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  // Animated active-tab underline — measures the active tab button and
  // slides a single absolutely-positioned underline across the tab strip.
  const tabRefs = useRef({});
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const node = tabRefs.current[activeTab];
    if (node) setUnderline({ left: node.offsetLeft, width: node.offsetWidth });
    // `compact` in deps so the underline re-measures when labels appear /
    // disappear (which changes the tab button widths).
  }, [activeTab, compact]);

  const handleTabClick = (id) => {
    if (ribbonCollapsed) setRibbonCollapsed(false);
    setActiveTab(id);
  };
  const handleTabDoubleClick = (id) => {
    setActiveTab(id);
    setRibbonCollapsed(c => !c);
  };

  if (!editor) return null;

  return (
    <div className="word-ribbon" style={{
      background: COLOR.bg,
      borderBottom: `1px solid ${COLOR.border}`,
      flexShrink: 0,
      userSelect: 'none',
      fontFamily: FONT_STACK,
      boxShadow: '0 1px 0 rgba(0, 0, 0, 0.02), 0 4px 12px -8px rgba(0, 0, 0, 0.08)',
    }}>
      <style>{`
        @keyframes narrative-mic-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.92); }
        }
        @keyframes narrative-save-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
        .word-ribbon ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Quick-Access Toolbar ────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: '4px',
        height: '28px',
        padding: '0 14px',
        background: 'transparent',
        borderBottom: `1px solid ${COLOR.borderSoft}`,
        fontSize: '11px',
      }}>
        <QATBtn
          title="Save (Ctrl+S)"
          onClick={() => onSave?.()}
          icon={(
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4l-3-3zM9 13H5v-3h4v3zm2-7H4V3h7v3z"/></svg>
          )}
        />
        <QATBtn
          title="Undo (Ctrl+Z)"
          disabled={!safeCan(editor, 'undo')}
          onClick={() => editor?.chain().focus().undo().run()}
          icon={<Icon d={ICONS.undo} size={14} />}
        />
        <QATBtn
          title="Redo (Ctrl+Y)"
          disabled={!safeCan(editor, 'redo')}
          onClick={() => editor?.chain().focus().redo().run()}
          icon={<Icon d={ICONS.redo} size={14} />}
        />

        <SaveStatusPill saveStatus={saveStatus} lastSavedAt={lastSavedAt} />

        {/* Always-visible H1/H2/H3/Normal quick bar — section heading changes
            are 1 click regardless of which Ribbon tab is currently showing. */}
        <HeadingQuickBar editor={editor} />

        {/* Live readout of the current selection's style — saves the typist
            from bouncing through ribbon tabs to find "what's my heading
            level / alignment?" Updates on every selection or transaction. */}
        <ActiveStyleIndicator editor={editor} />

        {/* Voice dictation toggle — power-typist hotkey for hands-free input
            while measuring with one hand. Hidden if the Web Speech API isn't
            available in this browser (Firefox / older Safari). */}
        {voiceSupported && (
          <QATBtn
            title={voiceActive ? 'Stop voice dictation' : 'Start voice dictation'}
            onClick={onToggleVoice}
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3" fill={voiceActive ? '#dc2626' : 'none'} stroke={voiceActive ? '#dc2626' : 'currentColor'} />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <line x1="12" y1="18" x2="12" y2="22" />
              </svg>
            )}
          />
        )}

        {/* Snapshot a version into history — quick capture without opening
            the version history dialog. Disabled on finalized reports. */}
        {onSaveVersion && (
          <QATBtn
            title="Save version snapshot"
            disabled={isFinalized}
            onClick={() => onSaveVersion()}
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            )}
          />
        )}

        {/* Zoom control — always visible (including in fullscreen / on the
            mobile MobileToolbar parent layout). Stepper buttons + dropdown
            of presets. Was hidden in the View tab; surfaced here so a
            typist working in fullscreen can zoom without leaving the
            keyboard / mouse focus area. */}
        {typeof setZoom === 'function' && (
          <ZoomQuickControl zoom={zoom} setZoom={setZoom} zoomLevels={zoomLevels} />
        )}

        {/* Right-aligned filler */}
        <div style={{ flex: 1 }} />

        {/* Templates quick-picker — 1-click access to common report templates.
            The full picker dialog stays available via the dropdown's
            "Browse all templates…" footer. */}
        {onApplyTemplate && (
          <TemplatesQuickPicker
            onApply={onApplyTemplate}
            onOpenFull={onOpenTemplates}
          />
        )}

        {/* Finalize report — the typist's "ship it" button. Lives on the QAT
            because it's the last action on every case; previously buried in
            the Review tab. Disabled (and visually muted) once the report is
            already finalized. */}
        {onOpenFinalize && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); if (!isFinalized) onOpenFinalize(); }}
            disabled={isFinalized}
            title={isFinalized ? 'Already finalized' : 'Finalize this report'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              height: '24px', padding: '0 10px',
              background: isFinalized
                ? '#e2e8f0'
                : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              color: isFinalized ? '#94a3b8' : '#ffffff',
              border: '1px solid ' + (isFinalized ? '#cbd5e1' : '#15803d'),
              borderRadius: '5px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.4px',
              cursor: isFinalized ? 'not-allowed' : 'pointer',
              fontFamily: FONT_STACK,
              boxShadow: isFinalized ? 'none' : '0 1px 4px rgba(22, 163, 74, 0.3)',
            }}
            onMouseEnter={(e) => { if (!isFinalized) e.currentTarget.style.opacity = '0.92'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M13.854 3.146a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 9.793l6.646-6.647a.5.5 0 0 1 .708 0z" />
            </svg>
            <span>{isFinalized ? 'FINALIZED' : 'FINALIZE'}</span>
          </button>
        )}
      </div>

      {/* ── Tab strip ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: COLOR.surface,
        height: '38px',
        borderBottom: `1px solid ${COLOR.border}`,
        padding: '0 12px',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', position: 'relative' }}>
          {TABS.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                ref={el => { if (el) tabRefs.current[t.id] = el; }}
                onMouseDown={e => { e.preventDefault(); handleTabClick(t.id); }}
                onDoubleClick={e => { e.preventDefault(); handleTabDoubleClick(t.id); }}
                // In compact mode the tab label disappears so the user sees
                // just the icon. Title attribute carries the label so a
                // tooltip still gives the name on hover - no information
                // lost, only visual real estate reclaimed.
                title={compact ? t.label : undefined}
                style={{
                  position: 'relative',
                  border: 'none',
                  background: 'transparent',
                  padding: compact ? '0 10px' : '0 16px',
                  height: '100%',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? COLOR.accent : COLOR.text,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: compact ? 0 : '7px',
                  letterSpacing: '0.05px',
                  transition: `color 0.18s ${EASE}`,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = COLOR.accent; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = COLOR.text; }}
              >
                <span style={{ opacity: isActive ? 1 : 0.7, display: 'inline-flex' }}>{t.icon}</span>
                {!compact && <span>{t.label}</span>}
              </button>
            );
          })}
          {/* Animated underline that slides between tabs */}
          <span style={{
            position: 'absolute',
            bottom: 0,
            left: underline.left,
            width: underline.width,
            height: '2px',
            background: COLOR.accent,
            borderRadius: '2px 2px 0 0',
            transition: `left 0.32s ${EASE}, width 0.32s ${EASE}`,
            pointerEvents: 'none',
          }} />
        </div>

        {/* ── Persistent right-side controls ──────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {voiceSupported && onToggleVoice && (
            <PillButton
              icon={(
                <span style={{ display: 'inline-flex',
                  animation: voiceActive ? 'narrative-mic-pulse 1.2s ease-in-out infinite' : 'none',
                }}>
                  <Icon d={ICONS.mic} size={13} />
                </span>
              )}
              label={voiceActive ? 'Listening…' : 'Dictate'}
              active={voiceActive}
              activeBg={COLOR.danger}
              activeRing={'rgba(220, 38, 38, 0.18)'}
              title={voiceActive ? 'Stop dictation' : 'Start voice dictation'}
              onClick={onToggleVoice}
              showDot={voiceActive}
            />
          )}

          {toggleFullscreen && (
            <PillButton
              icon={<Icon d={isFullscreen ? ICONS.exitFs : ICONS.fullscreen} size={13} />}
              label={isFullscreen ? 'Exit Full' : 'Full Screen'}
              active={isFullscreen}
              activeBg={COLOR.accent}
              activeRing={'rgba(0, 102, 255, 0.18)'}
              title={isFullscreen ? 'Exit Full Screen (F11)' : 'Enter Full Screen (F11)'}
              onClick={(e) => { e?.preventDefault?.(); e?.stopPropagation?.(); toggleFullscreen(); }}
            />
          )}

          {/* Compact-mode toggle (friction #6). Icon-only when active,
              outlined when inactive. Preference persists in localStorage. */}
          <button
            onMouseDown={e => { e.preventDefault(); toggleCompact(); }}
            title={compact ? 'Expanded ribbon' : 'Compact ribbon'}
            aria-pressed={compact}
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: compact ? COLOR.accent : COLOR.surface,
              border: `1px solid ${compact ? COLOR.accent : COLOR.border}`,
              color: compact ? '#fff' : COLOR.textMute,
              fontSize: '12px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: `all 0.18s ${EASE}`,
            }}
            onMouseEnter={e => {
              if (compact) return;
              e.currentTarget.style.background = COLOR.accentSoft;
              e.currentTarget.style.borderColor = COLOR.accent;
              e.currentTarget.style.color = COLOR.accent;
            }}
            onMouseLeave={e => {
              if (compact) return;
              e.currentTarget.style.background = COLOR.surface;
              e.currentTarget.style.borderColor = COLOR.border;
              e.currentTarget.style.color = COLOR.textMute;
            }}
          >
            {/* Two-bar icon - more bars = more density. Compact = single bar. */}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              {compact
                ? <rect x="3" y="7" width="10" height="2" rx="1" />
                : <><rect x="3" y="4" width="10" height="2" rx="1" /><rect x="3" y="10" width="10" height="2" rx="1" /></>}
            </svg>
          </button>

          {/* Circular help button */}
          <button
            onMouseDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('narrative-editor:open-shortcuts')); }}
            title="Keyboard shortcuts (F1)"
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: COLOR.surface, border: `1px solid ${COLOR.border}`,
              color: COLOR.textMute, fontSize: '13px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: `all 0.18s ${EASE}`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = COLOR.accentSoft;
              e.currentTarget.style.borderColor = COLOR.accent;
              e.currentTarget.style.color = COLOR.accent;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = COLOR.surface;
              e.currentTarget.style.borderColor = COLOR.border;
              e.currentTarget.style.color = COLOR.textMute;
            }}
          >?</button>

          {/* Premium Save button */}
          {onSave && (
            <button
              onMouseDown={e => { e.preventDefault(); onSave(); }}
              title="Save (Ctrl+S)"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                height: '28px', padding: '0 16px',
                background: `linear-gradient(135deg, ${COLOR.accent} 0%, ${COLOR.accentDeep} 100%)`,
                color: '#fff', border: 'none',
                borderRadius: '999px',
                fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '0.1px',
                boxShadow: '0 1px 2px rgba(0, 102, 255, 0.30), 0 0 0 1px rgba(0, 102, 255, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.20)',
                transition: `all 0.2s ${EASE}`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 102, 255, 0.35), 0 0 0 1px rgba(0, 102, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 102, 255, 0.30), 0 0 0 1px rgba(0, 102, 255, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.20)';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4l-3-3zM9 13H5v-3h4v3zm2-7H4V3h7v3z"/></svg>
              <span style={{ lineHeight: 1 }}>Save</span>
            </button>
          )}

          {/* Collapse toggle */}
          <button
            onMouseDown={e => { e.preventDefault(); setRibbonCollapsed(c => !c); }}
            title={ribbonCollapsed ? 'Expand ribbon (Ctrl+F1)' : 'Collapse ribbon (Ctrl+F1)'}
            style={{
              width: '26px', height: '26px', borderRadius: '50%',
              background: 'transparent', border: '1px solid transparent',
              color: COLOR.textMute, fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: `all 0.18s ${EASE}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = COLOR.accentSoft; e.currentTarget.style.color = COLOR.accent; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = COLOR.textMute; }}
          >
            {ribbonCollapsed ? '⌄' : '⌃'}
          </button>
        </div>
      </div>

      {/* ── Active tab body ────────────────────────────────────
          Height bumped to 112 px to fit:
            • 30-px Btn × 2 rows = 60 px content
            + 4-px inner-stack gap                        = 64
            + 4-px button-row paddingTop + 8-px paddingBottom = 76
            + 20-px label-row height (with 6-px label paddingTop)
            + 1-px label-row borderTop                    = 97
            + 4-px tab body paddingTop                    = 101
          ~11 px slack so the bottom of the bottom button row sits
          clearly above the label divider line. Previous 92→108 was
          fine for height math but the visual proximity of bottom
          buttons to the label still felt cramped. */}
      <div style={{
        // Compact mode shaves ~16px off the tab body so the canvas
        // gets more vertical room. The button rows inside don't
        // resize - this is just the wrapper padding - so no risk of
        // clipping content.
        height: ribbonCollapsed ? '0' : (compact ? '96px' : '112px'),
        padding: ribbonCollapsed ? '0 12px' : (compact ? '0 12px 0' : '4px 12px 0'),
        background: 'transparent',
        overflowX: ribbonCollapsed ? 'hidden' : 'auto',
        overflowY: 'hidden',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        transition: `height 0.24s ${EASE}, padding 0.24s ${EASE}`,
      }}>
        {activeTab === 'home'   && <HomeTab   {...props} />}
        {activeTab === 'insert' && <InsertTab {...props} />}
        {activeTab === 'layout' && <LayoutTab {...props} />}
        {activeTab === 'review' && <ReviewTab {...props} />}
        {activeTab === 'view'   && <ViewTab   {...props} />}
      </div>
    </div>
  );
}

/**
 * Quick-Access Toolbar button — refined, larger hit target, accent hover.
 */
const QATBtn = ({ title, onClick, disabled, icon }) => (
  <button
    onMouseDown={e => { e.preventDefault(); if (!disabled) onClick?.(); }}
    disabled={disabled}
    title={title}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '26px', height: '24px', padding: 0,
      background: 'transparent', border: '1px solid transparent',
      borderRadius: '6px',
      color: disabled ? '#c8ccd1' : COLOR.textMute,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit',
      transition: `all 0.16s ${EASE}`,
    }}
    onMouseEnter={e => {
      if (!disabled) {
        e.currentTarget.style.background = COLOR.accentSoft;
        e.currentTarget.style.color = COLOR.accent;
      }
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = disabled ? '#c8ccd1' : COLOR.textMute;
    }}
  >
    {icon}
  </button>
);

/**
 * Reusable pill-style action button — used by Dictate + Full Screen.
 */
const PillButton = ({ icon, label, active, activeBg, activeRing, title, onClick, showDot }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(e); }}
    title={title}
    aria-pressed={active}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      height: '28px', padding: '0 12px 0 11px',
      background: active ? activeBg : COLOR.surface,
      border: `1px solid ${active ? activeBg : COLOR.border}`,
      borderRadius: '999px',
      color: active ? '#ffffff' : COLOR.text,
      fontSize: '11.5px', fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      letterSpacing: '0.1px',
      boxShadow: active
        ? `0 0 0 3px ${activeRing}, 0 1px 2px rgba(0, 0, 0, 0.06)`
        : '0 1px 0 rgba(0, 0, 0, 0.02)',
      transition: `all 0.18s ${EASE}`,
    }}
    onMouseEnter={e => {
      if (!active) {
        e.currentTarget.style.background = COLOR.accentSoft;
        e.currentTarget.style.borderColor = COLOR.accent;
        e.currentTarget.style.color = COLOR.accent;
      }
    }}
    onMouseLeave={e => {
      if (!active) {
        e.currentTarget.style.background = COLOR.surface;
        e.currentTarget.style.borderColor = COLOR.border;
        e.currentTarget.style.color = COLOR.text;
      }
    }}
  >
    {icon}
    <span style={{ lineHeight: 1 }}>{label}</span>
    {showDot && (
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: '#fff',
        animation: 'narrative-mic-pulse 1.2s ease-in-out infinite',
      }} />
    )}
  </button>
);

/**
 * Save-status pill in the QAT — shows live save state.
 *   • Modified  → amber
 *   • Saving…   → blue, pulsing
 *   • Saved     → green, fades
 *   • Saved at HH:MM (idle) → grey, subtle
 */
const SaveStatusPill = ({ saveStatus, lastSavedAt }) => {
  let label = null, color = null, bg = null, anim = null;

  if (saveStatus === 'modified') {
    label = 'Unsaved changes'; color = '#b45309'; bg = 'rgba(251,191,36,0.16)';
  } else if (saveStatus === 'saving') {
    label = 'Saving…'; color = COLOR.accent; bg = COLOR.accentSoft;
    anim = 'narrative-save-pulse 1.2s ease-in-out infinite';
  } else if (saveStatus === 'saved') {
    label = '✓ Saved'; color = '#16a34a'; bg = 'rgba(22,163,74,0.12)';
  } else if (lastSavedAt) {
    const t = (lastSavedAt instanceof Date ? lastSavedAt : new Date(lastSavedAt))
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    label = `Saved · ${t}`; color = COLOR.textMute; bg = 'rgba(0, 0, 0, 0.03)';
  }
  if (!label) return null;

  return (
    <span style={{
      marginLeft: '8px',
      display: 'inline-flex', alignItems: 'center',
      height: '20px', padding: '0 10px',
      background: bg,
      borderRadius: '999px',
      color, fontSize: '10.5px', fontWeight: 600,
      letterSpacing: '0.2px',
      animation: anim ?? 'none',
    }}>
      {label}
    </span>
  );
};
