# Reimbursement Management System: Build Plan

Napho take-home. Deadline: tonight. Expected effort: 2–4 hours.

Flow to demonstrate: **Create claim → Submit → Review → Approve (full or partial) / Reject → Pay → View outcome**

## Rules for this build (Claude Code: follow these)

- Build **one phase at a time**. Stop at the end of each phase and wait for me to review and commit before starting the next.
- Keep it simple and readable. I must be able to explain and modify every line in the interview. No clever abstractions, no extra libraries beyond those listed.
- Every phase ends with its "Done when" check passing.
- Do not add features beyond this plan.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, SQLite, pytest + FastAPI TestClient
- **Frontend:** Next.js (App Router, TypeScript, Tailwind), plain `fetch`, no state library
- Separate folders: `backend/` and `frontend/`. The frontend only talks to the backend over HTTP.

```
reimbursement/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, router mount
│   │   ├── db.py              # engine, session, create tables
│   │   ├── models.py          # SQLAlchemy: User, Claim, ClaimEvent
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── state_machine.py   # TRANSITIONS lookup table
│   │   ├── services.py        # business rules + transitions
│   │   ├── auth.py            # mock auth: X-User-Id header
│   │   ├── seed.py            # seed users
│   │   └── routers/claims.py  # HTTP layer only
│   ├── tests/
│   └── requirements.txt
├── frontend/
├── PLAN.md
└── README.md
```

## Data model

**users:** `id`, `name`, `role` (`employee` | `approver`)
Seed: 2 employees (Asha, Rohan), 2 approvers (Meera, Vikram). Two approvers make the concurrency case demoable.

**claims:**
| Field | Type | Notes |
|---|---|---|
| id | int PK | |
| employee_id | FK users | owner |
| title | str | required, 1–120 chars |
| category | enum | travel, food, lodging, supplies, other |
| description | str | optional, ≤ 1000 chars |
| expense_date | date | required, not in the future |
| amount_paise | int | > 0, ≤ 10,00,000 rupees (100,000,000 paise) |
| approved_amount_paise | int, nullable | set on approval |
| status | enum | DRAFT, SUBMITTED, APPROVED, REJECTED, PAID |
| created_at, updated_at | datetime (UTC) | |

**claim_events** (append-only, never updated or deleted):
`id`, `claim_id`, `actor_id`, `action` (created, updated, submitted, approved, rejected, reopened, paid), `from_status`, `to_status`, `amount_paise` (snapshot), `approved_amount_paise`, `comment`, `created_at`

Money is always **integer paise** in the database and API. The frontend converts rupees ↔ paise.

## State machine

```python
TRANSITIONS = {
    ("DRAFT", "submit"): "SUBMITTED",
    ("SUBMITTED", "approve"): "APPROVED",
    ("SUBMITTED", "reject"): "REJECTED",
    ("REJECTED", "reopen"): "DRAFT",   # triggered by editing a rejected claim
    ("APPROVED", "pay"): "PAID",
}
```

Any pair not in this table → **409 Conflict**.

**Who can do what:**
- Owner (employee): create, edit (DRAFT or REJECTED), delete (DRAFT and never submitted), submit
- Approver: approve, reject, pay. An approver can never act on their own claim.
- Employees see only their own claims. Approvers see all non-draft claims.

**Concurrency and duplicates.** Every write is a conditional UPDATE that only succeeds if the status is still what the service just read:

```sql
UPDATE claims SET status = :new, updated_at = ...
WHERE id = :id AND status = :expected
```

If 0 rows are updated → 409 with a clear message. The event row is written in the same transaction. This one rule handles double clicks, stale tabs, and two approvers acting at once.

## API

All requests carry `X-User-Id`. Missing or unknown user → 401.

| Method | Path | Who | Body |
|---|---|---|---|
| GET | /users | anyone | (for the user switcher) |
| GET | /claims | both | `?status=` filter; employee gets own, approver gets non-draft |
| POST | /claims | employee | title, category, description, expense_date, amount_paise |
| GET | /claims/{id} | owner or approver | returns claim + events |
| PATCH | /claims/{id} | owner | fields; REJECTED → DRAFT with a `reopened` event |
| DELETE | /claims/{id} | owner | only DRAFT never submitted |
| POST | /claims/{id}/submit | owner | (none) |
| POST | /claims/{id}/approve | approver | approved_amount_paise (optional, defaults to full), comment |
| POST | /claims/{id}/reject | approver | comment (required) |
| POST | /claims/{id}/pay | approver | (none) |

**Errors:** 401 no user · 403 wrong role or not owner · 404 not found (also for other employees' claims, so they can't probe IDs) · 409 invalid transition or status already changed · 422 validation.

**Approval rules:** `0 < approved_amount_paise ≤ amount_paise`. If less than the full amount, a comment is required (the employee needs to know why).

---

## Phase 0: Scaffold (15 min)

- [ ] `git init`, folders, `.gitignore` (venv, node_modules, *.db, .next)
- [ ] Backend venv, `requirements.txt`, FastAPI app with `GET /health`
- [ ] `npx create-next-app frontend` (TypeScript, Tailwind, App Router)
- [ ] CORS allows `http://localhost:3000`

