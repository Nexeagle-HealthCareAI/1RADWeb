// =============================================================================
// MODELS TO ADD/UPDATE IN YOUR .NET API PROJECT
// =============================================================================

// 1. UPDATE YOUR CENTER MODEL (Models/Center.cs)
// Add these properties to your existing Center model:

[StringLength(15)]
[Column("GstinNumber")]
public string? GstinNumber { get; set; }

[StringLength(100)]
[Column("RegistrationNumber")]
public string? RegistrationNumber { get; set; }

// Add these validation methods to your Center model:
public static bool IsValidGstin(string? gstin)
{
    if (string.IsNullOrWhiteSpace(gstin))
        return true; // Optional field

    // Remove spaces and convert to uppercase
    var cleanGstin = gstin.Replace(" ", "").ToUpper();

    // Check length
    if (cleanGstin.Length != 15)
        return false;

    // GSTIN format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
    var gstinPattern = @"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$";
    return Regex.IsMatch(cleanGstin, gstinPattern);
}

public static bool ValidateGstinChecksum(string gstin)
{
    if (!IsValidGstin(gstin))
        return false;

    var cleanGstin = gstin.Replace(" ", "").ToUpper();
    const string chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    int factor = 2;
    int sum = 0;

    for (int i = cleanGstin.Length - 2; i >= 0; i--)
    {
        int codePoint = chars.IndexOf(cleanGstin[i]);
        int digit = factor * codePoint;
        factor = factor == 2 ? 1 : 2;
        digit = digit / 36 + digit % 36;
        sum += digit;
    }

    int checksum = (36 - (sum % 36)) % 36;
    char checksumChar = chars[checksum];

    return checksumChar == cleanGstin[cleanGstin.Length - 1];
}

// =============================================================================
// 2. CREATE DTOs (DTOs/DeployInfrastructureDto.cs)
// =============================================================================

using System.ComponentModel.DataAnnotations;

namespace RadAPI.DTOs.Request
{
    public class DeployInfrastructureDto
    {
        [Required(ErrorMessage = "Center name is required")]
        [StringLength(255, ErrorMessage = "Center name cannot exceed 255 characters")]
        public string CenterName { get; set; } = string.Empty;

        [Required(ErrorMessage = "Center address is required")]
        public string CenterAddress { get; set; } = string.Empty;

        [StringLength(15, ErrorMessage = "GSTIN number cannot exceed 15 characters")]
        [RegularExpression(@"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", 
            ErrorMessage = "Invalid GSTIN format")]
        public string? GstinNumber { get; set; }

        [StringLength(100, ErrorMessage = "Registration number cannot exceed 100 characters")]
        public string? RegistrationNumber { get; set; }

        [StringLength(100, ErrorMessage = "Specialization cannot exceed 100 characters")]
        public string? Specialization { get; set; }

        [StringLength(100, ErrorMessage = "Degree cannot exceed 100 characters")]
        public string? Degree { get; set; }

        [StringLength(50, ErrorMessage = "License number cannot exceed 50 characters")]
        public string? LicenseNo { get; set; }
    }
}

namespace RadAPI.DTOs.Response
{
    public class CenterResponseDto
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string? GstinNumber { get; set; }
        public string? RegistrationNumber { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class DeployInfrastructureResponseDto
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public CenterResponseDto? Center { get; set; }
    }

    public class ApiErrorResponse
    {
        public string Error { get; set; } = string.Empty;
        public string? Details { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}

// =============================================================================
// 3. UPDATE YOUR USER MODEL (Models/User.cs)
// Add these properties to your existing User model:
// =============================================================================

[StringLength(50)]
public string? CenterId { get; set; }

[StringLength(100)]
public string? Specialization { get; set; }

[StringLength(100)]
public string? Degree { get; set; }

[StringLength(50)]
public string? LicenseNo { get; set; }

public bool RegistrationCompleted { get; set; } = false;

// Navigation Properties
[ForeignKey("CenterId")]
public virtual Center? Center { get; set; }