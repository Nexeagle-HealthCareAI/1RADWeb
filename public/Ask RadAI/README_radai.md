# RadAI — In-App Help Assistant for 1rad

A floating assistant that answers "how do I…" questions about the 1rad app, by **voice, chip, or typing**, and speaks the answer back in **Hindi or English**. Voice uses the free browser Web Speech API.

## Files

| File | Role |
|---|---|
| `app_knowledge.json` | The brain. Everything RadAI is allowed to say: every module, workflow, rule, and FAQ of 1rad. **This is what stops Flash from making things up.** |
| `assistant_system_prompt.md` | Instructions for Flash: answer only from the knowledge file, match the user's language, keep answers short and spoken-friendly, fall back to support when unsure. |
| `radai_assistant.html` | Working floating-assistant prototype: voice in (SpeechRecognition), voice out (speechSynthesis), chips, typed input. Runs standalone. |

## Try it right now (no server)

1. Put `radai_assistant.html` and `app_knowledge.json` in the same folder.
2. Open the HTML in **Chrome or Edge** (Web Speech works best there; Firefox has limited support).
3. Click the blue button, tap the mic and speak, or tap a suggested question.

In this offline demo mode (`USE_BACKEND = false`), answers come from a simple keyword match over `app_knowledge.json` — enough to feel the UX. Hindi translation and smart phrasing come once you connect Flash.

## Connect Gemini Flash (production)

The browser must **not** hold your API key. Add a tiny backend endpoint and flip one flag.

1. In `radai_assistant.html`, set `USE_BACKEND = true` and point `BACKEND_URL` at your endpoint.
2. Build `POST /api/radai/ask` on your .NET/Azure backend. It should:
   - take `{ question, lang }`
   - call Gemini Flash with: system instruction = `assistant_system_prompt.md`, context = `app_knowledge.json`, user message = the question
   - set `responseMimeType = application/json` so Flash returns `{ answer, reply_language, suggested_followups }`
   - return that JSON to the browser
3. **Cache the prefix.** `assistant_system_prompt.md` + `app_knowledge.json` are identical on every call — use Gemini context caching so each question is cheap and fast.

You already have the Gemini wiring from the radiology formatter — this is the same call with a different system prompt and knowledge file.

## How the language flow works

- The mic recognizes in the selected language (`hi-IN` or `en-IN`); the EN/हिं toggle in the header sets it.
- Flash detects the question's language and replies in the same one, returning `reply_language`.
- The app picks the matching voice (`hi-IN` / `en-IN`) for `speechSynthesis`.
- Note: browser Hindi TTS quality varies by OS. If it sounds robotic, that's the free engine — switching the TTS step to **Azure Neural TTS** (`hi-IN` Swara/Madhur) later gives natural Hindi. The rest of the code stays the same.

## Growing the knowledge file (the important habit)

RadAI is exactly as good as `app_knowledge.json`.

- When a user asks something RadAI couldn't answer, **add an FAQ or module entry** for it.
- When the app changes (new button, renamed page), **update that module** so steps stay accurate.
- Keep `suggested_chips` aligned with the most common real questions.
- One short review pass per release keeps it trustworthy. A help assistant that confidently describes a button that doesn't exist is worse than none — that's why the prompt forces the support fallback when unsure.

## Guardrails already built in

- **Grounded only:** Flash answers from the knowledge file; otherwise it says "I'm not sure — contact admin/support."
- **Read-only:** RadAI explains, it never performs actions, approves anything, or touches patient data.
- **Spoken-friendly:** short answers, numbered steps, no jargon or markdown read aloud.
