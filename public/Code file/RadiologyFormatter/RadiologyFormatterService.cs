using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace RadiologyFormatter;

/// <summary>
/// Calls Gemini Flash to format a radiology report using the knowledge pack
/// (system_prompt.md + report_templates.json + radiology_lexicon.json + few_shot_examples.json).
///
/// Register once as a singleton; it loads the pack files at construction.
/// </summary>
public sealed class RadiologyFormatterService
{
    private const string Model = "gemini-2.5-flash";
    private const string Endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/" + Model + ":generateContent";

    private readonly HttpClient _http;
    private readonly string _apiKey;          // pull from Azure Key Vault, NOT appsettings
    private readonly string _systemPrompt;
    private readonly JsonNode _templates;
    private readonly JsonNode _lexicon;
    private readonly JsonNode _examples;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    /// <param name="packDir">Folder containing the knowledge-pack files.</param>
    /// <param name="apiKey">Gemini API key (load from Key Vault).</param>
    public RadiologyFormatterService(HttpClient http, string packDir, string apiKey)
    {
        _http = http;
        _apiKey = apiKey;
        _systemPrompt = File.ReadAllText(Path.Combine(packDir, "system_prompt.md"));
        _templates = JsonNode.Parse(File.ReadAllText(Path.Combine(packDir, "report_templates.json")))!;
        _lexicon   = JsonNode.Parse(File.ReadAllText(Path.Combine(packDir, "radiology_lexicon.json")))!;
        _examples  = JsonNode.Parse(File.ReadAllText(Path.Combine(packDir, "few_shot_examples.json")))!;
    }

    public async Task<FormatterOutput> FormatAsync(FormatRequest req, CancellationToken ct = default)
    {
        // 1. SAFETY: strip patient identifiers before anything leaves the building.
        string deidentified = Deidentifier.Strip(req.RawText);

        // 2. Assemble the context block (template + lexicon + one matching example).
        string context = BuildContext(req.Modality, req.TestCode);

        // 3. The user message is a small JSON object the prompt knows how to read.
        var userPayload = JsonSerializer.Serialize(new
        {
            modality = req.Modality,
            test_code = req.TestCode,
            house_spelling = req.HouseSpelling,
            assume_unmentioned_normal = req.AssumeUnmentionedNormal,
            raw_text = deidentified
        });

        // 4. Build the Gemini REST body.
        var body = new
        {
            systemInstruction = new
            {
                parts = new[] { new { text = _systemPrompt + "\n\n=== CONTEXT ===\n" + context } }
            },
            contents = new[]
            {
                new { role = "user", parts = new[] { new { text = userPayload } } }
            },
            generationConfig = new
            {
                temperature = 0.1,
                responseMimeType = "application/json",
                responseSchema = BuildResponseSchema()   // Gemini-compatible subset
            }
        };

        using var msg = new HttpRequestMessage(HttpMethod.Post, Endpoint);
        msg.Headers.Add("x-goog-api-key", _apiKey);
        msg.Content = JsonContent.Create(body);

        using var resp = await _http.SendAsync(msg, ct);
        resp.EnsureSuccessStatusCode();

        // 5. Dig the model's JSON text out of the Gemini envelope, then deserialize.
        var env = await resp.Content.ReadFromJsonAsync<JsonNode>(cancellationToken: ct)
                  ?? throw new InvalidOperationException("Empty Gemini response.");

        string modelText = env["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>()
                           ?? throw new InvalidOperationException("No text part in Gemini response.");

        return JsonSerializer.Deserialize<FormatterOutput>(modelText, JsonOpts)
               ?? throw new InvalidOperationException("Could not parse formatter output.");
    }

    /// <summary>
    /// Glue the template for this test + the lexicon + one matching few-shot example
    /// into a single text block. Identical per modality => cache it (see README).
    /// </summary>
    private string BuildContext(string modality, string testCode)
    {
        var template = _templates["modalities"]?[modality]?["tests"]?[testCode];
        if (template is null)
            throw new ArgumentException($"No template for {modality}/{testCode} in report_templates.json");

        // First example whose test_code matches (fall back to same modality).
        JsonNode? example = null;
        if (_examples["examples"] is JsonArray arr)
        {
            example = arr.FirstOrDefault(e => (string?)e?["test_code"] == testCode)
                   ?? arr.FirstOrDefault(e => (string?)e?["modality"] == modality);
        }

        return
            "TEMPLATE (use these sections, organ order, and normal-default lines):\n" +
            template.ToJsonString() + "\n\n" +
            "LEXICON (apply corrections; never alter protected_patterns; flag ambiguous_pairs):\n" +
            _lexicon.ToJsonString() + "\n\n" +
            "EXAMPLE (match this house style and corrections/flags behavior):\n" +
            (example?.ToJsonString() ?? "(none)");
    }

    /// <summary>
    /// Gemini's responseSchema accepts an OpenAPI subset (type/properties/required/items/enum).
    /// This is the runtime-safe version of output_schema.json (which is full JSON-Schema for docs).
    /// </summary>
    private static object BuildResponseSchema() => new
    {
        type = "object",
        properties = new
        {
            formatted_report = new { type = "string" },
            sections = new
            {
                type = "object",
                properties = new
                {
                    CLINICAL_HISTORY = new { type = "string" },
                    TECHNIQUE = new { type = "string" },
                    COMPARISON = new { type = "string" },
                    FINDINGS = new { type = "string" },
                    IMPRESSION = new { type = "string" }
                }
            },
            corrections = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        from = new { type = "string" },
                        to = new { type = "string" },
                        type = new { type = "string", @enum = new[] { "spelling", "grammar", "style", "abbreviation" } }
                    },
                    required = new[] { "from", "to", "type" }
                }
            },
            flags = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        text = new { type = "string" },
                        issue = new { type = "string" }
                    },
                    required = new[] { "text", "issue" }
                }
            },
            unchanged_protected = new { type = "array", items = new { type = "string" } }
        },
        required = new[] { "formatted_report", "sections", "corrections", "flags", "unchanged_protected" }
    };
}
