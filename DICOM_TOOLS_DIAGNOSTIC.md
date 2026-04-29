# DICOM Tools Diagnostic Guide

## All Registered Tools (30+)

### Navigation Tools (4)
1. **WindowLevelTool** (W) - Adjust brightness/contrast
   - **How to use**: Click and drag on image (left mouse button)
   - **Expected behavior**: Image brightness changes horizontally, contrast vertically
   
2. **ZoomTool** (Z) - Zoom in/out
   - **How to use**: Click and drag up/down on image
   - **Expected behavior**: Image zooms in (drag up) or out (drag down)
   
3. **PanTool** (P) - Move image
   - **How to use**: Click and drag image
   - **Expected behavior**: Image moves with mouse
   
4. **StackScrollTool** (S) - Scroll through slices
   - **How to use**: Click and drag up/down OR use mouse wheel
   - **Expected behavior**: Cycles through image slices

### Measurement Tools (5)
5. **LengthTool** (L) - Measure distance
   - **How to use**: Click start point, move mouse, click end point
   - **Expected behavior**: Line appears with distance measurement
   
6. **HeightTool** (H) - Measure vertical height
   - **How to use**: Click start point, move mouse vertically, click end point
   - **Expected behavior**: Vertical line with height measurement
   
7. **BidirectionalTool** (B) - RECIST measurement
   - **How to use**: Click to draw first line, then perpendicular line
   - **Expected behavior**: Cross-shaped measurement (length × width)
   
8. **AngleTool** (A) - Measure angles
   - **How to use**: Click 3 points to form an angle
   - **Expected behavior**: Angle measurement displayed
   
9. **CobbAngleTool** (C) - Spine curvature
   - **How to use**: Draw two lines representing vertebral endplates
   - **Expected behavior**: Cobb angle measurement for scoliosis

### ROI Tools (4)
10. **EllipticalROITool** (E) - Ellipse region
    - **How to use**: Click and drag to draw ellipse
    - **Expected behavior**: Ellipse with statistics (mean, std dev, area)
    
11. **RectangleROITool** (R) - Rectangle region
    - **How to use**: Click and drag to draw rectangle
    - **Expected behavior**: Rectangle with statistics
    
12. **CircleROITool** (O) - Circle region
    - **How to use**: Click center, drag to set radius
    - **Expected behavior**: Circle with statistics
    
13. **PlanarFreehandROITool** (F) - Freehand region
    - **How to use**: Click and drag to draw custom shape, release to close
    - **Expected behavior**: Custom shape with statistics

### Analysis Tools (3)
14. **ProbeTool** (U) - Pixel value probe
    - **How to use**: Click on any pixel
    - **Expected behavior**: Shows pixel value and Hounsfield Units (HU)
    
15. **ArrowAnnotateTool** (N) - Arrow annotation
    - **How to use**: Click start, drag, click end to place arrow
    - **Expected behavior**: Arrow with optional text label
    
16. **AdvancedMagnifyTool** (M) - Magnifier
    - **How to use**: Click and hold on area to magnify
    - **Expected behavior**: Magnified view of selected area

### Image Controls (4)
17. **Invert** (I) - Invert colors
    - **How to use**: Click button or press I
    - **Expected behavior**: Black becomes white, white becomes black
    
18. **Flip Horizontal** (X) - Mirror left/right
    - **How to use**: Click button or press X
    - **Expected behavior**: Image flips horizontally
    
19. **Flip Vertical** (Y) - Mirror top/bottom
    - **How to use**: Click button or press Y
    - **Expected behavior**: Image flips vertically
    
20. **Rotate** (T) - Rotate 90°
    - **How to use**: Click button or press T
    - **Expected behavior**: Image rotates 90° clockwise

### Playback Controls (3)
21. **Cine** (Space) - Auto-play slices
    - **How to use**: Press Space or click button
    - **Expected behavior**: Automatically cycles through slices
    
22. **Sync** (V) - Synchronize viewports
    - **How to use**: Press V or click button
    - **Expected behavior**: All viewports scroll together
    
23. **Reset** (Esc) - Reset view
    - **How to use**: Press Escape or click button
    - **Expected behavior**: Resets zoom, pan, window/level to defaults

## Common Issues & Solutions

### Issue 1: Tool Not Drawing/Measuring
**Symptoms**: Click on image but nothing happens
**Possible Causes**:
- Tool not properly activated
- Mouse binding conflict
- Image not fully loaded

**Solutions**:
1. Check browser console for errors (F12)
2. Try clicking the tool button again
3. Press Escape to reset, then try again
4. Reload the page

### Issue 2: Measurements Not Showing
**Symptoms**: Draw measurement but no numbers appear
**Possible Causes**:
- Annotation layer not rendering
- Statistics calculation disabled
- Viewport not properly initialized

**Solutions**:
1. Check if other tools work (try WindowLevel first)
2. Try switching to 1×1 layout
3. Reload DICOM files

### Issue 3: ROI Tools Not Calculating Statistics
**Symptoms**: ROI drawn but no mean/std dev shown
**Possible Causes**:
- Pixel data not accessible
- Statistics calculation error
- ROI too small or outside image bounds

**Solutions**:
1. Draw larger ROI
2. Ensure ROI is fully within image bounds
3. Check console for calculation errors

### Issue 4: Keyboard Shortcuts Not Working
**Symptoms**: Pressing keys doesn't activate tools
**Possible Causes**:
- Focus not on viewer
- Text input field is active
- Keyboard event listener not attached

**Solutions**:
1. Click on the DICOM image first
2. Make sure no text fields are selected
3. Check if shortcuts work in help modal (?)

### Issue 5: Cine Mode Not Playing
**Symptoms**: Press Space but slices don't auto-advance
**Possible Causes**:
- Only one slice loaded
- Cine speed set to 0
- Stack scroll not initialized

