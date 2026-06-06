# Radiology Formatter — C# / .NET Service

A ready-to-adapt ASP.NET Core service that calls Gemini Flash with the knowledge pack and returns a clean, reviewable report draft.

## Files

| File | Role |
|---|---|
| `Models.cs` | Request (`FormatRequest`) and response (`FormatterOutput`) types |
| `Deidentifier.cs` | Strips patient identifiers before text leaves your backend |
| `RadiologyFormatterService.cs` | Loads the pack, builds the prompt, calls Gemini, parses the JSON |
| `FormatterController.cs` | `POST /api/reports/format` endpoint |
| `DI_Setup.cs` | Program.cs wiring (Key Vault + HttpClient + singleton) |

It depends on the 5 knowledge-pack files from the parent folder — copy them into `<project>/resources/radiology/`.

## Wire-up in 5 steps

1. Copy the 5 `Cs` files into your project (namespace `RadiologyFormatter`).
2. Copy the pack files into `resources/radiology/` and set **Copy to Output Directory → Copy if newer**.
3. `dotnet add package Azure.Identity` and `dotnet add package Azure.Security.KeyVault.Secrets`.
4. Store the Gemini key in Key Vault as `gemini-api-key`; set `KeyVault:Uri` in config.
5. Merge the lines from `DI_Setup.cs` into your `Program.cs`.

## Call it

```http
POST /api/reports/format
Content-Type: application/json

{
  "modality": "USG",
  "testCode": "USG_ABDOMEN",
  "rawText": "liver normal echotexure no focal lesion. gb 8mm calculus. rt kidney 9.2 cm normal. lt kidney mild hydronephrosis with 6mm calculas at pelvis. no free fluid",
  "houseSpelling": "US",
  "assumeUnmentionedNormal": true
}
```

Returns `FormatterOutput`: `formattedReport`, `sections`, `corrections[]`, `flags[]`, `unchangedProtected[]`.

## In your UI

- Render `formattedReport`.
- Highlight each `corrections[].from → to` in yellow (quick glance).
- Show each `flags[]` item in red — the only items needing a real decision.
- Radiologist edits if needed → **signs**. Never finalize without sign-off.

## Notes baked into the code

- **Temperature 0.1** for precise, repeatable output.
- **`responseSchema`** is built inline in `BuildResponseSchema()` as the Gemini-compatible subset (Gemini rejects full JSON-Schema keywords like `$schema`/`additionalProperties`). `output_schema.json` remains the human-readable contract.
- **Graceful fallback**: if Gemini is down or rate-limited, the controller returns 503 and you keep the raw text so report delivery is never blocked.
- **Caching**: template+lexicon+examples are identical per modality — wire Gemini context caching on that prefix to cut cost/latency at peak. (Add once the basic flow works.)

## Prove it without the app first

Paste `system_prompt.md` into [Google AI Studio](https://aistudio.google.com) System Instructions, paste one template + one example, type a messy finding, run. Same loop, manual.
