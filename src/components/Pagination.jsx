// ════════════════════════════════════════════════════════════════════════════
//  Pagination.jsx
//
//  One reusable, premium page navigator used across the billing screens so
//  paging looks and behaves the same everywhere.
//
//  • "Previous" / "Next" buttons (full words, disabled at the ends)
//  • Numbered pages with ellipsis windowing — 1 … 4 5 [6] 7 8 … 20 — so a long
//    list never spills into a giant unreadable row of numbers
//  • A "Showing 1–5 of 42 services" line so the user always knows where they are
//  • Compact on mobile / tablet: Previous · Page 2 of 9 · Next
//
//  Drop-in: give it the current page, total pages, and a change handler.
// ════════════════════════════════════════════════════════════════════════════

// Build the windowed list of pages to render: always the first and last page,
// the current page, and one neighbour on each side — with '…' filling the gaps.
function buildPageWindow(current, total) {
  const delta = 1; // neighbours shown on each side of the current page
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    }
  }
  const withDots = [];
  let prev;
  for (const page of pages) {
    if (prev) {
      if (page - prev === 2) withDots.push(prev + 1);   // single gap → show the number
      else if (page - prev > 2) withDots.push('ellipsis');
    }
    withDots.push(page);
    prev = page;
  }
  return withDots;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  isMobile = false,
  itemLabel = 'items',
}) {
  // Nothing to navigate — hide the control entirely.
  if (!totalPages || totalPages <= 1) return null;

  const go = (page) => {
    const next = Math.min(Math.max(1, page), totalPages);
    if (next !== currentPage) {
      onPageChange(next);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const atStart = currentPage <= 1;
  const atEnd = currentPage >= totalPages;

  // "Showing X–Y of N" — only when we know the total count.
  const from = (currentPage - 1) * itemsPerPage + 1;
  const to = totalItems != null
    ? Math.min(currentPage * itemsPerPage, totalItems)
    : currentPage * itemsPerPage;

  const arrowBtn = (disabled) => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '8px 14px', borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: disabled ? '#f8fafc' : 'white',
    color: disabled ? '#cbd5e1' : '#334155',
    fontSize: '12px', fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s', whiteSpace: 'nowrap',
  });

  const numberBtn = (active) => ({
    minWidth: '32px', height: '32px', padding: '0 6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '8px',
    border: active ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
    background: active ? '#1d4ed8' : 'white',
    color: active ? 'white' : '#475569',
    fontSize: '12px', fontWeight: active ? 800 : 600,
    cursor: active ? 'default' : 'pointer',
    transition: 'all 0.2s',
    boxShadow: active ? '0 4px 12px rgba(29,78,216,0.20)' : 'none',
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '14px 24px',
      background: '#f8fafc',
      borderTop: '1px solid #f1f5f9',
    }}>
      {/* Context line — where the user currently is */}
      {totalItems != null && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
          Showing <span style={{ color: '#1e293b', fontWeight: 800 }}>{from}–{to}</span>
          {' '}of <span style={{ color: '#1e293b', fontWeight: 800 }}>{totalItems}</span> {itemLabel}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button type="button" onClick={() => go(currentPage - 1)} disabled={atStart} style={arrowBtn(atStart)}>
          <span style={{ fontSize: '14px', lineHeight: 1 }}>‹</span> Previous
        </button>

        {/* On mobile, a plain "Page X of Y" keeps the row from overflowing.
            On desktop, the full numbered window with ellipsis. */}
        {isMobile ? (
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', padding: '0 6px', whiteSpace: 'nowrap' }}>
            Page {currentPage} of {totalPages}
          </span>
        ) : (
          buildPageWindow(currentPage, totalPages).map((page, i) =>
            page === 'ellipsis' ? (
              <span key={`e${i}`} style={{ minWidth: '20px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>…</span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => go(page)}
                aria-current={page === currentPage ? 'page' : undefined}
                style={numberBtn(page === currentPage)}
              >
                {page}
              </button>
            )
          )
        )}

        <button type="button" onClick={() => go(currentPage + 1)} disabled={atEnd} style={arrowBtn(atEnd)}>
          Next <span style={{ fontSize: '14px', lineHeight: 1 }}>›</span>
        </button>
      </div>
    </div>
  );
}
