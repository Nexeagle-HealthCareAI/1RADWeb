// =============================================================================
// DBCONTEXT UPDATES FOR YOUR .NET API PROJECT
// =============================================================================

// ADD THIS TO YOUR EXISTING ApplicationDbContext.cs
// In the OnModelCreating method:

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

    // ... your other entity configurations
}