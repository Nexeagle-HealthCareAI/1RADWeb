# Mobile-Web Appointment Sync Analysis

**Date:** April 21, 2026  
**Scope:** Appointment management features across Mobile App and Web App  
**Status:** Analysis Complete - Ready for Implementation

---

## Executive Summary

This document analyzes the appointment management features in both the **Mobile App** (React Native) and **Web App** (React) to identify gaps, inconsistencies, and sync requirements. The goal is to ensure feature parity and consistent user experience across platforms.

### Key Findings

✅ **STRENGTHS:**
- Both apps use the same backend API (`/appointments`, `/patients`, `/personnel`)
- Mobile app has modern UI with tactical theme
- Web app has comprehensive filtering and status management
- Both support full CRUD operations

⚠️ **GAPS IDENTIFIED:**
- Mobile app missing several web app features (see detailed list below)
- Status naming inconsistencies between platforms
- Different appointment creation workflows
- Mobile app lacks some advanced filtering options
- Web app has more detailed patient information display

---

## Feature Comparison Matrix

| Feature | Web App | Mobile App | Status | Priority |
|---------|---------|------------|--------|----------|
| **View Appointments** | ✅ Table view | ✅ Card view | ✅ Synced | - |
| **Search Appointments** | ✅ By patient/mobile/ID | ✅ By patient/mobile/ID | ✅ Synced | - |
| **Filter by Status** | ✅ 7 statuses | ✅ 7 statuses | ⚠️ Naming diff | HIGH |
| **Filter by Modality** | ✅ 10 modalities | ✅ 10 modalities | ✅ Synced | - |
| **Filter by Doctor** | ✅ Yes | ✅ Yes | ✅ Synced | - |
| **Create Appointment** | ✅ Multi-step | ✅ 2-step modal | ⚠️ Different UX | MEDIUM |
| **Edit Appointment** | ❌ Missing | ✅ Full screen | ⚠️ Gap | HIGH |
| **Delete Appointment** | ❌ Missing | ✅ Via API | ⚠️ Gap | MEDIUM |
| **Status Updates** | ✅ Quick actions | ✅ Quick actions | ✅ Synced | - |
| **Patient Creation** | ✅ Inline | ✅ Inline | ✅ Synced | - |
| **Token Printing** | ❌ Missing | ✅ Thermal preview | ⚠️ Gap | LOW |
| **Statistics Dashboard** | ✅ KPI cards | ✅ Intel cards | ✅ Synced | - |
| **Pull to Refresh** | ❌ N/A | ✅ Yes | ✅ Mobile only | - |
| **Appointment Details** | ✅ Expandable | ✅ Expandable | ✅ Synced | - |
| **Status Pipeline** | ❌ Missing | ✅ Visual | ⚠️ Gap | LOW |
| **Date/Time Picker** | ✅ Native input | ✅ Native picker | ✅ Synced | - |
| **Modality Icons** | ❌ Text only | ✅ Emoji icons | ⚠️ Gap | LOW |
| **Responsive Design** | ✅ Mobile/Tablet | ❌ N/A | ✅ Web only | - |

---

## Detailed Gap Analysis

### 1. Status Naming Inconsistencies

**Issue:** Different status values used between platforms

**Web App Statuses:**
```javascript
BOOKED, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED
```

**Mobile App Statuses:**
```javascript
BOOKED, SCHEDULED, ARRIVED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED
```

**Backend API Statuses:**
```csharp
// From backend DTO
scheduled, confirmed, in_progress, completed, cancelled
```

**Impact:** 
- Status filters may not work correctly
- Status updates may fail
- UI displays inconsistent labels

**Recommendation:**
- Standardize on backend status values: `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`
- Update both apps to use lowercase status values
- Add status mapping layer if needed for backward compatibility

---

### 2. Web App Missing Edit/Delete Features

**Issue:** Web app `AppointmentBoard.jsx` does not have edit or delete functionality

**Mobile App Has:**
```javascript
// EditAppointmentScreen.js - Full edit screen
- Edit all appointment fields
- Update status
- Save changes via API

// AppointmentsScreen.js - Delete functionality
- Cancel appointment (status update)
- Delete appointment via API
```

**Web App Missing:**
- No edit button in appointment rows
- No delete/cancel button
- No edit modal or drawer

**Recommendation:**
- Add "Edit" button to web app appointment rows
- Create edit modal/drawer similar to booking modal
- Add "Cancel" button with confirmation dialog
- Implement delete API call

---

### 3. Mobile App Missing Token Printing on Web

