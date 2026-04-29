# DICOM Tool Testing Checklist

## Quick Test Procedure

### Step 1: Test Basic Navigation (MUST WORK FIRST)
1. Load a DICOM file
2. Press **W** key (or click W/L button)
3. **Drag mouse on image** - image should get brighter/darker
4. Press **Z** key (or click Zoom button)
5. **Drag mouse up/down** - image should zoom in/out
6. Press **P** key (or click Pan button)
7. **Drag mouse** - image should move

✅ **If these work**: Navigation is OK, proceed to Step 2
❌ **If these DON'T work**: Image loading issue or viewport not initialized

### Step 2: Test Measurement Tools
1. Press **L** key (or click Length button)
2. **Click once** on image (start point)
3. **Move mouse** (should see line preview)
4. **Click again** (end point)
5. **Expected**: Line with distance measurement appears

✅ **If this works**: Measurement tools are OK
❌ **If this DOESN'T work**: Annotation layer issue

### Step 3: Test ROI Tools
1. Press **E** key (or click Ellipse button)
2. **Click and drag** on image
3. **Release mouse**
4. **Expected**: Ellipse with statistics (mean, std dev, area)

✅ **If this works**: ROI tools are OK
❌ **If this DOESN'T work**: Statistics calculation issue

### Step 4: Test Analysis Tools
1. Press **U** key (or click Probe button)
2. **Click anywhere** on image
3. **Expected**: Popup showing pixel value and HU

✅ **If this works**: Analysis tools are OK
❌ **If this DOESN'T work**: Pixel data access issue

## Common Problems & Quick Fixes

### Problem 1: "Nothing happens when I click"
**Likely Cause**: Tool not activated or wrong mouse button
**Fix**:
1. Click the tool button in sidebar again
2. Make sure you're using LEFT mouse button
3. Check console (F12) for errors

### Problem 2: "Tool activates but doesn't draw"
**Likely Cause**: Annotation layer not rendering
**Fix**:
1. Press Escape to reset
2. Try switching to 1×1 layout
3. Reload the page

### Problem 3: "Measurements appear but no numbers"
**Likely Cause**: Statistics calculation disabled or failed
**Fix**:
1. Check if ROI is fully within image bounds
2. Try a different measurement tool
3. Check console for calculation errors

### Problem 4: "Some tools work, others don't"
**Likely Cause**: Specific tool registration issue
**Fix**:
1. Note which tools work and which don't
2. Check if it's a pattern (all ROI tools, all measurement tools, etc.)
3. Check console for specific tool errors

### Problem 5: "Tools worked before, now they don't"
**Likely Cause**: State corruption or memory issue
**Fix**:
1. Press Escape to reset
2. Reload the page (F5)
3. Clear browser cache if needed

## Browser Console Checks

Open console (F12) and look for:

### Good Signs ✅
```
[DICOM] Cornerstone3D Core & Loader Fully Initialized
[DICOM] Rendering Engine Created
[DICOM] Viewport Initialized
[SHORTCUT] Tool Name (Key)
```

### Bad Signs ❌
```
Error: Tool not found
Error: Cannot read property of undefined
Tool activation failed
Annotation rendering error
```

## Tool-by-Tool Status

Use this checklist to identify which tools work:

### Navigation Tools
- [ ] WindowLevelTool (W) - Adjust brightness/contrast
- [ ] ZoomTool (Z) - Zoom in/out
- [ ] PanTool (P) - Move image
- [ ] StackScrollTool (S) - Scroll slices

### Measurement Tools
- [ ] LengthTool (L) - Measure distance
- [ ] HeightTool (H) - Measure height
- [ ] BidirectionalTool (B) - RECIST measurement
- [ ] AngleTool (A) - Measure angles
- [ ] CobbAngleTool (C) - Spine curvature

### ROI Tools
- [ ] EllipticalROITool (E) - Ellipse region
- [ ] RectangleROITool (R) - Rectangle region
- [ ] CircleROITool (O) - Circle region
- [ ] PlanarFreehandROITool (F) - Freehand region

### Analysis Tools
- [ ] ProbeTool (U) - Pixel value probe
- [ ] ArrowAnnotateTool (N) - Arrow annotation
- [ ] AdvancedMagnifyTool (M) - Magnifier

### Image Controls
- [ ] Invert (I) - Invert colors
- [ ] Flip Horizontal (X) - Mirror left/right
- [ ] Flip Vertical (Y) - Mirror top/bottom
- [ ] Rotate (T) - Rotate 90°

### Playback Controls
- [ ] Cine (Space) - Auto-play slices
- [ ] Sync (V) - Synchronize viewports
- [ ] Reset (Esc) - Reset view

## Reporting Issues

If tools aren't working, please provide:

1. **Which tools don't work**: (list specific tool names)
2. **What happens**: (nothing, error, partial function, etc.)
3. **Console errors**: (copy any red error messages)
4. **Browser**: (Chrome, Firefox, Edge, Safari + version)
5. **DICOM file type**: (CT, MR, X-Ray, etc.)
6. **Steps to reproduce**:
   - Load file
   - Click tool X
   - Try to draw/measure
   - Result: ...

## Expected Behavior Reference

### WindowLevelTool
- **Action**: Drag mouse on image
- **Result**: Image brightness/contrast changes in real-time
- **Visual**: No overlay, just image appearance changes

### LengthTool
- **Action**: Click start, move, click end
- **Result**: Line with measurement label (e.g., "45.2 mm")
- **Visual**: Colored line with handles at endpoints

### EllipticalROITool
- **Action**: Click and drag to draw ellipse
- **Result**: Ellipse with statistics box
- **Visual**: Ellipse outline + text showing mean, std dev, area

### ProbeTool
- **Action**: Click on any pixel
- **Result**: Tooltip or overlay showing pixel value
- **Visual**: Small popup near cursor with HU value

### AngleTool
- **Action**: Click 3 points to form angle
- **Result**: Angle measurement (e.g., "45.0°")
- **Visual**: Two lines meeting at vertex with angle label

## Next Steps

1. **Complete the checklist above**
2. **Note which tools work and which don't**
3. **Check browser console for errors**
4. **Try the quick fixes for common problems**
5. **If still not working, report the issue with details**

---

**Tip**: Start with basic navigation tools (W, Z, P). If these don't work, the issue is with viewport initialization, not the tools themselves.
