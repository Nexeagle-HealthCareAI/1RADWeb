# Responsive Design Reference - AppointmentBoard Phase 2

## Visual Layout Breakdown

### Mobile Layout (< 640px)

```
┌─────────────────────────────────┐
│  📅 Today's Missions            │  ← Tab Navigation
│  📊 Mission Archive             │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────────┐│  ← Intel Cards (1 column)
│  │ Total Missions: 42          ││
│  │ UNITS                       ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ Ready for Deployment: 15    ││
│  │ READY                       ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ Mission in Progress: 3      ││
│  │ ACTIVE SCAN                 ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ Completed Operations: 24    ││
│  │ SUCCESS                     ││
│  └─────────────────────────────┘│
├─────────────────────────────────┤
│ 🔍 Search patient, mobile, ID...│  ← Filter Bar (stacked)
├─────────────────────────────────┤
│ All Specialists                 │
├─────────────────────────────────┤
│ ✕ RESET ARCHIVE                 │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────────┐│  ← Appointment Cards
│  │ #1 TOKEN                   ││
│  │ ✓ Complete                 ││
│  ├─────────────────────────────┤│
│  │ Patient                     ││
│  │ John Doe                    ││
│  │ 9876543210 • 45y Male      ││
│  │ ID: PT-001                  ││
│  ├─────────────────────────────┤│
│  │ Referral                    ││
│  │ Dr. Smith                   ││
│  │ 9123456789                  ││
│  ├─────────────────────────────┤│
│  │ Specialist                  ││
│  │ Dr. Johnson                 ││
│  ├─────────────────────────────┤│
│  │ [CHECK IN] [🖨️] [✕]        ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ #2 TOKEN                   ││
│  │ 🔄 Scanning                ││
│  │ ... (similar structure)     ││
│  └─────────────────────────────┘│
│                                 │
├─────────────────────────────────┤
│ ← Prev  1  2  3  Next →         │  ← Pagination
│ Page 1 of 3                     │
└─────────────────────────────────┘
```

### Tablet Layout (640px - 1024px)

```
┌──────────────────────────────────────────────────────────┐
│  📅 Today's Missions  📊 Mission Archive                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │ Total Missions: 42   │  │ Ready for Deployment │    │
│  │ UNITS                │  │ 15 READY             │    │
│  └──────────────────────┘  └──────────────────────┘    │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │ Mission in Progress  │  │ Completed Operations │    │
│  │ 3 ACTIVE SCAN        │  │ 24 SUCCESS           │    │
│  └──────────────────────┘  └──────────────────────┘    │
├──────────────────────────────────────────────────────────┤
│ 🔍 Search...  │ All Specialists │ ✕ RESET             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │ #1 TOKEN             │  │ #2 TOKEN             │    │
│  │ ✓ Complete           │  │ 🔄 Scanning          │    │
│  ├──────────────────────┤  ├──────────────────────┤    │
│  │ Patient              │  │ Patient              │    │
│  │ John Doe             │  │ Jane Smith           │    │
│  │ 9876543210 • 45y M   │  │ 9876543211 • 38y F   │    │
│  │ ID: PT-001           │  │ ID: PT-002           │    │
│  ├──────────────────────┤  ├──────────────────────┤    │
│  │ Referral: Dr. Smith  │  │ Referral: Self       │    │
│  │ 9123456789           │  │                      │    │
│  ├──────────────────────┤  ├──────────────────────┤    │
│  │ Specialist: Dr. J.   │  │ Specialist: Dr. P.   │    │
│  ├──────────────────────┤  ├──────────────────────┤    │
│  │ [CHECK IN] [🖨️] [✕] │  │ [FINALIZE] [🖨️] [✕]│    │
│  └──────────────────────┘  └──────────────────────┘    │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │ #3 TOKEN             │  │ #4 TOKEN             │    │
│  │ 📋 Booked            │  │ ✓ Complete           │    │
│  │ ... (similar)        │  │ ... (similar)        │    │
│  └──────────────────────┘  └──────────────────────┘    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ ← Prev  1  2  3  Next →                                 │
│ Page 1 of 3                                             │
└──────────────────────────────────────────────────────────┘
```

