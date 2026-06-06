# Instructions for the Coding Agent — Build & Maintain the RadAI Knowledge File

Paste this into your VS Code agent (Opus) at the root of the 1rad codebase. It has three phases: **Research → Build → Grow**. Do the phases in order. Do not skip Research — the whole value depends on the knowledge file describing what the app *actually* does, not what it might do.

---

## ROLE

You are documenting the 1rad application so an in-app AI assistant ("RadAI") can answer users' "how do I…" questions accurately. Your output is a single grounding file, `app_knowledge.json`, plus a source map that links each entry back to the code so it stays maintainable.

**Golden rule:** every step, button, field, and rule you write must trace to something real in the codebase. If you cannot find it in the code, do not write it. No invented features.

---

## PHASE 1 — RESEARCH THE APPLICATION

Goal: produce `research_notes.md` — a complete, evidence-based map of what the app does, before writing any knowledge file.

**1.1 Map the structure.** Identify the stack and where things live:
- Frontend: routes/pages, screen components, forms, buttons, labels, navigation menus.
- Backend: controllers/endpoints, services, business rules, validation.
- Data: DB models/migrations/entities — the real field names and constraints.
- Config: roles/permissions, feature flags.
- Existing docs: README, wiki, comments, API specs.

**1.2 For each user-facing feature, extract the truth from code:**
- **Where it lives** — the screen/route and the menu path a user clicks.
- **The exact steps** — derive them from the UI components and the form fields, in the order the user actually does them. Use the real on-screen labels (read them from the templates/JSX/HTML, not from memory).
- **The fields** — names, which are mandatory (look at validation: `required`, `@NotNull`, form validators), defaults.
- **The rules** — pulled from backend validation and conditionals. Example: where is the discount-limit check? Where is the "needs approval after payment" branch? Quote the condition in your notes.
- **Permissions** — which roles can do it (look at auth guards, `[Authorize]`, role checks).
- **What happens after** — status changes, side effects (commission recalculated, refund entry, badge shown).

**1.3 Trace the key workflows end to end** (these matter most for a help assistant):
- Booking (including the mandatory referred-by, Self button, slot logic).
- Billing + discount (the assigned-limit popup, commission vs discount, add-to-centre).
- The approval flows: payment edit, cancel-after-payment, referrer change, free test, concession. Document the exact trigger condition (usually "after payment") and who approves.
- Referral hub, admin board search/filters, report formatter.

**1.4 Record evidence.** For every feature in `research_notes.md`, cite the source files and line ranges you derived it from. This is non-negotiable — it makes the knowledge file verifiable and updatable. Format:

```
### Feature: Mark a test free
Screen: BillingPage.tsx (MarkFree button, line ~210)
Rule: BillingService.markFree() requires approval -> ApprovalService.create(type=FREE_TEST) (line ~88)
Effect: sets payable/income/commission = 0 (BillingService line ~95)
Roles: front-desk can request; admin approves (ApprovalsController [Authorize(Roles="Admin,AdminDoctor")])
```

**1.5 List the gaps.** Anything ambiguous or not found in code → put under "OPEN QUESTIONS" in the notes for a human to confirm. Do NOT guess to fill a gap.

Stop here and let me review `research_notes.md` before Phase 2 if anything is uncertain.

---

## PHASE 2 — BUILD THE KNOWLEDGE FILE

Goal: produce `app_knowledge.json`, matching the existing schema (see "SCHEMA" below). Build it only from `research_notes.md`.

**2.1 Follow the schema exactly.** Keys: `_meta`, `app`, `glossary`, `roles`, `modules[]`, `faqs[]`, `support_fallback`, `suggested_chips`. (A reference copy already exists — match its shape so the assistant and prototype keep working.)

**2.2 One `modules[]` entry per user-facing feature.** Each needs: `id`, `label`, `summary`, `where`, `how_to[]` (short imperative steps from the real UI), `rules[]`, and `faq_refs[]` where relevant. Use real screen and button names.

**2.3 Write `faqs[]` from how users actually phrase things** — short question + short answer. Cover the confusing moments (why a popup appeared, why nothing happened after submitting, why a field is mandatory).

**2.4 Keep a parallel `source_map.json`** (not sent to the model — for maintainers): `module_id -> [source files]`. This lets you re-verify a module when that code changes.

**2.5 Quality bar:**
- Every step maps to a real UI element. If Phase 1 didn't confirm it, leave it out and flag it.
- `how_to` steps: max ~6, one short line each, plain language.
- Answers must be spoken-friendly (this feeds a voice assistant): no jargon, no markdown, no internal IDs.
- Set `support_fallback` so anything uncovered routes to admin/support rather than a guess.

**2.6 Verify before finishing:**
- Validate the JSON parses.
- Spot-check 5 random `how_to` flows against the live UI/code — do the steps and labels match?
- Scan for any feature you described that you cannot point to in `source_map.json` — delete or fix it.
- Confirm mandatory-field and approval rules match the actual validation conditions.

---

## PHASE 3 — GROW FROM USER QUERIES ("training" the file)

The knowledge file improves not by retraining a model but by **enriching this file from what users actually ask**. Set up this loop.

**3.1 Log the misses.** In the RadAI backend, when an answer uses the `support_fallback` (i.e. RadAI didn't know), log the question, timestamp, and screen to an `unanswered_queries` table/file.

**3.2 Periodic enrichment task** (run weekly, or as a command you give me):
1. Read the latest `unanswered_queries`.
2. Cluster similar questions; for each cluster, find the relevant feature in the code (Phase 1 method).
3. If the feature exists but wasn't documented → add a `faqs[]` entry and/or extend the matching module's `how_to`. Cite the source in `source_map.json`.
4. If users keep asking for something that doesn't exist → flag it as a feature request for humans, do NOT fabricate an answer.
5. Update `suggested_chips` so the most-asked questions are one tap away.
6. Bump `_meta.version` and append a one-line changelog.

**3.3 Keep it in sync with the code.** When app features change, update the affected module AND its `source_map.json` entry in the same pull request. Treat the knowledge file like code: it ships with the feature.

**3.4 Optional automation.** Provide a script `enrich_knowledge.md` (a prompt) that I can run: it ingests `unanswered_queries`, proposes additions as a diff to `app_knowledge.json`, and waits for human approval before merging. Never auto-merge changes that assert a feature exists without a code citation.

---

## SCHEMA (match this shape)

```
{
  "_meta": { purpose, how_to_use, version, maintenance, language_note },
  "app": { name, type, one_line, primary_users[], design_principle },
  "glossary": [ { term, meaning } ],
  "roles": { role_key: { label, can[], cannot[] } },
  "modules": [ {
    id, label, summary, where,
    how_to[], fields{}, rules[], tips[], faq_refs[]
  } ],
  "faqs": [ { id, q, a } ],
  "support_fallback": { when, message, never },
  "suggested_chips": [ ... ]
}
```

(Fields like `fields`, `tips`, `faq_refs` are optional per module. A populated reference `app_knowledge.json` already exists in the repo — read it first and keep the same conventions.)

---

## HARD CONSTRAINTS (repeat to yourself)

1. No feature, button, or step that isn't in the code. When unsure → OPEN QUESTIONS / support fallback.
2. Use real on-screen labels and real field names, read from source.
3. Cite sources in `source_map.json` for everything.
4. Keep answers short, plain, and spoken-friendly.
5. Phases in order. Don't write the knowledge file before research is done and reviewed.
```
