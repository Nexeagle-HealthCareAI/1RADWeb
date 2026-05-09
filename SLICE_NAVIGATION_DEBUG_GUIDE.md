# Slice Navigation Debug Guide

## Issue
User reports that slice navigation is not working after switching series in Full View mode.

## Changes Made

### 1. Disabled Manual Wheel Handler
**File**: `src/components/AdvancedDicomViewer.jsx` (Lines 476-512)
- **Reason**: The manual wheel event handler was calling `e.preventDefault()` which was blocking Cornerstone's StackScroll tool
- **Action**: Commented out the manual wheel handler to rely solely on StackScroll tool

### 2. Enhanced Keyboard Navigation
**File**: `src/components/AdvancedDicomViewer.jsx` (Lines 404-475)
- **Added**: Auto-focus on the DICOM viewer element
- **Added**: Removed focus outline for cleaner appearance
- **Reason**: Keyboard events only work when the element has focus

### 3. Enhanced StackScroll Tool Setup
**File**: `src/components/AdvancedDicomViewer.jsx` (Lines 1231-1255)
- **Added**: Check if StackScroll tool exists in tool group before activating
- **Added**: Detailed logging for tool state and configuration
- **Added**: Error stack trace logging for debugging

### 4. Event Listener Cleanup
**File**: `src/components/AdvancedDicomViewer.jsx` (Lines 1095-1135, 1330-1365)
- **Fixed**: Event handlers now stored as named functions for proper cleanup
- **Fixed**: Event listeners properly removed in cleanup function

## Testing Steps

### Step 1: Check Browser Console
Open browser DevTools (F12) and look for these log messages:

#### On Initial Load:
```
[DICOM] Files prop changed, resetting currentImageIndex to 0
[DICOM] New files count: X
[DICOM] Setting up StackScroll tool: StackScroll
[DICOM] StackScroll tool activated successfully with Wheel binding
[DICOM] Element focused for keyboard navigation
```

#### On Wheel Scroll:
```
[DICOM] Wheel event detected: {deltaY: X, ctrlKey: false, ...}
[DICOM] STACK_NEW_IMAGE event: {imageIdIndex: X}
[DICOM] Slice changed via event: X/Y
```

#### On Keyboard Navigation:
```
[DICOM] Keyboard slice navigation (ArrowDown): X/Y
```

#### On Button Click:
```
[DICOM] Next button clicked: X/Y
[DICOM] ✅ Next slice navigation successful
```

### Step 2: Test Each Navigation Method

#### A. Mouse Wheel (Primary Method)
1. Click on the DICOM viewer to ensure it has focus
2. Scroll mouse wheel up/down
3. **Expected**: Slices should change, console shows STACK_NEW_IMAGE events
4. **If not working**: Check console for errors, verify StackScroll tool is active

#### B. Keyboard Arrows
1. Click on the DICOM viewer to ensure it has focus
2. Press Arrow Up/Down or Left/Right keys
3. **Expected**: Slices should change, console shows "Keyboard slice navigation"
4. **If not working**: Check if element has focus (should have tabindex="0")

#### C. Slider Control
1. Find the vertical slider on the right side of the viewer
2. Click and drag the slider
3. **Expected**: Slices should change in real-time
4. **If not working**: Check console for "Slider navigation" messages

#### D. Previous/Next Buttons
1. Find the ▲/▼ buttons near the slider
2. Click the buttons
3. **Expected**: Slices should change one at a time
4. **If not working**: Check console for "Previous/Next button clicked" messages

### Step 3: Test Series Switching

1. Load a study with multiple series (8+ series)
2. Click "Full View" button
3. Verify all series are shown in the series selector
4. Test slice navigation in Series 1 (all methods)
5. Click "Next Series" button (▶)
6. **Expected**: 
   - Series changes to Series 2
   - Slice counter resets to "1 / X"
   - Console shows "Files prop changed, resetting currentImageIndex to 0"
   - Console shows "Series changed, resetting slice counter to 1"
7. Test slice navigation in Series 2 (all methods)
8. Repeat for all series

### Step 4: Check for Common Issues

