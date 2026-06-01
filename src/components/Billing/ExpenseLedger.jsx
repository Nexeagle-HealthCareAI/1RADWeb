import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { notifyToast } from '../../utils/toast';

// ─── Design tokens ────────────────────────────────────────────────────────
const C = {
  textPrimary:    '#0f172a',
  textSecondary:  '#475569',
  textTertiary:   '#94a3b8',
  border:         '#e2e8f0',
  borderLight:    '#f1f5f9',
  surface:        '#ffffff',
  surfaceAlt:     '#f8fafc',
  surfaceHover:   '#f1f5f9',
  danger:         '#dc2626',
  dangerSoft:     '#fef2f2',
  dangerBorder:   '#fecaca',
  success:        '#15803d',
  successSoft:    '#f0fdf4',
  successBorder:  '#bbf7d0',
  warning:        '#b45309',
  warningSoft:    '#fffbeb',
  accent:         '#7c3aed', // strategic/referral — distinct from destructive red
  accentSoft:     '#f5f3ff',
};

const isMutable = (exp) => exp?.type === 'OPERATIONAL' || exp?.type === 'LEGACY';

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatINR = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

// Status options surfaced in the row drop-down (match the drawer).
const STATUS_OPTIONS = ['Draft', 'Pending', 'Approved', 'Paid'];

// Canonical color + label for every status value we may receive from the API.
// Keys are uppercase so lookup is case-insensitive.
const STATUS_META = {
  DRAFT:    { color: '#64748b', soft: '#f1f5f9', label: 'Draft' },
  PENDING:  { color: '#f59e0b', soft: '#fef3c7', label: 'Pending' },
  APPROVED: { color: '#2563eb', soft: '#dbeafe', label: 'Approved' },
  PAID:     { color: '#15803d', soft: '#dcfce7', label: 'Paid' },
  UNPAID:   { color: '#dc2626', soft: '#fef2f2', label: 'Unpaid' }, // legacy data
};

const metaFor = (status) => {
  const key = String(status || 'UNPAID').toUpperCase();
  return STATUS_META[key] || STATUS_META.UNPAID;
};

