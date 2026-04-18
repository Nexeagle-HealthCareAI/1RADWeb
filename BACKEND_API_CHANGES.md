# Backend API Changes for Registration Enhancement

## Overview
This document outlines the required backend changes to support the new GSTIN and Registration Number fields in the hospital registration process.

## Database Schema Changes

### 1. Update Centers/Hospitals Table

Add the following columns to your `centers` or `hospitals` table:

```sql
-- For MySQL/MariaDB
ALTER TABLE centers 
ADD COLUMN gstin_number VARCHAR(15) NULL COMMENT 'GST Identification Number',
ADD COLUMN registration_number VARCHAR(100) NULL COMMENT 'Hospital Registration Number';

-- For PostgreSQL
ALTER TABLE centers 
ADD COLUMN gstin_number VARCHAR(15),
ADD COLUMN registration_number VARCHAR(100);

-- Add indexes for better performance
CREATE INDEX idx_centers_gstin ON centers(gstin_number);
CREATE INDEX idx_centers_registration ON centers(registration_number);
```

### 2. Complete Table Schema
Here's the recommended complete schema for the centers table:

```sql
CREATE TABLE centers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    gstin_number VARCHAR(15) NULL,
    registration_number VARCHAR(100) NULL,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    
    -- Indexes
    INDEX idx_centers_status (status),
    INDEX idx_centers_gstin (gstin_number),
    INDEX idx_centers_registration (registration_number),
    INDEX idx_centers_created_at (created_at)
);
```

## API Endpoint Changes

### 1. Update `/auth/deploy-infrastructure` Endpoint

**Current Request Body:**
```json
{
  "centerName": "City Diagnostic Center",
  "centerAddress": "123 Medical Street, City, State 12345",
  "specialization": "Neuroradiologist",
  "degree": "MBBS, MD",
  "licenseNo": "REG-894-0"
}
```

**Updated Request Body:**
```json
{
  "centerName": "City Diagnostic Center",
  "centerAddress": "123 Medical Street, City, State 12345",
  "gstinNumber": "22AAAAA0000A1Z5",
  "registrationNumber": "HOS/2024/001234",
  "specialization": "Neuroradiologist",
  "degree": "MBBS, MD",
  "licenseNo": "REG-894-0"
}
```

### 2. Backend Implementation Examples

#### Node.js/Express Example:

```javascript
// routes/auth.js
const express = require('express');
const router = express.Router();
const { validateGSTIN } = require('../utils/validation');

router.post('/deploy-infrastructure', async (req, res) => {
  try {
    const {
      centerName,
      centerAddress,
      gstinNumber,
      registrationNumber,
      specialization,
      degree,
      licenseNo
    } = req.body;

    // Validation
    if (!centerName || !centerAddress) {
      return res.status(400).json({
        error: 'INFRASTRUCTURE INCOMPLETE: Center name and address are required.'
      });
    }

    // Validate GSTIN format if provided
    if (gstinNumber && !validateGSTIN(gstinNumber)) {
      return res.status(400).json({
        error: 'INVALID GSTIN FORMAT: Please provide a valid 15-digit GSTIN number.'
      });
    }

    // Check for duplicate GSTIN
    if (gstinNumber) {
      const existingCenter = await Center.findOne({ gstin_number: gstinNumber });
      if (existingCenter) {
        return res.status(409).json({
          error: 'GSTIN CONFLICT: This GSTIN number is already registered.'
        });
      }
    }

    // Create center record
    const centerData = {
      id: `CTR-${Date.now()}`,
      name: centerName,
      address: centerAddress,
      gstin_number: gstinNumber || null,
      registration_number: registrationNumber || null,
      status: 'active',
      created_by: req.user.id // From JWT token
    };

    const center = await Center.create(centerData);

    // Update user's center association
    await User.update(
      { 
        center_id: center.id,
        specialization,
        degree,
        license_no: licenseNo
      },
      { where: { id: req.user.id } }
    );

    res.status(201).json({
      success: true,
      message: 'Infrastructure deployed successfully',
      center: {
        id: center.id,
        name: center.name,
        gstinNumber: center.gstin_number,
        registrationNumber: center.registration_number
      }
    });

  } catch (error) {
    console.error('Deploy infrastructure error:', error);
    res.status(500).json({
      error: 'DEPLOYMENT FAILED: Infrastructure setup encountered an error.'
    });
  }
});

module.exports = router;
```

#### Python/Django Example:

