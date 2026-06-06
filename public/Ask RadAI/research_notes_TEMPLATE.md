# research_notes.md — Application Function Map (TEMPLATE)

> The agent fills this in during Phase 1, BEFORE building the knowledge file.
> Every feature must cite the source file(s) and line ranges it was derived from.
> Copy a "Feature" block per user-facing feature. Put anything uncertain under OPEN QUESTIONS.

## Stack & layout (fill once)

- Frontend framework / folder: ____
- Screen/route definitions: ____
- Backend framework / folder: ____
- Services / business rules: ____
- DB models / migrations: ____
- Roles / auth: ____
- RadAI backend (ask + miss log): ____

---

## Feature: <name>

- **Module id (for knowledge file):** <snake_case_id>
- **Screen / route:** <file> (component/button, ~line)
- **Menu path user clicks:** <e.g. Appointment > New Appointment>
- **Steps (in real UI order, real labels):**
  1. ...
  2. ...
- **Fields:** <name — mandatory? default? — source line>
- **Rules / conditions:** <quote the validation or branch + source line> (e.g. "discount > assignedLimit triggers popup — BillingService.cs ~L140")
- **Roles:** <who can — auth guard + source line>
- **After-effects:** <status change, commission recalc, refund, badge — source line>
- **Common confusion / FAQ candidates:** <e.g. "why did popup appear">

> Repeat for every feature: booking, referred-by/self, billing+discount, approvals
> (payment edit, cancel-after-payment, referrer change, free test, concession),
> referral hub, admin board search, report formatter, RadAI itself.

---

## OPEN QUESTIONS (human to confirm — do NOT guess)

- ...

## Coverage checklist (tick when documented + cited)

- [ ] Booking (incl. mandatory referred-by, Self, slot caps)
- [ ] Referred-by typeahead / Self / add-new-doctor
- [ ] Billing + discount popup (assigned limit, reason)
- [ ] Discount > commission -> continue / add-to-centre
- [ ] Approvals queue (Finance > Approvals) + who approves
- [ ] Payment edit after payment
- [ ] Cancel after payment (refund + commission reversal)
- [ ] Change referred-by (before/after payment)
- [ ] Free test
- [ ] Concession (post-payment discount)
- [ ] Referral hub
- [ ] Admin board search (doctor / test / modality)
- [ ] Report formatter
- [ ] RadAI assistant
