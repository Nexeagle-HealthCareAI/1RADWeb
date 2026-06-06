# CLAUDE.md — Project Memory for the RadAI Knowledge Work

> Place this file at the **repo root**. Your VS Code agent reads it automatically every session, so you don't have to re-explain the project each time. Keep it short and current — it is the single biggest lever for making the agent fast and accurate. Update it when conventions change.

## What this project is

1rad is a diagnostic-centre app (appointments + billing + radiology reporting). **RadAI** is its in-app help assistant. RadAI answers "how do I…" questions using ONE grounding file, `app_knowledge.json`. Our job here is to keep that file accurate and growing.

## The one rule that matters most

**Never document a feature, button, field, or step that is not in the code.** If you can't find it in source, it does not go in the knowledge file. When unsure → add it to OPEN QUESTIONS or route it to the support fallback. A help assistant that confidently describes a button that doesn't exist is worse than none.

## Files you own (keep these in sync)

| File | What it is | Rule |
|---|---|---|
| `app_knowledge.json` | The knowledge base RadAI answers from | Match the existing schema exactly. Read it before editing. |
| `source_map.json` | `module_id / faq_id → [source files]` | Every knowledge entry MUST have a source-map entry. No citation = not allowed. |
| `research_notes.md` | Evidence map from the codebase | Built in Phase 1, with file+line citations. |
| `unanswered_queries.*` | Questions RadAI couldn't answer | Input for enrichment. Do not edit by hand. |

The canonical schema and conventions live in `app_knowledge.json` itself — when in doubt, copy its shape.

## Where to look in this codebase (fill in for your repo)

> Update these paths once, so the agent jumps straight to the right place instead of searching every time.

- Frontend screens/components: `<path>` (e.g. `src/pages`, `src/components`)
- On-screen labels/text: `<path>` (read real button/field text from here, never invent)
- Backend endpoints/controllers: `<path>`
- Business rules / services: `<path>` (discount limits, approval triggers live here)
- DB models / migrations: `<path>` (real field names + which are mandatory)
- Roles / auth guards: `<path>` (who can do what)
- RadAI backend (ask endpoint + miss logging): `<path>`

## How to derive each part of the knowledge file (fast path)

- **`how_to` steps** ← read the screen component + its form, list fields in UI order. Use the exact on-screen labels.
- **mandatory fields / `rules`** ← read validation (`required`, `@NotNull`, validators) and backend conditionals. Quote the condition in `research_notes.md`.
- **approval rules** ← find the "after payment" branch that creates an approval; note the type and who approves.
- **`roles.can/cannot`** ← read auth guards / `[Authorize(Roles=...)]`.
- **`faqs`** ← the confusing moments (why a popup appeared, why nothing happened after submit, why a field is mandatory).

## Definition of Done (check before you finish any task)

1. `app_knowledge.json` parses as valid JSON.
2. Every new/changed entry has a `source_map.json` citation.
3. Every `how_to` step maps to a real UI element you can point to in code.
4. Mandatory-field and approval rules match the actual validation in code.
5. Answers are short, plain, spoken-friendly (RadAI reads them aloud): no markdown, no jargon, no internal IDs.
6. `suggested_chips` reflect the most common real questions.
7. `_meta.version` bumped + one-line changelog appended.

## Style for knowledge content (it gets spoken aloud)

- Steps: max ~6, one short line each, imperative ("Open the bill", "Enter the reason").
- Plain words a busy receptionist understands. Keep app/feature names in English even inside Hindi answers.
- No emojis, no markdown symbols, no field keys or IDs in user-facing text.

## Commands / workflows

- Build/refresh the knowledge file: follow `INSTRUCTIONS_for_coding_agent.md` (Phases 1→2).
- Weekly enrichment from real questions: follow `enrich_knowledge.md` (Phase 3). It must output a **diff for human review** — never auto-merge a change that asserts a feature exists without a code citation.
- When a feature changes in a PR: update its module in `app_knowledge.json` AND its `source_map.json` entry in the **same PR**. The knowledge file ships with the code.

## Hard constraints (do NOT)

- Do NOT invent features or guess steps.
- Do NOT auto-merge enrichment changes; propose a diff.
- Do NOT put PHI, patient data, or secrets into the knowledge file or notes.
- Do NOT change `app_knowledge.json`'s schema/shape without updating the assistant prompt and prototype that consume it.
