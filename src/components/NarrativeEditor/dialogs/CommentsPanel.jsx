import React, { useState, useRef, useEffect } from 'react';

/** Format a date string nicely */
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
  catch (_) { return iso; }
}

/** Single comment card */
function CommentCard({ comment, isActive, onActivate, onAddReply, onResolve, onDelete }) {
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const inputRef = useRef(null);

  const handleReply = () => {
    const text = replyText.trim();
    if (!text) return;
    onAddReply(comment.id, text);
    setReplyText('');
    setShowReply(false);
  };

  const handleReplyKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); }
    if (e.key === 'Escape') { setShowReply(false); setReplyText(''); }
  };

  useEffect(() => {
    if (showReply) inputRef.current?.focus();
  }, [showReply]);

  return (
    <div
      onClick={onActivate}
      style={{
        marginBottom: '8px',
        background: isActive ? '#fffbea' : '#fff',
        border: `1px solid ${isActive ? '#f59e0b' : '#e5e7eb'}`,
        borderRadius: '6px',
        padding: '10px 12px',
        cursor: isActive ? 'default' : 'pointer',
        opacity: comment.resolved ? 0.55 : 1,
        transition: 'border-color 0.15s, background 0.15s',
        fontSize: '12px',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 600, color: '#374151' }}>{comment.author || 'Author'}</span>
        <span style={{ color: '#9ca3af', fontSize: '10px' }}>{fmtDate(comment.date)}</span>
      </div>

      {/* Comment text */}
      <div style={{ color: '#111827', lineHeight: 1.5, marginBottom: '6px', whiteSpace: 'pre-wrap' }}>
        {comment.text || <em style={{ color: '#9ca3af' }}>No text</em>}
      </div>

      {/* Replies */}
      {comment.replies?.length > 0 && (
        <div style={{ borderLeft: '2px solid #f3f4f6', paddingLeft: '8px', marginBottom: '6px' }}>
          {comment.replies.map((r, i) => (
            <div key={i} style={{ marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, color: '#374151', marginRight: '6px', fontSize: '11px' }}>{r.author}</span>
              <span style={{ color: '#6b7280', fontSize: '10px' }}>{fmtDate(r.date)}</span>
              <div style={{ color: '#111827', marginTop: '2px', fontSize: '11px' }}>{r.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {showReply && (
        <div style={{ marginBottom: '6px' }}>
          <textarea
            ref={inputRef}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={handleReplyKeyDown}
            placeholder="Type a reply…"
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '1px solid #d1d5db', borderRadius: '4px',
              padding: '4px 6px', fontSize: '11px', resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: '4px', marginTop: '3px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowReply(false); setReplyText(''); }} style={secondaryBtnStyle}>Cancel</button>
            <button onClick={handleReply} style={primaryBtnStyle}>Reply</button>
          </div>
        </div>
      )}

      {/* Actions */}
      {isActive && !comment.resolved && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
          <button onClick={e => { e.stopPropagation(); setShowReply(v => !v); }} style={secondaryBtnStyle}>
            Reply
          </button>
          <button onClick={e => { e.stopPropagation(); onResolve(comment.id); }} style={secondaryBtnStyle}>
            ✓ Resolve
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(comment.id); }}
            style={{ ...secondaryBtnStyle, color: '#ef4444' }}
          >
            🗑 Delete
          </button>
        </div>
      )}

      {comment.resolved && (
        <div style={{ color: '#10b981', fontSize: '10px', marginTop: '4px' }}>✓ Resolved</div>
      )}
    </div>
  );
}

const primaryBtnStyle = {
  padding: '2px 8px', fontSize: '11px', borderRadius: '4px',
  border: '1px solid #3b82f6', background: '#3b82f6', color: '#fff',
  cursor: 'pointer',
};

const secondaryBtnStyle = {
  padding: '2px 8px', fontSize: '11px', borderRadius: '4px',
  border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151',
  cursor: 'pointer',
};

/**
 * CommentsPanel — fixed right-side panel showing all inline comments.
 *
 * Props:
 *   open           {boolean}
 *   comments       {Array<{id,text,author,date,resolved,replies}>}
 *   pendingId      {string|null}  — id of a newly added (empty) comment needing text
 *   activeId       {string|null}  — id of currently focused comment
 *   onSetActive    {fn(id)}
 *   onSetText      {fn(id, text)} — set the text of a new comment
 *   onAddReply     {fn(id, text)}
 *   onResolve      {fn(id)}
 *   onDelete       {fn(id)}
 *   onClose        {fn()}
 */
export default function CommentsPanel({
  open,
  comments = [],
  pendingId = null,
  activeId  = null,
  onSetActive,
  onSetText,
  onAddReply,
  onResolve,
  onDelete,
  onClose,
}) {
  const [pendingText, setPendingText] = useState('');
  const pendingRef  = useRef(null);

  // Focus the pending input when a new comment is added
  useEffect(() => {
    if (pendingId) {
      setPendingText('');
      setTimeout(() => pendingRef.current?.focus(), 50);
    }
  }, [pendingId]);

  const submitPending = () => {
    const text = pendingText.trim();
    if (text && pendingId) onSetText(pendingId, text);
    setPendingText('');
  };

  const pendingKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPending(); }
    if (e.key === 'Escape') { onDelete(pendingId); setPendingText(''); }
  };

  if (!open) return null;

  const pending  = comments.find(c => c.id === pendingId);
  const resolved = comments.filter(c => c.resolved && c.id !== pendingId);
  const active   = comments.filter(c => !c.resolved && c.id !== pendingId);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: '300px',
        background: '#f9fafb',
        borderLeft: '1px solid #e5e7eb',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
        background: '#fff', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>
          Comments ({active.length})
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#6b7280', lineHeight: 1 }}
          title="Close comments panel"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>

        {/* Pending (new) comment input */}
        {pending && (
          <div style={{
            marginBottom: '8px',
            background: '#fffbea',
            border: '2px solid #f59e0b',
            borderRadius: '6px',
            padding: '10px 12px',
          }}>
            <div style={{ fontWeight: 600, fontSize: '12px', color: '#92400e', marginBottom: '6px' }}>
              New comment
            </div>
            <textarea
              ref={pendingRef}
              value={pendingText}
              onChange={e => setPendingText(e.target.value)}
              onKeyDown={pendingKeyDown}
              placeholder="Type your comment… (Enter to save, Esc to cancel)"
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid #d1d5db', borderRadius: '4px',
                padding: '4px 6px', fontSize: '12px', resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={() => { onDelete(pendingId); setPendingText(''); }} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button onClick={submitPending} style={primaryBtnStyle} disabled={!pendingText.trim()}>
                Save
              </button>
            </div>
          </div>
        )}

        {/* Active comments */}
        {active.length === 0 && !pending && (
          <p style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center', marginTop: '24px' }}>
            No comments yet.<br />
            Select text and press <kbd style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+Alt+M</kbd> to add one.
          </p>
        )}

        {active.map(c => (
          <CommentCard
            key={c.id}
            comment={c}
            isActive={c.id === activeId}
            onActivate={() => onSetActive(c.id)}
            onAddReply={onAddReply}
            onResolve={onResolve}
            onDelete={onDelete}
          />
        ))}

        {/* Resolved */}
        {resolved.length > 0 && (
          <>
            <div style={{ fontSize: '10px', color: '#9ca3af', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Resolved ({resolved.length})
            </div>
            {resolved.map(c => (
              <CommentCard
                key={c.id}
                comment={c}
                isActive={c.id === activeId}
                onActivate={() => onSetActive(c.id)}
                onAddReply={onAddReply}
                onResolve={onResolve}
                onDelete={onDelete}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
