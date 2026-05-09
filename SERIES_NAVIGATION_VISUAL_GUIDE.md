# Series Navigation Visual Guide

## Where to Find the Series Navigation Buttons

### Location on Screen:
```
┌─────────────────────────────────────────────────────────────────┐
│  ← BACK    Study Name                    [◀ SERIES 1/8 ▶]     │  ← TOP HEADER
│            Series 1 of 8 • 150 Slices    SLICE: 1/150          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                                                                  │
│                    DICOM IMAGE VIEWER                           │
│                                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The series navigation is in the **TOP RIGHT** of the header, next to the slice counter.

## What It Looks Like

### Multi-Series Study (2+ series):
```
╔═══════════════════════════════════╗
║  ◀  │  SERIES 1/8  │  ▶          ║  ← Purple gradient box
╚═══════════════════════════════════╝
```

**Visual Details**:
- **Background**: Purple gradient (vibrant purple to blue)
- **Border**: Purple glow effect
- **Size**: ~250px wide, prominent
- **Buttons**: Large white arrows (◀ ▶)
- **Text**: "SERIES X/Y" in bold white letters

### Single Series Study (1 series):
```
╔═══════════════════════════════════╗
║  ⚠️ Single Series (1)             ║  ← Yellow warning box
╚═══════════════════════════════════╝
```

**Visual Details**:
- **Background**: Yellow/amber translucent
- **Border**: Yellow border
- **Text**: Warning icon + "Single Series (1)"

## Button States

### Previous Button (◀):
```
At SERIES 1/8:
┌─────┐
│  ◀  │  ← DISABLED (grayed out, can't click)
└─────┘

At SERIES 2/8 or higher:
┌─────┐
│  ◀  │  ← ENABLED (bright white, clickable)
└─────┘
     ↑ Hover: Scales up slightly, brighter
```

### Next Button (▶):
```
At SERIES 8/8:
┌─────┐
│  ▶  │  ← DISABLED (grayed out, can't click)
└─────┘

At SERIES 1/8 to 7/8:
┌─────┐
│  ▶  │  ← ENABLED (bright white, clickable)
└─────┘
     ↑ Hover: Scales up slightly, brighter
```

## Full Header Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌─────────┐  ┌──────────────────────────┐                              │
│  │← BACK   │  │ Patient Name - Study     │                              │
│  └─────────┘  │ Series 1 of 8 • 150 Slices│                             │
│               └──────────────────────────┘                              │
│                                                                           │
│                                          ┌──────────────────────────┐   │
│                                          │  ◀ │ SERIES 1/8 │ ▶     │   │
│                                          └──────────────────────────┘   │
│                                                                           │
│                                          ┌──────────────────────────┐   │
│                                          │  SLICE: 1 / 150          │   │
│                                          └──────────────────────────┘   │
│                                                                           │
│                                          ┌──────────────────────────┐   │
│                                          │  CT • 512x512            │   │
│                                          └──────────────────────────┘   │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Series Navigation (Multi-Series):
- **Background**: `linear-gradient(135deg, #8b5cf6, #6366f1)` (Purple to Blue)
- **Border**: `2px solid rgba(139, 92, 246, 0.5)` (Purple with transparency)
- **Shadow**: `0 4px 12px rgba(139, 92, 246, 0.5)` (Purple glow)
- **Button (Enabled)**: `rgba(255,255,255,0.3)` (White translucent)
- **Button (Disabled)**: `rgba(255,255,255,0.1)` (Very faint white)
- **Button (Hover)**: `rgba(255,255,255,0.5)` (Brighter white)
- **Text**: `white` with `font-weight: 900` (Extra bold)

### Single Series Warning:
- **Background**: `rgba(251, 191, 36, 0.2)` (Yellow translucent)
- **Border**: `1px solid rgba(251, 191, 36, 0.5)` (Yellow)
- **Text**: `#fbbf24` (Amber yellow)

## Size Specifications

### Series Navigation Box:
- **Width**: `minWidth: 250px` (auto-expands if needed)
- **Height**: Auto (based on content)
- **Padding**: `10px 20px`
- **Border Radius**: `10px` (rounded corners)
- **Gap between elements**: `15px`

### Buttons:
- **Width**: `minWidth: 40px`
- **Height**: Auto (based on padding)
- **Padding**: `6px 12px`
- **Border Radius**: `6px`
- **Font Size**: `14px`
- **Font Weight**: `900` (Extra bold)

### Text:
- **Font Size**: `14px`
- **Font Weight**: `900`
- **Min Width**: `140px`
- **Letter Spacing**: `1px`
- **Text Align**: `center`

## Interaction Feedback

### Hover Effect:
```
Normal State:
┌─────┐
│  ▶  │  opacity: 1, scale: 1
└─────┘

Hover State:
┌─────┐
│  ▶  │  opacity: 1, scale: 1.05, brighter background
└─────┘
  ↑
  Slightly larger and brighter
```

### Click Effect:
```
1. Click button
2. Console logs: "[SERIES NAV] Next button clicked"
3. Series counter updates: "SERIES 1/8" → "SERIES 2/8"
4. Slice counter resets: "SLICE: 1 / X"
5. New images load
6. Button states update (disabled/enabled)
```

## Comparison: Before vs After

### Before (Hard to See):
```
Small box:
┌──────────────────┐
│ ◀ SERIES 1/8 ▶  │  ← Small, 12px font, hard to click
└──────────────────┘
```

### After (Easy to See):
```
Large box:
┌─────────────────────────────┐
│  ◀  │  SERIES 1/8  │  ▶    │  ← Large, 14px font, easy to click
└─────────────────────────────┘
     ↑ Hover effects, visual feedback
```

## What You Should See

### When Full View Opens:
1. **Top left**: ← BACK button
2. **Top center**: Study/patient information
3. **Top right**: 
   - **Purple box** with series navigation (if multiple series)
   - OR **Yellow box** with warning (if single series)
   - **Blue box** with slice counter
   - **Green box** with modality info

### When You Hover Over Buttons:
- Button gets **slightly larger** (scale: 1.05)
- Button gets **brighter** (more opaque white)
- Smooth transition (0.2s ease)
- Cursor changes to pointer

### When You Click Next (▶):
1. Button press animation
2. Series counter increments: 1/8 → 2/8
3. Slice counter resets: X/Y → 1/Z
4. DICOM viewer shows new series images
5. Previous button (◀) becomes enabled
6. If at last series, Next button (▶) becomes disabled

## Troubleshooting Visual Issues

### "I don't see any series navigation"
**Check**:
1. Do you have multiple series? (Need 2+ series)
2. Look for yellow warning box (might be single series)
3. Check browser console for debug messages

### "Buttons are too small"
**This should be fixed now**:
- Buttons are now 40px wide (was 24px)
- Font is now 14px (was 12px)
- More padding for easier clicking

### "Buttons don't respond to hover"
**Check**:
- Are buttons disabled? (grayed out = disabled)
- Try clicking in the center of the button
- Check if JavaScript is enabled

### "Can't find the buttons"
**Look here**:
- Top right corner of the screen
- Next to "SLICE: X/Y" counter
- Purple gradient box (very visible)
- Above the DICOM image viewer

## Expected User Experience

### Smooth Navigation:
1. User sees **prominent purple box** in top right
2. User hovers over **▶ button** → Button lights up
3. User clicks **▶ button** → Series changes smoothly
4. User sees **new series images** load
5. User can click **◀ button** to go back
6. User can navigate through all 8 series easily

### Clear Feedback:
- **Visual**: Buttons change appearance on hover/disable
- **Textual**: "SERIES X/Y" updates immediately
- **Functional**: Slice counter resets to 1
- **Console**: Debug messages confirm actions

## Success Indicators

✅ **You should see**:
- Large purple box in top right
- Clear "SERIES X/Y" text
- Large ◀ and ▶ buttons
- Hover effects work
- Buttons change series when clicked
- Disabled state shows correctly

❌ **You should NOT see**:
- Tiny buttons that are hard to click
- No visual feedback on hover
- Buttons that don't work
- Series navigation missing entirely
