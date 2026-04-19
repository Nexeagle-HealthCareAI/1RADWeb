# 1RAD Mobile App - API Endpoints Quick Reference

**Base URL:** `https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1`

---

## Authentication Endpoints

### 1. Send OTP
```http
POST /auth/otp/send
Content-Type: application/json

{
  "mobile": "9876543210"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### 2. Verify OTP
```http
POST /auth/otp/verify
Content-Type: application/json

{
  "identifier": "9876543210",
  "otp": "123456"
}
```

**Response (Existing User):**
```json
{
  "type": "Login",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "9876543210",
    "roles": ["admin"]
  }
}
```

**Response (New User):**
```json
{
  "type": "Register",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 3. Password Login
```http
POST /auth/login
Content-Type: application/json

{
  "identifier": "john@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "user": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "9876543210",
    "roles": ["admin", "admindoctor"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "centers": [
    {
      "id": "center-uuid",
      "name": "City Radiology Center",
      "address": "123 Main St"
    }
  ],
  "activeCenter": {
    "id": "center-uuid",
    "name": "City Radiology Center"
  }
}
```

---

### 4. Identity Setup (Registration Stage 2)
```http
POST /auth/identity-setup
Authorization: Bearer <token-from-otp-verify>
Content-Type: application/json

{
  "fullName": "Dr. John Smith",
  "email": "john@example.com",
  "mobile": "9876543210",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 5. Deploy Infrastructure (Registration Stage 3)
```http
POST /auth/deploy-infrastructure
Authorization: Bearer <token-from-identity-setup>
Content-Type: application/json

{
  "centerName": "City Radiology Center",
  "centerAddress": "123 Main Street, City, State - 123456",
  "gstinNumber": "22AAAAA0000A1Z5",
  "registrationNumber": "REG-12345",
  "panNumber": "ABCDE1234F",
  "nabhNumber": "NABH-001",
  "specialization": "Radiology",
  "degree": "MD Radiology",
  "licenseNo": "MED-12345"
}
```

**Response:**
```json
{
  "success": true,
  "centerId": "center-uuid"
}
```

---

## Appointment Endpoints

### 1. Fetch Appointments
```http
GET /appointments?status=BOOKED&date=2026-04-19
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "appointmentId": "APT-001",
    "patientId": "PAT-001",
    "patientName": "John Doe",
    "service": "Chest X-Ray with Lateral View",
    "modality": "X-RAY",
    "status": "BOOKED",
    "doctor": "Dr. Smith",
    "dateTime": "2026-04-19T10:00:00Z",
    "notes": "Urgent case - suspected pneumonia"
  }
]
```

---

### 2. Create Appointment
```http
POST /appointments
Authorization: Bearer <token>
Content-Type: application/json

{
  "patientId": "PAT-001",
  "service": "Chest X-Ray with Lateral View",
  "modality": "X-RAY",
  "dateTime": "2026-04-19T10:00:00Z",
  "type": "BOOKED",
  "doctor": "Dr. Smith",
  "notes": "Urgent case"
}
```

**Response:**
```json
{
  "appointmentId": "APT-002",
  "patientId": "PAT-001",
  "patientName": "John Doe",
  "service": "Chest X-Ray with Lateral View",
  "modality": "X-RAY",
  "status": "BOOKED",
  "doctor": "Dr. Smith",
  "dateTime": "2026-04-19T10:00:00Z",
  "notes": "Urgent case"
}
```

---

### 3. Update Appointment Status
```http
PATCH /appointments/APT-001/status
Authorization: Bearer <token>
Content-Type: application/json

"CONFIRMED"
```

**Note:** The body is a JSON string, not an object.

**Response:**
```json
{
  "success": true
}
```

**Valid Status Values:**
- `BOOKED` / `SCHEDULED`
- `CONFIRMED` / `ARRIVED`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

---

### 4. Delete Appointment
```http
DELETE /appointments/APT-001
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

---

## Patient Endpoints

### 1. Fetch Patients
```http
GET /patients?search=john
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "patientId": "PAT-001",
    "fullName": "John Doe",
    "mobile": "9876543210",
    "age": 45,
    "gender": "Male",
    "village": "Downtown",
    "district": "Central District",
    "address": "123 Main St, City",
    "referredBy": "Dr. Michael Chen",
    "sourceOfInfo": "+91-9876543210"
  }
]
```

---

### 2. Create Patient
```http
POST /patients
Authorization: Bearer <token>
Content-Type: application/json

{
  "fullName": "Jane Smith",
  "mobile": "9876543211",
  "age": 32,
  "gender": "Female",
  "village": "Uptown",
  "district": "North District",
  "address": "456 Oak Ave, City",
  "referredBy": "Dr. Sarah Johnson",
  "sourceOfInfo": "+91-9876543212"
}
```

**Response:**
```json
{
  "patientId": "PAT-002",
  "fullName": "Jane Smith",
  "mobile": "9876543211",
  ...
}
```

---

## Personnel Endpoints

### 1. Fetch Personnel
```http
GET /personnel
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "fullName": "Dr. Sarah Johnson",
    "email": "sarah@example.com",
    "mobile": "9876543210",
    "roles": ["doctor"],
    "specialization": "Radiology",
    "degree": "MD Radiology",
    "licenseNo": "MED-12345",
    "status": "active",
    "lastLogin": "2026-04-19T08:00:00Z",
    "password": "Secure@123"
  }
]
```

---

### 2. Create Personnel
```http
POST /personnel
Authorization: Bearer <token>
Content-Type: application/json

{
  "fullName": "Dr. Mike Brown",
  "email": "mike@example.com",
  "mobile": "9876543211",
  "roleNames": ["doctor"],
  "password": "Secure@123"
}
```

