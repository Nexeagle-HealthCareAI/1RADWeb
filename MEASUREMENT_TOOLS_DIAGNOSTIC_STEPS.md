# Measurement Tools Diagnostic Steps

## Step-by-Step Debugging

### Step 1: Open Browser Console
1. Press **F12** to open Developer Tools
2. Click on **Console** tab
3. Keep it open while testing

### Step 2: Load DICOM File
1. Load a DICOM file
2. Check console for these messages:
   ```
   [DICOM] Cornerstone3D Core & Loader Fully Initialized
   [DICOM] Rendering Engine Created
   [DICOM] Viewport Initialized
   ```
   ✅ If you see these: Initialization is OK
   ❌ If you don't: There's an initialization problem

### Step 3: Test WindowLevel Tool
1. Press **W** key (or click W/L button)
2. Check console for:
   ```
   [SHORTCUT] Window/Level (W)
   [TOOL] Activated: WindowLevelTool
   ```
3. **Drag mouse on image** - does brightness/contrast change?
   
   ✅ If YES: Navigation tools work, proceed to Step 4
   ❌ If NO: Viewport not responding to tools

### Step 4: Test Length Tool
1. Press **L** key (or click Length button)
2. Check console for:
   ```
   [SHORTCUT] Length (L)
   [TOOL] Activated: LengthTool
   ```
3. **Click on image** - does anything happen?

### Step 5: Check for Errors
Look for RED error messages in console like:
- `Tool LengthTool not found in tool group`
- `Tool activation failed`
- `Cannot read property of undefined`
- `Annotation rendering error`

## Common Error Messages & Solutions

### Error: "Tool LengthTool not found in tool group"
**Cause**: Tool not registered
**Solution**: Tool registration issue - needs code fix

### Error: "Tool activation failed"
**Cause**: Tool state issue
**Solution**: Tool enabling issue - needs code fix

### Error: "Cannot set property of undefined"
**Cause**: ToolGroup or RenderingEngine not initialized
**Solution**: Initialization timing issue - needs code fix

### No errors, but tool doesn't draw
**Cause**: Mouse events not reaching tool
**Solution**: Event binding issue - needs code fix

## What to Report

Please provide:

1. **Console Messages** (copy all text from console)
2. **What happens when you**:
   - Press W key: _______________
   - Drag mouse after pressing W: _______________
   - Press L key: _______________
   - Click on image after pressing L: _______________
3. **Does the button highlight** when you click it? YES / NO
4. **Browser**: Chrome / Firefox / Edge / Safari
5. **Any RED error messages**: (copy here)

## Quick Test Script

Copy this into the browser console and press Enter:

```javascript
// Check if Cornerstone is initialized
console.log('Cornerstone initialized:', window.cornerstone !== undefined);

// Check if tool group exists
const toolGroup = window.cornerstoneTools?.ToolGroupManager?.getToolGroup('DICOM_TOOL_GROUP');
console.log('Tool group exists:', toolGroup !== undefined);

// Check which tools are registered
if (toolGroup) {
  console.log('Registered tools:', Object.keys(toolGroup._toolInstances || {}));
  console.log('Active tool:', toolGroup.getActivePrimaryMouseButtonTool());
}

// Check rendering engine
const engine = window.cornerstoneRenderingEngine;
console.log('Rendering engine exists:', engine !== undefined);
if (engine) {
  const viewport = engine.getViewport('DICOM_VIEWPORT_0');
  console.log('Viewport exists:', viewport !== undefined);
}
```

This will show:
- If Cornerstone is loaded
- If tool group exists
- Which tools are registered
- Which tool is currently active
- If viewport exists

## Expected Output (Working System)

```
Cornerstone initialized: true
Tool group exists: true
Registered tools: ["WindowLevelTool", "ZoomTool", "PanTool", "StackScrollTool", "LengthTool", "HeightTool", ...]
Active tool: WindowLevelTool
Rendering engine exists: true
Viewport exists: true
```

## If Tools Still Don't Work

The issue could be:

1. **Tool Registration**: Tools not properly added to tool group
2. **Tool Enabling**: Tools not in "Enabled" state
3. **Tool Activation**: Tools not receiving mouse bindings
4. **Event Handling**: Mouse events not reaching tools
5. **Viewport Issues**: Viewport not properly initialized
6. **Cornerstone Version**: Incompatible Cornerstone3D version

Please run the diagnostic script above and share the output so I can identify the exact issue.
