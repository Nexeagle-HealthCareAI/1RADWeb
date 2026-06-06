using Microsoft.AspNetCore.Mvc;

namespace RadAI;

/// <summary>
/// POST /api/radai/ask   -> the floating assistant calls this.
/// GET  /api/radai/misses-export?days=7&minCount=2  -> admin pulls unanswered
///       questions to feed enrich_knowledge.md.
/// </summary>
[ApiController]
[Route("api/radai")]
public sealed class RadAiController : ControllerBase
{
    private readonly RadAiService _svc;
    private readonly IUnansweredQueryStore _misses;

    public RadAiController(RadAiService svc, IUnansweredQueryStore misses)
    {
        _svc = svc; _misses = misses;
    }

    [HttpPost("ask")]
    public async Task<ActionResult<RadAiAnswer>> Ask([FromBody] RadAiRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Question))
            return BadRequest("question is required.");

        try
        {
            return Ok(await _svc.AskAsync(req, ct));
        }
        catch (HttpRequestException)
        {
            // Gemini unreachable: degrade gracefully instead of erroring the UI.
            return Ok(new RadAiAnswer
            {
                Answer = req.Lang == "hi"
                    ? "माफ़ कीजिए, अभी मदद उपलब्ध नहीं है। कृपया थोड़ी देर बाद कोशिश करें या admin से संपर्क करें।"
                    : "Sorry, help isn't available right now. Please try again shortly or contact your admin.",
                ReplyLanguage = req.Lang == "hi" ? "hi" : "en",
                Covered = true   // service outage, not a knowledge gap — don't log as a miss
            });
        }
    }

    // Admin-only: export the unanswered questions for the weekly enrichment run.
    [HttpGet("misses-export")]
    public async Task<IActionResult> Export([FromQuery] int days = 7, [FromQuery] int minCount = 1, CancellationToken ct = default)
    {
        var rows = await _misses.ExportAsync(DateTime.UtcNow.AddDays(-days), minCount, ct);
        var payload = rows.Select(r => new { question = r.Question, lang = r.Lang, count = r.Count, lastSeen = r.LastSeen });
        return Ok(payload);   // save this JSON as unanswered_queries.json -> feed enrich_knowledge.md
    }
}
