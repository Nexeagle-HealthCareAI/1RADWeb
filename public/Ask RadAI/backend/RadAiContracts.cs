using System.Text.Json.Serialization;

namespace RadAI;

// ---- Request from the floating assistant ----
public sealed class RadAiRequest
{
    public string Question { get; set; } = "";
    public string Lang { get; set; } = "en";     // user's selected language hint: "en" | "hi"
    public string? Screen { get; set; }           // current app screen, for analytics (optional)
}

// ---- What Flash returns (and what we send back to the browser) ----
// NOTE: 'Covered' is the new field that powers miss-logging. Add it to
// assistant_system_prompt.md output instructions:
//   "covered": true if the knowledge base answered the question,
//              false if you used the support fallback.
public sealed class RadAiAnswer
{
    [JsonPropertyName("answer")]
    public string Answer { get; set; } = "";

    [JsonPropertyName("reply_language")]
    public string ReplyLanguage { get; set; } = "en";  // "en" | "hi"

    [JsonPropertyName("suggested_followups")]
    public List<string> SuggestedFollowups { get; set; } = new();

    [JsonPropertyName("covered")]
    public bool Covered { get; set; } = true;          // false => log as a miss
}
