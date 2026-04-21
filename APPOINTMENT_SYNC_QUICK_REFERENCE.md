# Appointment Sync - Quick Reference Card

**Last Updated:** April 21, 2026

---

## 🎯 Top 5 Sync Issues

| # | Issue | Impact | Priority | Est. Time |
|---|-------|--------|----------|-----------|
| 1 | **Status naming mismatch** | Filters broken, updates fail | 🔴 HIGH | 30 min |
| 2 | **Web app missing Edit** | Can't modify appointments | 🔴 HIGH | 1.5 hrs |
| 3 | **Web app missing Delete** | Can't cancel appointments | 🔴 HIGH | 30 min |
| 4 | **Patient data shows "N/A"** | Incomplete information | 🔴 HIGH | 1 hr |
| 5 | **Different creation UX** | Inconsistent experience | 🟡 MEDIUM | 1 hr |

---

## 📊 Status Value Mapping

### Current State (BROKEN)

```javascript
// Web App
BOOKED, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED

// Mobile App  
BOOKED, SCHEDULED, ARRIVED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED

// Backend API
scheduled, confirmed, in_progress, completed, cancelled
```

### Target State (FIXED)

```javascript
// ALL PLATFORMS - Use lowercase
scheduled, confirmed, in_progress, completed, cancelled
```

### Quick Fix

**Web App (`src/pages/AppointmentBoard.jsx`):**
```javascript
// BEFORE
const STATUS_META = {
  BOOKED: { ... },
  ARRIVED: { ... },
  IN_PROGRESS: { ... },
  COMPLETED: { ... },
  CANCELLED: { ... }
};

// AFTER
const STATUS_META = {
  scheduled: { icon: '📋', label: 'Scheduled', color: '#3498db' },
  confirmed: { icon: '📍', label: 'Confirmed', color: '#2ecc71' },
  in_progress: { icon: '⚡', label: 'In Progress', color: '#f39c12' },
  completed: { icon: '✅', label: 'Completed', color: '#27ae60' },
  cancelled: { icon: '⛔', label: 'Cancelled', color: '#e74c3c' }
};
```

**Mobile App (`1RadMobile/src/screens/AppointmentsScreen.js`):**
```javascript
// Update status transformation
const transformedAppointments = useMemo(() => {
  return appointments.map(apt => ({
    ...apt,
    status: apt.status.toLowerCase() // Ensure lowercase
  }));
}, [appointments]);
```

---

## 🔧 Missing Features Matrix

| Feature | Web | Mobile | Action Required |
|---------|-----|--------|-----------------|
| View appointments | ✅ | ✅ | None |
| Create appointment | ✅ | ✅ | Align payload |
| **Edit appointment** | ❌ | ✅ | **Add to web** |
| **Delete appointment** | ❌ | ✅ | **Add to web** |
| Update status | ✅ | ✅ | Fix status values |
| Search | ✅ | ✅ | None |
| Filter by status | ✅ | ✅ | Fix status values |
| Filter by modality | ✅ | ✅ | None |
| Filter by doctor | ✅ | ✅ | None |
| Patient creation | ✅ | ✅ | None |
| Token printing | ❌ | ✅ | Optional |
| Status pipeline | ❌ | ✅ | Add to web |

---

## 🚀 Quick Implementation Guide

### 1. Fix Status Values (30 min)

**File:** `src/pages/AppointmentBoard.jsx`

```javascript
// Step 1: Update STATUS_META constant
const STATUS_META = {
  scheduled: { icon: '📋', label: 'Scheduled', color: '#3498db', bg: '#e8f4fd' },
  confirmed: { icon: '📍', label: 'Confirmed', color: '#2ecc71', bg: '#e9f7ef' },
  in_progress: { icon: '⚡', label: 'In Progress', color: '#f39c12', bg: '#fef9e7' },
  completed: { icon: '✅', label: 'Completed', color: '#27ae60', bg: '#d5f5e3' },
  cancelled: { icon: '⛔', label: 'Cancelled', color: '#e74c3c', bg: '#fdedec' }
};

// Step 2: Update filter options
const statusOptions = [
  { value: 'ALL', label: 'All Status' },
  { value: 'scheduled', label: '📋 Scheduled' },
  { value: 'confirmed', label: '📍 Confirmed' },
  { value: 'in_progress', label: '⚡ In Progress' },
  { value: 'completed', label: '✅ Completed' },
  { value: 'cancelled', label: '⛔ Cancelled' }
];

// Step 3: Update status update function
const handleStatusUpdate = async (appointmentId, newStatus) => {
  await fetch(`/api/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newStatus.toLowerCase()) // Ensure lowercase
  });
};
```

### 2. Add Edit Functionality (1.5 hrs)

**File:** `src/pages/AppointmentBoard.jsx`

```javascript
// Step 1: Add edit state
const [editingAppointment, setEditingAppointment] = useState(null);

