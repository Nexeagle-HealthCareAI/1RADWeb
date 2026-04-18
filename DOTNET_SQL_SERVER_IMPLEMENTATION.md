# .NET API + SQL Server Implementation Guide

## 1. SQL Server Database Changes

### Migration Script for SQL Server:
```sql
-- File: Migrations/AddGstinRegistrationFields.sql
-- Add GSTIN and Registration Number fields to Centers table

USE [1RadDatabase]
GO

BEGIN TRANSACTION;

-- Add new columns to Centers table
ALTER TABLE [dbo].[Centers] 
ADD [GstinNumber] NVARCHAR(15) NULL,
    [RegistrationNumber] NVARCHAR(100) NULL;

-- Add indexes for better performance
CREATE NONCLUSTERED INDEX [IX_Centers_GstinNumber] 
ON [dbo].[Centers] ([GstinNumber]);

CREATE NONCLUSTERED INDEX [IX_Centers_RegistrationNumber] 
ON [dbo].[Centers] ([RegistrationNumber]);

-- Add unique constraint for GSTIN (if needed)
ALTER TABLE [dbo].[Centers] 
ADD CONSTRAINT [UQ_Centers_GstinNumber] UNIQUE ([GstinNumber]);

-- Add comments/descriptions
EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'GST Identification Number (15 characters)', 
    @level0type = N'SCHEMA', @level0name = N'dbo', 
    @level1type = N'TABLE', @level1name = N'Centers', 
    @level2type = N'COLUMN', @level2name = N'GstinNumber';

EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Hospital Registration Number from State Health Department', 
    @level0type = N'SCHEMA', @level0name = N'dbo', 
    @level1type = N'TABLE', @level1name = N'Centers', 
    @level2type = N'COLUMN', @level2name = N'RegistrationNumber';

COMMIT TRANSACTION;
GO
```

### Complete Centers Table Schema:
```sql
-- Complete Centers table structure
CREATE TABLE [dbo].[Centers] (
    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
    [Name] NVARCHAR(255) NOT NULL,
    [Address] NVARCHAR(MAX) NOT NULL,
    [GstinNumber] NVARCHAR(15) NULL,
    [RegistrationNumber] NVARCHAR(100) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [CreatedBy] NVARCHAR(50) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Constraints
    CONSTRAINT [UQ_Centers_GstinNumber] UNIQUE ([GstinNumber]),
    
    -- Indexes
    INDEX [IX_Centers_Status] ([Status]),
    INDEX [IX_Centers_GstinNumber] ([GstinNumber]),
    INDEX [IX_Centers_RegistrationNumber] ([RegistrationNumber]),
    INDEX [IX_Centers_CreatedAt] ([CreatedAt])
);
```

## 2. .NET Models

### Center Model:
```csharp
// Models/Center.cs
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.RegularExpressions;

namespace RadAPI.Models
{
    [Table("Centers")]
    public class Center
    {
        [Key]
        [StringLength(50)]
        public string Id { get; set; } = string.Empty;

        [Required]
        [StringLength(255)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [Column(TypeName = "nvarchar(max)")]
        public string Address { get; set; } = string.Empty;

        [StringLength(15)]
        [Column("GstinNumber")]
        public string? GstinNumber { get; set; }

        [StringLength(100)]
        [Column("RegistrationNumber")]
        public string? RegistrationNumber { get; set; }

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "Active";

        [StringLength(50)]
        public string? CreatedBy { get; set; }

        [Column(TypeName = "datetime2")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column(TypeName = "datetime2")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public virtual ICollection<User> Users { get; set; } = new List<User>();

        // Validation Methods
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
    }

    public static class CenterStatus
    {
        public const string Active = "Active";
        public const string Inactive = "Inactive";
        public const string Pending = "Pending";
    }
}
```

### User Model Update:
```csharp
// Models/User.cs - Add these properties to your existing User model
namespace RadAPI.Models
{
    public class User
    {
        // ... existing properties ...

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
    }
}
```

## 3. DTOs (Data Transfer Objects)

### Request DTOs:
```csharp
// DTOs/DeployInfrastructureDto.cs
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
```

### Response DTOs:
```csharp
// DTOs/CenterResponseDto.cs
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
```

## 4. DbContext Configuration