// ─── Component ────────────────────────────────────────────────────────────
const ExpenseLedger = ({
  isMobile,
  outflowStats,
  filteredOutflow,
  paginatedOutflow,
  timeFilter,
  setTimeFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  expenseSearch = '',
  setExpenseSearch = () => {},
  expenseFilter = 'ALL',
  setExpenseFilter = () => {},
  handleDeleteExpense,
  setEditExpense,
  setIsExpenseDrawerOpen,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  TODAY,
  sortConfig,
  handleSort,
  handleToggleExpenseStatus,
  handleSetExpenseStatus,
  activeCenterName = 'Default',
  // Default notify falls back to the global toast so the ledger works in
  // standalone settings (Storybook etc.) without a parent passing notify.
  notify = (msg) => notifyToast(msg, (msg && msg.type) || 'info'),
  confirmDialog = ({ message, onConfirm }) => { if (window.confirm(message)) onConfirm?.(); },
}) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [openStatusMenuId, setOpenStatusMenuId] = useState(null);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [timeFilter, startDate, endDate, expenseSearch, expenseFilter]);

  // Close the row's status menu when clicking outside it. The trigger pill AND
  // the portal-rendered menu both carry [data-status-menu]; either path keeps
  // the menu open.
  useEffect(() => {
    if (!openStatusMenuId) return;
    const onDocClick = (e) => {
      if (!e.target.closest?.('[data-status-menu]')) setOpenStatusMenuId(null);
    };
    // Use 'click' (not mousedown) so the option's own onClick gets to fire
    // before this handler considers closing.
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [openStatusMenuId]);

  const visibleRows = paginatedOutflow || [];
  const isAllVisibleSelected =
    visibleRows.length > 0 && visibleRows.every(row => selectedIds.has(row.id));

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleRows.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleRows.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  const selectedExpenses = useMemo(
    () => (filteredOutflow || []).filter(e => selectedIds.has(e.id)),
    [filteredOutflow, selectedIds]
  );

  const bulkDeletable = selectedExpenses.filter(isMutable);
  const bulkMarkable = selectedExpenses.filter(e => isMutable(e) && e.status !== 'PAID');

  // ─── Bulk actions ──────────────────────────────────────────────────────
  const handleBulkDelete = () => {
    if (bulkDeletable.length === 0) return;
    const count = bulkDeletable.length;
    confirmDialog({
      title: `Delete ${count} expense${count > 1 ? 's' : ''}?`,
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: () => {
        // Use the parent's skipConfirm flag so this single confirm covers the batch.
        bulkDeletable.forEach(e => handleDeleteExpense(e.id, { skipConfirm: true }));
        setSelectedIds(new Set());
      },
    });
  };

  const handleBulkMarkPaid = () => {
    if (bulkMarkable.length === 0) return;
    // Use direct setter when available; fall back to toggle for old data paths.
    const setter = handleSetExpenseStatus
      ? (id) => handleSetExpenseStatus(id, 'Paid')
      : (id, status) => handleToggleExpenseStatus(id, status);
    bulkMarkable.forEach(e => setter(e.id, e.status));
    setSelectedIds(new Set());
  };

  // ─── Range label for export filenames ──────────────────────────────────
  const rangeLabel = () => {
    if (timeFilter === 'CUSTOM' && (startDate || endDate)) {
      return `${startDate || 'start'}_to_${endDate || 'today'}`;
    }
    return timeFilter; // TODAY / PAST / ALL
  };

  // ─── Export to Excel (.xlsx) — respects the currently selected date range
  // (whatever the time filter + custom dates are set to). ────────────────
  const handleExportXlsx = () => {
    const useSelection = selectedIds.size > 0;
    const list = useSelection
      ? (filteredOutflow || []).filter(e => selectedIds.has(e.id))
      : (filteredOutflow || []);

    if (list.length === 0) {
      notify({ type: 'info', message: 'No expenses in the current view to export.' });
      return;
    }

    const rows = list.map(e => ({
      'Date':         formatDate(e.date),
      'Description':  e.description || '',
      'Vendor / Item': e.name || '',
      'Category':     e.category || 'General',
      'Type':         e.type || '',
      'Amount (INR)': Number(e.amount) || 0,
      'Status':       e.status || 'UNPAID',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // Sensible column widths.
    ws['!cols'] = [
      { wch: 14 }, // Date
      { wch: 36 }, // Description
      { wch: 22 }, // Vendor
      { wch: 14 }, // Category
      { wch: 12 }, // Type
      { wch: 14 }, // Amount
      { wch: 12 }, // Status
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `1RAD_Expense_Ledger_${rangeLabel()}${useSelection ? '_Selected' : ''}_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // ─── Export (CSV — unchanged behavior, cleaner code) ───────────────────
  const handleExportToExcel = () => {
    const useSelection = selectedIds.size > 0;
    const list = useSelection
      ? (filteredOutflow || []).filter(e => selectedIds.has(e.id))
      : (filteredOutflow || []);

    const headers = ['Date', 'Description', 'Vendor/Partner Name', 'Category', 'Amount (INR)', 'Status'];
    const rows = list.map(e => [
      formatDate(e.date),
      e.description || 'N/A',
      e.name || 'N/A',
      e.category || 'General',
      Number(e.amount) || 0,
      e.status || 'UNPAID',
    ]);
    const esc = (cell) => {
      if (cell == null) return '';
      const s = String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `1RAD_Expense_Ledger_${timeFilter}_${useSelection ? 'Selected' : 'All'}_${ts}.csv`;
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ─── Filter chips helpers ──────────────────────────────────────────────
  const hasActiveFilters =
    expenseSearch || expenseFilter !== 'ALL' || timeFilter !== 'ALL';

  const clearAllFilters = () => {
    setExpenseSearch('');
    setExpenseFilter('ALL');
    setTimeFilter('ALL');
  };

  // ─── Pagination math ───────────────────────────────────────────────────
  const totalRecords = (filteredOutflow || []).length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / itemsPerPage));
  const showingFrom = totalRecords === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalRecords);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.25s' }}>
      {/* ── Header row: title + primary action ───────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: C.textPrimary, letterSpacing: '-0.3px' }}>
            Expense Ledger
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: C.textSecondary }}>
            Operational and strategic payouts in one view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditExpense({
              description: '', category: 'Maintenance', amount: 0, taxAmount: 0,
              transactionDate: TODAY, paymentMode: 'Cash', referenceNumber: '',
              vendorName: '', costCenter: activeCenterName, status: 'Paid'
            });
            setIsExpenseDrawerOpen(true);
          }}
          style={{
            padding: '10px 18px', borderRadius: '10px', border: 'none',
            background: C.textPrimary, color: 'white', fontSize: '13px',
            fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          }}
        >+ Log expense</button>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: '12px',
      }}>
        <KPICard tone="red"    label="Total expenditure" value={formatINR(outflowStats.totalOutflow)} />
        <KPICard tone="blue"   label="Operational"       value={formatINR(outflowStats.operationalTotal)} />
        
        <KPICard tone="amber"  label="Today's burn"      value={formatINR(outflowStats.todayOutflow)} />
      </div>

      {/* ── Category breakdown strip (replaces "DISTRIBUTION" KPI) ───── */}
      {outflowStats.categoryBreakdown && outflowStats.categoryBreakdown.length > 0 && (
        <CategoryBreakdown
          categories={outflowStats.categoryBreakdown}
          total={outflowStats.totalOutflow}
        />
      )}

      {/* ── Filter + search panel ───────────────────────────────────── */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px',
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px',
      }}>
        {/* Row 1: Search */}
        <div style={{ position: 'relative', width: '100%' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: C.textTertiary, pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            value={expenseSearch}
            onChange={e => setExpenseSearch(e.target.value)}
            placeholder="Search description, vendor, or category"
            style={{
              width: '100%', padding: '10px 36px 10px 36px',
              borderRadius: '8px', border: `1px solid ${C.border}`,
              fontSize: '13px', outline: 'none', background: C.surface,
              boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
              color: C.textPrimary,
            }}
            onFocus={e => { e.target.style.borderColor = C.textPrimary; e.target.style.boxShadow = `0 0 0 3px rgba(15,23,42,0.08)`; }}
            onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = 'none'; }}
          />
          {expenseSearch && (
            <button
              type="button"
              onClick={() => setExpenseSearch('')}
              aria-label="Clear search"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: C.textTertiary, fontSize: '18px', padding: 0, lineHeight: 1 }}
            >×</button>
          )}
        </div>

        {/* Row 2: Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <FilterGroup
            label="Category"
            value={expenseFilter}
            onChange={setExpenseFilter}
            options={[
              { key: 'ALL', label: 'All' },
              { key: 'OPERATIONAL', label: 'Operational' },
              { key: 'REFERRAL', label: 'Referral' },
            ]}
          />
          <FilterGroup
            label="When"
            value={timeFilter}
            onChange={setTimeFilter}
            options={[
              { key: 'TODAY', label: 'Today' },
              { key: 'PAST', label: 'Past' },
              { key: 'ALL', label: 'All time' },
              { key: 'CUSTOM', label: 'Custom' },
            ]}
          />
          {timeFilter === 'CUSTOM' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', color: C.textPrimary }}
              />
              <span style={{ fontSize: '11px', color: C.textTertiary }}>→</span>
              <input
                type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', color: C.textPrimary }}
              />
            </div>
          )}

          <div style={{ flex: 1 }} />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              style={{
                background: 'transparent', border: 'none', color: C.textSecondary,
                cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '6px 10px',
                borderRadius: '6px',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >Clear filters</button>
          )}

          <div style={{ display: 'inline-flex', gap: '6px' }}>
            <button
              type="button"
              onClick={handleExportToExcel}
              title="Download as CSV"
              style={{
                padding: '7px 12px', borderRadius: '8px',
                border: `1px solid ${C.border}`, background: C.surface,
                color: C.textPrimary, fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface; }}
            >
              <span>↓</span>
              <span>{selectedIds.size > 0 ? `CSV (${selectedIds.size})` : 'CSV'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportXlsx}
              title="Download as Excel for the selected date range"
              style={{
                padding: '7px 12px', borderRadius: '8px',
                border: '1px solid #15803d', background: '#15803d',
                color: 'white', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                boxShadow: '0 1px 2px rgba(21,128,61,0.2)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#14532d'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#15803d'; }}
            >
              <span>📊</span>
              <span>{selectedIds.size > 0 ? `Excel (${selectedIds.size})` : 'Excel'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Bulk action bar (only when ≥1 selected) ─────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{
          background: C.textPrimary, color: 'white', borderRadius: '10px',
          padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          animation: 'slideDown 0.2s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
            >Clear</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleBulkMarkPaid}
              disabled={bulkMarkable.length === 0}
              title={bulkMarkable.length === 0 ? 'No selected rows are unpaid + editable' : `Mark ${bulkMarkable.length} as paid`}
              style={{
                padding: '6px 12px', borderRadius: '7px', border: 'none',
                background: bulkMarkable.length === 0 ? 'rgba(255,255,255,0.1)' : C.success,
                color: bulkMarkable.length === 0 ? 'rgba(255,255,255,0.4)' : 'white',
                fontSize: '12px', fontWeight: 600,
                cursor: bulkMarkable.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >Mark as paid{bulkMarkable.length > 0 ? ` (${bulkMarkable.length})` : ''}</button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeletable.length === 0}
              title={bulkDeletable.length === 0 ? 'Strategic rows cannot be deleted here' : `Delete ${bulkDeletable.length}`}
              style={{
                padding: '6px 12px', borderRadius: '7px', border: 'none',
                background: bulkDeletable.length === 0 ? 'rgba(255,255,255,0.1)' : C.danger,
                color: bulkDeletable.length === 0 ? 'rgba(255,255,255,0.4)' : 'white',
                fontSize: '12px', fontWeight: 600,
                cursor: bulkDeletable.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >Delete{bulkDeletable.length > 0 ? ` (${bulkDeletable.length})` : ''}</button>
          </div>
        </div>
      )}

      {/* ── Table card ──────────────────────────────────────────────── */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '900px' : 'auto' }}>
            <thead style={{ background: C.surfaceAlt, position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...th, width: '36px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: C.textPrimary }}
                  />
                </th>
                <SortHeader label="Date"          k="date"        sortConfig={sortConfig} onClick={handleSort} />
                <SortHeader label="Description"   k="description" sortConfig={sortConfig} onClick={handleSort} />
                <SortHeader label="Item / Vendor" k="name"        sortConfig={sortConfig} onClick={handleSort} />
                <SortHeader label="Category"      k="category"    sortConfig={sortConfig} onClick={handleSort} />
                <SortHeader label="Amount"        k="amount"      sortConfig={sortConfig} onClick={handleSort} align="right" />
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((exp, idx) => (
                <ExpenseRow
                  key={exp.id}
                  exp={exp}
                  isSelected={selectedIds.has(exp.id)}
                  onToggleSelect={() => toggleSelectRow(exp.id)}
                  onToggleStatus={() => handleToggleExpenseStatus(exp.id, exp.status)}
                  onSetStatus={(newStatus) => {
                    if (handleSetExpenseStatus) handleSetExpenseStatus(exp.id, newStatus);
                    else handleToggleExpenseStatus(exp.id, exp.status);
                  }}
                  isStatusMenuOpen={openStatusMenuId === exp.id}
                  onOpenStatusMenu={() => setOpenStatusMenuId(prev => prev === exp.id ? null : exp.id)}
                  onCloseStatusMenu={() => setOpenStatusMenuId(null)}
                  onEdit={() => {
                    setEditExpense({
                      id: exp.id,
                      description: exp.description,
                      category: exp.category,
                      amount: exp.amount,
                      transactionDate: exp.date,
                      vendorName: exp.name,
                      status: exp.status
                    });
                    setIsExpenseDrawerOpen(true);
                  }}
                  onDelete={() => handleDeleteExpense(exp.id)}
                  zebra={idx % 2 === 1}
                />
              ))}
              {totalRecords === 0 && (
                <tr>
                  <td colSpan="8" style={{ padding: 0 }}>
                    <EmptyState
                      hasActiveFilters={hasActiveFilters}
                      onClearFilters={clearAllFilters}
                      onLogExpense={() => {
                        setEditExpense({
                          description: '', category: 'Maintenance', amount: 0, taxAmount: 0,
                          transactionDate: TODAY, paymentMode: 'Cash', referenceNumber: '',
                          vendorName: '', status: 'Paid'
                        });
                        setIsExpenseDrawerOpen(true);
                      }}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {totalRecords > 0 && (
          <div style={{
            padding: '10px 16px', borderTop: `1px solid ${C.borderLight}`,
            background: C.surfaceAlt,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '10px',
          }}>
            <span style={{ fontSize: '12px', color: C.textSecondary }}>
              Showing <strong style={{ color: C.textPrimary }}>{showingFrom}–{showingTo}</strong> of <strong style={{ color: C.textPrimary }}>{totalRecords}</strong>
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                style={pagerBtn(currentPage <= 1)}
              >← Prev</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.textSecondary }}>
                Page
                <input
                  type="number" min={1} max={totalPages}
                  value={currentPage}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setCurrentPage(Math.min(totalPages, Math.max(1, v)));
                  }}
                  style={{ width: '46px', padding: '4px 6px', textAlign: 'center', border: `1px solid ${C.border}`, borderRadius: '6px', fontSize: '12px', color: C.textPrimary }}
                />
                of {totalPages}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                style={pagerBtn(currentPage >= totalPages)}
              >Next →</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────

// Tinted palettes for KPI cards. Each tone provides a soft background, a
// matching border, a mid-tone label, and a deep number color — mirrors the
// look in RevenueHub.
const KPI_TONES = {
  red:     { bg: '#fef2f2', border: '#fecaca', label: '#991b1b', value: '#7f1d1d' },
  blue:    { bg: '#eff6ff', border: '#bfdbfe', label: '#1e40af', value: '#1e3a8a' },
  purple:  { bg: '#f5f3ff', border: '#ddd6fe', label: '#6d28d9', value: '#5b21b6' },
  amber:   { bg: '#fffbeb', border: '#fde68a', label: '#b45309', value: '#92400e' },
  neutral: { bg: '#ffffff', border: C.border,  label: C.textSecondary, value: C.textPrimary },
};

const KPICard = ({ label, value, tone = 'neutral' }) => {
  const t = KPI_TONES[tone] || KPI_TONES.neutral;
  return (
    <div style={{
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      padding: '16px',
      boxShadow: `0 4px 16px ${t.border}66`,
    }}>
      <div style={{
        fontSize: '11px', fontWeight: 700,
        color: t.label, letterSpacing: '0.5px',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '22px', fontWeight: 800,
        color: t.value, letterSpacing: '-0.3px',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
};

const CategoryBreakdown = ({ categories, total }) => {
  const top = [...categories].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const max = top[0]?.amount || 1;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px',
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: C.textSecondary, marginBottom: '12px' }}>
        Category breakdown
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {top.map(cat => {
          const pct = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
          const barPct = Math.max(2, (cat.amount / max) * 100);
          return (
            <div key={cat.category} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 90px 50px', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: C.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cat.category}
              </span>
              <div style={{ background: C.surfaceHover, borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${barPct}%`, height: '100%', background: C.textPrimary, borderRadius: '99px', transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: '12px', color: C.textPrimary, fontWeight: 600, textAlign: 'right' }}>
                {formatINR(cat.amount)}
              </span>
              <span style={{ fontSize: '11px', color: C.textTertiary, textAlign: 'right' }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FilterGroup = ({ label, value, onChange, options }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ fontSize: '11px', color: C.textSecondary, fontWeight: 600 }}>{label}:</span>
    <div style={{ display: 'inline-flex', background: C.surfaceAlt, padding: '3px', borderRadius: '8px', border: `1px solid ${C.border}` }}>
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              padding: '5px 10px', borderRadius: '6px', border: 'none',
              background: active ? C.surface : 'transparent',
              color: active ? C.textPrimary : C.textSecondary,
              fontSize: '12px', fontWeight: active ? 600 : 500,
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >{opt.label}</button>
        );
      })}
    </div>
  </div>
);

