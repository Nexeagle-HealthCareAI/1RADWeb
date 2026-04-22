# 📱 New Navigation Structure - Visual Guide

## Bottom Navigation Bar (5 Fixed Tabs)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SCREEN CONTENT AREA                             │
│                                                                         │
│                     (AdminBoard / Appointments /                        │
│                      Finance / Scanning Bay / Doctor)                   │
│                                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│                      BOTTOM NAVIGATION BAR                              │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│              │              │              │              │            │
│      🛡️      │      📅      │      💰      │      🔍      │     🩺     │
│              │              │              │              │            │
│   COMMAND    │   MISSION    │   FINANCE    │   SCANNING   │   DOCTOR   │
│    CENTRE    │  SCHEDULER   │              │     BAY      │            │
│              │              │              │              │            │
├──────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│  AdminBoard  │ Appointments │   Finance    │ ScanningBay  │   Doctor   │
└──────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

---

## Tab Details

### Tab 1: Command Centre
```
┌─────────────┐
│     🛡️      │  Icon: Shield
│             │  Size: 18px
│   COMMAND   │  Label: 2 lines
│    CENTRE   │  Font: 7px, Bold
│             │  
│ AdminBoard  │  Route: AdminBoard
└─────────────┘
```
**Features:**
- User management
- Center management
- System settings
- Analytics & reports

---

### Tab 2: Mission Scheduler
```
┌─────────────┐
│     📅      │  Icon: Calendar
│             │  Size: 18px
│   MISSION   │  Label: 2 lines
│  SCHEDULER  │  Font: 7px, Bold
│             │  
│Appointments │  Route: Appointments
└─────────────┘
```
**Features:**
- View appointments
- Create appointments
- Edit appointments
- Cancel appointments
- Status filters

---

### Tab 3: Finance
```
┌─────────────┐
│     💰      │  Icon: DollarSign
│             │  Size: 18px
│   FINANCE   │  Label: 1 line
│             │  Font: 7px, Bold
│             │  
│   Finance   │  Route: Finance
└─────────────┘
```
**Features (Coming Soon):**
- Billing & invoicing
- Payment processing
- Financial reports
- Revenue analytics
- Insurance claims

---

### Tab 4: Scanning Bay
```
┌─────────────┐
│     🔍      │  Icon: Scan
│             │  Size: 18px
│  SCANNING   │  Label: 2 lines
│     BAY     │  Font: 7px, Bold
│             │  
│ScanningBay  │  Route: ScanningBay
└─────────────┘
```
**Features (Coming Soon):**
- X-Ray management
- CT Scan scheduling
- MRI queue
- Ultrasound tracking
- Image viewer & PACS
- Report generation

---

### Tab 5: Doctor
```
┌─────────────┐
│     🩺      │  Icon: Stethoscope
│             │  Size: 18px
│   DOCTOR    │  Label: 1 line
│             │  Font: 7px, Bold
│             │  
│   Doctor    │  Route: Doctor
└─────────────┘
```
**Features (Coming Soon):**
- Patient records
- Prescription management
- Clinical notes
- Lab results review
- Treatment plans
- Consultation history

---

## Active Tab State

### Visual Indicators
```
┌─────────────┐
│ ▬▬▬▬▬▬▬▬▬  │  ← Cyan gradient bar at top
│             │
│     🛡️      │  ← Icon in cyan color
│             │
│   COMMAND   │  ← Label in cyan color
│    CENTRE   │
│             │
│      •      │  ← Active dot at bottom
└─────────────┘
```

### Inactive Tab State
```
┌─────────────┐
│             │  ← No top bar
│             │
│     📅      │  ← Icon in gray color
│             │
│   MISSION   │  ← Label in gray color
│  SCHEDULER  │
│             │
│             │  ← No dot
└─────────────┘
```

---

## Navigation Flow

