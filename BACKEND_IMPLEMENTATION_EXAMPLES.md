# Backend Implementation Examples

## Framework-Specific Implementations

### 1. Node.js + Express + Sequelize

#### Model Updates:
```javascript
// models/Center.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Center = sequelize.define('Center', {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    gstin_number: {
      type: DataTypes.STRING(15),
      allowNull: true,
      unique: true,
      validate: {
        isValidGSTIN(value) {
          if (value && !validateGSTIN(value)) {
            throw new Error('Invalid GSTIN format');
          }
        }
      }
    },
    registration_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'pending'),
      defaultValue: 'active'
    },
    created_by: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'centers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['gstin_number'] },
      { fields: ['registration_number'] },
      { fields: ['status'] }
    ]
  });

  return Center;
};
```

#### Controller Implementation:
```javascript
// controllers/authController.js
const { Center, User } = require('../models');
const { validateGSTIN } = require('../utils/validation');
const jwt = require('jsonwebtoken');

const deployInfrastructure = async (req, res) => {
  const transaction = await sequelize.transaction();
  
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

    // Get user from JWT token
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Validation
    if (!centerName || !centerAddress) {
      await transaction.rollback();
      return res.status(400).json({
        error: 'INFRASTRUCTURE INCOMPLETE: Center name and address are required.'
      });
    }

    // Validate GSTIN if provided
    if (gstinNumber) {
      if (!validateGSTIN(gstinNumber)) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'INVALID GSTIN FORMAT: Please provide a valid 15-digit GSTIN number.'
        });
      }

      // Check for duplicate GSTIN
      const existingCenter = await Center.findOne({
        where: { gstin_number: gstinNumber },
        transaction
      });

      if (existingCenter) {
        await transaction.rollback();
        return res.status(409).json({
          error: 'GSTIN CONFLICT: This GSTIN number is already registered.'
        });
      }
    }

    // Create center
    const center = await Center.create({
      id: `CTR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: centerName,
      address: centerAddress,
      gstin_number: gstinNumber || null,
      registration_number: registrationNumber || null,
      status: 'active',
      created_by: userId
    }, { transaction });

    // Update user with center and medical details
    await User.update({
      center_id: center.id,
      specialization: specialization,
      degree: degree,
      license_no: licenseNo,
      registration_completed: true
    }, {
      where: { id: userId },
      transaction
    });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Infrastructure deployed successfully',
      center: {
        id: center.id,
        name: center.name,
        address: center.address,
        gstinNumber: center.gstin_number,
        registrationNumber: center.registration_number,
        status: center.status
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Deploy infrastructure error:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: 'DUPLICATE ENTRY: GSTIN number already exists.'
      });
    }

    res.status(500).json({
      error: 'DEPLOYMENT FAILED: Infrastructure setup encountered an error.'
    });
  }
};

module.exports = {
  deployInfrastructure
};
```

### 2. Python + Django + Django REST Framework

#### Models:
```python
# models.py
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
import re

def validate_gstin(value):
    """Validate GSTIN format"""
    if value:
        pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
        if not re.match(pattern, value.upper()):
            raise ValidationError('Invalid GSTIN format')

