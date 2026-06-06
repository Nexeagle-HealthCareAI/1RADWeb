// ============================================================================
//  Add to Program.cs to wire up the RadAI ask endpoint + miss logging.
// ============================================================================
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using RadAI;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Gemini key from Key Vault (never hard-code)
string keyVaultUri = builder.Configuration["KeyVault:Uri"]!;
var secretClient = new SecretClient(new Uri(keyVaultUri), new DefaultAzureCredential());
string geminiKey = secretClient.GetSecret("gemini-api-key").Value.Value;

// Where assistant_system_prompt.md + app_knowledge.json live
string packDir = Path.Combine(builder.Environment.ContentRootPath, "resources", "radai");

// Miss store — JSONL to start; swap for a DB store at real volume.
string missPath = Path.Combine(builder.Environment.ContentRootPath, "data", "unanswered_queries.jsonl");
Directory.CreateDirectory(Path.GetDirectoryName(missPath)!);
builder.Services.AddSingleton<IUnansweredQueryStore>(_ => new JsonlUnansweredQueryStore(missPath));

builder.Services.AddSingleton(sp =>
{
    var http = sp.GetRequiredService<IHttpClientFactory>().CreateClient();
    http.Timeout = TimeSpan.FromSeconds(25);
    var misses = sp.GetRequiredService<IUnansweredQueryStore>();
    return new RadAiService(http, packDir, geminiKey, misses);
});

var app = builder.Build();
app.MapControllers();
app.Run();

// ----------------------------------------------------------------------------
//  Setup checklist:
//  1. Put assistant_system_prompt.md + app_knowledge.json in resources/radai/
//     (Copy to Output Directory = Copy if newer).
//  2. dotnet add package Azure.Identity / Azure.Security.KeyVault.Secrets
//  3. Frontend: in radai_assistant.html set USE_BACKEND=true, BACKEND_URL="/api/radai/ask".
//  4. Weekly: GET /api/radai/misses-export?days=7&minCount=2 -> save as
//     unanswered_queries.json -> run enrich_knowledge.md in your VS Code agent.
//  5. (Perf) Enable Gemini context caching on the system-prompt + knowledge prefix.
// ----------------------------------------------------------------------------