### Initial Load
```
App Launch
    ↓
Splash Screen
    ↓
Login Check
    ↓
┌─────────────────────┐
│   User Logged In?   │
└─────────────────────┘
    ↓           ↓
   NO          YES
    ↓           ↓
  Login    Role Check
    ↓           ↓
    └───────────┘
         ↓
┌─────────────────────┐
│  Check User Roles   │
└─────────────────────┘
         ↓
    ┌────┴────┐
    ↓         ↓
  Admin     Other
    ↓         ↓
AdminBoard  Appointments
    ↓         ↓
Command    Mission
Centre     Scheduler
  Tab        Tab
Active     Active
```

### Tab Navigation
```
Current Screen
    ↓
User taps tab
    ↓
┌─────────────────────┐
│  Navigate to route  │
└─────────────────────┘
    ↓
New Screen
    ↓
Update active tab
```

---

## Screen Layouts

### AdminBoard (Command Centre)
```
┌─────────────────────────────────────┐
│  ADMIN BOARD                    ☰   │  ← Header
├─────────────────────────────────────┤
│                                     │
│  📊 Dashboard Stats                 │
│  ┌─────────┬─────────┬─────────┐   │
│  │ Users   │ Centers │ Reports │   │
│  └─────────┴─────────┴─────────┘   │
│                                     │
│  🏢 Center Management               │
│  ┌─────────────────────────────┐   │
│  │ Center 1                    │   │
│  │ Center 2                    │   │
│  └─────────────────────────────┘   │
│                                     │
│  👥 User Management                 │
│  ┌─────────────────────────────┐   │
│  │ User 1                      │   │
│  │ User 2                      │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│ 🛡️  📅  💰  🔍  🩺                  │  ← Bottom Nav
│ CMD MSN FIN SCN DOC                 │
└─────────────────────────────────────┘
```

### Appointments (Mission Scheduler)
```
┌─────────────────────────────────────┐
│  APPOINTMENTS               [+]     │  ← Header
├─────────────────────────────────────┤
│  [All] [Scheduled] [Confirmed]      │  ← Filters
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Patient Name                │   │
│  │ Service • Doctor            │   │
│  │ 10:00 AM • Scheduled        │   │
│  │ [Edit] [Cancel]             │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Patient Name                │   │
│  │ Service • Doctor            │   │
│  │ 11:00 AM • Confirmed        │   │
│  │ [Edit] [Cancel]             │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│ 🛡️  📅  💰  🔍  🩺                  │  ← Bottom Nav
│ CMD MSN FIN SCN DOC                 │
└─────────────────────────────────────┘
```

### Finance (Placeholder)
```
┌─────────────────────────────────────┐
│  FINANCE MODULE                     │  ← Header
├─────────────────────────────────────┤
│                                     │
│         💰                          │
│                                     │
│    FINANCE MODULE                   │
│  Financial Operations & Billing     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🚧 UNDER CONSTRUCTION 🚧   │   │
│  │                             │   │
│  │  This module is currently   │   │
│  │  being developed and will   │   │
│  │  be available soon.         │   │
│  └─────────────────────────────┘   │
│                                     │
│  UPCOMING FEATURES:                 │
│  • Billing & Invoicing              │
│  • Payment Processing               │
│  • Financial Reports                │
│  • Revenue Analytics                │
│  • Insurance Claims                 │
│                                     │
├─────────────────────────────────────┤
│ 🛡️  📅  💰  🔍  🩺                  │  ← Bottom Nav
│ CMD MSN FIN SCN DOC                 │
└─────────────────────────────────────┘
```

### Scanning Bay (Placeholder)
```
┌─────────────────────────────────────┐
│  SCANNING BAY                       │  ← Header
├─────────────────────────────────────┤
│                                     │
│         🔍                          │
│                                     │
│     SCANNING BAY                    │
│  Imaging & Diagnostics Center       │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🚧 UNDER CONSTRUCTION 🚧   │   │
│  │                             │   │
│  │  This module is currently   │   │
│  │  being developed and will   │   │
│  │  be available soon.         │   │
│  └─────────────────────────────┘   │
│                                     │
│  UPCOMING FEATURES:                 │
│  • X-Ray Management                 │
│  • CT Scan Scheduling               │
│  • MRI Queue Management             │
│  • Ultrasound Tracking              │
│  • Image Viewer & PACS              │
│  • Report Generation                │
│                                     │
├─────────────────────────────────────┤
│ 🛡️  📅  💰  🔍  🩺                  │  ← Bottom Nav
│ CMD MSN FIN SCN DOC                 │
└─────────────────────────────────────┘
```

