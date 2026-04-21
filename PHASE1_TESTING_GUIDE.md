# Phase 1 Testing Guide

**Quick testing checklist for appointment sync Phase 1 implementation**

---

## 🧪 Quick Smoke Test (5 minutes)

### 1. Status Values Test
```bash
# Web App
1. Open web app appointment board
2. Check that status badges show: Scheduled, Confirmed, In Progress, Completed, Cancelled
3. Click status filter dropdown - verify lowercase options
4. Create new appointment - verify it shows as "Scheduled"

# Mobile App
1. Open mobile app appointments screen
2. Check that status badges match web app
3. Verify filter dropdown shows same status options
4. Create new appointment - verify it shows as "Scheduled"
```

### 2. Edit Functionality Test
```bash
# Web App Only
1. Find a scheduled or confirmed appointment
2. Click the edit button (✏️ yellow button)
3. Edit modal should open with pre-filled data
4. Change service name
5. Click "SAVE CHANGES"
6. Verify appointment updates immediately
7. Refresh page - verify changes persisted
```

### 3. Cancel Confirmation Test
```bash
# Web App
1. Find a scheduled appointment
2. Click cancel button (❌ red button)
3. Confirmation dialog should appear
4. Click "Cancel" in dialog - nothing should happen
5. Click cancel button again
6. Click "OK" in dialog - appointment should be cancelled
7. Verify status changed to "Cancelled"
```

---

## 🔍 Detailed Testing (30 minutes)

### Status Synchronization

**Test 1: Create Appointment on Web**
1. Open web app
2. Click "+ NEW MISSION"
3. Fill in patient details
4. Complete booking
5. Note the appointment ID
6. Open mobile app
7. Verify appointment appears with status "scheduled"
8. Verify all details match

**Test 2: Update Status on Mobile**
1. Open mobile app
2. Find a scheduled appointment
3. Click "CONFIRM" button
4. Status should change to "confirmed"
5. Open web app
6. Verify same appointment shows "Confirmed" status
7. Verify status badge color matches

**Test 3: Update Status on Web**
1. Open web app
2. Find a confirmed appointment
3. Click "BEGIN SCAN" button
4. Status should change to "in_progress"
5. Open mobile app
6. Verify same appointment shows "In Progress" status
7. Verify status pipeline shows correct progress

### Edit Functionality

**Test 4: Edit Service Name**
1. Open web app
2. Find any non-completed appointment
3. Click edit button (✏️)
4. Change service from "Chest X-Ray" to "Chest X-Ray with Lateral"
5. Click "SAVE CHANGES"
6. Verify service name updated
7. Open mobile app
8. Verify service name matches

**Test 5: Edit Doctor Assignment**
1. Open web app
2. Find any appointment
3. Click edit button
4. Change doctor from dropdown
5. Save changes
6. Verify doctor name updated
7. Check mobile app - verify doctor matches

**Test 6: Edit Validation**
1. Open web app
2. Click edit on any appointment
3. Clear the service field
4. Try to save
5. Should show validation error
6. Clear the doctor field
7. Try to save
8. Should show validation error

**Test 7: Edit Cancel**
1. Open web app
2. Click edit on any appointment
3. Make some changes
4. Click "CANCEL" button
5. Modal should close
6. Verify changes were NOT saved

### Cancel Confirmation

**Test 8: Cancel with Confirmation**
1. Open web app
2. Find a scheduled appointment
3. Note the appointment ID and patient name
4. Click cancel button (❌)
5. Confirmation dialog should show:
   - Appointment ID
   - Patient name
   - Warning message
6. Click "OK"
7. Appointment should be cancelled
8. Verify status changed to "Cancelled"

**Test 9: Cancel Declined**
1. Open web app
2. Find a scheduled appointment
3. Click cancel button
4. Click "Cancel" in confirmation dialog
5. Appointment should NOT be cancelled
6. Verify status unchanged

### Filter Testing

**Test 10: Status Filter on Web**
1. Open web app
2. Click status filter dropdown
3. Select "Scheduled"
4. Verify only scheduled appointments show
5. Select "Confirmed"
6. Verify only confirmed appointments show
7. Select "All Status"
8. Verify all appointments show

**Test 11: Status Filter on Mobile**
1. Open mobile app
2. Tap status filter
3. Select "Scheduled"
4. Verify only scheduled appointments show
5. Select "In Progress"
6. Verify only in-progress appointments show
7. Select "All Status"
8. Verify all appointments show

