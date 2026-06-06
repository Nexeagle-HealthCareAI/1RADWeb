using System.Text.Json.Serialization;

namespace RadiologyFormatter;

// ---------- Request coming from your booking/report screen ----------
public sealed class FormatRequest
{
    public string Modality { get; set; } = "";          // "USG", "XRAY", "CT", "MRI"
    public string TestCode { get; set; } = "";          // e.g. "USG_ABDOMEN"
    public string RawText { get; set; } = "";           // radiologist dictation / typed findings
    public string HouseSpelling { get; set; } = "US";   // "US" or "UK"
    public bool AssumeUnmentionedNormal { get; set; } = true;
}

// ---------- What Gemini returns (matches output_schema.json) ----------
public sealed class FormatterOutput
{
    [JsonPropertyName("formatted_report")]
    public string FormattedReport { get; set; } = "";

    [JsonPropertyName("sections")]
    public Dictionary<string, string> Sections { get; set; } = new();

    [JsonPropertyName("corrections")]
    public List<Correction> Corrections { get; set; } = new();

    [JsonPropertyName("flags")]
    public List<Flag> Flags { get; set; } = new();

    [JsonPropertyName("unchanged_protected")]
    public List<string> UnchangedProtected { get; set; } = new();
}

public sealed class Correction
{
    [JsonPropertyName("from")] public string From { get; set; } = "";
    [JsonPropertyName("to")]   public string To   { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = ""; // spelling|grammar|style|abbreviation
}

public sealed class Flag
{
    [JsonPropertyName("text")]  public string Text  { get; set; } = "";
    [JsonPropertyName("issue")] public string Issue { get; set; } = "";
}
