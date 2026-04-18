// =============================================================================
// PROGRAM.CS UPDATES FOR YOUR .NET API PROJECT
// =============================================================================

// ADD THIS LINE TO YOUR EXISTING Program.cs or Startup.cs
// In the section where you register services:

// Services
builder.Services.AddScoped<ICenterService, CenterService>();

// =============================================================================
// COMPLETE EXAMPLE OF WHAT YOUR Program.cs SHOULD LOOK LIKE:
// =============================================================================

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