# AppointmentBoard.jsx - Required Updates for Phase 2 Responsive Design

## Summary of Changes

This document shows the exact code changes needed to integrate the responsive components into AppointmentBoard.jsx.

## 1. Add Imports at Top

```javascript
// Add these imports after existing imports
import AppointmentCard from '../components/AppointmentCard';
import '../styles/AppointmentBoard.css';
```

## 2. Add Responsive State Hook

Add this inside the `AppointmentBoard()` function, after other useState declarations:

```javascript
// Responsive layout detection
const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
const [windowWidth, setWindowWidth] = useState(window.innerWidth);
```

## 3. Add Resize Listener Effect

Add this useEffect hook after the existing useEffect hooks:

```javascript
// Handle window resize for responsive layout
useEffect(() => {
  const handleResize = () => {
    const newWidth = window.innerWidth;
    setWindowWidth(newWidth);
    setIsMobile(newWidth < 1024);
  };

  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

## 4. Update renderFilterBar Function

Replace the existing `renderFilterBar()` function with this responsive version:

```javascript
const renderFilterBar = () => (
  <div className="filter-bar-responsive">
    {/* Search Group */}
    <div className="filter-search-group">
      <span style={{ fontSize: '16px', opacity: 0.4 }}>🔍</span>
      <input
        type="text"
        placeholder="Search patient, mobile, or ID..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      {searchQuery && (
        <button 
          onClick={() => setSearchQuery('')} 
          style={{ 
            border: 'none', 
            background: 'none', 
            cursor: 'pointer', 
            fontSize: '14px', 
            color: '#aaa', 
            padding: 0 
          }}
        >
          ✕
        </button>
      )}
    </div>

    {/* Select Group */}
    <div className="filter-select-group">
      <select
        value={filters.doctor}
        onChange={e => setFilters({...filters, doctor: e.target.value})}
        className="filter-select"
      >
        <option value="ALL">All Specialists</option>
        {doctors.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>

    {/* Date Range (only on PAST tab) */}
    {activeTab === 'PAST' && (
      <div className="filter-date-range">
        <span style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase' }}>
          Range
        </span>
        <input 
          type="date" 
          value={pastDateRange.start} 
          onChange={e => setPastDateRange(prev => ({ ...prev, start: e.target.value }))}
        />
        <span style={{ color: '#ccc' }}>→</span>
        <input 
          type="date" 
          value={pastDateRange.end} 
          onChange={e => setPastDateRange(prev => ({ ...prev, end: e.target.value }))}
        />
      </div>
    )}

    {/* Reset Button */}
    {(filters.status !== 'ALL' || filters.modality !== 'ALL' || filters.doctor !== 'ALL' || searchQuery || activeTab !== 'TODAY') && (
      <button
        onClick={() => { 
          setFilters({ date: TODAY, status: 'ALL', modality: 'ALL', doctor: 'ALL' }); 
          setSearchQuery(''); 
          setActiveTab('TODAY');
          setPastDateRange({ 
            start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
            end: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] 
          });
        }}
        className="filter-reset-btn"
      >
        ✕ RESET
      </button>
    )}
  </div>
);
```

## 5. Add Pagination Renderer

Add this new function to render pagination:

```javascript
const renderPagination = () => {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination-container">
      <button
        className="pagination-btn"
        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
        disabled={currentPage === 1}
      >
        ← Prev
      </button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
        <button
          key={page}
          className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
          onClick={() => setCurrentPage(page)}
        >
          {page}
        </button>
      ))}

      <button
        className="pagination-btn"
        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
        disabled={currentPage === totalPages}
      >
        Next →
      </button>

      <span className="pagination-info">
        Page {currentPage} of {totalPages}
      </span>
    </div>
  );
};
```

## 6. Update Main Render Return

Replace the main return statement with this responsive version:

```javascript
return (
  <div className="appointment-board-container">
    {/* Tab Navigation */}
    <div className="tab-navigation">
      <button
        className={`tab-btn ${activeTab === 'TODAY' ? 'active' : ''}`}
        onClick={() => setActiveTab('TODAY')}
      >
        📅 Today's Missions
      </button>
      <button
        className={`tab-btn ${activeTab === 'PAST' ? 'active' : ''}`}
        onClick={() => setActiveTab('PAST')}
      >
        📊 Mission Archive
      </button>
    </div>

    {/* Intel Cards Grid */}
    <div className="intel-cards-grid">
      {renderIntelCards()}
    </div>

    {/* Filter Bar */}
    {renderFilterBar()}

    {/* Appointments List - Responsive Display */}
    <div className="appointments-list-container" ref={listTopRef}>
      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-title">Loading Missions...</div>
        </div>
      ) : paginatedAppointments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎯</div>
          <div className="empty-state-title">No Missions Found</div>
          <div className="empty-state-text">
            {searchQuery ? 'Try adjusting your search criteria' : 'No appointments scheduled'}
          </div>
        </div>
      ) : isMobile ? (
        /* Mobile/Tablet: Card Layout */
        <div className="appointments-cards">
          {paginatedAppointments.map(app => (
            <AppointmentCard
              key={app.id}
              appointment={app}
              statusMeta={STATUS_META}
              getNextAction={getNextAction}
              onAction={handleAction}
              onPrint={(app) => setTokenPrintData(app)}
              onCancel={(id) => handleAction(id, 'CANCEL')}
              patients={patients}
            />
          ))}
        </div>
      ) : (
        /* Desktop: Table Layout */
        <div className="appointments-table">
          {paginatedAppointments.map(app => renderAppointmentRow(app))}
        </div>
      )}
    </div>

    {/* Pagination */}
    {renderPagination()}

    {/* Booking Drawer/Modal */}
    {isBookingOpen && (
      <div className="booking-drawer">
        {/* Existing booking drawer content */}
        {/* ... keep existing booking drawer code ... */}
      </div>
    )}

    {/* Add Patient Modal */}
    {isAddPatientOpen && (
      <div className="booking-drawer">
        {/* Existing add patient modal content */}
        {/* ... keep existing add patient modal code ... */}
      </div>
    )}

    {/* Token Print Modal */}
    {tokenPrintData && (
      <div className="booking-drawer">
        {/* Existing token print modal content */}
        {/* ... keep existing token print modal code ... */}
      </div>
    )}
  </div>
);
```

## 7. Update renderIntelCards Function

Wrap the intel cards grid with the responsive class:

```javascript
const renderIntelCards = () => {
  const readyCount = stats.booked + stats.arrived;
  const progressCount = stats.inProgress;
  
  return (
    <>
      {/* Card 1: Total Missions */}
      <div className="intel-card dark">
        {/* ... existing card content ... */}
      </div>

      {/* Card 2: Ready Stats */}
      <div className="intel-card">
        {/* ... existing card content ... */}
      </div>

      {/* Card 3: Progress Stats */}
      <div className="intel-card">
        {/* ... existing card content ... */}
      </div>

      {/* Card 4: Completed Stats */}
      <div className="intel-card">
        {/* ... existing card content ... */}
      </div>
    </>
  );
};
```

## 8. Keep Existing Functions

Keep these functions unchanged:
- `renderAppointmentRow()` - Used for desktop table view
- `handleAction()` - Action handler
- `getNextAction()` - Get next action
- `handleAddPatient()` - Add patient handler
- `handleBookAppointment()` - Book appointment handler
- All API fetch functions

## Complete Integration Example

Here's a minimal example of the updated component structure:

```javascript
import { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
import AppointmentCard from '../components/AppointmentCard';
import '../styles/global.css';
import '../styles/AppointmentBoard.css';

export default function AppointmentBoard() {
  const { activeCenterId, activeCenter } = useContext(AuthContext);
  
  // ... existing state declarations ...
  
  // NEW: Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // ... existing useEffect hooks ...

  // NEW: Resize listener
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth;
      setWindowWidth(newWidth);
      setIsMobile(newWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ... existing functions ...

  // NEW: Responsive filter bar
  const renderFilterBar = () => {
    // ... see section 4 above ...
  };

  // NEW: Pagination renderer
  const renderPagination = () => {
    // ... see section 5 above ...
  };

  // Main render
  return (
    <div className="appointment-board-container">
      {/* ... see section 6 above ... */}
    </div>
  );
}
```

## Testing the Integration

After making these changes, test:

1. **Mobile (< 640px):**
   - Cards display in single column
   - Filter bar stacks vertically
   - Buttons are touch-friendly (44px)
   - Pagination works correctly

2. **Tablet (640px - 1023px):**
   - Cards display in 2 columns
   - Filter bar wraps appropriately
   - Buttons are properly sized
   - Pagination displays correctly

3. **Desktop (≥ 1024px):**
   - Table displays with 7 columns
   - Cards are hidden
   - Filter bar is horizontal
   - All functionality works as before

## Troubleshooting

### Cards not showing on mobile
- Check that `isMobile` state is updating correctly
- Verify window width detection is working
- Check CSS media queries in AppointmentBoard.css

### Filter bar not responsive
- Ensure `filter-bar-responsive` class is applied
- Check CSS media queries for breakpoints
- Verify flexbox properties are correct

### Buttons not touch-friendly
- Check minimum height/width in CSS (should be 44px)
- Verify padding is adequate
- Test on actual mobile device

### Performance issues
- Check pagination is limiting items (10 per page)
- Verify conditional rendering is working
- Monitor DOM node count

## Notes

- All existing functionality is preserved
- No breaking changes to API or data structures
- Backward compatible with existing code
- CSS handles all responsive behavior
- JavaScript only handles state and resize detection
