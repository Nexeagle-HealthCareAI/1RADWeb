# Radiology Report Formatter — Knowledge Pack

A drop-in pack that makes Gemini Flash format radiology reports precisely: organized sections, corrected spelling, fixed grammar, house style — with full safety guardrails. **You do not train the model.** You equip it with these files at request time. The system gets "smarter" as you grow the lexicon and examples from your own reports.

## Files

| File | What it is | How code uses it |
|---|---|---|
| `system_prompt.md` | The instructions + safety rules for the model | Send as the system instruction on every call |
| `report_templates.json` | Per-modality section skeletons, organ order, normal-default lines (X-ray, USG, CT, MRI) | Look up by `modality`+`test_code`; inject the matching template into the prompt |
| `radiology_lexicon.json` | Spelling corrections, protected terms, ambiguous pairs, abbreviations, style rules | Inject `corrections`/`protected_patterns`/`abbreviations`/`style_rules` into the prompt; also usable as a pre/post pass |
| `few_shot_examples.json` | Worked raw→formatted examples per modality | Inject 1–2 matching examples per call |
| `output_schema.json` | JSON schema the model must return | Pass as Gemini `responseSchema` for guaranteed-parseable output |

## How a single call is assembled

```
[system instruction]  = system_prompt.md
[context block]       = matching template (report_templates.json)
                      + lexicon excerpts (radiology_lexicon.json)
                      + 1-2 matching few-shot examples (few_shot_examples.json)
[user message]        = { modality, test_code, house_spelling,
                          assume_unmentioned_normal, raw_text }
[generationConfig]    = responseMimeType: application/json,
                        responseSchema: output_schema.json,
                        temperature: 0.0-0.2   (low = precise, deterministic)
```

The template + lexicon + examples are **identical across calls for the same modality**, so put them in a **cached prefix** (Gemini context caching). That cuts cost and latency a lot at clinic volume.

## Java (Gemini SDK) sketch

```java
Client client = Client.builder().apiKey(keyFromKeyVault).build();

String systemInstruction = load("system_prompt.md");
String context = buildContext(modality, testCode);   // template + lexicon + examples
String userMsg = toJson(Map.of(
    "modality", modality, "test_code", testCode,
    "house_spelling", "US", "assume_unmentioned_normal", true,
    "raw_text", deidentifiedRawText));

GenerateContentConfig cfg = GenerateContentConfig.builder()
    .systemInstruction(Content.fromParts(Part.fromText(systemInstruction + "\n\n" + context)))
    .responseMimeType("application/json")
    .responseSchema(/* parse output_schema.json */)
    .temperature(0.1f)
    .build();

GenerateContentResponse resp =
    client.models.generateContent("gemini-2.5-flash", userMsg, cfg);

FormatterOutput out = parse(resp.text());   // formatted_report, corrections, flags...
```

(.NET: same idea via REST `:generateContent` with `responseSchema` in `generationConfig`.)

## The review UI (this is where the speed comes from)

Render `formatted_report`, but:
- highlight every `corrections[].from→to` in **yellow** (radiologist glances, doesn't re-read)
- show every `flags[]` item in **red** — these are the only things needing a real decision
- show `unchanged_protected` as a small "measurements/laterality preserved" reassurance line

Radiologist reviews highlights → edits if needed → signs. **Nothing is finalized without sign-off.**

## Making it a "master" over time (the important part)

1. **Capture corrections.** When the radiologist edits the AI draft, diff final vs draft. Every recurring fix → add to `radiology_lexicon.json` → `corrections`, or refine a template.
2. **Replace example outputs with real reports.** Swap the `output` side of `few_shot_examples.json` with your radiologist's own finalized (de-identified) reports. Their wording is the best house-style teacher.
3. **Add your tests.** The pack covers common X-ray/USG/CT/MRI tests; add any test your centre does by copying a template block.
4. **Keep one house spelling style** (US or UK) — set in the lexicon `spelling_style.active`.

A monthly 15-minute pass over the lexicon does more for quality than any model change.

## Safety / compliance reminders

- **De-identify `raw_text` before it leaves your backend** (strip name/ID/DOB). The model only needs clinical text.
- Free Gemini tier may train on inputs — use de-identification, or paid Tier-1 (no training) for production with any residual PHI.
- Output is **assistive only**; a radiologist signs every report. Log model version + prompt version with each draft for traceability.
- Before clinical go-live, confirm your local regulatory expectations for assistive radiology software with whoever handles the centre's compliance.

## Suggested rollout

1. Wire one modality (USG abdomen — highest volume) end to end.
2. Run 30 past de-identified reports through it; compare draft vs final. This is your eval set.
3. If the radiologist says it saves time, expand to the other modalities and turn on caching.
