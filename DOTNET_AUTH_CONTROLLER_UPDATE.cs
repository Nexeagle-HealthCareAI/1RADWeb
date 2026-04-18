// =============================================================================
// AUTH CONTROLLER UPDATES FOR YOUR .NET API PROJECT
// =============================================================================

// ADD THESE METHODS TO YOUR EXISTING AuthController

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RadAPI.DTOs.Request;
using RadAPI.DTOs.Response;
using RadAPI.Services;
using System.Security.Claims;

// Add this constructor dependency (update your existing constructor)
private readonly ICenterService _centerService;

public AuthController(ICenterService centerService, ILogger<AuthController> logger, /* your other dependencies */)
{
    _centerService = centerService;
    _logger = logger;
    // ... initialize other dependencies
}

// =============================================================================
// ADD THESE NEW ENDPOINTS TO YOUR AuthController
// =============================================================================

[HttpPost("deploy-infrastructure")]
[Authorize]
public async Task<IActionResult> DeployInfrastructure([FromBody] DeployInfrastructureDto dto)
{
    try
    {
        if (!ModelState.IsValid)
        {
            var firstError = ModelState.Values
                .SelectMany(v => v.Errors)
                .FirstOrDefault()?.ErrorMessage ?? "Invalid input data";

            return BadRequest(new ApiErrorResponse 
            { 
                Error = $"VALIDATION FAILED: {firstError}" 
            });
        }

        // Get user ID from JWT claims
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                   ?? User.FindFirst("userId")?.Value;

        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(new ApiErrorResponse 
            { 
                Error = "AUTHENTICATION FAILED: User ID not found in token" 
            });
        }

        var result = await _centerService.DeployInfrastructureAsync(dto, userId);

        if (!result.Success)
        {
            return BadRequest(new ApiErrorResponse { Error = result.Message });
        }

        return CreatedAtAction(
            nameof(GetCenter), 
            new { id = result.Center?.Id }, 
            result);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Unexpected error in DeployInfrastructure");
        return StatusCode(500, new ApiErrorResponse 
        { 
            Error = "SYSTEM ERROR: An unexpected error occurred" 
        });
    }
}

[HttpGet("center/{id}")]
[Authorize]
public async Task<IActionResult> GetCenter(string id)
{
    try
    {
        var center = await _centerService.GetCenterByIdAsync(id);
        
        if (center == null)
        {
            return NotFound(new ApiErrorResponse 
            { 
                Error = "CENTER NOT FOUND: The specified center does not exist" 
            });
        }

        return Ok(center);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error retrieving center {CenterId}", id);
        return StatusCode(500, new ApiErrorResponse 
        { 
            Error = "SYSTEM ERROR: Unable to retrieve center information" 
        });
    }
}

[HttpPost("validate-gstin")]
[AllowAnonymous]
public IActionResult ValidateGstin([FromBody] ValidateGstinDto dto)
{
    try
    {
        var isValid = Center.IsValidGstin(dto.GstinNumber);
        var isValidWithChecksum = isValid && Center.ValidateGstinChecksum(dto.GstinNumber);

        return Ok(new
        {
            isValid = isValid,
            isValidWithChecksum = isValidWithChecksum,
            message = isValid 
                ? (isValidWithChecksum ? "Valid GSTIN with correct checksum" : "Valid GSTIN format but checksum verification failed")
                : "Invalid GSTIN format"
        });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error validating GSTIN");
        return StatusCode(500, new ApiErrorResponse 
        { 
            Error = "VALIDATION ERROR: Unable to validate GSTIN" 
        });
    }
}

// =============================================================================
// ADD THIS DTO CLASS
// =============================================================================

public class ValidateGstinDto
{
    public string GstinNumber { get; set; } = string.Empty;
}