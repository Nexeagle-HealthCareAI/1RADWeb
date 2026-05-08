# Backend Proxy Endpoint Specification

## Overview
The frontend application requires a backend proxy endpoint to handle DICOM file downloads when direct access to Azure Blob Storage is blocked by CORS policies.

## Required Endpoint

### Endpoint Details
- **Path**: `/api/v1/Study/proxy-asset`
- **Method**: `GET`
- **Authentication**: Required (Bearer token)
- **Content-Type**: `application/octet-stream` or `application/zip`

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | The full URL of the Azure Blob Storage file to proxy |

### Request Example
```http
GET /api/v1/Study/proxy-asset?url=https%3A%2F%2F1radstorage.blob.core.windows.net%2Fdicom-files%2Fexample.zip HTTP/1.1
Host: 1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net
Authorization: Bearer {token}
Accept: application/octet-stream, application/zip, */*
```

### Response
- **Success (200 OK)**: Returns the binary content of the requested file
- **Error (404 Not Found)**: File not found at the specified URL
- **Error (401 Unauthorized)**: Invalid or missing authentication token
- **Error (403 Forbidden)**: User doesn't have permission to access the file
- **Error (500 Internal Server Error)**: Server-side error during file retrieval

### Response Headers
```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Length: {file_size}
Content-Disposition: attachment; filename="study.zip"
Cache-Control: private, max-age=3600
```

## Implementation Requirements

### Backend Implementation (.NET Example)
```csharp
[HttpGet("proxy-asset")]
[Authorize]
public async Task<IActionResult> ProxyAsset([FromQuery] string url)
{
    try
    {
        // Validate URL
        if (string.IsNullOrEmpty(url) || !Uri.IsWellFormedUriString(url, UriKind.Absolute))
        {
            return BadRequest("Invalid URL provided");
        }

        // Validate that URL is from allowed domain (security)
        var uri = new Uri(url);
        if (!uri.Host.EndsWith("blob.core.windows.net"))
        {
            return BadRequest("URL must be from Azure Blob Storage");
        }

        // Optional: Check user permissions for this study
        // var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        // if (!await HasAccessToStudy(userId, url)) return Forbid();

        // Fetch the file from Azure Blob Storage
        using var httpClient = new HttpClient();
        httpClient.Timeout = TimeSpan.FromMinutes(5); // Adjust based on file sizes
        
        var response = await httpClient.GetAsync(url);
        
        if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, "Failed to retrieve file from storage");
        }

        // Stream the content back to the client
        var stream = await response.Content.ReadAsStreamAsync();
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
        
        return File(stream, contentType);
    }
    catch (HttpRequestException ex)
    {
        _logger.LogError(ex, "HTTP error while proxying asset: {Url}", url);
        return StatusCode(500, "Error retrieving file from storage");
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error proxying asset: {Url}", url);
        return StatusCode(500, "Internal server error");
    }
}
```

## Security Considerations

### 1. URL Validation
- Validate that the URL is well-formed
- Ensure URL points to authorized Azure Blob Storage domain
- Prevent Server-Side Request Forgery (SSRF) attacks

### 2. Authentication & Authorization
- Require valid authentication token
- Verify user has permission to access the requested study
- Log all access attempts for audit trail

### 3. Rate Limiting
- Implement rate limiting to prevent abuse
- Consider file size limits (e.g., max 500MB per request)
- Add timeout protection for long-running requests

### 4. Caching
- Consider implementing caching for frequently accessed files
- Use appropriate cache headers to reduce backend load
- Implement cache invalidation strategy

## Frontend Usage

### Connection Test
The frontend first tests connectivity using this endpoint:
```javascript
const proxyResponse = await apiClient.get(`/Study/proxy-asset`, {
  params: { url: asset.remoteUrl },
  responseType: 'blob',
  timeout: 5000
});
```

### Actual File Download
When CORS blocks direct access, the frontend falls back to:
```javascript
const proxyResponse = await apiClient.get(`/Study/proxy-asset`, {
  params: { url: asset.remoteUrl },
  responseType: 'blob'
});
```

## Error Handling

### Frontend Error Messages
- **405 Method Not Allowed**: Endpoint doesn't support the HTTP method (check if GET is implemented)
- **404 Not Found**: Endpoint doesn't exist (check route configuration)
- **401 Unauthorized**: Authentication token is missing or invalid
- **403 Forbidden**: User doesn't have permission to access the file
- **500 Internal Server Error**: Backend error during file retrieval

### Logging Requirements
Backend should log:
- All proxy requests with user ID and URL
- Failed requests with error details
- Performance metrics (file size, download time)
- Security events (invalid URLs, unauthorized access attempts)

## Testing

### Manual Testing
```bash
# Test with curl
curl -X GET "https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/Study/proxy-asset?url=https%3A%2F%2F1radstorage.blob.core.windows.net%2Fdicom-files%2Ftest.zip" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output test.zip
```

### Expected Behavior
1. Endpoint should accept GET requests
2. Should validate and sanitize the URL parameter
3. Should authenticate the request
4. Should fetch the file from Azure Blob Storage
5. Should stream the file back to the client
6. Should handle errors gracefully

## Performance Considerations

### Streaming
- Use streaming to avoid loading entire file into memory
- Implement chunked transfer encoding for large files
- Set appropriate buffer sizes

### Timeout Configuration
- Set reasonable timeouts based on expected file sizes
- Frontend timeout: 120 seconds (configurable)
- Backend timeout: 5 minutes (configurable)

### Bandwidth
- Monitor bandwidth usage
- Consider implementing download speed limits if needed
- Use compression where appropriate

## Monitoring & Alerts

### Metrics to Track
- Request count and success rate
- Average response time
- File sizes being proxied
- Error rates by type
- User access patterns

### Alerts
- High error rate (>5% failures)
- Slow response times (>30 seconds)
- Unusual access patterns
- Authentication failures

## Alternative: CORS Configuration
If possible, configure Azure Blob Storage CORS instead of using a proxy:
- See `CORS_CONFIGURATION_GUIDE.md` for details
- Direct access is more efficient than proxying
- Reduces backend load and latency

## Support
For implementation questions or issues:
1. Check backend logs for detailed error messages
2. Verify endpoint is registered in routing configuration
3. Test endpoint with Postman or curl
4. Review authentication middleware configuration
5. Contact backend development team