**Done when:** `uvicorn app.main:app --reload` returns `{"ok": true}` on `/health`, and the Next.js page loads.

## Phase 1: Data model + state machine (30 min)

- [ ] `models.py`, `db.py`, `seed.py` (idempotent: re-running doesn't duplicate users)
- [ ] `state_machine.py` with `TRANSITIONS` and `next_status(status, action)` that raises on invalid pairs
- [ ] Unit tests for every valid transition and a sample of invalid ones

**Done when:** `pytest tests/test_state_machine.py` passes, and the seed script creates 4 users.

## Phase 2: API + business rules (45 min)

- [ ] `auth.py`: dependency reading `X-User-Id`
- [ ] `schemas.py` with validation (amount, date, title, category, comment rules)
- [ ] `services.py`: one function per action, all using the conditional UPDATE + event insert in one transaction
- [ ] `routers/claims.py`: thin, calls services, maps exceptions to status codes
- [ ] API tests (temp SQLite per test):
  - full happy path: create → submit → approve → pay, history has 4 events
  - partial approval: ₹8,000 claimed, ₹6,500 approved, comment required
  - reject → edit (status back to DRAFT, `reopened` event) → resubmit → approve
  - invalid transitions: approve a draft, pay a rejected claim, edit a submitted claim → 409
  - duplicate submit → second one 409
  - two approvers on the same claim: approve and reject → exactly one succeeds
  - validation: negative amount, future date, approved > claimed, reject without comment → 422
  - authorization: employee can't approve, can't see another employee's claim, approver can't approve own claim

**Done when:** `pytest` is green and the full flow works in `/docs`.

## Phase 3: Frontend (60 min)

- [ ] `lib/api.ts`: one fetch wrapper adding `X-User-Id`, throwing readable errors
- [ ] User switcher in the header (selected user kept in localStorage)
- [ ] Employee: "My claims" list with status badges, create/edit form (rupees input → paise), claim detail with history timeline, submit/delete buttons only when allowed
- [ ] Approver: tabs "To review" (SUBMITTED) and "Reviewed" (APPROVED / REJECTED / PAID), review panel with approved amount (defaults to full), comment, approve/reject, and "Mark paid" on approved claims
- [ ] Partial approvals shown clearly: "Approved ₹6,500 of ₹8,000"
- [ ] Buttons disabled while a request is in flight; on 409, show the message and reload the claim

**Done when:** the whole flow works in the browser by switching users, including one partial approval and one reject → resubmit.

## Phase 4: Edge-case pass (20 min)

- [ ] Open the same claim as two approvers in two tabs, act in both, confirm the second gets a clear 409 message
- [ ] Double-click submit, confirm only one `submitted` event
- [ ] Fix anything found and add a test for it

## Phase 5: README + submit (20 min)

- [ ] Setup steps (backend and frontend), seed command, test command
- [ ] Data model and design decisions (copy the "Why" list below)
- [ ] Assumptions and known limitations
- [ ] AI usage disclosure: which tools, and how they were used
- [ ] Push to GitHub, check a fresh clone runs

## If running out of time, cut in this order

1. UI polish (keep it plain)
2. Phase 4 manual checks (the tests already cover the core)
3. Never cut: the API tests, partial approval, the README

---

## Design decisions (for the README and the interview)

| Decision | Instead of | Why |
|---|---|---|
| State machine as a lookup table | if/else in each endpoint | One place defines every legal move; invalid moves are rejected uniformly. |
| Conditional UPDATE on `status` | Row locks, or nothing | SQLite has no `SELECT FOR UPDATE`. A conditional UPDATE is atomic, and it covers double clicks, stale pages and concurrent approvers with one rule. |
| Integer paise | Float rupees | Floats can't represent money exactly. |
| `claims` + `claim_events` | Only an events log (event sourcing) | Current state is a cheap read; history is still complete. Event sourcing is overkill for this size. |
| Partial approval as `approved_amount_paise` | A separate PARTIALLY_APPROVED status | It's still approved; only the amount differs. Keeps the state machine small. |
| Edit a rejected claim → back to DRAFT | Editing in place while REJECTED | One editable state, one submit path. The rejection stays in the history. |
| Delete only never-submitted drafts | Delete any draft | A reopened claim has approver history; deleting it would erase an audit trail. |
| 404 for other users' claims | 403 | Doesn't reveal which claim IDs exist. |
| Mock auth via `X-User-Id` | Real login | The brief allows mocked users; the role checks are still real and tested. |

## Known limitations (be upfront)

- Mock auth: anyone can send any `X-User-Id`. Real auth (JWT/session) would replace `auth.py` only.
- No receipt upload, no line items (one amount per claim).
- Single currency (INR).
- A claim can't be re-reviewed once approved (no "reopen approved").
- Two edits to the same DRAFT in two tabs: last write wins (status doesn't change, so nothing is detected).
- SQLite: fine for this, not for many concurrent writers.
