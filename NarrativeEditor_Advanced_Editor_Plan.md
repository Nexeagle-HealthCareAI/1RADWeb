# Making the Narrative Editor a Best-in-Class Radiology Report Editor

_Generated: 2026-06-14 · Scope: the Reporting page's `NarrativeEditor` (Tiptap/ProseMirror, React) in `1Rad/easyrad/src/components/NarrativeEditor`. Combines a deep read of the current implementation with research into the best available techniques. Goal: rock-solid basic tools + shortcuts, a real medical spell-checker (red squiggles), genuine grammar correction, a powerful autosuggestion system — all scalable, smooth, and usable by non-technical staff._

---

## 0. Verdict up front

You are **not** starting from scratch. This is already a remarkably complete, MS-Word-class editor: a Ribbon UI, 40+ Tiptap extensions, tables/images/lists/find-replace/track-changes/comments/format-painter, pagination, voice dictation, RADS templates, PowerScribe-style `[field]`/`___` tab-jumping, electronic sign-off, DOCX/PDF export, and an anti-Clippy onboarding system. The bones are excellent.

The gap to "best-in-class" is **not breadth — it's depth and engineering of four things**:
1. **Spell-check** uses a *fragment* dictionary (RadLex labels chopped into words), not a real lexicon → both false positives on valid terms and silent acceptance of typos.
2. **Grammar-check** ships report text (PHI) to the **public LanguageTool API** and isn't medical-aware.
3. **Autocomplete** is prefix-only, has two engines that can disagree, and ignores the backend ranking endpoints that already exist.
4. **Performance** rests on per-keystroke full-document scans on the main thread, a brittle 560-line shortcut handler, and a legacy pagination engine that causes jank.

Fix those four and you leapfrog most in-house radiology editors and approach PowerScribe One territory. The rest of this doc is the how.

---

## 1. Current architecture (what's there)

- **Framework:** Tiptap 2 / ProseMirror, React. Extensions registered in `index.jsx:1110-1197`.
- **UI:** Word-style Ribbon (`Ribbon/`) with Home/Insert/Layout/Review/View tabs + always-on Quick-Access toolbar; floating selection toolbar; mobile toolbar; slash menu; status bar.
- **Editing mode:** defaults to **`continuous`** (no pagination plugin while typing — the *correct* fast path); `paged` and `pageview` modes are opt-in via localStorage.
- **Language features today:**
  - Spell-check: live, client-only, 400 ms-debounced, decorations (`SpellCheck.js`, `spellDictionary.js`).
  - Grammar: button-triggered, **public `api.languagetool.org`** (`index.jsx:984-1042`).
  - Auto-correct: ~150-entry static map on Space/Enter (`AutoCorrect.js`, `autoCorrectMap.js`).
  - Autocomplete: inline ghost text (`MedicalAutocomplete.js`) + dropdown (`TermAutocomplete.jsx`), both off a 68k RadLex index; slash-menu snippets.
  - Backend term services exist (`ReportingController.cs`: `terms/suggest`, `terms/check`, `terms/frequency`) but only `terms/check` is actually used by the UI.

---

## 2. Deep analysis & recommended solution, by capability

### A. Spell-check with red squiggles — make it medical-grade

**What's wrong now**
- The "medical dictionary" is every ≥3-char fragment split out of RadLex labels (`radiologyData.js:127-134`) — so inflections (`effusions`), drugs, eponyms, and abbreviations are missing (false positives), while junk fragments whitelist real typos.
- Over-broad whitelisting silently accepts errors: any apostrophe word, any digit-glued token, short ALL-CAPS, loose hyphen-compounds (`spellDictionary.js:79-115`).
- Suggestions use first/second-letter buckets + distance/length only — **no frequency, phonetic, or keyboard-adjacency weighting** (`spellDictionary.js:203-217`), so the offered fix is often wrong.
- Whole-document re-scan on the **main thread** every 400 ms, no dirty-range scoping, no web worker (`SpellCheck.js:132`) → degrades on long reports (Chrome lags ~1k+ words with naive decoration scanning per ProseMirror community reports).
- No real-word error detection (their/there, lever/liver).

