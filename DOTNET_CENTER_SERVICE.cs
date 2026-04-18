// =============================================================================
// CENTER SERVICE TO ADD TO YOUR .NET API PROJECT
// =============================================================================

// 1. CREATE INTERFACE (Services/ICenterService.cs)
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

// =============================================================================
// 2. CREATE SERVICE IMPLEMENTATION (Services/CenterService.cs)
// =============================================================================

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
                    Status = "Active", // Assuming you have a Status property
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