**Response:**
```json
{
  "userId": "new-user-uuid",
  "fullName": "Dr. Mike Brown",
  ...
}
```

**Valid Role Names:**
- `admindoctor` - Chief Medical Officer
- `admin` - Operations Director
- `doctor` - Diagnostic Consultant
- `technician` - Imaging Specialist
- `receptionist` - Intake Coordinator

---

### 3. Update Personnel
```http
PUT /personnel/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
Content-Type: application/json

{
  "fullName": "Dr. Mike Brown Jr.",
  "email": "mike@example.com",
  "mobile": "9876543211",
  "roleNames": ["admindoctor"]
}
```

**Response:**
```json
{
  "success": true
}
```

---

### 4. Delete Personnel
```http
DELETE /personnel/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

---

## Hospital Configuration Endpoints

### 1. Fetch Hospital Config
```http
GET /hospitals/center-uuid
Authorization: Bearer <token>
```

**Response:**
```json
{
  "hospitalName": "City Radiology Center",
  "hospitalAddress": "123 Main Street, City, State - 123456",
  "gstin": "22AAAAA0000A1Z5",
  "registrationNumber": "REG-12345",
  "pan": "ABCDE1234F",
  "nabhNumber": "NABH-001"
}
```

---

### 2. Update Hospital Config
```http
PUT /hospitals/center-uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "hospitalName": "City Radiology Center",
  "hospitalAddress": "123 Main Street, City, State - 123456",
  "gstin": "22AAAAA0000A1Z5",
  "registrationNumber": "REG-12345",
  "pan": "ABCDE1234F",
  "nabhNumber": "NABH-001"
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Missing Endpoints (Need Backend Implementation)

### 1. Password Reset
```http
POST /auth/reset-password
Content-Type: application/json

{
  "identifier": "john@example.com",
  "newPassword": "NewSecurePass123"
}
```

**Expected Response:**
```json
{
  "success": true
}
```

---

### 2. Token Refresh
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh-token-string"
}
```

**Expected Response:**
```json
{
  "token": "new-access-token",
  "refreshToken": "new-refresh-token"
}
```

---

### 3. Token Validation
```http
GET /auth/validate
Authorization: Bearer <token>
```

**Expected Response:**
```json
{
  "valid": true,
  "user": {
    "userId": "uuid",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

---

### 4. Referral Analytics
```http
GET /analytics/referrals?startDate=2026-04-01&endDate=2026-04-19
Authorization: Bearer <token>
```

**Expected Response:**
```json
{
  "sources": [
    {
      "name": "Dr. Michael Chen",
      "contact": "+91-9876543210",
      "patientCount": 15,
      "patients": [
        {
          "id": "P001",
          "name": "John Smith",
          "age": 45,
          "gender": "Male",
          "registered": "2026-04-15"
        }
      ]
    }
  ],
  "totalCaptured": 45
}
```

---

### 5. Demographics Analytics
```http
GET /analytics/demographics
Authorization: Bearer <token>
```

**Expected Response:**
```json
{
  "gender": {
    "male": 58,
    "female": 42
  },
  "ageGroups": {
    "0-18": 15,
    "19-45": 45,
    "46-65": 25,
    "66+": 15
  }
}
```

---

### 6. Modality Usage Analytics
```http
GET /analytics/modality-usage
Authorization: Bearer <token>
```

**Expected Response:**
```json
{
  "modalities": [
    { "name": "X-RAY", "count": 245 },
    { "name": "CT SCAN", "count": 180 },
    { "name": "MRI", "count": 125 },
    { "name": "ULTRASOUND", "count": 285 }
  ],
  "total": 835
}
```

---

### 7. Daily Volume Analytics
```http
GET /analytics/daily-volume?startDate=2026-04-13&endDate=2026-04-19
Authorization: Bearer <token>
```

**Expected Response:**
```json
{
  "dailyVolume": [
    { "date": "2026-04-13", "count": 85 },
    { "date": "2026-04-14", "count": 92 },
    { "date": "2026-04-15", "count": 118 },
    { "date": "2026-04-16", "count": 76 },
    { "date": "2026-04-17", "count": 89 },
    { "date": "2026-04-18", "count": 45 },
    { "date": "2026-04-19", "count": 32 }
  ],
  "peakDay": "2026-04-15",
  "averageDaily": 76.7
}
```

---

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request
```json
{
  "error": "Invalid request data",
  "details": "Mobile number must be 10 digits"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required",
  "details": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied",
  "details": "Insufficient permissions for this operation"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found",
  "details": "Appointment APT-001 does not exist"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "details": "An unexpected error occurred"
}
```

---

## Authentication Header Format

All authenticated endpoints require:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Common Query Parameters

### Pagination (when supported)
```
?page=1&limit=20
```

### Filtering
```
?status=BOOKED&modality=X-RAY&doctor=Dr.%20Smith
```

### Date Range
```
?startDate=2026-04-01&endDate=2026-04-19
```

### Search
```
?search=john
```

---

## Rate Limiting

**Current:** No rate limiting implemented  
**Recommended:** 100 requests per minute per user

---

## API Versioning

**Current Version:** v1  
**Base Path:** `/api/v1`

Future versions will use `/api/v2`, `/api/v3`, etc.

---

## Testing the API

### Using cURL:

```bash
# Login
curl -X POST https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"john@example.com","password":"SecurePass123"}'

# Fetch appointments
curl -X GET https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/appointments \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Using Postman:

1. Import the base URL as an environment variable
2. Set up authentication with Bearer Token
3. Create a collection for each endpoint group
4. Use variables for dynamic values (token, IDs, etc.)

---

## Support

For API issues or questions:
- Backend Repository: `C:\Users\mtnoo\OneDrive\Desktop\EasyHMS\1RadAPI`
- Mobile App Repository: Current workspace

