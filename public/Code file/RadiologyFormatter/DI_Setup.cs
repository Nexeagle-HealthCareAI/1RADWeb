// ============================================================================
//  Add this to your Program.cs to wire the service up.
//  Requires: Azure.Security.KeyVault.Secrets + Azure.Identity NuGet packages.
// ============================================================================

using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using RadiologyFormatter;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHttpClient();   // provides IHttpClientFactory / HttpClient

// --- Resolve the Gemini API key from Azure Key Vault (never hard-code it) ---
string keyVaultUri = builder.Configuration["KeyVault:Uri"]!;          // e.g. https://my-vault.vault.azure.net/
var secretClient = new SecretClient(new Uri(keyVaultUri), new DefaultAzureCredential());
string geminiKey = secretClient.GetSecret("gemini-api-key").Value.Value;

// --- Where the knowledge-pack files live (copy them into the app output) ---
string packDir = Path.Combine(builder.Environment.ContentRootPath, "resources", "radiology");

// --- Register the formatter as a singleton (loads pack files once) ---
builder.Services.AddSingleton(sp =>
{
    var http = sp.GetRequiredService<IHttpClientFactory>().CreateClient();
    http.Timeout = TimeSpan.FromSeconds(30);
    return new RadiologyFormatterService(http, packDir, geminiKey);
});

var app = builder.Build();
app.MapControllers();
app.Run();

// ----------------------------------------------------------------------------
//  Project setup checklist:
//  1. Put the 5 pack files in  <project>/resources/radiology/
//     (system_prompt.md, report_templates.json, radiology_lexicon.json,
//      few_shot_examples.json, output_schema.json)
//     and set "Copy to Output Directory = Copy if newer" on each.
//  2. dotnet add package Azure.Identity
//     dotnet add package Azure.Security.KeyVault.Secrets
//  3. Store the Gemini key in Key Vault as secret "gemini-api-key".
//  4. Call POST /api/reports/format with:
//     { "modality":"USG", "testCode":"USG_ABDOMEN",
//       "rawText":"liver normal echotexure ... rt kidney 9.2 cm ...",
//       "houseSpelling":"US", "assumeUnmentionedNormal":true }
// ----------------------------------------------------------------------------