```python
# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import Center, User
from .utils import validate_gstin
import json

@csrf_exempt
@require_http_methods(["POST"])
def deploy_infrastructure(request):
    try:
        data = json.loads(request.body)
        
        center_name = data.get('centerName')
        center_address = data.get('centerAddress')
        gstin_number = data.get('gstinNumber')
        registration_number = data.get('registrationNumber')
        specialization = data.get('specialization')
        degree = data.get('degree')
        license_no = data.get('licenseNo')

        # Validation
        if not center_name or not center_address:
            return JsonResponse({
                'error': 'INFRASTRUCTURE INCOMPLETE: Center name and address are required.'
            }, status=400)

        # Validate GSTIN format if provided
        if gstin_number and not validate_gstin(gstin_number):
            return JsonResponse({
                'error': 'INVALID GSTIN FORMAT: Please provide a valid 15-digit GSTIN number.'
            }, status=400)

        # Check for duplicate GSTIN
        if gstin_number and Center.objects.filter(gstin_number=gstin_number).exists():
            return JsonResponse({
                'error': 'GSTIN CONFLICT: This GSTIN number is already registered.'
            }, status=409)

        # Create center
        center = Center.objects.create(
            name=center_name,
            address=center_address,
            gstin_number=gstin_number,
            registration_number=registration_number,
            status='active',
            created_by=request.user
        )

        # Update user
        user = request.user
        user.center = center
        user.specialization = specialization
        user.degree = degree
        user.license_no = license_no
        user.save()

        return JsonResponse({
            'success': True,
            'message': 'Infrastructure deployed successfully',
            'center': {
                'id': center.id,
                'name': center.name,
                'gstinNumber': center.gstin_number,
                'registrationNumber': center.registration_number
            }
        }, status=201)

    except Exception as e:
        return JsonResponse({
            'error': 'DEPLOYMENT FAILED: Infrastructure setup encountered an error.'
        }, status=500)
```

### 3. GSTIN Validation Utility

#### JavaScript/Node.js:
```javascript
// utils/validation.js
function validateGSTIN(gstin) {
  if (!gstin || typeof gstin !== 'string') {
    return false;
  }

  // Remove spaces and convert to uppercase
  const cleanGstin = gstin.replace(/\s/g, '').toUpperCase();

  // Check length
  if (cleanGstin.length !== 15) {
    return false;
  }

  // GSTIN format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  
  return gstinRegex.test(cleanGstin);
}

// Advanced GSTIN validation with checksum
function validateGSTINWithChecksum(gstin) {
  if (!validateGSTIN(gstin)) {
    return false;
  }

  const cleanGstin = gstin.replace(/\s/g, '').toUpperCase();
  
  // GSTIN checksum validation logic
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let factor = 2;
  let sum = 0;

  for (let i = cleanGstin.length - 2; i >= 0; i--) {
    let codePoint = chars.indexOf(cleanGstin[i]);
    let digit = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    digit = Math.floor(digit / 36) + (digit % 36);
    sum += digit;
  }

  const checksum = (36 - (sum % 36)) % 36;
  const checksumChar = chars[checksum];
  
  return checksumChar === cleanGstin[cleanGstin.length - 1];
}

module.exports = {
  validateGSTIN,
  validateGSTINWithChecksum
};
```

#### Python:
```python
# utils.py
import re

def validate_gstin(gstin):
    """Validate GSTIN format"""
    if not gstin or not isinstance(gstin, str):
        return False
    
    # Remove spaces and convert to uppercase
    clean_gstin = gstin.replace(' ', '').upper()
    
    # Check length
    if len(clean_gstin) != 15:
        return False
    
    # GSTIN format validation
    pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
    return bool(re.match(pattern, clean_gstin))

def validate_gstin_with_checksum(gstin):
    """Validate GSTIN with checksum verification"""
    if not validate_gstin(gstin):
        return False
    
    clean_gstin = gstin.replace(' ', '').upper()
    chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    
    factor = 2
    sum_val = 0
    
    for i in range(len(clean_gstin) - 2, -1, -1):
        code_point = chars.index(clean_gstin[i])
        digit = factor * code_point
        factor = 1 if factor == 2 else 2
        digit = digit // 36 + digit % 36
        sum_val += digit
    
    checksum = (36 - (sum_val % 36)) % 36
    checksum_char = chars[checksum]
    
    return checksum_char == clean_gstin[-1]
```

## API Response Updates

### 1. Center Information Response
Update your center information endpoints to include the new fields:

```json
{
  "id": "CTR-1640995200000",
  "name": "City Diagnostic Center",
  "address": "123 Medical Street, City, State 12345",
  "gstinNumber": "22AAAAA0000A1Z5",
  "registrationNumber": "HOS/2024/001234",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### 2. User Profile Response
Include center details in user profile:

```json
{
  "id": "USR-1640995200000",
  "name": "Dr. Arjun Mehta",
  "email": "arjun@citydiagnostic.com",
  "mobile": "9876543210",
  "roles": ["admindoctor"],
  "center": {
    "id": "CTR-1640995200000",
    "name": "City Diagnostic Center",
    "gstinNumber": "22AAAAA0000A1Z5",
    "registrationNumber": "HOS/2024/001234"
  },
  "specialization": "Neuroradiologist",
  "degree": "MBBS, MD",
  "licenseNo": "REG-894-0"
}
```

## Migration Scripts

### MySQL Migration:
```sql
-- Migration: Add GSTIN and Registration Number fields
-- File: migrations/add_gstin_registration_fields.sql

START TRANSACTION;

-- Add new columns
ALTER TABLE centers 
ADD COLUMN gstin_number VARCHAR(15) NULL COMMENT 'GST Identification Number' AFTER address,
ADD COLUMN registration_number VARCHAR(100) NULL COMMENT 'Hospital Registration Number' AFTER gstin_number;

-- Add indexes
CREATE INDEX idx_centers_gstin ON centers(gstin_number);
CREATE INDEX idx_centers_registration ON centers(registration_number);

-- Update migration tracking
INSERT INTO migrations (name, executed_at) VALUES ('add_gstin_registration_fields', NOW());

COMMIT;
```

### PostgreSQL Migration:
```sql
-- Migration: Add GSTIN and Registration Number fields
-- File: migrations/001_add_gstin_registration_fields.sql

BEGIN;

-- Add new columns
ALTER TABLE centers 
ADD COLUMN gstin_number VARCHAR(15),
ADD COLUMN registration_number VARCHAR(100);

-- Add indexes
CREATE INDEX idx_centers_gstin ON centers(gstin_number);
CREATE INDEX idx_centers_registration ON centers(registration_number);

-- Add comments
COMMENT ON COLUMN centers.gstin_number IS 'GST Identification Number';
COMMENT ON COLUMN centers.registration_number IS 'Hospital Registration Number';

COMMIT;
```

## Testing

### 1. API Testing with cURL:

```bash
# Test deploy-infrastructure endpoint
curl -X POST http://localhost:3000/api/auth/deploy-infrastructure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "centerName": "Test Diagnostic Center",
    "centerAddress": "123 Test Street, Test City, TS 12345",
    "gstinNumber": "22AAAAA0000A1Z5",
    "registrationNumber": "HOS/2024/001234",
    "specialization": "Radiologist",
    "degree": "MBBS, MD",
    "licenseNo": "REG-TEST-001"
  }'
```

### 2. Test Cases:

```javascript
// Test cases for GSTIN validation
const testCases = [
  { gstin: "22AAAAA0000A1Z5", expected: true, description: "Valid GSTIN" },
  { gstin: "22AAAAA0000A1Z", expected: false, description: "Too short" },
  { gstin: "22AAAAA0000A1Z55", expected: false, description: "Too long" },
  { gstin: "22aaaaa0000a1z5", expected: true, description: "Lowercase (should be converted)" },
  { gstin: "22AAAAA0000A1Y5", expected: false, description: "Invalid format (Y instead of Z)" },
  { gstin: "", expected: true, description: "Empty (optional field)" },
  { gstin: null, expected: true, description: "Null (optional field)" }
];
```

## Security Considerations

1. **Input Sanitization**: Always sanitize and validate input data
2. **GSTIN Uniqueness**: Ensure GSTIN numbers are unique across the system
3. **Rate Limiting**: Implement rate limiting on registration endpoints
4. **Audit Logging**: Log all registration attempts and changes
5. **Data Encryption**: Consider encrypting sensitive business information

## Deployment Checklist

- [ ] Database migration executed
- [ ] API endpoints updated
- [ ] Validation functions implemented
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Security review completed
- [ ] Backup procedures verified
- [ ] Rollback plan prepared

## Rollback Plan

If issues arise, you can rollback using:

```sql
-- Rollback migration
ALTER TABLE centers 
DROP COLUMN gstin_number,
DROP COLUMN registration_number;

DROP INDEX idx_centers_gstin;
DROP INDEX idx_centers_registration;
```

This comprehensive guide should help you implement all the necessary backend changes to support the new GSTIN and Registration Number fields in your registration process.