### Desktop Layout (≥ 1024px)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  📅 Today's Missions  📊 Mission Archive                                           │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Total: 42    │  │ Ready: 15    │  │ Progress: 3  │  │ Completed: 24│         │
│  │ UNITS        │  │ READY        │  │ ACTIVE SCAN  │  │ SUCCESS      │         │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘         │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search...  │ All Specialists │ ✕ RESET                                        │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│ PT-001 │ #1 │ John Doe              │ Dr. Smith    │ ✓ │ Dr. Johnson │ [CHECK IN]│
│ ID-123 │    │ 9876543210 • 45y Male │ 9123456789   │   │             │ [🖨️] [✕] │
│        │    │                       │              │   │             │           │
├────────────────────────────────────────────────────────────────────────────────────┤
│ PT-002 │ #2 │ Jane Smith            │ Self         │ 🔄 │ Dr. Patel   │ [FINALIZE]│
│ ID-124 │    │ 9876543211 • 38y Fem  │              │   │             │ [🖨️] [✕] │
│        │    │                       │              │   │             │           │
├────────────────────────────────────────────────────────────────────────────────────┤
│ PT-003 │ #3 │ Robert Johnson        │ Dr. Brown    │ 📋 │ Dr. Kumar   │ [BEGIN]   │
│ ID-125 │    │ 9876543212 • 52y Male │ 9123456790   │   │             │ [🖨️] [✕] │
│        │    │                       │              │   │             │           │
├────────────────────────────────────────────────────────────────────────────────────┤
│ PT-004 │ #4 │ Sarah Williams        │ Self         │ ✓ │ Dr. Singh   │ [PRINT]   │
│ ID-126 │    │ 9876543213 • 41y Fem  │              │   │             │ [✕]       │
│        │    │                       │              │   │             │           │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ← Prev  1  2  3  Next →                                                           │
│ Page 1 of 3                                                                        │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
AppointmentBoard
├── Tab Navigation
│   ├── Today's Missions
│   └── Mission Archive
├── Intel Cards Grid
│   ├── Total Missions Card
│   ├── Ready for Deployment Card
│   ├── Mission in Progress Card
│   └── Completed Operations Card
├── Filter Bar (Responsive)
│   ├── Search Input
│   ├── Doctor Select
│   ├── Date Range (PAST tab only)
│   └── Reset Button
├── Appointments List Container
│   ├── Mobile/Tablet: Cards Layout
│   │   └── AppointmentCard (repeated)
│   │       ├── Status Bar
│   │       ├── Card Header
│   │       ├── Patient Section
│   │       ├── Referral Section
│   │       ├── Specialist Section
│   │       └── Actions Section
│   └── Desktop: Table Layout
│       └── Table Rows (existing)
├── Pagination
│   ├── Previous Button
│   ├── Page Numbers
│   ├── Next Button
│   └── Page Info
└── Modals
    ├── Booking Drawer
    ├── Add Patient Modal
    └── Token Print Modal
```

## Breakpoint Strategy

### Mobile First Approach

```
Base Styles (Mobile: < 640px)
├── Single column layout
├── Full-width elements
├── Stacked filter bar
├── Touch-friendly sizing (44px)
└── Optimized typography

↓ (640px breakpoint)

Tablet Styles (640px - 1023px)
├── 2-3 column grid
├── Flexible filter bar
├── Medium sizing (36-44px)
└── Balanced typography

↓ (1024px breakpoint)

Desktop Styles (≥ 1024px)
├── 7-column table
├── Horizontal filter bar
├── Standard sizing
└── Full typography
```

## Responsive Typography

```
Mobile (< 640px)
├── Headings: 16-18px
├── Body: 12-13px
├── Labels: 9-10px
└── Icons: 12-14px

Tablet (640px - 1024px)
├── Headings: 18-20px
├── Body: 13-14px
├── Labels: 10-11px
└── Icons: 14-16px

Desktop (≥ 1024px)
├── Headings: 20-24px
├── Body: 14px
├── Labels: 11-12px
└── Icons: 16-18px
```

## Responsive Spacing

```
Mobile (< 640px)
├── Padding: 10-14px
├── Margin: 8-12px
├── Gap: 6-10px
└── Border Radius: 10-12px

Tablet (640px - 1024px)
├── Padding: 12-16px
├── Margin: 12-16px
├── Gap: 10-12px
└── Border Radius: 12-14px

Desktop (≥ 1024px)
├── Padding: 16-24px
├── Margin: 16-24px
├── Gap: 12-16px
└── Border Radius: 14-16px
```

## Touch Target Sizes

```
Mobile (< 640px)
├── Buttons: 44x44px minimum
├── Inputs: 44px height
├── Tap targets: 8px spacing
└── Swipe area: Full width