### ApplicationDbContext:
```csharp
// Data/ApplicationDbContext.cs
using Microsoft.EntityFrameworkCore;
using RadAPI.Models;

namespace RadAPI.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Center> Centers { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Center Configuration
            modelBuilder.Entity<Center>(entity =>
            {
                entity.HasKey(e => e.Id);
                
                entity.Property(e => e.Id)
                    .HasMaxLength(50)
                    .IsRequired();

                entity.Property(e => e.Name)
                    .HasMaxLength(255)
                    .IsRequired();

                entity.Property(e => e.Address)
                    .HasColumnType("nvarchar(max)")
                    .IsRequired();

                entity.Property(e => e.GstinNumber)
                    .HasMaxLength(15);

                entity.Property(e => e.RegistrationNumber)
                    .HasMaxLength(100);

                entity.Property(e => e.Status)
                    .HasMaxLength(20)
                    .HasDefaultValue("Active");

                entity.Property(e => e.CreatedAt)
                    .HasColumnType("datetime2")
                    .HasDefaultValueSql("GETUTCDATE()");

                entity.Property(e => e.UpdatedAt)
                    .HasColumnType("datetime2")
                    .HasDefaultValueSql("GETUTCDATE()");

                // Indexes
                entity.HasIndex(e => e.GstinNumber)
                    .HasDatabaseName("IX_Centers_GstinNumber");

                entity.HasIndex(e => e.RegistrationNumber)
                    .HasDatabaseName("IX_Centers_RegistrationNumber");

                entity.HasIndex(e => e.Status)
                    .HasDatabaseName("IX_Centers_Status");

                // Unique constraint for GSTIN
                entity.HasIndex(e => e.GstinNumber)
                    .IsUnique()
                    .HasFilter("[GstinNumber] IS NOT NULL")
                    .HasDatabaseName("UQ_Centers_GstinNumber");
            });

            // User Configuration
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasOne(u => u.Center)
                    .WithMany(c => c.Users)
                    .HasForeignKey(u => u.CenterId)
                    .OnDelete(DeleteBehavior.SetNull);
            });
        }
    }
}
```

## 5. Services

### Center Service:
```csharp
// Services/ICenterService.cs
using RadAPI.DTOs.Request;
using RadAPI.DTOs.Response;

namespace RadAPI.Services
{
    public interface ICenterService
    {
        Task<DeployInfrastructureResponseDto> DeployInfrastructureAsync(
            DeployInfrastructureDto dto, string userId);
        Task<CenterResponseDto?> GetCenterByIdAsync(string centerId);
        Task<bool> IsGstinUniqueAsync(string gstin, string? excludeCenterId = null);
    }
}
```

```csharp
// Services/CenterService.cs
using Microsoft.EntityFrameworkCore;
using RadAPI.Data;
using RadAPI.DTOs.Request;
using RadAPI.DTOs.Response;
using RadAPI.Models;

namespace RadAPI.Services
{
    public class CenterService : ICenterService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<CenterService> _logger;

        public CenterService(ApplicationDbContext context, ILogger<CenterService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<DeployInfrastructureResponseDto> DeployInfrastructureAsync(
            DeployInfrastructureDto dto, string userId)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                // Validate GSTIN if provided
                if (!string.IsNullOrEmpty(dto.GstinNumber))
                {
                    var cleanGstin = dto.GstinNumber.Replace(" ", "").ToUpper();
                    
                    if (!Center.IsValidGstin(cleanGstin))
                    {
                        return new DeployInfrastructureResponseDto
                        {
                            Success = false,
                            Message = "INVALID GSTIN FORMAT: Please provide a valid 15-digit GSTIN number."
                        };
                    }

                    // Check for duplicate GSTIN
                    if (!await IsGstinUniqueAsync(cleanGstin))
                    {
                        return new DeployInfrastructureResponseDto
                        {
                            Success = false,
                            Message = "GSTIN CONFLICT: This GSTIN number is already registered."
                        };
                    }

                    dto.GstinNumber = cleanGstin;
                }

                // Generate unique center ID
                var centerId = $"CTR-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}-{Guid.NewGuid().ToString()[..8].ToUpper()}";

                // Create center
                var center = new Center
                {
                    Id = centerId,
                    Name = dto.CenterName.Trim(),
                    Address = dto.CenterAddress.Trim(),
                    GstinNumber = dto.GstinNumber?.ToUpper(),
                    RegistrationNumber = dto.RegistrationNumber?.ToUpper(),
                    Status = CenterStatus.Active,
                    CreatedBy = userId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.Centers.Add(center);

                // Update user
                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    user.CenterId = center.Id;
                    user.Specialization = dto.Specialization?.Trim();
                    user.Degree = dto.Degree?.Trim();
                    user.LicenseNo = dto.LicenseNo?.Trim();
                    user.RegistrationCompleted = true;
                    
                    _context.Users.Update(user);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation("Infrastructure deployed successfully for user {UserId}, center {CenterId}", 
                    userId, center.Id);

                return new DeployInfrastructureResponseDto
                {
                    Success = true,
                    Message = "Infrastructure deployed successfully",
                    Center = new CenterResponseDto
                    {
                        Id = center.Id,
                        Name = center.Name,
                        Address = center.Address,
                        GstinNumber = center.GstinNumber,
                        RegistrationNumber = center.RegistrationNumber,
                        Status = center.Status,
                        CreatedAt = center.CreatedAt,
                        UpdatedAt = center.UpdatedAt
                    }
                };
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error deploying infrastructure for user {UserId}", userId);
                
                return new DeployInfrastructureResponseDto
                {
                    Success = false,
                    Message = "DEPLOYMENT FAILED: Infrastructure setup encountered an error."
                };
            }
        }

        public async Task<CenterResponseDto?> GetCenterByIdAsync(string centerId)
        {
            var center = await _context.Centers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == centerId);

            if (center == null)
                return null;

            return new CenterResponseDto
            {
                Id = center.Id,
                Name = center.Name,
                Address = center.Address,
                GstinNumber = center.GstinNumber,
                RegistrationNumber = center.RegistrationNumber,
                Status = center.Status,
                CreatedAt = center.CreatedAt,
                UpdatedAt = center.UpdatedAt
            };
        }

        public async Task<bool> IsGstinUniqueAsync(string gstin, string? excludeCenterId = null)
        {
            var query = _context.Centers.Where(c => c.GstinNumber == gstin.ToUpper());
            
            if (!string.IsNullOrEmpty(excludeCenterId))
            {
                query = query.Where(c => c.Id != excludeCenterId);
            }

            return !await query.AnyAsync();
        }
    }
}
```

