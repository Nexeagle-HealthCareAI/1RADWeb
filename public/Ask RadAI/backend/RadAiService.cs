using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace RadAI;

/// <summary>
/// Calls Gemini Flash to answer a user's "how do I..." question, grounded on
/// assistant_system_prompt.md + app_knowledge.json. Logs a miss whenever the
/// answer was not covered by the knowledge file, so the file can be grown later.
///
/// Register as a singleton (loads the pack once). The cheap, fast win:
/// the system prompt + knowledge file are identical on every call -> enable
/// Gemini context caching on that prefix.
/// </summary>
public sealed class RadAiService
{
    private const string Model = "gemini-2.5-flash";
    private const string Endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/" + Model + ":generateContent";

    private readonly HttpClient _http;
    private readonly string _apiKey;
    private readonly IUnansweredQueryStore _misses;
    private readonly string _systemPrompt;
    private readonly string _knowledge;     // app_knowledge.json as raw text

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public RadAiService(HttpClient http, string packDir, string apiKey, IUnansweredQueryStore misses)
    {
        _http = http;
        _apiKey = apiKey;
        _misses = misses;
        _systemPrompt = File.ReadAllText(Path.Combine(packDir, "assistant_system_prompt.md"));
        _knowledge    = File.ReadAllText(Path.Combine(packDir, "app_knowledge.json"));
    }

    public async Task<RadAiAnswer> AskAsync(RadAiRequest req, CancellationToken ct = default)
    {
        var body = new
        {
            systemInstruction = new
            {
                parts = new[] { new { text = _systemPrompt + "\n\n=== APP KNOWLEDGE (answer ONLY from this) ===\n" + _knowledge } }
            },
            contents = new[]
            {
                new { role = "user", parts = new[] { new { text =
                    $"User language hint: {req.Lang}\nUser question: {req.Question}" } } }
            },
            generationConfig = new
            {
                temperature = 0.2,
                responseMimeType = "application/json",
                responseSchema = BuildSchema()
            }
        };

        using var msg = new HttpRequestMessage(HttpMethod.Post, Endpoint);
        msg.Headers.Add("x-goog-api-key", _apiKey);
        msg.Content = JsonContent.Create(body);

        using var resp = await _http.SendAsync(msg, ct);
        resp.EnsureSuccessStatusCode();

        var env = await resp.Content.ReadFromJsonAsync<JsonNode>(cancellationToken: ct)
                  ?? throw new InvalidOperationException("Empty Gemini response.");
        string text = env["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>()
                      ?? throw new InvalidOperationException("No text part in Gemini response.");

        var answer = JsonSerializer.Deserialize<RadAiAnswer>(text, JsonOpts)
                     ?? throw new InvalidOperationException("Could not parse RadAI answer.");

        // ---- Miss-logging: this is what fuels enrich_knowledge.md ----
        if (!answer.Covered)
        {
            // fire-and-forget so the user isn't slowed down
            _ = _misses.LogAsync(new UnansweredQuery
            {
                Question = req.Question, Lang = req.Lang, Screen = req.Screen
            }, CancellationToken.None);
        }

        return answer;
    }

    // Gemini-compatible schema (subset of JSON Schema).
    private static object BuildSchema() => new
    {
        type = "object",
        properties = new
        {
            answer = new { type = "string" },
            reply_language = new { type = "string", @enum = new[] { "en", "hi" } },
            suggested_followups = new { type = "array", items = new { type = "string" } },
            covered = new { type = "boolean" }
        },
        required = new[] { "answer", "reply_language", "suggested_followups", "covered" }
    };
}
