# Fix: Foreign Key Constraint Error on File Upload

## Error
```
SqlException: The INSERT statement conflicted with the FOREIGN KEY constraint 
"FK_StudyAssets_Hospitals". The conflict occurred in database "1RadDatabase", 
table "dbo.Hospitals", column 'HospitalId'.
```

## Root Cause
When uploading files (DICOM, images, etc.), the backend is trying to insert a `StudyAsset` record with a `HospitalId` that either:
1. Is NULL
2. Doesn't exist in the `Hospitals` table
3. Is invalid or orphaned

## Solution

### Option 1: Backend Fix (Recommended)
The backend controller handling `/Study/upload` needs to:

1. **Get the HospitalId from the appointment/user context**
```csharp
// In your StudyController.cs
[HttpPost("upload")]
public async Task<IActionResult> UploadStudyAsset(
    [FromForm] IFormFile file,
    [FromForm] string appointmentId)
{
    try
    {
        // Get appointment with hospital info
        var appointment = await _context.Appointments
            .Include(a => a.Patient)
            .Include(a => a.Hospital)
            .FirstOrDefaultAsync(a => a.Id == appointmentId);

        if (appointment == null)
            return BadRequest("Appointment not found");

        // CRITICAL: Ensure HospitalId is set
        if (string.IsNullOrEmpty(appointment.HospitalId))
            return BadRequest("Appointment is not associated with a hospital");

        // Create StudyAsset with valid HospitalId
        var studyAsset = new StudyAsset
        {
            Id = Guid.NewGuid().ToString(),
            AppointmentId = appointmentId,
            HospitalId = appointment.HospitalId,  // ← Use from appointment
            FileName = file.FileName,
            FileType = Path.GetExtension(file.FileName),
            FileSize = file.Length,
            BlobUrl = await UploadToBlob(file),
            CreatedAt = DateTime.UtcNow
        };

        _context.StudyAssets.Add(studyAsset);
        await _context.SaveChangesAsync();

        return Ok(new { success = true, assetId = studyAsset.Id });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "File upload failed");
        return StatusCode(500, new { success = false, error = ex.Message });
    }
}
```

2. **Validate Hospital exists before upload**
```csharp
// Ensure hospital exists
var hospital = await _context.Hospitals
    .FirstOrDefaultAsync(h => h.Id == appointment.HospitalId);

if (hospital == null)
    return BadRequest("Hospital not found for this appointment");
```

### Option 2: Frontend Fix (Temporary)
If you can't modify the backend immediately, ensure the appointment has a valid hospital:

```javascript
// In ReportingPage.jsx or TechnicianPage.jsx
const handleAssetUpload = async (file) => {
    // Validate appointment has hospital
    if (!activeAppointment?.hospitalId) {
        alert('ERROR: Appointment is not associated with a hospital. Please contact administrator.');
        return;
    }

    const formData = new FormData();
    formData.append('AppointmentId', activeAppointment.appointmentId);
    formData.append('HospitalId', activeAppointment.hospitalId);  // ← Add this
    formData.append('File', file);

    try {
        const response = await apiClient.post('/Study/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        // Handle success
    } catch (error) {
        console.error('Upload failed:', error);
        alert('Upload failed: ' + error.response?.data?.error);
    }
};
```

### Option 3: Database Fix (If needed)
If appointments are missing HospitalId values:

```sql
-- Check for appointments without HospitalId
SELECT COUNT(*) FROM Appointments WHERE HospitalId IS NULL;

-- If found, update them to a valid hospital
UPDATE Appointments 
SET HospitalId = (SELECT TOP 1 Id FROM Hospitals)
WHERE HospitalId IS NULL;

-- Verify the fix
SELECT AppointmentId, HospitalId FROM Appointments WHERE HospitalId IS NULL;
```

## Verification Steps

1. **Check Appointment Data**
   - Ensure each appointment has a valid `HospitalId`
   - Verify the `HospitalId` exists in the `Hospitals` table

2. **Check Hospital Data**
   - Ensure at least one hospital exists in the database
   ```sql
   SELECT * FROM Hospitals;
   ```

3. **Test Upload**
   - Try uploading a file again
   - Should now succeed without foreign key error

## Prevention

1. **Always validate HospitalId before creating StudyAsset**
2. **Add database constraints to prevent NULL HospitalId in Appointments**
3. **Add API validation to reject uploads without valid hospital context**
4. **Log all upload attempts with hospital information for debugging**

## Files to Modify

### Backend (C# .NET)
- `Controllers/StudyController.cs` - Add HospitalId validation
- `Models/StudyAsset.cs` - Ensure HospitalId is required
- `Data/ApplicationDbContext.cs` - Verify foreign key configuration

### Frontend (React)
- `src/pages/ReportingPage.jsx` - Add hospital validation before upload
- `src/pages/TechnicianPage.jsx` - Add hospital validation before upload

## Status
⚠️ **REQUIRES BACKEND CHANGES** - This is a database constraint issue that needs backend fix

## Next Steps
1. Implement the backend fix in your StudyController
2. Ensure all appointments have valid HospitalId values
3. Test file upload again
4. Monitor logs for any similar errors
