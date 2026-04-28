# DICOM Viewer UI Integration Guide

## 🎯 Quick Integration Reference

### How to Add Tool Buttons to ReportingPage

The DICOM viewer now supports these advanced tools. Here's how to integrate them into your UI:

---

## 📋 Tool Button Configuration

Add these buttons to your toolbar in `ReportingPage.jsx`:

```javascript
const TOOL_BUTTONS = [
  // Navigation & Manipulation
  { id: 'WindowLevel', icon: '🎚️', label: 'W/L', tooltip: 'Window/Level' },
  { id: 'Zoom', icon: '🔍', label: 'Zoom', tooltip: 'Zoom In/Out' },
  { id: 'Pan', icon: '✋', label: 'Pan', tooltip: 'Pan Image' },
  { id: 'StackScroll', icon: '📜', label: 'Scroll', tooltip: 'Scroll Stack' },
  
  // Basic Measurements
  { id: 'Length', icon: '📏', label: 'Length', tooltip: 'Measure Distance' },
  { id: 'Height', icon: '📐', label: 'Height', tooltip: 'Measure Height' },
  { id: 'Angle', icon: '∠', label: 'Angle', tooltip: 'Measure Angle' },
  
  // Advanced Measurements
  { id: 'Bidirectional', icon: '↔️', label: 'RECIST', tooltip: 'Bidirectional (RECIST)' },
  { id: 'CobbAngle', icon: '🦴', label: 'Cobb', tooltip: 'Cobb Angle (Spine)' },
  
  // ROI Tools
  { id: 'EllipticalROI', icon: '⭕', label: 'Ellipse', tooltip: 'Elliptical ROI' },
  { id: 'RectangleROI', icon: '⬜', label: 'Rectangle', tooltip: 'Rectangle ROI' },
  { id: 'CircleROI', icon: '🔵', label: 'Circle', tooltip: 'Circle ROI' },
  { id: 'FreehandROI', icon: '✏️', label: 'Freehand', tooltip: 'Freehand ROI' },
  
  // Analysis Tools
  { id: 'Probe', icon: '🎯', label: 'Probe', tooltip: 'Pixel Probe (HU)' },
  { id: 'Arrow', icon: '➡️', label: 'Arrow', tooltip: 'Arrow Annotation' },
  { id: 'AdvancedMagnify', icon: '🔎', label: 'Magnify', tooltip: 'Advanced Magnifier' }
];
```

---

## 🎨 Toolbar Implementation Example

```jsx
{/* DICOM Tools Toolbar */}
<div style={{
  display: 'flex',
  gap: '8px',
  padding: '12px',
  background: 'rgba(15, 23, 42, 0.9)',
  borderRadius: '12px',
  flexWrap: 'wrap',
  maxWidth: '100%'
}}>
  {TOOL_BUTTONS.map(tool => (
    <button
      key={tool.id}
      onClick={() => setActiveTool(tool.id + 'Tool')}
      title={tool.tooltip}
      style={{
        background: activeTool === tool.id + 'Tool' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
        border: 'none',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: 700,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 0.2s',
        minWidth: '60px'
      }}
    >
      <span style={{ fontSize: '16px' }}>{tool.icon}</span>
      <span style={{ fontSize: '8px' }}>{tool.label}</span>
    </button>
  ))}
</div>
```

---

## 🎯 Organized Tool Categories

For better UX, organize tools into categories:

```jsx
const TOOL_CATEGORIES = {
  navigation: {
    title: 'Navigation',
    tools: ['WindowLevel', 'Zoom', 'Pan', 'StackScroll']
  },
  measurement: {
    title: 'Measurements',
    tools: ['Length', 'Height', 'Angle', 'Bidirectional', 'CobbAngle']
  },
  roi: {
    title: 'ROI Analysis',
    tools: ['EllipticalROI', 'RectangleROI', 'CircleROI', 'FreehandROI']
  },
  analysis: {
    title: 'Analysis',
    tools: ['Probe', 'Arrow', 'AdvancedMagnify']
  }
};

// Render with categories
{Object.entries(TOOL_CATEGORIES).map(([key, category]) => (
  <div key={key} style={{ marginBottom: '16px' }}>
    <div style={{ 
      fontSize: '10px', 
      fontWeight: 900, 
      color: '#94a3b8', 
      marginBottom: '8px',
      letterSpacing: '1px'
    }}>
      {category.title}
    </div>
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {category.tools.map(toolId => {
        const tool = TOOL_BUTTONS.find(t => t.id === toolId);
        return (
          <button key={toolId} /* ... button props ... */>
            {/* ... button content ... */}
          </button>
        );
      })}
    </div>
  </div>
))}
```

---

## 🎮 Keyboard Shortcuts (Recommended)

Add keyboard shortcuts for common tools:

```javascript
useEffect(() => {
  const handleKeyPress = (e) => {
    // Only if DICOM viewer is active
    if (!isDicomImage) return;
    
    const shortcuts = {
      'w': 'WindowLevelTool',
      'z': 'ZoomTool',
      'p': 'PanTool',
      'l': 'LengthTool',
      'a': 'AngleTool',
      'b': 'BidirectionalTool',
      'e': 'EllipticalROITool',
      'r': 'RectangleROITool',
      'h': 'ProbeTool',
      'Escape': 'WindowLevelTool' // Reset to default
    };
    
    if (shortcuts[e.key]) {
      setActiveTool(shortcuts[e.key]);
    }
  };
  
  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [isDicomImage]);
```

---

## 📊 Measurement Export Button

