# CORS Configuration Guide for DICOM File Access

## Problem
The application is experiencing CORS (Cross-Origin Resource Sharing) errors when trying to access DICOM files from Azure Blob Storage. This prevents the DICOM viewer from loading medical images.

## Error Message
```
Access to fetch at 'https://1radstorage.blob.core.windows.net/dicom-files/...' 
from origin 'http://localhost:5175' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause
Azure Blob Storage is not configured to allow cross-origin requests from the frontend application domain.

## Solution: Configure Azure Blob Storage CORS

### Step 1: Access Azure Portal
1. Log into the Azure Portal (https://portal.azure.com)
2. Navigate to your Storage Account: `1radstorage`
3. Go to **Settings** > **Resource sharing (CORS)**

### Step 2: Configure CORS Rules
Add the following CORS rule:

| Setting | Value |
|---------|-------|
| **Allowed origins** | `http://localhost:5175,https://yourdomain.com,*` |
| **Allowed methods** | `GET,HEAD,OPTIONS` |
| **Allowed headers** | `*` |
| **Exposed headers** | `*` |
| **Max age** | `3600` |

### Step 3: Alternative Configuration (More Secure)
For production, use specific domains instead of `*`:

```
Allowed origins: https://your-production-domain.com,http://localhost:5175
Allowed methods: GET,HEAD,OPTIONS
Allowed headers: Accept,Content-Type,Authorization
Exposed headers: Content-Length,Content-Type
Max age: 3600
```

### Step 4: Verify Configuration
1. Save the CORS settings in Azure Portal
2. Wait 2-3 minutes for changes to propagate
3. Refresh the application and try loading DICOM files again

## Alternative Solutions

### Option 1: API Proxy (Implemented)
The application now includes a fallback mechanism that attempts to use the backend API as a proxy when CORS fails. This requires implementing a `/Study/proxy-dicom` endpoint in the backend.

### Option 2: Backend Endpoint
Create a dedicated backend endpoint that:
1. Receives the blob URL as a parameter
2. Fetches the file server-side (no CORS restrictions)
3. Returns the file content to the frontend

Example endpoint: `GET /api/v1/Study/proxy-dicom?url={blobUrl}`

## Testing
After configuration, test with:
1. Development environment (localhost:5175)
2. Production environment
3. Different browsers to ensure compatibility

## Security Considerations
- Avoid using `*` for allowed origins in production
- Limit allowed methods to only what's needed (GET, HEAD, OPTIONS)
- Consider implementing authentication for blob access
- Monitor access logs for unauthorized requests

## Troubleshooting
If CORS issues persist:
1. Clear browser cache and cookies
2. Check Azure Storage Account firewall settings
3. Verify the storage account allows public blob access
4. Test with browser developer tools network tab
5. Contact Azure support if configuration doesn't take effect

## Contact
For technical assistance with CORS configuration, contact your system administrator or Azure support.