**Issue:** Mobile app has thermal printer token preview, web app doesn't

**Mobile App Feature:**
```javascript
// Token printing with thermal preview (80mm)
- Token number display
- Patient information
- Mission details
- Print confirmation
```

**Web App Status:** Not implemented

**Recommendation:**
- LOW PRIORITY - This is a mobile-specific feature
- Web app could add "Print Token" button that opens print dialog
- Or skip this feature on web (admin users typically don't need tokens)

---

### 4. Different Appointment Creation Workflows

**Issue:** Different UX patterns for creating appointments

**Web App:**
```javascript
// Single-step modal with all fields visible
- Patient search/create
- Service/modality selection
- Doctor assignment
- Date/time selection
- Notes
- All in one scrollable form
```

**Mobile App:**
```javascript
// 2-step wizard
Step 1: Patient identification
  - Search existing patients
  - OR create new patient (full form)
  
Step 2: Mission configuration
  - Select modality (grid of cards)
  - Enter service/procedure
  - Schedule date/time
  - Assign doctor (grid of cards)
  - Add notes
```

**Recommendation:**
- Keep different UX patterns (optimized for each platform)
- Ensure both submit the same data structure to API
- Validate that all required fields are captured in both

---

### 5. Status Pipeline Visualization

**Issue:** Mobile app has visual status pipeline, web app doesn't

**Mobile App Feature:**
```javascript
// Visual pipeline in expanded appointment details
[BOOKED] ──> [ARRIVED] ──> [IN_PROGRESS] ──> [COMPLETED]
   ✓            ✓              ✓                ○
```

**Web App Status:** Not implemented

**Recommendation:**
- MEDIUM PRIORITY - Add to web app expanded details
- Helps users understand appointment workflow
- Visual feedback for current status

---

### 6. Patient Information Display

**Issue:** Different levels of patient detail shown

**Web App Shows:**
```javascript
- Patient Name
- Patient ID
- Mobile number
- Age
- Gender
- Referred by
- Referred contact
```

**Mobile App Shows:**
```javascript
- Patient Name
- Patient ID
- Mobile number
- Age (shows "N/A" - not in DTO)
- Gender (shows "N/A" - not in DTO)
```

**Recommendation:**
- Update backend DTO to include age and gender
- Update mobile app to display actual values
- Ensure consistent patient data across platforms

---

## API Integration Analysis

### Current API Endpoints Used

Both apps use the same endpoints:

```javascript
// Appointments
GET    /appointments          // Fetch all appointments
POST   /appointments          // Create appointment
PATCH  /appointments/{id}/status  // Update status
DELETE /appointments/{id}     // Delete appointment (mobile only)

// Patients
GET    /patients              // Fetch all patients
POST   /patients              // Create patient

// Personnel
GET    /personnel             // Fetch doctors/staff
```

### API Consistency Issues

1. **Status Update Format:**
   ```javascript
   // Mobile app sends
   PATCH /appointments/{id}/status
   Body: "COMPLETED" (string with quotes)
   
   // Web app should send same format
   ```

2. **Appointment Creation Payload:**
   ```javascript
   // Both apps should send
   {
     patientId: string,
     service: string,
     modality: string,
     dateTime: ISO string,
     type: "BOOKED",
     doctor: string,
     referredBy: string,
     referredContact: string,
     notes: string
   }
   ```

3. **Missing Fields in Response:**
   - Patient age not in appointment DTO
   - Patient gender not in appointment DTO
   - Need to either join patient data or add to DTO

---

## Data Model Comparison

### Web App Appointment Object

```javascript
{
  id: "APT001",
  appointmentId: "APT001",
  patientName: "John Doe",
  patientId: "P001",
  mobile: "9876543210",
  patientAge: "35",
  patientGender: "Male",
  status: "BOOKED",
  modality: "X-RAY",
  service: "Chest X-Ray",
  doctor: "Dr. Brown",
  referredBy: "Dr. Smith",
  referredContact: "9876543211",
  notes: "Urgent case",
  date: "04/21/2026",
  time: "10:30 AM",
  priority: "high"
}
```

### Mobile App Appointment Object

```javascript
{
  id: "APT001",
  appointmentId: "APT001",
  patientName: "John Doe",
  patientId: "P001",
  mobile: "9876543210",
  patientAge: "N/A",  // Not in DTO
  patientGender: "N/A",  // Not in DTO
  status: "BOOKED",
  modality: "X-RAY",
  service: "Chest X-Ray",
  doctor: "Dr. Brown",
  referredBy: "N/A",  // Not in DTO
  referredContact: "N/A",  // Not in DTO
  notes: "Urgent case",
  date: "04/21/2026",
  time: "10:30 AM",
  priority: "medium"  // Not in DTO
}
```

### Backend DTO (Inferred)

```csharp
public class AppointmentDto
{
    public string AppointmentId { get; set; }
    public string PatientId { get; set; }
    public string PatientName { get; set; }
    public string Service { get; set; }
    public string Modality { get; set; }
    public DateTime DateTime { get; set; }
    public string Status { get; set; }  // scheduled, confirmed, in_progress, completed, cancelled
    public string Doctor { get; set; }
    public string Notes { get; set; }
    
    // MISSING FIELDS:
    // - Patient age
    // - Patient gender
    // - Patient mobile
    // - Referred by
    // - Referred contact
    // - Priority
}
```

---

## Sync Requirements

### HIGH PRIORITY

1. **Standardize Status Values**
   - Update web app to use lowercase status values
   - Update mobile app status mapping
   - Ensure API accepts both formats (backward compatibility)

2. **Add Edit Functionality to Web App**
   - Create edit modal/drawer
   - Add edit button to appointment rows
   - Implement update API call
   - Match mobile app edit capabilities

3. **Add Delete/Cancel to Web App**
   - Add cancel button with confirmation
   - Implement status update to "cancelled"
   - Optional: Add hard delete functionality

4. **Fix Patient Data Display**
   - Update backend DTO to include patient age, gender, mobile
   - Update mobile app to display actual values instead of "N/A"
   - Ensure web app displays all patient fields

### MEDIUM PRIORITY

5. **Align Appointment Creation**
   - Ensure both apps send same payload structure
   - Validate all required fields are captured
   - Test end-to-end appointment creation

6. **Add Status Pipeline to Web App**
   - Implement visual status pipeline in expanded details
   - Match mobile app design
   - Improve user understanding of workflow

7. **Improve Filtering**
   - Ensure filter options match between platforms
   - Add "Clear Filters" button to web app
   - Sync filter state if needed

### LOW PRIORITY

8. **Add Modality Icons to Web App**
   - Use same emoji icons as mobile app
   - Improve visual recognition

9. **Token Printing on Web**
   - Add print token button (optional)
   - Open browser print dialog
   - Or skip this feature (admin-focused)

---

## Implementation Roadmap

### Phase 1: Critical Fixes (2-3 hours)

**Goal:** Fix breaking issues and data inconsistencies

1. **Standardize Status Values** (30 min)
   - Update `src/pages/AppointmentBoard.jsx` status constants
   - Update status filter options
   - Update status update API calls
   - Test status transitions

2. **Fix Patient Data Display** (1 hour)
   - Update backend DTO (if access available)
   - OR fetch patient details separately
   - Update mobile app to show real values
   - Update web app to handle missing fields

3. **Add Edit Functionality to Web App** (1-1.5 hours)
   - Create `EditAppointmentModal.jsx` component
   - Add edit button to appointment rows
   - Implement form with all fields
   - Add update API call
   - Test edit flow

### Phase 2: Feature Parity (2-3 hours)

**Goal:** Ensure both platforms have same core features

4. **Add Delete/Cancel to Web App** (30 min)
   - Add cancel button to appointment rows
   - Add confirmation dialog
   - Implement status update to "cancelled"
   - Test cancel flow

5. **Add Status Pipeline to Web App** (1 hour)
   - Create status pipeline component
   - Add to expanded appointment details
   - Style to match mobile app
   - Test visual display

6. **Align Appointment Creation** (1 hour)
   - Review both creation flows
   - Ensure payload structure matches
   - Test end-to-end creation
   - Fix any discrepancies

### Phase 3: Polish & Enhancements (1-2 hours)

**Goal:** Improve UX and visual consistency

7. **Add Modality Icons to Web App** (30 min)
   - Add emoji icons to modality display
   - Update modality filter dropdown
   - Update appointment cards

8. **Improve Filtering** (30 min)
   - Add "Clear Filters" button
   - Improve filter UI
   - Test filter combinations

9. **Documentation** (30 min)
   - Update API documentation
   - Create sync testing checklist
   - Document status workflow

---

## Testing Checklist

### Appointment Creation
- [ ] Create appointment with existing patient (web)
- [ ] Create appointment with existing patient (mobile)
- [ ] Create appointment with new patient (web)
- [ ] Create appointment with new patient (mobile)
- [ ] Verify appointment appears in both apps
- [ ] Verify all fields are saved correctly

### Appointment Updates
- [ ] Update appointment status (web)
- [ ] Update appointment status (mobile)
- [ ] Edit appointment details (mobile)
- [ ] Edit appointment details (web - after implementation)
- [ ] Verify changes sync across platforms

### Appointment Deletion
- [ ] Cancel appointment (web - after implementation)
- [ ] Cancel appointment (mobile)
- [ ] Delete appointment (mobile)
- [ ] Verify deletion syncs across platforms

### Filtering & Search
- [ ] Search by patient name (web)
- [ ] Search by patient name (mobile)
- [ ] Search by mobile number (web)
- [ ] Search by mobile number (mobile)
- [ ] Filter by status (web)
- [ ] Filter by status (mobile)
- [ ] Filter by modality (web)
- [ ] Filter by modality (mobile)
- [ ] Filter by doctor (web)
- [ ] Filter by doctor (mobile)
- [ ] Clear all filters (web)
- [ ] Clear all filters (mobile)

### Status Transitions
- [ ] BOOKED → ARRIVED (web)
- [ ] BOOKED → ARRIVED (mobile)
- [ ] ARRIVED → IN_PROGRESS (web)
- [ ] ARRIVED → IN_PROGRESS (mobile)
- [ ] IN_PROGRESS → COMPLETED (web)
- [ ] IN_PROGRESS → COMPLETED (mobile)
- [ ] Any status → CANCELLED (web)
- [ ] Any status → CANCELLED (mobile)

### Data Consistency
- [ ] Patient information matches across platforms
- [ ] Appointment details match across platforms
- [ ] Status values are consistent
- [ ] Date/time formats are consistent
- [ ] Doctor assignments match

---

## Files to Modify

### Web App Files

1. **`src/pages/AppointmentBoard.jsx`** (MODIFY)
   - Update status constants to lowercase
   - Add edit button to appointment rows
   - Add cancel button to appointment rows
   - Create edit modal/drawer
   - Add status pipeline to expanded details
   - Add modality icons
   - Add "Clear Filters" button

2. **`src/components/EditAppointmentModal.jsx`** (CREATE)
   - New component for editing appointments
   - Form with all appointment fields
   - Update API call
   - Validation

3. **`src/styles/AppointmentBoard.css`** (MODIFY)
   - Add styles for edit modal
   - Add styles for status pipeline
   - Add styles for new buttons

### Mobile App Files

4. **`1RadMobile/src/screens/AppointmentsScreen.js`** (MODIFY)
   - Update status mapping to match backend
   - Fix patient data display (remove "N/A" placeholders)
   - Ensure API calls use correct status format

5. **`1RadMobile/src/context/AppointmentContext.js`** (MODIFY)
   - Update status values in API calls
   - Ensure consistent data transformation

### Backend Files (If Access Available)

6. **`AppointmentDto.cs`** (MODIFY)
   - Add patient age field
   - Add patient gender field
   - Add patient mobile field
   - Add referred by field
   - Add referred contact field
   - Add priority field

---

## Risk Assessment

### High Risk
- **Status value changes** - Could break existing appointments
  - **Mitigation:** Add backward compatibility layer, test thoroughly

### Medium Risk
- **API payload changes** - Could cause validation errors
  - **Mitigation:** Test with backend team, add error handling

### Low Risk
- **UI changes** - Minimal impact on functionality
  - **Mitigation:** Test on multiple screen sizes

---

## Success Criteria

✅ **Feature Parity Achieved When:**
1. Both apps can create, read, update, and delete appointments
2. Status values are consistent across platforms
3. Patient data displays correctly in both apps
4. Filtering works identically in both apps
5. All appointment fields are captured and displayed
6. Status transitions work the same way
7. No data loss when syncing between platforms

✅ **Testing Complete When:**
1. All items in testing checklist are verified
2. No console errors in either app
3. API calls succeed consistently
4. Data syncs correctly across platforms
5. User workflows are smooth and intuitive

---

## Next Steps

1. **Review this analysis** with the team
2. **Prioritize implementation** based on business needs
3. **Start with Phase 1** (critical fixes)
4. **Test thoroughly** after each phase
5. **Deploy incrementally** to minimize risk
6. **Monitor for issues** after deployment

---

## Questions for Team

1. Do we have access to modify the backend DTO?
2. What is the preferred status value format (uppercase vs lowercase)?
3. Should web app have token printing feature?
4. Are there any other appointment features planned?
5. What is the timeline for implementing these changes?

---

**Document Version:** 1.0  
**Last Updated:** April 21, 2026  
**Author:** Kiro AI Assistant  
**Status:** Ready for Review