**Recommended solution**
1. **Adopt a real Hunspell engine + curated medical lexicon.** Use **nspell** (MIT, Hunspell-compatible) or **Typo.js** with standard `en_US`/`en_GB` Hunspell dictionaries, layered with a **curated radiology lexicon**: RadLex terms (RSNA, ~75k), an inflected medical wordlist, a drug list (e.g. RxNorm/INN names), common eponyms, and clinical abbreviations. This replaces the fragment hack and kills the bulk of false positives.
2. **Run it in a Web Worker.** nspell/Typo.js/`espells` all run in a worker — move spell+suggest off the main thread so typing never blocks. Post changed ranges in, get decoration ranges back.
3. **Scan only dirty ranges.** Instead of walking the whole doc each debounce, track changed paragraphs from the transaction (`tr.mapping`) and re-check only those; keep a per-block cache. This is the single biggest scalability win.
4. **Better suggestions:** rank by edit distance **+ corpus frequency + keyboard adjacency + (optional) Double-Metaphone phonetic** match. nspell gives candidates; re-rank with your RadLex frequency table.
5. **Tighten whitelisting:** check apostrophe stems, validate each hyphen part, stop auto-accepting digit-glued/short-caps tokens unless they match a known pattern (measurements, modality codes).
6. **Keyboard-first UX:** add "next/previous misspelling" (F7 / Shift+F7), "apply top suggestion" hotkey, and arrow-key navigation inside the suggestion popup (currently mouse/tap only).
7. **House-style toggle:** one setting for en-GB vs en-US, honored by *both* spell and auto-correct (today spell is GB-lenient while auto-correct forces US — inconsistent).

### B. Grammar correction — get it off the public internet and make it medical-aware

**What's wrong now**
- Full report text → **public `api.languagetool.org`** (`index.jsx:1012`), guarded only by a one-time `window.confirm`. **PHI/compliance risk.** General en-US engine flags telegraphic report style ("No acute abnormality."), eponyms, and measurements → high false positives. Button-triggered, not live.