**Solutions**:
1. Verify multiple slices are loaded (check slice counter)
2. Use ↑/↓ to adjust cine speed
3. Try manual scroll first (S key + drag)

## Testing Checklist

### Basic Functionality
- [ ] Load DICOM file successfully
- [ ] Image displays correctly
- [ ] Can adjust window/level (W key)
- [ ] Can zoom in/out (Z key)
- [ ] Can pan image (P key)

### Measurement Tools
- [ ] Length tool draws line with measurement
- [ ] Height tool draws vertical line
- [ ] Bidirectional tool creates cross measurement
- [ ] Angle tool measures angles correctly
- [ ] Cobb angle tool works for spine images

### ROI Tools
- [ ] Ellipse ROI shows statistics
- [ ] Rectangle ROI shows statistics
- [ ] Circle ROI shows statistics
- [ ] Freehand ROI closes and shows statistics

### Analysis Tools
- [ ] Probe shows pixel values
- [ ] Arrow annotation can be placed
- [ ] Magnify tool shows zoomed view

### Image Manipulation
- [ ] Invert changes colors
- [ ] Flip horizontal mirrors image
- [ ] Flip vertical mirrors image
- [ ] Rotate turns image 90°

### Playback
- [ ] Cine mode auto-plays slices
- [ ] Sync mode links viewports
- [ ] Reset restores defaults

## Debugging Steps

### Step 1: Check Console
Open browser console (F12) and look for:
- `[DICOM]` initialization messages
- `[SHORTCUT]` tool activation messages
- Error messages in red

### Step 2: Verify Tool Registration
In console, type:
```javascript
window.cornerstoneTools.state.tools
```
Should show all registered tools.

### Step 3: Check Active Tool
In console, type:
```javascript
// Get tool group
const toolGroup = window.cornerstoneTools.ToolGroupManager.getToolGroup('DICOM_TOOL_GROUP');
console.log('Active tool:', toolGroup.getActivePrimaryMouseButtonTool());
```

### Step 4: Test Tool Activation
Try activating a tool manually in console:
```javascript
const toolGroup = window.cornerstoneTools.ToolGroupManager.getToolGroup('DICOM_TOOL_GROUP');
toolGroup.setToolActive('LengthTool', {
  bindings: [{ mouseButton: 1 }]
});
```

### Step 5: Check Viewport
Verify viewport is rendering:
```javascript
const renderingEngine = window.cornerstoneRenderingEngine;
const viewport = renderingEngine.getViewport('DICOM_VIEWPORT_0');
console.log('Viewport:', viewport);
console.log('Image:', viewport.getImageData());
```

## Tool-Specific Troubleshooting

### WindowLevelTool
- Should work immediately on image load
- Drag horizontally = brightness
- Drag vertically = contrast
- If not working: Check if image has pixel data

### ZoomTool
- Drag up = zoom in
- Drag down = zoom out
- Alternative: Mouse wheel
- If not working: Check viewport scaling

### LengthTool
- Click once = start point
- Move mouse = preview line
- Click again = end point
- If not working: Check annotation layer

### EllipticalROITool
- Click and drag to draw
- Release to finalize
- Statistics appear automatically
- If not working: Check if ROI is within image bounds

### ProbeTool
- Single click shows value
- Works on any pixel
- Shows HU for CT images
- If not working: Check pixel data access

## Performance Tips

1. **Disable unused tools**: Only activate tools you need
2. **Limit annotations**: Too many measurements can slow rendering
3. **Use 1×1 layout**: Multi-viewport uses more resources
4. **Clear measurements**: Use "Clear All" button periodically
5. **Reload if slow**: Fresh load can improve performance

## Browser Compatibility

### Recommended Browsers
- ✅ Chrome 90+ (Best performance)
- ✅ Edge 90+ (Best performance)
- ✅ Firefox 88+ (Good performance)
- ⚠️ Safari 14+ (Limited support)

### Known Issues
- **Safari**: Some compressed DICOM formats may not load
- **Firefox**: Slightly slower rendering than Chrome
- **Mobile**: Touch gestures may not work for all tools

## Getting Help

If tools still aren't working after trying these steps:

1. **Check browser console** for specific error messages
2. **Note which tools work** and which don't
3. **Test with different DICOM files** to rule out file issues
4. **Try different browsers** to rule out browser issues
5. **Document the issue**:
   - Which tool(s) not working?
   - What happens when you try to use them?
   - Any error messages?
   - What DICOM file type?

## Quick Reference: Tool Names

| Button Label | Tool ID | Keyboard | Mouse Action |
|--------------|---------|----------|--------------|
| W/L | WindowLevelTool | W | Drag |
| Zoom | ZoomTool | Z | Drag up/down |
| Pan | PanTool | P | Drag |
| Scroll | StackScrollTool | S | Drag/wheel |
| Length | LengthTool | L | Click-move-click |
| Height | HeightTool | H | Click-move-click |
| RECIST | BidirectionalTool | B | Click-move-click (2x) |
| Angle | AngleTool | A | Click 3 points |
| Cobb | CobbAngleTool | C | Draw 2 lines |
| Ellipse | EllipticalROITool | E | Click-drag-release |
| Rect | RectangleROITool | R | Click-drag-release |
| Circle | CircleROITool | O | Click-drag-release |
| Free | PlanarFreehandROITool | F | Click-drag-release |
| Probe | ProbeTool | U | Click |
| Arrow | ArrowAnnotateTool | N | Click-move-click |
| Magnify | AdvancedMagnifyTool | M | Click-hold |

---

**Note**: All tools require a DICOM image to be loaded first. If no image is loaded, tools will not function.