#### Issue: Wheel scroll not working
**Possible Causes**:
- StackScroll tool not activated
- Tool group not properly initialized
- Viewport not ready

**Debug**:
```javascript
// In browser console:
const viewport = window.cornerstoneViewport; // If exposed
console.log('Viewport:', viewport);
console.log('Stack data:', viewport?.getStackData());
```

#### Issue: Keyboard not working
**Possible Causes**:
- Element doesn't have focus
- Keyboard events being captured by parent

**Debug**:
```javascript
// In browser console:
document.activeElement // Should be the canvas element
```

#### Issue: Buttons not working
**Possible Causes**:
- renderingEngineRef is null
- Viewport not initialized
- currentImageIndex state not updating

**Debug**:
- Check console for error messages
- Verify viewport exists: `renderingEngineRef.current?.getViewport(viewportId)`

## Manual Testing Commands

If navigation still doesn't work, try these manual commands in the browser console:

### Force Slice Change:
```javascript
// Get the viewport (you may need to expose this in the component)
const engine = window.cornerstoneEngine; // If exposed
const viewport = engine?.getViewport('VIEWPORT_xxx');
if (viewport) {
  viewport.setImageIdIndex(5); // Change to slice 5
  viewport.render();
}
```

### Check Current State:
```javascript
// Check if StackScroll tool is active
const toolGroup = window.cornerstoneToolGroup; // If exposed
console.log('Active tools:', toolGroup?.getActivePrimaryMouseButtonTool());
console.log('Tool bindings:', toolGroup?._toolInstances);
```

## Expected Behavior

### Working Navigation:
- ✅ Mouse wheel scrolls through slices smoothly
- ✅ Arrow keys navigate one slice at a time
- ✅ Slider provides real-time feedback
- ✅ Buttons work with visual feedback (disabled state)
- ✅ Slice counter updates: "X / Y"
- ✅ Series switching resets to slice 1
- ✅ All methods work after series switch

### Console Output (Success):
```
[DICOM] Files prop changed, resetting currentImageIndex to 0
[DICOM] New files count: 150
[DICOM] Setting up StackScroll tool: StackScroll
[DICOM] StackScrollTool class: [Function]
[DICOM] Tool group has StackScroll: true
[DICOM] ✅ StackScroll tool activated successfully with Wheel binding
[DICOM] Element focused for keyboard navigation
[DICOM] Wheel event detected: {deltaY: 100, ...}
[DICOM] STACK_NEW_IMAGE event: {imageIdIndex: 1}
[DICOM] Slice changed via event: 2/150
```

## Troubleshooting

### If StackScroll tool fails to activate:
1. Check if StackScrollTool is imported correctly
2. Verify tool is registered globally with `addTool(StackScrollTool)`
3. Check if tool name matches: `StackScrollTool.toolName` should be "StackScroll"

### If STACK_NEW_IMAGE events don't fire:
1. Verify event listener is attached to the correct element
2. Check if element exists: `elementRef.current`
3. Verify viewport has stack data: `viewport.getStackData()`

### If keyboard navigation doesn't work:
1. Click on the viewer to give it focus
2. Check if tabindex is set: `element.getAttribute('tabindex')` should be "0"
3. Verify keyboard handler is attached to document

### If series switching breaks navigation:
1. Check if React key prop is changing: `key={series-${activeSeriesIndex}}`
2. Verify cleanup function is running (check console for cleanup logs)
3. Ensure new files are passed to component: `currentFiles` should update

## Next Steps if Still Not Working

1. **Expose debugging variables**:
   Add to component:
   ```javascript
   useEffect(() => {
     window.cornerstoneEngine = renderingEngineRef.current;
     window.cornerstoneToolGroup = toolGroupRef.current;
     window.cornerstoneViewport = renderingEngineRef.current?.getViewport(viewportId);
   }, [isReady]);
   ```

2. **Add visual feedback**:
   Add a visible slice counter that updates on every navigation attempt

3. **Test with minimal setup**:
   Create a simple test page with just the viewer and one series

4. **Check Cornerstone version**:
   Verify @cornerstonejs/core and @cornerstonejs/tools versions are compatible

5. **Review Cornerstone documentation**:
   Check if StackScroll tool API has changed in recent versions