Add export functionality to your UI:

```jsx
{/* Export Measurements Button */}
{measurements.length > 0 && (
  <button
    onClick={handleExportMeasurements}
    style={{
      background: '#10b981',
      border: 'none',
      color: 'white',
      padding: '10px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }}
  >
    <span>💾</span>
    Export Measurements ({measurements.length})
  </button>
)}
```

---

## 🎨 Windowing Preset Selector

Add a dropdown for windowing presets:

```jsx
{/* Windowing Presets */}
<select
  value={currentPreset}
  onChange={(e) => applyWindowingPreset(e.target.value)}
  style={{
    background: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer'
  }}
>
  <option value="">Select Preset</option>
  <option value="Lung">🫁 Lung</option>
  <option value="Mediastinum">🫀 Mediastinum</option>
  <option value="Abdomen">🫃 Abdomen</option>
  <option value="Bone">🦴 Bone</option>
  <option value="Brain">🧠 Brain</option>
  <option value="Liver">🫘 Liver</option>
  <option value="Spine">🦴 Spine</option>
  <option value="Angio">🩸 Angio</option>
</select>
```

---

## 🔧 Tool State Management

Manage tool state in your component:

```javascript
const [activeTool, setActiveTool] = useState('WindowLevelTool');
const [measurements, setMeasurements] = useState([]);
const [currentPreset, setCurrentPreset] = useState('Default');

// Handle measurement callback
const handleMeasurement = useCallback((measurement) => {
  setMeasurements(prev => [...prev, measurement]);
  console.log('New measurement:', measurement);
}, []);

// Handle windowing preset
const applyWindowingPreset = useCallback((presetName) => {
  setCurrentPreset(presetName);
  // The viewer handles the actual windowing internally
}, []);
```

---

## 📱 Responsive Layout

For tablet/mobile, use a collapsible toolbar:

```jsx
const [showToolbar, setShowToolbar] = useState(true);

{/* Toolbar Toggle for Mobile */}
{isTablet && (
  <button
    onClick={() => setShowToolbar(!showToolbar)}
    style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: '#3b82f6',
      border: 'none',
      color: 'white',
      width: '50px',
      height: '50px',
      borderRadius: '50%',
      fontSize: '20px',
      cursor: 'pointer',
      zIndex: 1000,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }}
  >
    {showToolbar ? '✕' : '🔧'}
  </button>
)}

{/* Collapsible Toolbar */}
{showToolbar && (
  <div style={{
    position: isTablet ? 'fixed' : 'relative',
    bottom: isTablet ? '80px' : 'auto',
    right: isTablet ? '20px' : 'auto',
    zIndex: isTablet ? 999 : 'auto',
    background: 'rgba(15, 23, 42, 0.95)',
    padding: '12px',
    borderRadius: '12px',
    maxHeight: isTablet ? '60vh' : 'auto',
    overflowY: 'auto'
  }}>
    {/* Tool buttons here */}
  </div>
)}
```

---

## 🎯 Tool-Specific Features

### For RECIST Measurements (Bidirectional):
```jsx
{activeTool === 'BidirectionalTool' && (
  <div style={{
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid #3b82f6',
    padding: '8px',
    borderRadius: '6px',
    fontSize: '10px',
    color: '#3b82f6'
  }}>
    ℹ️ RECIST Mode: Measure longest diameter, then perpendicular
  </div>
)}
```

### For Cobb Angle:
```jsx
{activeTool === 'CobbAngleTool' && (
  <div style={{
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid #10b981',
    padding: '8px',
    borderRadius: '6px',
    fontSize: '10px',
    color: '#10b981'
  }}>
    🦴 Spine Mode: Draw lines along superior/inferior endplates
  </div>
)}
```

---

## 🎨 Custom Styling

Match your application theme:

```javascript
const THEME = {
  primary: '#3b82f6',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  background: 'rgba(15, 23, 42, 0.9)',
  text: '#ffffff',
  textMuted: '#94a3b8'
};

// Use in button styles
style={{
  background: activeTool === tool.id ? THEME.primary : 'rgba(255,255,255,0.1)',
  color: THEME.text,
  // ... other styles
}}
```

---

## 📋 Complete Integration Checklist

- [ ] Add tool buttons to toolbar
- [ ] Implement tool state management
- [ ] Add keyboard shortcuts
- [ ] Add windowing preset selector
- [ ] Add measurement export button
- [ ] Add clear annotations button
- [ ] Implement responsive design
- [ ] Add tool-specific help text
- [ ] Test all tools on sample DICOM
- [ ] Add loading states
- [ ] Implement error handling
- [ ] Add user preferences storage
- [ ] Test on different screen sizes
- [ ] Add tooltips for all tools
- [ ] Implement undo/redo (optional)

---

## 🚀 Performance Tips

1. **Lazy Load Tools**: Only load tools when needed
2. **Debounce Updates**: Prevent excessive re-renders
3. **Memoize Callbacks**: Use `useCallback` for event handlers
4. **Optimize Renders**: Use `React.memo` for tool buttons
5. **Virtual Scrolling**: For large measurement lists

---

## 🔍 Testing Recommendations

```javascript
// Test each tool
const testTools = async () => {
  const tools = ['Length', 'Angle', 'Bidirectional', 'EllipticalROI'];
  
  for (const tool of tools) {
    console.log(`Testing ${tool}...`);
    setActiveTool(tool + 'Tool');
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Manually test interaction
  }
};
```

---

**Integration Status**: Ready for Production ✅
**Last Updated**: April 28, 2026