**Recommended solution (pick one or combine)**
1. **Self-host LanguageTool (Docker)** inside your infra. Same API, zero data leaves your network — directly removes the PHI risk. Add an **n-gram dataset** for context-aware corrections and a **medical rule profile** that disables the rules that fight report style (sentence-fragment, capitalization-after-period for itemized findings, unit spacing you intentionally enforce). Proxy it through your backend so the SPA never calls it directly.
2. **Make it live + inline** (debounced, dirty-range) like spell-check, with the same squiggle/popup pattern, instead of a separate button.
3. **LLM-assisted polish for the Impression** via your existing `reporting/ai-assist` / `format` endpoints (already wired) — "tighten/clean up" on demand, kept separate from deterministic grammar so it never silently rewrites findings.
4. **In-workflow clinical QC** (this is what PowerScribe's "Smart Assist / Quality Check" does and what makes it feel premium): detect **laterality mismatches** (left/right), **sex mismatches** (prostate in a female header), unfilled `[fields]`, and contradictions, surfaced as warnings before sign-off. This is high-value and uniquely clinical — more impactful than generic grammar.

### C. Auto-correct — bigger, smarter, unified

**What's wrong now**
- ~150 static entries with several no-op/junk rows and punctuation-suffixed keys that rarely fire (`autoCorrectMap.js`); multi-word fixes (`lymphnode→lymph node`) can't fire through the single-word path (`AutoCorrect.js:143`); forces British→American, conflicting with the spell side; no learning.

**Recommended solution**
1. **Unify with the spell engine:** when a just-typed word is misspelled and the top suggestion has very high confidence (distance 1 + high frequency), auto-apply it — so auto-correct inherits the full dictionary instead of a 150-row table.
2. **Support multi-word corrections** (scan the last 1-3 tokens).
3. **Personal learning:** record the user's accepted corrections and frequent typos (per-user, synced) and prioritize them — radiologists repeat the same 20 typos.
4. **Clean the map** (remove identity mappings) and make en-GB/US a setting, not hard-coded.
5. Keep the good parts: typography rules, measurement house-style (`2.3x1.8cm → 2.3 × 1.8 cm`), single-undo-step per correction.

### D. Autocomplete / suggestions — the headline differentiator

**What's wrong now**
- Two engines (ghost-text whole-label-prefix vs dropdown any-word-prefix) that can disagree; **prefix-only** (typing "effsion" suggests nothing); no phrase/sentence completion; no section awareness (Findings vs Impression); the backend `terms/suggest` + clinic-frequency ranking are **dead client-side** (`TermAutocomplete.jsx:95-97` uses local search despite its own docs); snippets are device-local only.

**Recommended solution**
1. **One suggestion service, fuzzy + ranked.** Build a single provider on **Tiptap's Suggestion utility** (`minQueryLength`, built-in debounce) backed by **Fuse.js** (or FuzzySearch) for typo-tolerant matching, so "effsion" still finds "effusion". Reconcile ghost-text and dropdown to the same ranked result.
2. **Wire the backend ranking** (`terms/suggest` + `terms/frequency`) so the most-used terms *in your clinic* float to the top, with personal recency boosting. This already exists server-side — just consume it.
3. **Phrase & sentence completion**, not just terms: complete common impression sentences and finding stems (this is where PowerScribe "AutoText/Smart Impression" shines). Seed from your own historical reports (you already mine n-grams in `terms/frequency`).
4. **Abbreviation/expansion map:** "ggo" → "ground-glass opacity", "ap" → "anteroposterior", with a one-key accept.
5. **Section-aware suggestions:** bias toward technique terms in Technique, pathology in Findings, recommendations in Impression.
6. **Clinic-shared snippets/macros** (move snippet storage from localStorage to the backend so a group shares macros) and RADS/RadReport templates (RSNA RadReport library) as first-class inserts.

### E. Basic tools & keyboard shortcuts — make them bulletproof

**What's wrong now**
- Shortcuts live in a **560-line document-level capture-phase handler** that `stopImmediatePropagation()`s to shadow Tiptap's own keymaps (`index.jsx:1487-2050,1798`) — brittle, hard to test, cross-browser-risky. Documented-but-unimplemented: **PgUp/PgDn page scroll** (`ShortcutsDialog.jsx:91`); **zoom-in has no key** (Ctrl+= conflict). `EditorToolbar.jsx` is imported but never rendered (dead code). Links: no edit/remove/open bubble. Images: upload-only (no drag-drop/paste/alt-text). Raw `window.prompt`/`window.confirm` dialogs sit beside the polished `PromptDialog`.

**Recommended solution**
1. **Migrate shortcuts to Tiptap `addKeyboardShortcuts` per extension** (let the editor own its keymap); keep only truly global app keys (save/print/voice) at the document level. Removes the shadowing hack and the whole class of ordering bugs.
2. **Close the documented gaps:** implement PgUp/PgDn paging, give zoom-in a real binding, and make the F1 cheat-sheet match reality (a cheat-sheet with dead entries erodes trust).
3. **Link UX:** a bubble menu on links with Edit / Remove / Open; **Image UX:** drag-drop + paste-image handlers, alt-text, alignment/wrap.
4. **Consistent dialogs:** replace every `window.prompt`/`confirm` with the in-app `PromptDialog`.
5. **Delete `EditorToolbar.jsx`** (dead) to cut maintenance risk.

### F. Scalability & smoothness — one scheduler, one worker, retire the jank engine

**What's wrong now**
- **Legacy `paged` Pagination.js** mutates the document and does `getClientRects` binary-search measurement per oversized block (`Pagination.js:79-126,248-503`) — its own comments admit typing jank and undo flicker.
- **6-7 separate `editor.on('update')` subscribers** (spell, footnotes, track-changes count, edit-log, autosave, page recount, observer) each set timers and several do **full `doc.descendants` walks** per pause (`index.jsx:1291-2359`).
- `bumpSelectionTick()` forces the **entire Ribbon** to re-render on every keystroke-pause and selection move; footnote/signature panels recompute via `doc.descendants` IIFEs in render (`index.jsx:1215,2796-2813`).

**Recommended solution**
1. **Retire `paged` Pagination.js** (keep continuous + decoration-only pageview). Don't maintain a DOM-mutating paginator.
2. **One update scheduler:** consolidate the 6-7 listeners into a single debounced dispatcher that does **one** doc walk and fans results to consumers (spell ranges, footnotes, counts). Move spell/grammar/term-check into the **Web Worker** with dirty-range input.
3. **Stop re-rendering the whole Ribbon per keystroke:** memoize ribbon controls, drive active-state from a lightweight selector, and decouple `selectionTick` from `onUpdate`.
4. Target: smooth typing in 20+ page reports with squiggles + autocomplete live.

### G. Ease of use for non-technical staff

**What's good:** Ribbon + Quick-Access toolbar, "what style am I in" indicator, anti-Clippy onboarding, slash menu, status bar, mobile toolbar, `[field]` tab-jumping, autosave pill, sign-off locking.

**Fix for non-technical users**
- **Surface hidden settings in the UI** (editing mode / pageless vs paged, spellcheck on/off) — today they're localStorage/DevTools only.
- **Spell-check ON by default** (currently off; a non-technical user won't find the toggle).
- **Confirm before destructive template "Replace"** (it replaces the whole document).
- **Voice/ambient** dictation prominence (you already have `useVoiceDictation`); add "next field / scratch that" voice parity everywhere.
- Keep dialogs consistent and styled (no native prompts).

---

## 3. Target architecture — a "Language Services" layer

```
                 ┌─────────────────────────────────────────────┐
   Editor ──────▶│  Update Scheduler (1 debounced dispatcher)   │
 (Tiptap/PM)     │  - computes dirty ranges from tr.mapping     │
                 └───────────────┬─────────────────────────────┘
                                 │ changed ranges + text
                 ┌───────────────▼───────────────┐
                 │   Web Worker: Language Engine  │
                 │   • spell (nspell + med lexicon)│
                 │   • suggest (Fuse.js ranked)    │
                 │   • abbreviation expand         │
                 └───────────────┬───────────────┘
        decoration ranges ◀──────┘   (spell squiggles, autocomplete items)
                                 │
                 ┌───────────────▼───────────────┐     proxy (no PHI to public)
                 │  Backend /reporting/*          │────▶ self-hosted LanguageTool
                 │  terms/suggest, terms/frequency│      (Docker, medical profile)
                 │  ai-assist, format (LLM polish)│
                 └────────────────────────────────┘
```

Principles: deterministic checks (spell/grammar/abbrev) in the worker + self-hosted service; probabilistic help (impression drafting, cleanup) via the LLM endpoints you already have; all PHI stays inside your network.

---

## 4. Phased roadmap

**Phase 1 — Foundations & quick wins (low risk, high trust)**
- Self-host LanguageTool; proxy grammar through backend; remove the public API call (kills the PHI risk). [security + correctness]
- Spell-check ON by default; add "next error / apply top fix" hotkeys + arrow-nav in popup.
- Clean `autoCorrectMap` (remove no-ops); make en-GB/US a single setting honored by spell + auto-correct.
- Delete dead `EditorToolbar.jsx`; replace `window.prompt`/`confirm` with `PromptDialog`.
- Implement the two documented-but-missing shortcuts (PgUp/PgDn, zoom-in) and reconcile the cheat-sheet.

**Phase 2 — Real language engine (the core upgrade)**
- Introduce the **Web Worker language service**; move spell + suggest there.
- Replace the fragment dictionary with **nspell + Hunspell en + curated medical lexicon** (RadLex + inflections + drugs + eponyms + abbreviations).
- **Dirty-range scanning** + per-block cache (kills the whole-doc rescan).
- Better suggestion ranking (distance + frequency + phonetic + keyboard).

**Phase 3 — Intelligence & differentiation**
- Unify autocomplete on Tiptap Suggestion + Fuse.js (fuzzy, ranked); wire backend `terms/suggest`/`terms/frequency`; add personal recency learning.
- Phrase/sentence + impression completion; abbreviation expansion; section-aware suggestions.
- In-workflow clinical QC (laterality/sex mismatch, unfilled fields, contradictions) before sign-off.
- LLM "tidy impression" via existing ai-assist.

**Phase 4 — Smoothness & polish at scale**
- Retire legacy `paged` Pagination; consolidate the update subscribers into one scheduler; stop full-Ribbon re-renders.
- Migrate shortcuts to per-extension Tiptap keymaps.
- Link bubble + image drag/drop/paste/alt; clinic-shared snippets/macros; surface editing-mode setting in UI.

---

## 5. Benchmark — what "best-in-class" looks like (PowerScribe One)

PowerScribe One (≈80% of US radiologists) sets the bar with: **Smart Impression** (generative AI drafts the Impression in the radiologist's own style), **Ambient mode** (free-form dictation → structured report), **AutoText macros** with voice triggers, **auto-loaded templates per exam**, and **in-workflow Quality Check** (laterality/sex mismatch, actionable findings). You already have the scaffolding for most of these (templates, fields, voice, ai-assist). The roadmap above gets you to feature parity on the parts that matter for accuracy and speed, while keeping data on-prem.

---

## 6. Key decisions / risks to confirm

- **Grammar engine:** self-hosted LanguageTool (deterministic, on-prem, needs a server) vs LLM-only grammar (you already have ai-assist, but less deterministic for live squiggles). Recommendation: **both** — LanguageTool for live grammar, LLM for impression polish.
- **Dictionary licensing:** RadLex is free from RSNA; confirm license terms for any drug list (RxNorm is public; commercial med-spell lists are not). 
- **Worker bundle size:** Hunspell en dictionaries are ~1-2 MB; lazy-load the worker so first paint isn't affected.
- **Effort:** Phase 1 is days; Phase 2 the real engine is the biggest lift (a few weeks); Phases 3-4 incremental.

I can start on any phase — the highest-leverage first steps are **(1) kill the public grammar API by self-hosting LanguageTool**, and **(2) stand up the Web Worker spell service with a real medical dictionary + dirty-range scanning**. Tell me which to begin and I'll implement it.

---

### Sources
- [Performance tips for ProseMirror decorations](https://discuss.prosemirror.net/t/any-tips-for-caching-improving-performance-of-decorations/8044) · [Tiptap/Chrome perf with large docs](https://github.com/ueberdosis/tiptap/issues/1901) · [ProseMirror spellchecker-via-API plugin](https://discuss.prosemirror.net/t/spellchecker-plugin-that-use-a-web-api/4342)
- [nspell (Hunspell-compatible, MIT)](https://github.com/wooorm/nspell) · [Typo.js](https://github.com/cfinke/typo.js/) · [espells (runs in web worker)](https://github.com/Monkatraz/espells)
- [Self-hosted LanguageTool (Docker)](https://dev.to/gardner/self-hosted-languagetool-private-instance-is-an-offline-alternative-to-grammarly-56nh) · [LanguageTool Docker image](https://github.com/loglux/languagetool-docker)
- [RadLex radiology lexicon (RSNA)](https://www.rsna.org/practice-tools/data-tools-and-standards/radlex-radiology-lexicon) · [RadReport templates (RSNA)](https://www.rsna.org/practice-tools/data-tools-and-standards/radreport-reporting-templates)
- [Tiptap Suggestion utility (minQueryLength, debounce)](https://tiptap.dev/docs/editor/api/utilities/suggestion) · [Fuse.js fuzzy search](https://www.fusejs.io/)
- [PowerScribe One Smart Impression](https://support.microsoft.com/en-us/powerscribe-one/smart-impression) · [Nuance ambient AI for PowerScribe](https://www.itnonline.com/content/nuance-communications-introduces-next-generation-ambient-ai-capabilities-powerscribe)
