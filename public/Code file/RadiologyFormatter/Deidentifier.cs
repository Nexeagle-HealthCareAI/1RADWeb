using System.Text.RegularExpressions;

namespace RadiologyFormatter;

/// <summary>
/// Strips obvious patient identifiers from free text before it is sent to the AI.
///
/// IMPORTANT: This is a safety net, not the primary control. The RIGHT approach is:
/// your report editor sends ONLY the clinical findings text — never the header that
/// contains the patient's name / ID / DOB. Keep identifiers in your own structured
/// fields and re-attach them to the formatted report AFTER Gemini returns.
///
/// Tune these patterns to your data and review with whoever owns compliance.
/// </summary>
public static class Deidentifier
{
    private static readonly (Regex rx, string token)[] Rules =
    {
        // Phone numbers (Indian 10-digit, with optional +91)
        (new Regex(@"(\+?91[\-\s]?)?[6-9]\d{9}\b", RegexOptions.Compiled), "{{PHONE}}"),
        // Dates like 12/03/1980, 12-03-80, 1980-03-12
        (new Regex(@"\b\d{1,4}[/\-]\d{1,2}[/\-]\d{1,4}\b", RegexOptions.Compiled), "{{DATE}}"),
        // Email
        (new Regex(@"\b[\w.\-]+@[\w.\-]+\.\w+\b", RegexOptions.Compiled), "{{EMAIL}}"),
        // Common labels followed by a value: "Name: ...", "Patient: ...", "MRN: ...", "UHID: ..."
        (new Regex(@"(?im)\b(name|patient|pt|mrn|uhid|reg(?:istration)?\s*(?:no|id)?|id)\s*[:\-]\s*\S.*$",
                   RegexOptions.Compiled), "{{IDENTIFIER}}"),
    };

    public static string Strip(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return text ?? "";
        foreach (var (rx, token) in Rules)
            text = rx.Replace(text, token);
        return text;
    }
}
