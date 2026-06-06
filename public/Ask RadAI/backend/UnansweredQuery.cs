namespace RadAI;

/// <summary>
/// One question RadAI could not answer from the knowledge file (covered == false).
/// These rows are the fuel for enrich_knowledge.md — the weekly job that grows app_knowledge.json.
/// </summary>
public sealed class UnansweredQuery
{
    public long Id { get; set; }
    public string Question { get; set; } = "";
    public string Lang { get; set; } = "en";
    public string? Screen { get; set; }
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    // De-duplication helper: a normalized form (lowercased, trimmed) so repeats can be counted.
    public string Normalized { get; set; } = "";
}

/// <summary>Persistence boundary. Implement with EF Core, Dapper, or even a JSON file to start.</summary>
public interface IUnansweredQueryStore
{
    Task LogAsync(UnansweredQuery q, CancellationToken ct = default);

    /// <summary>Export for the enrichment job: clusters not needed here, just raw rows with counts.</summary>
    Task<IReadOnlyList<(string Question, string Lang, int Count, DateTime LastSeen)>>
        ExportAsync(DateTime sinceUtc, int minCount = 1, CancellationToken ct = default);
}

// ----------------------------------------------------------------------------
// Minimal starter implementation: append to a JSON-lines file.
// Swap for a DB-backed store when you're ready (recommended for real volume).
// ----------------------------------------------------------------------------
public sealed class JsonlUnansweredQueryStore : IUnansweredQueryStore
{
    private readonly string _path;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public JsonlUnansweredQueryStore(string path) => _path = path;

    public async Task LogAsync(UnansweredQuery q, CancellationToken ct = default)
    {
        q.Normalized = Normalize(q.Question);
        string line = System.Text.Json.JsonSerializer.Serialize(q);
        await _lock.WaitAsync(ct);
        try { await File.AppendAllTextAsync(_path, line + Environment.NewLine, ct); }
        finally { _lock.Release(); }
    }

    public async Task<IReadOnlyList<(string, string, int, DateTime)>> ExportAsync(
        DateTime sinceUtc, int minCount = 1, CancellationToken ct = default)
    {
        if (!File.Exists(_path)) return Array.Empty<(string, string, int, DateTime)>();
        var rows = new List<UnansweredQuery>();
        foreach (var line in await File.ReadAllLinesAsync(_path, ct))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var q = System.Text.Json.JsonSerializer.Deserialize<UnansweredQuery>(line);
            if (q is not null && q.CreatedUtc >= sinceUtc) rows.Add(q);
        }
        return rows
            .GroupBy(r => r.Normalized)
            .Select(g => (g.First().Question, g.First().Lang, g.Count(), g.Max(x => x.CreatedUtc)))
            .Where(t => t.Item3 >= minCount)
            .OrderByDescending(t => t.Item3)
            .ToList();
    }

    private static string Normalize(string s) =>
        new string(s.ToLowerInvariant().Trim().Where(c => !char.IsPunctuation(c)).ToArray());
}
