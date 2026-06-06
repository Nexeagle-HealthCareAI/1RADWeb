using Microsoft.AspNetCore.Mvc;

namespace RadiologyFormatter;

/// <summary>
/// POST /api/reports/format
/// Body: FormatRequest. Returns FormatterOutput (the AI draft + corrections + flags).
/// The draft is NOT a final report — your UI shows it for radiologist review/sign-off.
/// </summary>
[ApiController]
[Route("api/reports")]
public sealed class FormatterController : ControllerBase
{
    private readonly RadiologyFormatterService _formatter;

    public FormatterController(RadiologyFormatterService formatter) => _formatter = formatter;

    [HttpPost("format")]
    public async Task<ActionResult<FormatterOutput>> Format(
        [FromBody] FormatRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.RawText))
            return BadRequest("raw_text is required.");

        try
        {
            FormatterOutput result = await _formatter.FormatAsync(req, ct);
            return Ok(result);   // your frontend highlights corrections (yellow) and flags (red)
        }
        catch (HttpRequestException ex)
        {
            // Gemini unreachable or rate-limited: never block report delivery.
            // Fall back to the raw text so staff can format manually.
            return StatusCode(503, new { message = "Formatting service unavailable.", detail = ex.Message });
        }
    }
}
