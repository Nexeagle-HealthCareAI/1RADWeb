const fs = require('fs');

const targetFilePath = 'c:\\Users\\mtnoo\\OneDrive\\Desktop\\1Rad\\easyrad\\src\\pages\\AppointmentBoard.jsx';
let content = fs.readFileSync(targetFilePath, 'utf8');

// Normalize line endings to LF to perform replacements safely
const originalEnding = content.includes('\r\n') ? '\r\n' : '\n';
content = content.replace(/\r\n/g, '\n');

// 1. Add ownerDetails state definition right before fetchReferrers (around line 235)
const targetStateAnchor = "  const [doctors, setDoctors] = useState([]);";
const stateInjection = "\n  const [ownerDetails, setOwnerDetails] = useState(null);";

if (content.includes(targetStateAnchor)) {
  content = content.replace(targetStateAnchor, `${targetStateAnchor}${stateInjection}`);
  console.log('Successfully injected ownerDetails state.');
} else {
  console.log('WARNING: Could not find targetStateAnchor in AppointmentBoard.jsx.');
}

// 2. Fetch owner details inside fetchDoctors (around line 250)
const oldFetchDoctors = `  const fetchDoctors = useCallback(async () => {
    try {
      const response = await apiClient.get('/personnel');
      const allPersonnel = response.data;
      // Filter for roles: admindoctor or doctor (case-insensitive)
      const specialists = allPersonnel.filter(p => 
        p.roles && p.roles.some(role => 
          role.toLowerCase() === 'doctor' || role.toLowerCase() === 'admindoctor'
        )
      ).map(p => p.fullName);
      setDoctors(specialists);
    } catch (error) {`;

const newFetchDoctors = `  const fetchDoctors = useCallback(async () => {
    try {
      const response = await apiClient.get('/personnel');
      const allPersonnel = response.data;
      
      let owner = allPersonnel.find(u => {
        const roles = (u.roles || u.Roles || []).map(r => r.toLowerCase());
        return roles.includes('admindoctor');
      });
      if (!owner) {
        owner = allPersonnel.find(u => {
          const roles = (u.roles || u.Roles || []).map(r => r.toLowerCase());
          return roles.includes('admin');
        });
      }
      if (owner) {
        setOwnerDetails({
          name: owner.fullName || owner.FullName || 'Owner',
          contact: owner.mobile || owner.Mobile || owner.phoneNumber || owner.PhoneNumber || '+91 XXXXXXXXXX',
          email: owner.email || owner.Email || 'contact@1rad.health'
        });
      }

      // Filter for roles: admindoctor or doctor (case-insensitive)
      const specialists = allPersonnel.filter(p => 
        p.roles && p.roles.some(role => 
          role.toLowerCase() === 'doctor' || role.toLowerCase() === 'admindoctor'
        )
      ).map(p => p.fullName);
      setDoctors(specialists);
    } catch (error) {`;

if (content.includes(oldFetchDoctors)) {
  content = content.replace(oldFetchDoctors, newFetchDoctors);
  console.log('Successfully updated fetchDoctors logic.');
} else {
  console.log('WARNING: Could not find oldFetchDoctors.');
}

// 3. Update handlePrintA4 center info (around line 715)
const oldPrintHeader = `             <div class="hospital-info">
               <div style="font-size: 24px; color: #0f52ba;">\${(activeCenter?.hospitalName || '1RAD DIAGNOSTIC HUB').toUpperCase()}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 5px;">\${activeCenter?.address || 'Strategic Healthcare Node'}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500;">Contact: \${activeCenter?.contactNo || '+91 XXXXXXXXXX'}</div>
             </div>`;

const newPrintHeader = `             <div class="hospital-info">
               <div style="font-size: 24px; color: #0f52ba;">\${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTIC HUB').toUpperCase()}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 5px;">\${activeCenter?.address || 'Strategic Healthcare Node'}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500;">Contact: \${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | Email: \${ownerDetails?.email || 'contact@1rad.health'}</div>
               <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-top: 4px;">REPRESENTATIVE: \${ownerDetails?.name || 'ADMINISTRATOR'}</div>
             </div>`;

if (content.includes(oldPrintHeader)) {
  content = content.replace(oldPrintHeader, newPrintHeader);
  console.log('Successfully updated AppointmentBoard handlePrintA4 header.');
} else {
  console.log('WARNING: Could not find AppointmentBoard oldPrintHeader.');
}

// 4. Update handlePrintA4 patient reference box (around line 725)
const oldPatientBox = `          <div class="patient-box">
             <div style="font-size: 10px; font-weight: 950; color: #64748b; margin-bottom: 8px;">BILL_TO_PATIENT:</div>
             <div style="font-size: 18px; font-weight: 950;">\${(inv.patientName || 'N/A').toUpperCase()}</div>
             <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Clinical Reference: \${inv.patientId || 'N/A'}</div>
          </div>`;

const newPatientBox = `          <div class="patient-box">
             <div style="font-size: 10px; font-weight: 950; color: #64748b; margin-bottom: 8px;">BILL_TO_PATIENT:</div>
             <div style="font-size: 18px; font-weight: 950;">\${(inv.patientName || 'N/A').toUpperCase()}</div>
             <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Patient ID: \address\${inv.patientIdentifier || inv.ptid || inv.patientId || 'N/A'}</div>
             <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Ref. No (Referred By): \${inv.referrerName || inv.referenceNumber || 'N/A'}</div>
          </div>`;

// Wait, let's make sure the "\address" is not added, let's fix that backslash character:
const correctedNewPatientBox = `          <div class="patient-box">
             <div style="font-size: 10px; font-weight: 950; color: #64748b; margin-bottom: 8px;">BILL_TO_PATIENT:</div>
             <div style="font-size: 18px; font-weight: 950;">\${(inv.patientName || 'N/A').toUpperCase()}</div>
             <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Patient ID: \${inv.patientIdentifier || inv.ptid || inv.patientId || 'N/A'}</div>
             <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Ref. No (Referred By): \${inv.referrerName || inv.referenceNumber || 'N/A'}</div>
          </div>`;

if (content.includes(oldPatientBox)) {
  content = content.replace(oldPatientBox, correctedNewPatientBox);
  console.log('Successfully updated AppointmentBoard handlePrintA4 patient reference box.');
} else {
  console.log('WARNING: Could not find AppointmentBoard oldPatientBox.');
}

// Write the finalized contents back with the correct line endings
if (originalEnding === '\r\n') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(targetFilePath, content, 'utf8');
console.log('All changes applied successfully to AppointmentBoard.jsx.');