const th = {
  padding: '12px 14px', textAlign: 'left',
  fontSize: '11px', fontWeight: 600, color: C.textSecondary,
};

const SortHeader = ({ label, k, sortConfig, onClick, align = 'left' }) => {
  const active = sortConfig.key === k;
  const arrow = !active ? '↕' : sortConfig.direction === 'ASC' ? '↑' : '↓';
  return (
    <th
      onClick={() => onClick(k)}
      style={{
        ...th, textAlign: align, cursor: 'pointer', userSelect: 'none',
        color: active ? C.textPrimary : C.textSecondary,
      }}
      onMouseEnter={e => { e.currentTarget.style.color = C.textPrimary; }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? C.textPrimary : C.textSecondary; }}
    >
      {label} <span style={{ opacity: active ? 1 : 0.4, fontSize: '10px' }}>{arrow}</span>
    </th>
  );
};

const ExpenseRow = ({
  exp, isSelected, onToggleSelect,
  onToggleStatus, onSetStatus,
  isStatusMenuOpen, onOpenStatusMenu, onCloseStatusMenu,
  onEdit, onDelete, zebra,
}) => {
  const mutable = isMutable(exp);
  const isReferral = exp.category === 'Referral';
  const m = metaFor(exp.status);
  return (
    <tr style={{
      background: isSelected ? '#fafbfc' : (zebra ? C.surfaceAlt : C.surface),
      borderBottom: `1px solid ${C.borderLight}`,
      transition: 'background 0.15s',
    }}>
      <td style={{ ...td, textAlign: 'center' }}>
        <input
          type="checkbox" checked={isSelected} onChange={onToggleSelect}
          style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: C.textPrimary }}
        />
      </td>
      <td style={{ ...td, fontSize: '12px', color: C.textPrimary, whiteSpace: 'nowrap' }}>
        {formatDate(exp.date)}
      </td>
      <td style={{ ...td }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: C.textPrimary }}>
          {exp.description || '—'}
        </div>
      </td>
      <td style={{ ...td }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: C.textPrimary }}>
            {exp.name || '—'}
          </span>
          {exp.type === 'STRATEGIC' && (
            <span style={{
              fontSize: '10px', fontWeight: 600, color: C.accent,
              background: C.accentSoft, padding: '2px 6px', borderRadius: '4px',
              border: `1px solid ${C.accent}22`,
            }}>Strategic</span>
          )}
        </div>
      </td>
      <td style={{ ...td }}>
        <span style={{
          fontSize: '11px', fontWeight: 600,
          color: isReferral ? C.accent : C.textPrimary,
          background: isReferral ? C.accentSoft : C.surfaceHover,
          padding: '3px 8px', borderRadius: '6px',
        }}>{exp.category || 'General'}</span>
      </td>
      <td style={{ ...td, textAlign: 'right', fontSize: '14px', fontWeight: 600, color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
        {formatINR(exp.amount)}
      </td>
      <td style={{ ...td, textAlign: 'center' }}>
        {mutable ? (
          <StatusPill
            meta={m}
            currentStatus={exp.status}
            isMenuOpen={isStatusMenuOpen}
            onOpenMenu={onOpenStatusMenu}
            onCloseMenu={onCloseStatusMenu}
            onPick={(s) => {
              onCloseStatusMenu();
              // Always fire the API even if same status — user expects feedback.
              onSetStatus(s);
            }}
          />
        ) : (
          <span style={{
            padding: '3px 10px', borderRadius: '99px',
            background: m.soft, color: m.color,
            fontSize: '11px', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            border: `1px solid ${m.color}55`,
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
            {m.label}
          </span>
        )}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        {mutable ? (
          <div style={{ display: 'inline-flex', gap: '4px' }}>
            <button
              type="button" onClick={onEdit}
              style={iconBtn}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.textPrimary; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textSecondary; }}
            >Edit</button>
            <button
              type="button" onClick={onDelete}
              style={{ ...iconBtn, color: C.danger }}
              onMouseEnter={e => { e.currentTarget.style.background = C.dangerSoft; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >Delete</button>
          </div>
        ) : (
          <span style={{ fontSize: '11px', color: C.textTertiary, fontStyle: 'italic' }}>
            Managed in Referrals
          </span>
        )}
      </td>
    </tr>
  );
};

const td = { padding: '12px 14px', verticalAlign: 'middle' };

const iconBtn = {
  padding: '6px 10px', borderRadius: '6px', border: 'none',
  background: 'transparent', color: C.textSecondary,
  fontSize: '12px', fontWeight: 500, cursor: 'pointer',
  transition: 'all 0.15s',
};

const pagerBtn = (disabled) => ({
  padding: '6px 12px', borderRadius: '7px',
  border: `1px solid ${disabled ? C.borderLight : C.border}`,
  background: disabled ? C.surfaceAlt : C.surface,
  color: disabled ? C.textTertiary : C.textPrimary,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '12px', fontWeight: 500,
});

// Status pill + portal-rendered dropdown. Position is captured at click time
// from the click event itself, then re-tracked on scroll/resize while open.
// Portal renders into document.body so the table's overflow can never clip it.
const StatusPill = ({ meta, isMenuOpen, onOpenMenu, onPick }) => {
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Re-track on scroll/resize while open. Capture phase so any ancestor
  // scroll container fires the update.
  useEffect(() => {
    if (!isMenuOpen) { setPos(null); return; }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
    };
    // Run once on open in case useLayoutEffect missed.
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isMenuOpen]);

  const handleClick = (e) => {
    // Capture position from the click immediately (no extra render needed).
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
    console.log('[STATUS_PILL] clicked. rect:', r);
    onOpenMenu();
  };

  return (
    <>
      <button
        ref={btnRef}
        data-status-menu
        type="button"
        onClick={handleClick}
        title="Click to change status"
        style={{
          padding: '3px 8px 3px 10px', borderRadius: '99px', border: '1px solid',
          borderColor: meta.color + '55',
          background: meta.soft, color: meta.color,
          fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          transition: 'transform 0.1s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
        <span>{meta.label}</span>
        <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '1px' }}>▾</span>
      </button>

      {isMenuOpen && pos && typeof document !== 'undefined' && createPortal(
        <div
          data-status-menu
          style={{
            position: 'fixed',
            top: pos.top, left: pos.left,
            transform: 'translateX(-50%)',
            minWidth: '160px', zIndex: 100000,
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '10px', boxShadow: '0 12px 28px rgba(15,23,42,0.18)',
            padding: '4px', display: 'flex', flexDirection: 'column',
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          {STATUS_OPTIONS.map(s => {
            const optMeta = metaFor(s);
            const isCurrent = optMeta.label === meta.label;
            return (
              <button
                key={s}
                type="button"
                data-status-menu
                onClick={() => onPick(s)}
                style={{
                  padding: '8px 10px', borderRadius: '7px', border: 'none',
                  background: isCurrent ? C.surfaceHover : 'transparent',
                  color: C.textPrimary,
                  fontSize: '12px', fontWeight: isCurrent ? 600 : 500,
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = C.surfaceHover; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: optMeta.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{optMeta.label}</span>
                {isCurrent && <span style={{ fontSize: '10px', color: C.textTertiary }}>✓</span>}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

const EmptyState = ({ hasActiveFilters, onClearFilters, onLogExpense }) => (
  <div style={{
    padding: '64px 32px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
  }}>
    <div style={{
      width: '48px', height: '48px', borderRadius: '50%',
      background: C.surfaceAlt, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: '20px', color: C.textTertiary,
    }}>{hasActiveFilters ? '🔍' : '📋'}</div>
    <div style={{ fontSize: '14px', fontWeight: 600, color: C.textPrimary }}>
      {hasActiveFilters ? 'No expenses match these filters' : 'No expenses logged yet'}
    </div>
    <div style={{ fontSize: '12px', color: C.textSecondary, maxWidth: '320px' }}>
      {hasActiveFilters
        ? 'Try widening your time range or clearing the filters.'
        : 'Log your first operational expense to start tracking outflow.'}
    </div>
    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
      {hasActiveFilters && (
        <button
          type="button" onClick={onClearFilters}
          style={{
            padding: '8px 14px', borderRadius: '8px',
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.textPrimary, fontSize: '12px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >Clear filters</button>
      )}
      <button
        type="button" onClick={onLogExpense}
        style={{
          padding: '8px 14px', borderRadius: '8px', border: 'none',
          background: C.textPrimary, color: 'white',
          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
        }}
      >+ Log expense</button>
    </div>
  </div>
);

export default ExpenseLedger;