## 6. Controller

### AuthController Update:
```csharp
// Controllers/AuthController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RadAPI.DTOs.Request;
using RadAPI.DTOs.Response;
using RadAPI.Services;
using System.Security.Claims;

namespace RadAPI.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly ICenterService _centerService;
        private readonly ILogger<AuthController> _logger;

        public AuthController(ICenterService centerService, ILogger<AuthController> logger)
        {
            _centerService = centerService;
            _logger = logger;
        }

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
    }

    public class ValidateGstinDto
    {
        public string GstinNumber { get; set; } = string.Empty;
    }
}
```

## 7. Dependency Injection Setup

### Program.cs or Startup.cs:
```csharp
// Program.cs (for .NET 6+)
using Microsoft.EntityFrameworkCore;
using RadAPI.Data;
using RadAPI.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();

// Database
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Services
builder.Services.AddScoped<ICenterService, CenterService>();

// Add other services (Authentication, etc.)
// ... your existing service registrations

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

## 8. Configuration

### appsettings.json:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=your-server;Database=1RadDatabase;Trusted_Connection=true;MultipleActiveResultSets=true;TrustServerCertificate=true"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "RadAPI.Services": "Information"
    }
  }
}
```

## 9. Testing

### Unit Test Example:
```csharp
// Tests/CenterServiceTests.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using RadAPI.Data;
using RadAPI.DTOs.Request;
using RadAPI.Models;
using RadAPI.Services;
using Xunit;

namespace RadAPI.Tests.Services
{
    public class CenterServiceTests : IDisposable
    {
        private readonly ApplicationDbContext _context;
        private readonly CenterService _service;
        private readonly Mock<ILogger<CenterService>> _loggerMock;

        public CenterServiceTests()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;

            _context = new ApplicationDbContext(options);
            _loggerMock = new Mock<ILogger<CenterService>>();
            _service = new CenterService(_context, _loggerMock.Object);
        }

        [Fact]
        public async Task DeployInfrastructureAsync_ValidData_ReturnsSuccess()
        {
            // Arrange
            var dto = new DeployInfrastructureDto
            {
                CenterName = "Test Center",
                CenterAddress = "123 Test Street",
                GstinNumber = "22AAAAA0000A1Z5",
                RegistrationNumber = "HOS/2024/001"
            };

            var user = new User { Id = "user123", Email = "test@test.com" };
            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            // Act
            var result = await _service.DeployInfrastructureAsync(dto, user.Id);

            // Assert
            Assert.True(result.Success);
            Assert.NotNull(result.Center);
            Assert.Equal("Test Center", result.Center.Name);
            Assert.Equal("22AAAAA0000A1Z5", result.Center.GstinNumber);
        }

        [Fact]
        public async Task DeployInfrastructureAsync_InvalidGstin_ReturnsError()
        {
            // Arrange
            var dto = new DeployInfrastructureDto
            {
                CenterName = "Test Center",
                CenterAddress = "123 Test Street",
                GstinNumber = "INVALID_GSTIN"
            };

            // Act
            var result = await _service.DeployInfrastructureAsync(dto, "user123");

            // Assert
            Assert.False(result.Success);
            Assert.Contains("INVALID GSTIN FORMAT", result.Message);
        }

        public void Dispose()
        {
            _context.Dispose();
        }
    }
}
```

This implementation provides a complete, production-ready solution for your .NET API with SQL Server backend to handle the GSTIN and Registration Number fields in the registration process.