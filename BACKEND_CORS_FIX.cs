// Add this to your .NET API to fix CORS for mobile web testing
// File: Program.cs or Startup.cs

// Add this BEFORE app.UseAuthorization()
app.UseCors(policy => 
    policy
        .WithOrigins(
            "http://localhost:8081",      // Expo web dev server
            "http://localhost:19006",     // Alternative Expo port
            "http://localhost:3000",      // Web app
            "https://yourdomain.com"      // Production web domain
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials()
);

// OR for development only (less secure but easier):
app.UseCors(policy => 
    policy
        .AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader()
);
