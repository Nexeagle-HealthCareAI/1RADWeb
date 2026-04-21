# Bottom Navigation Bar - User Guide

## 🧭 Navigation Overview

The bottom navigation bar provides quick access to all main sections of the 1RAD mobile app. The navigation items you see depend on your role in the system.

---

## 📱 Navigation Items

### 1. **COMMAND** (Dashboard) 🏠
- **Icon**: LayoutDashboard
- **Route**: Dashboard
- **Available to**: All users
- **Purpose**: Main command center with overview statistics

### 2. **MISSIONS** (Appointments) 📅
- **Icon**: Calendar
- **Route**: Appointments
- **Available to**: All users
- **Purpose**: View and manage appointments/missions

### 3. **REGISTRY** (Patients) 👥
- **Icon**: Users
- **Route**: Patients
- **Available to**: Doctors, Admins, Receptionists
- **Purpose**: Patient database and records

### 4. **INTEL** (Reports) 📄
- **Icon**: FileText
- **Route**: Reports
- **Available to**: Doctors, Admins
- **Purpose**: Analytics and reporting

### 5. **ADMIN** (Admin Board) 🛡️
- **Icon**: Shield
- **Route**: AdminBoard
- **Available to**: Admins, AdminDoctors only
- **Purpose**: System administration and configuration

---

## 👤 Role-Based Access

### Doctor
```
┌─────────────────────────────────────────┐
│  COMMAND │ MISSIONS │ REGISTRY │ INTEL  │
│    🏠    │    📅    │    👥    │   📄   │
└─────────────────────────────────────────┘
```

### Admin / AdminDoctor
```
┌──────────────────────────────────────────────────┐
│  COMMAND │ MISSIONS │ REGISTRY │ INTEL │ ADMIN  │
│    🏠    │    📅    │    👥    │   📄  │   🛡️   │
└──────────────────────────────────────────────────┘
```

### Technician
```
┌─────────────────────────┐
│  COMMAND │ MISSIONS     │
│    🏠    │    📅        │
└─────────────────────────┘
```

### Receptionist
```
┌──────────────────────────────────┐
│  COMMAND │ MISSIONS │ REGISTRY  │
│    🏠    │    📅    │    👥     │
└──────────────────────────────────┘
```

---

## 🎨 Visual States

### Inactive Item
```
┌──────────┐
│          │
│    📅    │  ← Gray icon
│ MISSIONS │  ← Gray text
│          │
└──────────┘
```

### Active Item
```
┌──────────┐
│ ▬▬▬▬▬▬   │  ← Cyan indicator line
│  ┌────┐  │
│  │ 📅 │  │  ← Cyan icon with background
│  └────┘  │
│ MISSIONS │  ← Cyan text
│    •     │  ← Cyan dot
└──────────┘
```

---

## 🎯 Usage

### Tap to Navigate
1. Tap any navigation item to switch to that screen
2. Current screen is highlighted with cyan color
3. Smooth transition animation between screens

### Visual Feedback
- **Press**: Item scales down slightly
- **Release**: Springs back with animation
- **Active**: Cyan color, background highlight, top line, bottom dot

---

## 💡 Tips

1. **Quick Access**: Bottom navigation is always visible for instant access
2. **Current Location**: Active item shows where you are
3. **Role Awareness**: Only see navigation items relevant to your role
4. **Smooth Transitions**: Animations provide visual continuity

---

## 🔧 Technical Details

### Position
- Fixed at bottom of screen
- Overlays content with absolute positioning
- Content has bottom padding to prevent overlap

### Safe Areas
- iOS devices: Extra padding for home indicator
- Notched devices: Proper safe area handling

### Performance
- Uses native driver for smooth animations
- Optimized for 60fps performance
- Minimal re-renders

---

## 🎨 Design Specifications

### Colors
- **Active**: Cyan (#00f2fe)
- **Inactive**: Gray (rgba(255,255,255,0.5))
- **Background**: Dark with transparency
- **Border**: Cyan with low opacity

### Dimensions
- **Height**: ~70px (plus safe area)
- **Icon Size**: 20px
- **Label Font**: 9px, weight 800
- **Indicator Line**: 3px height

### Animations
- **Scale**: 1.0 → 0.95 → 1.0
- **Duration**: ~200ms
- **Easing**: Spring animation

---

## 📱 Screens with Bottom Navigation

1. ✅ **Dashboard** - Main command center
2. ✅ **Appointments** - Mission management
3. ✅ **Admin Board** - System administration
4. 🔜 **Patients** - Patient registry (coming soon)
5. 🔜 **Reports** - Analytics and intel (coming soon)

---

## 🐛 Troubleshooting

### Navigation not visible?
- Check if screen has bottom padding (80px)
- Verify BottomNavBar component is added
- Check z-index and positioning

### Wrong items showing?
- Verify user role is passed correctly
- Check role-based filtering logic
- Ensure user object has roles array

### Content hidden behind nav?
- Add paddingBottom: 80 to content container
- Ensure ScrollView has proper contentContainerStyle
- Check for absolute positioning conflicts

---

## 🚀 Future Enhancements

- [ ] Badge notifications on nav items
- [ ] Haptic feedback on press
- [ ] Long-press for quick actions
- [ ] Swipe gestures between screens
- [ ] Customizable navigation order
- [ ] Animation when switching tabs
- [ ] Sound effects (optional)

---

**Version**: 1.0.0
**Last Updated**: 2026-04-20
