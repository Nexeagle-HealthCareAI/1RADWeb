# Multi-Series Full View - Testing Guide

## Quick Test

### Test Your 8-Series Study

1. **Load the study** in ReportingPage
   - You should see "ACQUISITION_SERIES (8)" or similar
   - All 8 series should be listed in the series selector

2. **Click "FULL VIEW"** button
   - Check console for: `[FULL VIEW] Total series count: 8`
   - Check console for: `[FULL VIEW] Navigating to DICOM viewer with ALL series`

3. **Verify Full View opens**
   - Should see series selector: **[◀ SERIES 1/8 ▶]**
   - Header shows: "Series 1 of 8 • Full Screen • X Slices"

4. **Navigate through series**
   - Click **▶** button to go to next series
   - Should see: **SERIES 2/8**, **SERIES 3/8**, etc.
   - Each series should show its own slices

5. **Check boundaries**
   - On **SERIES 1/8**: ◀ button should be disabled (grayed out)
   - On **SERIES 8/8**: ▶ button should be disabled (grayed out)

## Expected Console Output

### When Clicking Full View:
```
[FULL VIEW] Button clicked
[FULL VIEW] uploadedFiles: (8) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
[FULL VIEW] Total series count: 8
[FULL VIEW] Navigating to DICOM viewer with ALL series: {
  totalSeries: 8,
  seriesNames: ["Series 1", "Series 2", "Series 3", ...],
  totalFiles: 580
}
```

### When DicomViewerPage Loads:
```
[DICOM VIEWER] Has multiple series: true
[DICOM VIEWER] Total series count: 8
[DICOM VIEWER] Active series index: 0
[DICOM VIEWER] ✅ Files loaded successfully: 75 files
[DICOM VIEWER] 📊 Series breakdown: [
  {index: 0, name: "...", fileCount: 75, modality: "MR"},
  {index: 1, name: "...", fileCount: 60, modality: "MR"},
  ... (6 more)
]
```

## Visual Indicators

### Series Selector (Purple Gradient Box)
```
┌─────────────────────────┐
│  ◀  SERIES 3/8  ▶      │  ← Purple gradient background
└─────────────────────────┘
```

### Header Information
```
PATIENT - T1 AXIAL
Series 3 of 8 • Full Screen Diagnostic View • 75 Slices
```

### Slice Counter
```
┌─────────────────┐
│ SLICE: 25 / 75  │  ← Blue gradient (updates per series)
└─────────────────┘
```

## What to Check

### ✅ Series Navigation
- [ ] Can click ▶ to go to next series
- [ ] Can click ◀ to go to previous series
- [ ] Counter updates correctly (1/8, 2/8, 3/8, etc.)
- [ ] Buttons disable at boundaries

### ✅ Series Display
- [ ] Each series shows its own name
- [ ] Each series shows correct slice count
- [ ] Viewer updates when switching series
- [ ] No errors in console

### ✅ Slice Navigation
- [ ] Can scroll through slices in each series
- [ ] Slice counter resets when changing series
- [ ] Mouse wheel works for slice navigation
- [ ] Keyboard arrows work for slice navigation

### ✅ Tools Work
- [ ] Window/Level tool works on all series
- [ ] Zoom tool works on all series
- [ ] Measurements work on all series
- [ ] All tools reset properly when changing series

## Troubleshooting

### Issue: Series selector not showing
**Check**:
- Console log: `[DICOM VIEWER] Has multiple series: false`
- Verify `allSeries` is being passed in navigation state
- Check ReportingPage console for series count

**Fix**: Ensure Full View button is passing `allSeries` array

### Issue: Only seeing one series
**Check**:
- Console log: `[FULL VIEW] Total series count: 1`
- Verify all series have `rawFiles` populated
- Check if hydration completed for all series

**Fix**: Wait for all series to load before clicking Full View

### Issue: Viewer doesn't update when switching series
**Check**:
- Console log for series index changes
- Verify `key` prop on AdvancedDicomViewer
- Check if `currentFiles` is updating

**Fix**: Ensure `key={series-${activeSeriesIndex}}` is present

### Issue: Wrong slice count
**Check**:
- Console log: `[DICOM VIEWER] Current files:` length
- Verify each series has correct file count
- Check if files are being filtered

**Fix**: Verify `currentFiles` is using correct series

## Performance Check

### Expected Performance
- **Series switching**: < 500ms
- **Slice navigation**: Smooth, no lag
- **Tool activation**: Instant
- **Memory usage**: Stable (no leaks)

### Monitor Console
- No error messages
- No warning messages
- Clean series transitions
- Proper file counts

## Success Criteria

✅ **All 8 series accessible** via series selector
✅ **Navigation smooth** between series
✅ **Correct slice counts** for each series
✅ **Tools work** on all series
✅ **No console errors**
✅ **Clean UI** with proper indicators
✅ **Backward compatible** (single series still works)

## Report Issues

If you encounter problems, share:

1. **Console logs** (copy all `[FULL VIEW]` and `[DICOM VIEWER]` messages)
2. **Series count** (how many series you have)
3. **What's not working** (specific behavior)
4. **Screenshots** (if UI looks wrong)

## Example Test Case

### Study: Brain MRI with 8 Series
1. T1 AXIAL (75 slices)
2. T2 SAGITTAL (60 slices)
3. FLAIR (80 slices)
4. DWI (40 slices)
5. ADC (40 slices)
6. T1 POST CONTRAST (75 slices)
7. T2 CORONAL (65 slices)
8. SWI (50 slices)

**Total**: 485 slices across 8 series

### Expected Behavior
- Full View shows series selector: **SERIES 1/8**
- Can navigate through all 8 series
- Each series shows correct slice count
- Total of 485 slices accessible
- All tools work on all series

---

## Quick Reference

### Series Navigation
- **Next Series**: Click ▶ button
- **Previous Series**: Click ◀ button
- **Current Position**: Shows "SERIES X/Y"

### Slice Navigation
- **Next Slice**: Mouse wheel down / Arrow down
- **Previous Slice**: Mouse wheel up / Arrow up
- **Jump to Slice**: Click on slice indicator

### Back to Reporting
- **Back Button**: Top left corner (← BACK)
- **Returns to**: ReportingPage with same appointment

---

**Ready to test!** 🚀

Load your 8-series study and click Full View to see all series!
