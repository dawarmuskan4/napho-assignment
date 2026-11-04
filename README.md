# Reimbursement Management System

Employees submit expense claims. Approvers approve (in full or in part) or reject them, then mark them paid. Every change is recorded in a history.

Flow: **create claim → submit → review → approve (full or partial) / reject → pay → view outcome**

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Pydantic v2, SQLite, pytest
- **Frontend:** Next.js (App Router, TypeScript, Tailwind), plain `fetch`, no state library

Design diagrams: `reimbursement-system-design.drawio` (open at app.diagrams.net). The build plan is in `PLAN.md`.

## Run it

You need Python 3.12 and Node 20+.

**Backend** (http://localhost:8000, API docs at http://localhost:8000/docs)

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m app.seed                  # creates the DB and 4 users (safe to re-run)
uvicorn app.main:app --reload
```

**Frontend** (http://localhost:3000)

```bash
cd frontend
npm install
npm run dev
```

The frontend calls `http://localhost:8000`. To use another address, set `NEXT_PUBLIC_API_URL`. The backend only allows CORS from `http://localhost:3000`.

**Tests**

```bash
cd backend
source venv/bin/activate
pytest
```

Each test gets its own temporary SQLite file. 50 tests cover the state machine, the full API, authorization, validation and parallel requests.

## Demo users

There is no login. Use the **Acting as** switcher in the header.

| User | Role |
|---|---|
| Asha, Rohan | employee |
| Meera, Vikram | approver |

Two approvers make the concurrency case easy to try: open the same claim in two tabs, one as each approver, and act in both. Each tab remembers its own user.

Try this: log in as Asha, create a claim, submit it. Switch to Meera, approve part of it (a comment is required), then "Mark paid". Switch back to Asha to see the outcome and history. Then try reject, edit and resubmit.

## Rules

**Who can do what**

- Employee (owner): create, edit (DRAFT or REJECTED), delete (a draft that was never submitted), submit.
- Approver: approve, reject, pay. An approver can never act on their own claim.
- Employees see only their own claims. Approvers see all claims except drafts.

**Claim lifecycle**

```
DRAFT --submit--> SUBMITTED --approve--> APPROVED --pay--> PAID
                      |
                      +--reject--> REJECTED --edit--> DRAFT
```

Editing a rejected claim moves it back to DRAFT (a `reopened` event is logged), then the owner submits again. Any move not in this table returns **409**.

**Validation**

- Title: 1 to 120 characters, required. Description: up to 1000 characters, optional.
- Category: travel, food, lodging, supplies, other.
- Expense date: required, not in the future.
- Amount: greater than 0, at most ₹10,00,000.
- Approval: `0 < approved amount ≤ claimed amount`. A comment is required when approving less than claimed.
- Reject: comment required.

**Errors**

| Code | Meaning |
|---|---|
| 401 | missing or unknown `X-User-Id` |
| 403 | wrong role, or an approver acting on their own claim |
| 404 | not found, also used for other employees' claims so IDs can't be probed |
| 409 | invalid transition, or the claim's status changed under you |
| 422 | validation error |

## API

All requests except `GET /users` need an `X-User-Id` header.

| Method | Path | Who | Body |
|---|---|---|---|
| GET | /users | anyone | |
| GET | /claims | both | `?status=` filter |
| POST | /claims | employee | title, category, description, expense_date, amount_paise |
| GET | /claims/{id} | owner or approver | returns the claim and its events |
| PATCH | /claims/{id} | owner | any of the fields above; REJECTED goes back to DRAFT |
| DELETE | /claims/{id} | owner | only a draft that was never submitted |
| POST | /claims/{id}/submit | owner | |
| POST | /claims/{id}/approve | approver | approved_amount_paise (optional, defaults to full), comment |
| POST | /claims/{id}/reject | approver | comment (required) |
| POST | /claims/{id}/pay | approver | |

## Data model

- **users:** `id`, `name`, `role` (employee or approver)
- **claims:** `id`, `employee_id`, `title`, `category`, `description`, `expense_date`, `amount_paise`, `approved_amount_paise` (null until approved), `status`, `created_at`, `updated_at`
- **claim_events** (history, only ever inserted): `id`, `claim_id`, `actor_id`, `action` (created, updated, submitted, approved, rejected, reopened, paid), `from_status`, `to_status`, `amount_paise` and `approved_amount_paise` (snapshots), `comment`, `created_at`

Money is always **integer paise** in the database and the API. The frontend converts to and from rupees.

## Code layout

```
backend/app/
  main.py            app, CORS, error handlers
  db.py, models.py   engine, tables
  state_machine.py   TRANSITIONS lookup table
  services.py        business rules; every write goes through one function
  schemas.py         request/response validation
  auth.py            mock auth (X-User-Id)
  routers/claims.py  HTTP layer only
  seed.py            the 4 demo users
frontend/
  lib/api.ts         fetch wrapper, money helpers
  lib/user.tsx       acting-user switcher
  components/        claim form, claim page, table, badges
  app/               pages: list, new, claim detail, edit
```

## Design decisions

| Decision | Instead of | Why |
|---|---|---|
| State machine as a lookup table | if/else in each endpoint | One place lists every legal move, and invalid moves are rejected the same way everywhere. |
| Conditional `UPDATE ... WHERE id = ? AND status = ?` | row locks, or nothing | SQLite has no `SELECT FOR UPDATE`. The update is atomic, so double clicks, stale pages and two approvers at once all hit one rule: one wins, the rest get 409. The event row is written in the same transaction. |
| Integer paise | float rupees | Floats can't hold money exactly. |
| `claims` plus `claim_events` | an events log only | Current state is a cheap read, and the history is still complete. |
| Partial approval as `approved_amount_paise` | a PARTIALLY_APPROVED status | It is still approved, only the amount differs. This keeps the state machine small. |
| Editing a rejected claim goes back to DRAFT | editing it in place | One editable state and one submit path. The rejection stays in the history. |
| Delete only never-submitted drafts | delete any draft | A reopened claim has review history, and deleting it would erase it. |
| 404 for other employees' claims | 403 | Doesn't reveal which IDs exist. |
| Mock auth via `X-User-Id` | real login | Role and ownership checks are still real and tested. |
| Acting user kept in memory per tab | read from `localStorage` on each request | Two tabs can act as two people. `localStorage` only remembers the last choice for new tabs. |

## Assumptions

- Single currency (INR), one amount per claim.
- "Pay" only records that payment was made. No money moves.
- Any approver except the claim's owner can approve and pay. The same approver can do both.
- Approvers only see claims once they are submitted. They can't create claims.
- When an approver acts on a draft by ID, they get 409 (invalid move), not 404.

## Known limitations

- **Mock auth:** anyone can send any `X-User-Id`. Real auth (JWT or sessions) would replace `auth.py` only.
- **Two edits to the same draft** in two tabs: the last save wins. The status doesn't change on an edit, so nothing detects it.
- **Duplicate creates:** the UI blocks double clicks, but an API client retrying `POST /claims` creates two drafts. An idempotency key would fix this.
- **Edit history is coarse:** an `updated` event doesn't say which field changed.
- **An empty `PATCH {}`** succeeds, logs an `updated` event, and moves a REJECTED claim back to DRAFT with nothing changed.
- **No separation of duties:** the approver who approved a claim can also pay it.
- **Deleting a never-submitted draft** also deletes its `created` and `updated` events. It is the only case where history rows are removed.
- No receipt upload and no line items.
- A claim can't be re-reviewed once approved.
- SQLite is fine for this size, not for many concurrent writers.
- Frontend behavior was checked by hand in a browser. There are no frontend tests.

## AI usage

I wrote the plan (`PLAN.md`) and the design diagrams. I used **Claude Code** to build the project one phase at a time (scaffold, data model, API, frontend, edge-case pass). I reviewed and committed each phase myself. Claude Code also wrote and ran the tests, and drove the browser to check the frontend flows.

Bugs found by the edge-case pass, such as two tabs sharing one user and a same-tick double click, are described in the phase 4 commit.