---

## 🚨 Error Scenarios

### Test 12: Network Failure During Edit
1. Open web app
2. Open browser DevTools
3. Go to Network tab
4. Set throttling to "Offline"
5. Try to edit an appointment
6. Should show error message
7. Set throttling back to "Online"
8. Try again - should succeed

### Test 13: Invalid Data
1. Open web app
2. Edit an appointment
3. Try to enter very long service name (>500 chars)
4. Try to save
5. Should handle gracefully

### Test 14: Concurrent Edits
1. Open web app in two browser tabs
2. Edit same appointment in both tabs
3. Save in first tab
4. Save in second tab
5. Verify last save wins
6. No data corruption

---

## ✅ Pass Criteria

### Status Values
- [ ] All status labels are lowercase in code
- [ ] All status labels display correctly in UI
- [ ] Status filters work on both platforms
- [ ] Status updates succeed on both platforms
- [ ] New appointments created with 'scheduled' status
- [ ] Status pipeline shows correct progression

### Edit Functionality
- [ ] Edit button appears on eligible appointments
- [ ] Edit modal opens with correct data
- [ ] All fields are editable
- [ ] Required field validation works
- [ ] Save updates appointment successfully
- [ ] Changes sync to mobile app
- [ ] Cancel closes modal without saving

### Cancel Confirmation
- [ ] Confirmation dialog appears
- [ ] Dialog shows correct information
- [ ] Confirming cancels appointment
- [ ] Declining keeps appointment
- [ ] Status updates to 'cancelled'

### Cross-Platform Sync
- [ ] Create on web → appears on mobile
- [ ] Create on mobile → appears on web
- [ ] Edit on web → updates on mobile
- [ ] Status change on web → updates on mobile
- [ ] Status change on mobile → updates on web
- [ ] No data loss or corruption

---

## 🐛 Bug Report Template

If you find issues, report using this template:

```markdown
**Bug Title:** [Brief description]

**Severity:** Critical / High / Medium / Low

**Platform:** Web / Mobile / Both

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Screenshots:**
[If applicable]

**Console Errors:**
[Any error messages]

**Environment:**
- Browser/Device: 
- OS: 
- App Version: 
```

---

## 📊 Test Results Template

```markdown
## Test Results - Phase 1

**Date:** [Date]
**Tester:** [Name]
**Environment:** Staging / Production

### Quick Smoke Test
- [ ] Status Values Test - PASS / FAIL
- [ ] Edit Functionality Test - PASS / FAIL
- [ ] Cancel Confirmation Test - PASS / FAIL

### Detailed Testing
- [ ] Test 1: Create on Web - PASS / FAIL
- [ ] Test 2: Update on Mobile - PASS / FAIL
- [ ] Test 3: Update on Web - PASS / FAIL
- [ ] Test 4: Edit Service - PASS / FAIL
- [ ] Test 5: Edit Doctor - PASS / FAIL
- [ ] Test 6: Edit Validation - PASS / FAIL
- [ ] Test 7: Edit Cancel - PASS / FAIL
- [ ] Test 8: Cancel Confirmed - PASS / FAIL
- [ ] Test 9: Cancel Declined - PASS / FAIL
- [ ] Test 10: Filter Web - PASS / FAIL
- [ ] Test 11: Filter Mobile - PASS / FAIL

### Error Scenarios
- [ ] Test 12: Network Failure - PASS / FAIL
- [ ] Test 13: Invalid Data - PASS / FAIL
- [ ] Test 14: Concurrent Edits - PASS / FAIL

### Overall Result
- [ ] ALL TESTS PASSED ✅
- [ ] SOME TESTS FAILED ⚠️
- [ ] CRITICAL FAILURES ❌

**Notes:**
[Any additional observations]

**Bugs Found:**
[List any bugs discovered]

**Recommendations:**
[Any suggestions for improvement]
```

---

## 🎯 Success Metrics

**Phase 1 is successful if:**
- ✅ All status values are consistent
- ✅ Edit functionality works without errors
- ✅ Cancel confirmation prevents accidents
- ✅ Data syncs correctly between platforms
- ✅ No console errors
- ✅ No data loss or corruption
- ✅ User experience is smooth

---

**Happy Testing! 🧪**
