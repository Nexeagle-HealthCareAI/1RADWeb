# enrich_knowledge.md — Grow the Knowledge File from Real User Questions

Run this prompt in your VS Code agent on a schedule (e.g. weekly) or whenever `unanswered_queries` has built up. It turns the questions RadAI couldn't answer into a **reviewable diff** for `app_knowledge.json`. It never edits the file silently.

Paste everything below the line into the agent.

---

## TASK

You are improving RadAI's knowledge file using the questions real users asked that RadAI could not answer. Produce a proposed diff to `app_knowledge.json` (plus matching `source_map.json` updates) for human review. Do not commit; output the diff and a summary.

## INPUTS

- `unanswered_queries` (file or DB export) — rows of `{ question, lang, screen, timestamp, count }`. These are questions where RadAI used the support fallback or scored low confidence.
- `app_knowledge.json` — current knowledge base. Read it fully first.
- `source_map.json` — current citations.
- The codebase — the source of truth for any new content.

## STEPS

**1. Load & clean.** Read `unanswered_queries`. Drop noise (gibberish, test entries, off-topic/non-app questions). Keep how-to questions about 1rad.

**2. Cluster.** Group questions that mean the same thing (different wording, Hindi/English, typos). For each cluster, write one canonical question and note how many times it was asked (priority = frequency).

**3. Classify each cluster into exactly one bucket:**
- **A — Covered but missed:** the feature IS documented, but RadAI didn't connect the question to it. Fix by adding an `faqs[]` entry phrased the user's way, and/or improving the module `summary`/keywords. (Most common; cheapest win.)
- **B — Real but undocumented:** the feature EXISTS in the code but isn't in the knowledge file. Verify in source (find the screen, steps, rules, roles — cite file+lines), then add a `modules[]` entry and/or `faqs[]` with a `source_map.json` citation.
- **C — Does not exist:** users want something the app doesn't do. Do NOT fabricate an answer. Add it to a `feature_requests.md` list for the product owner. RadAI should keep using the support fallback for these.
- **D — Not a how-to:** bug reports, account issues, billing disputes. Route to support; no knowledge change. Optionally note for the support team.

**4. Draft changes (buckets A and B only).**
- New `faqs[]`: short `q` in the user's natural phrasing, short spoken-friendly `a`. Give each a unique `id`.
- New/edited `modules[]`: real labels and steps from code, max ~6 steps.
- For every B addition, add the citation to `source_map.json`. **No citation → do not add it; move it to C/feature_requests instead.**
- Update `suggested_chips` to surface the highest-frequency questions.
- Keep answers consistent with existing style (plain, no markdown, no IDs).

**5. Verify (self-check before output):**
- JSON still parses.
- Every new entry has a source-map citation (for B) or maps to existing documented behavior (for A).
- No invented feature slipped in. If you can't cite it, it's bucket C.
- No duplicate FAQ ids; no PHI/secrets.
- Bump `_meta.version`; append a one-line changelog noting what was added and from which week's queries.

## OUTPUT (do not auto-commit)

Produce, in this order:

1. **Summary table**: each cluster → canonical question → bucket (A/B/C/D) → frequency → action taken.
2. **The diff** for `app_knowledge.json` and `source_map.json` (unified diff or clear before/after blocks), ready for a human to approve and merge.
3. **`feature_requests.md` additions** (bucket C) and **support notes** (bucket D), if any.
4. **Open questions**: anything you couldn't verify in code and need a human to confirm.

Then stop. A human reviews and merges. Never assert a feature exists without a code citation.

## GUARDRAILS

- Bucket B requires a code citation. Always.
- Prefer the smallest change that answers the cluster (often just one FAQ).
- Don't restructure the file or rename ids; only add/refine.
- Keep it spoken-friendly — these answers are read aloud in Hindi or English.

---

## Optional: make it a one-liner

Add a script or task alias so you can just run "enrich" each week:

```
# pseudo-task: export queries, then run this prompt against the repo
1. export unanswered_queries (last 7 days, count >= 2) -> unanswered_queries.json
2. run agent with enrich_knowledge.md
3. review the printed diff, approve, merge
```