// Step 2: Add edit button to appointment row
<button 
  className="action-btn edit-btn"
  onClick={() => setEditingAppointment(appointment)}
>
  <Edit size={14} /> EDIT
</button>

// Step 3: Create edit modal (similar to booking modal)
{editingAppointment && (
  <div className="modal-overlay">
    <div className="edit-modal">
      <h2>Edit Appointment</h2>
      {/* Form fields */}
      <button onClick={handleUpdateAppointment}>Save Changes</button>
    </div>
  </div>
)}

// Step 4: Add update handler
const handleUpdateAppointment = async (appointmentId, updates) => {
  await fetch(`/api/appointments/${appointmentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  fetchAppointments(); // Refresh list
  setEditingAppointment(null);
};
```

### 3. Add Delete/Cancel (30 min)

**File:** `src/pages/AppointmentBoard.jsx`

```javascript
// Step 1: Add cancel button
<button 
  className="action-btn cancel-btn"
  onClick={() => handleCancelAppointment(appointment.id)}
>
  <X size={14} /> CANCEL
</button>

// Step 2: Add cancel handler with confirmation
const handleCancelAppointment = async (appointmentId) => {
  if (!confirm('Are you sure you want to cancel this appointment?')) {
    return;
  }
  
  await fetch(`/api/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify('cancelled')
  });
  
  fetchAppointments(); // Refresh list
};
```

### 4. Fix Patient Data (1 hr)

**Option A: Update Backend DTO (Preferred)**

```csharp
// AppointmentDto.cs
public class AppointmentDto
{
    // ... existing fields ...
    
    // ADD THESE:
    public int PatientAge { get; set; }
    public string PatientGender { get; set; }
    public string PatientMobile { get; set; }
    public string ReferredBy { get; set; }
    public string ReferredContact { get; set; }
}
```

**Option B: Fetch Patient Details Separately**

```javascript
// Mobile App - AppointmentsScreen.js
const transformedAppointments = useMemo(() => {
  return appointments.map(apt => {
    const patient = patients.find(p => p.id === apt.patientId);
    return {
      ...apt,
      patientAge: patient?.age || 'N/A',
      patientGender: patient?.gender || 'N/A',
      mobile: patient?.phone || 'N/A'
    };
  });
}, [appointments, patients]);
```

---

## 📋 Testing Checklist

### Quick Smoke Test (5 min)

```bash
# 1. Create appointment
✓ Web: Create appointment with new patient
✓ Mobile: Verify appointment appears
✓ Mobile: Verify all fields are correct

# 2. Update status
✓ Web: Change status to "confirmed"
✓ Mobile: Verify status updated
✓ Mobile: Change status to "in_progress"
✓ Web: Verify status updated

# 3. Edit appointment (after implementation)
✓ Web: Edit appointment details
✓ Mobile: Verify changes appear

# 4. Cancel appointment
✓ Web: Cancel appointment
✓ Mobile: Verify status is "cancelled"
```

### Full Regression Test (30 min)

- [ ] All status transitions work
- [ ] All filters work correctly
- [ ] Search works on both platforms
- [ ] Patient data displays correctly
- [ ] No console errors
- [ ] API calls succeed
- [ ] Data syncs in real-time

---

## 🐛 Common Issues & Fixes

### Issue: Status filter not working

**Cause:** Status values don't match between frontend and backend

**Fix:**
```javascript
// Ensure lowercase status values everywhere
filters.status.toLowerCase() === appointment.status.toLowerCase()
```

### Issue: Edit button not appearing

**Cause:** Missing edit functionality in web app

**Fix:** Follow "Add Edit Functionality" guide above

### Issue: Patient shows "N/A"

**Cause:** Backend DTO missing patient fields

**Fix:** Either update DTO or fetch patient details separately

### Issue: API call fails with 400

**Cause:** Incorrect payload format

**Fix:**
```javascript
// Ensure status is sent as quoted string
body: JSON.stringify("cancelled") // NOT { status: "cancelled" }
```

---

## 📞 Quick Contact

**Backend API Issues:** Check with backend team  
**Mobile App Issues:** Check `1RadMobile/src/screens/AppointmentsScreen.js`  
**Web App Issues:** Check `src/pages/AppointmentBoard.jsx`  
**Status Values:** Use lowercase: `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`

---

## 🎯 Success Metrics

✅ **Sync is working when:**
- Create appointment on web → appears on mobile instantly
- Update status on mobile → updates on web instantly
- Edit appointment on web → changes on mobile instantly
- All filters return same results on both platforms
- No "N/A" values in patient data
- No console errors
- All API calls succeed

---

**Print this card and keep it handy during implementation!**