Tablet (640px - 1024px)
├── Buttons: 40x40px minimum
├── Inputs: 40px height
├── Tap targets: 8px spacing
└── Swipe area: Full width

Desktop (≥ 1024px)
├── Buttons: 36x36px minimum
├── Inputs: 36px height
├── Tap targets: 4px spacing
└── Click area: Standard
```

## Color & Contrast

```
Status Colors
├── Booked: #3498db (Blue)
├── Arrived: #2ecc71 (Green)
├── In Progress: #f39c12 (Orange)
├── Completed: #27ae60 (Dark Green)
└── Cancelled: #e74c3c (Red)

Text Colors
├── Primary: #1a1a2e
├── Secondary: #666
├── Tertiary: #999
└── Inverse: #ffffff

Background Colors
├── Card: #ffffff
├── Section: #fafbfc
├── Hover: #f8f9fa
└── Active: #e8f4fd
```

## Animation & Transitions

```
Transitions
├── All: 0.2s ease
├── Transform: 0.3s cubic-bezier(0.4, 0, 0.2, 1)
├── Opacity: 0.2s ease
└── Color: 0.2s ease

Animations
├── Slide Up: 0.3s ease-out (drawer)
├── Fade In: 0.3s ease-out (modal)
├── Pulse: 2s infinite (status)
└── Bounce: 0.3s ease (button press)
```

## Accessibility Features

```
Keyboard Navigation
├── Tab order: Logical flow
├── Focus visible: 2px outline
├── Escape key: Close modals
└── Enter key: Submit forms

Screen Reader
├── Semantic HTML: <button>, <input>
├── ARIA labels: aria-label
├── Role attributes: role="button"
└── Live regions: aria-live="polite"

Color Contrast
├── Text: WCAG AA (4.5:1)
├── UI: WCAG AA (3:1)
├── Focus: 2px solid outline
└── Disabled: 50% opacity
```

## Performance Metrics

```
Mobile Target
├── First Paint: < 1s
├── First Contentful Paint: < 1.5s
├── Largest Contentful Paint: < 2.5s
├── Cumulative Layout Shift: < 0.1
└── Time to Interactive: < 3.5s

Tablet Target
├── First Paint: < 0.8s
├── First Contentful Paint: < 1.2s
├── Largest Contentful Paint: < 2s
├── Cumulative Layout Shift: < 0.1
└── Time to Interactive: < 3s

Desktop Target
├── First Paint: < 0.5s
├── First Contentful Paint: < 1s
├── Largest Contentful Paint: < 1.5s
├── Cumulative Layout Shift: < 0.1
└── Time to Interactive: < 2.5s
```

## Browser Support

```
Modern Browsers (Full Support)
├── Chrome 90+
├── Firefox 88+
├── Safari 14+
├── Edge 90+
└── Mobile browsers (iOS 12+, Android 8+)

Graceful Degradation
├── CSS Grid: Fallback to flexbox
├── Backdrop Filter: Fallback to solid
├── CSS Variables: Fallback values
└── Flexbox: Supported in all targets
```

## Testing Checklist

```
Responsive Testing
├── [ ] Mobile: 320px, 375px, 414px
├── [ ] Tablet: 640px, 768px, 1024px
├── [ ] Desktop: 1440px, 1920px
├── [ ] Landscape orientation
├── [ ] Portrait orientation
└── [ ] Tablet split-screen

Interaction Testing
├── [ ] Touch: Tap, swipe, long-press
├── [ ] Keyboard: Tab, Enter, Escape
├── [ ] Mouse: Hover, click, scroll
├── [ ] Scroll: Smooth, momentum
└── [ ] Resize: Window resize handling

Accessibility Testing
├── [ ] Screen reader: NVDA, JAWS, VoiceOver
├── [ ] Keyboard only: No mouse
├── [ ] Color contrast: WCAG AA
├── [ ] Focus visible: All interactive elements
└── [ ] Zoom: 200% zoom support

Performance Testing
├── [ ] Lighthouse: Mobile score > 90
├── [ ] Lighthouse: Desktop score > 95
├── [ ] Network: Slow 3G
├── [ ] Device: Low-end mobile
└── [ ] Memory: Limited RAM
```
