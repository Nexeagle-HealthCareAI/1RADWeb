# RadAI — The Self-Improving Loop (full kit)

This kit makes RadAI's knowledge file build itself from your codebase and then improve itself from real user questions — with a human approving every change.

## The whole loop

```
        ┌─────────────────────────────────────────────────────────┐
        │  CLAUDE.md  (project memory — agent reads every session)  │
        └─────────────────────────────────────────────────────────┘
                                  │
  Phase 1 ── INSTRUCTIONS_for_coding_agent.md ──► research_notes.md  (+ citations)
                                  │
  Phase 2 ── (same instructions) ─────────────► app_knowledge.json + source_map.json
                                  │
                          RadAI runs (Flash)
                                  │
                user asks → covered? ──no──► logged to unanswered_queries
                                  │
  Phase 3 ── enrich_knowledge.md ◄── misses-export ──┘
                                  │
                     proposes a DIFF → human approves → merge → repeat
```

## Files in this kit

| File | Phase | What it does |
|---|---|---|
| `CLAUDE.md` | all | Repo memory the agent auto-loads: conventions, the golden rule, where to look, definition of done. **Put at repo root.** |
| `INSTRUCTIONS_for_coding_agent.md` | 1–2 | The build playbook: research the app, then write the knowledge file. |
| `research_notes_TEMPLATE.md` | 1 | Scaffold for the evidence map, with a coverage checklist. |
| `app_knowledge.json` | 2 | The knowledge base RadAI answers from (reference copy already built). |
| `source_map.example.json` | 2 | The citation file — every entry → its source code. |
| `assistant_system_prompt.md` | run | Flash's rules; now also returns `covered` for miss-logging. |
| `backend/*` | run + 3 | C# ask endpoint, Flash call, and miss-logging. |
| `enrich_knowledge.md` | 3 | Turns logged questions into a reviewable diff. |

## What makes the agent fast & accurate (the levers)

1. **`CLAUDE.md` at the root.** The agent reads it automatically, so it never re-learns your conventions, paths, or rules. Fill in the "Where to look" paths once — this alone removes most wasted searching.
2. **Source map = no hallucination + easy updates.** Because every entry cites its code, the agent (and you) can re-verify instantly, and the "no citation, no entry" rule blocks invented features.
3. **Phased with a checkpoint.** Research → review → build. Reviewing `research_notes.md` before Phase 2 catches mistakes when they're cheap.
4. **`covered` flag → automatic gap detection.** RadAI tells you what it didn't know. You never guess what to improve; the misses list is the to-do list.
5. **Diff, never auto-merge.** Enrichment proposes; a human approves. Safe to run often.
6. **Context caching.** The system prompt + knowledge file are identical every call — cache that prefix in Gemini so each question is cheap and fast at clinic volume.

## Run it — first build

1. Drop `CLAUDE.md`, `INSTRUCTIONS_for_coding_agent.md`, `research_notes_TEMPLATE.md` into the repo. Fill the paths in `CLAUDE.md`.
2. In VS Code, tell the agent: *"Follow INSTRUCTIONS_for_coding_agent.md. Do Phase 1 only, then stop for my review."*
3. Review `research_notes.md` (check the OPEN QUESTIONS). Then: *"Proceed to Phase 2."*
4. You get `app_knowledge.json` + `source_map.json`. Point RadAI at the knowledge file.

## Run it — weekly improvement

1. `GET /api/radai/misses-export?days=7&minCount=2` → save as `unanswered_queries.json`.
2. In VS Code: *"Follow enrich_knowledge.md against unanswered_queries.json."*
3. Review the printed summary table + diff. Approve → merge. Bucket-C items go to `feature_requests.md`.

That's the entire self-improving cycle: build from code once, then let real questions grow it — with you in the loop on every change.

## One backend change to note

Add the `covered` boolean to the assistant output (already updated in `assistant_system_prompt.md`): RadAI sets it `false` when it falls back to support. The backend logs those as misses. No `covered=false`, nothing to log — and the loop quietly tells you the file is in good shape.