class Center(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('pending', 'Pending'),
    ]

    id = models.CharField(max_length=50, primary_key=True)
    name = models.CharField(max_length=255)
    address = models.TextField()
    gstin_number = models.CharField(
        max_length=15, 
        null=True, 
        blank=True, 
        unique=True,
        validators=[validate_gstin],
        help_text='15-digit GST Identification Number'
    )
    registration_number = models.CharField(
        max_length=100, 
        null=True, 
        blank=True,
        help_text='Hospital Registration Number'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'centers'
        indexes = [
            models.Index(fields=['gstin_number']),
            models.Index(fields=['registration_number']),
            models.Index(fields=['status']),
        ]

    def clean(self):
        if self.gstin_number:
            self.gstin_number = self.gstin_number.upper()

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class User(AbstractUser):
    center = models.ForeignKey(Center, on_delete=models.SET_NULL, null=True, blank=True)
    mobile = models.CharField(max_length=15, unique=True)
    specialization = models.CharField(max_length=100, null=True, blank=True)
    degree = models.CharField(max_length=100, null=True, blank=True)
    license_no = models.CharField(max_length=50, null=True, blank=True)
    registration_completed = models.BooleanField(default=False)
```

#### Serializers:
```python
# serializers.py
from rest_framework import serializers
from .models import Center, User

class DeployInfrastructureSerializer(serializers.Serializer):
    centerName = serializers.CharField(max_length=255)
    centerAddress = serializers.CharField()
    gstinNumber = serializers.CharField(max_length=15, required=False, allow_blank=True)
    registrationNumber = serializers.CharField(max_length=100, required=False, allow_blank=True)
    specialization = serializers.CharField(max_length=100, required=False, allow_blank=True)
    degree = serializers.CharField(max_length=100, required=False, allow_blank=True)
    licenseNo = serializers.CharField(max_length=50, required=False, allow_blank=True)

    def validate_gstinNumber(self, value):
        if value:
            pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
            if not re.match(pattern, value.upper()):
                raise serializers.ValidationError('Invalid GSTIN format')
            
            # Check for duplicate
            if Center.objects.filter(gstin_number=value.upper()).exists():
                raise serializers.ValidationError('GSTIN number already exists')
        
        return value.upper() if value else None

class CenterSerializer(serializers.ModelSerializer):
    gstinNumber = serializers.CharField(source='gstin_number', read_only=True)
    registrationNumber = serializers.CharField(source='registration_number', read_only=True)

    class Meta:
        model = Center
        fields = ['id', 'name', 'address', 'gstinNumber', 'registrationNumber', 'status']
```

#### Views:
```python
# views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from .models import Center, User
from .serializers import DeployInfrastructureSerializer, CenterSerializer
import uuid
import time

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deploy_infrastructure(request):
    serializer = DeployInfrastructureSerializer(data=request.data)
    
    if not serializer.is_valid():
        return Response({
            'error': f'VALIDATION FAILED: {list(serializer.errors.values())[0][0]}'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            data = serializer.validated_data
            
            # Generate unique center ID
            center_id = f"CTR-{int(time.time())}-{str(uuid.uuid4())[:8]}"
            
            # Create center
            center = Center.objects.create(
                id=center_id,
                name=data['centerName'],
                address=data['centerAddress'],
                gstin_number=data.get('gstinNumber'),
                registration_number=data.get('registrationNumber'),
                status='active',
                created_by=request.user
            )

            # Update user
            user = request.user
            user.center = center
            user.specialization = data.get('specialization')
            user.degree = data.get('degree')
            user.license_no = data.get('licenseNo')
            user.registration_completed = True
            user.save()

            # Serialize response
            center_serializer = CenterSerializer(center)
            
            return Response({
                'success': True,
                'message': 'Infrastructure deployed successfully',
                'center': center_serializer.data
            }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response({
            'error': 'DEPLOYMENT FAILED: Infrastructure setup encountered an error.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
```

### 3. PHP + Laravel

#### Migration:
```php
<?php
// database/migrations/add_gstin_registration_to_centers_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddGstinRegistrationToCentersTable extends Migration
{
    public function up()
    {
        Schema::table('centers', function (Blueprint $table) {
            $table->string('gstin_number', 15)->nullable()->unique()->after('address');
            $table->string('registration_number', 100)->nullable()->after('gstin_number');
            
            $table->index('gstin_number');
            $table->index('registration_number');
        });
    }

    public function down()
    {
        Schema::table('centers', function (Blueprint $table) {
            $table->dropIndex(['gstin_number']);
            $table->dropIndex(['registration_number']);
            $table->dropColumn(['gstin_number', 'registration_number']);
        });
    }
}
```

#### Model:
```php
<?php
// app/Models/Center.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Center extends Model
{
    use HasFactory;

    protected $fillable = [
        'id', 'name', 'address', 'gstin_number', 'registration_number', 
        'status', 'created_by'
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    // Relationships
    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // Mutators
    public function setGstinNumberAttribute($value)
    {
        $this->attributes['gstin_number'] = $value ? strtoupper($value) : null;
    }

    public function setRegistrationNumberAttribute($value)
    {
        $this->attributes['registration_number'] = $value ? strtoupper($value) : null;
    }

    // Validation
    public static function validateGstin($gstin)
    {
        if (!$gstin) return true; // Optional field
        
        $pattern = '/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/';
        return preg_match($pattern, strtoupper($gstin));
    }
}
```

#### Controller:
```php
<?php
// app/Http/Controllers/AuthController.php

namespace App\Http\Controllers;

use App\Models\Center;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function deployInfrastructure(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'centerName' => 'required|string|max:255',
            'centerAddress' => 'required|string',
            'gstinNumber' => 'nullable|string|size:15|unique:centers,gstin_number',
            'registrationNumber' => 'nullable|string|max:100',
            'specialization' => 'nullable|string|max:100',
            'degree' => 'nullable|string|max:100',
            'licenseNo' => 'nullable|string|max:50',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'VALIDATION FAILED: ' . $validator->errors()->first()
            ], 400);
        }

        // Custom GSTIN validation
        if ($request->gstinNumber && !Center::validateGstin($request->gstinNumber)) {
            return response()->json([
                'error' => 'INVALID GSTIN FORMAT: Please provide a valid 15-digit GSTIN number.'
            ], 400);
        }

        DB::beginTransaction();

        try {
            // Generate unique center ID
            $centerId = 'CTR-' . time() . '-' . substr(str_shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), 0, 8);

            // Create center
            $center = Center::create([
                'id' => $centerId,
                'name' => $request->centerName,
                'address' => $request->centerAddress,
                'gstin_number' => $request->gstinNumber,
                'registration_number' => $request->registrationNumber,
                'status' => 'active',
                'created_by' => auth()->id()
            ]);

            // Update user
            $user = auth()->user();
            $user->update([
                'center_id' => $center->id,
                'specialization' => $request->specialization,
                'degree' => $request->degree,
                'license_no' => $request->licenseNo,
                'registration_completed' => true
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Infrastructure deployed successfully',
                'center' => [
                    'id' => $center->id,
                    'name' => $center->name,
                    'address' => $center->address,
                    'gstinNumber' => $center->gstin_number,
                    'registrationNumber' => $center->registration_number,
                    'status' => $center->status
                ]
            ], 201);

        } catch (\Exception $e) {
            DB::rollback();
            
            return response()->json([
                'error' => 'DEPLOYMENT FAILED: Infrastructure setup encountered an error.'
            ], 500);
        }
    }
}
```

### 4. C# + ASP.NET Core

#### Model:
```csharp
// Models/Center.cs
using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace RadAPI.Models
{
    public class Center
    {
        [Key]
        public string Id { get; set; }

        [Required]
        [MaxLength(255)]
        public string Name { get; set; }

        [Required]
        public string Address { get; set; }

        [MaxLength(15)]
        public string? GstinNumber { get; set; }

        [MaxLength(100)]
        public string? RegistrationNumber { get; set; }

        public CenterStatus Status { get; set; } = CenterStatus.Active;

        public string? CreatedBy { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public virtual ICollection<User> Users { get; set; } = new List<User>();

        // Validation
        public static bool ValidateGstin(string? gstin)
        {
            if (string.IsNullOrEmpty(gstin)) return true; // Optional field

            var pattern = @"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$";
            return Regex.IsMatch(gstin.ToUpper(), pattern);
        }
    }

    public enum CenterStatus
    {
        Active,
        Inactive,
        Pending
    }
}
```

#### Controller:
```csharp
// Controllers/AuthController.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using RadAPI.Models;
using RadAPI.DTOs;

namespace RadAPI.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public AuthController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpPost("deploy-infrastructure")]
        [Authorize]
        public async Task<IActionResult> DeployInfrastructure([FromBody] DeployInfrastructureDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new { error = "VALIDATION FAILED: Invalid input data." });
            }

            // Validate GSTIN if provided
            if (!string.IsNullOrEmpty(dto.GstinNumber) && !Center.ValidateGstin(dto.GstinNumber))
            {
                return BadRequest(new { error = "INVALID GSTIN FORMAT: Please provide a valid 15-digit GSTIN number." });
            }

            // Check for duplicate GSTIN
            if (!string.IsNullOrEmpty(dto.GstinNumber))
            {
                var existingCenter = await _context.Centers
                    .FirstOrDefaultAsync(c => c.GstinNumber == dto.GstinNumber.ToUpper());

                if (existingCenter != null)
                {
                    return Conflict(new { error = "GSTIN CONFLICT: This GSTIN number is already registered." });
                }
            }

            using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                // Get current user ID from JWT claims
                var userId = User.FindFirst("userId")?.Value;

                // Generate unique center ID
                var centerId = $"CTR-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}-{Guid.NewGuid().ToString()[..8]}";

                // Create center
                var center = new Center
                {
                    Id = centerId,
                    Name = dto.CenterName,
                    Address = dto.CenterAddress,
                    GstinNumber = dto.GstinNumber?.ToUpper(),
                    RegistrationNumber = dto.RegistrationNumber?.ToUpper(),
                    Status = CenterStatus.Active,
                    CreatedBy = userId
                };

                _context.Centers.Add(center);

                // Update user
                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    user.CenterId = center.Id;
                    user.Specialization = dto.Specialization;
                    user.Degree = dto.Degree;
                    user.LicenseNo = dto.LicenseNo;
                    user.RegistrationCompleted = true;
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return CreatedAtAction(nameof(DeployInfrastructure), new
                {
                    success = true,
                    message = "Infrastructure deployed successfully",
                    center = new
                    {
                        id = center.Id,
                        name = center.Name,
                        address = center.Address,
                        gstinNumber = center.GstinNumber,
                        registrationNumber = center.RegistrationNumber,
                        status = center.Status.ToString()
                    }
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { error = "DEPLOYMENT FAILED: Infrastructure setup encountered an error." });
            }
        }
    }
}
```

#### DTO:
```csharp
// DTOs/DeployInfrastructureDto.cs
using System.ComponentModel.DataAnnotations;

namespace RadAPI.DTOs
{
    public class DeployInfrastructureDto
    {
        [Required]
        [MaxLength(255)]
        public string CenterName { get; set; }

        [Required]
        public string CenterAddress { get; set; }

        [MaxLength(15)]
        public string? GstinNumber { get; set; }

        [MaxLength(100)]
        public string? RegistrationNumber { get; set; }

        [MaxLength(100)]
        public string? Specialization { get; set; }

        [MaxLength(100)]
        public string? Degree { get; set; }

        [MaxLength(50)]
        public string? LicenseNo { get; set; }
    }
}
```

This comprehensive implementation guide covers the most common backend frameworks and provides complete, production-ready code examples for implementing the GSTIN and Registration Number features in your API.