### Doctor (Placeholder)
```
┌─────────────────────────────────────┐
│  DOCTOR MODULE                      │  ← Header
├─────────────────────────────────────┤
│                                     │
│         🩺                          │
│                                     │
│     DOCTOR MODULE                   │
│  Clinical Operations & Patient Care │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🚧 UNDER CONSTRUCTION 🚧   │   │
│  │                             │   │
│  │  This module is currently   │   │
│  │  being developed and will   │   │
│  │  be available soon.         │   │
│  └─────────────────────────────┘   │
│                                     │
│  UPCOMING FEATURES:                 │
│  • Patient Records                  │
│  • Prescription Management          │
│  • Clinical Notes                   │
│  • Lab Results Review               │
│  • Treatment Plans                  │
│  • Consultation History             │
│                                     │
├─────────────────────────────────────┤
│ 🛡️  📅  💰  🔍  🩺                  │  ← Bottom Nav
│ CMD MSN FIN SCN DOC                 │
└─────────────────────────────────────┘
```

---

## Responsive Design

### Small Screens (< 360px)
```
Tab Width: 72px each (5 tabs = 360px)
Icon Size: 16px (reduced)
Label Font: 6px (reduced)
Padding: Minimal
```

### Medium Screens (360px - 400px)
```
Tab Width: 80px each (5 tabs = 400px)
Icon Size: 18px (standard)
Label Font: 7px (standard)
Padding: Standard
```

### Large Screens (> 400px)
```
Tab Width: Flexible (equal distribution)
Icon Size: 20px (enlarged)
Label Font: 8px (enlarged)
Padding: Comfortable
```

---

## Color Scheme

### Active Tab
```
Top Bar: Linear gradient (cyan → blue)
Icon: #00F2FE (cyan)
Label: #00F2FE (cyan)
Background: rgba(0, 242, 254, 0.1)
Bottom Dot: #00F2FE (cyan)
```

### Inactive Tab
```
Icon: rgba(255, 255, 255, 0.5) (gray)
Label: rgba(255, 255, 255, 0.5) (gray)
Background: Transparent
```

### Bottom Nav Bar
```
Background: Linear gradient
  - rgba(11, 17, 32, 0.95)
  - rgba(11, 17, 32, 0.98)
Border Top: rgba(0, 242, 254, 0.1)
Shadow: Large elevation
```

---

## Animation & Transitions

### Tab Switch Animation
```
1. Tap tab
2. Fade out current screen (200ms)
3. Slide in new screen (300ms)
4. Update active indicator (100ms)
5. Show active dot (100ms)
```

### Active Indicator Animation
```
1. Gradient bar slides from left (150ms)
2. Icon color changes (100ms)
3. Label color changes (100ms)
4. Background fades in (150ms)
5. Dot appears (100ms)
```

---

## Accessibility

### Touch Targets
- Minimum: 44x44px (iOS guideline)
- Current: 36x48px (icon + label area)
- Padding: Additional 8px around

### Labels
- Multi-line for clarity
- High contrast colors
- Bold font weight
- Adequate letter spacing

### Icons
- Clear, recognizable symbols
- Adequate size (18px)
- High contrast
- Consistent style

---

## Summary

The new navigation provides:
- ✅ 5 fixed, always-visible tabs
- ✅ Clear, multi-line labels
- ✅ Recognizable icons
- ✅ Strong active state indicators
- ✅ Smooth animations
- ✅ Responsive design
- ✅ Accessible touch targets
- ✅ Consistent styling

**Result:** Modern, intuitive navigation system with direct access to all core modules.

---

**Last Updated:** April 22, 2026  
**Navigation Version:** 3.0 (Bottom Tab Navigation)  
**Status:** ✅ Implemented and Working
